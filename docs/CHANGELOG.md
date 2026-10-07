# Changelog

Dated record of what changed and **why**. Add a new section at the top for each
change you make; the note at the bottom says what a good entry looks like.

Format: `### YYYY-MM-DD — short title`, then bullet points of behaviour changes
and the reasoning. Link to the doc that owns the topic when one does.

---

## 2026-10-07 — Automatic updates: commits push themselves, Render redeploys

- Installed a **`post-commit` git hook** (`.git/hooks/post-commit`) that pushes
  `main` to GitHub after every commit, logging each attempt to
  `.git/auto-push.log`. Uses the absolute Xcode git path and BatchMode SSH so it
  can never hang on a licence prompt or password request.
- Documented the full chain in `docs/REBUILD.md` → *Automatic updates: local →
  GitHub → Render*: GitHub → Render is automatic by Render's own default
  (quoted from their docs), with `[skip render]` as the escape hatch.

**Why:** the owner asked to never push or deploy by hand — "make the update
auto, on the render and github, whenever there is changes". Store **data**
edits (Admin panel on the live site) were already instant and are unaffected;
the local database stays gitignored by design.

---

## 2026-10-06 — Announcement bar copy: Juba delivery

- Changed to **"Delivery available everywhere in Juba, South Sudan."** in both
  `storeConfig.ts` (fresh-database default) and the live store config.
- The user supplied the wording, replacing the previous "Free shipping…
  anywhere in the world" line (see 2026-10-02) with a local-delivery claim.

---

## 2026-10-06 — Render deployment blueprint: plan corrected to paid

- `render.yaml` changed from `plan: free` to `plan: 0.5c-512mb`
  (legacy name `starter`), keeping the 1 GB persistent disk at `/var/data`.
- Header comments and `docs/REBUILD.md` now document the real cost:
  **$7/mo compute + $0.25/mo disk = $7.25/mo** on the free Hobby workspace.

**Why:** the original blueprint paired `plan: free` with a `disk:` block, which
Render rejects — its docs state free web services don't support persistent
disks. A blueprint that fails on connect is useless, so the plan had to become
the cheapest one that supports disks. The disk itself is non-negotiable: the
store's entire database is one SQLite file, and without the disk every
redeploy or restart resets products, orders and admin accounts to the seed.

