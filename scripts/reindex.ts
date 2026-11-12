/**
 * Rebuilds the search index for every document.
 * Only needed after importing data or if search results look out of date.
 *
 *   npm run reindex
 */
import { isRedisConfigured } from "@/lib/redis";
import { reindexAll } from "@/lib/repos/search";

async function main() {
  if (!isRedisConfigured()) {
    console.error("Redis is not configured. Fill in .env.local first (see .env.example).");
    process.exit(1);
  }
  const total = await reindexAll((done, all) => {
    if (done % 25 === 0 || done === all) console.log(`  ${done}/${all}`);
  });
  console.log(`Re-indexed ${total} documents.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
