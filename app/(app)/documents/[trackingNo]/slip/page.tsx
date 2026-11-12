import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import QRCode from "qrcode";
import { Suspense, type ReactNode } from "react";
import { RedisMissing } from "@/components/ui";
import { PRIORITY_LABELS } from "@/lib/documents";
import { loadDocument } from "@/lib/load-document";
import { isRedisConfigured } from "@/lib/redis";
import { requestNow } from "@/lib/request-time";
import { formatDate, formatDateTime } from "@/lib/time";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "Routing Slip · DocTrack" };

export default function SlipPage({ params }: PageProps<"/documents/[trackingNo]/slip">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-slate-200" />}>
      <Slip params={params} />
    </Suspense>
  );
}

async function Slip({ params }: { params: Promise<{ trackingNo: string }> }) {
  await connection();
  if (!isRedisConfigured()) return <RedisMissing />;
  const data = await loadDocument((await params).trackingNo);
  if (!data) notFound();
  const { doc } = data;
  const printedAt = await requestNow();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/documents/${doc.trackingNo}`;
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" });

  const isIn = doc.direction === "IN";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
          Saved as <strong className="font-mono">{doc.trackingNo}</strong>
        </div>
        <div className="ml-auto flex gap-2">
          <Link
            href={`/documents/${doc.trackingNo}`}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            View document
          </Link>
          <Link
            href={isIn ? "/incoming/new" : "/outgoing/new"}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            + Another {isIn ? "incoming" : "outgoing"}
          </Link>
          <PrintButton />
        </div>
      </div>

      {/* The printable sheet */}
      <article className="mx-auto max-w-[210mm] bg-white p-4 sm:p-8 text-[13px] text-slate-900 shadow-sm ring-1 ring-slate-200 print:max-w-none print:p-0 print:shadow-none print:ring-0">
        <header className="flex flex-col gap-4 border-b-2 border-slate-900 pb-4 sm:flex-row sm:items-start sm:justify-between print:flex-row print:items-start print:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">IMISS</div>
            <h1 className="text-xl font-bold">DOCUMENT ROUTING SLIP</h1>
            <div className="mt-1 text-xs text-slate-500">{isIn ? "INCOMING" : "OUTGOING"}</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-slate-500">Tracking No.</div>
              <div className="font-mono text-2xl font-bold">{doc.trackingNo}</div>
              <div className="font-mono text-xs text-slate-500">Transaction {doc.currentSub}</div>
            </div>
            <div className="h-24 w-24" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          </div>
        </header>

        <table className="mt-4 w-full border-collapse">
          <tbody>
            {isIn ? (
              <>
                <Row a="Date received" b={formatDateTime(doc.receivedAt)} c="Received via" d={doc.receivedVia} />
                <Row a="Sender" b={doc.senderName} c="Office / agency" d={doc.senderOffice} />
                <Row a="Sender's ref. no." b={doc.senderRef} c="Date on document" d={doc.documentDate} />
              </>
            ) : (
              <>
                <Row a="Date prepared" b={formatDate(doc.preparedAt)} c="Mode of service" d={doc.serviceMode} />
                <Row a="Received by" b={doc.receivedByName} c="Office / agency" d={doc.receivedByOffice} />
              </>
            )}
            <Row a="Document type" b={doc.docTypeName} c="Priority" d={PRIORITY_LABELS[doc.priority]} />
            <Row a="Pages" b={doc.pages?.toString()} c="Due date" d={formatDate(doc.dueAt)} />
            <tr>
              <Th>Subject</Th>
              <Td colSpan={3}>
                <strong>{doc.subject}</strong>
              </Td>
            </tr>
            {doc.attachments && (
              <tr>
                <Th>Attachments</Th>
                <Td colSpan={3}>{doc.attachments}</Td>
              </tr>
            )}
            {(isIn ? doc.actionRequested : null) && (
              <tr>
                <Th>Action requested</Th>
                <Td colSpan={3}>{doc.actionRequested}</Td>
              </tr>
            )}
            {doc.remarks && (
              <tr>
                <Th>Remarks</Th>
                <Td colSpan={3}>{doc.remarks}</Td>
              </tr>
            )}
          </tbody>
        </table>

        <h2 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide">Routing</h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100">
              {["Date / Time", "From", "To", "Action / Remarks", "Received by (signature)"].map((h) => (
                <th key={h} className="border border-slate-400 px-2 py-1.5 text-left font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {doc.location && (
              <tr>
                <td className="border border-slate-400 px-2 py-3">{formatDateTime(doc.createdAt)}</td>
                <td className="border border-slate-400 px-2 py-3">Records</td>
                <td className="border border-slate-400 px-2 py-3">{doc.location.name}</td>
                <td className="border border-slate-400 px-2 py-3">{isIn ? doc.actionRequested : ""}</td>
                <td className="border border-slate-400 px-2 py-3" />
              </tr>
            )}
            {Array.from({ length: doc.location ? 7 : 8 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 5 }).map((__, j) => (
                  <td key={j} className="h-9 border border-slate-400" />
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="mt-4 flex justify-between text-[10px] text-slate-500">
          <span>Scan the QR code to open this document in DocTrack.</span>
          <span>Printed {formatDateTime(printedAt)}</span>
        </footer>
      </article>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="w-36 border border-slate-300 bg-slate-50 px-2 py-1.5 text-left text-xs font-semibold text-slate-600">
      {children}
    </th>
  );
}

function Td({ children, colSpan }: { children?: ReactNode; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className="border border-slate-300 px-2 py-1.5">
      {children || "—"}
    </td>
  );
}

function Row({ a, b, c, d }: { a: string; b?: string; c: string; d?: string }) {
  return (
    <tr>
      <Th>{a}</Th>
      <Td>{b}</Td>
      <Th>{c}</Th>
      <Td>{d}</Td>
    </tr>
  );
}
