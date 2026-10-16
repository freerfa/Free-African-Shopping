/**
 * Express API for the store — the built-in database backend.
 *
 * Serves the REST API under `/api` and, when `dist/` exists, the built SPA too
 * (so production is a single server: `npm run build && npm start`).
 *
 * Dev:  npm run dev:api   (Vite proxies /api here — see vite.config.ts)
 * Prod: npm start         (PORT env, default 3001)
 */
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Coupon,
  CouponKind,
  Order,
  OrderStatus,
  PaymentInfo,
  PaymentMethod,
  Permission,
  Product,
  ProductReview,
  StoreConfig,
  StorePayments,
  StoreSnapshot,
  TrackedOrder,
} from '../types';
import { ALL_PERMISSIONS } from '../types';
import { PAYMENT_METHOD_LABELS, paymentMethodStatus } from '../lib/payments';
import { couponDiscount, couponProblem, normalizeCouponCode } from '../lib/coupons';
import { createId, normalizeCoupons, normalizeProduct, normalizeProducts, normalizeReviews, normalizeStaffSnapshot } from '../lib/storage';
import { chargeablePrice } from '../lib/product';
import {
  allCoupons,
  allOrders,
  allProducts,
  allReviews,
  clearOrders,
  dataDir,
  dbFile,
  DEFAULT_CONFIG,
  getCoupon,
  getCouponByCode,
  getDatabaseTables,
  getOrderByReference,
  getProduct,
  getReview,
  getSetting,
  getTableRowCount,
  insertCoupon,
  insertOrder,
  insertProduct,
  insertReview,
  integrityCheck,
  orderReferenceExists,
  optimize,
  removeCoupon,
  removeOrder,
  removeProduct,
  removeReview,
  replaceCoupons,
  replaceOrders,
  replaceProducts,
  replaceReviews,
  reviewSummaries,
  seedProducts,
  setSetting,
  updateCouponRow,
  updateOrderFields,
  updateOrderPaymentNote,
  updateOrderStatusRow,
  updateProductData,
  updateReviewStatusRow,
  vacuum,
  vacuumInto,
  withTransaction,
} from './db';
import { normalizePayments } from '../storeConfig';
import {
  clearLoginFailures,
  createSession,
  createStaff,
  deleteStaff,
  destroySession,
  destroySessionsFor,
  getAdminAuth,
  getSession,
  isOwnerEmail,
  listStaff,
  loginBlockedFor,
  recordLoginFailure,
  requireAdmin,
  requirePermission,
  syncStaffMembership,
  tokenFrom,
  updateAdminCredentials,
  updateStaff,
  userFor,
  verifyPassword,
  verifyStaffCredentials,
} from './auth';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(moduleDir, '..');

/** Error carrying the HTTP status the route should answer with. */
class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const sendError = (res: Response, error: unknown): void => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error('[server] unhandled route error:', error);
  res.status(500).json({ error: 'Internal server error.' });
};

/** Express 5 types route params as `string | string[]`; every param we use is
 *  a single path segment, so it is always a string at runtime. */
const routeParam = (value: string | string[]): string => (Array.isArray(value) ? value[0] : value);

/** Validates a product body from the network and normalises it with the same
 *  rules the client uses (types are compile-time only — bodies are untrusted).
 *
 *  `price` and `stock` accept `null`: that is how a Service or a Job records
 *  "no fixed price" / "stock not tracked". Anything else non-numeric is still
 *  rejected, so a typo can't silently become a free listing. */
const readProductBody = (body: unknown, id: string): Product => {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid product payload.');
  const draft = body as Partial<Product>;
  if (typeof draft.name !== 'string' || !draft.name.trim()) {
    throw new HttpError(400, 'Product name is required.');
  }
  if (
    draft.price !== null &&
    (typeof draft.price !== 'number' || !Number.isFinite(draft.price) || draft.price < 0)
  ) {
    throw new HttpError(400, 'Product price must be a number of 0 or more, or left blank.');
  }
  if (
    draft.stock !== null &&
    (typeof draft.stock !== 'number' || !Number.isFinite(draft.stock) || draft.stock < 0)
  ) {
    throw new HttpError(400, 'Product stock must be a number of 0 or more, or left blank.');
  }
  // Per-listing contact details (Services and Jobs). Trimmed and type-checked
  // here; a malformed email is rejected rather than saved, because it would
  // silently break the shopper's mail client.
  const contactText = (value: unknown): string =>
    typeof value === 'string' ? value.trim() : '';
  const contactEmail = contactText(draft.contactEmail);
  if (contactEmail !== '' && !/^\S+@\S+\.\S+$/.test(contactEmail)) {
    throw new HttpError(400, 'Contact email must be a valid email address, or left blank.');
  }

  return normalizeProduct({
    ...(draft as Product),
    id,
    contactName: contactText(draft.contactName),
    contactPhone: contactText(draft.contactPhone),
    contactEmail,
  });
};

const app = express();
app.disable('x-powered-by');
// Generous body limit: product photos travel as base64 data URLs and snapshot
// imports carry whole catalogues.
app.use(express.json({ limit: '30mb' }));

// ---- health --------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// ---- store config --------------------------------------------------------

app.get('/api/config', (_req, res) => {
  const config = getSetting<StoreConfig>('config');
  if (!config) {
    res.status(500).json({ error: 'Store config is missing.' });
    return;
  }
  // The admin password hash never leaves the server. Payment details are
  // normalised so a database written before the payment feature (no `payments`
  // key at all) still yields a complete, usable set for checkout.
  res.json({ ...config, adminPassword: '', payments: normalizePayments(config.payments) });
});

