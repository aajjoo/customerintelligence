// i18n-Struktur laut Konventionen: alle UI-Begriffe zentral, DE zuerst, EN folgt.
// Fachbegriffe (Dimensionen, Stages, Status) sind verbindlich aus docs/konzept.md.

export const DIMENSIONS: { key: string; label: string }[] = [
  { key: "markt", label: "Markt & Branche" },
  { key: "kunde", label: "Kunde direkt" },
  { key: "mitbewerb", label: "Mitbewerb" },
  { key: "innovation", label: "Innovation" },
  { key: "geschaeft", label: "Geschäftsebene" },
  { key: "politik", label: "Politik & Regulatorik" },
  { key: "intern", label: "Internes Lagebild" },
];

export const dimensionLabel = (key: string) =>
  DIMENSIONS.find((d) => d.key === key)?.label ?? key;

export const PIPELINE_STAGES: { key: string; label: string }[] = [
  { key: "new", label: "Neu" },
  { key: "reviewed", label: "Geprüft" },
  { key: "drafting", label: "In Ausarbeitung" },
  { key: "placed", label: "Beim Kunden" },
  { key: "won", label: "Gewonnen" },
];

export const PROJECT_STATUS: Record<string, { label: string; led: string }> = {
  ok: { label: "Auf Kurs", led: "bg-pos" },
  watch: { label: "Beobachten", led: "bg-accent" },
  critical: { label: "Kritisch", led: "bg-neg" },
};

export const ROLE_LABELS: Record<string, string> = {
  member: "Teammitglied",
  lead: "Account Lead",
  management: "Management",
  admin: "Admin",
};
