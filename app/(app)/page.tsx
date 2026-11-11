import { Suspense } from "react";
import { connection } from "next/server";
import { isRedisConfigured, redis } from "@/lib/redis";
import { getLocationCounts } from "@/lib/repos/locations";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-slate-500">Overview of your document tracking.</p>
      </header>

      <Suspense fallback={<StatusSkeleton />}>
        <SystemStatus />
      </Suspense>

      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        Document counts, activity, and overdue items will appear here once receiving and
        routing are built (Phases 3–6).
      </section>
    </div>
  );
}

async function SystemStatus() {
  await connection();

  if (!isRedisConfigured()) {
    return (
      <Banner tone="warn" title="Redis is not connected">
        Add <code>UPSTASH_REDIS_REST_URL</code> and <code>UPSTASH_REDIS_REST_TOKEN</code> to{" "}
        <code>.env.local</code>, restart the dev server, then run <code>npm run seed</code>.
      </Banner>
    );
  }

  let counts: Awaited<ReturnType<typeof getLocationCounts>>;
  try {
    await redis().ping();
    counts = await getLocationCounts();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return (
      <Banner tone="error" title="Could not reach Redis">
        {message}
      </Banner>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Stat label="Divisions" value={counts.divisions} />
      <Stat label="Units" value={counts.units} />
      <Stat label="Document types" value={counts.doctypes} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
    </div>
  );
}

function Banner({
  tone,
  title,
  children,
}: {
  tone: "warn" | "error";
  title: string;
  children: React.ReactNode;
}) {
  const styles =
    tone === "warn"
      ? "bg-amber-50 text-amber-800 ring-amber-200"
      : "bg-red-50 text-red-800 ring-red-200";
  return (
    <div className={`rounded-2xl p-5 text-sm ring-1 ${styles}`}>
      <div className="font-semibold">{title}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function StatusSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200" />
      ))}
    </div>
  );
}
