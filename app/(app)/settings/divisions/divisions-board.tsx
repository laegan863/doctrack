"use client";

import { useActionState, useState } from "react";
import { ActionButton } from "@/components/action-button";
import { Badge, Button, Card, ErrorText, Field, inputClass } from "@/components/ui";
import type { Division, FormState, Unit } from "@/lib/types";
import {
  removeDivision,
  removeUnit,
  setDivisionActive,
  setUnitActive,
  upsertDivision,
  upsertUnit,
} from "../actions";

export function DivisionsBoard({
  divisions,
  units,
}: {
  divisions: Division[];
  units: Unit[];
}) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const matches = (s: { code: string; name: string; head?: string }) =>
    !q || [s.code, s.name, s.head ?? ""].some((v) => v.toLowerCase().includes(q));

  const visible = divisions
    .map((d) => {
      const own = units.filter((u) => u.divisionId === d.id);
      const shownUnits = matches(d) ? own : own.filter(matches);
      return { division: d, units: own, shownUnits };
    })
    .filter((x) => matches(x.division) || x.shownUnits.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Filter divisions and units…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`${inputClass} max-w-xs`}
        />
        <span className="text-sm text-slate-500">
          {divisions.length} divisions · {units.length} units
        </span>
        <Button className="ml-auto" onClick={() => setAdding(true)} disabled={adding}>
          + Add division
        </Button>
      </div>

      {adding && (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">New division</h2>
          <DivisionForm onDone={() => setAdding(false)} />
        </Card>
      )}

      {divisions.length === 0 && !adding && (
        <Card className="p-8 text-center text-sm text-slate-500">
          No divisions yet. Add your first division, or run <code>npm run seed</code> for sample
          data.
        </Card>
      )}

      {divisions.length > 0 && visible.length === 0 && (
        <Card className="p-8 text-center text-sm text-slate-500">
          Nothing matches “{query}”.
        </Card>
      )}

      {visible.map(({ division, units: own, shownUnits }) => (
        <DivisionCard
          key={division.id}
          division={division}
          units={shownUnits}
          totalUnits={own.length}
          divisions={divisions}
        />
      ))}
    </div>
  );
}