app.put('/api/config', requireAdmin, requirePermission('settings.manage'), (req, res) => {
  try {
    const current = getSetting<StoreConfig>('config');
    if (!current) throw new HttpError(500, 'Store config is missing.');
    const patch = (req.body ?? {}) as Partial<StoreConfig>;
    const merged: StoreConfig = {
      ...current,
      ...patch,
      colors: {
        ...current.colors,
        ...(patch.colors && typeof patch.colors === 'object' ? patch.colors : {}),
      },
      adminPassword: '',
    };
    if (typeof merged.storeName !== 'string' || !merged.storeName.trim()) {
      merged.storeName = current.storeName;
    }
    if (!Array.isArray(merged.categories)) merged.categories = current.categories;
    else merged.categories = merged.categories.filter((c): c is string => typeof c === 'string');

    // Payment settings come from the admin form as one nested object. Merge one
    // level deep so a patch that only flips a toggle cannot wipe the bank
    // details, then normalise (blank fields fall back to the defaults).
    merged.payments = normalizePayments({
      ...(current.payments ?? {}),
      ...((patch.payments && typeof patch.payments === 'object' ? patch.payments : {}) as Partial<StorePayments>),
    });

    // Credential changes ride along with the settings form: a blank password
    // field means "keep the current password".
    const auth = getAdminAuth();
    const patchEmail = typeof patch.adminEmail === 'string' ? patch.adminEmail.trim() : '';
    const email = patchEmail || auth?.email || current.adminEmail;
    updateAdminCredentials({
      email,
      password:
        typeof patch.adminPassword === 'string' && patch.adminPassword.length > 0
          ? patch.adminPassword
          : undefined,
    });
    merged.adminEmail = email;

    setSetting('config', merged);
    res.json({ config: { ...merged, adminPassword: '' } });
  } catch (error) {
    sendError(res, error);
  }
});

// ---- products --------------------------------------------------------------

/** Public callers get live products only; a valid admin session sees drafts too. */
app.get('/api/products', (req, res) => {
  const token = tokenFrom(req);
  const admin = token ? getSession(token) !== null : false;
  res.json(allProducts().filter((product) => admin || product.status === 'live'));
});

