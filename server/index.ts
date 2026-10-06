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
  Order,
  OrderStatus,
  PaymentInfo,
  PaymentMethod,
  Permission,
  Product,
  StoreConfig,
  StorePayments,
  StoreSnapshot,
} from '../types';
import { ALL_PERMISSIONS } from '../types';
import { PAYMENT_METHOD_LABELS, paymentMethodStatus } from '../lib/payments';
import { createId, normalizeProduct, normalizeProducts } from '../lib/storage';
import { chargeablePrice } from '../lib/product';
import {
  allOrders,
  allProducts,
  clearOrders,
  dataDir,
  db,
  dbFile,
  DEFAULT_CONFIG,
  getProduct,
  getSetting,
  insertOrder,
  insertProduct,
  orderReferenceExists,
  removeOrder,
  removeProduct,
  replaceOrders,
  replaceProducts,
  seedProducts,
  setSetting,
  updateOrderFields,
  updateOrderPaymentNote,
  updateOrderStatusRow,
  updateProductData,
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
 *  with the shopper-facing wording the old client used; better-sqlite3 rolls
 *  the whole transaction back on throw. */
const createOrder = (
  details: { name: string; email: string; phone: string; address: string },
  payment: PaymentInfo | undefined,
  requested: RequestedLine[],
): Order => {
  const run = db.transaction((): Order => {
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
      total: resolved.reduce((sum, entry) => sum + chargeablePrice(entry.unitPrice) * entry.quantity, 0),
      status: 'pending',
      // Manual methods: recorded here, verified by the admin later. Payment is
      // never trusted for pricing — the total above is computed from the DB.
      // Absent when the payment system is hidden and the shopper picked nothing.
      ...(payment ? { payment } : {}),
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
  return run();
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

    res.status(201).json(createOrder(details, payment, requested));
  } catch (error) {
    sendError(res, error);
  }
});

// ---- database management ---------------------------------------------------

/** Size of a file on disk, or 0 when it does not exist (e.g. a clean WAL). */
const fileSize = (file: string): number => {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
};

/** Overview of the live database: file sizes, page stats and row counts per
 *  table. Table names come from `sqlite_master`, so they are server-trusted;
 *  counts are read-only and safe to run while the store is busy. */
const databaseInfo = () => ({
  file: dbFile,
  sizeBytes: fileSize(dbFile),
  walBytes: fileSize(`${dbFile}-wal`),
  journalMode: String(db.pragma('journal_mode', { simple: true })),
  pageSize: Number(db.pragma('page_size', { simple: true })),
  pageCount: Number(db.pragma('page_count', { simple: true })),
  freelistPages: Number(db.pragma('freelist_count', { simple: true })),
  tables: (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map(({ name }) => ({
    name,
    rows: Number((db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get() as { n: number }).n),
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
    const rows = db.pragma('integrity_check') as { integrity_check: string }[];
    const messages = rows.map((row) => row.integrity_check);
    res.json({ ok: messages.length === 1 && messages[0] === 'ok', messages });
  } catch (error) {
    sendError(res, error);
  }
});

/** VACUUM rebuilds the file compactly (reclaiming pages freed by deletes such
 *  as a purge) and `PRAGMA optimize` refreshes query-planner statistics. It
 *  never touches the data itself — safe to run while shoppers are browsing. */
app.post('/api/database/optimize', requireAdmin, requirePermission('database.manage'), (_req, res) => {
  try {
    db.exec('VACUUM');
    db.pragma('optimize');
    res.json(databaseInfo());
  } catch (error) {
    sendError(res, error);
  }
});

/** Downloads a consistent copy of the live database. `VACUUM INTO` writes a
 *  fresh, compacted file with everything committed so far (the WAL is folded
 *  in), so the backup is safe to take while the store is running. Restore by
 *  stopping the server and replacing `store.db` with the downloaded file. */
app.get('/api/database/backup', requireAdmin, requirePermission('database.manage'), (_req, res) => {
  try {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const destination = path.join(dataDir, `store-backup-${stamp}.db`);
    fs.rmSync(destination, { force: true });
    db.exec(`VACUUM INTO '${destination.replace(/'/g, "''")}'`);
    res.download(destination, `store-backup-${stamp}.db`, (error) => {
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
    const { changes } = db.prepare('DELETE FROM orders').run();
    res.json({ cleared: Number(changes) });
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

// ---- import / reset ----------------------------------------------------------

/** Applies an uploaded snapshot wholesale, validating like the old client
 *  parser did. `adminPassword` found in the file is ignored — credentials
 *  stay under server control. */
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

    db.transaction(() => {
      replaceProducts(products);
      replaceOrders(orders);
      setSetting('config', config);
    })();

    res.json({
      config: { ...config, adminPassword: '' },
      products: allProducts(),
      orders: allOrders(),
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
    db.transaction(() => {
      setSetting('config', DEFAULT_CONFIG);
      seedProducts();
      clearOrders();
    })();
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


