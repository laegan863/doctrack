/**
 * Seeds sample divisions, units, and document types.
 * Safe to run more than once: records are keyed by fixed IDs and overwritten.
 *
 *   npm run seed
 */
import { saveDivision, saveDocType, saveUnit } from "@/lib/repos/locations";
import { isRedisConfigured } from "@/lib/redis";

const now = Date.now();

const divisions: { code: string; name: string; units: [string, string][] }[] = [
  {
    code: "OD",
    name: "Office of the Director",
    units: [["DIR", "Director's Office"], ["LEGAL", "Legal Unit"]],
  },
  {
    code: "ADMIN",
    name: "Administrative Division",
    units: [["RECORDS", "Records Unit"], ["HR", "Human Resource Unit"], ["SUPPLY", "Supply Unit"]],
  },
  {
    code: "FIN",
    name: "Finance Division",
    units: [["ACCTG", "Accounting Unit"], ["BUDGET", "Budget Unit"], ["CASH", "Cashier Unit"]],
  },
  {
    code: "IMISS",
    name: "IMISS",
    units: [["DEV", "Systems Development Unit"], ["TECH", "Technical Support Unit"]],
  },
];

const docTypes: [string, number][] = [
  ["Memorandum", 3],
  ["Letter", 5],
  ["Voucher", 3],
  ["Purchase Request", 5],
  ["Request", 5],
  ["Invitation", 2],
  ["Report", 7],
  ["Endorsement", 3],
  ["Others", 5],
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function main() {
  if (!isRedisConfigured()) {
    console.error("Redis is not configured. Fill in .env.local first (see .env.example).");
    process.exit(1);
  }

  for (const d of divisions) {
    const divisionId = slug(d.code);
    await saveDivision({ id: divisionId, code: d.code, name: d.name, active: true, createdAt: now });
    for (const [code, name] of d.units) {
      await saveUnit({
        id: slug(code),
        divisionId,
        code,
        name,
        active: true,
        createdAt: now,
      });
    }
    console.log(`✓ ${d.name} (${d.units.length} units)`);
  }

  for (const [name, defaultDays] of docTypes) {
    await saveDocType({ id: slug(name), name, defaultDays, active: true });
  }
  console.log(`✓ ${docTypes.length} document types`);
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