app.post('/api/products', requireAdmin, requirePermission('products.manage'), (req, res) => {
  try {
    const body = req.body as Partial<Product> | undefined;
    const fallbackId = typeof body?.id === 'string' && body.id.trim() ? body.id : createId('product');
    const product = readProductBody(req.body, fallbackId);
    insertProduct(product);
    res.status(201).json(product);
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/products/:id', requireAdmin, requirePermission('products.manage'), (req, res) => {
  try {
    const id = routeParam(req.params.id);
    if (!getProduct(id)) throw new HttpError(404, 'Product not found.');
    const product = readProductBody(req.body, id);
    updateProductData(product);
    res.json(product);
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/products/:id', requireAdmin, requirePermission('products.manage'), (req, res) => {
  try {
    removeProduct(routeParam(req.params.id));
    res.status(204).end();
  } catch (error) {
    sendError(res, error);
  }
});

// ---- orders ----------------------------------------------------------------

const ORDER_STATUSES: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered'];

app.get('/api/orders', requireAdmin, requirePermission('orders.view'), (_req, res) => {
  try {
    res.json(allOrders());
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/orders/:id/status', requireAdmin, requirePermission('orders.manage'), (req, res) => {
  try {
    const status = (req.body as { status?: unknown } | undefined)?.status;
    if (typeof status !== 'string' || !ORDER_STATUSES.includes(status as OrderStatus)) {
      throw new HttpError(400, 'Unknown order status.');
    }
    if (!updateOrderStatusRow(routeParam(req.params.id), status as OrderStatus)) {
      throw new HttpError(404, 'Order not found.');
    }
    res.status(204).end();
  } catch (error) {
    sendError(res, error);
  }
});

/** Manual-payment bookkeeping for one order: tick it off once the money shows up
 *  in the bank/mobile-money account, and/or leave a note for whoever fulfils it. */
app.put('/api/orders/:id/payment', requireAdmin, requirePermission('orders.manage'), (req, res) => {
  try {
    const body = (req.body ?? {}) as { confirmed?: unknown; note?: unknown };
    const patch: { confirmed?: boolean; note?: string } = {};
    if (body.confirmed !== undefined) {
      if (typeof body.confirmed !== 'boolean') {
        throw new HttpError(400, 'confirmed must be true or false.');
      }
      patch.confirmed = body.confirmed;
    }
    if (body.note !== undefined) {
      if (typeof body.note !== 'string') throw new HttpError(400, 'note must be text.');
      patch.note = body.note.trim();
    }
    if (patch.confirmed === undefined && patch.note === undefined) {
      throw new HttpError(400, 'Nothing to update.');
    }
    const updated = updateOrderPaymentNote(routeParam(req.params.id), patch);
    if (!updated) throw new HttpError(404, 'Order not found.');
    res.json(updated);
  } catch (error) {
    sendError(res, error);
  }
});

/** Validates the admin-editable fields of an order. Anything not listed here
 *  (reference, lines, total, payment snapshot) is owned by checkout and is left
 *  alone, so a hand edit can correct a phone number but never invent a price. */
const readOrderEditBody = (body: unknown): Partial<Order> => {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid order payload.');
  const draft = body as Record<string, unknown>;
  const patch: Partial<Order> = {};
  const text = (key: 'customerName' | 'customerEmail' | 'customerPhone' | 'shippingAddress') => {
    if (draft[key] === undefined) return;
    if (typeof draft[key] !== 'string') throw new HttpError(400, `${key} must be text.`);
    patch[key] = (draft[key] as string).trim();
  };
  text('customerName');
  text('customerEmail');
  text('customerPhone');
  text('shippingAddress');

  if (draft.status !== undefined) {
    if (typeof draft.status !== 'string' || !ORDER_STATUSES.includes(draft.status as OrderStatus)) {
      throw new HttpError(400, 'Unknown order status.');
    }
    patch.status = draft.status as OrderStatus;
  }
  if (draft.paymentConfirmed !== undefined) {
    if (typeof draft.paymentConfirmed !== 'boolean') {
      throw new HttpError(400, 'paymentConfirmed must be true or false.');
    }
    patch.paymentConfirmed = draft.paymentConfirmed;
  }
  if (draft.paymentNote !== undefined) {
    if (typeof draft.paymentNote !== 'string') throw new HttpError(400, 'paymentNote must be text.');
    patch.paymentNote = draft.paymentNote.trim();
  }
  return patch;
};

/** Admin → Database: edit one order's customer details, status and payment
 *  bookkeeping in place. */
app.put('/api/orders/:id', requireAdmin, requirePermission('orders.editRecords'), (req, res) => {
  try {
    const patch = readOrderEditBody(req.body);
    if (Object.keys(patch).length === 0) throw new HttpError(400, 'Nothing to update.');
    const updated = updateOrderFields(routeParam(req.params.id), patch);
    if (!updated) throw new HttpError(404, 'Order not found.');
    res.json(updated);
  } catch (error) {
    sendError(res, error);
  }
});

/** Admin → Database: delete a single order. */
app.delete('/api/orders/:id', requireAdmin, requirePermission('orders.editRecords'), (req, res) => {
  try {
    if (!removeOrder(routeParam(req.params.id))) throw new HttpError(404, 'Order not found.');
    res.status(204).end();
  } catch (error) {
    sendError(res, error);
  }
});

/** Admin → Database: record an order taken outside the site (phone, WhatsApp,
 *  in person). Runs through the same `createOrder` transaction as checkout, so
 *  prices come from the database, stock is decremented and the FAS-###### style
 *  reference is generated and checked for uniqueness — an admin entry is
 *  indistinguishable from a web one. Payment is optional: an order taken by
 *  phone may be settled however the shop agrees, so the payment-system switches
 *  do not apply here. */
app.post('/api/admin/orders', requireAdmin, requirePermission('orders.editRecords'), (req, res) => {
  try {
    const body = (req.body ?? {}) as {
      name?: unknown;
      email?: unknown;
      phone?: unknown;
      address?: unknown;
      status?: unknown;
      paymentNote?: unknown;
      lines?: unknown;
    };
    const details = {
      name: typeof body.name === 'string' ? body.name.trim() : '',
      email: typeof body.email === 'string' ? body.email.trim() : '',
      phone: typeof body.phone === 'string' ? body.phone.trim() : '',
      address: typeof body.address === 'string' ? body.address.trim() : '',
    };
    if (!details.name) throw new HttpError(400, 'Customer name is required.');
    if (details.email && !/^\S+@\S+\.\S+$/.test(details.email)) {
      throw new HttpError(400, 'Please enter a valid email address.');
    }

    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    const requested: RequestedLine[] = rawLines
      .filter((l): l is Record<string, unknown> => Boolean(l) && typeof l === 'object')
      .map((l) => ({
        productId: typeof l.productId === 'string' ? l.productId : '',
        variantId: typeof l.variantId === 'string' ? l.variantId : null,
        quantity:
          typeof l.quantity === 'number' && Number.isFinite(l.quantity)
            ? Math.max(1, Math.floor(l.quantity))
            : 0,
      }))
      .filter((l) => l.productId.length > 0 && l.quantity > 0);

    const order = createOrder(details, undefined, requested);
    // Status and the admin note are applied after creation: `createOrder` always
    // files a new order as `pending`, and an offline order is often already
    // dispatched by the time it is written down.
    if (
      (typeof body.status === 'string' && ORDER_STATUSES.includes(body.status as OrderStatus)) ||
      typeof body.paymentNote === 'string'
    ) {
      const patch: Partial<Order> = {};
      if (typeof body.status === 'string' && ORDER_STATUSES.includes(body.status as OrderStatus)) {
        patch.status = body.status as OrderStatus;
      }
      if (typeof body.paymentNote === 'string') patch.paymentNote = body.paymentNote.trim();
      const updated = updateOrderFields(order.id, patch);
      if (updated) return res.status(201).json(updated);
    }
    res.status(201).json(order);
  } catch (error) {
    sendError(res, error);
  }
});

interface RequestedLine {
  productId: string;
  variantId: string | null;
  quantity: number;
}

interface ResolvedLine {
  product: Product;
  variant: Product['variants'][number] | null;
  quantity: number;
  /** Null for a price-on-enquiry listing; charged as 0 on the order. */
  unitPrice: number | null;
}

const PAYMENT_METHODS: PaymentMethod[] = ['bankTransfer', 'mobileMoney', 'payOnDelivery'];

/**
 * Validates the shopper's payment choice against the methods the admin has
 * enabled and snapshots the receiving account onto the order.
 *
 * Nothing here moves money — every method is settled by hand (a bank transfer,
 * a mobile-money send, or cash on the doorstep) and confirmed later in
 * Admin → Orders. The store's own details are copied from the settings at
 * order time so an old order keeps showing where it was asked to pay.
 *
 * The master switch (`payments.status`) decides how much is required:
 *  - `active`   — a valid method is REQUIRED.
 *  - `hide`     — optional: no choice is fine (returns undefined), but anything
 *                 sent is still validated the same way.
 *  - `inactive` — the store is not taking orders at all (403).
 *
 * On top of that every method has its OWN switch (only meaningful while the
 * master is `active`): a method set to `inactive` is refused with a 400, one
 * set to `hide` is still honoured so a checkout opened before the admin hid it
 * can complete, and an `active` method is offered as usual.
 */
const readPaymentBody = (raw: unknown, payments: StorePayments): PaymentInfo | undefined => {
  if (payments.status === 'inactive') {
    throw new HttpError(
      403,
      'Payments are switched off on this store right now, so we are not taking orders. Please check back soon.',
    );
  }
  if (payments.status === 'hide' && (raw === undefined || raw === null)) {
    return undefined;
  }
  if (!raw || typeof raw !== 'object') {
    throw new HttpError(400, 'Please choose how you would like to pay.');
  }
  const body = raw as Record<string, unknown>;
  const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
  const method = text(body.method) as PaymentMethod;
  if (!PAYMENT_METHODS.includes(method)) {
    throw new HttpError(400, 'Please choose how you would like to pay.');
  }
  const payerName = text(body.payerName);
  const payerNumber = text(body.payerNumber);
  const transactionRef = text(body.transactionRef);

  // A method's own switch: Inactive is refused outright; Active and Hide both
  // pass (Hide is the grace period described above).
  if (paymentMethodStatus(payments, method) === 'inactive') {
    throw new HttpError(
      400,
      `${PAYMENT_METHOD_LABELS[method]} is not available right now. Please choose another method.`,
    );
  }

  if (method === 'bankTransfer') {
    const bank = payments.bank;
    if (!bank.accountNumber.trim()) {
      throw new HttpError(409, 'Bank transfer is not set up on this store yet. Please choose another method.');
    }
    return {
      method,
      bankName: bank.bankName,
      accountName: bank.accountName,
      accountNumber: bank.accountNumber,
      ...(payerName ? { payerName } : {}),
      // Proof of payment is optional: many shoppers transfer after the order
      // exists (the confirmation screen gives them the reference to pay with).
      ...(transactionRef ? { transactionRef } : {}),
    };
  }

  if (method === 'mobileMoney') {
    const wallets = payments.mobileMoney.filter((w) => w.accountNumber.trim());
    if (wallets.length === 0) {
      throw new HttpError(409, 'Mobile money is not set up on this store yet. Please choose another method.');
    }
    // The checkout select posts the chosen wallet's NUMBER; the label and the
    // network are accepted too so the API stays usable straight from curl. A
    // stale choice is rejected rather than silently recorded against whichever
    // wallet happens to sort first.
    const chosen = text(body.wallet);
    if (!chosen) {
      throw new HttpError(400, 'Choose which mobile-money wallet you are paying into.');
    }
    // Matched by number first (the checkout select posts the wallet's number),
    // then label, then network — so the endpoint also works from curl.
    const wallet =
      wallets.find((w) => w.accountNumber === chosen) ??
      wallets.find((w) => w.label === chosen) ??
      wallets.find((w) => w.network === chosen);
    if (!wallet) {
      throw new HttpError(409, 'That mobile-money wallet is no longer available. Please reopen checkout and pick again.');
    }
    return {
      method,
      network: wallet.network,
      accountName: wallet.accountName,
      accountNumber: wallet.accountNumber,
      ...(payerNumber ? { payerNumber } : {}),
      ...(payerName ? { payerName } : {}),
      ...(transactionRef ? { transactionRef } : {}),
    };
  }

  // Pay on delivery: nothing to record beyond the shopper's own note, if any.
  return { method, ...(payerName ? { payerName } : {}) };
};

/** Creates an order in one transaction: re-validates stock, computes prices
 *  from the database (client prices are never trusted), decrements stock and
 *  inserts the order under a unique FAS-###### reference. Throws HttpError
 *  with the shopper-facing wording the old client used; `db.transaction`
 *  restores the previous state and the file on disk on throw. */
const createOrder = (
  details: { name: string; email: string; phone: string; address: string },
  payment: PaymentInfo | undefined,
  requested: RequestedLine[],
  couponCode?: string,
): Order => {
  const run = withTransaction((): Order => {
    if (requested.length === 0) throw new HttpError(400, 'Your cart is empty.');

    const resolved: ResolvedLine[] = [];
    const shortages: { name: string; available: number }[] = [];

    for (const line of requested) {
      const product = getProduct(line.productId);
      const missing = 'An item in your cart is no longer available. Please update your cart.';
      if (!product) throw new HttpError(409, missing);
      // Services and Jobs are enquiry-only and never reach the cart, so an order
      // naming one is stale or hand-crafted. Refuse it rather than silently
      // filing a $0 line — the shopper needs to be told to get in touch instead.
      if (product.price === null) {
        throw new HttpError(
          409,
          `"${product.name}" is arranged by enquiry, so it cannot be ordered online. Please contact the store directly.`,
        );
      }
      const variant = line.variantId
        ? product.variants.find((v) => v.id === line.variantId) ?? null
        : null;
      if (line.variantId && !variant) throw new HttpError(409, missing);
      const available = variant ? variant.stock : product.stock;
      // `null` availability = stock isn't tracked (a Service or a Job), so any
      // quantity is fine and there is nothing to decrement later.
      if (available !== null && line.quantity > available) {
        shortages.push({ name: product.name, available });
      }
      resolved.push({
        product,
        variant,
        quantity: line.quantity,
        unitPrice: variant ? variant.price : product.price,
      });
    }

    if (shortages.length === 1) {
      const s = shortages[0];
      throw new HttpError(409, `Only ${s.available} of "${s.name}" left. Please update your cart.`);
    }
    if (shortages.length > 1) {
      throw new HttpError(
        409,
        `Not enough stock for: ${shortages.map((s) => s.name).join(', ')}. Please update your cart.`,
      );
    }

    let reference = '';
    do {
      reference = `FAS-${Math.floor(100000 + Math.random() * 899999)}`;
    } while (orderReferenceExists(reference));

    // Discount: the client's preview is never trusted — the code is looked up
    // fresh here, inside the transaction, so a stale/edited/expired code fails
    // the whole order rather than silently charging the wrong amount.
    const subtotal = resolved.reduce(
      (sum, entry) => sum + chargeablePrice(entry.unitPrice) * entry.quantity,
      0,
    );
    let discount = 0;
    const appliedCode = couponCode ? normalizeCouponCode(couponCode) : '';
    if (appliedCode) {
      const coupon = getCouponByCode(appliedCode);
      if (!coupon) {
        throw new HttpError(400, `Discount code \"${appliedCode}\" was not found.`);
      }
      const config = getSetting<StoreConfig>('config');
      const problem = couponProblem(coupon, subtotal, (value) =>
        // The message only needs a number + symbol; exact formatting is the
        // checkout's job, this just has to read sensibly in an error.
        `${config?.currency ?? ''}${value}`,
      );
      if (problem) throw new HttpError(400, problem.message);
      discount = couponDiscount(coupon, subtotal);
    }

    const order: Order = {
      id: createId('order'),
      reference,
      createdAt: Date.now(),
      customerName: details.name,
      customerEmail: details.email,
      customerPhone: details.phone,
      shippingAddress: details.address,
      lines: resolved.map((entry) => ({
        name: entry.product.name,
        variantLabel: entry.variant
          ? Object.entries(entry.variant.options)
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ')
          : null,
        // A price-on-enquiry listing is recorded at 0; the deal is agreed
        // separately, so the order total stays a plain number.
        price: chargeablePrice(entry.unitPrice),
        quantity: entry.quantity,
      })),
      total: Math.max(0, Math.round((subtotal - discount) * 100) / 100),
      status: 'pending',
      // Manual methods: recorded here, verified by the admin later. Payment is
      // never trusted for pricing — the total above is computed from the DB.
      // Absent when the payment system is hidden and the shopper picked nothing.
      ...(payment ? { payment } : {}),
      // Snapshots so an old order still shows which code took what off, even
      // after the admin edits or deletes the coupon.
      ...(discount > 0 ? { discount, couponCode: appliedCode } : {}),
    };

    // Decrement stock per product, aggregating lines: one cart can hold a base
    // line plus variant lines of the same product.
    const soldByProduct = new Map<string, { base: number; variants: Map<string, number> }>();
    for (const entry of resolved) {
      let sold = soldByProduct.get(entry.product.id);
      if (!sold) {
        sold = { base: 0, variants: new Map() };
        soldByProduct.set(entry.product.id, sold);
      }
      if (entry.variant) {
        sold.variants.set(entry.variant.id, (sold.variants.get(entry.variant.id) ?? 0) + entry.quantity);
      } else {
        sold.base += entry.quantity;
      }
    }
    for (const [productId, sold] of soldByProduct) {
      const fresh = getProduct(productId);
      if (!fresh) continue;
      // A listing with untracked stock stays null — it is not "none left".
      fresh.stock = fresh.stock === null ? null : Math.max(0, fresh.stock - sold.base);
      fresh.variants = fresh.variants.map((v) => {
        const quantity = sold.variants.get(v.id);
        return quantity ? { ...v, stock: Math.max(0, v.stock - quantity) } : v;
      });
      updateProductData(fresh);
    }

    insertOrder(order);
    return order;
  });
  return run;
};

app.post('/api/orders', (req, res) => {
  try {
    const body = (req.body ?? {}) as {
      name?: unknown;
      email?: unknown;
      phone?: unknown;
      address?: unknown;
      lines?: unknown;
      payment?: unknown;
      couponCode?: unknown;
    };
    const details = {
      name: typeof body.name === 'string' ? body.name.trim() : '',
      email: typeof body.email === 'string' ? body.email.trim() : '',
      phone: typeof body.phone === 'string' ? body.phone.trim() : '',
      address: typeof body.address === 'string' ? body.address.trim() : '',
    };
    if (!details.name || !details.email || !details.phone || !details.address) {
      throw new HttpError(400, 'Please fill in all fields.');
    }
    if (!/^\S+@\S+\.\S+$/.test(details.email)) {
      throw new HttpError(400, 'Please enter a valid email address.');
    }

    // Validated before the transaction so a rejected payment method cannot
    // decrement stock and then roll back.
    const storeConfig = getSetting<StoreConfig>('config');
    const payment = readPaymentBody(body.payment, normalizePayments(storeConfig?.payments));

    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    const requested: RequestedLine[] = rawLines
      .filter((l): l is Record<string, unknown> => Boolean(l) && typeof l === 'object')
      .map((l) => ({
        productId: typeof l.productId === 'string' ? l.productId : '',
        variantId: typeof l.variantId === 'string' ? l.variantId : null,
        quantity:
          typeof l.quantity === 'number' && Number.isFinite(l.quantity)
            ? Math.max(1, Math.floor(l.quantity))
            : 0,
      }))
      .filter((l) => l.productId.length > 0 && l.quantity > 0);

    // A blank string means "no coupon"; anything else is re-validated inside
    // createOrder's transaction (an unknown/expired code aborts with 400).
    const couponCode =
      typeof body.couponCode === 'string' && body.couponCode.trim()
        ? body.couponCode.trim()
        : undefined;

    res.status(201).json(createOrder(details, payment, requested, couponCode));
  } catch (error) {
    sendError(res, error);
  }
});

// ---- database management ---------------------------------------------------

/** Size of a file on disk, or 0 when it does not exist. */
const fileSize = (file: string): number => {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
};

/** Overview of the live store: file size and row counts per collection. The
 *  collection list comes from the server, so it is trusted; counts are
 *  read-only and safe to run while the store is busy. */
const databaseInfo = () => ({
  file: dbFile,
  sizeBytes: fileSize(dbFile),
  // Kept for the client's shape: the JSON store has no write-ahead log.
  walBytes: 0,
  journalMode: 'json',
  pageSize: 4096,
  pageCount: Math.max(1, Math.ceil(fileSize(dbFile) / 4096)),
  freelistPages: 0,
  tables: getDatabaseTables().map(({ name }) => ({
    name,
    rows: getTableRowCount(name).n,
  })),
});

app.get('/api/database', requireAdmin, requirePermission('database.view'), (_req, res) => {
  try {
    res.json(databaseInfo());
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/database/check', requireAdmin, requirePermission('database.manage'), (_req, res) => {
  try {
    const rows = integrityCheck();
    const messages = rows.map((row) => row.integrity_check);
    res.json({ ok: messages.length === 1 && messages[0] === 'ok', messages });
  } catch (error) {
    sendError(res, error);
  }
});

/** Rewrites the file compactly (reclaiming the space a purge left behind).
 *  The data itself never changes — safe to run while shoppers are browsing. */
app.post('/api/database/optimize', requireAdmin, requirePermission('database.manage'), (_req, res) => {
  try {
    vacuum();
    optimize();
    res.json(databaseInfo());
  } catch (error) {
    sendError(res, error);
  }
});

/** Downloads a consistent copy of the live database. The JSON store's
 *  A file copy captures everything committed so far, so the
 *  backup is safe to take while the store is running. Restore by stopping the
 *  server and replacing `store.json` with the downloaded file. */
app.get('/api/database/backup', requireAdmin, requirePermission('database.manage'), (_req, res) => {
  try {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const destination = path.join(dataDir, `store-backup-${stamp}.json`);
    fs.rmSync(destination, { force: true });
    vacuumInto(destination);
    res.download(destination, `store-backup-${stamp}.json`, (error) => {
      // Remove the temp copy once it has been streamed — or immediately when
      // the transfer failed, so a broken attempt litters nothing.
      try {
        fs.rmSync(destination, { force: true });
      } catch (cleanupError) {
        console.error('[server] Could not remove backup temp file:', cleanupError);
      }
      if (error && !res.headersSent) sendError(res, error);
    });
  } catch (error) {
    sendError(res, error);
  }
});

/** Purges the entire order book in one statement. Products, settings, admin
 *  credentials and sessions are left alone — this is the Database tab's
 *  "remove order history" action (Settings → Data still offers a full reset). */
app.delete('/api/orders', requireAdmin, requirePermission('database.manage'), (_req, res) => {
  try {
    clearOrders();
    res.json({ cleared: 0 });
  } catch (error) {
    sendError(res, error);
  }
});

// ---- auth --------------------------------------------------------------------

/** Looks up an account by email: the owner first (their hash lives in settings,
 *  not the staff table), then any staff row. Returns the scrypt pair either way
 *  so `verifyPassword` works identically for both. */
const findAccount = (email: string): { salt: string; hash: string } | null => {
  const auth = getAdminAuth();
  if (auth && email === auth.email.toLowerCase()) return { salt: auth.salt, hash: auth.hash };
  return verifyStaffCredentials(email);
};

app.post('/api/auth/login', (req, res) => {
  try {
    const body = (req.body ?? {}) as { email?: unknown; password?: unknown };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) throw new HttpError(400, 'Enter your email and password.');

    // Cheap in-memory limiter: 10 failures per email+IP per 15 minutes.
    const key = `${req.ip ?? 'unknown'}|${email}`;
    if (loginBlockedFor(key)) {
      throw new HttpError(429, 'Too many sign-in attempts. Try again in a few minutes.');
    }

    const account = findAccount(email);
    if (!account || !verifyPassword(password, account)) {
      recordLoginFailure(key);
      // Deliberately identical for "no such account" and "wrong password" so the
      // form cannot be used to discover which staff emails exist.
      throw new HttpError(401, 'Those credentials do not match.');
    }
    clearLoginFailures(key);
    const token = createSession(email);
    res.json({ token, user: userFor(email) });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/auth/me', requireAdmin, (_req, res) => {
  res.json({ user: userFor(res.locals.adminEmail as string) });
});

app.post('/api/auth/logout', (req, res) => {
  const token = tokenFrom(req);
  if (token) destroySession(token);
  res.status(204).end();
});

// ---- staff accounts --------------------------------------------------------

/** Reads a permission list off an untrusted body, keeping only known rights and
 *  dropping anything the signed-in admin is not allowed to hand out. Without the
 *  second check a `staff.manage` holder could grant themselves `data.reset`. */
const readPermissionsBody = (body: unknown, res: Response): Permission[] => {
  const raw = (body ?? {}) as { permissions?: unknown };
  if (!Array.isArray(raw.permissions)) {
    throw new HttpError(400, 'Choose at least one right for this account.');
  }
  const grantable = new Set<Permission>(
    (userFor(res.locals.adminEmail as string).grantablePermissions ?? []) as Permission[],
  );
  const requested = raw.permissions.filter(
    (p): p is Permission => typeof p === 'string' && (ALL_PERMISSIONS as readonly string[]).includes(p),
  );
  return requested.filter((p) => grantable.has(p));
};

const validEmail = (value: unknown): string => {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  return email;
};

app.get('/api/staff', requireAdmin, requirePermission('staff.manage'), (_req, res) => {
  try {
    res.json({ staff: listStaff(), owner: userFor(getAdminAuth()?.email ?? '') });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/staff', requireAdmin, requirePermission('staff.manage'), (req, res) => {
  try {
    const body = (req.body ?? {}) as { email?: unknown; password?: unknown };
    const email = validEmail(body.email);
    if (isOwnerEmail(email)) {
      throw new HttpError(409, 'That email is already the store owner account.');
    }
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < 8) {
      throw new HttpError(400, 'Give this person a password of at least 8 characters.');
    }
    const permissions = readPermissionsBody(req.body, res);
    if (permissions.length === 0) {
      throw new HttpError(400, 'Choose at least one right for this account.');
    }
    res.status(201).json({ member: createStaff({ email, password, permissions }) });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      sendError(res, new HttpError(409, error.message));
      return;
    }
    sendError(res, error);
  }
});

app.put('/api/staff/:email', requireAdmin, requirePermission('staff.manage'), (req, res) => {
  try {
    const email = validEmail(routeParam(req.params.email));
    if (isOwnerEmail(email)) {
      throw new HttpError(403, 'The owner account always holds every right and cannot be changed here.');
    }
    const body = (req.body ?? {}) as { permissions?: unknown; password?: unknown };
    // An omitted `permissions` key means "leave the rights alone"; an empty or
    // all-rejected list means "no rights", which is refused so an account can
    // never be left unable to sign in and be locked out of being re-enabled.
    const patch: { permissions?: Permission[]; password?: string } = {};
    if (body.permissions !== undefined) {
      const permissions = readPermissionsBody(req.body, res);
      if (permissions.length === 0) {
        throw new HttpError(400, 'This account needs at least one right to be useful.');
      }
      patch.permissions = permissions;
    }
    const password = typeof body.password === 'string' ? body.password : '';
    if (password !== '') {
      if (password.length < 8) {
        throw new HttpError(400, 'Give this person a password of at least 8 characters.');
      }
      patch.password = password;
    }
    const member = updateStaff(email, patch);
    if (!member) throw new HttpError(404, 'That staff account no longer exists.');
    // Rights changed: drop their live sessions so the new limits apply at once
    // rather than whenever their current token expires.
    destroySessionsFor(email);
    res.json({ member });
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/staff/:email', requireAdmin, requirePermission('staff.manage'), (req, res) => {
  try {
    const email = validEmail(routeParam(req.params.email));
    if (!deleteStaff(email)) {
      throw new HttpError(404, 'That staff account no longer exists.');
    }
    res.status(204).end();
  } catch (error) {
    sendError(res, error);
  }
});

// ---- coupons ---------------------------------------------------------------

/** Reads and validates a coupon body off the network. Admin writes the code in
 *  any case; it is stored normalised so the shopper's input always matches and
 *  the UNIQUE index holds. Percent values are clamped to 0–100; a fixed value
 *  may not be negative. */
const readCouponBody = (body: unknown): Omit<Coupon, 'id' | 'createdAt'> => {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid discount code payload.');
  const draft = body as Partial<Coupon>;
  const code = typeof draft.code === 'string' ? normalizeCouponCode(draft.code) : '';
  if (!code) throw new HttpError(400, 'Give the discount code a code.');
  const kind: CouponKind = draft.kind === 'fixed' ? 'fixed' : 'percent';
  const rawValue = typeof draft.value === 'number' && Number.isFinite(draft.value) ? draft.value : NaN;
  if (Number.isNaN(rawValue) || rawValue < 0) {
    throw new HttpError(400, 'Enter a discount value of 0 or more.');
  }
  if (kind === 'percent' && rawValue > 100) {
    throw new HttpError(400, 'A percentage discount cannot exceed 100%.');
  }
  const value = Math.round(rawValue * 100) / 100;
  const minSubtotal =
    typeof draft.minSubtotal === 'number' && Number.isFinite(draft.minSubtotal)
      ? Math.max(0, draft.minSubtotal)
      : 0;
  const expiresAt =
    typeof draft.expiresAt === 'number' && Number.isFinite(draft.expiresAt) ? draft.expiresAt : null;
  return { code, kind, value, minSubtotal, expiresAt, active: draft.active !== false };
};

app.get('/api/coupons', requireAdmin, requirePermission('coupons.manage'), (_req, res) => {
  try {
    res.json({ coupons: allCoupons() });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/coupons', requireAdmin, requirePermission('coupons.manage'), (req, res) => {
  try {
    const fields = readCouponBody(req.body);
    if (getCouponByCode(fields.code)) {
      throw new HttpError(409, `The code "${fields.code}" already exists.`);
    }
    const coupon: Coupon = { id: createId('coupon'), createdAt: Date.now(), ...fields };
    insertCoupon(coupon);
    res.status(201).json({ coupon });
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
      sendError(res, new HttpError(409, 'That code already exists.'));
      return;
    }
    sendError(res, error);
  }
});

app.put('/api/coupons/:id', requireAdmin, requirePermission('coupons.manage'), (req, res) => {
  try {
    const id = routeParam(req.params.id);
    const existing = getCoupon(id);
    if (!existing) throw new HttpError(404, 'That discount code no longer exists.');
    const fields = readCouponBody(req.body);
    // The code may be renamed, but not onto one that already belongs to another id.
    if (fields.code !== existing.code && getCouponByCode(fields.code)) {
      throw new HttpError(409, `The code "${fields.code}" already exists.`);
    }
    const coupon: Coupon = { ...existing, ...fields };
    updateCouponRow(coupon);
    res.json({ coupon });
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
      sendError(res, new HttpError(409, 'That code already exists.'));
      return;
    }
    sendError(res, error);
  }
});

app.delete('/api/coupons/:id', requireAdmin, requirePermission('coupons.manage'), (req, res) => {
  try {
    const id = routeParam(req.params.id);
    if (!removeCoupon(id)) {
      throw new HttpError(404, 'That discount code no longer exists.');
    }
    res.status(204).end();
  } catch (error) {
    sendError(res, error);
  }
});

// Public: the checkout previews a code as the shopper types, then again at
// checkout where the server recomputes it — the response here is advisory only
// and never trusted for pricing.
app.post('/api/coupons/validate', (req, res) => {
  try {
    const body = (req.body ?? {}) as { code?: unknown; subtotal?: unknown };
    const code = typeof body.code === 'string' ? normalizeCouponCode(body.code) : '';
    if (!code) throw new HttpError(400, 'Enter a discount code.');
    const subtotal =
      typeof body.subtotal === 'number' && Number.isFinite(body.subtotal) ? body.subtotal : 0;
    const coupon = getCouponByCode(code);
    if (!coupon) throw new HttpError(400, `Discount code "${code}" was not found.`);
    const config = getSetting<StoreConfig>('config');
    const problem = couponProblem(coupon, subtotal, (value) => `${config?.currency ?? ''}${value}`);
    if (problem) throw new HttpError(400, problem.message);
    res.json({ code, discount: couponDiscount(coupon, subtotal) });
  } catch (error) {
    sendError(res, error);
  }
});


// ---- order tracking --------------------------------------------------------

// Public: a shopper checks where their order stands by giving the FAS-######
// reference plus the email or phone they ordered with. Only a safe subset of the
// order is returned — nothing the shopper did not already provide. The failure
// message is deliberately vague ("could not find") so the endpoint cannot be
// used to enumerate which references exist.
app.post('/api/orders/track', (req, res) => {
  try {
    const body = (req.body ?? {}) as { reference?: unknown; email?: unknown; phone?: unknown };
    const reference = typeof body.reference === 'string' ? body.reference.trim().toUpperCase() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (!reference || (!email && !phone)) {
      throw new HttpError(400, 'Enter your order reference and the email or phone you used.');
    }
    const order = getOrderByReference(reference);
    const matched =
      order &&
      ((email && order.customerEmail.trim().toLowerCase() === email) ||
        (phone && order.customerPhone.trim() === phone));
    if (!order || !matched) throw new HttpError(404, 'We could not find an order with those details.');
    const tracked: TrackedOrder = {
      reference: order.reference,
      createdAt: order.createdAt,
      status: order.status,
      customerName: order.customerName,
      lines: order.lines,
      total: order.total,
      ...(order.discount !== undefined ? { discount: order.discount } : {}),
      ...(order.couponCode !== undefined ? { couponCode: order.couponCode } : {}),
      ...(order.payment
        ? { paymentMethod: order.payment.method, paymentConfirmed: order.paymentConfirmed }
        : {}),
    };
    res.json({ order: tracked });
  } catch (error) {
    sendError(res, error);
  }
});

// ---- reviews ---------------------------------------------------------------

/** Public: approved reviews for one product, newest first. A shopper never
 *  sees a review that has not been approved yet. */
app.get('/api/products/:id/reviews', (req, res) => {
  try {
    const id = routeParam(req.params.id);
    if (!getProduct(id)) throw new HttpError(404, 'That product no longer exists.');
    const reviews = allReviews(id).filter((r) => r.status === 'approved');
    res.json({ reviews });
  } catch (error) {
    sendError(res, error);
  }
});

/** Public: submit a review; it lands as `pending` until an admin approves it. */
app.post('/api/products/:id/reviews', (req, res) => {
  try {
    const productId = routeParam(req.params.id);
    if (!getProduct(productId)) throw new HttpError(404, 'That product no longer exists.');

    const body = (req.body ?? {}) as Partial<ProductReview>;
    const author = typeof body.author === 'string' ? body.author.trim() : '';
    if (!author) throw new HttpError(400, 'Tell us your name.');
    const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
    if (comment.length < 4) throw new HttpError(400, 'Please write a little more in your review.');
    const rating = typeof body.rating === 'number' ? Math.round(body.rating) : NaN;
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new HttpError(400, 'Choose a rating from 1 to 5 stars.');
    }

    const review: ProductReview = {
      id: createId('review'),
      productId,
      author,
      rating,
      comment,
      createdAt: Date.now(),
      status: 'pending',
    };
    insertReview(review);
    res.status(201).json({ review });
  } catch (error) {
    sendError(res, error);
  }
});

/** Public: approved-review aggregates for every product, so product cards can
 *  show a star badge without one request per product. */
app.get('/api/reviews/summary', (_req, res) => {
  try {
    res.json(reviewSummaries());
  } catch (error) {
    sendError(res, error);
  }
});

/** Moderating reviews uses `orders.editRecords` — the same right that edits and
 *  deletes order records — so a clerk who maintains records can also approve or
 *  remove reviews. The UI hides the reviews moderation controls without it. */
app.get('/api/reviews', requireAdmin, requirePermission('orders.editRecords'), (_req, res) => {
  try {
    res.json({ reviews: allReviews() });
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/reviews/:id', requireAdmin, requirePermission('orders.editRecords'), (req, res) => {
  try {
    const id = routeParam(req.params.id);
    const { status } = (req.body ?? {}) as { status?: unknown };
    if (status !== 'pending' && status !== 'approved') {
      throw new HttpError(400, 'A review can only be set to pending or approved.');
    }
    if (!updateReviewStatusRow(id, status)) {
      throw new HttpError(404, 'That review no longer exists.');
    }
    res.json({ review: getReview(id) });
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/reviews/:id', requireAdmin, requirePermission('orders.editRecords'), (req, res) => {
  try {
    const id = routeParam(req.params.id);
    if (!removeReview(id)) {
      throw new HttpError(404, 'That review no longer exists.');
    }
    res.status(204).end();
  } catch (error) {
    sendError(res, error);
  }
});


// ---- import / reset ----------------------------------------------------------

/**
 * Full snapshot built server-side: config + products + orders + coupons +
 * reviews + staff MEMBERSHIP (email + rights, never password hashes). The
 * admin export button calls this so the downloaded file actually carries the
 * whole store — the client-side snapshot builder only ever sees the catalogue
 * it has loaded and can never see the staff table.
 */
app.get('/api/export', requireAdmin, requirePermission('data.import'), (_req, res) => {
  try {
    const config = getSetting<StoreConfig>('config');
    if (!config) throw new HttpError(500, 'Store settings are missing.');
    const snapshot: StoreSnapshot = {
      version: 1,
      exportedAt: new Date().toISOString(),
      config: { ...config, adminPassword: '' },
      products: allProducts(),
      orders: allOrders(),
      coupons: allCoupons(),
      reviews: allReviews(),
      staff: listStaff().map((m) => ({
        email: m.email,
        permissions: [...m.permissions],
        createdAt: m.createdAt,
      })),
    };
    res.json(snapshot);
  } catch (error) {
    sendError(res, error);
  }
});

/** Applies an uploaded snapshot wholesale, validating like the old client
 *  parser did. `adminPassword` found in the file is ignored — credentials
 *  stay under server control.
 *
 *  `coupons` / `reviews` replace their tables only when the key is PRESENT
 *  (missing on old snapshots means "leave alone", never "wipe"). `staff`
 *  upserts membership only — password hashes never travel in a file, so a new
 *  address arrives locked until the owner sets a password, and an existing
 *  login keeps signing in. */
app.post('/api/import', requireAdmin, requirePermission('data.import'), (req, res) => {
  try {
    const snapshot = (req.body ?? {}) as Partial<StoreSnapshot>;
    if (snapshot.version !== 1) throw new HttpError(400, 'Unsupported file version.');
    if (
      !snapshot.config ||
      typeof snapshot.config !== 'object' ||
      typeof snapshot.config.storeName !== 'string'
    ) {
      throw new HttpError(400, 'The file is missing store settings.');
    }
    if (!Array.isArray(snapshot.products)) {
      throw new HttpError(400, 'The file has an invalid product list.');
    }

    const config: StoreConfig = {
      ...DEFAULT_CONFIG,
      ...snapshot.config,
      colors: { ...DEFAULT_CONFIG.colors, ...(snapshot.config.colors ?? {}) },
      // Older exports have no `payments` block — fill it with the defaults.
      payments: normalizePayments(snapshot.config.payments ?? DEFAULT_CONFIG.payments),
      adminPassword: '',
    };
    const products = normalizeProducts(
      (snapshot.products as unknown[]).filter(
        (p): p is Product =>
          Boolean(p) &&
          typeof p === 'object' &&
          typeof (p as Product).id === 'string' &&
          typeof (p as Product).name === 'string',
      ),
    );
    const orders = (Array.isArray(snapshot.orders) ? snapshot.orders : []).filter(
      (o): o is Order =>
        Boolean(o) &&
        typeof (o as Order).id === 'string' &&
        typeof (o as Order).reference === 'string',
    );
    // Optional collections — normalised here so a hand-edited file cannot
    // smuggle an invalid row past the table writers.
    const coupons = snapshot.coupons !== undefined ? normalizeCoupons(snapshot.coupons) : null;
    const reviews = snapshot.reviews !== undefined ? normalizeReviews(snapshot.reviews) : null;
    const staff = snapshot.staff !== undefined ? normalizeStaffSnapshot(snapshot.staff) : null;

    withTransaction(() => {
      replaceProducts(products);
      replaceOrders(orders);
      if (coupons !== null) replaceCoupons(coupons);
      if (reviews !== null) replaceReviews(reviews);
      setSetting('config', config);
    });
    // Staff membership syncs outside the catalogue transaction: it touches a
    // different table with its own transaction and its own no-delete rule.
    const staffSync =
      staff !== null
        ? syncStaffMembership(
            staff.map((s) => ({ email: s.email, permissions: [...s.permissions], createdAt: s.createdAt })),
          )
        : { created: [] as string[], updated: [] as string[], skipped: [] as string[] };

    res.json({
      config: { ...config, adminPassword: '' },
      products: allProducts(),
      orders: allOrders(),
      staffSync,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
      sendError(res, new HttpError(400, 'The file contains duplicate order references.'));
      return;
    }
    sendError(res, error);
  }
});

app.post('/api/reset', requireAdmin, requirePermission('data.reset'), (_req, res) => {
  try {
    withTransaction(() => {
      setSetting('config', DEFAULT_CONFIG);
      seedProducts();
      clearOrders();
    });
    res.json({
      config: { ...DEFAULT_CONFIG, adminPassword: '' },
      products: allProducts(),
      orders: [],
    });
  } catch (error) {
    sendError(res, error);
  }
});

// ---- unknown API routes + built SPA -------------------------------------------

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

const distDir = path.join(rootDir, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA fallback: the app's routes all live under index.html (hash routing),
  // so serving it for unknown GETs keeps reloads and shared deep links working
  // when this server is the only thing running (production).
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.sendFile(path.join(distDir, 'index.html'));
      return;
    }
    next();
  });
}

// Body-parser and unexpected errors as JSON, never an HTML stack page.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const error = err as { type?: string };
  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON body.' });
    return;
  }
  if (error?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Payload too large.' });
    return;
  }
  console.error('[server] unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`[server] Store API on http://localhost:${port} — database: ${dbFile}`);
  console.log(`[server] Admin account: ${getAdminAuth()?.email ?? '(unset)'}`);
  if (!fs.existsSync(distDir)) {
    console.log('[server] dist/ not built — `npm run build` first to serve the frontend from here too.');
  }
});


