import { redis } from "@/lib/redis";
import {
  PRIORITY_LABELS,
  STATUSES,
  formatDuration,
  isOpen,
  routeStops,
  type DocumentRecord,
  type Status,
} from "@/lib/documents";
import { formatDate, formatDateTime } from "@/lib/time";
import { docKeys, getDocument, getDocuments, getSubTransactions, type ActivityEntry } from "./documents";

const DAY = 86_400_000;

// ---------- shared shapes ----------

export type Column = { key: string; label: string; align?: "right" };
export type Row = Record<string, string | number | undefined> & { _href?: string };
export type Section = {
  title: string;
  columns: Column[];
  rows: Row[];
  /** Draw a horizontal bar chart from these columns. */
  chart?: { label: string; value: string };
  empty?: string;
};
export type Report = { title: string; subtitle: string; sections: Section[] };

export type ReportFilters = {
  from: number;
  to: number;
  direction?: "IN" | "OUT";
  docTypeId?: string;
};

export const REPORT_TYPES = {
  register: { title: "Document register", desc: "Every document received or prepared in a date range.", ranged: true },
  status: { title: "Status summary", desc: "Counts by status, direction, type, and current division / unit.", ranged: true },
  workload: { title: "Unit workload & aging", desc: "What each unit is holding right now and for how long.", ranged: false },
  overdue: { title: "Overdue report", desc: "Open documents past their due date and where they are.", ranged: false },
  turnaround: { title: "Turnaround time", desc: "Average time spent per unit and total processing time per type.", ranged: true },
  history: { title: "Document history", desc: "The full routing trail of one document, ready to print.", ranged: false },
} as const;
export type ReportType = keyof typeof REPORT_TYPES;

// ---------- data loading ----------

/** The date that counts for reports: when it was received (IN) or prepared (OUT). */
export const docDate = (d: DocumentRecord) => d.receivedAt ?? d.preparedAt ?? d.createdAt;

/** Documents whose received/prepared date falls in [from, to]. */
export async function documentsInRange(f: ReportFilters) {
  // Indexed by creation time; allow for documents back-dated up to 90 days.
  const ids = await redis().zrange<string[]>(docKeys.created, f.from - 90 * DAY, f.to + DAY, { byScore: true });
  const docs = await getDocuments(ids.map(String));
  return docs
    .filter((d) => docDate(d) >= f.from && docDate(d) <= f.to)
    .filter((d) => !f.direction || d.direction === f.direction)
    .filter((d) => !f.docTypeId || d.docTypeId === f.docTypeId)
    .sort((a, b) => docDate(a) - docDate(b));
}

async function openDocuments() {
  const statuses: Status[] = ["RECEIVED", "PREPARED", "FORWARDED", "RECEIVED_BY_UNIT", "ACTION_TAKEN", "RELEASED"];
  const p = redis().pipeline();
  for (const s of statuses) p.smembers(docKeys.status(s));
  const ids = [...new Set(((await p.exec()) as string[][]).flat().map(String))];
  return getDocuments(ids);
}

export async function overdueDocuments(now: number) {
  const ids = await redis().zrange<string[]>(docKeys.due, 0, now, { byScore: true });
  const docs = await getDocuments(ids.map(String));
  return docs.filter((d) => isOpen(d.status)).sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
}

export async function recentActivity(limit = 15) {
  const rows = await redis().lrange<ActivityEntry | string>(docKeys.activity, 0, limit - 1);
  return rows.map((r) => (typeof r === "string" ? (JSON.parse(r) as ActivityEntry) : r));
}

// ---------- helpers ----------

const party = (d: DocumentRecord) =>
  d.direction === "IN"
    ? [d.senderName, d.senderOffice].filter(Boolean).join(" · ")
    : [d.receivedByName, d.receivedByOffice].filter(Boolean).join(" · ");

