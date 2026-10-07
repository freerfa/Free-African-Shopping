# Rebuilding the project

Everything needed to reconstruct this store from an empty folder, in the order
that works. Follow the steps in order — each one assumes the previous is done.

---

## 1. Prerequisites

| Requirement | Version | Check with |
| --- | --- | --- |
| Node.js | 18 or newer (built on 22) | `node -v` |
| npm | 9 or newer | `npm -v` |

No database server to install — SQLite runs inside the Node process through
`better-sqlite3`. No global CLI tools are needed; everything runs through npm
scripts.

---

## 2. Create the project and install dependencies

```sh
mkdir free-african-shopping
cd free-african-shopping
npm init -y
```

Then install exactly these versions (or copy the `dependencies` and
`devDependencies` blocks from `package.json` verbatim — that file is the source
of truth):

```sh
npm install react@^19.1.0 react-dom@^19.1.0 express@^5.2.1 better-sqlite3@^13.0.3 @google/genai@^1.10.0
npm install -D typescript@~5.7.2 vite@^6.2.0 tsx@^4.23.15 concurrently@^10.0.5 \
  @types/node@^22.14.0 @types/react@^19.3.0 @types/react-dom@^19.3.0 \
  @types/express@^5.0.6 @types/better-sqlite3@^9.6.0 \
  tailwindcss@^3.4.19 postcss@^8.5.28 autoprefixer@^10.6.1
```

> **If `better-sqlite3` fails to install**, it compiles a native module. Install
> build tools first: `xcode-select --install` (macOS) or
> `sudo apt install build-essential python3` (Debian/Ubuntu).

---

## 3. Configuration files

Create these **before** the source, so the typechecker has something to read.

### `package.json` — scripts

```json
{
  "name": "free-african-shopping",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "concurrently -k -n api,web -c magenta,cyan \"npm:dev:api\" \"npm:dev:web\"",
    "dev:api": "tsx watch server/index.ts",
    "dev:web": "vite",
    "build": "vite build",
    "start": "tsx server/index.ts",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  }
}
```

The `"type": "module"` line matters: the server and tooling both use ESM.

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"]
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
```

### `vite.config.ts`

Two jobs: proxy `/api` to the Express server in dev (so the browser only ever
talks to one origin and needs no CORS), and inject the Gemini key at build time.

```ts
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: { alias: { '@': path.resolve(__dirname, '.') } },
    server: { proxy: { '/api': 'http://localhost:3001' } },
  };
});
```

### `tailwind.config.js` and `postcss.config.js`

Standard Tailwind v3 setup. The theme maps CSS custom properties
(`--color-gold`, `--color-dark`, …) so brand colours are data-driven at runtime
rather than baked into the CSS — see `storeConfig.ts` → `COLOR_VAR_MAP`.

### `.env.local` (optional)

Only needed for the AI description button:

```
GEMINI_API_KEY=your-key-here
```

This file is git-ignored. Without it the button reports a clear error instead of
breaking the page.

---

## 4. Build order (why this order)

Each step depends on the ones above it, so type errors stay small and
meaningful.

| # | File(s) | Why here |
| --- | --- | --- |
| 1 | `types.ts` | Every other file imports from it. All shared shapes, the `Permission` union, role presets. |
| 2 | `storeConfig.ts` | Store identity and defaults. Imports only from `types.ts`. |
| 3 | `constants.ts` | Seed catalogue. Imports `Product` only. |
| 4 | `lib/` (pure helpers) | `format`, `product`, `storage`, `payments`, `images`. No React, no server. |
| 5 | `server/db.ts` | Opens SQLite, creates the schema, exposes typed queries. |
| 6 | `server/auth.ts` | Password hashing, sessions, staff accounts, permissions. |
| 7 | `server/index.ts` | All routes. Depends on 5 and 6. |
| 8 | `lib/api.ts` | Typed client for every endpoint (mirror step 7). |
| 9 | `contexts/` | Store state, theme, toasts. |
| 10 | `components/` | Presentational. Leaf nodes last. |
| 11 | `App.tsx`, `index.tsx`, `index.html`, `index.css` | Entry points. |

### What each key file must contain

**`types.ts`** — the single source of truth. If a shape is used on both sides of
the wire it lives here and nowhere else:
`Product`, `ProductVariant`, `Order`, `OrderLine`, `PaymentInfo`, `CartItem`,
`DetailedCartItem`, `StoreConfig`, `StorePayments`, `StaffMember`, `User`, plus
the `Permission` union, `ALL_PERMISSIONS`, `PERMISSION_LABELS` and
`ROLE_PRESETS`.

**`lib/storage.ts`** — `normalizeProduct()` is the important one. It repairs
records written by older builds and is called by **both** client and server, so
the two ends always agree on shapes. Never construct a `Product` without passing
it through here.

**`server/db.ts`** — creates the schema with `CREATE TABLE IF NOT EXISTS`, so
starting against an existing file is a no-op migration. See
[DATA-MODEL.md](DATA-MODEL.md) for the tables.

---

## 5. Verify as you go

After **every** step, run:

```sh
npm run typecheck
```

`tsc --noEmit` covers the client and the server together, so it catches a broken
shape before you build three more files on top of it. Fix errors before moving
on rather than batching them at the end.

---

## 6. Run it

```sh
npm run dev
```

This starts two processes:

- **API + database** on `http://localhost:3001` (Express + SQLite, restarts on edit)
- **Vite dev server** on `http://localhost:5173` (proxies `/api` to the API)

