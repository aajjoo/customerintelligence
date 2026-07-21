// Normalisierung und Deduplizierung (Konzept Kap. 9):
// gleiche Meldungen aus mehreren Quellen werden über einen Content-Hash zusammengeführt.
import { createHash } from "node:crypto";
import type { RawItem } from "./types";

/** Titel normalisieren: Kleinschreibung, Satzzeichen raus, Whitespace zusammenfassen. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[„“”"'’‘«»]/g, "")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Dedupe-Hash eines Items. Bewusst nur der normalisierte Titel:
 * dieselbe Meldung hat auf zwei Portalen verschiedene URLs, aber denselben Titel.
 */
export function contentHash(item: Pick<RawItem, "title">): string {
  return createHash("sha256").update(normalizeTitle(item.title)).digest("hex");
}

/** Filtert Items, deren Hash bereits bekannt ist, und dedupliziert innerhalb des Batches. */
export function dedupe<T extends Pick<RawItem, "title">>(
  items: T[],
  knownHashes: Set<string>
): { item: T; hash: string }[] {
  const seen = new Set(knownHashes);
  const fresh: { item: T; hash: string }[] = [];
  for (const item of items) {
    const hash = contentHash(item);
    if (seen.has(hash)) continue;
    seen.add(hash);
    fresh.push({ item, hash });
  }
  return fresh;
}
