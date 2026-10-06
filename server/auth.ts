/**
 * Admin credentials, staff accounts, permissions, sessions and login rate
 * limiting.
 *
 * The owner's password is stored as a scrypt hash under the `adminAuth` setting
 * — it is never written to config, never sent to the browser, and checked only
 * by `POST /api/auth/login`. The owner always holds every right and cannot be
 * removed.
 *
 * Additional staff accounts live in the `staff` table with their own scrypt
 * hash and a list of `Permission` values. Routes are guarded by
 * `requireAdmin` (valid session) followed by `requirePermission` (a specific
 * right), so a staff member reaches exactly what they were granted.
 *
 * Sessions are opaque random bearer tokens with a 7-day expiry kept in the
 * `sessions` table.
 *
 * Default owner credentials seed from `storeConfig.ts` on first run and can be
 * overridden with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables.
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, getSetting, setSetting } from './db';
import { DEFAULT_STORE_CONFIG } from '../storeConfig';
import { ALL_PERMISSIONS, PERMISSION_LABELS } from '../types';
import type { Permission, StaffMember, User } from '../types';

const ADMIN_AUTH_KEY = 'adminAuth';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

interface AdminAuth {
  email: string;
  salt: string;
  hash: string;
}

/** A staff row as stored: the scrypt pair plus the JSON permission list. */
interface StaffRow {
  email: string;
  salt: string;
  hash: string;
  permissions: string;
  created_at: number;
}

// ---- password hashing -----------------------------------------------------

export const hashPassword = (password: string): { salt: string; hash: string } => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
};

export const verifyPassword = (
  password: string,
  stored: { salt: string; hash: string },
): boolean => {
  try {
    const candidate = crypto.scryptSync(password, stored.salt, 64);
    const expected = Buffer.from(stored.hash, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
};

export const getAdminAuth = (): AdminAuth | null => getSetting<AdminAuth>(ADMIN_AUTH_KEY);

/** Applies provided credential changes; empty/undefined values are no-ops so
 *  the settings form can send the whole config without clobbering the
 *  password when its field was left blank. */
export const updateAdminCredentials = (patch: { email?: string; password?: string }): void => {
  const auth = getAdminAuth();
  if (!auth) return;
  const next: AdminAuth = { ...auth };
  if (patch.email && patch.email.trim()) next.email = patch.email.trim().toLowerCase();
  if (patch.password) Object.assign(next, hashPassword(patch.password));
  setSetting(ADMIN_AUTH_KEY, next);
};

// ---- sessions -------------------------------------------------------------

export const createSession = (email: string): string => {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, email, expires_at) VALUES (?, ?, ?)').run(
    token,
    email,
    Date.now() + SESSION_TTL_MS,
  );
  return token;
};

export const getSession = (token: string): { email: string } | null => {
  const row = db.prepare('SELECT email, expires_at FROM sessions WHERE token = ?').get(token) as
    | { email: string; expires_at: number }
    | undefined;
  if (!row || row.expires_at < Date.now()) return null;
  return { email: row.email };
};

export const destroySession = (token: string): void => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
};

/** Extracts a `Bearer <token>` value from the Authorization header, if any. */
export const tokenFrom = (req: Request): string | null => {
  const header = req.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
};

/** Express middleware guarding every admin route with a live session.
 *
 *  Sets `res.locals.adminEmail` plus the resolved `permissions` list, which
 *  `requirePermission` then checks. A session with no matching staff row (an
 *  account deleted while the token was still live) authenticates but holds no
 *  rights, so it can reach nothing. */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const token = tokenFrom(req);
  const session = token ? getSession(token) : null;
  if (!session) {
    res.status(401).json({ error: 'Admin session required. Please sign in again.' });
    return;
  }
  res.locals.adminEmail = session.email;
  res.locals.permissions = permissionsFor(session.email);
  next();
};

/** Express middleware factory: requires one specific right. Used on top of
 *  `requireAdmin`, so a signed-in user without the right gets a 403 explaining
 *  it rather than a confusing 401. The `req` parameter is required by
 *  Express's middleware signature even though the check reads only `res`. */
export const requirePermission =
  (permission: Permission) =>
  (_req: Request, res: Response, next: NextFunction): void => {
    const held = (res.locals.permissions as Permission[] | undefined) ?? [];
    if (!held.includes(permission)) {
      res.status(403).json({
        error: `Your account does not have the "${PERMISSION_LABELS[permission]}" right. Ask the store owner to grant it.`,
      });
      return;
    }
    next();
  };

// ---- staff accounts & permissions ----------------------------------------

/** Keeps only recognised rights, in catalogue order, with duplicates removed —
 *  so a hand-edited row or a stale build can never hand out a permission this
 *  server has no route for. */
const cleanPermissions = (value: unknown): Permission[] => {
  if (!Array.isArray(value)) return [];
  return ALL_PERMISSIONS.filter((p) => value.includes(p));
};

const readStaffRow = (email: string): StaffRow | null =>
  (db.prepare('SELECT * FROM staff WHERE email = ?').get(email) as StaffRow | undefined) ?? null;

/** Staff list for the admin panel — never includes the hash or salt. */
export const listStaff = (): StaffMember[] => {
  const rows = db.prepare('SELECT * FROM staff ORDER BY created_at ASC').all() as StaffRow[];
  return rows.map((row) => ({
    email: row.email,
    permissions: cleanPermissions(safeParse(row.permissions)),
    createdAt: row.created_at,
    hasPassword: typeof row.hash === 'string' && row.hash.length > 0,
  }));
};

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

