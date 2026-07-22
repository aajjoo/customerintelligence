import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { canSeeAllCustomers } from "@/lib/access";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtReportMonth } from "@/lib/format";
import { renderReportPdf } from "@/lib/report/pdf";

export const dynamic = "force-dynamic";

// PDF-Export des Monatsberichts (Etappe 5). Zugriff nur mit Team-Rechten (Kernregel 3).

export async function GET(
  _request: Request,
  { params }: { params: { reportId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const report = await db.report.findUnique({
    where: { id: params.reportId },
    include: { customer: true },
  });
  if (!report) {
    return NextResponse.json({ error: "Bericht nicht gefunden" }, { status: 404 });
  }

  if (!canSeeAllCustomers(session.user.role)) {
    const membership = await db.teamMembership.findFirst({
      where: { userId: session.user.id, customerId: report.customerId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Kein Zugriff auf diesen Kunden" }, { status: 403 });
    }
  }

  let body = null;
  try {
    body = report.bodyJson ? JSON.parse(report.bodyJson) : null;
  } catch {
    body = null;
  }

  const pdf = await renderReportPdf({
    customerName: report.customer.name,
    monthLabel: fmtReportMonth(report.month),
    status: report.status,
    approvedAt: report.approvedAt,
    execSummary: report.execSummary,
    body,
  });

  const filename = `Marktradar_${report.customer.slug}_${report.month}.pdf`;
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
    },
  });
}
