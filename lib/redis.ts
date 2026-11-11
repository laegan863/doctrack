import { Redis } from "@upstash/redis";

/**
 * Upstash Redis client.
 *
 * Accepts either the Upstash variable names or the ones Vercel's
 * Upstash/KV integration injects, so the same code runs locally and on Vercel.
 */
let client: Redis | null = null;

function readEnv() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return { url, token };
}

export function isRedisConfigured() {
  const { url, token } = readEnv();
  return Boolean(url && token);
}

export function redis(): Redis {
  if (client) return client;
  const { url, token } = readEnv();
  if (!url || !token) {
    throw new Error(
      "Redis is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env.local.",
    );
  }
  client = new Redis({ url, token });
  return client;
}
