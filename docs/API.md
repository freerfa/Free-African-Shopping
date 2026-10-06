# API reference

Base URL `http://localhost:3001` in dev (Vite proxies `/api` to it, so the browser
sees one origin and needs no CORS).

Auth is a bearer token: `Authorization: Bearer <token>`, obtained from
`POST /api/auth/login`. Every response body is JSON; errors are
`{ "error": "human readable message" }`.

**Status codes used**

| Code | Meaning |
| --- | --- |
| 400 | Invalid input (missing field, bad value) |
| 401 | No session, or the session expired |
| 403 | Signed in, but the account lacks the required right |
| 404 | Not found |
| 409 | Conflict — stale data, or a stock/availability problem |
| 429 | Too many sign-in attempts |

---

## Public endpoints

### `GET /api/health`
Liveness probe. `{"ok": true}`

### `GET /api/config`
The full store config. Payments are normalised so a database written before the
payments feature still returns a complete, usable object. `adminPassword` is
always blank.

### `GET /api/products`
Live products only — **unless** the request carries a valid admin token, in which
case drafts are included too.

### `POST /api/orders`
Placing a shopper order. Body:

```json
{
  "name": "...", "email": "...", "phone": "...", "address": "...",
  "payment": { "method": "bankTransfer|mobileMoney|payOnDelivery", "...": "..." },
  "lines": [{ "productId": "seed-kente-scarf", "variantId": null, "quantity": 1 }]
}
```

`payment` may be omitted when the payment system is set to **Hide**.

**The server is authoritative.** It re-reads every product, prices the lines from
the database, rejects any line exceeding stock, generates a unique `FAS-######`
reference, snapshots the receiving account, and decrements stock — all inside one
transaction. A client-supplied price is never trusted. Lines naming a
price-on-enquiry listing (Services/Jobs) are rejected with 409.

---

## Admin endpoints

"Admin" below means any valid session; the right column is the additional
`requirePermission(...)` guard.

| Method | Path | Guard | Does |
| --- | --- | --- | --- |
| `GET` | `/api/orders` | `orders.view` | All orders |
| `PUT` | `/api/orders/:id/status` | `orders.manage` | Change status |
| `PUT` | `/api/orders/:id/payment` | `orders.manage` | Tick off a payment, save a note |
| `PUT` | `/api/orders/:id` | `orders.editRecords` | Edit customer details, status, payment bookkeeping |
| `DELETE` | `/api/orders/:id` | `orders.editRecords` | Delete one order |
| `DELETE` | `/api/orders` | `database.manage` | Purge the whole order book |
| `POST` | `/api/admin/orders` | `orders.editRecords` | File an order taken outside the site |
| `POST` | `/api/products` | `products.manage` | Create |
| `PUT` | `/api/products/:id` | `products.manage` | Update |
| `DELETE` | `/api/products/:id` | `products.manage` | Delete |
| `PUT` | `/api/config` | `settings.manage` | Update settings (credentials ride along) |
| `GET` | `/api/database` | `database.view` | File size, journal mode, page stats, row counts |
| `POST` | `/api/database/check` | `database.manage` | `PRAGMA integrity_check` |
| `POST` | `/api/database/optimize` | `database.manage` | `VACUUM` and return fresh stats |
| `GET` | `/api/database/backup` | `database.manage` | Download a consistent `.db` copy (`VACUUM INTO`) |
| `POST` | `/api/import` | `data.import` | Replace config + catalogue + orders from a snapshot |
| `POST` | `/api/reset` | `data.reset` | Reset the store to its defaults |
| `GET` | `/api/staff` | `staff.manage` | List staff accounts + the owner |
| `POST` | `/api/staff` | `staff.manage` | Create a staff account |
| `PUT` | `/api/staff/:email` | `staff.manage` | Change rights and/or password |
| `DELETE` | `/api/staff/:email` | `staff.manage` | Remove a staff account (signs them out) |

`POST /api/import` ignores any `adminPassword` in the uploaded file — credentials
stay under server control.

---

## Auth endpoints

### `POST /api/auth/login`
Body `{ "email": "...", "password": "..." }`. Works for **both** the owner and
staff accounts. Returns:

```json
{
  "token": "64-char hex string",
  "user": {
    "email": "clerk@shop.com",
    "isAdmin": true,
    "isOwner": false,
    "permissions": ["products.view", "orders.view"],
    "grantablePermissions": ["products.view", "orders.view"]
  }
}
```

Wrong email and wrong password return the **same** 401 message, so the form
cannot be used to discover which staff emails exist. Rate limited to 10 failures
per email+IP per 15 minutes.

### `GET /api/auth/me`
Returns the same `user` shape for the current token. The client calls this on
boot to restore a session.

### `POST /api/auth/logout`
Destroys the token. No auth required (it is a no-op without a token).

---

## Staff endpoints

### `POST /api/staff`
```json
{ "email": "clerk@shop.com", "password": "at-least-8-chars",
  "permissions": ["products.view", "orders.view"] }
```
Rejects: an invalid email, a password under 8 characters, an empty rights list,
an address already in use, and the owner's own address.

### `PUT /api/staff/:email`
```json
{ "permissions": ["products.view"], "password": "optional-new-password" }
```
Omit `permissions` to leave rights alone; omit or blank `password` to keep the
current one. Changing rights **signs the account out of all sessions**, so the
change applies immediately.

### `DELETE /api/staff/:email`
Removes the account and destroys its sessions. The owner cannot be removed (404,
because there is no such staff row).

---

## Payment methods

Three, none of which touch real money — all settled by hand and confirmed later
in **Admin → Orders**:

| Method | Requires |
| --- | --- |
| `bankTransfer` | `payments.bank.accountNumber` to be set |
| `mobileMoney` | The chosen network to exist in `payments.mobileMoney` with an account number |
| `payOnDelivery` | — |

The master switch `payments.status` decides how much is required:

- `active` — a valid method is **required**
- `hide` — optional; nothing sent is fine, anything sent is still validated
- `inactive` — the store is not taking orders at all (403)

Each method also has its own switch: `inactive` is refused with a 400, `hide` is
still honoured so a checkout already open can finish, `active` is offered as
usual.

**Prices and stock always come from the database** — the payment selection never
affects what an order costs.

// __AUTH__