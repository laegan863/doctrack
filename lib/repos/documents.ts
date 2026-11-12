import { redis } from "@/lib/redis";
import { monthKeys } from "@/lib/time";
import {
  subNumber,
  type DocumentRecord,
  type LocationRef,
  type Status,
  type SubTransaction,
  type TimelineEvent,
} from "@/lib/documents";
import { keys as locKeys } from "./locations";

// Key layout (see PLAN.md §6)
export const docKeys = {
  seq: (yyyymm: string) => `seq:${yyyymm}`,
  doc: (no: string) => `doc:${no}`,
  subs: (no: string) => `doc:${no}:subs`,
  sub: (subNo: string) => `sub:${subNo}`,
  timeline: (subNo: string) => `sub:${subNo}:timeline`,
  created: "docs:created",
  due: "docs:due",
  status: (s: Status) => `docs:status:${s}`,
  direction: (d: string) => `docs:dir:${d}`,
  location: (l: LocationRef) => `docs:loc:${l.type}:${l.id}`,
  suggest: (kind: SuggestKind) => `suggest:${kind}`,
  /** Most recent actions across all documents (newest first, capped). */
  activity: "activity",
};

const ACTIVITY_MAX = 500;

export type ActivityEntry = {
  at: number;
  trackingNo: string;
  subNo: string;
  type: TimelineEvent["type"];
  subject: string;
  location?: LocationRef;
};

export type SuggestKind = "sender" | "office" | "recipient";

/** Next tracking number for the month of `epoch`: IMISS-MMYY-NNN. INCR is atomic, so numbers never repeat. */
export async function nextTrackingNo(epoch: number) {
  const { mmyy, yyyymm } = monthKeys(epoch);
  const n = await redis().incr(docKeys.seq(yyyymm));
  return `IMISS-${mmyy}-${String(n).padStart(3, "0")}`;
}

// ---------- (de)serialisation ----------

type Raw = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined || v === "" ? undefined : String(v));
const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const bool = (v: unknown) => v === true || v === "true" || v === 1 || v === "1";

function flatten(obj: Record<string, unknown>) {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    if (k === "location") {
      const l = v as LocationRef;
      out.locType = l.type;
      out.locId = l.id;
      out.locName = l.name;
    } else {
      out[k] = v as string | number | boolean;
    }
  }
  return out;
}

function readLocation(r: Raw): LocationRef | undefined {
  const type = str(r.locType);
  const id = str(r.locId);
  if (!id || (type !== "unit" && type !== "division")) return undefined;
  return { type, id, name: str(r.locName) ?? "" };
}

function toDocument(r: Raw): DocumentRecord {
  return {
    trackingNo: str(r.trackingNo)!,
    direction: str(r.direction) === "OUT" ? "OUT" : "IN",
    status: (str(r.status) ?? "RECEIVED") as Status,
    currentSub: str(r.currentSub)!,
    subCount: num(r.subCount) ?? 1,
    createdAt: num(r.createdAt) ?? 0,
    updatedAt: num(r.updatedAt) ?? 0,
    docTypeId: str(r.docTypeId) ?? "",
    docTypeName: str(r.docTypeName) ?? "",
    subject: str(r.subject) ?? "",
    description: str(r.description),
    pages: num(r.pages),
    attachments: str(r.attachments),
    priority: (str(r.priority) ?? "NORMAL") as DocumentRecord["priority"],
    dueAt: num(r.dueAt),
    remarks: str(r.remarks),
    location: readLocation(r),
    locSince: num(r.locSince),
    receivedAt: num(r.receivedAt),
    receivedVia: str(r.receivedVia),
    senderName: str(r.senderName),
    senderOffice: str(r.senderOffice),
    senderContact: str(r.senderContact),
    senderRef: str(r.senderRef),
    documentDate: str(r.documentDate),
    actionRequested: str(r.actionRequested),
    preparedAt: num(r.preparedAt),
    receivedByName: str(r.receivedByName),
    receivedByOffice: str(r.receivedByOffice),
    receivedByAddress: str(r.receivedByAddress),
    serviceMode: str(r.serviceMode),
    courierName: str(r.courierName),
    waybillNo: str(r.waybillNo),
    replyNeeded: bool(r.replyNeeded),
    replyDueAt: num(r.replyDueAt),
  };
}