Open **http://localhost:5173**.

First run creates `server/data/store.db`, seeds 8 demo products, and prints the
admin email it seeded.

### Production

```sh
npm run build     # builds the client into dist/
npm start         # serves API + built client on one port (PORT, default 3001)
```

When `dist/` exists the server serves it, so one process runs the whole store.

### Production on Render

The repo ships with `render.yaml`, so connecting it needs almost no typing:

1. Open **https://dashboard.render.com/web/new** → **Build and deploy from a Git
   repository** → select `freerfa/Free-African-Shopping`.
2. Render detects the blueprint and pre-fills one Web Service:
   build `npm install && npm run build`, start `npm start`.
3. Set **`ADMIN_PASSWORD`** in the dashboard (it is required, and never written
   to the repo). Optionally set `ADMIN_EMAIL` and `GEMINI_API_KEY`.
4. Deploy. First boot seeds the database on the attached persistent disk
   (`/var/data` via `DB_DIR`), so products, orders and admin accounts survive
   every redeploy. **Without that disk the store would reset to the demo seed on
   each deploy — that disk is the single most important setting.**

The built frontend is served from the same Express process (`dist/`, produced by
`npm run build`), so one service is the whole store. The service reports
`/api/health` for Render's health check.

**Cost — this is not a free deploy.** Render's Free plan explicitly does not
support persistent disks, and the disk is what keeps the SQLite database alive
across redeploys. The blueprint therefore pins the cheapest paid compute plan:

| Item | Price |
|---|---|
| Compute `0.5c-512mb` (512 MB RAM, 0.5 CPU) | $7/month |
| Persistent disk, 1 GB | $0.25/month |
| Hobby workspace | $0 |
| **Total** | **$7.25/month** |

If you change `plan: free` in `render.yaml`, you **must** also delete the
`disk:` block — Render rejects a blueprint that pairs them — and accept that
every deploy/restart wipes the database back to the 8-product seed.

Two behavioural notes with a disk attached: redeploys take a few seconds of
downtime (Render stops the old instance before starting the new one, to prevent
two instances writing the same SQLite file), and `npm start` uses `tsx`, so
`devDependencies` must be installed on the build (the default `npm install`
does this).

### Automatic updates: local → GitHub → Render

Once both halves below are in place, **every commit goes live without anyone
running `git push` or clicking Deploy**:

1. **Local → GitHub** — a `post-commit` git hook pushes `main` after every
   commit. Hooks are not versioned, so install it once per clone:

   ```sh
   #!/bin/sh
   GIT=/Applications/Xcode.app/Contents/Developer/usr/bin/git
   [ -x "$GIT" ] || GIT=git
   top=$("$GIT" rev-parse --show-toplevel 2>/dev/null) || exit 0
   cd "$top" || exit 0
   [ "$("$GIT" symbolic-ref --short HEAD 2>/dev/null)" = "main" ] || exit 0
   GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND='ssh -oBatchMode=yes -oConnectTimeout=10' \
     "$GIT" push origin main >>"$top/.git/auto-push.log" 2>&1
   ```

   Save as `.git/hooks/post-commit`, run `chmod +x .git/hooks/post-commit`.
   The explicit git path matters on machines where plain `git` is blocked by the
   Xcode licence. Every push is logged to `.git/auto-push.log`.

