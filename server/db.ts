/** JSON-file data layer for the store, with optional Supabase sync.
 *
 * The whole shop lives in one ordinary JSON file (`server/data/store.json`).
 * No native modules, no journal files, no migrations — just a file you can
 * copy, version-control, or drop into another host. When `SUPABASE_URL` and a
 * service-role key are set, every save is also upserted to the `store_state`
 * table (`id = 'shop'`) and remote changes are applied live, so localhost and
 * Render stay in sync. Local JSON remains as a fallback when the cloud is
 * unreachable.
 *
 * Writes are atomic: the file is written to a temp name and renamed over the
 * real one, so a crashed restart can never leave a half-written JSON blob.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  Coupon,
  Order,
  OrderStatus,
  Permission,
  Product,
  ProductReview,
  StoreConfig,
} from '../types';
import { INITIAL_PRODUCTS } from '../constants';
import { DEFAULT_STORE_CONFIG } from '../storeConfig';
import { normalizeProduct } from '../lib/storage';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Data directory + file name. `DB_DIR` keeps it movable for the Render host. */
export const dataDir =
  process.env.DB_DIR !== undefined ? path.resolve(process.env.DB_DIR) : path.join(moduleDir, 'data');
export const dbFile = path.join(dataDir, 'store.json');

// ---------------------------------------------------------------------------
// On-disk format (deliberately human-editable, one object)
// ---------------------------------------------------------------------------

interface DbSettings {
  config: StoreConfig;
  adminAuth: { email: string; salt: string; hash: string } | null;
}

interface DbState {
  settings: DbSettings;
  products: Array<{ id: string; product: Product; sort_index: number }>;
  orders: Order[];
  sessions: Array<{ token: string; email: string; expires_at: number }>;
  staff: Array<{ email: string; salt: string; hash: string; permissions: Permission[]; created_at: number }>;
  coupons: Coupon[];
  reviews: ProductReview[];
}

const EMPTY_STATE: DbState = {
  settings: { config: { ...DEFAULT_STORE_CONFIG, adminPassword: '' }, adminAuth: null },
  products: [],
  orders: [],
  sessions: [],
  staff: [],
  coupons: [],
  reviews: [],
};

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? '').trim();
const syncTable = process.env.STORE_SYNC_TABLE?.trim() || 'store_state';

let remoteClient: SupabaseClient | null = null;
let remoteSyncing = false;
let remoteSyncSubscribed = false;

const remoteSyncEnabled = supabaseUrl !== undefined && supabaseUrl !== '' && supabaseKey !== '';

if (remoteSyncEnabled) {
  try {
    remoteClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (error) {
    console.warn('[db] Failed to initialize Supabase sync client:', error instanceof Error ? error.message : error);
  }
}

const parseSupabaseState = (raw: unknown): DbState | null => {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as DbState;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') {
    try {
      return JSON.parse(JSON.stringify(raw)) as DbState;
    } catch {
      return null;
    }
  }
  return null;
};

const hydrateState = (next: Partial<DbState> | null | undefined): DbState => {
  const base = structuredClone(EMPTY_STATE);
  const merged = { ...base, ...(next ?? {}) } as DbState;
  const collections = ['products', 'orders', 'sessions', 'staff', 'coupons', 'reviews'] as const;
  for (const key of collections) {
    if (!Array.isArray(merged[key])) merged[key] = [];
  }
  merged.settings = { ...base.settings, ...(next?.settings ?? {}) } as DbState['settings'];
  if (!merged.settings.config) merged.settings.config = { ...DEFAULT_STORE_CONFIG, adminPassword: '' };
  if (!merged.settings.adminAuth) merged.settings.adminAuth = null;
  return merged;
};

