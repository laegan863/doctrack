"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import {
  deleteDivision,
  deleteDocType,
  deleteUnit,
  getDivision,
  getDocType,
  getUnit,
  listDivisions,
  listDocTypes,
  listUnits,
  newId,
  saveDivision,
  saveDocType,
  saveUnit,
} from "@/lib/repos/locations";
import type { FormState } from "@/lib/types";

const text = (max: number) => z.string().trim().max(max);
const code = z
  .string()
  .trim()
  .min(1, "Code is required.")
  .max(20, "Code must be 20 characters or less.")
  .regex(/^[A-Za-z0-9_-]+$/, "Code can only use letters, numbers, - and _.")
  .transform((s) => s.toUpperCase());

const divisionSchema = z.object({
  id: z.string().optional(),
  code,
  name: text(120).min(1, "Name is required."),
  head: text(120),
});

const unitSchema = divisionSchema.extend({
  divisionId: z.string().min(1, "Choose a division."),
});

const docTypeSchema = z.object({
  id: z.string().optional(),
  name: text(80).min(1, "Name is required."),
  defaultDays: z.coerce
    .number({ error: "Enter a number of days." })
    .int("Use whole days.")
    .min(1, "At least 1 day.")
    .max(365, "At most 365 days."),
});

function parse<T extends z.ZodType>(schema: T, formData: FormData) {
  const result = schema.safeParse(Object.fromEntries(formData));
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Invalid input." } as const;
  }
  return { data: result.data as z.infer<T> } as const;
}

function fail(err: unknown): FormState {
  return { error: err instanceof Error ? err.message : "Something went wrong." };
}

/** On error, echo the submitted text values back so the form keeps what was typed. */
function withValues(result: FormState, formData: FormData): FormState {
  if (!result.error) return result;
  const values: Record<string, string> = {};
  for (const [k, v] of formData) if (typeof v === "string" && !k.startsWith("$")) values[k] = v;
  return { ...result, values };
}

export async function upsertDivision(prev: FormState, formData: FormData) {
  return withValues(await saveDivisionForm(prev, formData), formData);
}

export async function upsertUnit(prev: FormState, formData: FormData) {
  return withValues(await saveUnitForm(prev, formData), formData);
}

export async function upsertDocType(prev: FormState, formData: FormData) {
  return withValues(await saveDocTypeForm(prev, formData), formData);
}

// ---------- divisions ----------

async function saveDivisionForm(_: FormState, formData: FormData): Promise<FormState> {
  try {
    await requireSession();
    const parsed = parse(divisionSchema, formData);
    if ("error" in parsed) return { error: parsed.error };
    const { id, code, name, head } = parsed.data;

    const all = await listDivisions();
    if (all.some((d) => d.code === code && d.id !== id)) {
      return { error: `Division code ${code} is already used.` };
    }

    const existing = id ? await getDivision(id) : null;
    if (id && !existing) return { error: "Division not found." };

    await saveDivision({
      id: existing?.id ?? newId(),
      code,
      name,
      head: head || undefined,
      active: existing?.active ?? true,
      used: existing?.used,
      createdAt: existing?.createdAt ?? Date.now(),
    });
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setDivisionActive(id: string, active: boolean): Promise<FormState> {
  try {
    await requireSession();
    const d = await getDivision(id);
    if (!d) return { error: "Division not found." };
    await saveDivision({ ...d, active });
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function removeDivision(id: string): Promise<FormState> {
  try {
    await requireSession();
    const d = await getDivision(id);
    if (!d) return { error: "Division not found." };
    if (d.used) return { error: "This division has document history. Deactivate it instead." };
    const units = (await listUnits()).filter((u) => u.divisionId === id);
    if (units.length) return { error: "Move or delete this division's units first." };
    await deleteDivision(id);
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------- units ----------

async function saveUnitForm(_: FormState, formData: FormData): Promise<FormState> {
  try {
    await requireSession();
    const parsed = parse(unitSchema, formData);
    if ("error" in parsed) return { error: parsed.error };
    const { id, code, name, head, divisionId } = parsed.data;

    if (!(await getDivision(divisionId))) return { error: "Division not found." };

    const all = await listUnits();
    if (all.some((u) => u.code === code && u.id !== id)) {
      return { error: `Unit code ${code} is already used.` };
    }

    const existing = id ? await getUnit(id) : null;
    if (id && !existing) return { error: "Unit not found." };

    await saveUnit(
      {
        id: existing?.id ?? newId(),
        divisionId,
        code,
        name,
        head: head || undefined,
        active: existing?.active ?? true,
        used: existing?.used,
        createdAt: existing?.createdAt ?? Date.now(),
      },
      existing?.divisionId,
    );
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setUnitActive(id: string, active: boolean): Promise<FormState> {
  try {
    await requireSession();
    const u = await getUnit(id);
    if (!u) return { error: "Unit not found." };
    await saveUnit({ ...u, active });
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function removeUnit(id: string): Promise<FormState> {
  try {
    await requireSession();
    const u = await getUnit(id);
    if (!u) return { error: "Unit not found." };
    if (u.used) return { error: "This unit has document history. Deactivate it instead." };
    await deleteUnit(u);
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------- document types ----------

async function saveDocTypeForm(_: FormState, formData: FormData): Promise<FormState> {
  try {
    await requireSession();
    const parsed = parse(docTypeSchema, formData);
    if ("error" in parsed) return { error: parsed.error };
    const { id, name, defaultDays } = parsed.data;

    const all = await listDocTypes();
    if (all.some((t) => t.name.toLowerCase() === name.toLowerCase() && t.id !== id)) {
      return { error: `"${name}" already exists.` };
    }

    const existing = id ? await getDocType(id) : null;
    if (id && !existing) return { error: "Document type not found." };

    await saveDocType({
      id: existing?.id ?? newId(),
      name,
      defaultDays,
      active: existing?.active ?? true,
      used: existing?.used,
    });
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setDocTypeActive(id: string, active: boolean): Promise<FormState> {
  try {
    await requireSession();
    const t = await getDocType(id);
    if (!t) return { error: "Document type not found." };
    await saveDocType({ ...t, active });
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function removeDocType(id: string): Promise<FormState> {
  try {
    await requireSession();
    const t = await getDocType(id);
    if (!t) return { error: "Document type not found." };
    if (t.used) return { error: "Documents use this type. Deactivate it instead." };
    await deleteDocType(id);
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
