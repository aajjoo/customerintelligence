import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { extractProfile } from "@/lib/onboarding/extract";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Crawl (bis zu 3 Seiten) + Claude-Extraktion

// Onboarding Schritt 1+2: URL crawlen und Profilvorschlag erzeugen.
// Kunden anlegen dürfen Account Leads, Management und Admin (Teammitglieder nicht);
// die feinere Verwaltung folgt mit dem Admin-Bereich.

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!["lead", "management", "admin"].includes(session.user.role)) {
    return NextResponse.json(
      { error: "Kunden anlegen dürfen Account Leads, Management und Admin" },
      { status: 403 }
    );
  }

  let url: string;
  try {
    ({ url } = await request.json());
    new URL(url.startsWith("http") ? url : `https://${url}`); // Validierung
  } catch {
    return NextResponse.json({ error: "Keine gültige URL" }, { status: 400 });
  }

  try {
    const proposal = await extractProfile(url);
    return NextResponse.json(proposal);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Extraktion fehlgeschlagen" },
      { status: 502 }
    );
  }
}