Also documented: with a disk attached, redeploys take a few seconds of downtime
(Render's guard against two instances writing the same SQLite file), and going
back to `plan: free` requires deleting the `disk:` block in the same edit.

---

## 2026-10-02 — Announcement bar copy corrected

- Changed from *"Free shipping worldwide on orders over $100"* to
  **"Free shipping on every order, anywhere in the world"**, both in
  `storeConfig.ts` (the default for a fresh database) and in the live store
  config.

**Why the wording changed, not just the style:** the old copy advertised a
minimum-spend threshold that does not exist. The store has no shipping model and
no threshold logic anywhere — `CartView` shows `Shipping: Free` unconditionally
and checkout charges the subtotal exactly. The old line therefore promised
something false to anyone ordering under $100, and a shopper who reached checkout
would see the cart contradict the banner.

The new line says what actually happens. It is also 51 characters against 43, and
the banner repeats the text 8 times across its scrolling track, so shorter is
better here.

Other options considered, all equally truthful:

- "Free shipping on every order, worldwide" (39 chars)
- "Free worldwide shipping — every order" (37)
- "Worldwide delivery, on us" (25)
- "Free shipping, wherever you are" (31)

The banner is edited at runtime under **Admin → Settings → Announcement bar**, so
you can swap it at any time without touching code.

---

## 2026-10-02 — Site review

Reviewed the running store end to end: rendering, data integrity, security
boundaries, accessibility and codebase hygiene. No code changes were needed —
these are the findings.

### Verified working

- Storefront and API both healthy; no errors in the server log.
- Draft products correctly hidden from the public (8 public / 9 admin).
- `adminPassword` never leaves the server — `/api/config` returns `""`.
- Unauthenticated and invalid-token requests to admin routes both return 401.
- HTML shell carries `lang`, title, description, viewport and theme-color;
  23 `aria-label`s, 62 `<label>`s and 85 `<button>`s across the UI.
- Hostile input (an `<img onerror>` name, a `<script>` description) is stored
  verbatim and escaped at render time by React — the correct layered approach.
- Empty carts and unknown product IDs are rejected with shopper-readable errors.
- No TODO/FIXME markers, no `console.log` in UI code, no leftover temp files.

### Findings worth knowing (no fix applied — all low severity)

1. **Order quantity is clamped rather than rejected.** `POST /api/orders` maps
   `quantity` through `Math.max(1, Math.floor(…))`, so a hand-crafted request
   with `quantity: -5` becomes `1` and is accepted (201). Fractional `1.9`
   becomes `1`. No corruption results and stock cannot be driven negative, but
   nonsense input is silently absorbed rather than refused. Normal UI traffic
   cannot reach this — the cart only ever sends `Math.max(1, …)`.
2. **`ENQUIRY_CATEGORIES` is matched by name, not by stored identity.** Renaming
   a category in **Admin → Settings** (e.g. *Services* → *Bookings*) silently
   makes price and stock required again for its products. Existing products keep
   their stored `null` price and stock, so nothing breaks — the admin form just
   starts asking for numbers again. Editing `ENQUIRY_CATEGORIES` in
   `storeConfig.ts` fixes it.
3. **Very long listing names are not truncated in the product title.**
   The Connect Airtime listing's 88-character name renders in full on the detail
   page. Cosmetic only; it wraps rather than overflowing.

### Data note

The Connect Airtime listing previously carried a price of `211,924,689,270.95`.
It now reads `price: null` with per-listing contact details filled in
(`contactName`, `contactPhone`, `contactEmail`), which is the intended
price-on-enquiry shape for a Services listing.

---

## 2026-10-02 — Services & Jobs, Contact us, and admin rights

Three features added in one pass, plus the documentation set.

### Optional price and stock for Services and Jobs

A Service (a tailoring slot, a repair) and a Job (a role you are hiring for) are
not sold like physical goods — there is no shelf price and no unit count.

- `Product.price` and `Product.stock` became `number | null`. `null` is a
  deliberate value meaning "price on enquiry" / "stock not tracked", and is
  deliberately **distinct from `0`**, which still means free / sold out.
- `ENQUIRY_CATEGORIES` (`storeConfig.ts`) lists the categories that treat both
  fields as optional. Matched case-insensitively.
- The admin form drops the `required` attribute on both fields in those
  categories and explains what a blank means.
- Everywhere else both stay **required**, so a typo can never silently make a
  product free. A blank stock is rejected outside those categories.
- `normalizeProduct()` preserves `null` while still repairing wrong types, so
  every existing record keeps working.

**Why:** requiring a price and a stock count for a job posting forced the store
owner to invent numbers. Nullable fields model the real situation and force every
consumer to decide what `null` means.

### Contact us instead of Add to cart

A listing with no fixed price has nothing to check out, so it is not sold online.

- New `components/ContactUs.tsx`, shown **in place of** the Add button.
- On a card it opens the listing; on the product page it reveals the store's
  email, phone and address, with the message pre-filled with the listing name and
  chosen options. The button reads *Hide contact details* when open.
- Enforced at three layers so it genuinely cannot be bought: the button is gone,
  `addToCart` refuses the product, and the API rejects an order naming one with
  *"… is arranged by enquiry, so it cannot be ordered online"* rather than
  quietly filing a $0 line.
- `isContactOnly()` keys off `price === null`, so setting a price restores normal
  selling.

### Per-listing contact details

- `Product` gained `contactName`, `contactPhone`, `contactEmail`.
- The admin form shows a **Who to contact about this** block for Services and
  Jobs only (both admin panels, since they share `ProductForm`).
- Each field falls back to the store-wide detail independently, so naming a
  person without a number still shows the store's number.
- Moving a listing out of Services/Jobs clears them, so nothing stale is left on
  a normally-sold product.
- Invalid emails are rejected server-side — a typo would silently break the
  shopper's mail client.

### Admin accounts and rights

- New `staff` table; owner credentials stay in `settings` so there is one place
  to look and the owner is unreachable by staff-management code.
- Twelve rights as a flat closed `Permission` union, plus five role presets
  (*Full access*, *Orders only*, *Catalogue manager*, *Stock clerk*, *View only*).
- All 21 admin routes now carry `requirePermission(...)` on top of `requireAdmin`:
  the 17 pre-existing ones plus the 4 new `/api/staff` endpoints.
- New **Admin → Staff** tab to create accounts, tick rights, and remove them.
- UI mirrors the server: tabs and controls the account cannot use are hidden, or
  shown disabled with an explanation.

Safety rules enforced server-side: the owner cannot be deleted, demoted or
duplicated; an account can never be left with zero rights; a staff account may
only grant rights it holds itself (so managing staff cannot escalate to owner);
unknown permission strings are dropped rather than honoured; changing or removing
someone signs their live sessions out so revocation is immediate.

**Why:** a shop assistant does not need the owner's bank details, and sharing one
login means no way to revoke one person without locking everyone out.

### Bug found and fixed during testing

`isEnquiryCategory()` returned `false` for **every** category: the list held
`'Services'` while the input was lowercased to `'services'`. Caught by asserting
against the real function rather than trusting the code read. Both sides are now
normalised.

### Documentation added

`docs/REBUILD.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/PERMISSIONS.md`,
`docs/DATA-MODEL.md`, `docs/TROUBLESHOOTING.md`, and this file.

---

## Before this session

The store ran entirely on `localStorage` — one browser, one device, ~5 MB
ceiling. It was rebuilt around an Express + SQLite backend
(`server/data/store.db`) so every visitor shares one catalogue and data survives
across browsers. The client and server agree on shapes through the same
`normalizeProduct()` helper.

Features in place at that point: product variants with per-variant stock, manual
payment methods (bank transfer, mobile money, pay on delivery) with per-method
switches, order status workflow with payment confirmation notes, AI product
descriptions via Gemini, database-record browsing with add/edit/delete, JSON
export/import, file tools (integrity check, optimize, backup, purge), and an
order-entry form for sales taken outside the site.

---

## Keep this file useful

A good entry says **what changed and why**, not just what changed. Write it when
the change is merged, not "later" — an entry you cannot remember the reason for
is not worth much.

If a change alters documented behaviour, update the owning doc too:

| Change | Update |
| --- | --- |
| A field or the schema | `docs/DATA-MODEL.md` |
| An endpoint or its guard | `docs/API.md` |
| A right, preset or safety rule | `docs/PERMISSIONS.md` |
| How the code fits together | `docs/ARCHITECTURE.md` |
| Setup steps or customisation | `docs/REBUILD.md`, `README.md` |
| A symptom or failure mode | `docs/TROUBLESHOOTING.md` |