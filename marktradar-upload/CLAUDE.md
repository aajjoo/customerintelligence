# Marktradar – Netural Kundenintelligenz-Plattform

Interne Plattform für Netural-Kundenteams: pro Kunde ein Marktradar (Signale aus externen und internen Quellen, KI-bewertet), eine Projektsicht (Status + KPIs), Chat mit Fragevorschlägen, Monatsberichte, Opportunity-Pipeline, Aufgaben mit agentischen Workflows.

## Maßgebliche Dokumente

- `docs/konzept.md` – fachliches Konzept v1.3 (verbindlich für Scope und Begriffe)
- `docs/design-spec.md` – UX/UI-Spezifikation: Design-Tokens, Komponenten, Screens (verbindlich für alles Visuelle)
- `referenz/prototyp.html` – klickbarer Referenz-Prototyp. Das Zielsystem soll exakt so aussehen und sich so anfühlen.

Bei Widersprüchen gilt: design-spec.md vor prototyp.html, konzept.md für alles Fachliche.

## Stack

- Frontend: Next.js (App Router), React, TypeScript, PWA (installierbar, Web Push)
- Styling: Tailwind, Theme aus den Tokens in design-spec.md. Font: Hind (300/400/500/600). Keine anderen Farben als die Tokens.
- Charts: Chart.js oder Recharts, monochrom schwarz mit Gelb als Zweitfarbe (siehe Spec)
- Backend: Next.js API Routes bzw. separater Service (Node/TypeScript) auf Cloud Run
- DB: PostgreSQL mit pgvector; Prisma als ORM. Entwicklung/Start: Neon (DATABASE_URL), später Cloud SQL
- Deployment: Vercel (auto-deploy je Push), Ziel-Infrastruktur später Google Cloud Run
- Auth: Google Sign-In (OAuth 2.0), nur Domain netural.com, Rollen: Teammitglied, Account Lead, Management, Admin
- KI: Claude API für Relevanz-Scoring, Zusammenfassungen (DE/EN), Chat, Agent-Workflows
- Jobs: Cloud Scheduler + Cloud Tasks (Pipeline), Secret Manager für Keys
- Region: ausschließlich EU (europe-west)

## Fachliche Kernregeln (nicht verhandelbar)

1. Jede KI-Aussage (Signal, Insight, Chat-Antwort, Bericht) trägt mindestens eine Quellenangabe. Ohne Quelle keine Ausspielung.
2. Agentische Workflows führen nichts Externes ohne menschliche Freigabe aus (E-Mail, CRM, Slack, Dokumente an Kunden). Jeder Lauf ist mit Zwischenschritten protokolliert.
3. Sichtbarkeit strikt pro Kundenteam. Management/Admin sehen alles, alle anderen nur zugeordnete Kunden.
4. Datenfluss Signal → Insight → Opportunity → Aufgabe; jede Stufe behält den Quellenbezug.
5. KPI-Abweichung unter Schwellenwert erzeugt automatisch ein Signal der Dimension "Internes Lagebild".

## Etappenplan (in dieser Reihenfolge bauen)

1. **Gerüst**: Next.js + Tailwind-Theme aus Tokens, Google-Login mit Domain-Restriktion, Rollenmodell, Datenmodell (Prisma-Schema: Customer, TeamMembership, Signal, Insight, Opportunity, Task, Project, Kpi, KpiValue, Report, Skill, WorkflowRun, Source), Seed mit Demo-Daten aus dem Prototyp.
2. **UI-Kern**: Screens laut Prototyp: Meine Kunden, Kundenseite mit Tabs Radar / Projekte & KPIs / Chat / Aufgaben / Bericht, Portfolio, Modal "Kunde hinzufügen". Erst mit Seed-Daten, noch ohne Pipeline.
3. **Pipeline v1**: Quellen-Konnektor News (RSS/News-API) + Website-Crawler, Dedupe, Claude-Scoring gegen Kundenprofil + Leistungsportfolio, Zusammenfassung DE, Review-Queue.
4. **Kunden-Onboarding**: URL eingeben → Crawl → Profilvorschlag (Branche, Quellen, Mitbewerber-Kandidaten, Themen) → Bestätigen-Flow wie im Prototyp-Modal.
5. **Monatsbericht + Aufgaben**: Berichtgenerierung, Freigabe durch Account Lead, PDF-Export, Aufgaben aus Bericht mit Fälligkeit, Erinnerung, Eskalation.
6. **Chat**: RAG über Signale/Berichte/Projekte (pgvector), Quellen-Chips, Fragevorschläge aus Rolle + Lage.
7. **Integrationen**: HubSpot (Deals/Kontakte, Opportunity-Übergabe), Slack (Notifications), Google Drive (Kontext), Jira/Projektsoftware (Projekt-Sync), KPI-Import.
8. **Workflows**: Skill-/Workflow-Framework (Definitionen in DB, keine Deployments nötig), erste Workflows: Meeting-Briefing, Follow-up, Wettbewerbsvergleich; Freigabe-UI wie im Prototyp.

Jede Etappe endet lauffähig und getestet, bevor die nächste beginnt.

## Konventionen

- Sprache im UI: Deutsch (i18n-Struktur von Anfang an, EN folgt)
- Tests für Pipeline-Logik und Rechteprüfungen verpflichtend
- Keine Secrets im Code, alles über Secret Manager / .env
- Migrationen über Prisma, keine manuellen Schemaänderungen
- Barrierefreiheit: Status nie nur über Farbe, immer mit Textlabel (siehe Spec)
