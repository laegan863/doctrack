import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { DirectionBadge, PriorityBadge, StatusBadge } from "@/components/doc-badges";
import { Card, RedisMissing } from "@/components/ui";
import { STATUSES, formatDuration, routeStops, type TimelineEvent } from "@/lib/documents";
import { loadDocument } from "@/lib/load-document";
import { getSuggestions } from "@/lib/repos/documents";
import { getLocationOptions } from "@/lib/repos/locations";
import { isRedisConfigured } from "@/lib/redis";
import { requestNow } from "@/lib/request-time";
import { formatDate, formatDateTime } from "@/lib/time";
import { ActionPanel } from "./action-panel";

export default function DocumentPage({ params }: PageProps<"/documents/[trackingNo]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-slate-200" />}>
      <DocumentView params={params} />
    </Suspense>
  );
}

async function DocumentView({ params }: { params: Promise<{ trackingNo: string }> }) {
  await connection();
  if (!isRedisConfigured()) return <RedisMissing />;
  const data = await loadDocument((await params).trackingNo);
  if (!data) notFound();
  const { doc, subs } = data;
  const now = await requestNow();
  const [locations, people] = await Promise.all([getLocationOptions(), getSuggestions("recipient")]);
  const overdue =
    doc.dueAt && doc.dueAt < now && !["COMPLETED", "ARCHIVED", "SERVED"].includes(doc.status);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <DirectionBadge direction={doc.direction} />
            <h1 className="font-mono text-2xl font-semibold">{doc.trackingNo}</h1>
          </div>
          <p className="mt-1 text-slate-700">{doc.subject}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={doc.status} />
            <PriorityBadge priority={doc.priority} />
            {overdue && <span className="text-xs font-semibold text-red-600">OVERDUE</span>}
            {doc.location ? (
              <span className="text-sm text-slate-500">
                at <strong className="text-slate-700">{doc.location.name}</strong>
                {doc.locSince && <> · {formatDuration(now - doc.locSince)}</>}
              </span>
            ) : (
              (doc.status === "RECEIVED" || doc.status === "PREPARED") && (
                <span className="text-sm text-slate-500">with you</span>
              )
            )}
            {doc.status === "RELEASED" && (
              <span className="text-sm text-slate-500">out for service{doc.serviceMode ? ` (${doc.serviceMode})` : ""}</span>
            )}
          </div>
        </div>
        <Link
          href={`/documents/${doc.trackingNo}/slip`}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          🖨 Routing slip
        </Link>
      </header>

      <ActionPanel
        doc={{ trackingNo: doc.trackingNo, status: doc.status, direction: doc.direction, location: doc.location }}
        locations={locations}
        people={people}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold">Details</h2>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Item label="Document type">{doc.docTypeName}</Item>
            <Item label="Due date">{formatDate(doc.dueAt)}</Item>
            {doc.direction === "IN" ? (
              <>
                <Item label="Received">{formatDateTime(doc.receivedAt)}</Item>
                <Item label="Received via">{doc.receivedVia}</Item>
                <Item label="Sender">{doc.senderName}</Item>
                <Item label="Office / agency">{doc.senderOffice}</Item>
                <Item label="Contact">{doc.senderContact}</Item>
                <Item label="Sender's reference no.">{doc.senderRef}</Item>
                <Item label="Date on document">{doc.documentDate}</Item>
                <Item label="Action requested">{doc.actionRequested}</Item>
              </>
            ) : (
              <>
                <Item label="Date prepared">{formatDate(doc.preparedAt)}</Item>
                <Item label="Received by">{doc.receivedByName}</Item>
                <Item label="Office / agency">{doc.receivedByOffice}</Item>
                <Item label="Address / email">{doc.receivedByAddress}</Item>
                <Item label="Mode of service">{doc.serviceMode}</Item>
                {doc.serviceMode === "Courier" && (
                  <Item label="Courier / waybill">
                    {[doc.courierName, doc.waybillNo].filter(Boolean).join(" · ") || undefined}
                  </Item>
                )}
                <Item label="Reply needed">
                  {doc.replyNeeded ? `Yes${doc.replyDueAt ? ` · due ${formatDate(doc.replyDueAt)}` : ""}` : "No"}
                </Item>
              </>
            )}
            <Item label="Pages">{doc.pages?.toString()}</Item>
            <Item label="Attachments">{doc.attachments}</Item>
            <Item label="Description" wide>
              {doc.description}
            </Item>
            <Item label="Remarks" wide>
              {doc.remarks}
            </Item>
          </dl>
        </Card>

        <div className="space-y-4">
          <h2 className="text-sm font-semibold">
            Transactions <span className="font-normal text-slate-400">({subs.length})</span>
          </h2>
          {subs
            .slice()
            .reverse()
            .map((sub) => {
              const current = sub.subNo === doc.currentSub;
              const stops = routeStops(sub.timeline, current && !!doc.location);
              return (
                <Card key={sub.subNo} className={`p-4 ${current ? "ring-2 ring-indigo-200" : ""}`}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold">{sub.subNo}</span>
                    <div className="flex items-center gap-1.5">
                      {current && <span className="text-[10px] font-semibold uppercase text-indigo-600">Current</span>}
                      <StatusBadge status={sub.status} />
                    </div>
                  </div>
                  {stops.length > 0 && (
                    <ol className="mb-4 flex flex-wrap items-center gap-1 text-xs">
                      {stops.map((st, i) => (
                        <li key={i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-slate-300">→</span>}
                          <span
                            className={`rounded-md px-2 py-1 ${
                              st.to === undefined ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : "bg-slate-100 text-slate-700"
                            }`}
                            title={`${formatDateTime(st.from)} – ${st.to ? formatDateTime(st.to) : "now"}`}
                          >
                            {st.location.name}
                            <span className="ml-1 text-slate-400">{formatDuration((st.to ?? now) - st.from)}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                  <Timeline events={sub.timeline} />
                </Card>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function Item({ label, children, wide }: { label: string; children?: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="whitespace-pre-wrap text-slate-900">{children || "—"}</dd>
    </div>
  );
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative space-y-3 border-l border-slate-200 pl-4">
      {events.map((e, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-white" />
          <div className="text-sm font-medium">
            {e.type === "REMARK" ? "Remark" : e.type === "CREATED" ? "Created" : STATUSES[e.type]}
            {e.location && <span className="font-normal text-slate-500"> → {e.location.name}</span>}
          </div>
          <div className="text-xs text-slate-400">{formatDateTime(e.at)}</div>
          {e.by && <div className="text-xs text-slate-600">By: {e.by}</div>}
          {e.remarks && <div className="text-xs text-slate-600">{e.remarks}</div>}
        </li>
      ))}
    </ol>
  );
}
