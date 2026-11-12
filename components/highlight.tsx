import { fold, queryTerms } from "@/lib/search-terms";


/** Highlights the start of each word that matches a search word (prefix match, accent-insensitive). */
export function Highlight({ text, query }: { text?: string; query: string }) {
  if (!text) return null;
  const terms = queryTerms(query);
  if (terms.length === 0) return <>{text}</>;

  const parts = text.split(/([\p{L}\p{N}]+)/u);
  return (
    <>
      {parts.map((part, i) => {
        const folded = fold(part);
        const term = terms.find((t) => folded.startsWith(t));
        if (!term) return <span key={i}>{part}</span>;
        return (
          <span key={i}>
            <mark className="rounded bg-yellow-100 px-0.5 text-inherit">{part.slice(0, term.length)}</mark>
            {part.slice(term.length)}
          </span>
        );
      })}
    </>
  );
}
