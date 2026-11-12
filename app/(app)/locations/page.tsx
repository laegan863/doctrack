import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DirectionBadge, StatusBadge } from "@/components/doc-badges";
import { Card, PageHeader, RedisMissing } from "@/components/ui";
import { formatDuration, type DocumentRecord } from "@/lib/documents";
import { isRedisConfigured } from "@/lib/redis";
import { getDocumentsAt, getDocumentsWithStatus } from "@/lib/repos/documents";
import { listDivisions, listUnits } from "@/lib/repos/locations";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Where are my documents? · DocTrack" };

export default function LocationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Where are my documents?"
        description="Every document that is still out, grouped by where it is now. Oldest first."
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-slate-200" />}>
        <Board />
      </Suspense>
    </div>
  );
}

async function Board() {
  await connection();
  if (!isRedisConfigured()) return <RedisMissing />;
  const now = await requestNow();

  const [divisions, units] = await Promise.all([listDivisions(), listUnits()]);
  const [divisionDocs, unitDocs, unrouted] = await Promise.all([
    Promise.all(divisions.map((d) => getDocumentsAt({ type: "division", id: d.id, name: d.name }))),
    Promise.all(units.map((u) => getDocumentsAt({ type: "unit", id: u.id, name: u.name }))),
    getDocumentsWithStatus(["RECEIVED", "PREPARED", "RELEASED", "RETURNED"]),
  ]);

  const byUnit = new Map(units.map((u, i) => [u.id, unitDocs[i]]));
  const withYou = unrouted.filter((d) => !d.location && (d.status === "RECEIVED" || d.status === "PREPARED"));
  const released = unrouted.filter((d) => d.status === "RELEASED");
  const returned = unrouted.filter((d) => d.status === "RETURNED");

  const allOut = [...divisionDocs.flat(), ...unitDocs.flat()];
  const overdue = [...allOut, ...withYou, ...released].filter((d) => isOverdue(d, now)).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Out in divisions & units" value={allOut.length} />
        <Stat label="With you" value={withYou.length} />
        <Stat label="Returned to owner" value={returned.length} />
        <Stat label="Overdue" value={overdue} tone={overdue ? "red" : undefined} />
      </div>

      {withYou.length > 0 && <Group title="With you (not yet routed)" docs={withYou} now={now} since={(d) => d.receivedAt ?? d.preparedAt ?? d.createdAt} />}
      {released.length > 0 && <Group title="Released, waiting to be served" docs={released} now={now} since={(d) => d.updatedAt} />}

      {divisions.map((d, i) => {
        const own = units.filter((u) => u.divisionId === d.id);
        const total = divisionDocs[i].length + own.reduce((n, u) => n + (byUnit.get(u.id)?.length ?? 0), 0);
        return (
          <Card key={d.id} className={total ? "" : "opacity-70"}>
            <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
              <span className="rounded-md bg-indigo-50 px-2 py-1 font-mono text-xs font-semibold text-indigo-700">{d.code}</span>
              <span className="font-semibold">{d.name}</span>
              <span className="ml-auto text-sm text-slate-500">{total} {total === 1 ? "document" : "documents"}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {divisionDocs[i].length > 0 && (
                <LocationRows name={`${d.name} (division level)`} docs={divisionDocs[i]} now={now} />
              )}
              {own.map((u) => (
                <LocationRows key={u.id} name={u.name} docs={byUnit.get(u.id) ?? []} now={now} inactive={!u.active} />
              ))}
            </div>
          </Card>
        );
      })}

      {returned.length > 0 && (
        <Group title="Returned to owner (use Re-process when it comes back)" docs={returned} now={now} since={(d) => d.updatedAt} />
      )}
    </div>
  );
}

function isOverdue(d: DocumentRecord, now: number) {
  return !!d.dueAt && d.dueAt < now;
}

function sortOldest(docs: DocumentRecord[], since: (d: DocumentRecord) => number) {
  return docs.slice().sort((a, b) => since(a) - since(b));
}

function LocationRows({
  name,
  docs,
  now,
  inactive,
}: {
  name: string;
  docs: DocumentRecord[];
  now: number;
  inactive?: boolean;
}) {
  if (docs.length === 0) {
    return (
      <div className="flex items-center px-5 py-2 text-sm text-slate-400">
        {name} {inactive && "(inactive)"}
        <span className="ml-auto text-xs">—</span>
      </div>
    );
  }
  return (
    <div className="px-5 py-3">
      <div className="mb-2 flex items-center text-sm font-medium">
        {name}
        <span className="ml-2 rounded-full bg-amber-100 px-2 text-xs text-amber-800">{docs.length}</span>
      </div>
      <DocRows docs={sortOldest(docs, (d) => d.locSince ?? d.updatedAt)} now={now} since={(d) => d.locSince ?? d.updatedAt} />
    </div>
  );
}

function Group({
  title,
  docs,
  now,
  since,
}: {
  title: string;
  docs: DocumentRecord[];
  now: number;
  since: (d: DocumentRecord) => number;
}) {
  return (
    <Card>
      <div className="flex items-center border-b border-slate-100 px-5 py-3">
        <span className="font-semibold">{title}</span>
        <span className="ml-auto text-sm text-slate-500">{docs.length}</span>
      </div>
      <div className="px-5 py-3">
        <DocRows docs={sortOldest(docs, since)} now={now} since={since} />
      </div>
    </Card>
  );
}

function DocRows({
  docs,
  now,
  since,
}: {
  docs: DocumentRecord[];
  now: number;
  since: (d: DocumentRecord) => number;
}) {
  return (
    <ul className="space-y-1.5">
      {docs.map((d) => (
        <li key={d.trackingNo}>
          <Link
            href={`/documents/${d.trackingNo}`}
            className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
          >
            <DirectionBadge direction={d.direction} />
            <span className="font-mono text-xs font-semibold">{d.trackingNo}</span>
            <span className="min-w-0 flex-1 truncate text-slate-700">{d.subject}</span>
            <StatusBadge status={d.status} />
            {isOverdue(d, now) && <span className="text-xs font-semibold text-red-600">OVERDUE</span>}
            <span className="w-16 text-right text-xs text-slate-500" title="Time here">
              {formatDuration(now - since(d))}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "red" }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone === "red" ? "text-red-600" : ""}`}>{value}</div>
    </Card>
  );
}
