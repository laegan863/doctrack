import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader, RedisMissing } from "@/components/ui";
import { isRedisConfigured } from "@/lib/redis";
import { getSuggestions } from "@/lib/repos/documents";
import { getLocationOptions, listDocTypes } from "@/lib/repos/locations";
import { requestNow } from "@/lib/request-time";
import { toDateInput } from "@/lib/time";
import { OutgoingForm } from "./outgoing-form";

export const metadata: Metadata = { title: "New Outgoing · DocTrack" };

export default function NewOutgoingPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="New Outgoing" description="Log a document your office is sending out." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-slate-200" />}>
        <Form />
      </Suspense>
    </div>
  );
}

async function Form() {
  await connection();
  if (!isRedisConfigured()) return <RedisMissing />;
  const [docTypes, locations, recipients, offices] = await Promise.all([
    listDocTypes(),
    getLocationOptions(),
    getSuggestions("recipient"),
    getSuggestions("office"),
  ]);
  return (
    <OutgoingForm
      today={toDateInput(await requestNow())}
      docTypes={docTypes.filter((t) => t.active)}
      locations={locations}
      recipients={recipients}
      offices={offices}
    />
  );
}
