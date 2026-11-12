# DocTrack — Document Tracking System: Development Plan

> Status: **Waiting for approval.** No application code has been written yet.

## 1. Goal

A **personal, single-user** document tracking system built **only with Next.js** (no separate backend) and **Redis** for storage, ready to deploy on **Vercel**. You are the only user. You record everything yourself: receiving a document, sending it to a unit, the unit acting on it, and so on. The system keeps track of where each document is.

- **Receiving**: log incoming documents and generate a unique tracking number.
- **Ongoing tracking**: record each move between divisions and units, with a full history of where every document has been.
- **Dynamic locations**: add, edit, and deactivate divisions and units yourself, without code changes.
- **Proactive search**: results appear as you type, across tracking numbers, titles, senders, and remarks.
- **Reports**: filterable summaries with CSV export and print-ready (PDF) output.

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16.4 (App Router, already installed) | Server Components, Server Actions, and Route Handlers stand in for a separate backend |
| Language | TypeScript | Type-safe data model |
| Storage | Redis via `@upstash/redis` | Vercel's Redis integration is Upstash. It uses HTTP/REST, so it works in serverless functions without connection-pool problems |
| Validation | `zod` | Validates every form and action input |
| Access lock | One password stored in an environment variable, plus a signed session cookie (`jose`) | No user accounts. The password only stops other people from opening your site once it's on Vercel |
| UI | Tailwind CSS v4 (already installed) | Responsive, clean UI |
| QR code | `qrcode` | QR code on the routing slip. Scanning it opens that document's page in DocTrack |

**Next.js 16 points the code will follow** (taken from the bundled docs):
- `middleware.ts` is now **`proxy.ts`**. It will be used only to send you to the login page when you aren't signed in.
- `params` and `searchParams` are **async** (they must be `await`ed).
- `cacheComponents: true` is on, so request-time data has to sit inside `<Suspense>` boundaries.
- Mutations will use Server Actions with `updateTag` / `refresh` so screens update immediately.

## 3. Single user, no accounts

- **There is only one user: you.** The app has no user accounts, roles, or user management screens.
- **Login:** one password screen. The password lives in `.env.local` locally and in Vercel's environment variables in production. Once you sign in, the session lasts 30 days.
- Units and divisions are **places a document can be**, not people who log in. Whenever a document changes hands, you record it, including **who received it** (a name you type, such as "Juan D. – Accounting").

## 4. Document lifecycle

```
RECEIVED ──► FORWARDED to unit ──► RECEIVED BY UNIT ──► ACTION TAKEN
                  ▲                       │                  │
                  └───────────────────────┴──────────────────┘
                                          │
                          RETURNED TO OWNER / COMPLETED / RELEASED / ARCHIVED
                                   │
                                   └──► Re-process ──► new sub-transaction (-02, -03, …)
```

- You record each step from the document's page with a single click and an optional remark.
- Every step is written to the document's **timeline** with the unit, the time, the person who received it, and your remarks.
- **Time in each unit** is calculated from the timeline, so you can see where documents get stuck.
- A document is flagged **Overdue** when it passes its due date (set by priority or document type) and is not yet completed.

## 4a. Forms (Incoming and Outgoing)

★ = required. Fields marked "suggest" offer names you've typed before as you type.

### Incoming: documents received by your office (`/incoming/new`)

| Section | Fields |
|---|---|
| **Tracking** | Tracking No. (automatic, `IMISS-MMYY-NNN`) · Date & time received ★ (defaults to now) · Received via ★ (Hand-carried / Courier / Mail / Email / Fax) |
| **Sender** | Sender name ★ (suggest) · Office / agency ★ (suggest) · Contact no. / email · Sender's reference no. (their own memo or letter number) · Date on the document |
| **Document** | Document type ★ (Memo, Letter, Voucher, Request, Invitation, …) · Subject / title ★ · Description / particulars · No. of pages · Attachments / enclosures (description) |
| **Action** | Priority ★ (Normal / Urgent / Rush) · Due date (filled in from the type and priority; you can change it) · Action requested (For appropriate action / For information / For signature / For comment / For file) |
| **First routing** | Route to: Division → Unit · Remarks |

