"use client";

import { useState, useTransition } from "react";
import type { FormState } from "@/lib/types";
import { Button } from "./ui";

/** Runs a server action on click (with optional confirm) and shows any error. */
export function ActionButton({
  action,
  confirm: confirmText,
  children,
  variant = "ghost",
}: {
  action: () => Promise<FormState>;
  confirm?: string;
  children: React.ReactNode;
  variant?: "ghost" | "danger" | "secondary";
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <span className="relative inline-flex">
      <Button
        size="sm"
        variant={variant}
        disabled={pending}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          setError(undefined);
          start(async () => {
            const result = await action();
            if (result.error) setError(result.error);
          });
        }}
      >
        {pending ? "…" : children}
      </Button>
      {error && (
        <span
          role="alert"
          onClick={() => setError(undefined)}
          className="absolute right-0 top-full z-10 mt-1 w-64 cursor-pointer rounded-lg bg-red-600 px-3 py-2 text-xs text-white shadow-lg"
        >
          {error}
        </span>
      )}
    </span>
  );
}
