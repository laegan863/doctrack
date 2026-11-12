import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { DirectionBadge, PriorityBadge, StatusBadge } from "@/components/doc-badges";
import { Card, RedisMissing } from "@/components/ui";
import { STATUSES, type TimelineEvent } from "@/lib/documents";
import { loadDocument } from "@/lib/load-document";
import { isRedisConfigured } from "@/lib/redis";
import { requestNow } from "@/lib/request-time";
import { formatDate, formatDateTime } from "@/lib/time";

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
            {doc.location && (
              <span className="text-sm text-slate-500">
                at <strong className="text-slate-700">{doc.location.name}</strong>
              </span>
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

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
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
            .map((s) => (
              <Card key={s.subNo} className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold">{s.subNo}</span>
                  <StatusBadge status={s.status} />
                </div>
                <Timeline events={s.timeline} />
              </Card>
            ))}
          <p className="text-xs text-slate-400">
            Routing actions (forward, receive, return, re-process) arrive in Phase 4.
          </p>
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
            {e.type === "CREATED" || e.type === "REMARK" ? e.type : STATUSES[e.type]}
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
