import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { REPORT_TYPES } from "@/lib/repos/reports";

export const metadata: Metadata = { title: "Reports · DocTrack" };

const icons: Record<keyof typeof REPORT_TYPES, string> = {
  register: "☰",
  status: "▦",
  workload: "⌖",
  overdue: "⏰",
  turnaround: "⏱",
  history: "↺",
};

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Each report can be filtered, exported to CSV (Excel), and printed or saved as PDF." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(Object.keys(REPORT_TYPES) as (keyof typeof REPORT_TYPES)[]).map((key) => (
          <Link key={key} href={`/reports/${key}`} className="group">
            <Card className="h-full p-5 transition group-hover:ring-indigo-300">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-lg text-indigo-600">
                {icons[key]}
              </div>
              <h2 className="mt-3 font-semibold group-hover:text-indigo-700">{REPORT_TYPES[key].title}</h2>
              <p className="mt-1 text-sm text-slate-500">{REPORT_TYPES[key].desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
