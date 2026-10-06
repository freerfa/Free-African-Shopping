# Permissions and staff accounts

One owner account, any number of staff accounts, each holding an explicit list of
rights.

---

## The model

- **The owner** is whoever the `adminAuth` setting names (seeded from
  `storeConfig.ts` / `ADMIN_EMAIL` on first run). The owner implicitly holds
  **every** right, cannot be deleted or reduced, and cannot also exist as a staff
  row — so there is always at least one way back in.
- **Staff accounts** live in the `staff` table with their own scrypt password
  hash and a JSON array of rights.

Rights are a **flat, closed union** (`Permission` in `types.ts`). There is no
inheritance and no hierarchy — a staff account holds exactly the rights listed,
so there are no surprises about what a role expands to later.

---

## The rights

| Right | Lets them | Grants access to |
| --- | --- | --- |
| `products.view` | See products, including unpublished drafts | Products tab |
| `products.manage` | Add, edit, publish and delete products | Product create/edit/delete |
| `orders.view` | See orders and customer details | Orders tab |
| `orders.manage` | Change order status and confirm payments | Status dropdown, payment tick/note |
| `orders.editRecords` | Record offline orders, edit/delete order records | Admin order form, order edit/delete |
| `settings.manage` | Change store details, colours, categories, contact | Store settings blocks |
| `payments.manage` | Change payment methods, bank account, mobile money | Payments block |
| `database.view` | Browse the raw database records | Database tab |
| `database.manage` | Integrity check, optimize, backup, purge orders | Database file tools |
| `data.import` | Export the store and import a snapshot | Export / Import buttons |
| `data.reset` | Reset the store back to defaults | Reset button |
| `staff.manage` | Add and remove staff, change their rights | Staff tab |

**Most people need three or four.** "View only" (`products.view` +
`orders.view`) covers a shop assistant who needs to look up stock and check an
order but must not touch anything.

---

## Role presets

`ROLE_PRESETS` in `types.ts` — one click fills in a sensible set, still
fine-tunable afterwards:

| Preset | Rights |
| --- | --- |
| **Full access** | Everything except `staff.manage` and `data.reset` |
| **Orders only** | `orders.view`, `orders.manage` |
| **Catalogue manager** | `products.view`, `products.manage` |
| **Stock clerk** | `products.view`, `orders.view`, `orders.manage` |
| **View only** | `products.view`, `orders.view` |

A preset is just a starting point — what gets saved is the individual tick list.

---

## How enforcement works

**The server is the boundary.** Every admin route carries
`requireAdmin` (valid session) plus `requirePermission('…')` (a specific right).
Without the right, the response is 403 with a message naming the missing right.
The UI hiding a button is a convenience, not the control.

**Rights are read live from the database, not baked into the token.** Two
consequences worth knowing:

- An owner can correct a mistake instantly, for everyone, at any time.
- The `staff` table is security-critical — include it in your backups.

**Changing or removing someone signs them out immediately.** `destroySessionsFor()`
deletes their rows in `sessions`, so a revoked right takes effect at once rather
than when a 7-day token happens to expire. They simply sign back in with the new
rights.

**The UI mirrors the server.** `AdminView` computes `availableTabs` from the
signed-in user's rights, and individual controls check `can('…')`. Where a control
would otherwise be useless it is shown disabled with an explanation (the order
status dropdown) rather than hidden outright.

---

## Safety rules

These are enforced server-side, in `server/index.ts` and `server/auth.ts`:

1. **The owner cannot be locked out.** Deleting or editing the owner is refused;
   the owner always holds every right.
2. **No account can be left with zero rights.** Creating or updating with an
   empty list is rejected, so nobody creates a staff member who can never do
   anything — and never has to guess why.
3. **No privilege escalation through staff management.** A non-owner may only
   grant rights **it holds itself** (`grantablePermissions`), and `data.reset` is
   never grantable by a non-owner. Managing staff cannot be used to promote
   yourself to owner level.
4. **Unknown rights are dropped, not honoured.** A permission string not in
   `ALL_PERMISSIONS` is silently discarded, so a hand-edited database row or a
   stale client cannot invent a right the server has no route for.
5. **Same 401 for bad email and bad password**, so sign-in cannot be used to
   enumerate staff addresses.
6. **Login rate limiting** — 10 failures per email+IP per 15 minutes.
7. **Passwords are scrypt-hashed**, identical treatment to the owner. Neither the
   owner password nor a staff password is ever written to config, returned by an
   endpoint, or sent to the browser.

---

## Managing staff in practice

**Admin → Staff** (visible only with `staff.manage`).

| Task | How |
| --- | --- |
| Add someone | Enter email + a password of 8+ characters, tick rights (or pick a preset first), **Create account** |
| Change rights | **Edit rights** on the row, tick, **Save** — they are signed out immediately |
| Reset someone's password | **Edit rights**, type a new one, **Save** — leaving it blank keeps the current password |
| Remove someone | **Remove** — they are signed out at once and cannot sign in again |

Giving someone access is a two-step job you can undo: create, then change or
remove. Nothing needs a server restart.

### Practical advice

- **Give the least privilege that does the job.** If someone only handles
  orders, *Orders only* is enough — it does not expose your bank details.
- **Prefer staff accounts over sharing the owner login.** You then know who did
  what, and can revoke one person without locking everyone out.
- **Keep the owner credentials somewhere safe.** They are the only way back in if
  every staff account is misconfigured.