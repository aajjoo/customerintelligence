// HubSpot-Integration (Etappe 7, Konzept 4.3): qualifizierte Opportunities
// werden als Deal an HubSpot übergeben. Konfiguration über HUBSPOT_TOKEN
// (Private-App-Token); ohne Konfiguration ist der UI-Button deaktiviert.

export function hubspotConfigured(): boolean {
  return !!process.env.HUBSPOT_TOKEN;
}

/** Legt einen Deal in HubSpot an und liefert die Deal-ID zurück. */
export async function createHubspotDeal(input: {
  title: string;
  customerName: string;
  rationale: string | null;
}): Promise<string> {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error("HUBSPOT_TOKEN ist nicht gesetzt");

  const res = await fetch("https://api.hubapi.com/crm/v3/objects/deals", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        dealname: `${input.customerName}: ${input.title}`,
        description: input.rationale ?? "",
        pipeline: "default",
        dealstage: "appointmentscheduled",
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HubSpot: HTTP ${res.status} – ${body.slice(0, 200)}`);
  }
  const deal = (await res.json()) as { id: string };
  return deal.id;
}
