// Demo-Daten laut Prototyp (fiktive Kunden). Ausführen: npm run db:seed
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const month = (m) => new Date(`2026-${String(m).padStart(2, "0")}-01T00:00:00Z`);

async function main() {
  // idempotent: alles löschen, neu anlegen
  await db.workflowRun.deleteMany();
  await db.task.deleteMany();
  await db.opportunity.deleteMany();
  await db.signal.deleteMany();
  await db.kpiValue.deleteMany();
  await db.kpi.deleteMany();
  await db.project.deleteMany();
  await db.report.deleteMany();
  await db.source.deleteMany();
  await db.teamMembership.deleteMany();
  await db.customer.deleteMany();
  await db.skill.deleteMany();
  await db.user.deleteMany();

  const albert = await db.user.create({
    data: { email: "albert.ortig@netural.com", name: "Albert Ortig", role: "lead" },
  });
  const lena = await db.user.create({
    data: { email: "l.huber@netural.com", name: "Lena Huber", role: "member" },
  });

  const customers = [
    { name: "AlpenStahl AG", slug: "alpenstahl", industry: "Stahl & Industrie", markets: "DACH + Norditalien", teamLabel: "Kundenteam A", websiteUrl: "https://www.alpenstahl.example", radarSince: new Date("2026-03-01"), profileJson: JSON.stringify({ competitors: ["Ferrotec", "SteelWorks Int.", "Donau Metall"], themes: ["Digitale Services", "Werkslogistik", "CBAM / Lieferkette"] }) },
    { name: "GreenCharge Energy", slug: "greencharge", industry: "E-Mobility", markets: "Österreich, Deutschland", teamLabel: "Kundenteam B", websiteUrl: "https://www.greencharge.example" },
    { name: "MediCare Group", slug: "medicare", industry: "Gesundheit", markets: "Österreich", teamLabel: "Kundenteam A", websiteUrl: "https://www.medicare.example" },
    { name: "Alpina Retail", slug: "alpina-retail", industry: "Handel", markets: "DACH", teamLabel: "Kundenteam C", websiteUrl: "https://www.alpina-retail.example" },
    { name: "FinNord Bank", slug: "finnord", industry: "Finanz", markets: "Österreich", teamLabel: "Kundenteam B", websiteUrl: "https://www.finnord.example" },
    { name: "GlasTech Systems", slug: "glastech", industry: "Maschinenbau", markets: "Europa", teamLabel: "Kundenteam C", websiteUrl: "https://www.glastech.example" },
  ];
  const c = {};
  for (const data of customers) {
    c[data.slug] = await db.customer.create({ data });
    await db.teamMembership.create({
      data: { userId: albert.id, customerId: c[data.slug].id, isLead: true },
    });
  }
  await db.teamMembership.create({ data: { userId: lena.id, customerId: c["alpenstahl"].id } });

  const alp = c["alpenstahl"];

  // Quellen
  const src = await db.source.create({
    data: { customerId: alp.id, kind: "news", label: "Pressemitteilung Ferrotec", url: "https://presse.ferrotec.example" },
  });

  // Signale AlpenStahl
  const sigFerrotec = await db.signal.create({
    data: {
      customerId: alp.id, sourceId: src.id, dimension: "mitbewerb",
      title: "Ferrotec kündigt digitales Serviceportal für Q4 2026 an",
      summary: "Der direkte Wettbewerber launcht ein Kundenportal mit Ersatzteilbestellung und Anlagenmonitoring. Deckt sich in Teilen mit dem Scope des laufenden AlpenStahl-Portalprojekts – Differenzierung über Servicetiefe möglich.",
      sourceLabel: "Pressemitteilung Ferrotec", sourceUrl: "https://presse.ferrotec.example",
      relevance: 92, isNew: true, occurredAt: new Date("2026-07-21T06:40:00Z"),
    },
  });
  await db.signal.createMany({
    data: [
      { customerId: alp.id, dimension: "kunde", title: "AlpenStahl sucht „Digital Process Manager Logistik“", summary: "Neue Stellenausschreibung deutet auf geplante Digitalisierung der Werkslogistik hin. Bisher kein Netural-Projekt in diesem Bereich – möglicher Anknüpfungspunkt für Analyse & Strategie.", sourceLabel: "karriere.alpenstahl.example", relevance: 74, isNew: true, occurredAt: new Date("2026-07-20") },
      { customerId: alp.id, dimension: "politik", title: "CBAM-Berichtspflichten werden ab 2027 erweitert", summary: "Die EU konkretisiert die CO2-Grenzausgleichs-Berichterstattung. Für AlpenStahl steigen Datenanforderungen entlang der Lieferkette – relevant für die Datenplattform (Phase 2).", sourceLabel: "EU-Kommission", relevance: 66, isNew: false, occurredAt: new Date("2026-07-18") },
      { customerId: alp.id, dimension: "geschaeft", title: "Halbjahreszahlen: Servicegeschäft wächst um 12 %", summary: "Der Vorstand betont im Earnings Call den Ausbau digitaler Services als strategische Priorität für 2027. Investitionsbudget für Digitalisierung wurde um 20 % erhöht.", sourceLabel: "Geschäftsbericht H1", relevance: 81, isNew: false, occurredAt: new Date("2026-07-15") },
    ],
  });
  // je ein Top-Signal für die übrigen Kunden
  await db.signal.createMany({
    data: [
      { customerId: c["greencharge"].id, dimension: "politik", title: "Neue EU-Förderlinie für Ladeinfrastruktur beschlossen", summary: "Antragsfenster öffnet im September; förderfähig sind auch Software- und Backendkomponenten.", sourceLabel: "EU-Amtsblatt", relevance: 85, isNew: true, occurredAt: new Date("2026-07-19") },
      { customerId: c["medicare"].id, dimension: "kunde", title: "Stellenausschreibung „Head of Digital Patient Experience“", summary: "Deutet auf neue Digitalstrategie im Patientenkontakt hin.", sourceLabel: "LinkedIn", relevance: 72, isNew: true, occurredAt: new Date("2026-07-18") },
      { customerId: c["alpina-retail"].id, dimension: "geschaeft", title: "Quartalszahlen: Onlineanteil wächst auf 31 %", summary: "Stationär rückläufig – Investitionsdruck im E-Commerce steigt.", sourceLabel: "Quartalsbericht", relevance: 76, isNew: true, occurredAt: new Date("2026-07-17") },
      { customerId: c["finnord"].id, dimension: "politik", title: "DORA: Aufsicht kündigt verschärfte Prüfungen ab 2027 an", summary: "IKT-Resilienz rückt in den Prüfungsfokus, Nachweispflichten steigen.", sourceLabel: "FMA", relevance: 64, isNew: false, occurredAt: new Date("2026-07-14") },
      { customerId: c["glastech"].id, dimension: "geschaeft", title: "Übernahme eines italienischen Wettbewerbers abgeschlossen", summary: "Integration der Serviceprozesse steht an; Systemlandschaft heterogen.", sourceLabel: "Pressemitteilung", relevance: 78, isNew: true, occurredAt: new Date("2026-07-16") },
    ],
  });

  // Projekte + KPIs AlpenStahl
  const portal = await db.project.create({
    data: {
      customerId: alp.id, name: "Kundenportal 2.0", status: "watch",
      phase: "Rollout · Meilenstein M4 am 15. Aug.", externalRef: "ALP-PORTAL",
      description: "Serviceportal für Händler und Direktkunden: Ersatzteile, Anlagendokumentation, Störungsmeldungen. Rollout Welle 2 läuft, Adoption unter Ziel.",
    },
  });
  const adoption = await db.kpi.create({
    data: { projectId: portal.id, label: "Portal-Adoption", unit: "%", target: 65, threshold: 50, direction: "up" },
  });
  const adoptionVals = [[2, 38], [3, 44], [4, 49], [5, 52], [6, 50], [7, 46]];
  for (const [m, v] of adoptionVals) {
    await db.kpiValue.create({ data: { kpiId: adoption.id, period: month(m), value: v } });
  }
  // KPI-Signal (Kernregel 5) mit Dedupe-Hash, damit die Pipeline es nicht dupliziert
  await db.signal.create({
    data: {
      customerId: alp.id, dimension: "intern", isKpiSignal: true, isNew: true,
      title: "KPI-Abweichung: Portal-Adoption unter Schwellenwert",
      summary: "Die Aktivierungsrate im Kundenportal liegt mit 46 % erstmals unter dem Schwellenwert von 50 % (Ziel: 65 %). Hauptursache laut Analytics: Abbrüche bei der Erstregistrierung von Händlern.",
      sourceLabel: "Projekt Kundenportal · KPI Adoption", relevance: 88,
      contentHash: `kpi:${adoption.id}:2026-07`, occurredAt: new Date("2026-07-20"),
    },
  });
  const deflection = await db.kpi.create({
    data: { projectId: portal.id, label: "Ticket-Deflection", unit: "%", target: 40, direction: "up" },
  });
  for (const [m, v] of [[5, 22], [6, 26], [7, 31]]) {
    await db.kpiValue.create({ data: { kpiId: deflection.id, period: month(m), value: v } });
  }
  const app = await db.project.create({
    data: {
      customerId: alp.id, name: "Service-App Instandhaltung", status: "ok",
      phase: "Entwicklung · Sprint 14", externalRef: "ALP-APP",
      description: "Mobile App für Servicetechniker: Wartungspläne, Checklisten, Offline-Dokumentation. Pilotgruppe seit Juni aktiv.",
    },
  });
  const techniker = await db.kpi.create({
    data: { projectId: app.id, label: "Aktive Techniker", unit: "count", target: 120, direction: "up" },
  });
  for (const [m, v] of [[5, 41], [6, 65], [7, 87]]) {
    await db.kpiValue.create({ data: { kpiId: techniker.id, period: month(m), value: v } });
  }
  await db.project.create({
    data: {
      customerId: alp.id, name: "Datenplattform Vertrieb", status: "ok",
      phase: "Konzeption · Kickoff Phase 2 im Sept.", externalRef: "ALP-DATA",
      description: "Konsolidierte Vertriebsdaten als Basis für Forecasting und Preisanalytik. Phase 1 abgeschlossen, Phase 2 in Beauftragung.",
    },
  });

  // Opportunities + Aufgaben
  const oppFerrotec = await db.opportunity.create({
    data: {
      customerId: alp.id, signalId: sigFerrotec.id, stage: "reviewed", ownerLabel: "A. Ortig",
      title: "Portal-Differenzierung gegen Ferrotec ausarbeiten",
      rationale: "Anlagenmonitoring + Ersatzteillogistik als Differenzierung; Bezug: Software Engineering, Experience Design.",
    },
  });
  await db.opportunity.createMany({
    data: [
      { customerId: alp.id, stage: "new", title: "Logistik-Digitalisierung als Beratungsthema platzieren", rationale: "Signal Stellenausschreibung; Bezug: Analyse & Strategie." },
      { customerId: alp.id, stage: "new", title: "CBAM-Datenanforderungen in Datenplattform Phase 2", rationale: "Signal EU-Regulatorik; Bezug: Daten & KI." },
      { customerId: alp.id, stage: "drafting", title: "Maßnahmenpaket Händler-Registrierung", ownerLabel: "L. Huber" },
      { customerId: alp.id, stage: "placed", title: "Ausbau Service-App auf Werk Donawitz", ownerLabel: "A. Ortig" },
      { customerId: alp.id, stage: "won", title: "Datenplattform Phase 2", ownerLabel: "A. Ortig" },
    ],
  });
  const t1 = await db.task.create({
    data: {
      customerId: alp.id, opportunityId: oppFerrotec.id, assigneeId: albert.id,
      title: "Wettbewerbsvergleich Ferrotec-Portal erstellen",
      originLabel: "aus Bericht Juli", dueAt: new Date("2026-07-20"),
    },
  });
  await db.task.createMany({
    data: [
      { customerId: alp.id, assigneeId: lena.id, title: "Follow-up zu Adoption-Maßnahmen an Hr. Steiner senden", originLabel: "aus KPI-Signal", dueAt: new Date("2026-07-24") },
      { customerId: alp.id, title: "Kurzbriefing für Termin am 28. Juli vorbereiten", originLabel: "aus Kalender", dueAt: new Date("2026-07-25") },
      { customerId: alp.id, title: "CBAM-Signal fachlich bewerten", originLabel: "aus Radar", status: "done" },
    ],
  });
  await db.workflowRun.create({
    data: {
      taskId: t1.id, skillName: "Wettbewerbsvergleich", status: "waiting_approval",
      stepsJson: JSON.stringify([
        { step: "Signale & Quellen sammeln", status: "done", note: "9 Quellen ausgewertet" },
        { step: "Funktionsvergleich erstellen", status: "done", note: "gegen Scope Kundenportal 2.0 gemappt" },
        { step: "Entwurf zur Freigabe", status: "active", note: "4 Seiten, 12 Kriterien" },
        { step: "Ablage in Google Drive", status: "pending" },
        { step: "Slack-Zusammenfassung posten", status: "pending" },
      ]),
    },
  });

  // Bericht
  await db.report.create({
    data: {
      customerId: alp.id, month: "2026-07", status: "draft",
      execSummary: "Der Juli war geprägt vom angekündigten Ferrotec-Serviceportal und der erstmals unter die Schwelle gefallenen Portal-Adoption (46 %). Gleichzeitig erhöht AlpenStahl das Digitalbudget um 20 % mit Fokus auf Services. Empfehlung: Portal-Differenzierung aktiv platzieren, Logistikthema als Analyse-Angebot vorbereiten.",
    },
  });

  // Organisations-Skills
  await db.skill.createMany({
    data: [
      { name: "Meeting-Briefing", scope: "org", description: "Fasst vor einem Kundentermin relevante Entwicklungen und offene Punkte zusammen.", outputKind: "briefing" },
      { name: "Wettbewerbsvergleich", scope: "org", description: "Stellt digitale Aktivitäten des Kunden denen der Mitbewerber gegenüber.", outputKind: "report" },
      { name: "Follow-up", scope: "org", description: "Entwirft eine Follow-up-E-Mail auf Basis von Signal und Historie.", outputKind: "email" },
    ],
  });

  console.log("Seed abgeschlossen:", await db.customer.count(), "Kunden,", await db.signal.count(), "Signale.");
}

main().finally(() => db.$disconnect());
