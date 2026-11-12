/** Shared document types and labels (safe to import from client components). */

export type Direction = "IN" | "OUT";

export const STATUSES = {
  RECEIVED: "Received",
  PREPARED: "Prepared",
  FORWARDED: "Forwarded",
  RECEIVED_BY_UNIT: "Received by unit",
  ACTION_TAKEN: "Action taken",
  RETURNED: "Returned to owner",
  RELEASED: "Released",
  SERVED: "Served",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
} as const;
export type Status = keyof typeof STATUSES;

export const PRIORITIES = ["NORMAL", "URGENT", "RUSH"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = {
  NORMAL: "Normal",
  URGENT: "Urgent",
  RUSH: "Rush",
};

export const RECEIVED_VIA = ["Hand-carried", "Courier", "Mail", "Email", "Fax"] as const;
export const SERVICE_MODES = ["Hand-carried", "Courier", "Mail", "Email"] as const;
export const ACTIONS_REQUESTED = [
  "For appropriate action",
  "For information",
  "For signature",
  "For comment",
  "For file",
] as const;

/** Due-date rule: Normal = the type's days, Urgent = half (at least 1), Rush = 1 day. */
export function dueDays(typeDays: number, priority: Priority) {
  if (priority === "RUSH") return 1;
  if (priority === "URGENT") return Math.max(1, Math.ceil(typeDays / 2));
  return typeDays;
}

export type LocationRef = { type: "division" | "unit"; id: string; name: string };

export type DocumentRecord = {
  trackingNo: string;
  direction: Direction;
  status: Status;
  currentSub: string;
  subCount: number;
  createdAt: number;
  updatedAt: number;

  docTypeId: string;
  docTypeName: string;
  subject: string;
  description?: string;
  pages?: number;
  attachments?: string;
  priority: Priority;
  dueAt?: number;
  remarks?: string;

  location?: LocationRef;
  /** When the document arrived at its current location (for "time here"). */
  locSince?: number;

  // Incoming
  receivedAt?: number;
  receivedVia?: string;
  senderName?: string;
  senderOffice?: string;
  senderContact?: string;
  senderRef?: string;
  documentDate?: string;
  actionRequested?: string;

  // Outgoing
  preparedAt?: number;
  receivedByName?: string;
  receivedByOffice?: string;
  receivedByAddress?: string;
  serviceMode?: string;
  courierName?: string;
  waybillNo?: string;
  replyNeeded?: boolean;
  replyDueAt?: number;
};

export type SubTransaction = {
  subNo: string;
  rootNo: string;
  seq: number;
  status: Status;
  startedAt: number;
  endedAt?: number;
  location?: LocationRef;
};

export type TimelineEvent = {
  at: number;
  type: Status | "CREATED" | "REMARK";
  location?: LocationRef;
  by?: string;
  remarks?: string;
};

export function subNumber(rootNo: string, seq: number) {
  return `${rootNo}-${String(seq).padStart(2, "0")}`;
}

/** Accepts a root or sub number and returns the root (IMISS-1126-001-02 → IMISS-1126-001). */
export function rootOf(no: string) {
  const m = /^(IMISS-\d{4}-\d{3,})(?:-\d{2,})?$/i.exec(no.trim());
  return m ? m[1].toUpperCase() : null;
}

// ---------- routing actions (Phase 4) ----------

export const ACTION_KINDS = [
  "FORWARD",
  "RECEIVE",
  "ACT",
  "RETURN",
  "REPROCESS",
  "RELEASE",
  "SERVE",
  "COMPLETE",
  "REMARK",
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const ACTION_LABELS: Record<ActionKind, string> = {
  FORWARD: "Forward",
  RECEIVE: "Received by unit",
  ACT: "Action taken",
  RETURN: "Return to owner",
  REPROCESS: "Re-process",
  RELEASE: "Release",
  SERVE: "Served",
  COMPLETE: "Complete",
  REMARK: "Add remark",
};

/** Statuses in which the current sub-transaction is still being processed. */
export const OPEN_STATUSES: Status[] = [
  "RECEIVED",
  "PREPARED",
  "FORWARDED",
  "RECEIVED_BY_UNIT",
  "ACTION_TAKEN",
  "RELEASED",
];

export function isOpen(status: Status) {
  return OPEN_STATUSES.includes(status);
}

/** Which actions make sense for a document in its current state. */
export function availableActions(doc: Pick<DocumentRecord, "status" | "direction" | "location">): ActionKind[] {
  const s = doc.status;
  const out: ActionKind[] = [];
  const processing = ["RECEIVED", "PREPARED", "FORWARDED", "RECEIVED_BY_UNIT", "ACTION_TAKEN"].includes(s);

  if (s === "FORWARDED") out.push("RECEIVE");
  if (doc.location && ["FORWARDED", "RECEIVED_BY_UNIT", "ACTION_TAKEN"].includes(s)) out.push("ACT");
  if (processing) out.push("FORWARD");
  if (doc.direction === "OUT" && processing) out.push("RELEASE");
  if (doc.direction === "OUT" && s === "RELEASED") out.push("SERVE");
  if (isOpen(s)) out.push("RETURN");
  if (s === "RETURNED") out.push("REPROCESS");
  if (isOpen(s) || s === "SERVED") out.push("COMPLETE");
  out.push("REMARK");
  return out;
}

/** A stop on a sub-transaction's route, with how long the document stayed there. */
export type RouteStop = { location: LocationRef; from: number; to?: number };

/** Builds the route (unit to unit) from a timeline. The last stop is open while the document is still there. */
export function routeStops(timeline: TimelineEvent[], stillThere: boolean): RouteStop[] {
  const stops: RouteStop[] = [];
  for (const e of timeline) {
    const leaves = e.type === "FORWARDED" || e.type === "RETURNED" || e.type === "COMPLETED" || e.type === "RELEASED";
    const last = stops.at(-1);
    if (leaves && last && last.to === undefined) last.to = e.at;
    if (e.type === "FORWARDED" && e.location) stops.push({ location: e.location, from: e.at });
  }
  const last = stops.at(-1);
  if (last && last.to === undefined && !stillThere) last.to = last.from;
  return stops;
}

/** "3d 4h", "5h 12m", "8m" */
export function formatDuration(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}
