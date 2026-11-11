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

export async function saveDivision(d: Division) {
  const tx = redis().multi();
  tx.hset(keys.division(d.id), d);
  tx.sadd(keys.divisions, d.id);
  await tx.exec();
}

export async function saveUnit(u: Unit) {
  const tx = redis().multi();
  tx.hset(keys.unit(u.id), u);
  tx.sadd(keys.units, u.id);
  tx.sadd(keys.divisionUnits(u.divisionId), u.id);
  await tx.exec();
}

export async function saveDocType(t: DocType) {
  const tx = redis().multi();
  tx.hset(keys.doctype(t.id), t);
  tx.sadd(keys.doctypes, t.id);
  await tx.exec();
}

export async function getLocationCounts() {
  const r = redis();
  const [divisions, units, doctypes] = await Promise.all([
    r.scard(keys.divisions),
    r.scard(keys.units),
    r.scard(keys.doctypes),
  ]);
  return { divisions, units, doctypes };
}
