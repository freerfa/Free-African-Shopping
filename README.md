# Free African Shopping

A React + TypeScript + Vite storefront with an admin panel, backed by a small
Express server with a built-in SQLite database (`server/`). Products, orders and
store settings live in one shared database file — every visitor sees the same
catalogue, and your data survives refreshes, browsers and devices. The cart and
theme preference stay in `localStorage` (they are per-shopper state).

## Documentation

| Document | What it covers |
| --- | --- |
| **This file (README.md)** | Running the store, the feature guide, API table, security notes |
| [docs/REBUILD.md](docs/REBUILD.md) | Step-by-step: rebuilding the project from an empty folder |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the code fits together, data flow, key decisions |
| [docs/API.md](docs/API.md) | Every endpoint, its guard, request and response shape |
| [docs/PERMISSIONS.md](docs/PERMISSIONS.md) | The rights system, roles, and how staff accounts work |
| [docs/DATA-MODEL.md](docs/DATA-MODEL.md) | Database schema, TypeScript types, repair rules |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Dated record of what changed and why |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common problems and how to fix them |

> **Keeping the docs current:** when you change behaviour, update the matching
> document in the same pass. `docs/CHANGELOG.md` records what and why; the table
> above tells you which file owns which topic.

---

---

## Running it

You need [Node.js](https://nodejs.org) 18 or newer.

```sh
npm install
npm run dev
```

`npm run dev` starts both processes:

- **API + database** on `http://localhost:3001` (Express + SQLite, reloads on edit)
- **Vite dev server** on `http://localhost:5173` (proxies `/api` to the API)

Open the Vite URL in your browser. Other commands:

```sh
npm run build     # production build into dist/
npm start         # serve API + built frontend on one port (PORT, default 3001)
npm run typecheck # tsc --noEmit across client and server
npm run preview   # static preview of dist/ only (no API — prefer `npm start`)
```

Environment variables for the server:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | API/server port |
| `ADMIN_EMAIL` | value from `storeConfig.ts` | First-run admin login |
| `ADMIN_PASSWORD` | value from `storeConfig.ts` | First-run admin password |
| `DB_DIR` | `server/data/` | Where the SQLite database file lives |

---

## Using the store

- **Browse** — the home page lists every *live* product. Use the search box in the
  header, or filter by category. The announcement bar, store name, tagline,
  currency and brand colours are all editable under **Admin → Settings**.
- **Cart and checkout** — add items, adjust quantities, then check out. The cart
  warns you (and blocks checkout) if an item is no longer available in the
  quantity you picked — stock can change if the admin edits it while you shop —
  and a **Clear cart** button empties everything. Checkout records the order,
  decrements stock and asks how you want to pay (see **Payments** below).
- **Admin** — click **Login**. The defaults come from `storeConfig.ts` (override
  with the server's `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars); the password is
  checked server-side against a scrypt hash. From there you can:
  - add other admins and give each one only the rights they need (see below)
  - create, edit, publish/unpublish and delete products (including per-variant stock),
    with a search box to find a product by name, category or SKU
  - review orders and change their status between pending → delivered
  - tick a payment off as **received** and leave a note once the money shows up
    in the bank/mobile-money account
  - edit the payment methods, bank account and mobile-money wallets shoppers see
  - re-skin the store with live colour pickers
  - browse the **database records** directly — a searchable table of every product
    and every order, with **Add**, **Edit** and **Delete** on the row itself
  - file an order taken outside the site (phone, WhatsApp, in person); the server
    prices it from the catalogue and decrements stock exactly like checkout
  - **export** the whole store to a `.json` file, and **import** one back
  - run **file tools** on the database (size and row counts, integrity check,
    optimize, a one-click `.db` backup download, purging the order book)

### Admin accounts and rights

The first admin (the "owner") holds **every** right and cannot be removed or
reduced. From **Admin → Staff** you can add further admin accounts and tick
exactly what each one may do — a shop assistant does not need your bank details.

| Right | Lets them |
| --- | --- |
| `products.view` | See products, including unpublished drafts |
| `products.manage` | Add, edit, publish and delete products |
| `orders.view` | See orders and customer details |
| `orders.manage` | Change order status and confirm payments |
| `orders.editRecords` | Record offline orders, and edit or delete order records |
| `settings.manage` | Change store details, colours, categories and contact info |
| `payments.manage` | Change payment methods, bank account and mobile money |
| `database.view` | Browse the raw database records |
| `database.manage` | Run database tools (check, optimize, backup, purge orders) |
| `data.import` | Export the store and import a snapshot |
| `data.reset` | Reset the store back to its defaults |
| `staff.manage` | Add and remove staff, and change their rights |

The **role presets** (Full access, Orders only, Catalogue manager, Stock clerk,
View only) fill in a sensible set in one click; you can still fine-tune after.

Every right is enforced **on the server**, so hiding a button in the panel is
only a convenience — calling the API without the right returns a 403. A few
things that keep this safe:

- the owner cannot be deleted, demoted, or signed into as a staff account;
- an account can never be left with zero rights, so nobody is locked out;
- a staff account may only hand out rights **it holds itself**, so managing
  staff can never be used to escalate to owner-level;
- changing or removing someone **signs their sessions out immediately**, so the
  new limits apply at once rather than when their token expires;
- staff passwords are hashed with scrypt, exactly like the owner's.

### Services and Jobs: optional price and stock, and "Contact us"

A Service or a Job is not sold like a physical good — the price is agreed per
enquiry and the listing has no unit count. In those two categories the admin
form therefore leaves **Price** and **Stock** blank instead of demanding
numbers (the labels read *optional*, and a note under each explains what a blank
means). Everywhere else both fields stay required, so a typo can never silently
make a product free.

Leaving them blank:

- shows **Contact us** on the card and the product page instead of a price,
- never marks the listing **Sold out**, and removes the "Only N left" badge,
- shows *stock not tracked* in the admin lists,
- and **does not decrement stock** when an order is placed.

### Contact us instead of Add to cart

A listing with no fixed price has nothing to check out, so it is **not sold
online**. Its **Add** button is replaced by **Contact us**:

- on a **product card** the button opens the **listing**, where the contact panel
  lives — one tap, and the phone number is visible rather than buried,
- on the **product page** it reveals the store's email, phone and address, and
  the message is pre-filled with the listing name and the chosen options. The
  button then reads **Hide contact details** so it can be collapsed again.

These listings can never enter the cart — the button is gone, `addToCart` refuses
them, and the API rejects an order naming one (*"… is arranged by enquiry, so it
cannot be ordered online"*) rather than quietly filing a $0 line. Set a price on a
Service or Job and it goes back to being sold the normal way.

The store-wide contact details come from **Admin → Settings → Contact**. A listing
that fills in its own overrides them (see below); if the store has published
nothing at all, the product page says so and points the shopper at the admin.

#### Per-listing contact details

A Service or a Job can point at its **own** contact instead of the store-wide
one. When the category is Services or Jobs the admin form grows a **Who to
contact about this** block with three optional fields — **contact name**,
**contact phone** and **contact email**. It appears in both admin panels
(Products and Database) and only for those two categories.

Each field falls back to the store-wide detail on its own, so naming a person
without a number still shows the store's number. Leaving all three blank simply
uses the store details, exactly as before. Moving a listing out of Services or
Jobs clears them, so nothing stale is left behind on a normally-sold product.

The categories are listed in `ENQUIRY_CATEGORIES` (`storeConfig.ts`) and matched
case-insensitively — add your own there to extend the behaviour.

---

## Payments (manual, confirmed by you)

The store takes **no card payments and never touches the money**. Instead the
shopper picks a method at checkout, is shown where to send the money, and you
confirm the payment by hand once it lands. Three methods ship with it:

| Method | What the shopper sees | What you do |
| --- | --- | --- |
| **Bank transfer** | Your bank, account name and account number (defaults to **Free Mirghani Elizara Cherewa · Stanbic Bank · 0200000077576**), plus your instructions; optional "name on the transfer" and "transfer reference" boxes | Match the transfer on your statement (the order reference is the narration) |
| **Mobile money** | A picker of your wallets with network, name and number; optional payer number and transaction ID | Match it on your mobile-money statement |
| **Pay on delivery** | Your note, e.g. "Pay in cash or by mobile money when your order arrives" | Collect on delivery |

At the top of that same screen sits the **Payment system** switch — one control
for the whole system:

| State | What shoppers see at checkout | What happens to orders |
| --- | --- | --- |
| **Active** (default) | The payment picker with the details above | A method is required and validated server-side |
| **Hide** | No payment section at all | Orders still go through **without** a payment method — settle up with the shopper directly (the confirmation screen says payment will be arranged) |
| **Inactive** | "We're not taking orders right now" | **No orders are accepted** — the API returns 403 until you switch it back on |

The three states also change the admin view: with **Hide** or **Inactive**, the
"no method is set to Active" warning disappears (it only applies when the
system is actually in use), and orders that arrive without a payment still let
you tick **Mark received** and leave a note.

Each method also has its **own** Active / Hide / Inactive switch, so the three
methods can sit in different states at the same time. While the store-wide
switch is not **Active** those switches don't change what shoppers see (the
form says so) — but **Inactive** is still refused by the API and **Hidden**
is still honoured:

| Method switch | In the checkout list (master on **Active**) | If an already-open checkout still posts it |
| --- | --- | --- |
| **Active** (default) | Shown, and the shopper must pick it | Accepted and validated as usual |
| **Hide** | Not shown | Accepted — a checkout opened before you hid it can complete |
| **Inactive** | Not shown | Rejected with a 400 ("… is not available right now"), even while the master switch is **Hide** |

If no method is **Active**, checkout shows "this store has not switched on a
payment method yet" and takes no order — only the store-wide switch makes
orders flow **without** a method (**Hide**) or stops them altogether
(**Inactive**).

How it works end to end:

1. **Configure** — Admin → Settings → **Payments**: set each method's own
   Active / Hide / Inactive switch, edit the bank details, add/remove
   mobile-money wallets and set the pay-on-delivery note. Save happens
   automatically (same debounced sync as the rest of the settings form).
2. **Checkout** — only methods set to **Active** appear, and a method with no
   account number (an empty bank number, a wallet without a number) stays
   hidden, because there would be nowhere to send the money.
3. **Confirmation** — the thank-you screen repeats the receiving account, the
   amount and the order reference to quote as the narration/reason.
4. **Reconcile** — every order stores a **snapshot** of the payment: method, the
   account it was told to pay into, and any proof the shopper typed. A later edit
   to your bank details never rewrites what old orders were told. In
   Admin → Orders each order shows that summary with **Mark received** and a note
   box ("transfer verified against the statement").

The API validates the choice server-side: the method must not be switched to
**Inactive** (a **Hidden** one is still honoured so an already-open checkout
can finish) and the mobile-money wallet must still exist, otherwise the order
is rejected with a shopper-readable message. Prices and stock always come from the database —
the payment selection never affects what an order costs.



```
App.tsx                 hash router (#/… deep links) + search/selection state + order confirmation
index.tsx               entry point (mounts ThemeProvider > App)
index.css               runtime colour variables + base styles
constants.ts            seed catalogue the server loads into SQLite on first run
storeConfig.ts          default store identity, brand colours, payment defaults, seed admin credentials
types.ts                shared domain types (imported by client *and* server)
server/index.ts         Express REST API + static hosting for dist/
server/db.ts            SQLite schema, seeding and record helpers (server/data/store.db)
server/auth.ts          scrypt password hashing, sessions, login rate limiting
contexts/               StoreContext (loads/saves via /api), ThemeContext (light/dark), ToastContext
components/             storefront views, shared UI, icons, error boundary
components/admin/       AdminView (products/orders/settings), ProductForm, PaymentSettings
lib/api.ts              typed fetch client for the REST API
lib/payments.ts         payment labels + "where to pay" formatting shared by all three views
lib/                    formatting, product helpers, localStorage (cart/token) + snapshots
services/geminiService  optional AI product descriptions
```

---

## AI product descriptions

The **Generate with AI** button in the product form uses the Google Gemini API.
It needs a key in `.env.local`:

```
GEMINI_API_KEY=your_key_here
```

Without a key the rest of the store works normally; only that one button is
unavailable. The key is read at build time by `vite.config.ts`, so **restart the
dev server** after changing it, and never commit a real key.

Because the key ends up inside the built JavaScript bundle, anyone can read it
from a deployed site. Before deploying, restrict the key in Google AI Studio to
your site's origin (HTTP-referrer restriction), or proxy Gemini calls through a
serverless endpoint instead.

---

## The API (built-in database)

All store data lives in one SQLite file — `server/data/store.db` (gitignored).
Back it up from **Admin → Database** (Download backup) or by copying the file.
Endpoints:

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | anyone | liveness check |
| GET | `/api/config` | anyone | store settings (never includes the password hash) |
| PUT | `/api/config` | admin | save settings; a blank password field keeps the current one |
| GET | `/api/products` | anyone / admin | live products (an admin session also sees drafts) |
| POST / PUT / DELETE | `/api/products[/:id]` | admin | catalogue CRUD |
| GET | `/api/orders` | admin | order book, newest first |
| POST | `/api/orders` | anyone | place an order — the server enforces the payment-system switch (`inactive` rejects every order, `hide` makes the payment optional), validates the payment method when one is required, computes prices, checks stock and decrements stock in one transaction |
| PUT | `/api/orders/:id/status` | admin | change an order's status |
| PUT | `/api/orders/:id/payment` | admin | mark a manual payment as received and/or save a payment note |
| PUT | `/api/orders/:id` | admin | edit an order's customer details, status and payment bookkeeping (Admin → Database). Lines, total, reference and the payment snapshot are owned by checkout and cannot be edited |
| DELETE | `/api/orders/:id` | admin | delete a single order |
| POST | `/api/admin/orders` | admin | file an order taken outside the site. Priced from the catalogue and stock-decremented in the same transaction as checkout; a payment method is not required |
| POST | `/api/auth/login` | anyone | exchange credentials for a 7-day bearer token |
| GET / POST | `/api/auth/me`, `/api/auth/logout` | admin | session check (returns the account's rights) / end session |
| GET / POST / PUT / DELETE | `/api/staff[/:email]` | `staff.manage` | list, create, update rights and remove staff accounts |
| GET | `/api/database` | admin | database file size, journal mode, page stats and row counts per table |
| POST | `/api/database/check` | admin | `PRAGMA integrity_check` — `ok`, or the list of problems found |
| POST | `/api/database/optimize` | admin | `VACUUM` the file (reclaim space, refresh statistics) and return fresh stats |
| GET | `/api/database/backup` | admin | download a consistent `.db` copy of the live database (`VACUUM INTO`) |
| DELETE | `/api/orders` | admin | purge the whole order book (products, settings and login stay untouched) |
| POST | `/api/import` | admin | replace config + catalogue + orders from a `.json` snapshot |
| POST | `/api/reset` | admin | restore seed catalogue, default settings, empty order book |

### Migrating data from the old localStorage version

The server cannot read your browser's storage. If you edited the store before
this backend existed, export once from the old version (**Admin → Export**),
then sign in after upgrading and use **Admin → Data → Import**.

If the old UI is already gone, rebuild the same snapshot from DevTools and save
it as a `.json` file:

```js
JSON.stringify({
  version: 1,
  exportedAt: new Date().toISOString(),
  config: JSON.parse(localStorage.getItem('fas:config')),
  products: JSON.parse(localStorage.getItem('fas:products')),
  orders: JSON.parse(localStorage.getItem('fas:orders')),
})
```

---

## Security note

The admin password is verified **server-side** against a scrypt hash, sessions
are random bearer tokens with a 7-day expiry, login is rate-limited (10 failures
per email+IP per 15 minutes), and the password never reaches the browser.
Remaining caveats before real money is involved:

- Serve over **HTTPS** so login requests can't be sniffed in transit.
- The Gemini API key still ships in the client bundle (see above).
- Payments are collected outside the site (bank transfer, mobile money, cash on
  delivery) and confirmed by hand under Admin → Orders. Treat "payment received"
  as your own bookkeeping: the store never verifies a transfer with the bank.