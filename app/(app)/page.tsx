import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { DirectionBadge } from "@/components/doc-badges";
import { Card } from "@/components/ui";
import { STATUSES, formatDuration, type DocumentRecord } from "@/lib/documents";
import { isRedisConfigured, redis } from "@/lib/redis";
import { getLocationCounts } from "@/lib/repos/locations";
import { dashboardData } from "@/lib/repos/reports";
import { requestNow } from "@/lib/request-time";
import { formatDate, monthStartInput, parseZoned, startOfDayZoned } from "@/lib/time";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-500">Where everything stands right now.</p>
        </div>
        <div className="flex gap-2">
          <QuickLink href="/incoming/new">↓ New Incoming</QuickLink>
          <QuickLink href="/outgoing/new">↑ New Outgoing</QuickLink>
        </div>
      </header>

      <Suspense fallback={<Skeleton />}>
        <DashboardBody />
      </Suspense>
    </div>
  );
}

async function DashboardBody() {
  await connection();

  if (!isRedisConfigured()) {
    return (
      <Banner tone="warn" title="Redis is not connected">
        Add <code>UPSTASH_REDIS_REST_URL</code> and <code>UPSTASH_REDIS_REST_TOKEN</code> to <code>.env.local</code>,
        restart the dev server, then run <code>npm run seed</code>.
      </Banner>
    );
  }

  const now = await requestNow();
  let data: Awaited<ReturnType<typeof dashboardData>>;
  let setup: Awaited<ReturnType<typeof getLocationCounts>>;
  try {
    await redis().ping();
    [data, setup] = await Promise.all([
      dashboardData(now, startOfDayZoned(now), parseZoned(monthStartInput(now))),
      getLocationCounts(),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return (
      <Banner tone="error" title="Could not reach Redis">
        {message}
      </Banner>
    );
  }

  const { counts } = data;
  const maxLoc = Math.max(1, ...data.byLocation.map(([, n]) => n));

  return (
    <div className="space-y-6">
      {setup.divisions === 0 && (
        <Banner tone="warn" title="Set up your offices first">
          Add your divisions and units in <Link href="/settings/divisions" className="underline">Settings</Link>, or run{" "}
          <code>npm run seed</code> for sample data.
        </Banner>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Received today" value={counts.receivedToday} hint={counts.preparedToday ? `+ ${counts.preparedToday} outgoing prepared` : undefined} href="/reports/register" />
        <Stat label="Out in divisions & units" value={counts.out} href="/locations" />
        <Stat label="With you" value={counts.withYou} href="/locations" />
        <Stat label="Overdue" value={counts.overdue} tone={counts.overdue ? "red" : undefined} href="/reports/overdue" />
        <Stat label="Completed this month" value={counts.completedThisMonth} tone="green" href="/reports/status" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Needs attention" href="/reports/overdue" link="Overdue report →" />
            {data.overdue.length === 0 && data.dueSoon.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">Nothing overdue or due in the next 2 days. 🎉</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.overdue.map((d) => (
                  <DocLine key={d.trackingNo} doc={d} right={<span className="font-semibold text-red-600">Overdue · due {formatDate(d.dueAt)}</span>} />
                ))}
                {data.dueSoon.map((d) => (
                  <DocLine key={d.trackingNo} doc={d} right={<span className="text-amber-700">Due {formatDate(d.dueAt)}</span>} />
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Where documents are now" href="/locations" link="See all →" />
            {data.byLocation.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No documents are out in divisions or units.</p>
            ) : (
              <div className="space-y-2 px-5 py-4">
                {data.byLocation.map(([name, n]) => (
                  <div key={name} className="grid grid-cols-[minmax(8rem,14rem)_1fr_2rem] items-center gap-3 text-sm">
                    <span className="truncate text-slate-700" title={name}>{name}</span>
                    <span className="h-2.5 rounded bg-slate-100">
                      <span className="block h-2.5 rounded bg-amber-400" style={{ width: `${(n / maxLoc) * 100}%` }} />
                    </span>
                    <span className="text-right tabular-nums">{n}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader title="Recent activity" />
          {data.activity.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">No activity yet. Start with New Incoming.</p>
          ) : (
            <ol className="divide-y divide-slate-100">
              {data.activity.map((a, i) => (
                <li key={i}>
                  <Link href={`/documents/${a.trackingNo}`} className="block px-5 py-2.5 hover:bg-slate-50">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">
                        {a.type === "REMARK" ? "Remark" : a.type === "CREATED" ? "Created" : STATUSES[a.type]}
                      </span>
                      {a.location && <span className="truncate text-slate-500">→ {a.location.name}</span>}
                      <span className="ml-auto shrink-0 text-xs text-slate-400">{formatDuration(now - a.at)} ago</span>
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      <span className="font-mono">{a.subNo}</span> · {a.subject}
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}

function DocLine({ doc, right }: { doc: DocumentRecord; right: ReactNode }) {
  return (
    <li>
      <Link href={`/documents/${doc.trackingNo}`} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm hover:bg-slate-50">
        <DirectionBadge direction={doc.direction} />
        <span className="font-mono text-xs font-semibold">{doc.trackingNo}</span>
        <span className="min-w-0 flex-1 truncate text-slate-700">{doc.subject}</span>
        <span className="text-xs text-slate-500">{doc.location?.name ?? "with you"}</span>
        <span className="text-xs">{right}</span>
      </Link>
    </li>
  );
}

function CardHeader({ title, href, link }: { title: string; href?: string; link?: string }) {
  return (
    <div className="flex items-center border-b border-slate-100 px-5 py-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {href && (
        <Link href={href} className="ml-auto text-xs text-indigo-700 hover:underline">
          {link}
        </Link>
      )}
    </div>
  );
}

function Stat({ label, value, hint, tone, href }: { label: string; value: number; hint?: string; tone?: "red" | "green"; href: string }) {
  const color = tone === "red" ? "text-red-600" : tone === "green" ? "text-emerald-600" : "";
  return (
    <Link href={href} className="group">
      <Card className="h-full p-5 transition group-hover:ring-indigo-300">
        <div className="text-sm text-slate-500">{label}</div>
        <div className={`mt-1 text-3xl font-semibold ${color}`}>{value}</div>
        {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
      </Card>
    </Link>
  );
}

function QuickLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
      {children}
    </Link>
  );
}

function Banner({ tone, title, children }: { tone: "warn" | "error"; title: string; children: ReactNode }) {
  const styles = tone === "warn" ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-red-50 text-red-800 ring-red-200";
  return (
    <div className={`rounded-2xl p-5 text-sm ring-1 ${styles}`}>
      <div className="font-semibold">{title}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200" />
      ))}
    </div>
  );
}
