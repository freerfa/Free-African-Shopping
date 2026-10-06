import type { Order, Product, StoreConfig, StoreSnapshot } from '../types';

const PREFIX = 'fas:';

export const STORAGE_KEYS = {
  config: `${PREFIX}config`,
  products: `${PREFIX}products`,
  cart: `${PREFIX}cart`,
  orders: `${PREFIX}orders`,
  session: `${PREFIX}session`,
  /** Admin bearer token for the REST API. The only key the app still writes
   *  besides `cart` — config/products/orders now live in the server database
   *  (the older keys are left in place so pre-migration data stays readable
   *  for the Admin → Import migration path documented in README.md). */
  authToken: `${PREFIX}authToken`,
} as const;

export const createId = (prefix = 'id'): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const loadState = <T,>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (error) {
    console.warn(`[storage] Could not read "${key}"; using fallback.`, error);
    return fallback;
  }
};

/** Returns false when the write failed (typically a full storage quota) so
    callers — notably product saves carrying photo data URLs — can tell the
    user instead of silently losing the change on the next reload. */
export const saveState = <T,>(key: string, value: T): boolean => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`[storage] Could not write "${key}".`, error);
    return false;
  }
};

export const createSnapshot = (
  config: StoreConfig,
  products: Product[],
  orders: Order[],
): StoreSnapshot => ({
  version: 1,
  exportedAt: new Date().toISOString(),
  config,
  products,
  orders,
});

export const downloadSnapshot = (snapshot: StoreSnapshot, filename: string): void => {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/** Repairs a product loaded from storage or a snapshot file. Older builds wrote
    records without `variants` (our own seed data did), and any view touching
    `product.variants.length` throws on those — the admin panel screens every
    product, drafts included, so stale entries blanked that view behind the
    ErrorBoundary while the storefront, which only renders live products,
    kept working.

    `price` and `stock` are nullable: `null` is a deliberate value for a Service
    or a Job (price agreed per enquiry, stock not tracked), so it is preserved.
    Only values of the wrong *type* are repaired, which leaves every existing
    numeric record exactly as it was. */
export const normalizeProduct = (raw: Product): Product => {
  const price =
    raw.price === null
      ? null
      : typeof raw.price === 'number' && Number.isFinite(raw.price)
        ? raw.price
        : 0;
  const stock =
    raw.stock === null
      ? null
      : typeof raw.stock === 'number' && raw.stock >= 0
        ? raw.stock
        : 0;
  const variants = (Array.isArray(raw.variants) ? raw.variants : [])
    .filter((v) => Boolean(v) && typeof v === 'object')
    .map((v) => ({
      id: typeof v.id === 'string' && v.id.length > 0 ? v.id : createId('variant'),
      options:
        v.options && typeof v.options === 'object'
          ? Object.fromEntries(
              Object.entries(v.options).filter(([, value]) => typeof value === 'string'),
            )
          : {},
      // A variant with no usable price falls back to the product's; a
      // price-on-enquiry product has none, so the variant is 0 too.
      price: typeof v.price === 'number' && Number.isFinite(v.price) ? v.price : (price ?? 0),
      stock: typeof v.stock === 'number' && v.stock >= 0 ? v.stock : 0,
      sku: typeof v.sku === 'string' ? v.sku : '',
    }));

  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : 'Untitled product',
    description: typeof raw.description === 'string' ? raw.description : '',
    price,
    compareAtPrice:
      typeof raw.compareAtPrice === 'number' && Number.isFinite(raw.compareAtPrice)
        ? raw.compareAtPrice
        : null,
    images: Array.isArray(raw.images) ? raw.images.filter((src) => typeof src === 'string') : [],
    category: typeof raw.category === 'string' ? raw.category : '',
    sku: typeof raw.sku === 'string' ? raw.sku : '',
    stock,
    variants,
    // Contact details are per-listing and only surfaced for Services/Jobs.
    // Absent on every record written before this field existed, and blank is a
    // real choice ("use the store-wide details"), so both normalise to ''.
    contactName: typeof raw.contactName === 'string' ? raw.contactName : '',
    contactPhone: typeof raw.contactPhone === 'string' ? raw.contactPhone : '',
    contactEmail: typeof raw.contactEmail === 'string' ? raw.contactEmail : '',
    // Anything that isn't the known draft value becomes live, matching the
    // pre-variants default where every saved product was published.
    status: raw.status === 'draft' ? 'draft' : 'live',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
  };
};

/** Normalises a whole list; tolerates a non-array (corrupt storage) input. */
export const normalizeProducts = (list: Product[]): Product[] =>
  Array.isArray(list) ? list.filter(Boolean).map(normalizeProduct) : [];

const isProductArray = (value: unknown): value is Product[] =>
  Array.isArray(value) &&
  value.every(
    (p) =>
      p &&
      typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      // `null` is valid: a Service or a Job has no fixed price.
      (typeof p.price === 'number' || p.price === null),
  );

/** Returns the snapshot, or a human-readable reason for rejecting it. */
export const parseSnapshot = (raw: string): { ok: true; snapshot: StoreSnapshot } | { ok: false; error: string } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Unexpected file contents.' };

  const candidate = parsed as Partial<StoreSnapshot>;
  if (candidate.version !== 1) return { ok: false, error: 'Unsupported file version.' };
  if (!isProductArray(candidate.products)) return { ok: false, error: 'The file has an invalid product list.' };
  if (!candidate.config || typeof candidate.config !== 'object' || typeof candidate.config.storeName !== 'string') {
    return { ok: false, error: 'The file is missing store settings.' };
  }

  return {
    ok: true,
    snapshot: {
      version: 1,
      exportedAt: candidate.exportedAt ?? new Date().toISOString(),
      config: candidate.config,
      products: normalizeProducts(candidate.products),
      orders: Array.isArray(candidate.orders) ? candidate.orders : [],
    },
  };
};

export const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
