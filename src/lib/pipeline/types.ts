// Pipeline v1 (Etappe 3): Typen entlang der Verarbeitungsschritte aus docs/konzept.md Kap. 9:
// Erfassung → Normalisierung/Dedupe → Relevanzbewertung → Zusammenfassung → Review-Queue.

/** Roh-Item aus einem Konnektor (RSS-Eintrag, Website-Inhalt), noch unbewertet. */
export type RawItem = {
  title: string;
  url: string | null;
  /** Roh-Auszug aus der Quelle (Teaser, Description) – Basis für das Scoring */
  excerpt: string;
  publishedAt: Date | null;
};

/** Bewertetes Item nach Claude-Scoring. */
export type ScoredItem = RawItem & {
  relevance: number; // 0–100
  dimension: string; // markt | kunde | mitbewerb | innovation | geschaeft | politik
  titleDe: string;
  summaryDe: string;
};

/** Kundenprofil als Referenz für die Relevanzbewertung (aus Customer.profileJson). */
export type CustomerProfile = {
  name: string;
  industry: string;
  markets: string | null;
  competitors: string[];
  themes: string[];
};

/** Statistik je Kunde und Lauf (landet im PipelineRun-Protokoll). */
export type CustomerRunStats = {
  customer: string;
  fetched: number;
  fresh: number; // nach Dedupe
  created: number; // als Signal in der Review-Queue
  discarded: number; // bewertet, unter Relevanzschwelle aussortiert
  kpiSignals: number; // Kernregel 5
  taskSignals: number; // Erinnerungen/Eskalationen überfälliger Aufgaben (Etappe 5)
  reportGenerated?: boolean; // Monatsbericht am Monatsersten erzeugt
  errors: string[];
};