function DivisionCard({
  division,
  units,
  totalUnits,
  divisions,
}: {
  division: Division;
  units: Unit[];
  totalUnits: number;
  divisions: Division[];
}) {
  const [editing, setEditing] = useState(false);
  const [addingUnit, setAddingUnit] = useState(false);

  return (
    <Card className={division.active ? "" : "opacity-70"}>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
        {editing ? (
          <div className="w-full">
            <DivisionForm division={division} onDone={() => setEditing(false)} />
          </div>
        ) : (
          <>
            <span className="rounded-md bg-indigo-50 px-2 py-1 font-mono text-xs font-semibold text-indigo-700">
              {division.code}
            </span>
            <div className="min-w-0">
              <div className="font-semibold">{division.name}</div>
              {division.head && (
                <div className="text-xs text-slate-500">Head: {division.head}</div>
              )}
            </div>
            {!division.active && <Badge>Inactive</Badge>}
            <span className="text-xs text-slate-400">{totalUnits} units</span>
            <div className="ml-auto flex flex-wrap gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <ActionButton action={() => setDivisionActive(division.id, !division.active)}>
                {division.active ? "Deactivate" : "Activate"}
              </ActionButton>
              <ActionButton
                variant="danger"
                confirm={`Delete division "${division.name}"? This cannot be undone.`}
                action={() => removeDivision(division.id)}
              >
                Delete
              </ActionButton>
            </div>
          </>
        )}
      </div>

      <div className="divide-y divide-slate-100">
        {units.map((u) => (
          <UnitRow key={u.id} unit={u} divisions={divisions} />
        ))}
        {units.length === 0 && !addingUnit && (
          <div className="px-5 py-3 text-sm text-slate-400">No units in this division.</div>
        )}
        {addingUnit ? (
          <div className="bg-slate-50 px-5 py-4">
            <UnitForm
              divisions={divisions}
              defaultDivisionId={division.id}
              onDone={() => setAddingUnit(false)}
            />
          </div>
        ) : (
          <div className="px-5 py-2">
            <Button size="sm" variant="ghost" onClick={() => setAddingUnit(true)}>
              + Add unit
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function UnitRow({ unit, divisions }: { unit: Unit; divisions: Division[] }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="bg-slate-50 px-5 py-4">
        <UnitForm unit={unit} divisions={divisions} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-3 px-5 py-2.5 ${unit.active ? "" : "opacity-60"}`}>
      <span className="w-20 shrink-0 font-mono text-xs text-slate-500">{unit.code}</span>
      <span className="text-sm font-medium">{unit.name}</span>
      {unit.head && <span className="text-xs text-slate-500">· {unit.head}</span>}
      {!unit.active && <Badge>Inactive</Badge>}
      <div className="ml-auto flex flex-wrap gap-1">
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <ActionButton action={() => setUnitActive(unit.id, !unit.active)}>
          {unit.active ? "Deactivate" : "Activate"}
        </ActionButton>
        <ActionButton
          variant="danger"
          confirm={`Delete unit "${unit.name}"? This cannot be undone.`}
          action={() => removeUnit(unit.id)}
        >
          Delete
        </ActionButton>
      </div>
    </div>
  );
}

function useFormAction(
  action: (prev: FormState, fd: FormData) => Promise<FormState>,
  onDone: () => void,
) {
  return useActionState<FormState, FormData>(async (prev, fd) => {
    const result = await action(prev, fd);
    if (result.ok) onDone();
    return result;
  }, {});
}

function DivisionForm({ division, onDone }: { division?: Division; onDone: () => void }) {
  const [state, formAction, pending] = useFormAction(upsertDivision, onDone);
  const p = division?.id ?? "new-div";
  const v = state.values ?? {};

  return (
    <form action={formAction} className="space-y-3">
      {division && <input type="hidden" name="id" value={division.id} />}
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr_1fr]">
        <Field label="Code" htmlFor={`${p}-code`}>
          <input id={`${p}-code`} name="code" required defaultValue={v.code ?? division?.code} className={`${inputClass} uppercase`} placeholder="FIN" />
        </Field>
        <Field label="Division name" htmlFor={`${p}-name`}>
          <input id={`${p}-name`} name="name" required defaultValue={v.name ?? division?.name} className={inputClass} placeholder="Finance Division" />
        </Field>
        <Field label="Head (optional)" htmlFor={`${p}-head`}>
          <input id={`${p}-head`} name="head" defaultValue={v.head ?? division?.head} className={inputClass} placeholder="Name of division chief" />
        </Field>
      </div>
      <ErrorText>{state.error}</ErrorText>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : division ? "Save changes" : "Add division"}
        </Button>
        <Button size="sm" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function UnitForm({
  unit,
  divisions,
  defaultDivisionId,
  onDone,
}: {
  unit?: Unit;
  divisions: Division[];
  defaultDivisionId?: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useFormAction(upsertUnit, onDone);
  const p = unit?.id ?? `new-unit-${defaultDivisionId}`;
  const v = state.values ?? {};

  return (
    <form action={formAction} className="space-y-3">
      {unit && <input type="hidden" name="id" value={unit.id} />}
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr_1fr_1fr]">
        <Field label="Code" htmlFor={`${p}-code`}>
          <input id={`${p}-code`} name="code" required defaultValue={v.code ?? unit?.code} className={`${inputClass} uppercase`} placeholder="ACCTG" />
        </Field>
        <Field label="Unit name" htmlFor={`${p}-name`}>
          <input id={`${p}-name`} name="name" required defaultValue={v.name ?? unit?.name} className={inputClass} placeholder="Accounting Unit" />
        </Field>
        <Field label="Head (optional)" htmlFor={`${p}-head`}>
          <input id={`${p}-head`} name="head" defaultValue={v.head ?? unit?.head} className={inputClass} />
        </Field>
        <Field label="Division" htmlFor={`${p}-div`}>
          <select
            id={`${p}-div`}
            name="divisionId"
            required
            defaultValue={v.divisionId ?? unit?.divisionId ?? defaultDivisionId}
            className={inputClass}
          >
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} – {d.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <ErrorText>{state.error}</ErrorText>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : unit ? "Save changes" : "Add unit"}
        </Button>
        <Button size="sm" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
