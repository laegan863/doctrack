import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader, RedisMissing } from "@/components/ui";
import { isRedisConfigured } from "@/lib/redis";
import { getSuggestions } from "@/lib/repos/documents";
import { getLocationOptions, listDocTypes } from "@/lib/repos/locations";
import { requestNow } from "@/lib/request-time";
import { toDateTimeInput } from "@/lib/time";
import { IncomingForm } from "./incoming-form";

export const metadata: Metadata = { title: "New Incoming · DocTrack" };

export default function NewIncomingPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="New Incoming" description="Log a document received by your office." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-slate-200" />}>
        <Form />
      </Suspense>
    </div>
  );
}

async function Form() {
  await connection();
  if (!isRedisConfigured()) return <RedisMissing />;
  const [docTypes, locations, senders, offices] = await Promise.all([
    listDocTypes(),
    getLocationOptions(),
    getSuggestions("sender"),
    getSuggestions("office"),
  ]);
  return (
    <IncomingForm
      now={toDateTimeInput(await requestNow())}
      docTypes={docTypes.filter((t) => t.active)}
      locations={locations}
      senders={senders}
      offices={offices}
    />
  );
}
