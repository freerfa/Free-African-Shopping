# Troubleshooting

Symptoms first, cause second.

---

## Nothing loads / blank page

**Check both processes are running.** `npm run dev` starts two; killing one leaves
the other half-working.

```sh
curl -s localhost:3001/api/health     # {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' localhost:5173
```

| What you see | Cause |
| --- | --- |
| 5173 dead, 3001 alive | API up, Vite not — rerun `npm run dev` |
| 3001 dead | API crashed; check the terminal for the stack trace |
| Both alive, page blank | JavaScript error — open the browser console |

A blank admin panel is usually **one corrupt product record**. The
`ErrorBoundary` catches it so the storefront keeps working. Fix by opening the
record in **Admin → Database**, or reset it from the `products` table.

---

## "Could not reach the store server"

The browser cannot reach the API on port 3001. Either the server is not running,
or `PORT` was changed without telling Vite. If you changed the port, update the
proxy in `vite.config.ts` to match.

---

## Port already in use

```sh
lsof -ti :3001 | xargs kill     # or :5173
```

Or set a different port — but then update `vite.config.ts`'s proxy too.

---

## `better-sqlite3` will not install

It is a native module and needs build tools:

```sh
xcode-select --install                        # macOS
sudo apt install build-essential python3      # Debian/Ubuntu
npm rebuild better-sqlite3
```

---

## "Admin session required" / signed out unexpectedly

Sessions last 7 days, but **changing or removing a staff account signs them out
immediately** (by design, so revoked rights apply at once). Sign in again.

If the owner is signed out and you cannot sign back in, the credentials in
`storeConfig.ts` / `ADMIN_EMAIL` are only a **first-run seed** — once `adminAuth`
exists in the database, those are ignored. Change the password from **Admin →
Settings** while signed in.

---

## 403 "does not have the … right"

The account is valid but lacks that permission. Either grant it under
**Admin → Staff**, or ask the owner. This is the permission system working, not a
bug — see `docs/PERMISSIONS.md`.

---

## Locked out of everything

Only possible if the owner password is lost. Restore from a backup
(**Admin → Database → Backup** if you had one), or delete `server/data/store.db`
to start fresh — **this discards all products, orders and staff accounts**.

---

## "Generate with AI" says no API key

`GEMINI_API_KEY` is missing. Add it to `.env.local`:

```
GEMINI_API_KEY=your-key-here
```

Then restart the dev server — the key is injected at build time, not read at
runtime. Everything else works without it.

---

## A Services/Jobs product suddenly asks for a price again

`ENQUIRY_CATEGORIES` matches the category **by name**. If you renamed a category
in **Admin → Settings** (say *Services* → *Bookings*), its products are no longer
recognised as enquiry listings, so the admin form starts requiring price and stock
again.

Nothing is lost — existing products keep their stored blank values — but the form
now asks for numbers. Either rename the category back, or add the new name to
`ENQUIRY_CATEGORIES` in `storeConfig.ts`:

```ts
export const ENQUIRY_CATEGORIES: readonly string[] = ['Services', 'Jobs', 'Bookings'];
```

---

## A product shows "Contact us" when you expected a price

Its `price` is `null`, not `0`. In Services and Jobs that field is optional and
blank means "price agreed per enquiry". Open the product and either type a price
or leave it blank deliberately.

The same applies to stock: `0` means genuinely sold out; blank means not tracked.

---

## A Services/Jobs product still shows an "Add" button

Add-to-cart is offered when the product **has a price**. Set one and it sells
normally; clear it and the button becomes **Contact us**.

---

## Changes to products/orders are not showing

The catalogue is loaded once at boot. **Reload the page** after an import or
reset. Settings changes apply immediately (debounced ~600ms).

---

## The dev server restarted mid-request

`tsx watch` restarts the API when a server file changes. If a request lands
during the restart you may see `ECONNREFUSED` in the log and a failed fetch in
the browser. It resolves on retry — this is normal in development.

---

## Before deploying

```sh
npm run typecheck && npm run build
```

Then confirm: the owner password is changed from the default, you have a
**personal staff account** rather than sharing the owner login, you have taken a
backup, and `server/data/` is on persistent storage (a container filesystem
wiped on redeploy loses the store).