When you save, the system creates the tracking number and opens the **routing slip with a QR code** for printing.

### Outgoing: documents your office sends out (`/outgoing/new`)

| Section | Fields |
|---|---|
| **Tracking** | Tracking No. (automatic) · Date prepared ★ |
| **Forward to** | One dropdown ★ that lists every **division and its units** (grouped by division). You can pick a whole division or a specific unit |
| **Received by** | Received by (name) ★ (suggest) · Office / agency ★ (suggest) · Address / email |
| **Document** | Document type ★ · Subject / title ★ · Description · No. of pages · Attachments / enclosures |
| **Mode of service** *(optional)* | Mode (Hand-carried / Courier / Mail / Email) · Courier name & waybill no. · Reply needed? (Yes/No) · Reply due date |
| **Remarks** | Remarks |

**Outgoing status flow:** `DRAFT / FOR SIGNATURE` (can be routed to units for signature or approval, the same way as incoming) → `RELEASED` (date released, released by) → `SERVED` (date served, received by) → `CLOSED`.

### Rules settled while building Phase 3

- **Due date (incoming):** Normal = the type's processing days, Urgent = half of that (at least 1 day), Rush = 1 day, counted from the date received. The form fills it in automatically, and you can change it. ↺ goes back to the automatic date.
- **Due date (outgoing):** the type's processing days from the date prepared (used for overdue tracking).
- **First routing (incoming)** is optional. Without it, the document stays with you as `RECEIVED`.
- **Time zone:** dates and the `MMYY` in tracking numbers use `APP_TIMEZONE` (default `Asia/Manila`), because Vercel servers run in UTC.
- **"Forward to" list** shows only active divisions and units.

### When each action is offered (Phase 4)

| Status | Actions shown |
|---|---|
| Received / Prepared (with you) | Forward, Release (OUT), Return, Complete, Remark |
| Forwarded | Received by unit, Action taken, Forward, Release (OUT), Return, Complete, Remark |
| Received by unit / Action taken | Action taken, Forward, Release (OUT), Return, Complete, Remark |
| Released (OUT) | Served, Return, Complete, Remark |
| Served (OUT) | Complete, Remark |
| Returned to owner | Re-process (new sub-transaction), Remark |
| Completed | Remark |

The server checks the same rules again, so an old browser tab can't apply an action that no longer fits. Dates on actions can't be in the future.

### Quick action forms (on each document's page)

| Action | Fields |
|---|---|
| **Forward** | To division → unit ★ · Action requested · Remarks |
| **Received by unit** | Received by (name) ★ · Date & time (defaults to now) |
| **Action taken** | What was done ★ · Date |
| **Return** | Returned to (unit or sender) ★ · Reason ★ |
| **Release / Serve** (outgoing) | Date ★ · Released by / received by · Mode of service (optional) |
| **Return to owner** | Reason ★ · Remarks. The current sub-transaction closes, and the document goes back to its owner |
| **Re-process** | Forward to ★ · Action requested · Remarks. Starts a **new sub-transaction** under the same tracking number (see 4b) |
| **Complete / Close** | Date · Final remarks |
| **Add remark** | Note ★ |

## 4b. Sub-transactions (one root, many rounds)

A document often goes back to its owner and then comes in again for more processing. It **keeps its root tracking number**. Each new round gets a **sub-transaction number** under that root:

```
IMISS-1126-001            ← root transaction (the document itself)
├── IMISS-1126-001-01     ← 1st round: Records → Accounting → Budget → returned to owner
├── IMISS-1126-001-02     ← 2nd round: owner resubmits → Accounting → Director → returned
└── IMISS-1126-001-03     ← 3rd round: … → COMPLETED
```

