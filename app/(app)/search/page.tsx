import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DirectionBadge, StatusBadge } from "@/components/doc-badges";
import { Highlight } from "@/components/highlight";
import { Card, PageHeader, RedisMissing } from "@/components/ui";
import { STATUSES, type Status } from "@/lib/documents";
import { isRedisConfigured } from "@/lib/redis";
import { getLocationOptions, listDocTypes } from "@/lib/repos/locations";
import { searchDocuments, type SearchFilters } from "@/lib/repos/search";
import { endOfDayZoned, formatDate, parseZoned } from "@/lib/time";
import { SearchControls, type SearchParamsState } from "./search-controls";

export const metadata: Metadata = { title: "Search · DocTrack" };

const RESULT_LIMIT = 100;

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="space-y-6">
      <PageHeader title="Search" description="Results update as you type. Press Ctrl+K anywhere for quick search." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-slate-200" />}>
        <SearchView searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function one(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

async function SearchView({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  if (!isRedisConfigured()) return <RedisMissing />;
  const sp = await searchParams;
  const params: SearchParamsState = {
    q: one(sp.q),
    dir: one(sp.dir),
    status: one(sp.status),
    type: one(sp.type),
    loc: one(sp.loc),
    from: one(sp.from),
    to: one(sp.to),
  };

  const filters: SearchFilters = {
    direction: params.dir === "IN" || params.dir === "OUT" ? params.dir : undefined,
    status: params.status in STATUSES ? (params.status as Status) : undefined,
    docTypeId: params.type || undefined,
    location: params.loc || undefined,
    from: params.from ? parseZoned(params.from) || undefined : undefined,
    to: params.to ? endOfDayZoned(params.to) || undefined : undefined,
  };

  const [docTypes, locations, result] = await Promise.all([
    listDocTypes(),
    getLocationOptions(),
    searchDocuments(params.q, filters, RESULT_LIMIT),
  ]);
  const q = params.q;
  const browsing = q.trim().length < 2;

  return (
    <div className="space-y-4">
      <SearchControls initial={params} docTypes={docTypes} locations={locations} />

      <div className="text-sm text-slate-500">
        {browsing ? "Newest documents" : `${result.total} ${result.total === 1 ? "result" : "results"}`}
        {result.total > RESULT_LIMIT && ` · showing the newest ${RESULT_LIMIT}. Add words or filters to narrow it down.`}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3 font-medium">Tracking no.</th>
                <th className="px-3 py-3 font-medium">Subject</th>
                <th className="px-3 py-3 font-medium">Type</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Where</th>
                <th className="px-3 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.docs.map((d) => (
                <tr key={d.trackingNo} className={`hover:bg-slate-50 ${d.trackingNo === result.exact ? "bg-indigo-50/50" : ""}`}>
                  <td className="whitespace-nowrap px-3 py-3">
                    <Link href={`/documents/${d.trackingNo}`} className="flex items-center gap-2">
                      <DirectionBadge direction={d.direction} />
                      <span className="font-mono text-xs font-semibold text-indigo-700 hover:underline">
                        <Highlight text={d.trackingNo} query={q} />
                      </span>
                    </Link>
                  </td>
                  <td className="max-w-xs px-3 py-3">
                    <Link href={`/documents/${d.trackingNo}`} className="block">
                      <div className="truncate text-slate-900">
                        <Highlight text={d.subject} query={q} />
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        <Highlight
                          text={
                            d.direction === "IN"
                              ? [d.senderName, d.senderOffice].filter(Boolean).join(" · ")
                              : [d.receivedByName, d.receivedByOffice].filter(Boolean).join(" · ")
                          }
                          query={q}
                        />
                      </div>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{d.docTypeName}</td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="min-w-32 px-3 py-3 text-slate-600">{d.location?.name ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-500">
                    {formatDate(d.receivedAt ?? d.preparedAt ?? d.createdAt)}
                  </td>
                </tr>
              ))}
              {result.docs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    {browsing ? "No documents yet." : `Nothing matches “${q}”. Try fewer words or clear the filters.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
