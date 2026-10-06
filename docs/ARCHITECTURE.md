# Architecture

How the pieces fit together, and why they are arranged this way.

---

## Shape

```
Browser (React SPA)
  │
  │  fetch('/api/...')
  ▼
Vite dev server :5173  ──proxies /api──▶  Express API :3001
                                            │
                                            ▼
                                    SQLite (server/data/store.db)
```

In production `npm start` serves `dist/` from the same Express process, so the
whole store is one Node process and one port. In dev, Vite proxies `/api` so the
browser only ever talks to one origin — no CORS configuration anywhere.

---

## Layers

### 1. Shared types — `types.ts`

The single source of truth. Anything crossing the network lives here, so client
and server cannot drift. Also holds the `Permission` union and role presets.

### 2. Store identity — `storeConfig.ts`

Defaults for name, currency, colours, categories, payment methods, and the
first-run admin. Everything is overridable at runtime from **Admin → Settings**,
so one codebase can be re-skinned as any store. `ENQUIRY_CATEGORIES` controls
which categories treat price/stock as optional.

### 3. Pure helpers — `lib/`

No React, no server, no I/O. Just functions:

| File | Responsibility |
| --- | --- |
| `lib/storage.ts` | `normalizeProduct()` repair rules, snapshot parse/serialise, localStorage keys |
| `lib/product.ts` | Product queries — `totalStock`, `isSoldOut`, `isOnSale`, `isContactOnly`, `chargeablePrice` |
| `lib/format.ts` | Currency and file-size formatting, "Contact us" label |
| `lib/payments.ts` | Payment labels and status logic, shared by checkout and settings |
| `lib/images.ts` | Resizing uploads in the browser to compressed data URLs |
| `lib/api.ts` | Typed client — one method per endpoint |

`lib/storage.ts` and `lib/product.ts` are imported by **both** the client and the
server. That is deliberate: the same rules and the same wording everywhere, so a
product cannot look sold-out on one side and in-stock on the other.

### 4. Server — `server/`

| File | Responsibility |
| --- | --- |
| `db.ts` | Opens SQLite, creates the schema, typed queries |
| `auth.ts` | Password hashing, sessions, staff accounts, permission resolution, rate limiting |
| `index.ts` | All routes, validation, order transaction |

### 5. Client state — `contexts/`

| Context | Responsibility |
| --- | --- |
| `StoreContext` | Products, orders, config, cart, user; all mutations and API calls |
| `ThemeContext` | Light/dark, persisted to `localStorage` |
| `ToastContext` | Transient success/error messages |

### 6. Views — `components/`

Presentational only. Each screen is dumb; data comes from `useStore()`.

---

## Data flow

### Browse (no auth)

`HomeView` → `StoreContext.liveProducts` (memoised on boot) → `ProductCard`.
Catalogue changes require a reload; a single small store does not need
subscriptions.

### Checkout

1. Cart lines are joined with live product data in `detailedCart` (a `useMemo`).
   Lines whose product or variant was deleted are dropped.
2. `placeOrder()` re-checks stock locally for instant feedback, then POSTs.
3. **The server re-does everything authoritatively** inside one transaction:
   re-reads products, prices lines from the database, rejects over-stocked
   lines, generates a unique reference, snapshots the receiving account, and
   decrements stock.
4. The client applies an optimistic stock decrement so the UI matches without a
   refetch.

**The client is never trusted with prices or stock.** This is what stops a
tampered request from buying a $150 scarf for 1 cent.

### Admin editing

`ProductForm` holds a plain-text `ProductDraft` (everything a `string`), converts
on submit, and calls `StoreContext.saveProduct()` → the API → `normalizeProduct()`
on both sides.

---

## Key decisions

**SQLite inside the Node process.** No server to install, no connection string, no
credentials. One file you can copy to back up the entire store. WAL mode keeps
reads fast during writes.

**Whole records as JSON columns.** The app only reads whole records, so
normalising them into columns would add joins and migrations for no gain. Only
genuinely ordered or queried fields get columns.

**Nullable fields over sentinel values.** `price: null` means "price on enquiry"
and `stock: null` means "not tracked" — both distinct from `0`. Sentinel values
like `-1` or `999999` leak into arithmetic and display bugs; `null` forces every
consumer to decide what to do, which is exactly the decision that needs making.

**Server-side permissions, client-side convenience.** Every route checks a right.
The UI also hides what you cannot use, but that is tidiness, not security. A 403
is the real answer to a crafted request.

**Permissions read live, not cached in the token.** Lets the owner correct
mistakes instantly. Costs a `staff` lookup per request — irrelevant at this
scale, and the `staff` table is tiny.

**No card payments, ever.** The store takes no card details and never touches
money. Payment methods are manual (bank transfer, mobile money, pay on
delivery), settled by hand, and confirmed afterwards in the admin panel. There is
no integration to breach because there is no integration.

---

## Conventions

- **Comments explain *why*, not *what*.** Non-obvious decisions get a sentence;
  the code already says what it does.
- **Types at the boundary.** Network bodies are `unknown` and validated before
  use — compile-time types do not protect a running server.
- **Repair, don't reject.** `normalizeProduct()` heals old records so a
  six-month-old database keeps working after a schema change.
- **One source of truth per fact.** Rights live in `types.ts`, contact details
  in the config, prices in the database.

---

## Where to change what

| To change... | Edit |
| --- | --- |
| A field on a product/order | `types.ts` → `normalizeProduct()` → server validation → UI (see the checklist in `DATA-MODEL.md`) |
| Store name, currency, colours, categories | `storeConfig.ts` defaults; runtime in **Admin → Settings** |
| Which categories skip price/stock | `ENQUIRY_CATEGORIES` in `storeConfig.ts` |
| A permission or its wording | `ALL_PERMISSIONS` + `PERMISSION_LABELS` in `types.ts`, then guard the route |
| A role preset | `ROLE_PRESETS` in `types.ts` |
| A payment method or its rules | `types.ts` (`StorePayments`) + `lib/payments.ts` + **Admin → Settings → Payments** |
| An API endpoint | `server/index.ts` (route) + `lib/api.ts` (client method) — update `docs/API.md` |
| The database schema | `server/db.ts` (`CREATE TABLE IF NOT EXISTS`), then update `docs/DATA-MODEL.md` |

Always run `npm run typecheck` and `npm run build` after a change, and record it
in `docs/CHANGELOG.md`.