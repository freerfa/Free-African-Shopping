# Data model

Two layers: the **SQLite schema** on disk, and the **TypeScript shapes** in
`types.ts` that both client and server speak.

---

## Database (`server/data/store.db`)

Created by `server/db.ts` with `CREATE TABLE IF NOT EXISTS`, so starting against
an existing file is a no-op migration. There is no separate migration tool.

```sql
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE products (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,   -- whole product as JSON
    -- Newest admin-created products sort first (negative indices); seed data
    -- keeps its file order. Set at insert, never rewritten on update.
    sort_index INTEGER NOT NULL
);

CREATE TABLE orders (
    id         TEXT PRIMARY KEY,
    reference  TEXT NOT NULL UNIQUE,   -- e.g. FAS-482913
    created_at INTEGER NOT NULL,
    status     TEXT NOT NULL,
    data       TEXT NOT NULL           -- whole order as JSON
);

CREATE TABLE sessions (
    token      TEXT PRIMARY KEY,
    email      TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE TABLE staff (
    email       TEXT PRIMARY KEY,
    salt        TEXT NOT NULL,
    hash        TEXT NOT NULL,
    permissions TEXT NOT NULL,   -- JSON array of Permission strings
    created_at  INTEGER NOT NULL
);
```

### Design notes

**Whole record as JSON.** `products.data` and `orders.data` hold the entire
object. The app only ever reads and writes whole records, so normalising them
into columns would add joins and migrations for no gain. Only fields that are
genuinely queried or ordered on (`sort_index`, `reference`, `status`,
`created_at`) get their own column.

**`settings` keys in use:**

| Key | Contents |
| --- | --- |
| `config` | The whole `StoreConfig` (name, currency, colours, categories, contact, payments) |
| `adminAuth` | `{ email, salt, hash }` for the owner — scrypt hash only |

The owner's credentials deliberately live in `settings` rather than `staff` so
there is exactly one place to look, and so the owner cannot be reached by the
staff-management code at all.

**WAL mode.** The database runs in `journal_mode = WAL` with `busy_timeout =
5000`, so reads stay fast while a write is in flight and a `tsx watch` restart
mid-request does not error.

**Where the file lives:** `server/data/` by default, or wherever `DB_DIR`
points. Backups are made with SQLite's `VACUUM INTO`, which produces a
consistent copy without stopping the server.

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
| Products, orders, settings, staff | SQLite database | Shared by every visitor, survives everything |
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