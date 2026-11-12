import Link from "next/link";
import type { Report, Section } from "@/lib/repos/reports";

/** Renders a report: optional bar chart + table per section. Print-friendly. */
export function ReportView({ report }: { report: Report }) {
  return (
    <article className="space-y-6 print:space-y-4">
      <header className="hidden print:block">
        <div className="text-xs uppercase tracking-widest text-slate-500">IMISS · DocTrack</div>
        <h1 className="text-xl font-bold">{report.title}</h1>
        <p className="text-sm text-slate-600">{report.subtitle}</p>
      </header>
      {report.sections.map((s, i) => (
        <SectionView key={i} section={s} />
      ))}
    </article>
  );
}

function SectionView({ section: s }: { section: Section }) {
  return (
    <section className="break-inside-avoid-page rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 print:rounded-none print:shadow-none print:ring-0">
      <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold print:border-slate-400 print:px-0">
        {s.title}
      </h2>
      {s.chart && s.rows.length > 0 && <BarChart section={s} />}
      <div className="overflow-x-auto">
        <table className="w-full text-sm print:text-[11px]">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 print:bg-transparent">
            <tr>
              {s.columns.map((c) => (
                <th key={c.key} className={`px-4 py-2.5 font-medium print:px-1 ${c.align === "right" ? "text-right" : ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 print:divide-slate-300">
            {s.rows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50 print:hover:bg-transparent">
                {s.columns.map((c, j) => {
                  const value = row[c.key];
                  const cell = j === 0 && row._href ? (
                    <Link href={row._href} className="whitespace-nowrap font-mono text-xs font-semibold text-indigo-700 hover:underline print:text-slate-900">
                      {value}
                    </Link>
                  ) : (
                    value
                  );
                  return (
                    <td
                      key={c.key}
                      className={`px-4 py-2 align-top print:px-1 print:py-1 ${c.align === "right" ? "text-right tabular-nums" : ""}`}
                    >
                      {cell === "" || cell === undefined ? <span className="text-slate-300">—</span> : cell}
                    </td>
                  );
                })}
              </tr>
            ))}
            {s.rows.length === 0 && (
              <tr>
                <td colSpan={s.columns.length} className="px-4 py-8 text-center text-slate-500">
                  {s.empty ?? "No data."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Horizontal bars, largest first (top 12). Pure CSS so it prints. */
function BarChart({ section: s }: { section: Section }) {
  const { label, value } = s.chart!;
  const rows = s.rows
    .map((r) => ({ label: String(r[label] ?? ""), value: Number(r[value]) || 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-1.5 px-5 py-4 print:px-0">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(8rem,14rem)_1fr_3rem] items-center gap-3 text-xs">
          <span className="truncate text-slate-600" title={r.label}>
            {r.label}
          </span>
          <span className="h-3 rounded bg-slate-100 print:bg-transparent">
            <span
              className="block h-3 rounded bg-indigo-500 print:bg-slate-700"
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, printColorAdjust: "exact" }}
            />
          </span>
          <span className="text-right tabular-nums text-slate-700">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