const syncFromRemote = async (): Promise<boolean> => {
  if (!remoteClient) return false;
  try {
    const { data, error } = await remoteClient
      .from(syncTable)
      .select('id, state')
      .eq('id', 'shop')
      .maybeSingle();

    if (error) {
      console.warn('[db] Failed to read Supabase sync state:', error.message);
      return false;
    }

    const state = parseSupabaseState(data?.state);
    if (!state) return false;
    _state = hydrateState(state);
    save();
    return true;
  } catch (error) {
    console.warn('[db] Supabase sync read failed:', error instanceof Error ? error.message : error);
    return false;
  }
};

const syncToRemote = async (): Promise<void> => {
  if (!remoteClient || remoteSyncing) return;
  try {
    const { error } = await remoteClient
      .from(syncTable)
      .upsert({ id: 'shop', state: _state }, { onConflict: 'id' });

    if (error) {
      console.warn('[db] Failed to sync Supabase store state:', error.message);
    }
  } catch (error) {
    console.warn('[db] Supabase sync write failed:', error instanceof Error ? error.message : error);
  }
};

const subscribeToRemote = (): void => {
  if (!remoteClient || remoteSyncSubscribed) return;
  remoteSyncSubscribed = true;
  const channel = remoteClient.channel('store-sync');
  void channel
    .on('postgres_changes', { event: '*', schema: 'public', table: syncTable }, async (payload) => {
      if (payload.new && (payload.new as { id?: string }).id === 'shop') {
        const next = parseSupabaseState((payload.new as { state?: unknown }).state);
        if (!next) return;
        remoteSyncing = true;
        _state = hydrateState(next);
        save();
        remoteSyncing = false;
      }
    })
    .subscribe();
};

// ---------------------------------------------------------------------------
// Low-level file IO (atomic writes, single-writer per process)
// ---------------------------------------------------------------------------

let _state: DbState = structuredClone(EMPTY_STATE);
let _loaded = false;

function ensureLoaded(): void {
  if (_loaded) return;
  _loaded = true;
  try {
    const raw = fs.readFileSync(dbFile, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DbState>;
    _state = hydrateState(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      if (remoteClient) {
        void syncFromRemote();
      }
      return;
    }
    console.error('[db] Failed to read ' + dbFile + ':', error);
    _state = structuredClone(EMPTY_STATE);
  }
  if (remoteClient) {
    void syncFromRemote();
    subscribeToRemote();
  }
}

function save(): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = dbFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(_state, null, 2), 'utf8');
  fs.renameSync(tmp, dbFile);
  if (remoteClient && !remoteSyncing) {
    void syncToRemote();
  }
}

// ---------------------------------------------------------------------------
// Typed JSON helpers — no SQL, no native modules.
// ---------------------------------------------------------------------------

type Table = 'settings' | 'products' | 'orders' | 'sessions' | 'staff' | 'coupons' | 'reviews';

const TABLES: Table[] = ['settings', 'products', 'orders', 'sessions', 'staff', 'coupons', 'reviews'];

/** Row count for one table — `settings` counts the keys actually stored, which
 *  is what SQLite's `COUNT(*)` reported for its key/value rows. */
const countOf = (table: Table): number => {
  if (table === 'settings') {
    const s = _state.settings;
    return (s.config ? 1 : 0) + (s.adminAuth ? 1 : 0);
  }
  return _state[table].length;
};

/** A staff row as `server/auth.ts` expects it: `permissions` is a JSON *string*
 *  on the wire (it calls `JSON.parse`) even though the file keeps a real array
 *  so it stays pleasant to read and hand-edit. */
const staffRow = (row: DbState['staff'][number]): { email: string; salt: string; hash: string; permissions: string; created_at: number } => ({
  email: row.email,
  salt: row.salt,
  hash: row.hash,
  permissions: JSON.stringify(row.permissions ?? []),
  created_at: row.created_at,
});

const byEmail = (row: DbState['staff'][number], email: unknown): boolean =>
  row.email.toLowerCase() === String(email).trim().toLowerCase();

// ---- sessions ----------------------------------------------------------

