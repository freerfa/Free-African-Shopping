/**
 * SQLite data layer for the store.
 *
 * Products, orders and settings used to live in `localStorage` (~5 MB ceiling,
 * one browser, one device). They now live in a real embedded database file
 * (`server/data/store.db`) that the Express API in `server/index.ts` reads and
 * writes, so every visitor shares one store and the data survives across
 * browsers. Rows are normalised through the same `normalizeProduct` helper
 * the client uses, so both ends agree on shapes.
 *
 * `products`/`orders` keep the whole record as JSON in one column (the app
 * only ever reads whole records); `settings` is a key/value bag (store config,
 * admin credentials); `sessions` backs bearer-token admin auth.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Order, OrderStatus, Product, StoreConfig } from '../types';
import { INITIAL_PRODUCTS } from '../constants';
import { DEFAULT_STORE_CONFIG } from '../storeConfig';
import { normalizeProduct } from '../lib/storage';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const dataDir = process.env.DB_DIR
  ? path.resolve(process.env.DB_DIR)
  : path.join(moduleDir, 'data');
export const dbFile = path.join(dataDir, 'store.db');

fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(dbFile);
// WAL keeps reads fast while a write is in flight; busy_timeout weather's the
// occasional collision while `tsx watch` restarts the server mid-request.
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    -- Newest admin-created products sort first (negative indices); seed data
    -- keeps its file order. Set at insert, never rewritten on update.
    sort_index INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id         TEXT PRIMARY KEY,
    reference  TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    status     TEXT NOT NULL,
    data       TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    email      TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  -- Staff accounts the owner created, each with its own set of rights. The
  -- password is stored as a scrypt hash exactly like the owner's; the plain
  -- value is never written anywhere. The permissions column is a JSON array
  -- of strings from the Permission union (server/auth.ts validates them on
  -- the way in).
  CREATE TABLE IF NOT EXISTS staff (
    email       TEXT PRIMARY KEY,
    salt        TEXT NOT NULL,
    hash        TEXT NOT NULL,
    permissions TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
`);

/** Store identity seeded on first run. `adminPassword` is intentionally empty:
 *  the real credential lives hashed under the `adminAuth` setting (server/auth.ts)
 *  and never appears in config payloads. */
export const DEFAULT_CONFIG: StoreConfig = { ...DEFAULT_STORE_CONFIG, adminPassword: '' };

// ---- settings -------------------------------------------------------------

export const getSetting = <T,>(key: string): T | null => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch (error) {
    console.error(`[db] Corrupt settings entry "${key}":`, error);
    return null;
  }
};

export const setSetting = (key: string, value: unknown): void => {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, JSON.stringify(value));
};

// ---- products -------------------------------------------------------------

export const allProducts = (): Product[] =>
  (db.prepare('SELECT data FROM products ORDER BY sort_index ASC').all() as { data: string }[])
    .map((row) => {
      try {
        return normalizeProduct(JSON.parse(row.data));
      } catch (error) {
        console.error('[db] Skipping corrupt product row:', error);
        return null;
      }
    })
    .filter((p): p is Product => p !== null);

export const getProduct = (id: string): Product | null => {
  const row = db.prepare('SELECT data FROM products WHERE id = ?').get(id) as
    | { data: string }
    | undefined;
  if (!row) return null;
  try {
    return normalizeProduct(JSON.parse(row.data));
  } catch (error) {
    console.error(`[db] Corrupt product row "${id}":`, error);
    return null;
  }
};

/** Insert a brand-new product at the top of the list (matches the old client
 *  behaviour where new products were prepended). */
export const insertProduct = (product: Product): void => {
  const row = db.prepare('SELECT COALESCE(MIN(sort_index), 0) - 1 AS next FROM products').get() as {
    next: number;
  };
  db.prepare('INSERT INTO products (id, data, sort_index) VALUES (?, ?, ?)').run(
    product.id,
    JSON.stringify(product),
    row.next,
  );
};

/** Replace an existing product's record; position (sort_index) is preserved. */
export const updateProductData = (product: Product): void => {
  db.prepare('UPDATE products SET data = ? WHERE id = ?').run(JSON.stringify(product), product.id);
};

export const removeProduct = (id: string): void => {
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
};

/** Wipe and refill in one transaction — used by import/reset. */
export const replaceProducts = (products: Product[]): void => {
  db.prepare('DELETE FROM products').run();
  const insert = db.prepare('INSERT INTO products (id, data, sort_index) VALUES (?, ?, ?)');
  products.forEach((product, index) => insert.run(product.id, JSON.stringify(product), index));
};

