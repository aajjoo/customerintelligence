import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { canSeeAllCustomers } from "@/lib/access";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { runPipeline } from "@/lib/pipeline/run";

export const dynamic = "force-dynamic";
// Crawl + Claude-Scoring dauern je nach Quellen 1-3 Minuten; als API-Route mit
// langem Timeout statt Server-Action (deren kurzes Limit brach Läufe in Produktion ab).
export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  let customerId: string;
  try {
    ({ customerId } = await request.json());
    if (!customerId) throw new Error();
  } catch {
    return NextResponse.json({ error: "customerId erforderlich" }, { status: 400 });
  }

  if (!canSeeAllCustomers(session.user.role)) {
    const membership = await db.teamMembership.findFirst({
      where: { userId: session.user.id, customerId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Kein Zugriff auf diesen Kunden" }, { status: 403 });
    }
  }

  try {
    const result = await runPipeline({ customerId, trigger: "manual" });
    const stats = result.stats[0];
    return NextResponse.json({
      fetched: stats?.fetched ?? 0,
      fresh: stats?.fresh ?? 0,
      created: stats?.created ?? 0,
      discarded: stats?.discarded ?? 0,
      kpiSignals: stats?.kpiSignals ?? 0,
      notes: stats?.notes ?? [],
      errors: stats?.errors ?? [],
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Pipeline fehlgeschlagen" },
      { status: 502 }
    );
  }
}