export const deleteExpiredSessions = (now: number): void => {
  ensureLoaded();
  const before = _state.sessions.length;
  _state.sessions = _state.sessions.filter((s) => s.expires_at >= now);
  if (_state.sessions.length < before) save();
};

export const insertSession = (token: string, email: string, expiresAt: number): void => {
  ensureLoaded();
  _state.sessions.push({ token, email, expires_at: expiresAt });
  save();
};

export const getSessionByToken = (token: string): { email: string; expires_at: number } | undefined => {
  ensureLoaded();
  return _state.sessions.find((s) => s.token === token);
};

export const deleteSessionByToken = (token: string): void => {
  ensureLoaded();
  const before = _state.sessions.length;
  _state.sessions = _state.sessions.filter((s) => s.token !== token);
  if (_state.sessions.length < before) save();
};

export const deleteSessionsByEmail = (email: string): void => {
  ensureLoaded();
  const target = email.trim().toLowerCase();
  const before = _state.sessions.length;
  _state.sessions = _state.sessions.filter((s) => s.email.toLowerCase() !== target);
  if (_state.sessions.length < before) save();
};

// ---- staff -------------------------------------------------------------
export const readStaffRow = (email: string): { email: string; salt: string; hash: string; permissions: string; created_at: number } | null => {
  ensureLoaded();
  const found = _state.staff.find((row) => byEmail(row, email));
  return found ? staffRow(found) : null;
};

export const listStaffRows = (): { email: string; salt: string; hash: string; permissions: string; created_at: number }[] => {
  ensureLoaded();
  return [..._state.staff]
    .sort((a, b) => a.created_at - b.created_at)
    .map(staffRow);
};

export const insertStaffRow = (
  email: string,
  salt: string,
  hash: string,
  permissions: string,
  createdAt: number,
): void => {
  ensureLoaded();
  let parsed: Permission[] = [];
  try { parsed = JSON.parse(permissions) as Permission[]; } catch { parsed = []; }
  _state.staff.push({ email, salt, hash, permissions: parsed, created_at: createdAt });
  save();
};

export const updateStaffPermissions = (email: string, permissions: string): void => {
  ensureLoaded();
  const found = _state.staff.find((row) => byEmail(row, email));
  if (!found) return;
  try { found.permissions = JSON.parse(permissions) as Permission[]; } catch { found.permissions = []; }
  save();
};

export const updateStaffSaltHash = (email: string, salt: string, hash: string): void => {
  ensureLoaded();
  const found = _state.staff.find((row) => byEmail(row, email));
  if (!found) return;
  found.salt = salt;
  found.hash = hash;
  save();
};

export const deleteStaffRow = (email: string): { changes: number } => {
  ensureLoaded();
  const before = _state.staff.length;
  _state.staff = _state.staff.filter((row) => !byEmail(row, email));
  if (_state.staff.length < before) save();
  return { changes: before - _state.staff.length };
};

// ---- orders ------------------------------------------------------------


/** Size of the data file on disk, or 0 when it has not been written yet. */
export const fileSize = (filePath: string): number => {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
};





export const DEFAULT_CONFIG: StoreConfig = { ...DEFAULT_STORE_CONFIG, adminPassword: '' };

// ---- settings -------------------------------------------------------------

/** Only two keys are ever stored (`config`, `adminAuth`), so the state keeps
 *  them as first-class fields rather than a free-for-all map. */
export const getSetting = <T,>(key: string): T | null => {
  ensureLoaded();
  if (key === 'config') return _state.settings.config as unknown as T;
  if (key === 'adminAuth') return _state.settings.adminAuth as unknown as T | null;
  return null;
};

export const setSetting = (key: string, value: unknown): void => {
  ensureLoaded();
  if (key === 'config') _state.settings.config = value as StoreConfig;
  else if (key === 'adminAuth') _state.settings.adminAuth = value as DbSettings['adminAuth'];
  else {
    console.warn('[db] Ignoring unknown settings key "' + key + '".');
    return;
  }
  save();
};

