import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Call at the top of every Server Action. proxy.ts already blocks signed-out
 * requests, but actions are public endpoints, so each one checks again.
 */
export async function requireSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(token))) {
    throw new Error("Not signed in.");
  }
}