- The **first round (`-01`) is created automatically** when the document is received or prepared.
- **Re-process** on the root page starts the next round (`-02`, `-03`, …). There is no limit to how many rounds a document can have.
- **Each sub-transaction has its own** status, route timeline (every unit it passed through, who received it there, actions, remarks, time spent), and mode of service.
- The **root** shows a summary: the current round, overall status (taken from the latest round), total rounds, and total time from first receipt. Each round can be expanded to see its own path.
- **Search** works with either number. Searching `IMISS-1126-001` or `IMISS-1126-001-02` opens the same document with that round highlighted.
- **Reports** count both documents (roots) and processing rounds (subs), so you can see things like "documents returned more than twice".
- Applies to **both incoming and outgoing**.

## 5. Tracking number format

`IMISS-MMYY-NNN`, for example `IMISS-1126-001` (November 2026, first document of the month)

- **Incoming and outgoing share one count.** For example, `IMISS-1126-001` (IN), `IMISS-1126-002` (OUT), `IMISS-1126-003` (IN). Lists, filters, and reports separate them with an **IN / OUT** label.
- `MMYY` is the month and year the document is received or prepared.
- `NNN` is the order number. It **restarts at 001 every month** and is padded to 3 digits. If a month ever passes 999 documents, it continues as `1000`, `1001`, … so numbers are never duplicated.
- The number comes from a per-month counter in Redis (`seq:{YYYYMM}`), so no number is ever skipped or repeated, even if you submit twice quickly.

## 6. Redis data model

| Key | Type | Purpose |
|---|---|---|
| `division:{id}` / `unit:{id}` | Hash | Location details (name, code, head, active flag) |
| `divisions` / `division:{id}:units` | Set | Location hierarchy |
| `doctype:{id}` | Hash | Document types (Memo, Letter, Voucher, …) with default processing days |
| `seq:{YYYYMM}` | String (counter) | Monthly order-number sequence |
| `doc:{trackingNo}` | Hash | Root record (direction in/out, title, type, sender/received-by, priority, overall status, current round, dates) |
| `doc:{trackingNo}:subs` | List | Sub-transaction numbers in order (`-01`, `-02`, …) |
| `sub:{subNo}` | Hash | One round (status, current unit, mode of service, start/end dates) |
| `sub:{subNo}:timeline` | List | Routing and action history for that round (JSON entries) |
| `docs:created` | Sorted set (score = time) | Lists sorted by date, date-range reports |
| `docs:status:{status}` | Set | Filtering by status |
| `docs:unit:{unitId}` | Set | Documents currently in each unit |
| `docs:due` | Sorted set (score = due date) | Fast overdue lookup |
| `idx:{term}` | Set | Search index: word prefixes mapped to tracking numbers |

Each multi-key write (receive, forward, receipt by a unit) runs in a single Redis **transaction** (`MULTI`), so the indexes never fall out of sync with the document record.

**Search approach:** when a document is saved, its tracking number, title, sender, subject, and remarks are split into lowercase word prefixes and stored in `idx:*` sets. A query intersects those sets (`SINTER`) and then applies the filters. This works on every Upstash plan, needs no extra search service, and is fast enough for search-as-you-type.

## 7. Pages and features

| Route | Feature |
|---|---|
| `/login` | Password screen |
| `/` (Dashboard) | Counts for received today, out in units, overdue, and completed this month; how many documents each unit is holding; recent activity; documents that need follow-up |
| `/receive` | Receiving form (sender, origin office, type, subject, priority, page count, remarks, first destination unit). Generates the tracking number and opens a **printable routing slip with a QR code** |
| `/locations` | **Where are my documents?** Every division and unit with the documents currently there and how long each has been there |
| `/documents` | All documents in a table with filters (status, division, unit, type, priority, date range) and pagination |
| `/documents/[trackingNo]` | Document details, a **visual route timeline** (division → unit path with time spent at each stop), and quick action buttons (Forward, Received by unit, Action taken, Return, Complete, Add remark) |
| `/search` | Proactive search: debounced results as you type, a command palette (`Ctrl+K`) in the header, highlighted matches, recent searches |
| `/reports` | Reports, listed below |
| `/settings/divisions`, `/settings/units` | **Dynamic locations**: add, edit, or deactivate divisions and units; units are assigned to divisions |
| `/settings/document-types` | Manage document types and their default processing days |

