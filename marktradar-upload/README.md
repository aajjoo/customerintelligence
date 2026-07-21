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

Etappe 1 (Gerüst) abgeschlossen: App-Shell, Design-Tokens, Datenmodell (PostgreSQL), Seed, Startseite und Kunden-Rohansicht. Nächster Schritt laut `CLAUDE.md`: Etappe 2, vollständige Kundenseite mit Tabs.
