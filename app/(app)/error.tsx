"use client"; // Error boundaries must be Client Components

import Link from "next/link";
import { useEffect } from "react";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // Server errors arrive with a generic message plus a digest that matches the server log.
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : undefined;

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-xl text-red-600">!</div>
      <h1 className="mt-4 text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        This page hit an unexpected error. Your saved documents are safe. Try again, or go back to the dashboard. If it
        keeps happening, check your internet connection and the Upstash settings.
      </p>
      {digest && <p className="mt-2 font-mono text-xs text-slate-400">Error ID: {digest}</p>}
      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Try again
        </button>
        <Link href="/" className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
