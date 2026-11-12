"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { rememberSearch } from "@/components/command-palette";
import { LocationSelect } from "@/components/form-bits";
import { Button, inputClass } from "@/components/ui";
import { STATUSES } from "@/lib/documents";
import type { LocationGroup } from "@/lib/repos/locations";
import type { DocType } from "@/lib/types";

export type SearchParamsState = {
  q: string;
  dir: string;
  status: string;
  type: string;
  loc: string;
  from: string;
  to: string;
};

/** Search box + filters. Updates the URL as you type, so results are shareable and survive refresh. */
export function SearchControls({
  initial,
  docTypes,
  locations,
}: {
  initial: SearchParamsState;
  docTypes: DocType[];
  locations: LocationGroup[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState(initial);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(state)) if (v.trim()) params.set(k, v.trim());
      if (state.q.trim().length >= 2) rememberSearch(state.q);
      startTransition(() => router.replace(`/search?${params}`, { scroll: false }));
    }, 250);
    return () => clearTimeout(timer);
  }, [state, router]);

  const set = (k: keyof SearchParamsState) => (e: { target: { value: string } }) =>
    setState((s) => ({ ...s, [k]: e.target.value }));
  const hasFilters = state.dir || state.status || state.type || state.loc || state.from || state.to;

  return (
    <div className="space-y-3">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
        <input
          type="search"
          autoFocus
          value={state.q}
          onChange={set("q")}
          placeholder="Tracking no., subject, sender, office, remarks, who received it…"
          aria-label="Search"
          className={`${inputClass} h-12 pl-9 text-base`}
        />
        {pending && (
          <span className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500" />
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <select aria-label="Direction" value={state.dir} onChange={set("dir")} className={inputClass}>
          <option value="">In & Out</option>
          <option value="IN">Incoming</option>
          <option value="OUT">Outgoing</option>
        </select>
        <select aria-label="Status" value={state.status} onChange={set("status")} className={inputClass}>
          <option value="">Any status</option>
          {Object.entries(STATUSES).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select aria-label="Document type" value={state.type} onChange={set("type")} className={inputClass}>
          <option value="">Any type</option>
          {docTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <LocationSelect
          id="loc"
          name="loc"
          groups={locations}
          value={state.loc}
          onChange={(v) => setState((s) => ({ ...s, loc: v }))}
          placeholder="Anywhere"
        />
        <input type="date" aria-label="From date" value={state.from} onChange={set("from")} className={inputClass} />
        <input type="date" aria-label="To date" value={state.to} onChange={set("to")} className={inputClass} />
      </div>
      {hasFilters && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setState((s) => ({ ...s, dir: "", status: "", type: "", loc: "", from: "", to: "" }))}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}
