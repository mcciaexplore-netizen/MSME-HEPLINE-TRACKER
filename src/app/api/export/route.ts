import { NextResponse, type NextRequest } from "next/server";
import { adminFromRequest } from "@/lib/auth";
import { buildCsv } from "@/lib/csv";
import { runMetrics } from "@/lib/data";
import { prisma } from "@/lib/db";
import { parseFilters } from "@/lib/filters";

export async function GET(req: NextRequest) {
  const admin = await adminFromRequest(req);
  if (admin instanceof NextResponse) return admin;
  const filters = parseFilters(req.nextUrl.searchParams);
  const result = await runMetrics(prisma, { from: filters.from, to: filters.to, coordinatorId: filters.coordinatorId });
  const csv = buildCsv(result, result.coordinatorNames);
  await prisma.exportLog.create({ data: { exportedBy: admin, filters: JSON.stringify(filters) } });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="msme-helpline-performance_${filters.from}_${filters.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