function toSub(r: Raw): SubTransaction {
  return {
    subNo: str(r.subNo)!,
    rootNo: str(r.rootNo)!,
    seq: num(r.seq) ?? 1,
    status: (str(r.status) ?? "RECEIVED") as Status,
    startedAt: num(r.startedAt) ?? 0,
    endedAt: num(r.endedAt),
    location: readLocation(r),
  };
}

// ---------- create ----------

export type NewDocument = Omit<
  DocumentRecord,
  "trackingNo" | "currentSub" | "subCount" | "createdAt" | "updatedAt"
>;

/**
 * Creates a root document with its first sub-transaction (-01) and timeline,
 * and updates every index in one transaction.
 */
export async function createDocument(
  input: NewDocument,
  events: Omit<TimelineEvent, "at">[],
  suggestions: Partial<Record<SuggestKind, (string | undefined)[]>>,
) {
  const now = Date.now();
  const trackingNo = await nextTrackingNo(input.receivedAt ?? input.preparedAt ?? now);
  const subNo = subNumber(trackingNo, 1);

  const doc: DocumentRecord = {
    ...input,
    trackingNo,
    currentSub: subNo,
    subCount: 1,
    createdAt: now,
    updatedAt: now,
    locSince: input.location ? now : undefined,
  };
  const sub: SubTransaction = {
    subNo,
    rootNo: trackingNo,
    seq: 1,
    status: doc.status,
    startedAt: input.receivedAt ?? input.preparedAt ?? now,
    location: doc.location,
  };

  const tx = redis().multi();
  tx.hset(docKeys.doc(trackingNo), flatten(doc));
  tx.rpush(docKeys.subs(trackingNo), subNo);
  tx.hset(docKeys.sub(subNo), flatten(sub));
  for (const e of events) tx.rpush(docKeys.timeline(subNo), { ...e, at: now });

  tx.zadd(docKeys.created, { score: now, member: trackingNo });
  tx.sadd(docKeys.status(doc.status), trackingNo);
  tx.sadd(docKeys.direction(doc.direction), trackingNo);
  if (doc.location) tx.sadd(docKeys.location(doc.location), trackingNo);
  if (doc.dueAt) tx.zadd(docKeys.due, { score: doc.dueAt, member: trackingNo });

  // Once used, a type / location can no longer be deleted (only deactivated).
  if (doc.docTypeId) tx.hset(locKeys.doctype(doc.docTypeId), { used: true });
  if (doc.location) {
    const key = doc.location.type === "unit" ? locKeys.unit : locKeys.division;
    tx.hset(key(doc.location.id), { used: true });
  }

  tx.lpush(docKeys.activity, {
    at: now,
    trackingNo,
    subNo,
    type: doc.status,
    subject: doc.subject,
    location: doc.location,
  } satisfies ActivityEntry);
  tx.ltrim(docKeys.activity, 0, ACTIVITY_MAX - 1);

  for (const [kind, values] of Object.entries(suggestions) as [SuggestKind, (string | undefined)[]][]) {
    for (const v of values) if (v) tx.zincrby(docKeys.suggest(kind), 1, v);
  }

  await tx.exec();
  return doc;
}

// ---------- transitions (Phase 4) ----------

export type Transition = {
  /** New status for the document and its current sub-transaction. */
  status?: Status;
  /** New location; `null` clears it (back with the owner / finished). Omit to keep. */
  location?: LocationRef | null;
  /** Close the current sub-transaction (Return / Complete / Served). */
  closeSub?: boolean;
  /** Start a new sub-transaction (Re-process). Its first event is `event`. */
  newSub?: boolean;
  /** Timeline entry to record. `at` defaults to now. */
  event: Omit<TimelineEvent, "at"> & { at?: number };
  /** Extra document fields to update (e.g. served date, mode of service). */
  fields?: Partial<DocumentRecord>;
  suggestions?: Partial<Record<SuggestKind, (string | undefined)[]>>;
};

