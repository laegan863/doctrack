"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isRedisConfigured, redis } from "@/lib/redis";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/session";

export type LoginState = { error?: string };

const MAX_ATTEMPTS = 10;
const LOCK_SECONDS = 15 * 60;

function sha256(value: string) {
  return createHash("sha256").update(value).digest();
}

function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const expected = process.env.APP_PASSWORD;
  if (!expected || !process.env.SESSION_SECRET) {
    return {
      error: "APP_PASSWORD and SESSION_SECRET are not set. Add them to .env.local.",
    };
  }

  // Brute-force protection (only when Redis is available).
  const failKey = `login:fail:${await clientIp()}`;
  if (isRedisConfigured()) {
    const fails = (await redis().get<number>(failKey)) ?? 0;
    if (fails >= MAX_ATTEMPTS) {
      return { error: "Too many failed attempts. Try again in 15 minutes." };
    }
  }

  const password = String(formData.get("password") ?? "");
  const ok = timingSafeEqual(sha256(password), sha256(expected));

  if (!ok) {
    if (isRedisConfigured()) {
      const tx = redis().multi();
      tx.incr(failKey);
      tx.expire(failKey, LOCK_SECONDS);
      await tx.exec();
    }
    return { error: "Incorrect password." };
  }

  if (isRedisConfigured()) await redis().del(failKey);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions());
  redirect(safeNext(formData.get("next")));
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