function countBy<T>(items: T[], key: (t: T) => string) {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

const days = (ms: number) => Math.round((ms / DAY) * 10) / 10;

// ---------- reports ----------

export async function buildReport(
  type: ReportType,
  f: ReportFilters,
  now: number,
  trackingNo?: string,
): Promise<Report> {
  const range = `${formatDate(f.from)} – ${formatDate(f.to)}`;
  const scope = [f.direction === "IN" ? "Incoming only" : f.direction === "OUT" ? "Outgoing only" : null]
    .filter(Boolean)
    .join(" · ");
  const subtitle = (base: string) => [base, scope].filter(Boolean).join(" · ");

  switch (type) {
    case "register": {
      const docs = await documentsInRange(f);
      return {
        title: REPORT_TYPES.register.title,
        subtitle: subtitle(`${range} · ${docs.length} documents`),
        sections: [
          {
            title: "Documents",
            columns: [
              { key: "no", label: "Tracking no." },
              { key: "date", label: "Date" },
              { key: "dir", label: "In/Out" },
              { key: "type", label: "Type" },
              { key: "subject", label: "Subject" },
              { key: "party", label: "From / To" },
              { key: "priority", label: "Priority" },
              { key: "status", label: "Status" },
              { key: "where", label: "Where now" },
            ],
            rows: docs.map((d) => ({
              _href: `/documents/${d.trackingNo}`,
              no: d.trackingNo,
              date: formatDateTime(docDate(d)),
              dir: d.direction,
              type: d.docTypeName,
              subject: d.subject,
              party: party(d),
              priority: PRIORITY_LABELS[d.priority],
              status: STATUSES[d.status],
              where: d.location?.name ?? "",
            })),
            empty: "No documents in this period.",
          },
        ],
      };
    }

    case "status": {
      const docs = await documentsInRange(f);
      const byStatus = countBy(docs, (d) => STATUSES[d.status]);
      const byType = countBy(docs, (d) => d.docTypeName || "—");
      const byDir = countBy(docs, (d) => (d.direction === "IN" ? "Incoming" : "Outgoing"));
      const open = (await openDocuments()).filter((d) => d.location);
      const byWhere = countBy(open, (d) => d.location!.name);
      const toRows = (pairs: [string, number][]) => pairs.map(([label, count]) => ({ label, count }));
      const cols = (label: string): Column[] => [
        { key: "label", label },
        { key: "count", label: "Documents", align: "right" },
      ];
      return {
        title: REPORT_TYPES.status.title,
        subtitle: subtitle(`${range} · ${docs.length} documents`),
        sections: [
          { title: "By status", columns: cols("Status"), rows: toRows(byStatus), chart: { label: "label", value: "count" } },
          { title: "By direction", columns: cols("Direction"), rows: toRows(byDir), chart: { label: "label", value: "count" } },
          { title: "By document type", columns: cols("Type"), rows: toRows(byType), chart: { label: "label", value: "count" } },
          {
            title: "Currently in each division / unit (all open documents)",
            columns: cols("Location"),
            rows: toRows(byWhere),
            chart: { label: "label", value: "count" },
            empty: "No documents are out right now.",
          },
        ],
      };
    }

    case "workload": {
      const open = (await openDocuments()).filter((d) => d.location);
      const groups = new Map<string, DocumentRecord[]>();
      for (const d of open) groups.set(d.location!.name, [...(groups.get(d.location!.name) ?? []), d]);
      const rows = [...groups.entries()]
        .map(([name, ds]) => {
          const ages = ds.map((d) => now - (d.locSince ?? d.updatedAt));
          return {
            label: name,
            count: ds.length,
            d1: ages.filter((a) => a < DAY).length,
            d3: ages.filter((a) => a >= DAY && a < 3 * DAY).length,
            d7: ages.filter((a) => a >= 3 * DAY && a < 7 * DAY).length,
            older: ages.filter((a) => a >= 7 * DAY).length,
            overdue: ds.filter((d) => d.dueAt && d.dueAt < now).length,
            oldest: formatDuration(Math.max(...ages)),
          };
        })
        .sort((a, b) => b.count - a.count);
      const detail = open
        .slice()
        .sort((a, b) => (a.locSince ?? a.updatedAt) - (b.locSince ?? b.updatedAt))
        .map((d) => ({
          _href: `/documents/${d.trackingNo}`,
          no: d.trackingNo,
          subject: d.subject,
          where: d.location!.name,
          status: STATUSES[d.status],
          since: formatDateTime(d.locSince ?? d.updatedAt),
          age: formatDuration(now - (d.locSince ?? d.updatedAt)),
          due: formatDate(d.dueAt),
        }));
      return {
        title: REPORT_TYPES.workload.title,
        subtitle: `As of ${formatDateTime(now)} · ${open.length} documents out`,
        sections: [
          {
            title: "Per division / unit",
            columns: [
              { key: "label", label: "Location" },
              { key: "count", label: "On hand", align: "right" },
              { key: "d1", label: "< 1 day", align: "right" },
              { key: "d3", label: "1–3 days", align: "right" },
              { key: "d7", label: "3–7 days", align: "right" },
              { key: "older", label: "> 7 days", align: "right" },
              { key: "overdue", label: "Overdue", align: "right" },
              { key: "oldest", label: "Oldest", align: "right" },
            ],
            rows,
            chart: { label: "label", value: "count" },
            empty: "No documents are out right now.",
          },
          {
            title: "Documents, longest waiting first",
            columns: [
              { key: "no", label: "Tracking no." },
              { key: "subject", label: "Subject" },
              { key: "where", label: "Where" },
              { key: "status", label: "Status" },
              { key: "since", label: "Arrived" },
              { key: "age", label: "Time there", align: "right" },
              { key: "due", label: "Due" },
            ],
            rows: detail,
            empty: "No documents are out right now.",
          },
        ],
      };
    }

    case "overdue": {
      const docs = await overdueDocuments(now);
      return {
        title: REPORT_TYPES.overdue.title,
        subtitle: `As of ${formatDateTime(now)} · ${docs.length} overdue`,
        sections: [
          {
            title: "Overdue documents, most overdue first",
            columns: [
              { key: "no", label: "Tracking no." },
              { key: "subject", label: "Subject" },
              { key: "type", label: "Type" },
              { key: "priority", label: "Priority" },
              { key: "due", label: "Due" },
              { key: "late", label: "Days late", align: "right" },
              { key: "where", label: "Where now" },
              { key: "status", label: "Status" },
            ],
            rows: docs.map((d) => ({
              _href: `/documents/${d.trackingNo}`,
              no: d.trackingNo,
              subject: d.subject,
              type: d.docTypeName,
              priority: PRIORITY_LABELS[d.priority],
              due: formatDate(d.dueAt),
              late: Math.max(1, Math.ceil((now - (d.dueAt ?? now)) / DAY)),
              where: d.location?.name ?? (d.status === "RELEASED" ? "Out for service" : "With you"),
              status: STATUSES[d.status],
            })),
            empty: "Nothing is overdue. 🎉",
          },
        ],
      };
    }

    case "turnaround": {
      const docs = await documentsInRange(f);
      const perUnit = new Map<string, number[]>();
      const perType = new Map<string, number[]>();
      // Load timelines in parallel batches.
      const allSubs: Awaited<ReturnType<typeof getSubTransactions>>[] = [];
      for (let i = 0; i < docs.length; i += 25) {
        allSubs.push(...(await Promise.all(docs.slice(i, i + 25).map((d) => getSubTransactions(d.trackingNo)))));
      }
      for (const [i, d] of docs.entries()) {
        const subs = allSubs[i];
        for (const s of subs) {
          for (const stop of routeStops(s.timeline, false)) {
            if (stop.to === undefined || stop.to <= stop.from) continue;
            perUnit.set(stop.location.name, [...(perUnit.get(stop.location.name) ?? []), stop.to - stop.from]);
          }
        }
        if (d.status === "COMPLETED" || d.status === "SERVED") {
          const last = subs.at(-1)?.timeline.at(-1)?.at ?? d.updatedAt;
          perType.set(d.docTypeName || "—", [...(perType.get(d.docTypeName || "—") ?? []), last - docDate(d)]);
        }
      }
      const stat = (m: Map<string, number[]>) =>
        [...m.entries()]
          .map(([label, xs]) => ({
            label,
            count: xs.length,
            avg: days(xs.reduce((a, b) => a + b, 0) / xs.length),
            max: days(Math.max(...xs)),
          }))
          .sort((a, b) => b.avg - a.avg);
      const columns = (label: string, count: string): Column[] => [
        { key: "label", label },
        { key: "count", label: count, align: "right" },
        { key: "avg", label: "Average days", align: "right" },
        { key: "max", label: "Longest days", align: "right" },
      ];
      return {
        title: REPORT_TYPES.turnaround.title,
        subtitle: subtitle(`${range} · ${docs.length} documents`),
        sections: [
          {
            title: "Time spent at each division / unit (finished stops)",
            columns: columns("Location", "Stops"),
            rows: stat(perUnit),
            chart: { label: "label", value: "avg" },
            empty: "No finished stops in this period yet.",
          },
          {
            title: "Total processing time per document type (completed / served)",
            columns: columns("Type", "Documents"),
            rows: stat(perType),
            chart: { label: "label", value: "avg" },
            empty: "No completed documents in this period yet.",
          },
        ],
      };
    }

    case "history": {
      const doc = trackingNo ? await getDocument(trackingNo) : null;
      if (!doc) {
        return {
          title: REPORT_TYPES.history.title,
          subtitle: trackingNo ? `${trackingNo} was not found.` : "Enter a tracking number.",
          sections: [],
        };
      }
      const subs = await getSubTransactions(doc.trackingNo);
      return {
        title: `${REPORT_TYPES.history.title}: ${doc.trackingNo}`,
        subtitle: `${doc.subject} · ${doc.direction === "IN" ? "Incoming" : "Outgoing"} · ${doc.docTypeName} · ${STATUSES[doc.status]}`,
        sections: subs.map((s) => ({
          title: `${s.subNo} · ${STATUSES[s.status]}`,
          columns: [
            { key: "at", label: "Date / time" },
            { key: "event", label: "Event" },
            { key: "where", label: "Division / unit" },
            { key: "by", label: "By" },
            { key: "remarks", label: "Remarks" },
          ],
          rows: s.timeline.map((e) => ({
            at: formatDateTime(e.at),
            event: e.type === "REMARK" ? "Remark" : e.type === "CREATED" ? "Created" : STATUSES[e.type],
            where: e.location?.name ?? "",
            by: e.by ?? "",
            remarks: e.remarks ?? "",
          })),
        })),
      };
    }
  }
}

/** CSV with every section, separated by a blank line. Excel-friendly (BOM + CRLF). */
export function reportToCsv(r: Report) {
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? "" : String(v);
    // Neutralise spreadsheet formulas in user-entered text.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines: string[] = [esc(r.title), esc(r.subtitle), ""];
  for (const s of r.sections) {
    lines.push(esc(s.title));
    lines.push(s.columns.map((c) => esc(c.label)).join(","));
    for (const row of s.rows) lines.push(s.columns.map((c) => esc(row[c.key])).join(","));
    lines.push("");
  }
  return "﻿" + lines.join("\r\n"); // BOM so Excel reads UTF-8 (ñ, é) correctly
}

// ---------- dashboard ----------

export async function dashboardData(now: number, todayStart: number, monthStart: number) {
  const statusIds = async (statuses: Status[]) => {
    const p = redis().pipeline();
    for (const s of statuses) p.smembers(docKeys.status(s));
    return [...new Set(((await p.exec()) as string[][]).flat().map(String))];
  };

  const [today, open, overdue, finishedIds, activity] = await Promise.all([
    documentsInRange({ from: todayStart, to: now }),
    openDocuments(),
    overdueDocuments(now),
    statusIds(["COMPLETED", "SERVED"]),
    recentActivity(12),
  ]);
  const finished = await getDocuments(finishedIds);

  const out = open.filter((d) => d.location);
  const byLocation = countBy(out, (d) => d.location!.name).slice(0, 8);
  const dueSoon = open
    .filter((d) => d.dueAt && d.dueAt >= now && d.dueAt < now + 2 * DAY)
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));

  return {
    counts: {
      receivedToday: today.filter((d) => d.direction === "IN").length,
      preparedToday: today.filter((d) => d.direction === "OUT").length,
      out: out.length,
      withYou: open.filter((d) => !d.location && (d.status === "RECEIVED" || d.status === "PREPARED")).length,
      overdue: overdue.length,
      completedThisMonth: finished.filter((d) => d.updatedAt >= monthStart).length,
    },
    byLocation,
    overdue: overdue.slice(0, 6),
    dueSoon: dueSoon.slice(0, 6),
    activity,
  };
}
