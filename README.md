# Netural Marktradar

Kundenintelligenz-Plattform für Netural Kundenteams. Fachliches Konzept in `docs/konzept.md`, UX/UI in `docs/design-spec.md`, visuelle Referenz in `referenz/prototyp.html`. Arbeitsanweisung für Claude Code: `CLAUDE.md`.

## Arbeitsweise (Cloud, ohne lokale Installation)

1. Dieses Repo liegt auf GitHub. Weiterentwicklung über Claude Code (Web/Cloud), verbunden mit dem GitHub-Repo. Jede Etappe endet als Commit/PR.
2. Datenbank: PostgreSQL bei Neon (neon.tech). Verbindungsstring als `DATABASE_URL`.
3. Deployment: Vercel, verbunden mit dem GitHub-Repo. Jeder Push deployt automatisch, die App ist unter der Vercel-URL im Browser erreichbar.

Benötigte Umgebungsvariablen (in Vercel unter Settings > Environment Variables, für Claude-Code-Sessions als Secrets):

```
DATABASE_URL        PostgreSQL-Verbindungsstring (Neon)
NEXTAUTH_URL        https://<projekt>.vercel.app
NEXTAUTH_SECRET     Zufallswert (z. B. openssl rand -hex 32)
GOOGLE_CLIENT_ID    optional, sonst Demo-Modus
GOOGLE_CLIENT_SECRET optional
ALLOWED_EMAIL_DOMAIN netural.com
```

Erstbefüllung der Datenbank (einmalig, aus einer Claude-Code-Session oder lokal):

```bash
npx prisma db push && node prisma/seed.mjs
```

## Lokal starten (optional)

Node.js 20+, dann `cp .env.example .env` (DATABASE_URL eintragen), `npm run setup`, `npm run dev`.

## Stand

Etappen 1-4 abgeschlossen: UI-Kern, Login/Rechte, Pipeline v1 und Kunden-Onboarding.

**Pipeline v1 (Etappe 3):** Quellen-Konnektoren (RSS 2.0 / RSS 1.0-RDF / Atom, Website-Crawler mit Änderungserkennung), Dedupe über Titel-Hash, Claude-Scoring gegen Kundenprofil + Netural-Leistungsportfolio mit deutscher Zusammenfassung (strukturierte Outputs, gebatcht), Review-Queue im Radar-Tab ("Zu prüfen"-Filter, "Quellen abrufen"-Button). Aussortierte Items werden als review=irrelevant gespeichert (kein Re-Scoring). Kernregel 5: KPI unter Schwelle erzeugt automatisch ein "Internes Lagebild"-Signal (dedupliziert je KPI+Monat). Jeder Lauf protokolliert als PipelineRun. Täglicher Cron 6:00 über vercel.json → /api/pipeline/run (CRON_SECRET). Benötigt ANTHROPIC_API_KEY; optional CLAUDE_MODEL.

**Kunden-Onboarding (Etappe 4):** Modal "Kunde hinzufügen" mit echtem Flow: URL → Crawl (Startseite + Presse/Karriere, RSS-Discovery) → Claude-Profilvorschlag (Name, Branche, Märkte, Mitbewerber-Kandidaten, strategische Themen) → editierbarer Bestätigen-Screen → Kunde mit Quellen und Team-Zuordnung (Ersteller wird Account Lead). Kunden anlegen dürfen lead/management/admin. Extraktion über /api/onboarding/extract (maxDuration 60s).

Etappe 2 (UI-Kern): alle Screens laut Prototyp.

- **Meine Kunden**: Begrüßung + Tageszusammenfassung, Kundenkarten mit Neu-Badge, Top-Signal, Sparkline und Metazeile.
- **Kundenseite** mit 5 Tabs: Radar (Dimension-Chips, Signal-Review direkt auf der Karte, Signalvolumen-Chart, Radar-Lage, Mitbewerber), Projekte & KPIs (Status-LED mit Textlabel, KPI-Kacheln, Verlaufscharts mit Ziel-/Schwellenlinie), Chat (deterministische Antworten aus Seed-Daten mit Quellen-Chips, Fragevorschläge mit Rollen-Umschalter; RAG folgt in Etappe 6), Aufgaben (Opportunity-Pipeline, Aufgabenliste, Workflow-Karte mit Freigabe-Block), Bericht (Executive Summary aus DB, berechnete Abschnitte, Freigabe).
- **Portfolio** (Management-Sicht): Chart je Kunde, regelbasiertes "Braucht Aufmerksamkeit", Kennzahlen.
- Server-Actions: Signal-Review (Relevant/Irrelevant), Signal → Opportunity/Aufgabe (mit Quellenbezug), Aufgabe abhaken, Workflow- und Berichts-Freigabe.
- Tests: `npm test` (Formatierung, Rechteprüfung, Pipeline-Logik, Onboarding – ohne DB/Netz).

Login & Rechte (nachgezogen aus Etappe 1):

- **Google Sign-In** (NextAuth) mit Domain-Restriktion über `ALLOWED_EMAIL_DOMAIN`; ohne `GOOGLE_CLIENT_ID` läuft der **Demo-Modus** (Anmeldung als Seed-Lead, Hinweis auf der Login-Seite). `NEXTAUTH_SECRET` und `NEXTAUTH_URL` sind erforderlich.
- **Rollenmodell**: Rolle aus der DB (member | lead | management | admin); neue Nutzer der erlaubten Domain werden als Teammitglied angelegt.
- **Sichtbarkeit pro Kundenteam** (Kernregel 3): Management/Admin sehen alle Kunden, alle anderen nur zugeordnete – durchgesetzt in allen Seiten und Server-Actions; Rechte-Logik getestet in `tests/access.test.ts`.

Hinweis: Beim ursprünglichen GitHub-Upload fehlten einige Etappe-1-Dateien (`globals.css`, `Sidebar`, `Topbar`, `lib/db.ts`, `.gitignore`); sie wurden in Etappe 2 rekonstruiert.

Nächster Schritt laut `CLAUDE.md`: Etappe 5, Monatsbericht + Aufgaben (Berichtgenerierung, Freigabe, PDF-Export, Erinnerung, Eskalation).
