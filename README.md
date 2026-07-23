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

Alle 8 Etappen abgeschlossen, plus Feedback-Runde 1 (23.07.2026):

**Performance & Crawling-Fixes (23.07.2026):** Vercel-Functions laufen jetzt in Frankfurt (fra1, nahe der Neon-DB – vorher US-Ost mit ~100 ms Latenz je Query, Hauptursache der schlechten Performance). Der manuelle Pipeline-Lauf läuft als API-Route /api/pipeline/kunde mit maxDuration 300 (als Server-Action brach er in Produktion am Timeout ab – deshalb "keine Ergebnisse"). Signal-Scoring mit effort low (schneller); optional SCORING_MODEL für ein schnelleres Modell nur im Scoring. Quellen speichern den letzten Abruf-Fehler (Anzeige in der Verwaltung); Lauf-Meldungen unterscheiden jetzt "Quelle unverändert", "nichts Relevantes" und echte Fehler. Kundenseite lädt Queries parallel und ohne aussortierte Signale.

**Feedback-Runde 1:** Globale Suche (Kunden/Signale/Projekte) und Benachrichtigungs-Dropdown in der Topbar sind funktional. Verwaltung (/verwaltung): Kunden löschen (mit Bestätigung, vollständige Kaskade), Recherche-Frequenz je Kunde (täglich/wöchentlich/aus – vom Cron respektiert, manuell geht immer), "Jetzt recherchieren", Quellen je Kunde anlegen/deaktivieren/löschen, Benutzerrollen (Management/Admin), Netural-Leistungsportfolio editierbar. Skills (/skills): Analyse-Anweisungen je Bereich (Radar-Scoring, Bericht, Chat, Onboarding), die direkt in die Claude-Prompts einfließen, plus Workflow-Skills anlegen/bearbeiten. Projekte lassen sich im Projekte-Tab mit KPI-Definitionen anlegen; Portfolio-Zeitraum umschaltbar (7/30/90 Tage).

**Workflows (Etappe 8):** Skill-Framework aus der DB (Name, Beschreibung, Prompt-Template, Output-Art – neue Workflows ohne Deployment). Auf jeder offenen Aufgabe lässt sich ein Workflow starten (Skill-Auswahl: Meeting-Briefing, Wettbewerbsvergleich, Follow-up). Der Lauf sammelt Radar-Material (gleiches Retrieval wie der Chat), Claude erzeugt einen Entwurf mit Quellenangaben, jeder Schritt wird protokolliert. Kernregel 2: Ausspielung (Slack) erst nach expliziter menschlicher Freigabe; ohne Slack-Konfiguration wird der Schritt dokumentiert übersprungen. Entwurf ist vor der Freigabe einsehbar.

**Integrationen (Etappe 7):** alles optional und env-gated – ohne Konfiguration bleibt die App voll funktionsfähig, Buttons sind ausgeblendet. Slack (SLACK_WEBHOOK_URL): tägliche Pipeline-Zusammenfassung als Notification; auch Ausspielkanal für freigegebene Workflows (Etappe 8). HubSpot (HUBSPOT_TOKEN, Private App): qualifizierte Opportunities per Klick als Deal übergeben (Konzept 4.3), Deal-ID wird an der Opportunity gespeichert. KPI-Import: CSV je Projekt (kpi;periode;wert) im Projekte-Tab – importierte Werte fließen in Charts, Berichte und die KPI-Schwellenprüfung (Kernregel 5). Slack/HubSpot sind gegen die offiziellen APIs implementiert, aber mangels Test-Accounts noch nicht gegen echte Endpunkte verifiziert. Google Drive und Jira-Sync folgen, sobald OAuth bzw. eine Jira-Instanz bereitstehen.

**Chat (Etappe 6):** Fragen an den Radar je Kunde über /api/chat. Retrieval v1 über Postgres-Volltextsuche (deutsch) + Recency über Signale, Berichte, Projekte/KPIs, Opportunities und Aufgaben; Claude beantwortet ausschließlich aus dem Material und liefert Quellen-Chips (Kernregel 1: keine Aussage ohne Quelle, fehlendes Material wird explizit benannt). Gesprächsverlauf gespeichert je Kunde und User (ChatMessage). Die Retrieval-Schnittstelle ist für pgvector-Embeddings vorbereitet (z. B. Voyage) – dafür wird ein Embedding-Provider-Key benötigt, Anthropic bietet keine Embeddings-API.

**Monatsbericht + Aufgaben (Etappe 5):** Claude generiert je Kunde einen Monatsbericht (Executive Summary, wichtigste Signale je Dimension mit Quellen, Projekte & KPIs, Opportunities & Aufgaben, Entwicklung ggü. Vormonat) plus empfohlene Maßnahmen – automatisch am Monatsersten im Cron oder manuell im Bericht-Tab. Freigabe nur durch den Account Lead (bzw. Management/Admin); dabei werden die Maßnahmen als Aufgaben mit Fälligkeit angelegt ("aus Bericht X"). Freigegebene Berichte sind archiviert (ein Bericht je Kunde+Monat) und als PDF exportierbar (/api/berichte/[id]/pdf, pdf-lib). Überfällige Aufgaben erzeugen im täglichen Lauf einmalig ein Erinnerungs-Signal (ab 1 Tag) bzw. Eskalations-Signal (ab 3 Tagen) im Internen Lagebild.

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

Der Etappenplan aus `CLAUDE.md` ist damit vollständig umgesetzt. Offene Ausbaustufen: pgvector-Embeddings für das Chat-Retrieval (Embedding-Provider-Key nötig), Google-Drive- und Jira-Integration (OAuth/Instanz), PWA/Web-Push, EN-Lokalisierung.
