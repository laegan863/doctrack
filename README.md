# DocTrack: IMISS Document Tracking System

A personal, single-user document tracking system built with **Next.js 16** and **Upstash Redis**, ready to deploy on **Vercel**.

- **Incoming & Outgoing**: log documents and get a tracking number such as `IMISS-1126-001` (shared monthly count), plus a printable routing slip with a QR code.
- **Routing**: Forward, Received by unit, Action taken, Return to owner, Re-process, Release, Served, Complete, and remarks. Each round of processing is a sub-transaction (`IMISS-1126-001-01`, `-02`, …) with its own route and the time spent at each stop.
- **Where are my documents?**: everything that's still out, grouped by division and unit, with overdue flags.
- **Search**: results as you type (`Ctrl+K` anywhere), plus a full search page with filters.
- **Reports**: register, status summary, unit workload & aging, overdue, turnaround time, and document history. Each can be exported to CSV (Excel) or printed / saved as PDF.
- **Settings**: add, edit, and deactivate divisions, units, and document types yourself.

See [PLAN.md](PLAN.md) for the full design and the rules behind each feature.

---

## 1. Run it on your computer

**You need:** Node.js 20 or newer, and a free [Upstash](https://console.upstash.com) account.

1. **Create a Redis database** in the Upstash console (**Create database → Redis**, pick the region closest to you). On the database page, open the **REST API** section and copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

2. **Create `.env.local`** in the project folder (copy `.env.example`) and fill it in:

   ```bash
   UPSTASH_REDIS_REST_URL=https://….upstash.io
   UPSTASH_REDIS_REST_TOKEN=…
   APP_PASSWORD=choose-a-strong-password
   SESSION_SECRET=paste-a-random-64-character-string
   # APP_TIMEZONE=Asia/Manila   (optional, this is the default)
   ```

   To generate `SESSION_SECRET`:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **Install, load sample offices, and start:**

   ```bash
   npm install
   npm run seed
   npm run dev
   ```

   Open http://localhost:3000 and sign in with your `APP_PASSWORD`.

`npm run seed` adds sample divisions, units, and document types. Rename or replace them in **Settings → Divisions & Units**. Running it again is safe: it only resets those sample records.

---

## 2. Deploy to Vercel

1. **Push the project to GitHub** (a private repository is recommended).

2. **Import it in Vercel:** [vercel.com/new](https://vercel.com/new) → pick the repository → keep the detected Next.js settings. Don't deploy yet if it asks for environment variables first. Adding them in the next steps is fine.

3. **Connect Redis.** In the Vercel project, go to **Storage → Create / Connect Database → Upstash (Redis)** and connect it to the project. Vercel adds the connection variables automatically (`KV_REST_API_URL` / `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`). DocTrack accepts either pair.
   *Using the same database you created in step 1 locally?* Then skip the integration and add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` yourself under **Settings → Environment Variables**.

4. **Add your login settings** under **Settings → Environment Variables** (Production):

   | Name | Value |
   |---|---|
   | `APP_PASSWORD` | your login password |
   | `SESSION_SECRET` | a new random 64-character string (don't reuse the local one) |
   | `APP_TIMEZONE` | optional, defaults to `Asia/Manila` |

5. **Deploy** (or **Redeploy** if it already ran), then open your `*.vercel.app` URL and sign in.

6. **Load your offices** on the live database, either:
   - in the app: **Settings → Divisions & Units** and **Document Types** (recommended for real data), or
   - with the sample seed: pull the production variables and run the seed against them:

     ```bash
     npx vercel env pull .env.production.local
     npx tsx --env-file=.env.production.local scripts/seed.ts
     ```

### After deploying

- **Change the password:** update `APP_PASSWORD` in Vercel, then redeploy.
- **Sign out every device:** change `SESSION_SECRET`, then redeploy. Sessions otherwise last 30 days.
- **Brute-force protection:** after 10 wrong passwords from one address, login is locked for 15 minutes.
- **Privacy:** the site asks search engines not to index it, and every page and API requires your login.
- **Usage limits:** Upstash counts every Redis command. Creating a document can use a few hundred commands, because each word is added to the search index. Later actions only index what changed, so they use far fewer. Watch the **Usage** tab on the Upstash dashboard for your first few weeks and compare it with your plan's limits.
- **Backups:** export the **Document register** report to CSV regularly (e.g. monthly). Upstash also offers backups on some plans.

---

## 3. Everyday use

| Task | Where |
|---|---|
| Log a document you received | **New Incoming** → save → print the routing slip |
| Log a document you're sending out | **New Outgoing** → save → print the routing slip |
| Record a move | Open the document (search, `Ctrl+K`, or scan the QR code) → use the action buttons |
| Document came back from its owner | **Return to owner**, then later **Re-process** (creates `-02`, `-03`, …) |
| See what's still out | **Where are my documents?** |
| Monthly report | **Reports** → pick one → set dates → **Export CSV** or **Print / PDF** |

---

## 4. Maintenance scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app locally |
| `npm run build` | Production build (what Vercel runs) |
| `npm run lint` | Check the code |
| `npm run seed` | Add or reset the sample divisions, units, and document types |
| `npm run reindex` | Rebuild the search index for all documents (only needed if search ever looks out of date) |

The scripts read `.env.local`. To run them against production, use `npx tsx --env-file=.env.production.local scripts/<name>.ts` after `npx vercel env pull .env.production.local`.

---

## 5. How it's built

- **Next.js 16 App Router** with Cache Components. Pages are Server Components; every change goes through a Server Action. There is no separate backend.
- **Upstash Redis** (REST) is the only storage. Each multi-key write runs in one `MULTI` transaction. The key layout is in [PLAN.md §6](PLAN.md).
- **Auth**: one password from an environment variable, and a signed session cookie (`jose`). `proxy.ts` blocks signed-out requests, and every Server Action and API route checks the session again.
- **Search**: a prefix index in Redis (`idx:{word-prefix}` sets). Matching is accent-insensitive and works on every Upstash plan.

```
app/
  login/                 password screen
  (app)/                 signed-in pages: dashboard, incoming/outgoing, documents, locations,
                         search, reports, settings
  api/search/            search-as-you-type endpoint
  api/reports/[type]/    CSV export
lib/
  repos/                 Redis data access: documents, locations, search, reports
  documents.ts           statuses, actions, due-date rules (shared with the browser)
  time.ts                office time-zone helpers
components/              UI pieces (sidebar, Ctrl+K palette, report tables, badges, …)
proxy.ts                 sign-in redirect
scripts/                 seed and reindex
```
