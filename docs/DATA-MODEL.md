# Data model

Two layers: the **JSON file** on disk, and the **TypeScript shapes** in
`types.ts` that both client and server speak.

---

## Database (`server/data/store.json`)

The whole store is a single JSON file, `server/data/store.json` (or wherever
`DB_DIR` points), written atomically to a temp file and renamed over the real
one so a crash can never leave a half-written blob. There is no schema to
migrate — `normalizeProduct()` heals old records on read.

```json
{
  "settings": {
    "config": { ...StoreConfig },
    "adminAuth": { "email": "...", "salt": "...", "hash": "..." } | null
  },
  "products": [{ "id": "...", "product": { ...Product }, "sort_index": -3 }],
  "orders": [ { ...Order } ],
  "sessions": [{ "token": "...", "email": "...", "expires_at": ... }],
  "staff": [{ "email": "...", "salt": "...", "hash": "...", "permissions": [...], "created_at": ... }],
  "coupons": [ { ...Coupon } ],
  "reviews": [ { ...ProductReview } ]
}
```

When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, the same shape is
also mirrored to a `store_state` row in Supabase (`id = 'shop'`) for cloud sync;
local JSON remains the fallback and is always kept in sync.

### Design notes

**One record per row.** Each product and order is stored as a single JSON blob
next to its id, so the app reads and writes whole records. Only fields that are
genuinely queried or ordered on (`sort_index`, `reference`, `status`,
`created_at`) are indexed for ordering and lookups.

**`settings` keys in use:**

| Key | Contents |
| --- | --- |
| `config` | The whole `StoreConfig` (name, currency, colours, categories, contact, payments) |
| `adminAuth` | `{ email, salt, hash }` for the owner — scrypt hash only |

The owner's credentials deliberately live in `settings` rather than `staff` so
there is exactly one place to look, and so the owner cannot be reached by the
staff-management code at all.

**Atomic writes.** The file is written to a temp name and renamed over the real
one, so a crashed restart can never leave a half-written JSON blob, and a
`tsx watch` restart mid-request does not lose data.

**Where the file lives:** `server/data/` by default, or wherever `DB_DIR`
points. Backups are made by copying `store.json`, which produces a consistent copy
without stopping the server.

---

## TypeScript shapes (`types.ts`)

### Product

```ts
interface Product {
  id: string;
  name: string;
  description: string;
  price: number | null;          // null = price agreed per enquiry
  compareAtPrice: number | null; // null = not on sale
  images: string[];
  category: string;
  sku: string;
  stock: number | null;          // null = stock not tracked
  contactName: string;           // per-listing enquiry contact
  contactPhone: string;
  contactEmail: string;
  variants: ProductVariant[];
  status: 'live' | 'draft';
  createdAt: number;
}

interface ProductVariant {
  id: string;
  options: Record<string, string>;  // e.g. { Size: 'M' }
  price: number;                    // always a number, never null
  stock: number;                    // always a number, never null
  sku: string;
}
```

**The two nullable fields are load-bearing.** `price: null` and `stock: null`
are *not* the same as `0`:

| Value | Meaning |
| --- | --- |
| `price: 0` | Genuinely free. Charged 0, shown as `$0.00`. |
| `price: null` | No fixed price. Shown as **Contact us**, never sold online. |
| `stock: 0` | Genuinely sold out. Blocked from purchase. |
| `stock: null` | Stock not tracked. Never sold out, never decremented, quantity uncapped. |

Variants deliberately keep numeric `price`/`stock` — a variant of a
price-on-enquiry product is simply priced 0.

### Order

```ts
interface Order {
  id: string;
  reference: string;          // FAS-###### , generated and uniqueness-checked server-side
  createdAt: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  lines: OrderLine[];         // price snapshot taken at order time
  total: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered';
  payment?: PaymentInfo;      // snapshot of where the money was sent
  paymentConfirmed?: boolean;
  paymentNote?: string;
}
```

Order lines are **snapshots**. Changing a product's price later does not rewrite
history, and `payment` records the bank/wallet details as they were *at order
time*, so an old order still shows where it was told to pay after you change
your account numbers.

### StoreConfig

Holds store identity: `storeName`, `tagline`, `currency`, `announcement`,
`colors` (four CSS-variable-backed brand colours), `contactEmail`,
`contactPhone`, `contactAddress`, `categories[]`, `adminEmail`, and optional
`payments`.

---

## Repair rules — `normalizeProduct()`

`lib/storage.ts` defines `normalizeProduct()`, called by **both** client and
server whenever a product crosses the wire or is read from disk. It repairs
records written by older builds so one bad row can never blank a whole view
behind the `ErrorBoundary`.

It **preserves meaningful values** and repairs only wrong types:

| Field | Rule |
| --- | --- |
| `price` | `null` preserved; otherwise a finite number, else `0` |
| `stock` | `null` preserved; otherwise `>= 0`, else `0` |
| `compareAtPrice` | finite number, else `null` |
| `variants` | non-array → `[]`; each variant repaired, price falls back to the product's |
| `status` | anything but `'draft'` → `'live'` |
| `contact*` | non-string → `''` (absent on all pre-existing records) |
| `images`, `category`, `sku`, `description` | type-checked with safe fallbacks |

**The rule to remember:** when adding a field, decide whether `null`/`''` is a
*deliberate* value or a *missing* one. Deliberate values are preserved; missing
ones get a safe default. Getting this backwards either loses real data or lets
junk through.

`parseSnapshot()` validates imported `.json` files before they are applied, and
uses the same repair pass.

---

## Where state lives

| Data | Lives in | Why |
| --- | --- | --- |
| Products, orders, settings, staff | JSON file | Shared by every visitor, survives everything |
| Session token | `localStorage` (`fas:authToken`) | The only other key written, per browser |
| Cart | `localStorage` (`fas:cart`) | Per-shopper state, not store data |
| Theme | `localStorage` (`theme`) | Per-shopper preference |

---

## Adding a field: the checklist

Follow this whenever a product or order gains a new attribute. Missing a step is
how stale data survives a refactor.

1. **`types.ts`** — add the field to the interface, with a comment saying whether
   `null`/`''` is deliberate or means "missing".
2. **`lib/storage.ts` → `normalizeProduct()`** — add the repair rule. This is the
   step people forget, and it is what keeps old records from breaking views.
3. **`constants.ts`** — add it to the seed products (the compiler will tell you).
4. **Server** — accept and validate it in `readProductBody()` if it comes from
   the network.
5. **`lib/api.ts`** — no change unless a new endpoint is involved.
6. **UI** — add the input, and render it where it matters.
7. **Docs** — update `DATA-MODEL.md` (this file) and add a `CHANGELOG.md` entry.

Then verify: `npm run typecheck`, and check a **pre-existing** record still loads
(it has no value for your new field).