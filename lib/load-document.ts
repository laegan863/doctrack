import { cache } from "react";
import { rootOf } from "@/lib/documents";
import { getDocument, getSubTransactions } from "@/lib/repos/documents";

/** Loads a document (by root or sub number) with its sub-transactions. Deduped per request. */
export const loadDocument = cache(async (param: string) => {
  const root = rootOf(decodeURIComponent(param));
  if (!root) return null;
  const doc = await getDocument(root);
  if (!doc) return null;
  const subs = await getSubTransactions(root);
  return { doc, subs };
});
