import { redis } from "@/lib/redis";
import { rootOf, type DocumentRecord, type Status, type TimelineEvent } from "@/lib/documents";
import { MAX_PREFIX, MIN_TERM, queryTerms, tokenize } from "@/lib/search-terms";
import { docKeys, getDocument, getDocuments, getSubTransactions } from "./documents";

/**
 * Prefix index: every word of a document is stored as all of its prefixes
 * (2..15 chars) in `idx:{prefix}` sets. A query intersects the sets of its words,
 * so "mar san" finds "Maria Santos" while typing. Works on every Upstash plan.
 */
const idxKey = (term: string) => `idx:${term}`;
const termsKey = (no: string) => `doc:${no}:terms`;

function prefixes(word: string) {
  const out: string[] = [];
  for (let i = MIN_TERM; i <= Math.min(word.length, MAX_PREFIX); i++) out.push(word.slice(0, i));
  return out;
}

/** All searchable text of a document: tracking/sub numbers, people, offices, subject, remarks, timeline. */
export function documentText(doc: DocumentRecord, subs: { subNo: string; timeline: TimelineEvent[] }[]) {
  const parts = [
    doc.trackingNo,
    ...subs.map((s) => s.subNo),
    doc.subject,
    doc.description,
    doc.docTypeName,
    doc.remarks,
    doc.attachments,
    doc.senderName,
    doc.senderOffice,
    doc.senderRef,
    doc.receivedByName,
    doc.receivedByOffice,
    doc.waybillNo,
    doc.courierName,
    doc.location?.name,
  ];
  for (const s of subs) for (const e of s.timeline) parts.push(e.by, e.remarks, e.location?.name);
  return parts.filter(Boolean).join(" ");
}

function termsFor(text: string) {
  const set = new Set<string>();
  for (const word of tokenize(text)) for (const p of prefixes(word)) set.add(p);
  return set;
}

/** Re-indexes one document, only touching terms that changed since last time. */
export async function reindexDocument(trackingNo: string) {
  const doc = await getDocument(trackingNo);
  if (!doc) return;
  const subs = await getSubTransactions(trackingNo);
  const next = termsFor(documentText(doc, subs));
  const prev = new Set((await redis().smembers(termsKey(trackingNo))).map(String));

  const added = [...next].filter((t) => !prev.has(t));
  const removed = [...prev].filter((t) => !next.has(t));
  if (added.length === 0 && removed.length === 0) return;

  const p = redis().pipeline();
  for (const t of added) p.sadd(idxKey(t), trackingNo);
  for (const t of removed) p.srem(idxKey(t), trackingNo);
  if (added.length) p.sadd(termsKey(trackingNo), ...(added as [string, ...string[]]));
  if (removed.length) p.srem(termsKey(trackingNo), ...removed);
  await p.exec();
}

/** Re-indexes every document (for `npm run reindex`). */
export async function reindexAll(onProgress?: (done: number, total: number) => void) {
  const all = (await redis().zrange<string[]>(docKeys.created, 0, -1)).map(String);
  for (let i = 0; i < all.length; i++) {
    await reindexDocument(all[i]);
    onProgress?.(i + 1, all.length);
  }
  return all.length;
}

export type SearchFilters = {
  direction?: "IN" | "OUT";
  status?: Status;
  docTypeId?: string;
  /** "unit:id" or "division:id" (current location). */
  location?: string;
  /** Created between these instants (inclusive). */
  from?: number;
  to?: number;
};

export type SearchResult = { total: number; docs: DocumentRecord[]; exact?: string };

/**
 * Finds documents matching every word of `q` (prefix match), newest first, then applies filters.
 * With an empty query, lists the newest documents that match the filters.
 */
export async function searchDocuments(q: string, filters: SearchFilters = {}, limit = 50): Promise<SearchResult> {
  const terms = queryTerms(q);
  const exact = rootOf(q) ?? undefined;
  let ids: string[];

  if (terms.length > 0) {
    ids = (await redis().sinter(...(terms.map(idxKey) as [string, ...string[]]))).map(String);
  } else {
    // No words: newest documents (filters narrow them below).
    ids = (await redis().zrange<string[]>(docKeys.created, 0, 999, { rev: true })).map(String);
  }
  if (ids.length === 0) return { total: 0, docs: [] };

  let docs = await getDocuments(ids);
  docs = docs.filter((d) => matches(d, filters));
  docs.sort((a, b) => {
    // An exact tracking-number hit always comes first.
    if (exact && a.trackingNo === exact) return -1;
    if (exact && b.trackingNo === exact) return 1;
    return b.createdAt - a.createdAt;
  });
  return { total: docs.length, docs: docs.slice(0, limit), exact: docs.some((d) => d.trackingNo === exact) ? exact : undefined };
}

function matches(d: DocumentRecord, f: SearchFilters) {
  if (f.direction && d.direction !== f.direction) return false;
  if (f.status && d.status !== f.status) return false;
  if (f.docTypeId && d.docTypeId !== f.docTypeId) return false;
  if (f.location) {
    const [type, id] = f.location.split(":");
    if (d.location?.type !== type || d.location?.id !== id) return false;
  }
  const created = d.receivedAt ?? d.preparedAt ?? d.createdAt;
  if (f.from && created < f.from) return false;
  if (f.to && created > f.to) return false;
  return true;
}
