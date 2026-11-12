"use client";

import { Button } from "./ui";

export function PrintButton({ label = "🖨 Print slip" }: { label?: string }) {
  return <Button onClick={() => window.print()}>{label}</Button>;
}
