"use client";

import { useActionState, useState } from "react";
import { ActionButton } from "@/components/action-button";
import { Badge, Button, Card, ErrorText, Field, inputClass } from "@/components/ui";
import type { DocType, FormState } from "@/lib/types";
import { removeDocType, setDocTypeActive, upsertDocType } from "../actions";

export function DocTypesTable({ types }: { types: DocType[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <span className="text-sm text-slate-500">{types.length} document types</span>
        <Button className="ml-auto" onClick={() => setAdding(true)} disabled={adding}>
          + Add type
        </Button>
      </div>

      {adding && (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">New document type</h2>
          <DocTypeForm onDone={() => setAdding(false)} />
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Default processing time</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {types.map((t) => (
              <DocTypeRow key={t.id} type={t} />
            ))}
            {types.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                  No document types yet. Add one, or run <code>npm run seed</code>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}

function DocTypeRow({ type }: { type: DocType }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <tr className="bg-slate-50">
        <td colSpan={4} className="px-5 py-4">
          <DocTypeForm type={type} onDone={() => setEditing(false)} />
        </td>
      </tr>
    );
  }

  return (
    <tr className={type.active ? "" : "opacity-60"}>
      <td className="px-5 py-3 font-medium">{type.name}</td>
      <td className="px-5 py-3 text-slate-600">
        {type.defaultDays} {type.defaultDays === 1 ? "day" : "days"}
      </td>
      <td className="px-5 py-3">
        {type.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
      </td>
      <td className="px-5 py-3">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <ActionButton action={() => setDocTypeActive(type.id, !type.active)}>
            {type.active ? "Deactivate" : "Activate"}
          </ActionButton>
          <ActionButton
            variant="danger"
            confirm={`Delete document type "${type.name}"? This cannot be undone.`}
            action={() => removeDocType(type.id)}
          >
            Delete
          </ActionButton>
        </div>
      </td>
    </tr>
  );
}

function DocTypeForm({ type, onDone }: { type?: DocType; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const result = await upsertDocType(prev, fd);
    if (result.ok) onDone();
    return result;
  }, {});
  const p = type?.id ?? "new-type";
  const v = state.values ?? {};

  return (
    <form action={formAction} className="space-y-3">
      {type && <input type="hidden" name="id" value={type.id} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Field label="Name" htmlFor={`${p}-name`}>
          <input id={`${p}-name`} name="name" required defaultValue={v.name ?? type?.name} className={inputClass} placeholder="Memorandum" />
        </Field>
        <Field
          label="Default processing days"
          htmlFor={`${p}-days`}
          hint="Used to set the due date"
        >
          <input
            id={`${p}-days`}
            name="defaultDays"
            type="number"
            min={1}
            max={365}
            required
            defaultValue={v.defaultDays ?? type?.defaultDays ?? 5}
            className={inputClass}
          />
        </Field>
      </div>
      <ErrorText>{state.error}</ErrorText>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : type ? "Save changes" : "Add type"}
        </Button>
        <Button size="sm" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
