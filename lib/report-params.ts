import type { ReportFilters } from "@/lib/repos/reports";
import { endOfDayZoned, monthStartInput, parseZoned, toDateInput } from "@/lib/time";

export type RawParams = Record<string, string | string[] | undefined>;
export type ReportQuery = { from: string; to: string; dir: string; type: string; no: string };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Reads report filters from the URL. Defaults to this month so far. */
export function parseReportParams(sp: RawParams | URLSearchParams, now: number) {
  const get = (k: string) => (sp instanceof URLSearchParams ? (sp.get(k) ?? "") : one(sp[k]));
  const query: ReportQuery = {
    from: isDate(get("from")) ? get("from") : monthStartInput(now),
    to: isDate(get("to")) ? get("to") : toDateInput(now),
    dir: get("dir") === "IN" || get("dir") === "OUT" ? get("dir") : "",
    type: get("type"),
    no: get("no").trim().toUpperCase(),
  };
  const filters: ReportFilters = {
    from: parseZoned(query.from),
    to: endOfDayZoned(query.to),
    direction: (query.dir || undefined) as ReportFilters["direction"],
    docTypeId: query.type || undefined,
  };
  return { query, filters };
}

export function toQueryString(q: ReportQuery) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
  return p.toString();
}
