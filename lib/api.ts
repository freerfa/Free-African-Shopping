/**
 * Thin typed client for the store's REST API (`/api/...`).
 *
 * Every request carries the admin bearer token when one exists (the server
 * decides what it unlocks), and failures throw `ApiError` with the server's
 * human-readable message so views can surface it directly.
 */
import type {
  Order,
  OrderStatus,
  PaymentInfo,
  Permission,
  Product,
  StaffMember,
  StoreConfig,
  StoreSnapshot,
  User,
} from '../types';
import { STORAGE_KEYS, loadState } from './storage';

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
}

const request = async <T,>(path: string, options: RequestOptions = {}): Promise<T> => {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = loadState<string | null>(STORAGE_KEYS.authToken, null);
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError('Could not reach the store server. Is it running?', 0);
  }

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const payload = (await response.json()) as { error?: unknown };
      if (typeof payload.error === 'string') message = payload.error;
    } catch {
      // No JSON body — keep the default message.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

/** Config/products/orders as returned by bulk operations (import/reset). */
export interface StoreData {
  config: StoreConfig;
  products: Product[];
  orders: Order[];
}

export interface LoginResult {
  token: string;
  user: User;
}

/** Row count for one table in the store database (Admin → Database). */
export interface DatabaseTableInfo {
  name: string;
  rows: number;
}

/** Snapshot of the SQLite file: where it lives, how big it is, and what is in
 *  it. Returned by `GET /api/database` and after an optimize. */
export interface DatabaseInfo {
  file: string;
  sizeBytes: number;
  /** Write-ahead log size (0 when the database is fully checkpointed). */
  walBytes: number;
  journalMode: string;
  pageSize: number;
  pageCount: number;
  /** Pages on the freelist — space an optimize/VACUUM can reclaim. */
  freelistPages: number;
  tables: DatabaseTableInfo[];
}

/** Result of `PRAGMA integrity_check`: `ok` is false when messages lists problems. */
export interface IntegrityResult {
  ok: boolean;
  messages: string[];
}

export const api = {
  getConfig: () => request<StoreConfig>('/api/config'),
  putConfig: (config: StoreConfig) =>
    request<{ config: StoreConfig }>('/api/config', { method: 'PUT', body: config }),

  getProducts: () => request<Product[]>('/api/products'),
  createProduct: (product: Product) =>
    request<Product>('/api/products', { method: 'POST', body: product }),
  updateProduct: (product: Product) =>
    request<Product>(`/api/products/${encodeURIComponent(product.id)}`, {
      method: 'PUT',
      body: product,
    }),
  deleteProduct: (id: string) =>
    request<void>(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getOrders: () => request<Order[]>('/api/orders'),
  /** `payment` records how the shopper chose to pay; the server validates it
   *  against the enabled methods and snapshots the receiving account. */
  placeOrder: (
    details: { name: string; email: string; phone: string; address: string },
    lines: { productId: string; variantId: string | null; quantity: number }[],
    payment?: PaymentInfo,
  ) => request<Order>('/api/orders', { method: 'POST', body: { ...details, lines, payment } }),
  setOrderStatus: (id: string, status: OrderStatus) =>
    request<void>(`/api/orders/${encodeURIComponent(id)}/status`, {
      method: 'PUT',
      body: { status },
    }),
  /** Admin bookkeeping for a manual payment (tick it off and/or leave a note). */
  setOrderPayment: (id: string, patch: { confirmed?: boolean; note?: string }) =>
    request<Order>(`/api/orders/${encodeURIComponent(id)}/payment`, {
      method: 'PUT',
      body: patch,
    }),
  /** Admin → Database: edits customer details, status and payment bookkeeping.
   *  Lines, total and the payment snapshot are owned by checkout and are not
   *  editable here. */
  updateOrder: (id: string, patch: Partial<Order>) =>
    request<Order>(`/api/orders/${encodeURIComponent(id)}`, { method: 'PUT', body: patch }),
  /** Admin → Database: deletes one order. */
  deleteOrder: (id: string) =>
    request<void>(`/api/orders/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** Admin → Database: records an order taken outside the site (phone, WhatsApp,
   *  in person). The server prices the lines from the catalogue and decrements
   *  stock exactly as checkout does. */
  createAdminOrder: (input: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    status?: OrderStatus;
    paymentNote?: string;
    lines: { productId: string; variantId: string | null; quantity: number }[];
  }) => request<Order>('/api/admin/orders', { method: 'POST', body: input }),

  login: (email: string, password: string) =>
    request<LoginResult>('/api/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request<{ user: User }>('/api/auth/me'),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),

  // ---- staff accounts ------------------------------------------------------
  /** The owner is returned alongside the list so the panel can show it as the
   *  un-removable account rather than as a staff row. */
  getStaff: () => request<{ staff: StaffMember[]; owner: User }>('/api/staff'),
  createStaff: (input: { email: string; password: string; permissions: Permission[] }) =>
    request<{ member: StaffMember }>('/api/staff', { method: 'POST', body: input }),
  /** Omit `permissions` to leave the rights alone, or `password` to keep it. */
  updateStaff: (
    email: string,
    patch: { permissions?: Permission[]; password?: string },
  ) =>
    request<{ member: StaffMember }>(`/api/staff/${encodeURIComponent(email)}`, {
      method: 'PUT',
      body: patch,
    }),
  deleteStaff: (email: string) =>
    request<void>(`/api/staff/${encodeURIComponent(email)}`, { method: 'DELETE' }),

  importSnapshot: (snapshot: StoreSnapshot) =>
    request<StoreData>('/api/import', { method: 'POST', body: snapshot }),
  reset: () => request<StoreData>('/api/reset', { method: 'POST' }),

  // ---- Admin → Database (database-file management) ------------------------
  getDatabaseInfo: () => request<DatabaseInfo>('/api/database'),
  /** Runs `PRAGMA integrity_check` and reports `ok` or the list of problems. */
  checkDatabase: () => request<IntegrityResult>('/api/database/check', { method: 'POST' }),
  /** VACUUMs the file and returns fresh stats. */
  optimizeDatabase: () => request<DatabaseInfo>('/api/database/optimize', { method: 'POST' }),
  /** Purges the whole order book; resolves with the number of orders removed. */
  clearOrders: () => request<{ cleared: number }>('/api/orders', { method: 'DELETE' }),
};
