import type { ReactNode } from "react";
import type { LocationGroup } from "@/lib/repos/locations";
import { Card, inputClass } from "./ui";

export function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </Card>
  );
}

/** One dropdown listing each division (whole division) with its units under it. */
export function LocationSelect({
  id,
  name,
  groups,
  required,
  defaultValue,
  placeholder = "Select division or unit…",
}: {
  id: string;
  name: string;
  groups: LocationGroup[];
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <select id={id} name={name} required={required} defaultValue={defaultValue ?? ""} className={inputClass}>
      <option value="">{placeholder}</option>
      {groups.map((g) => (
        <optgroup key={g.division.value} label={g.division.label.replace(" (whole division)", "")}>
          <option value={g.division.value}>{g.division.label}</option>
          {g.units.map((u) => (
            <option key={u.value} value={u.value}>
              &nbsp;&nbsp;↳ {u.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function Datalist({ id, options }: { id: string; options: string[] }) {
  return (
    <datalist id={id}>
      {options.map((o) => (
        <option key={o} value={o} />
      ))}
    </datalist>
  );
}