2. **GitHub → Render** — automatic by default. Render's docs: *"Whenever you
   push or merge a change to that branch, by default Render automatically
   rebuilds and redeploys your service."* Confirm the toggle at your service →
   **Settings → Auto-Deploy**. Put `[skip render]` in a commit message to push
   code **without** deploying it.

**What this does not cover:** store *data* (products, orders, staff, settings).
Edits made in the live site's Admin panel are already instant — no deploy
needed. The local dev database is gitignored and never syncs anywhere by
design (it contains password hashes); keep production edits on the live site.

---

## 7. Acceptance checklist

Confirm each before calling the rebuild done:

```sh
# Server is up
curl -s localhost:3001/api/health          # {"ok":true}

# Storefront renders
curl -s -o /dev/null -w '%{http_code}\n' localhost:5173   # 200

# Seed data loaded
curl -s localhost:3001/api/products | head -c 100          # array of products

# Owner can sign in
curl -s -X POST localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<seeded email>","password":"<seeded password>"}'
# -> {"token":"...","user":{"email":"...","isAdmin":true,"isOwner":true,...}}

# Typecheck and build are clean
npm run typecheck && npm run build
```

Then in the browser: browse the home page, open a product, add to cart, and
place a test order; sign in and confirm the **Products**, **Orders**,
**Settings**, **Database** and **Staff** tabs all appear.

**The most important check** is the permission boundary — prove that rights are
enforced by the server, not just hidden in the UI:

```sh
# Sign in as the owner, create a view-only account, then try to exceed it
OWNER=$(curl -s -X POST localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<owner>","password":"<password>"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

curl -s -X POST localhost:3001/api/staff -H "Authorization: Bearer $OWNER" \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@shop.com","password":"testpassword","permissions":["products.view"]}'

CLERK=$(curl -s -X POST localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@shop.com","password":"testpassword"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

curl -s -o /dev/null -w '%{http_code}\n' localhost:3001/api/orders -H "Authorization: Bearer $CLERK"
# must be 403 — this account holds only products.view
```

---

## 8. Customise before going live

| What | Where |
| --- | --- |
| Store name, currency, categories, brand colours, contact details | `storeConfig.ts` defaults, or **Admin → Settings** at runtime |
| First admin email/password | `storeConfig.ts`, or `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars |
| Where the database file lives | `DB_DIR` env var (default `server/data/`) |
| Server port | `PORT` env var (default `3001`) |
| Which categories skip price/stock | `ENQUIRY_CATEGORIES` in `storeConfig.ts` |
| Admin rights available | `ALL_PERMISSIONS` / `PERMISSION_LABELS` in `types.ts` |
| Ready-made role bundles | `ROLE_PRESETS` in `types.ts` |
| Seed catalogue | `constants.ts` (only used when the database is empty) |

**Before production:** change the owner password under **Admin → Settings**,
create a personal staff account, and take a backup (**Admin → Database →
Backup**) before you experiment.

---

## 9. Restore from a backup

1. Stop the server.
2. Replace `server/data/store.db` with your downloaded copy.
3. Start again.

Live backups use SQLite's `VACUUM INTO`, so the copy is consistent even while the
store is being written to.

---

## 10. Environment variables

| Variable | Read by | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | `server/index.ts` | `3001` | API/server port |
| `DB_DIR` | `server/db.ts` | `server/data/` | Where the SQLite file lives |
| `ADMIN_EMAIL` | `server/auth.ts` | from `storeConfig.ts` | First-run owner email |
| `ADMIN_PASSWORD` | `server/auth.ts` | from `storeConfig.ts` | First-run owner password |
| `GEMINI_API_KEY` | `vite.config.ts` | — | Enables AI product descriptions |

The admin variables only seed the account on a **fresh** database. Once
`adminAuth` exists in the database, change credentials from **Admin → Settings**
instead — the env vars are ignored.