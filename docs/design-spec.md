# Marktradar – UX/UI-Spezifikation für die Umsetzung

Grundlage für die Implementierung mit Claude Code. Der klickbare Prototyp (`marktradar_prototyp.html`) ist die visuelle Referenz; dieses Dokument definiert Tokens, Komponenten und Screenstruktur. Fachliches Konzept: `Marktradar_Konzept_Netural.docx` (v1.3).

## Designprinzipien

Abgeleitet von netural.com: Schwarz/Weiß als Basis, große ruhige Typografie, viel Weißraum, keine Illustrationen, keine Verläufe, keine Schatten. Gelb ist der einzige Markenakzent und wird ausschließlich für "Neues" und den aktiven Agenten-/Freigabekontext verwendet. Grün/Rot sind rein funktionale Farben für KPI-Bewegungen und Status. Die Anwendung ist typografiegeführt: Hierarchie entsteht über Schriftgröße und -gewicht, nicht über Farbe oder Dekoration.

## Design-Tokens

```css
--black: #0A0A0A;        /* Text, primäre Buttons, aktive Zustände */
--white: #FFFFFF;        /* Hintergrund */
--gray-900: #1A1A1A;     /* Hover primärer Button */
--gray-700: #444444;     /* Sekundärtext */
--gray-500: #6E6E6E;     /* Tertiärtext, Labels, Metadaten */
--gray-300: #B8B8B4;     /* Rahmen interaktiver Elemente */
--gray-150: #E7E7E3;     /* Kartenrahmen, Trennlinien */
--gray-075: #F4F4F1;     /* Flächen (KPI-Kacheln, Chat-Bubble, Hover) */
--accent: #F1BB1E;       /* Gelb: Neu-Badges, KPI-Schwelle, Workflow aktiv */
--accent-soft: #FBEFC9;  /* Gelb-Fläche: Freigabe-Hinweise, Selektion */
--pos: #0E957D;          /* positiv (KPI ▲, Status ok) */
--neg: #C9432F;          /* negativ (KPI ▼, überfällig) */
--radius: 12px;          /* Karten */
--radius-s: 8px;         /* Buttons, Inputs, Kacheln */
```

Typografie: Google Font **Hind**. Gewichte: 300 (Body), 400 (UI-Text), 500 (Headings, Buttons, Zahlen), 600 (Logo). Seiten-Titel 2.1rem/500, Karten-Titel 1.15–1.2rem/500, Body 0.9–0.95rem/300, Labels/Meta 0.72–0.82rem in gray-500, KPI-Werte 1.65rem/500 mit letter-spacing −0.02em. Eyebrow-Zeilen: 0.78rem, uppercase, letter-spacing 0.09em.

Abstände: Basisraster 4px. Karten-Padding 20–24px. Sektionabstände 28–36px. Keine Box-Shadows; Karten sind 1px gray-150 umrandet, Hover = Rahmen schwarz.

## Informationsarchitektur

```
Sidebar (fix, 232px):  Meine Kunden | Portfolio | Aufgaben | Skills | Verwaltung
Topbar:                Suche | Benachrichtigungen | "+ Kunde hinzufügen"

Screen 1  Meine Kunden     Begrüßung + Tageszusammenfassung, Kundenkarten-Grid
Screen 2  Kundenseite      Header + 5 Tabs:
   Tab Radar               Dimension-Chips (Filter), Signalliste, Seitenpanel
                           (Signalvolumen-Chart, Radar-Lage, Mitbewerber)
   Tab Projekte & KPIs     Projektkarten mit Status-LED, KPI-Kacheln, Charts,
                           Meilensteine, "+ Projekt übernehmen" (Jira-Sync)
   Tab Chat                Chatverlauf mit Quellen-Chips, Eingabe, rechts
                           Fragevorschläge mit Rollen-Umschalter
   Tab Aufgaben            Opportunity-Pipeline (5 Spalten), Aufgabenliste,
                           Workflow-Karte mit Schrittfolge + Freigabe-Block
   Tab Bericht             Monatsbericht (Executive Summary, Signale, Projekte,
                           Aufgabenstand), Freigabe-Status, PDF-Export
Screen 3  Portfolio        Management: Balken-Chart je Kunde, "Braucht
                           Aufmerksamkeit"-Panel, Portfolio-Kennzahlen
Modal     Kunde hinzufügen URL-Eingabe → extrahierter Profilvorschlag → bestätigen
```

