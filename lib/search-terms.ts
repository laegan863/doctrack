/** Tokenising shared by the indexer and the UI highlighter (safe for client components). */

export const MIN_TERM = 2;
export const MAX_PREFIX = 15;

/** Lowercase and strip accents: "Peña" → "pena". */
export function fold(text: string) {
  return text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/** Lowercase words of 2+ letters/digits. "IMISS-1126-001" → ["imiss", "1126", "001"]. */
export function tokenize(text: string | undefined | null): string[] {
  if (!text) return [];
  return (
    fold(text)
      .match(/[a-z0-9]+/g) ?? []
  ).filter((t) => t.length >= MIN_TERM);
}

/** Query words, deduplicated and cut to the longest indexed prefix. */
export function queryTerms(q: string) {
  return [...new Set(tokenize(q).map((t) => t.slice(0, MAX_PREFIX)))];
}
