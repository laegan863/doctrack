"use client";

import { useActionState, useState } from "react";
import { Datalist, LocationSelect } from "@/components/form-bits";
import { Button, Card, ErrorText, Field, inputClass } from "@/components/ui";
import {
  ACTIONS_REQUESTED,
  ACTION_LABELS,
  SERVICE_MODES,
  availableActions,
  type ActionKind,
  type DocumentRecord,
} from "@/lib/documents";
import type { LocationGroup } from "@/lib/repos/locations";
import type { FormState } from "@/lib/types";
import { performAction } from "./actions";

const primary: ActionKind[] = ["RECEIVE", "FORWARD", "REPROCESS", "SERVE", "RELEASE"];

export function ActionPanel({
  doc,
  locations,
  people,
}: {
  doc: Pick<DocumentRecord, "trackingNo" | "status" | "direction" | "location">;
  locations: LocationGroup[];
  people: string[];
}) {
  const [open, setOpen] = useState<ActionKind | null>(null);
  const actions = availableActions(doc);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a}
            size="sm"
            variant={open === a ? "primary" : primary.includes(a) ? "secondary" : "ghost"}
            onClick={() => setOpen(open === a ? null : a)}
          >
            {ACTION_LABELS[a]}
          </Button>
        ))}
      </div>
      {open && (
        <ActionForm
          // Remount when switching actions so each form starts clean.
          key={open}
          kind={open}
          trackingNo={doc.trackingNo}
          locations={locations}
          people={people}
          onDone={() => setOpen(null)}
        />
      )}
    </Card>
  );
}

function ActionForm({
  kind,
  trackingNo,
  locations,
  people,
  onDone,
}: {
  kind: ActionKind;
  trackingNo: string;
  locations: LocationGroup[];
  people: string[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const result = await performAction(prev, fd);
    if (result.ok) onDone();
    return result;
  }, {});
  const v = state.values ?? {};
  const id = (name: string) => `${kind}-${name}`;

  const whenField = (label: string) => (
    <Field label={label} htmlFor={id("when")} hint="Leave empty for now">
      <input id={id("when")} name="when" type="datetime-local" defaultValue={v.when} className={inputClass} />
    </Field>
  );
  const remarks = (label = "Remarks") => (
    <Field label={label} htmlFor={id("remarks")} className="sm:col-span-2">
      <textarea id={id("remarks")} name="remarks" rows={2} defaultValue={v.remarks} className={inputClass} />
    </Field>
  );
  const forwardFields = (
    <>
      <Field label="Forward to *" htmlFor={id("to")} className="sm:col-span-2">
        <LocationSelect id={id("to")} name="to" groups={locations} required defaultValue={v.to} />
      </Field>
      <Field label="Action requested" htmlFor={id("ar")}>
        <select id={id("ar")} name="actionRequested" defaultValue={v.actionRequested ?? ""} className={inputClass}>
          <option value="">—</option>
          {ACTIONS_REQUESTED.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </Field>
      {remarks()}
    </>
  );
  const serviceMode = (
    <Field label="Mode of service" htmlFor={id("mode")}>
      <select id={id("mode")} name="serviceMode" defaultValue={v.serviceMode ?? ""} className={inputClass}>
        <option value="">—</option>
        {SERVICE_MODES.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
    </Field>
  );
  const personField = (label: string, required: boolean) => (
    <Field label={label} htmlFor={id("by")}>
      <input id={id("by")} name="by" required={required} list="dl-people" autoComplete="off" defaultValue={v.by} className={inputClass} />
      <Datalist id="dl-people" options={people} />
    </Field>
  );

  const body: Record<ActionKind, React.ReactNode> = {
    FORWARD: forwardFields,
    REPROCESS: (
      <>
        <p className="text-sm text-slate-600 sm:col-span-2">
          Starts a new sub-transaction under the same tracking number.
        </p>
        {forwardFields}
      </>
    ),
    RECEIVE: (
      <>
        {personField("Received by (name) *", true)}
        {whenField("Date & time received")}
        {remarks()}
      </>
    ),
    ACT: (
      <>
        <Field label="What was done *" htmlFor={id("what")} className="sm:col-span-2">
          <textarea id={id("what")} name="what" rows={2} required defaultValue={v.what} className={inputClass} />
        </Field>
        {whenField("Date & time")}
      </>
    ),
    RETURN: (
      <>
        <p className="text-sm text-slate-600 sm:col-span-2">
          Closes the current sub-transaction. Use <strong>Re-process</strong> later when the owner sends it back.
        </p>
        <Field label="Reason *" htmlFor={id("reason")} className="sm:col-span-2">
          <textarea id={id("reason")} name="reason" rows={2} required defaultValue={v.reason} className={inputClass} />
        </Field>
        {remarks()}
      </>
    ),
    RELEASE: (
      <>
        {whenField("Date & time released")}
        {personField("Released by", false)}
        {serviceMode}
        {remarks()}
      </>
    ),
    SERVE: (
      <>
        {whenField("Date & time served")}
        {personField("Received by (name) *", true)}
        {serviceMode}
        {remarks()}
      </>
    ),
    COMPLETE: (
      <>
        {whenField("Date & time completed")}
        {remarks("Final remarks")}
      </>
    ),
    REMARK: (
      <Field label="Note *" htmlFor={id("note")} className="sm:col-span-2">
        <textarea id={id("note")} name="note" rows={2} required defaultValue={v.note} className={inputClass} />
      </Field>
    ),
  };

  return (
    <form action={action} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
      <input type="hidden" name="trackingNo" value={trackingNo} />
      <input type="hidden" name="action" value={kind} />
      <h3 className="text-sm font-semibold">{ACTION_LABELS[kind]}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{body[kind]}</div>
      <ErrorText>{state.error}</ErrorText>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : `Save: ${ACTION_LABELS[kind]}`}
        </Button>
        <Button size="sm" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