export const seedProducts = (): void => {
  replaceProducts(INITIAL_PRODUCTS.map(normalizeProduct));
};

// ---- orders ---------------------------------------------------------------

export const allOrders = (): Order[] =>
  (db.prepare('SELECT data FROM orders ORDER BY created_at DESC').all() as { data: string }[])
    .map((row) => JSON.parse(row.data) as Order);

/** Single order by id, or null when it does not exist. */
export const getOrder = (id: string): Order | null => {
  const row = db.prepare('SELECT data FROM orders WHERE id = ?').get(id) as
    | { data: string }
    | undefined;
  return row ? (JSON.parse(row.data) as Order) : null;
};

export const insertOrder = (order: Order): void => {
  db.prepare(
    'INSERT INTO orders (id, reference, created_at, status, data) VALUES (?, ?, ?, ?, ?)',
  ).run(order.id, order.reference, order.createdAt, order.status, JSON.stringify(order));
};

export const orderReferenceExists = (reference: string): boolean =>
  db.prepare('SELECT 1 FROM orders WHERE reference = ?').get(reference) !== undefined;

/** Updates both the indexed `status` column and the status inside the JSON
 *  blob. Returns false when the order does not exist. */
export const updateOrderStatusRow = (id: string, status: OrderStatus): boolean => {
  const row = db.prepare('SELECT data FROM orders WHERE id = ?').get(id) as
    | { data: string }
    | undefined;
  if (!row) return false;
  const order = JSON.parse(row.data) as Order;
  order.status = status;
  db.prepare('UPDATE orders SET status = ?, data = ? WHERE id = ?').run(
    status,
    JSON.stringify(order),
    id,
  );
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
  const order = getOrder(id);
  if (!order) return null;
  if (patch.confirmed !== undefined) order.paymentConfirmed = patch.confirmed;
  if (patch.note !== undefined) order.paymentNote = patch.note;
  db.prepare('UPDATE orders SET data = ? WHERE id = ?').run(JSON.stringify(order), id);
  return order;
};

export const replaceOrders = (orders: Order[]): void => {
  db.prepare('DELETE FROM orders').run();
  const insert = db.prepare(
    'INSERT INTO orders (id, reference, created_at, status, data) VALUES (?, ?, ?, ?, ?)',
  );
  orders.forEach((order) =>
    insert.run(order.id, order.reference, order.createdAt, order.status, JSON.stringify(order)),
  );
};

export const clearOrders = (): void => {
  db.prepare('DELETE FROM orders').run();
};

/** Deletes one order; returns false when the id does not exist. */
export const removeOrder = (id: string): boolean =>
  db.prepare('DELETE FROM orders WHERE id = ?').run(id).changes > 0;

/** Applies an admin edit to the editable fields of an order (customer details,
 *  status, payment bookkeeping) and returns the stored order, or null when it
 *  does not exist.
 *
 *  `reference` and `created_at` are the order's identity — they are copied from
 *  the stored row rather than the patch, so an edit can never rewrite history or
 *  collide with the UNIQUE index. The indexed `status` column is rewritten
 *  alongside the JSON blob so the two never drift. */
export const updateOrderFields = (id: string, patch: Partial<Order>): Order | null => {
  const existing = getOrder(id);
  if (!existing) return null;
  const merged: Order = {
    ...existing,
    ...patch,
    id: existing.id,
    reference: existing.reference,
    createdAt: existing.createdAt,
    // `lines`/`total`/`payment` are deliberately absent from the editable set —
    // they are only changed by checkout, so a manual edit cannot invent a price.
    lines: existing.lines,
    total: existing.total,
  };
  db.prepare('UPDATE orders SET status = ?, data = ? WHERE id = ?').run(
    merged.status,
    JSON.stringify(merged),
    id,
  );
  return merged;
};

// ---- first-run seeding ----------------------------------------------------

// Only seed on a brand-new database: if the admin deliberately deletes every
// product, a restart must not resurrect the seed catalogue (the reset endpoint
// does that on purpose via `seedProducts` above).
if (getSetting('config') === null) {
  setSetting('config', DEFAULT_CONFIG);
  seedProducts();
  console.log(
    `[db] Fresh database created at ${dbFile} (seeded ${INITIAL_PRODUCTS.length} products).`,
  );
}