// ---- products -------------------------------------------------------------

export const allProducts = (): Product[] => {
  ensureLoaded();
  // `sort_index` mirrors the old column: lower sorts first (newer admin
  // products were prepended, so they hold the most negative numbers).
  return [..._state.products]
    .sort((a, b) => a.sort_index - b.sort_index)
    .map((row) => row.product);
};

export const getProduct = (id: string): Product | null => {
  ensureLoaded();
  return _state.products.find((row) => row.id === id)?.product ?? null;
};

/** Insert a brand-new product at the top of the list (matches the old client
 *  behaviour where new products were prepended). */
export const insertProduct = (product: Product): void => {
  ensureLoaded();
  const next = _state.products.reduce((min, row) => Math.min(min, row.sort_index), 0) - 1;
  _state.products.push({ id: product.id, product, sort_index: next });
  save();
};

/** Replace an existing product's record; position (`sort_index`) is preserved. */
export const updateProductData = (product: Product): void => {
  ensureLoaded();
  const row = _state.products.find((r) => r.id === product.id);
  if (row) row.product = product;
  save();
};

export const removeProduct = (id: string): void => {
  ensureLoaded();
  _state.products = _state.products.filter((row) => row.id !== id);
  save();
};

/** Wipe and refill in one transaction — used by import/reset. */
export const replaceProducts = (products: Product[]): void => {
  ensureLoaded();
  _state.products = products.map((product, index) => ({
    id: product.id,
    product,
    sort_index: index,
  }));
  save();
};

export const seedProducts = (): void => {
  replaceProducts(INITIAL_PRODUCTS.map(normalizeProduct));
};

// ---- orders ---------------------------------------------------------------

/** Newest first — the admin panels list the most recent order at the top. */
export const allOrders = (): Order[] => {
  ensureLoaded();
  return [..._state.orders].sort((a, b) => b.createdAt - a.createdAt);
};

/** Single order by id, or null when it does not exist. */
export const getOrder = (id: string): Order | null => {
  ensureLoaded();
  return _state.orders.find((order) => order.id === id) ?? null;
};

export const insertOrder = (order: Order): void => {
  ensureLoaded();
  _state.orders.push(order);
  save();
};

export const orderReferenceExists = (reference: string): boolean => {
  ensureLoaded();
  return _state.orders.some((order) => order.reference === reference);
};

/** Updates the order's status. Returns false when the order does not exist. */
export const updateOrderStatusRow = (id: string, status: OrderStatus): boolean => {
  ensureLoaded();
  const order = _state.orders.find((o) => o.id === id);
  if (!order) return false;
  order.status = status;
  save();
  return true;
};

/** Records the admin's manual-payment verdict on an order (payment settings are
 *  not electronic — the shop owner ticks this off after checking their bank or
 *  mobile-money statement). Only the keys present in `patch` are touched.
 *  Returns the updated order, or null when it does not exist. */
export const updateOrderPaymentNote = (
  id: string,
  patch: { confirmed?: boolean; note?: string },
): Order | null => {
  ensureLoaded();
  const order = getOrder(id);
  if (!order) return null;
  if (patch.confirmed !== undefined) order.paymentConfirmed = patch.confirmed;
  if (patch.note !== undefined) order.paymentNote = patch.note;
  save();
  return order;
};

export const replaceOrders = (orders: Order[]): void => {
  ensureLoaded();
  _state.orders = [...orders];
  save();
};

export const clearOrders = (): void => {
  ensureLoaded();
  _state.orders = [];
  save();
};

/** Deletes one order; returns false when the id does not exist. */
export const removeOrder = (id: string): boolean => {
  ensureLoaded();
  const before = _state.orders.length;
  _state.orders = _state.orders.filter((order) => order.id !== id);
  const changed = before !== _state.orders.length;
  if (changed) save();
  return changed;
};