### Reports
1. **Document register**: every document received in a date range.
2. **Status summary**: counts by status, division, and unit.
3. **Unit workload / aging**: documents on hand per unit and how long they have been there.
4. **Overdue report**: documents past their due date and where they are now.
5. **Turnaround time**: average processing time per unit and per document type.
6. **Document history**: the full routing trail for one document.

Each report has filters, a simple chart, **CSV export** (Route Handler), and a **print/PDF view** (print-optimized CSS, saved with the browser's "Save as PDF").

## 8. Project structure

```
app/
  login/
  (app)/                 # signed-in layout: sidebar + header search
    page.tsx             # dashboard
    receive/  locations/  documents/[trackingNo]/  search/  reports/
    settings/divisions/ units/ document-types/
  api/search/route.ts    # search-as-you-type endpoint
  api/reports/[type]/route.ts  # CSV export
lib/
  redis.ts               # Upstash client
  session.ts             # password check + session cookie
  repos/ documents.ts locations.ts search.ts reports.ts
  tracking-number.ts  validators.ts
components/              # UI pieces (Timeline, StatusBadge, DataTable, RoutingSlip …)
proxy.ts                 # redirect to /login when signed out
scripts/seed.ts          # sample divisions, units, document types, demo documents
```

## 9. Build phases

| Phase | What gets built | You can check |
|---|---|---|
| **1. Foundation** | Redis client, env setup, password login, `proxy.ts`, app layout, seed script | Logging in |
| **2. Locations and settings** | Divisions, units, document types | Building your organization structure |
| **3. Receiving** | Receive form, tracking number generator, routing slip with QR code | Receiving and printing a slip |
| **4. Tracking and routing** | Document page actions, timeline, the "Where are my documents?" page | Moving a document through units |
| **5. Search** | Search index, search-as-you-type API, `Ctrl+K` palette, `/search` page | Searching |
| **6. Dashboard and reports** | KPIs, the 6 reports, CSV and print output | Reports |
| **7. Polish and deploy prep** | Empty, loading, and error states; mobile layout; Vercel deploy guide; `.env.example` | Running a production build |

## 10. Setup you will need

- **Local development:** a free Upstash Redis database (or Vercel → Storage → Upstash Redis), with these values in `.env.local`:
  ```
  UPSTASH_REDIS_REST_URL=...
  UPSTASH_REDIS_REST_TOKEN=...
  APP_PASSWORD=...     # your login password
  SESSION_SECRET=...   # random 32+ chars
  ```
- **Vercel:** connect the same Upstash integration. It adds the Redis variables automatically. Add `APP_PASSWORD` and `SESSION_SECRET` yourself.

## 11. Decisions

1. **Users**: ✅ Confirmed: single user (you), with a password login and no other accounts.
2. **Tracking number format**: ✅ Confirmed: `IMISS-MMYY-NNN` (e.g. `IMISS-1126-001`), restarting every month. Sub-transactions add `-01`, `-02`, … (proposed; see 4b).
2a. **Outgoing numbering**: ✅ Confirmed: **shared**. Incoming and outgoing use the same monthly count, and each document is labeled with an **IN / OUT** badge.
3. **Public tracking page**: ✅ Removed, since the system is only for you.
4. **File attachments** (scanned PDFs or images of documents): **not in version 1**. They can be added later with Vercel Blob, since Redis is not suited to storing files.
5. **Sample org structure**: I'll seed **sample divisions and units** (e.g. Admin Division → Records Unit, HR Unit; Finance Division → Accounting Unit, Budget Unit). You can replace them from the settings screens, or send me your real list.

## 12. Out of scope for version 1 (possible later)

Email/SMS notifications, file attachments, digital signatures, additional users, offline mode.
