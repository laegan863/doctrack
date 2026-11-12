import { connection } from "next/server";

/**
 * Current time for this request. Awaiting connection() marks the caller as
 * request-time rendering (required by Cache Components before reading the clock).
 */
export async function requestNow() {
  await connection();
  return Date.now();
}