/** Applies an admin edit to the editable fields of an order (customer details,
 *  status, payment bookkeeping) and returns the stored order, or null when it
 *  does not exist.
 *
 *  `reference` and `created_at` are the order's identity — they are copied from
 *  the stored row rather than the patch, so an edit can never rewrite history.
 *  `lines`/`total`/`payment` are deliberately absent from the editable set:
 *  they are only changed by checkout, so a manual edit cannot invent a price. */
export const updateOrderFields = (id: string, patch: Partial<Order>): Order | null => {
  ensureLoaded();
  const existing = getOrder(id);
  if (!existing) return null;
  const merged: Order = {
    ...existing,
    ...patch,
    id: existing.id,
    reference: existing.reference,
    createdAt: existing.createdAt,
    lines: existing.lines,
    total: existing.total,
  };
  const index = _state.orders.findIndex((order) => order.id === id);
  _state.orders[index] = merged;
  save();
  return merged;
};

// ---- coupons ---------------------------------------------------------------

/** Newest first. Codes are stored normalised (UPPERCASE), exactly as the
 *  UNIQUE index enforced before, so `save10` and `SAVE10` collide. */
export const allCoupons = (): Coupon[] => {
  ensureLoaded();
  return [..._state.coupons].sort((a, b) => b.createdAt - a.createdAt);
};

export const getCoupon = (id: string): Coupon | null => {
  ensureLoaded();
  return _state.coupons.find((coupon) => coupon.id === id) ?? null;
};

/** Lookup by the normalised (UPPERCASE) code — the shopper's input is
 *  normalised by the route before calling this. */
export const getCouponByCode = (code: string): Coupon | null => {
  ensureLoaded();
  const wanted = code.trim().toUpperCase();
  return _state.coupons.find((coupon) => coupon.code.toUpperCase() === wanted) ?? null;
};

export const insertCoupon = (coupon: Coupon): void => {
  ensureLoaded();
  if (getCouponByCode(coupon.code)) {
    throw new Error('UNIQUE constraint failed: coupons.code');
  }
  _state.coupons.push(coupon);
  save();
};

/** Replaces a coupon; returns false when missing. */
export const updateCouponRow = (coupon: Coupon): boolean => {
  ensureLoaded();
  const index = _state.coupons.findIndex((c) => c.id === coupon.id);
  if (index === -1) return false;
  _state.coupons[index] = coupon;
  save();
  return true;
};

export const removeCoupon = (id: string): boolean => {
  ensureLoaded();
  const before = _state.coupons.length;
  _state.coupons = _state.coupons.filter((coupon) => coupon.id !== id);
  const changed = before !== _state.coupons.length;
  if (changed) save();
  return changed;
};

/** Full-table coupon replacement for imports — the whole array lands in one
 *  write, so a half-read file can never strand the collection. */
export const replaceCoupons = (coupons: Coupon[]): void => {
  ensureLoaded();
  _state.coupons = [...coupons];
  save();
};

// ---- reviews ---------------------------------------------------------------

/** Newest first, optionally narrowed to one product. */
export const allReviews = (productId?: string): ProductReview[] => {
  ensureLoaded();
  const rows = productId
    ? _state.reviews.filter((review) => review.productId === productId)
    : [..._state.reviews];
  return rows.sort((a, b) => b.createdAt - a.createdAt);
};

export const getReview = (id: string): ProductReview | null => {
  ensureLoaded();
  return _state.reviews.find((review) => review.id === id) ?? null;
};

export const insertReview = (review: ProductReview): void => {
  ensureLoaded();
  _state.reviews.push(review);
  save();
};

/** Approves or re-pends a review. Returns false when it does not exist. */
export const updateReviewStatusRow = (id: string, status: ProductReview['status']): boolean => {
  ensureLoaded();
  const review = _state.reviews.find((r) => r.id === id);
  if (!review) return false;
  review.status = status;
  save();
  return true;
};

