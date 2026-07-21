import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline/run";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Pipeline-Lauf darf länger dauern (Vercel Function Limit)

// Cron-Endpunkt (vercel.json → crons). Vercel sendet GET mit
// "Authorization: Bearer <CRON_SECRET>", wenn CRON_SECRET gesetzt ist.
// Cloud Scheduler + Cloud Tasks übernehmen das in der Ziel-Infrastruktur (CLAUDE.md).

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET nicht konfiguriert" },
      { status: 503 }
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  try {
    const result = await runPipeline({ trigger: "cron" });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
