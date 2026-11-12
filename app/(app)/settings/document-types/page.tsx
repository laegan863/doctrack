import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader, RedisMissing } from "@/components/ui";
import { isRedisConfigured } from "@/lib/redis";
import { listDocTypes } from "@/lib/repos/locations";
import { DocTypesTable } from "./doctypes-table";

export const metadata: Metadata = { title: "Document Types · DocTrack" };

export default function DocumentTypesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Document Types"
        description="Each type's processing days set the default due date when you receive a document."
      />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-slate-200" />}>
        <Table />
      </Suspense>
    </div>
  );
}

async function Table() {
  await connection();
  if (!isRedisConfigured()) return <RedisMissing />;
  return <DocTypesTable types={await listDocTypes()} />;
}
