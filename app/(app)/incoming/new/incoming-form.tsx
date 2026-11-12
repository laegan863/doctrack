"use client";

import { useActionState, useState } from "react";
import { Datalist, FormSection, LocationSelect } from "@/components/form-bits";
import { Button, ErrorText, Field, inputClass } from "@/components/ui";
import {
  ACTIONS_REQUESTED,
  PRIORITIES,
  PRIORITY_LABELS,
  RECEIVED_VIA,
  dueDays,
  type Priority,
} from "@/lib/documents";
import type { LocationGroup } from "@/lib/repos/locations";
import type { DocType, FormState } from "@/lib/types";
import { createIncoming } from "../../documents/actions";

function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function IncomingForm({
  now,
  docTypes,
  locations,
  senders,
  offices,
}: {
  now: string;
  docTypes: DocType[];
  locations: LocationGroup[];
  senders: string[];
  offices: string[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createIncoming, {});
  const v = state.values ?? {};

  // Due date follows type + priority + date received until you edit it yourself.
  const [receivedAt, setReceivedAt] = useState(v.receivedAt ?? now);
  const [typeId, setTypeId] = useState(v.docTypeId ?? "");
  const [priority, setPriority] = useState<Priority>((v.priority as Priority) ?? "NORMAL");
  const [dueOverride, setDueOverride] = useState<string | null>(v.dueDate || null);

  const type = docTypes.find((t) => t.id === typeId);
  const autoDue = type && receivedAt ? addDays(receivedAt.slice(0, 10), dueDays(type.defaultDays, priority)) : "";
  const due = dueOverride ?? autoDue;

  return (
    <form action={action} className="space-y-5">
      <FormSection title="Tracking" hint="The tracking number (IMISS-MMYY-NNN) is assigned when you save.">
        <Field label="Date & time received *" htmlFor="receivedAt">
          <input
            id="receivedAt"
            name="receivedAt"
            type="datetime-local"
            required
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Received via *" htmlFor="receivedVia">
          <select id="receivedVia" name="receivedVia" required defaultValue={v.receivedVia ?? "Hand-carried"} className={inputClass}>
            {RECEIVED_VIA.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
      </FormSection>

      <FormSection title="Sender">
        <Field label="Sender name *" htmlFor="senderName">
          <input id="senderName" name="senderName" required list="dl-senders" defaultValue={v.senderName} autoComplete="off" className={inputClass} />
          <Datalist id="dl-senders" options={senders} />
        </Field>
        <Field label="Office / agency *" htmlFor="senderOffice">
          <input id="senderOffice" name="senderOffice" required list="dl-offices" defaultValue={v.senderOffice} autoComplete="off" className={inputClass} />
          <Datalist id="dl-offices" options={offices} />
        </Field>
        <Field label="Contact no. / email" htmlFor="senderContact">
          <input id="senderContact" name="senderContact" defaultValue={v.senderContact} className={inputClass} />
        </Field>
        <Field label="Sender's reference no." htmlFor="senderRef" hint="Their own memo or letter number">
          <input id="senderRef" name="senderRef" defaultValue={v.senderRef} className={inputClass} />
        </Field>
        <Field label="Date on the document" htmlFor="documentDate">
          <input id="documentDate" name="documentDate" type="date" defaultValue={v.documentDate} className={inputClass} />
        </Field>
      </FormSection>

      <FormSection title="Document">
        <Field label="Document type *" htmlFor="docTypeId">
          <select
            id="docTypeId"
            name="docTypeId"
            required
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select type…</option>
            {docTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Subject / title *" htmlFor="subject" className="sm:col-span-2">
          <input id="subject" name="subject" required defaultValue={v.subject} className={inputClass} />
        </Field>
        <Field label="Description / particulars" htmlFor="description" className="sm:col-span-2 lg:col-span-3">
          <textarea id="description" name="description" rows={2} defaultValue={v.description} className={inputClass} />
        </Field>
        <Field label="No. of pages" htmlFor="pages">
          <input id="pages" name="pages" type="number" min={0} defaultValue={v.pages} className={inputClass} />
        </Field>
        <Field label="Attachments / enclosures" htmlFor="attachments" className="sm:col-span-2">
          <input id="attachments" name="attachments" defaultValue={v.attachments} className={inputClass} placeholder="e.g. 2 photocopies of ID, 1 CD" />
        </Field>
      </FormSection>

      <FormSection title="Action">
        <Field label="Priority *" htmlFor="priority">
          <select
            id="priority"
            name="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className={inputClass}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Due date"
          htmlFor="dueDate"
          hint={dueOverride ? "Set by you" : "Filled in from type and priority"}
        >
          <div className="flex gap-2">
            <input
              id="dueDate"
              name="dueDate"
              type="date"
              value={due}
              onChange={(e) => setDueOverride(e.target.value)}
              className={inputClass}
            />
            {dueOverride && (
              <Button size="sm" variant="ghost" onClick={() => setDueOverride(null)} title="Use the automatic due date">
                ↺
              </Button>
            )}
          </div>
        </Field>
        <Field label="Action requested" htmlFor="actionRequested">
          <select id="actionRequested" name="actionRequested" defaultValue={v.actionRequested ?? ""} className={inputClass}>
            <option value="">—</option>
            {ACTIONS_REQUESTED.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Field>
      </FormSection>

      <FormSection title="First routing" hint="Optional. Leave empty to keep the document with you for now.">
        <Field label="Route to" htmlFor="routeTo" className="sm:col-span-2">
          <LocationSelect id="routeTo" name="routeTo" groups={locations} defaultValue={v.routeTo} placeholder="Keep with me (don't route yet)" />
        </Field>
        <Field label="Remarks" htmlFor="remarks" className="sm:col-span-2 lg:col-span-3">
          <textarea id="remarks" name="remarks" rows={2} defaultValue={v.remarks} className={inputClass} />
        </Field>
      </FormSection>

      <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <ErrorText>{state.error}</ErrorText>
        <Button type="submit" disabled={pending} className="ml-auto">
          {pending ? "Saving…" : "Save & print routing slip"}
        </Button>
      </div>
    </form>
  );
}
