"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import {
  ACTIONS_REQUESTED,
  ACTION_KINDS,
  SERVICE_MODES,
  availableActions,
  rootOf,
  type ActionKind,
} from "@/lib/documents";
import { applyTransition, getDocument, type Transition } from "@/lib/repos/documents";
import { resolveLocation } from "@/lib/repos/locations";
import { reindexDocument } from "@/lib/repos/search";
import { parseZoned } from "@/lib/time";
import type { FormState } from "@/lib/types";

const req = (label: string, max = 300) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} is too long.`);
const opt = (max = 1000) => z.string().trim().max(max).optional().transform((v) => v || undefined);
const optWhen = z.string().trim().optional().transform((v) => v || undefined);
const optEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.enum(values), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined));

const schemas = {
  FORWARD: z.object({ to: req("Forward to", 80), actionRequested: optEnum(ACTIONS_REQUESTED), remarks: opt() }),
  RECEIVE: z.object({ by: req("Received by", 120), when: optWhen, remarks: opt() }),
  ACT: z.object({ what: req("What was done", 1000), when: optWhen }),
  RETURN: z.object({ reason: req("Reason", 1000), remarks: opt() }),
  REPROCESS: z.object({ to: req("Forward to", 80), actionRequested: optEnum(ACTIONS_REQUESTED), remarks: opt() }),
  RELEASE: z.object({ when: optWhen, by: opt(120), serviceMode: optEnum(SERVICE_MODES), remarks: opt() }),
  SERVE: z.object({ when: optWhen, by: req("Received by", 120), serviceMode: optEnum(SERVICE_MODES), remarks: opt() }),
  COMPLETE: z.object({ when: optWhen, remarks: opt() }),
  REMARK: z.object({ note: req("Note", 1000) }),
} satisfies Record<ActionKind, z.ZodType>;

function values(formData: FormData) {
  const v: Record<string, string> = {};
  for (const [k, val] of formData) if (typeof val === "string" && !k.startsWith("$")) v[k] = val;
  return v;
}

/** Optional "when" (datetime-local, office time zone). Defaults to now; future dates are rejected. */
function when(value: string | undefined) {
  if (!value) return Date.now();
  const t = parseZoned(value);
  if (Number.isNaN(t)) throw new Error("Invalid date & time.");
  if (t > Date.now() + 5 * 60_000) throw new Error("The date & time can't be in the future.");
  return t;
}

async function location(value: string) {
  const loc = await resolveLocation(value);
  if (!loc) throw new Error("That division or unit is no longer active.");
  return loc;
}

/** Runs one routing action (Forward, Received by unit, Return, Re-process, …) on a document. */
export async function performAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    await requireSession();
    const kind = String(formData.get("action")) as ActionKind;
    if (!ACTION_KINDS.includes(kind)) return { error: "Unknown action." };

    const no = rootOf(String(formData.get("trackingNo") ?? ""));
    const doc = no ? await getDocument(no) : null;
    if (!doc) return { error: "Document not found." };

    if (!availableActions(doc).includes(kind)) {
      return { error: "That action isn't available for this document anymore. Refresh the page." };
    }

    const parsed = schemas[kind].safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Please check the form.", values: values(formData) };
    }

    const t = await buildTransition(kind, parsed.data as never);
    await applyTransition(doc, t);
    await reindexDocument(doc.trackingNo);
    refresh();
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save.", values: values(formData) };
  }
}

async function buildTransition(kind: ActionKind, f: Record<string, string | undefined>): Promise<Transition> {
  switch (kind) {
    case "FORWARD": {
      const to = await location(f.to!);
      return {
        status: "FORWARDED",
        location: to,
        event: { type: "FORWARDED", location: to, remarks: join(f.actionRequested, f.remarks) },
      };
    }
    case "REPROCESS": {
      const to = await location(f.to!);
      return {
        status: "FORWARDED",
        location: to,
        newSub: true,
        event: { type: "FORWARDED", location: to, remarks: join("Re-processed", f.actionRequested, f.remarks) },
      };
    }
    case "RECEIVE":
      return {
        status: "RECEIVED_BY_UNIT",
        event: { type: "RECEIVED_BY_UNIT", at: when(f.when), by: f.by, remarks: f.remarks },
        suggestions: { recipient: [f.by] },
      };
    case "ACT":
      return { status: "ACTION_TAKEN", event: { type: "ACTION_TAKEN", at: when(f.when), remarks: f.what } };
    case "RETURN":
      return {
        status: "RETURNED",
        location: null,
        closeSub: true,
        event: { type: "RETURNED", remarks: join(f.reason, f.remarks) },
      };
    case "RELEASE":
      return {
        status: "RELEASED",
        location: null,
        event: { type: "RELEASED", at: when(f.when), by: f.by, remarks: join(f.serviceMode, f.remarks) },
        fields: f.serviceMode ? { serviceMode: f.serviceMode } : undefined,
      };
    case "SERVE":
      return {
        status: "SERVED",
        closeSub: true,
        event: { type: "SERVED", at: when(f.when), by: f.by, remarks: join(f.serviceMode, f.remarks) },
        fields: { receivedByName: f.by, ...(f.serviceMode ? { serviceMode: f.serviceMode } : {}) },
        suggestions: { recipient: [f.by] },
      };
    case "COMPLETE":
      return {
        status: "COMPLETED",
        location: null,
        closeSub: true,
        event: { type: "COMPLETED", at: when(f.when), remarks: f.remarks },
      };
    case "REMARK":
      return { event: { type: "REMARK", remarks: f.note } };
  }
}

function join(...parts: (string | undefined)[]) {
  return parts.filter(Boolean).join(" · ") || undefined;
}
