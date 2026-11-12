import { redis } from "@/lib/redis";
import type { Division, DocType, Unit } from "@/lib/types";

// Key layout (see PLAN.md §6)
export const keys = {
  divisions: "divisions",
  division: (id: string) => `division:${id}`,
  divisionUnits: (id: string) => `division:${id}:units`,
  units: "units",
  unit: (id: string) => `unit:${id}`,
  doctypes: "doctypes",
  doctype: (id: string) => `doctype:${id}`,
};

export function newId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

// ---------- normalisation (Upstash auto-parses hash values) ----------

type Raw = Record<string, unknown>;

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const bool = (v: unknown) => v === true || v === "true" || v === 1 || v === "1";
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

function toDivision(r: Raw): Division {
  return {
    id: str(r.id),
    code: str(r.code),
    name: str(r.name),
    head: str(r.head) || undefined,
    active: bool(r.active),
    used: bool(r.used),
    createdAt: num(r.createdAt),
  };
}

function toUnit(r: Raw): Unit {
  return {
    id: str(r.id),
    divisionId: str(r.divisionId),
    code: str(r.code),
    name: str(r.name),
    head: str(r.head) || undefined,
    active: bool(r.active),
    used: bool(r.used),
    createdAt: num(r.createdAt),
  };
}

function toDocType(r: Raw): DocType {
  return {
    id: str(r.id),
    name: str(r.name),
    defaultDays: num(r.defaultDays),
    active: bool(r.active),
    used: bool(r.used),
  };
}

async function hgetallMany(ids: string[], key: (id: string) => string) {
  if (ids.length === 0) return [];
  const p = redis().pipeline();
  for (const id of ids) p.hgetall(key(id));
  const rows = (await p.exec()) as (Raw | null)[];
  return rows.filter((r): r is Raw => r !== null && Object.keys(r).length > 0);
}

// Redis rejects undefined hash values; drop them.
function clean<T extends object>(obj: T) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Record<string, string | number | boolean>;
}

// ---------- divisions ----------

export async function listDivisions(): Promise<Division[]> {
  const ids = await redis().smembers(keys.divisions);
  const rows = await hgetallMany(ids, keys.division);
  return rows.map(toDivision).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getDivision(id: string) {
  const r = await redis().hgetall<Raw>(keys.division(id));
  return r && Object.keys(r).length ? toDivision(r) : null;
}

export async function saveDivision(d: Division) {
  const tx = redis().multi();
  tx.del(keys.division(d.id)); // so cleared optional fields (head) are removed
  tx.hset(keys.division(d.id), clean(d));
  tx.sadd(keys.divisions, d.id);
  await tx.exec();
}

export async function deleteDivision(id: string) {
  const tx = redis().multi();
  tx.del(keys.division(id), keys.divisionUnits(id));
  tx.srem(keys.divisions, id);
  await tx.exec();
}

// ---------- units ----------

export async function listUnits(): Promise<Unit[]> {
  const ids = await redis().smembers(keys.units);
  const rows = await hgetallMany(ids, keys.unit);
  return rows.map(toUnit).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getUnit(id: string) {
  const r = await redis().hgetall<Raw>(keys.unit(id));
  return r && Object.keys(r).length ? toUnit(r) : null;
}

/** Saves a unit. Pass the previous division ID when a unit moves divisions. */
export async function saveUnit(u: Unit, previousDivisionId?: string) {
  const tx = redis().multi();
  tx.del(keys.unit(u.id));
  tx.hset(keys.unit(u.id), clean(u));
  tx.sadd(keys.units, u.id);
  if (previousDivisionId && previousDivisionId !== u.divisionId) {
    tx.srem(keys.divisionUnits(previousDivisionId), u.id);
  }
  tx.sadd(keys.divisionUnits(u.divisionId), u.id);
  await tx.exec();
}

export async function deleteUnit(u: Unit) {
  const tx = redis().multi();
  tx.del(keys.unit(u.id));
  tx.srem(keys.units, u.id);
  tx.srem(keys.divisionUnits(u.divisionId), u.id);
  await tx.exec();
}

// ---------- document types ----------

export async function listDocTypes(): Promise<DocType[]> {
  const ids = await redis().smembers(keys.doctypes);
  const rows = await hgetallMany(ids, keys.doctype);
  return rows.map(toDocType).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getDocType(id: string) {
  const r = await redis().hgetall<Raw>(keys.doctype(id));
  return r && Object.keys(r).length ? toDocType(r) : null;
}

export async function saveDocType(t: DocType) {
  const tx = redis().multi();
  tx.hset(keys.doctype(t.id), clean(t));
  tx.sadd(keys.doctypes, t.id);
  await tx.exec();
}

export async function deleteDocType(id: string) {
  const tx = redis().multi();
  tx.del(keys.doctype(id));
  tx.srem(keys.doctypes, id);
  await tx.exec();
}

// ---------- "Forward to" picker ----------

export type LocationGroup = {
  division: { value: string; label: string };
  units: { value: string; label: string }[];
};

/** Active divisions with their active units, for the "Forward to" dropdown. */
export async function getLocationOptions(): Promise<LocationGroup[]> {
  const [divisions, units] = await Promise.all([listDivisions(), listUnits()]);
  return divisions
    .filter((d) => d.active)
    .map((d) => ({
      division: { value: `division:${d.id}`, label: `${d.name} (whole division)` },
      units: units
        .filter((u) => u.active && u.divisionId === d.id)
        .map((u) => ({ value: `unit:${u.id}`, label: `${u.name}` })),
    }));
}

/** Resolves a picker value ("unit:abc" / "division:xyz") to an active location. */
export async function resolveLocation(value: string) {
  const [type, id] = value.split(":");
  if (!id) return null;
  if (type === "unit") {
    const u = await getUnit(id);
    if (!u?.active) return null;
    const d = await getDivision(u.divisionId);
    return { type: "unit" as const, id: u.id, name: d ? `${u.name} – ${d.code}` : u.name };
  }
  if (type === "division") {
    const d = await getDivision(id);
    if (!d?.active) return null;
    return { type: "division" as const, id: d.id, name: d.name };
  }
  return null;
}

// ---------- dashboard ----------

export async function getLocationCounts() {
  const r = redis();
  const [divisions, units, doctypes] = await Promise.all([
    r.scard(keys.divisions),
    r.scard(keys.units),
    r.scard(keys.doctypes),
  ]);
  return { divisions, units, doctypes };
}