Mobile (< 960px): Sidebar wird zur Bottom-Navigation, alle Grids einspaltig, Prototyp zeigt das responsive Verhalten. Zielplattform ist eine installierbare PWA.

## Komponentenkatalog

Kundenkarte: Name + Branche + Team, Neu-Badge (gelb), Top-Signal mit gelbem Linksbalken, Sparkline (SVG), Metazeile (Opportunities/Aufgaben/Projekte). Ganze Karte klickbar.

Signalkarte: Tag-Zeile (Neu = gelb, Hohe Relevanz = schwarz, Dimension = grau, KPI-Signal = gelb-soft), Titel, 2-Zeilen-Zusammenfassung, Quellenzeile mit Link, Aktionen (Relevant / Irrelevant / → Opportunity / → Aufgabe). Jede Aussage trägt eine Quelle.

KPI-Kachel: Label (gray-500), Wert groß, Delta mit ▲/▼ in pos/neg, Ziel- und Schwellenzeile. KPI-Verläufe als Line-Chart mit Ziellinie (grau gestrichelt) und Schwellenlinie (gelb gestrichelt).

Status-LED: 9px Punkt, grün = auf Kurs, gelb = beobachten, rot = kritisch, plus Textlabel. Kein Farbwert ohne Text (Barrierefreiheit).

Pipeline: 5 Spalten (Neu, Geprüft, In Ausarbeitung, Beim Kunden, Gewonnen), Karten mit Herkunfts-/Verantwortungszeile, aktive Spalte gelb unterstrichen.

Workflow-Karte: gelber Linksbalken, nummerierte Schrittliste (erledigt = schwarz, aktiv = gelb, wartend = Umriss), Freigabe-Block auf gray-075 mit drei Aktionen (Freigeben, Entwurf öffnen, Änderungen anfordern). Nichts verlässt das System ohne Freigabe.

Chat: User-Bubble schwarz rechts, Antwort-Bubble gray-075 links, Quellen als Chips unter der Antwort. Fragevorschläge als Buttons, gespeist aus Rolle + aktueller Lage, Rollen-Umschalter im Prototyp zur Demonstration.

Charts (Chart.js): monochrom schwarz, Zweitreihe gelb, Grid gray-075, keine Legenden wo entbehrlich, Hind als Chart-Font.

## Interaktionsprinzipien

Review als Inbox: Signale in Sekunden bewertbar (Relevant/Irrelevant direkt auf der Karte). Alles Neue ist gelb markiert und verschwindet nach Sichtung. Aus jedem Objekt (Signal, Chat-Antwort, Berichtspunkt) führt ein direkter Weg zu Opportunity oder Aufgabe. Freigaben sind immer explizit und als solche gekennzeichnet.

## Technische Hinweise für die Umsetzung

Stack laut Konzept: Next.js/React als PWA auf Cloud Run, Google Sign-In (Domain-Restriktion netural.com), Cloud SQL/PostgreSQL + pgvector, Chart-Layer austauschbar (Chart.js oder Recharts). Der Prototyp ist bewusst Vanilla-HTML/CSS/JS in einer Datei; CSS-Tokens und Komponentenstruktur sind 1:1 in ein Designsystem (z. B. Tailwind-Theme oder CSS-Custom-Properties) überführbar. Demo-Daten im Prototyp sind fiktiv.