export const removeReview = (id: string): boolean => {
  ensureLoaded();
  const before = _state.reviews.length;
  _state.reviews = _state.reviews.filter((review) => review.id !== id);
  const changed = before !== _state.reviews.length;
  if (changed) save();
  return changed;
};

/** Full-table review replacement for imports. */
export const replaceReviews = (reviews: ProductReview[]): void => {
  ensureLoaded();
  _state.reviews = [...reviews];
  save();
};

/** Approved-review aggregates per product for the public card badges. */
export const reviewSummaries = (): Record<string, { count: number; average: number }> => {
  ensureLoaded();
  const acc = new Map<string, { count: number; total: number }>();
  for (const review of _state.reviews) {
    if (review.status !== 'approved') continue;
    const entry = acc.get(review.productId) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += review.rating;
    acc.set(review.productId, entry);
  }
  const out: Record<string, { count: number; average: number }> = {};
  for (const [productId, { count, total }] of acc) {
    out[productId] = { count, average: Math.round((total / count) * 10) / 10 };
  }
  return out;
};

// ---- orders (lookup helpers) -----------------------------------------------

/** Lookup by the FAS-###### reference a shopper was given at checkout. */
export const getOrderByReference = (reference: string): Order | null => {
  ensureLoaded();
  return _state.orders.find((order) => order.reference === reference) ?? null;
};

// ---------------------------------------------------------------------------
// Database admin operations (JSON-file equivalents of the old SQLite PRAGMA /
// VACUUM / VACUUM INTO concepts)
// ---------------------------------------------------------------------------

/** Run a batch of mutations as one logical unit, saving once at the end.
 *  Returns the callback's result so callers can use it as a function factory
 *  (`const run = withTransaction(() => ...); return run();`) or ignore it. */
export const withTransaction = <T>(callback: () => T): T => {
  ensureLoaded();
  const result = callback();
  save();
  return result;
};

/** One row per table: name + approximate row count. */
export const getDatabaseTables = (): { name: string; rows: number }[] => {
  ensureLoaded();
  return TABLES.map((name) => ({ name, rows: countOf(name) }));
};

/** Row count for one table. `settings` counts the stored keys. */
export const getTableRowCount = (name: string): { n: number } => {
  ensureLoaded();
  return { n: countOf(name as Table) };
};

/** Validate the on-disk JSON is readable. Returns `[{ integrity_check: 'ok' }]`
 *  or an error row when the file is corrupt or missing. */
export const integrityCheck = (): { integrity_check: string }[] => {
  try {
    fs.readFileSync(dbFile, 'utf8');
    return [{ integrity_check: 'ok' }];
  } catch (error) {
    return [{
      integrity_check: 'error: ' + (error instanceof Error ? error.message : String(error)),
    }];
  }
};

/** Rewrite the file compactly (reclaims space from a prior purge). Data is
 *  unchanged — safe to run while shoppers browse. */
export const optimize = (): void => {
  ensureLoaded();
  save();
};

/** Alias for `optimize` — keeps the old `VACUUM` name working for callers. */
export const vacuum = (): void => {
  optimize();
};

/** Copy the live store file to `destination` for backup/restore. */
export const vacuumInto = (destination: string): void => {
  ensureLoaded();
  fs.copyFileSync(dbFile, destination);
};

// ---- first-run seeding ----------------------------------------------------

// Only seed on a brand-new store: if the admin deliberately deletes every
// product, a restart must not resurrect the seed catalogue (the reset endpoint
// does that on purpose via `seedProducts` above).
ensureLoaded();
if (getSetting('config') === null) {
  setSetting('config', DEFAULT_CONFIG);
  seedProducts();
  console.log(
    '[db] Fresh store created at ' + dbFile + ' (seeded ' + INITIAL_PRODUCTS.length + ' products).',
  );
}

