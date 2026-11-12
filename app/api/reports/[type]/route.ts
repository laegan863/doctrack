import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { isRedisConfigured } from "@/lib/redis";
import { parseReportParams } from "@/lib/report-params";
import { REPORT_TYPES, buildReport, reportToCsv, type ReportType } from "@/lib/repos/reports";
import { toDateInput } from "@/lib/time";

/** CSV export for any report: /api/reports/register?from=2026-11-01&to=2026-11-30 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/reports/[type]">) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isRedisConfigured()) return NextResponse.json({ error: "Redis is not configured." }, { status: 503 });

  const { type } = await ctx.params;
  if (!(type in REPORT_TYPES)) return NextResponse.json({ error: "Unknown report." }, { status: 404 });

  const now = Date.now();
  const { query, filters } = parseReportParams(request.nextUrl.searchParams, now);
  const report = await buildReport(type as ReportType, filters, now, query.no || undefined);

  const stamp = REPORT_TYPES[type as ReportType].ranged ? `${query.from}_to_${query.to}` : toDateInput(now);
  const name = type === "history" && query.no ? `history-${query.no}` : `${type}-${stamp}`;

  return new NextResponse(reportToCsv(report), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="doctrack-${name}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
