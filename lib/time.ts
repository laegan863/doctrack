/**
 * Date helpers that use the office's time zone, not the server's.
 * Vercel servers run in UTC, so "today" and the tracking-number month must be
 * computed in APP_TIMEZONE (default Asia/Manila).
 */
export const TIMEZONE = process.env.APP_TIMEZONE || "Asia/Manila";

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsInZone(epoch: number, tz = TIMEZONE): Parts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(epoch)).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** Milliseconds the zone is ahead of UTC at a given instant. */
function zoneOffset(epoch: number, tz = TIMEZONE) {
  const p = partsInZone(epoch, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(epoch / 1000) * 1000;
}

/** Parses "YYYY-MM-DDTHH:mm" or "YYYY-MM-DD" typed in the office's zone. Returns epoch ms or NaN. */
export function parseZoned(value: string, tz = TIMEZONE) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value.trim());
  if (!m) return NaN;
  const [, y, mo, d, h = "0", mi = "0"] = m;
  const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  return guess - zoneOffset(guess - zoneOffset(guess, tz), tz);
}

/** End of the given calendar day (23:59) in the office's zone. */
export function endOfDayZoned(dateValue: string, tz = TIMEZONE) {
  return parseZoned(`${dateValue}T23:59`, tz);
}

/** "MMYY" for the tracking number, plus "YYYYMM" for the counter key. */
export function monthKeys(epoch: number) {
  const p = partsInZone(epoch);
  const mm = String(p.month).padStart(2, "0");
  return { mmyy: `${mm}${String(p.year).slice(-2)}`, yyyymm: `${p.year}${mm}` };
}

/** Value for <input type="datetime-local"> in the office's zone. */
export function toDateTimeInput(epoch: number) {
  const p = partsInZone(epoch);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Value for <input type="date"> in the office's zone. */
export function toDateInput(epoch: number) {
  return toDateTimeInput(epoch).slice(0, 10);
}

export function formatDateTime(epoch?: number) {
  if (!epoch) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(epoch);
}

export function formatDate(epoch?: number) {
  if (!epoch) return "—";
  return new Intl.DateTimeFormat("en-PH", { timeZone: TIMEZONE, dateStyle: "medium" }).format(epoch);
}

/** Adds whole calendar days to a "YYYY-MM-DD" value. */
export function addDays(dateValue: string, days: number) {
  const [y, m, d] = dateValue.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Start of the day (00:00 office time) containing `epoch`. */
export function startOfDayZoned(epoch: number) {
  return parseZoned(toDateInput(epoch));
}

/** First day of the month containing `epoch`, as "YYYY-MM-DD". */
export function monthStartInput(epoch: number) {
  return `${toDateInput(epoch).slice(0, 8)}01`;
}
