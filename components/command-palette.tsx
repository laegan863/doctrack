"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DirectionBadge } from "./doc-badges";
import { Highlight } from "./highlight";

type Result = {
  trackingNo: string;
  direction: "IN" | "OUT";
  subject: string;
  status: string;
  who?: string;
  office?: string;
  location?: string;
};

const RECENT_KEY = "doctrack:recent-searches";

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function rememberSearch(q: string) {
  const v = q.trim();
  if (v.length < 2) return;
  const next = [v, ...readRecent().filter((r) => r.toLowerCase() !== v.toLowerCase())].slice(0, 6);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

/** Ctrl+K / ⌘K quick search. Also opens with "/" when you're not typing in a field. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  // Global shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]");
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onOpenChange(!open);
      } else if (e.key === "/" && !typing && !open) {
        e.preventDefault();
        onOpenChange(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // Mounted only while open, so every opening starts with a clean state.
  return open ? <PaletteDialog onClose={() => onOpenChange(false)} /> : null;
}

type Fetched = { query: string; results: Result[]; total: number };

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [fetched, setFetched] = useState<Fetched>({ query: "", results: [], total: 0 });
  const [active, setActive] = useState(0);
  const [recent] = useState<string[]>(readRecent);

  const query = q.trim();
  const searching = query.length >= 2;
  const fresh = fetched.query === query;
  // While a new query loads, keep showing the previous results instead of flashing empty.
  const results = searching ? fetched.results : [];
  const total = searching ? fetched.total : 0;
  const loading = searching && !fresh;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search; aborts the previous request so results never arrive out of order.
  useEffect(() => {
    if (query.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { total: number; results: Result[] };
        setFetched({ query, results: data.results, total: data.total });
        setActive(0);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setFetched({ query, results: [], total: 0 });
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  const go = useCallback(
    (href: string) => {
      rememberSearch(q);
      onClose();
      router.push(href);
    },
    [q, onClose, router],
  );

  const showRecent = !searching;
  const seeAll = `/search?q=${encodeURIComponent(query)}`;
  // Items navigable with arrow keys: results, then "see all".
  const count = showRecent ? recent.length : results.length + 1;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (count ? (a + 1) % count : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (count ? (a - 1 + count) % count : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showRecent) {
        if (recent[active]) setQ(recent[active]);
      } else if (active < results.length) {
        go(`/documents/${results[active].trackingNo}`);
      } else {
        go(seeAll);
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 pt-[12vh] backdrop-blur-sm print:hidden"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-label="Search documents" className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <span className="text-slate-400">⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search tracking no., subject, sender, office, remarks…"
            className="h-14 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            aria-label="Search"
          />
          {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500" />}
          <kbd className="rounded border border-slate-200 px-1.5 text-[10px] text-slate-400">Esc</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {showRecent ? (
            recent.length > 0 ? (
              <>
                <div className="px-2 py-1 text-xs font-medium text-slate-400">Recent searches</div>
                {recent.map((r, i) => (
                  <button
                    key={r}
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => setQ(r)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${i === active ? "bg-slate-100" : ""}`}
                  >
                    <span className="text-slate-400">↺</span> {r}
                  </button>
                ))}
              </>
            ) : (
              <p className="px-3 py-6 text-center text-sm text-slate-400">
                Type at least 2 characters. Try a tracking number like <code>1126-001</code> or a sender&apos;s name.
              </p>
            )
          ) : (
            <>
              {results.map((r, i) => (
                <button
                  key={r.trackingNo}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(`/documents/${r.trackingNo}`)}
                  className={`block w-full rounded-lg px-3 py-2 text-left ${i === active ? "bg-indigo-50" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <DirectionBadge direction={r.direction} />
                    <span className="font-mono text-xs font-semibold">
                      <Highlight text={r.trackingNo} query={q} />
                    </span>
                    <span className="ml-auto text-xs text-slate-500">{r.status}</span>
                  </div>
                  <div className="mt-0.5 truncate text-sm text-slate-800">
                    <Highlight text={r.subject} query={q} />
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    <Highlight text={[r.who, r.office].filter(Boolean).join(" · ")} query={q} />
                    {r.location && <> · at {r.location}</>}
                  </div>
                </button>
              ))}
              {fresh && results.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-slate-400">No documents match “{query}”.</p>
              )}
              <button
                  type="button"
                  onMouseEnter={() => setActive(results.length)}
                  onClick={() => go(seeAll)}
                  className={`mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-indigo-700 ${active === results.length ? "bg-indigo-50" : ""}`}
                >
                  See all {total > results.length ? `${total} ` : ""}results with filters →
                </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