/** Applies one routing action to a document and keeps every index in sync. */
export async function applyTransition(doc: DocumentRecord, t: Transition) {
  const now = Date.now();
  const tx = redis().multi();
  const no = doc.trackingNo;

  let subNo = doc.currentSub;
  let subCount = doc.subCount;
  if (t.newSub) {
    subCount += 1;
    subNo = subNumber(no, subCount);
    tx.rpush(docKeys.subs(no), subNo);
    tx.hset(docKeys.sub(subNo), { subNo, rootNo: no, seq: subCount, status: t.status ?? doc.status, startedAt: now });
  }

  const status = t.status ?? doc.status;
  const location = t.location === undefined ? doc.location : (t.location ?? undefined);
  const moved =
    t.location !== undefined &&
    (location?.type !== doc.location?.type || location?.id !== doc.location?.id);

  // Document hash
  const docFields: Record<string, unknown> = { ...t.fields, status, currentSub: subNo, subCount, updatedAt: now };
  if (moved) {
    tx.hdel(docKeys.doc(no), "locType", "locId", "locName", "locSince");
    if (location) Object.assign(docFields, { location, locSince: now });
  }
  tx.hset(docKeys.doc(no), flatten(docFields));

  // Current sub-transaction hash
  const subFields: Record<string, unknown> = { status };
  if (moved) {
    tx.hdel(docKeys.sub(subNo), "locType", "locId", "locName");
    if (location) subFields.location = location;
  }
  if (t.closeSub) subFields.endedAt = now;
  tx.hset(docKeys.sub(subNo), flatten(subFields));

  // Timeline + activity feed
  const event: TimelineEvent = { ...t.event, at: t.event.at ?? now };
  tx.rpush(docKeys.timeline(subNo), event);
  tx.lpush(docKeys.activity, {
    at: event.at,
    trackingNo: no,
    subNo,
    type: event.type,
    subject: doc.subject,
    location: event.location,
  } satisfies ActivityEntry);
  tx.ltrim(docKeys.activity, 0, ACTIVITY_MAX - 1);

  // Indexes
  if (status !== doc.status) {
    tx.srem(docKeys.status(doc.status), no);
    tx.sadd(docKeys.status(status), no);
  }
  if (moved) {
    if (doc.location) tx.srem(docKeys.location(doc.location), no);
    if (location) {
      tx.sadd(docKeys.location(location), no);
      const key = location.type === "unit" ? locKeys.unit : locKeys.division;
      tx.hset(key(location.id), { used: true });
    }
  }
  // Finished documents can no longer be overdue.
  if (status === "COMPLETED" || status === "SERVED" || status === "ARCHIVED") tx.zrem(docKeys.due, no);
  else if (doc.dueAt && !["COMPLETED", "SERVED", "ARCHIVED"].includes(status)) {
    tx.zadd(docKeys.due, { score: doc.dueAt, member: no });
  }

  for (const [kind, values] of Object.entries(t.suggestions ?? {}) as [SuggestKind, (string | undefined)[]][]) {
    for (const v of values) if (v) tx.zincrby(docKeys.suggest(kind), 1, v);
  }

  await tx.exec();
  return { subNo };
}

// ---------- read ----------

export async function getDocument(trackingNo: string) {
  const r = await redis().hgetall<Raw>(docKeys.doc(trackingNo));
  return r && Object.keys(r).length ? toDocument(r) : null;
}

export async function getSubTransactions(trackingNo: string) {
  const subNos = await redis().lrange<string>(docKeys.subs(trackingNo), 0, -1);
  if (subNos.length === 0) return [];
  const p = redis().pipeline();
  for (const s of subNos) {
    p.hgetall(docKeys.sub(s));
    p.lrange(docKeys.timeline(s), 0, -1);
  }
  const res = (await p.exec()) as unknown[];
  return subNos.map((_, i) => ({
    ...toSub((res[i * 2] as Raw) ?? {}),
    timeline: ((res[i * 2 + 1] as TimelineEvent[]) ?? []).map((e) =>
      typeof e === "string" ? (JSON.parse(e) as TimelineEvent) : e,
    ),
  }));
}

/** Loads many documents at once (missing ones are skipped). */
export async function getDocuments(trackingNos: string[]) {
  if (trackingNos.length === 0) return [];
  const p = redis().pipeline();
  for (const no of trackingNos) p.hgetall(docKeys.doc(no));
  const rows = (await p.exec()) as (Raw | null)[];
  return rows.filter((r): r is Raw => !!r && Object.keys(r).length > 0).map(toDocument);
}

/** Documents currently at a location, or with you (no location, still open or returned). */
export async function getDocumentsAt(loc: LocationRef) {
  return getDocuments(await redis().smembers(docKeys.location(loc)));
}

export async function getDocumentsWithStatus(statuses: Status[]) {
  const p = redis().pipeline();
  for (const s of statuses) p.smembers(docKeys.status(s));
  const lists = (await p.exec()) as string[][];
  return getDocuments([...new Set(lists.flat())]);
}

export async function getSuggestions(kind: SuggestKind, limit = 300) {
  return redis().zrange<string[]>(docKeys.suggest(kind), 0, limit - 1, { rev: true });
}
