import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { STATUSES } from "@/lib/documents";
import { isRedisConfigured } from "@/lib/redis";
import { searchDocuments } from "@/lib/repos/search";

/** Search-as-you-type endpoint for the Ctrl+K palette. */
export async function GET(request: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isRedisConfigured()) return NextResponse.json({ error: "Redis is not configured." }, { status: 503 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  if (q.trim().length < 2) return NextResponse.json({ total: 0, results: [] });

  const { total, docs, exact } = await searchDocuments(q, {}, 8);
  return NextResponse.json({
    total,
    exact,
    results: docs.map((d) => ({
      trackingNo: d.trackingNo,
      direction: d.direction,
      subject: d.subject,
      status: STATUSES[d.status],
      who: d.direction === "IN" ? d.senderName : d.receivedByName,
      office: d.direction === "IN" ? d.senderOffice : d.receivedByOffice,
      location: d.location?.name,
    })),
  });
}
