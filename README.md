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

Etappe 2 (UI-Kern) abgeschlossen: alle Screens laut Prototyp mit Seed-Daten, noch ohne Pipeline.

- **Meine Kunden**: Begrüßung + Tageszusammenfassung, Kundenkarten mit Neu-Badge, Top-Signal, Sparkline und Metazeile.
- **Kundenseite** mit 5 Tabs: Radar (Dimension-Chips, Signal-Review direkt auf der Karte, Signalvolumen-Chart, Radar-Lage, Mitbewerber), Projekte & KPIs (Status-LED mit Textlabel, KPI-Kacheln, Verlaufscharts mit Ziel-/Schwellenlinie), Chat (deterministische Antworten aus Seed-Daten mit Quellen-Chips, Fragevorschläge mit Rollen-Umschalter; RAG folgt in Etappe 6), Aufgaben (Opportunity-Pipeline, Aufgabenliste, Workflow-Karte mit Freigabe-Block), Bericht (Executive Summary aus DB, berechnete Abschnitte, Freigabe).
- **Portfolio** (Management-Sicht): Chart je Kunde, regelbasiertes "Braucht Aufmerksamkeit", Kennzahlen.
- **Modal "Kunde hinzufügen"**: Demo-Ablauf wie im Prototyp; echte Extraktion folgt in Etappe 4.
- Server-Actions: Signal-Review (Relevant/Irrelevant), Signal → Opportunity/Aufgabe (mit Quellenbezug), Aufgabe abhaken, Workflow- und Berichts-Freigabe.
- Tests: `npm test` (Formatierungs-/Delta-Logik, ohne DB).

Login & Rechte (nachgezogen aus Etappe 1):

- **Google Sign-In** (NextAuth) mit Domain-Restriktion über `ALLOWED_EMAIL_DOMAIN`; ohne `GOOGLE_CLIENT_ID` läuft der **Demo-Modus** (Anmeldung als Seed-Lead, Hinweis auf der Login-Seite). `NEXTAUTH_SECRET` und `NEXTAUTH_URL` sind erforderlich.
- **Rollenmodell**: Rolle aus der DB (member | lead | management | admin); neue Nutzer der erlaubten Domain werden als Teammitglied angelegt.
- **Sichtbarkeit pro Kundenteam** (Kernregel 3): Management/Admin sehen alle Kunden, alle anderen nur zugeordnete – durchgesetzt in allen Seiten und Server-Actions; Rechte-Logik getestet in `tests/access.test.ts`.

Hinweis: Beim ursprünglichen GitHub-Upload fehlten einige Etappe-1-Dateien (`globals.css`, `Sidebar`, `Topbar`, `lib/db.ts`, `.gitignore`); sie wurden in Etappe 2 rekonstruiert.

Nächster Schritt laut `CLAUDE.md`: Etappe 3, Pipeline v1 (News-Konnektor, Website-Crawler, Dedupe, Claude-Scoring, Review-Queue).
