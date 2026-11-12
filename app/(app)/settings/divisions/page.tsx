import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader, RedisMissing } from "@/components/ui";
import { isRedisConfigured } from "@/lib/redis";
import { listDivisions, listUnits } from "@/lib/repos/locations";
import { DivisionsBoard } from "./divisions-board";

export const metadata: Metadata = { title: "Divisions & Units · DocTrack" };

export default function DivisionsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Divisions & Units"
        description="The places a document can be sent to. Deactivated ones stay in history but can't receive new documents."
      />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-slate-200" />}>
        <Board />
      </Suspense>
    </div>
  );
}

async function Board() {
  await connection();
  if (!isRedisConfigured()) return <RedisMissing />;
  const [divisions, units] = await Promise.all([listDivisions(), listUnits()]);
  return <DivisionsBoard divisions={divisions} units={units} />;
}