/** The owner is whoever the `adminAuth` setting names. Their address can change
 *  from the settings form, so this is always read live rather than cached. */
export const isOwnerEmail = (email: string): boolean => {
  const auth = getAdminAuth();
  return auth !== null && auth.email.toLowerCase() === email.trim().toLowerCase();
};

/** Every right the given account holds. The owner implicitly holds all of them,
 *  which is what makes them impossible to lock out. */
export const permissionsFor = (email: string): Permission[] => {
  if (isOwnerEmail(email)) return [...ALL_PERMISSIONS];
  const row = readStaffRow(email.trim().toLowerCase());
  return row ? cleanPermissions(safeParse(row.permissions)) : [];
};

/** The public shape of the signed-in user. `grantablePermissions` is what the
 *  admin may hand out: an owner can grant everything, a staff member with
 *  `staff.manage` may only grant rights they hold themselves, so managing staff
 *  can never be used to escalate. */
export const userFor = (email: string): User => {
  const permissions = permissionsFor(email);
  const isOwner = isOwnerEmail(email);
  const held = new Set<Permission>(permissions);
  return {
    email,
    isAdmin: true,
    isOwner,
    permissions,
    grantablePermissions: isOwner
      ? [...ALL_PERMISSIONS]
      : ALL_PERMISSIONS.filter((p) => held.has(p) && p !== 'data.reset'),
  };
};

export const createStaff = (input: {
  email: string;
  password: string;
  permissions: Permission[];
}): StaffMember => {
  const email = input.email.trim().toLowerCase();
  if (readStaffRow(email)) throw new Error('A staff account with that email already exists.');
  const { salt, hash } = hashPassword(input.password);
  const permissions = cleanPermissions(input.permissions);
  db.prepare(
    'INSERT INTO staff (email, salt, hash, permissions, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(email, salt, hash, JSON.stringify(permissions), Date.now());
  return { email, permissions, createdAt: Date.now(), hasPassword: true };
};

/** Updates rights, and optionally the password. Blank/undefined means "leave
 *  the password alone", so the edit form can round-trip without a reset. */
export const updateStaff = (
  email: string,
  patch: { permissions?: Permission[]; password?: string },
): StaffMember | null => {
  const key = email.trim().toLowerCase();
  const row = readStaffRow(key);
  if (!row) return null;
  if (patch.permissions) {
    db.prepare('UPDATE staff SET permissions = ? WHERE email = ?').run(
      JSON.stringify(cleanPermissions(patch.permissions)),
      key,
    );
  }
  if (patch.password) {
    const { salt, hash } = hashPassword(patch.password);
    db.prepare('UPDATE staff SET salt = ?, hash = ? WHERE email = ?').run(salt, hash, key);
  }
  const updated = readStaffRow(key)!;
  return {
    email: updated.email,
    permissions: cleanPermissions(safeParse(updated.permissions)),
    createdAt: updated.created_at,
    hasPassword: typeof updated.hash === 'string' && updated.hash.length > 0,
  };
};

/** The scrypt pair for a staff account, or null when there is none. Used by the
 *  login route to check an address against the staff table exactly as it checks
 *  the owner's hash stored in settings. */
export const verifyStaffCredentials = (email: string): { salt: string; hash: string } | null => {
  const row = readStaffRow(email.trim().toLowerCase());
  return row ? { salt: row.salt, hash: row.hash } : null;
};

export const deleteStaff = (email: string): boolean => {
  const key = email.trim().toLowerCase();
  if (isOwnerEmail(key)) return false;
  const { changes } = db.prepare('DELETE FROM staff WHERE email = ?').run(key);
  if (changes > 0) destroySessionsFor(key);
  return changes > 0;
};

/** Signing someone out everywhere — used when their rights shrink or their
 *  account is removed, so a change takes effect immediately rather than when
 *  their current token happens to expire. */
export const destroySessionsFor = (email: string): void => {
  db.prepare('DELETE FROM sessions WHERE email = ?').run(email.trim().toLowerCase());
};

// ---- login rate limiting --------------------------------------------------

const failures = new Map<string, { count: number; resetAt: number }>();

export const loginBlockedFor = (key: string): boolean => {
  const entry = failures.get(key);
  if (!entry) return false;
  if (entry.resetAt < Date.now()) {
    failures.delete(key);
    return false;
  }
  return entry.count >= MAX_LOGIN_ATTEMPTS;
};

export const recordLoginFailure = (key: string): void => {
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || entry.resetAt < now) {
    failures.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
  } else {
    entry.count += 1;
  }
};

export const clearLoginFailures = (key: string): void => {
  failures.delete(key);
};

// ---- first-run credential seeding ----------------------------------------

if (getAdminAuth() === null) {
  const email = (process.env.ADMIN_EMAIL ?? DEFAULT_STORE_CONFIG.adminEmail).trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? DEFAULT_STORE_CONFIG.adminPassword;
  setSetting(ADMIN_AUTH_KEY, { email, ...hashPassword(password) });
  console.log(`[auth] Seeded admin account "${email}"${process.env.ADMIN_PASSWORD ? '' : ' (from storeConfig.ts — override with ADMIN_PASSWORD)'}.`);
}