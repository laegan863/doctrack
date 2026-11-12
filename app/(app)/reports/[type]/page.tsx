import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PrintButton } from "@/components/print-button";
import { Button, Field, PageHeader, RedisMissing, inputClass } from "@/components/ui";
import { ReportView } from "@/components/report-view";
import { isRedisConfigured } from "@/lib/redis";
import { parseReportParams, toQueryString, type RawParams } from "@/lib/report-params";
import { listDocTypes } from "@/lib/repos/locations";
import { REPORT_TYPES, buildReport, type ReportType } from "@/lib/repos/reports";
import { requestNow } from "@/lib/request-time";

export function generateStaticParams() {
  return Object.keys(REPORT_TYPES).map((type) => ({ type }));
}

export async function generateMetadata({ params }: PageProps<"/reports/[type]">): Promise<Metadata> {
  const { type } = await params;
  const r = REPORT_TYPES[type as ReportType];
  return { title: r ? `${r.title} · DocTrack` : "Report · DocTrack" };
}

export default function ReportPage({ params, searchParams }: PageProps<"/reports/[type]">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<div className="h-14" />}>
        <ReportHeader params={params} />
      </Suspense>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-slate-200" />}>
        <ReportBody params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function reportType(params: Promise<{ type: string }>) {
  const { type } = await params;
  if (!(type in REPORT_TYPES)) notFound();
  return type as ReportType;
}

async function ReportHeader({ params }: { params: Promise<{ type: string }> }) {
  const meta = REPORT_TYPES[await reportType(params)];
  return (
    <div className="print:hidden">
      <Link href="/reports" className="text-sm text-slate-500 hover:text-slate-700">
        ← Reports
      </Link>
      <PageHeader title={meta.title} description={meta.desc} />
    </div>
  );
}

async function ReportBody({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<RawParams>;
}) {
  const type = await reportType(params);
  await connection();
  if (!isRedisConfigured()) return <RedisMissing />;
  const now = await requestNow();
  const { query, filters } = parseReportParams(await searchParams, now);
  const meta = REPORT_TYPES[type];

  const [report, docTypes] = await Promise.all([
    type === "history" && !query.no ? null : buildReport(type, filters, now, query.no || undefined),
    listDocTypes(),
  ]);
  const qs = toQueryString(query);

  return (
    <div className="space-y-6">
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 print:hidden">
        {type === "history" ? (
          <Field label="Tracking number" htmlFor="no">
            <input id="no" name="no" defaultValue={query.no} placeholder="IMISS-1126-001" className={`${inputClass} w-56 font-mono uppercase`} />
          </Field>
        ) : meta.ranged ? (
          <>
            <Field label="From" htmlFor="from">
              <input id="from" name="from" type="date" defaultValue={query.from} className={inputClass} />
            </Field>
            <Field label="To" htmlFor="to">
              <input id="to" name="to" type="date" defaultValue={query.to} className={inputClass} />
            </Field>
            <Field label="Direction" htmlFor="dir">
              <select id="dir" name="dir" defaultValue={query.dir} className={inputClass}>
                <option value="">In & Out</option>
                <option value="IN">Incoming</option>
                <option value="OUT">Outgoing</option>
              </select>
            </Field>
            <Field label="Document type" htmlFor="type">
              <select id="type" name="type" defaultValue={query.type} className={inputClass}>
                <option value="">Any type</option>
                {docTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : (
          <p className="text-sm text-slate-500">Shows the situation right now.</p>
        )}
        {(type === "history" || meta.ranged) && (
          <Button type="submit" variant="secondary">
            Apply
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          {report && (
            <a
              href={`/api/reports/${type}?${qs}`}
              className="inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
            >
              ⤓ Export CSV
            </a>
          )}
          {report && <PrintButton label="🖨 Print / PDF" />}
        </div>
      </form>

      {report ? (
        <>
          <p className="text-sm text-slate-500 print:hidden">{report.subtitle}</p>
          <ReportView report={report} />
        </>
      ) : (
        <p className="text-sm text-slate-500">Enter a tracking number to see its full history.</p>
      )}
    </div>
  );
}
