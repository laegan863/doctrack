"use client";

import { useActionState, useState } from "react";
import { Datalist, FormSection, LocationSelect } from "@/components/form-bits";
import { Button, ErrorText, Field, inputClass } from "@/components/ui";
import { SERVICE_MODES } from "@/lib/documents";
import type { LocationGroup } from "@/lib/repos/locations";
import type { DocType, FormState } from "@/lib/types";
import { createOutgoing } from "../../documents/actions";

export function OutgoingForm({
  today,
  docTypes,
  locations,
  recipients,
  offices,
}: {
  today: string;
  docTypes: DocType[];
  locations: LocationGroup[];
  recipients: string[];
  offices: string[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createOutgoing, {});
  const v = state.values ?? {};
  const [mode, setMode] = useState(v.serviceMode ?? "");
  const [replyNeeded, setReplyNeeded] = useState(v.replyNeeded === "on");

  return (
    <form action={action} className="space-y-5">
      <FormSection title="Tracking" hint="The tracking number (IMISS-MMYY-NNN) is assigned when you save.">
        <Field label="Date prepared *" htmlFor="preparedAt">
          <input id="preparedAt" name="preparedAt" type="date" required defaultValue={v.preparedAt ?? today} className={inputClass} />
        </Field>
      </FormSection>

      <FormSection title="Forward to">
        <Field label="Division or unit *" htmlFor="forwardTo" className="sm:col-span-2">
          <LocationSelect id="forwardTo" name="forwardTo" groups={locations} required defaultValue={v.forwardTo} />
        </Field>
      </FormSection>

      <FormSection title="Received by">
        <Field label="Received by (name) *" htmlFor="receivedByName">
          <input id="receivedByName" name="receivedByName" required list="dl-recipients" defaultValue={v.receivedByName} autoComplete="off" className={inputClass} />
          <Datalist id="dl-recipients" options={recipients} />
        </Field>
        <Field label="Office / agency *" htmlFor="receivedByOffice">
          <input id="receivedByOffice" name="receivedByOffice" required list="dl-offices" defaultValue={v.receivedByOffice} autoComplete="off" className={inputClass} />
          <Datalist id="dl-offices" options={offices} />
        </Field>
        <Field label="Address / email" htmlFor="receivedByAddress">
          <input id="receivedByAddress" name="receivedByAddress" defaultValue={v.receivedByAddress} className={inputClass} />
        </Field>
      </FormSection>

      <FormSection title="Document">
        <Field label="Document type *" htmlFor="docTypeId">
          <select id="docTypeId" name="docTypeId" required defaultValue={v.docTypeId ?? ""} className={inputClass}>
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
        <Field label="Description" htmlFor="description" className="sm:col-span-2 lg:col-span-3">
          <textarea id="description" name="description" rows={2} defaultValue={v.description} className={inputClass} />
        </Field>
        <Field label="No. of pages" htmlFor="pages">
          <input id="pages" name="pages" type="number" min={0} defaultValue={v.pages} className={inputClass} />
        </Field>
        <Field label="Attachments / enclosures" htmlFor="attachments" className="sm:col-span-2">
          <input id="attachments" name="attachments" defaultValue={v.attachments} className={inputClass} />
        </Field>
      </FormSection>

      <FormSection title="Mode of service (optional)">
        <Field label="Mode" htmlFor="serviceMode">
          <select id="serviceMode" name="serviceMode" value={mode} onChange={(e) => setMode(e.target.value)} className={inputClass}>
            <option value="">—</option>
            {SERVICE_MODES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        {mode === "Courier" && (
          <>
            <Field label="Courier name" htmlFor="courierName">
              <input id="courierName" name="courierName" defaultValue={v.courierName} className={inputClass} />
            </Field>
            <Field label="Waybill no." htmlFor="waybillNo">
              <input id="waybillNo" name="waybillNo" defaultValue={v.waybillNo} className={inputClass} />
            </Field>
          </>
        )}
        <div className="flex items-end pb-2 sm:col-start-1">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="replyNeeded"
              checked={replyNeeded}
              onChange={(e) => setReplyNeeded(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600"
            />
            Reply needed
          </label>
        </div>
        {replyNeeded && (
          <Field label="Reply due date" htmlFor="replyDueDate">
            <input id="replyDueDate" name="replyDueDate" type="date" defaultValue={v.replyDueDate} className={inputClass} />
          </Field>
        )}
      </FormSection>

      <FormSection title="Remarks">
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
