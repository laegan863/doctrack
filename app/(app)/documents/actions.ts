"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import {
  ACTIONS_REQUESTED,
  PRIORITIES,
  RECEIVED_VIA,
  SERVICE_MODES,
  dueDays,
  type Priority,
} from "@/lib/documents";
import { createDocument } from "@/lib/repos/documents";
import { getDocType, resolveLocation } from "@/lib/repos/locations";
import { addDays, endOfDayZoned, parseZoned, toDateInput } from "@/lib/time";
import type { FormState } from "@/lib/types";

const req = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} is too long.`);
const opt = (max = 500) => z.string().trim().max(max).optional().transform((v) => v || undefined);
const optDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || undefined)
  .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Invalid date.");
const optEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.enum(values), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined));
const pages = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? Number(v) : undefined))
  .refine((v) => v === undefined || (Number.isInteger(v) && v >= 0 && v <= 100000), "Pages must be a whole number.");

const incomingSchema = z.object({
  receivedAt: req("Date & time received"),
  receivedVia: z.enum(RECEIVED_VIA, { error: "Choose how it was received." }),
  senderName: req("Sender name", 120),
  senderOffice: req("Office / agency", 160),
  senderContact: opt(120),
  senderRef: opt(80),
  documentDate: optDate,
  docTypeId: req("Document type"),
  subject: req("Subject", 300),
  description: opt(2000),
  pages,
  attachments: opt(500),
  priority: z.enum(PRIORITIES),
  dueDate: optDate,
  actionRequested: optEnum(ACTIONS_REQUESTED),
  routeTo: opt(80),
  remarks: opt(1000),
});

const outgoingSchema = z.object({
  preparedAt: req("Date prepared").refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), "Invalid date."),
  forwardTo: req("Forward to"),
  receivedByName: req("Received by", 120),
  receivedByOffice: req("Office / agency", 160),
  receivedByAddress: opt(300),
  docTypeId: req("Document type"),
  subject: req("Subject", 300),
  description: opt(2000),
  pages,
  attachments: opt(500),
  serviceMode: optEnum(SERVICE_MODES),
  courierName: opt(120),
  waybillNo: opt(80),
  replyNeeded: z.literal("on").optional().transform(Boolean),
  replyDueDate: optDate,
  remarks: opt(1000),
});

function values(formData: FormData) {
  const v: Record<string, string> = {};
  for (const [k, val] of formData) if (typeof val === "string" && !k.startsWith("$")) v[k] = val;
  return v;
}

function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check the form.";
}

function computeDue(startEpoch: number, typeDays: number, priority: Priority, override?: string) {
  if (override) return endOfDayZoned(override);
  return endOfDayZoned(addDays(toDateInput(startEpoch), dueDays(typeDays, priority)));
}

export async function createIncoming(_: FormState, formData: FormData): Promise<FormState> {
  let trackingNo: string;
  try {
    await requireSession();
    const parsed = incomingSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: firstIssue(parsed.error), values: values(formData) };
    const f = parsed.data;

    const receivedAt = parseZoned(f.receivedAt);
    if (Number.isNaN(receivedAt)) return { error: "Invalid date & time received.", values: values(formData) };

    const type = await getDocType(f.docTypeId);
    if (!type?.active) return { error: "Choose an active document type.", values: values(formData) };

    const location = f.routeTo ? await resolveLocation(f.routeTo) : null;
    if (f.routeTo && !location) {
      return { error: "That division or unit is no longer active.", values: values(formData) };
    }

    const doc = await createDocument(
      {
        direction: "IN",
        status: location ? "FORWARDED" : "RECEIVED",
        docTypeId: type.id,
        docTypeName: type.name,
        subject: f.subject,
        description: f.description,
        pages: f.pages,
        attachments: f.attachments,
        priority: f.priority,
        dueAt: computeDue(receivedAt, type.defaultDays, f.priority, f.dueDate),
        remarks: f.remarks,
        location: location ?? undefined,
        receivedAt,
        receivedVia: f.receivedVia,
        senderName: f.senderName,
        senderOffice: f.senderOffice,
        senderContact: f.senderContact,
        senderRef: f.senderRef,
        documentDate: f.documentDate,
        actionRequested: f.actionRequested,
      },
      [
        { type: "RECEIVED", remarks: f.remarks },
        ...(location
          ? [{ type: "FORWARDED" as const, location, remarks: f.actionRequested }]
          : []),
      ],
      { sender: [f.senderName], office: [f.senderOffice] },
    );
    trackingNo = doc.trackingNo;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not save the document.",
      values: values(formData),
    };
  }
  redirect(`/documents/${trackingNo}/slip`);
}

export async function createOutgoing(_: FormState, formData: FormData): Promise<FormState> {
  let trackingNo: string;
  try {
    await requireSession();
    const parsed = outgoingSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: firstIssue(parsed.error), values: values(formData) };
    const f = parsed.data;

    // Use the current time of day when the date prepared is today, otherwise start of that day.
    const today = toDateInput(Date.now());
    const preparedAt = f.preparedAt === today ? Date.now() : parseZoned(f.preparedAt);

    const type = await getDocType(f.docTypeId);
    if (!type?.active) return { error: "Choose an active document type.", values: values(formData) };

    const location = await resolveLocation(f.forwardTo);
    if (!location) return { error: "That division or unit is no longer active.", values: values(formData) };

    const doc = await createDocument(
      {
        direction: "OUT",
        status: "FORWARDED",
        docTypeId: type.id,
        docTypeName: type.name,
        subject: f.subject,
        description: f.description,
        pages: f.pages,
        attachments: f.attachments,
        priority: "NORMAL",
        dueAt: computeDue(preparedAt, type.defaultDays, "NORMAL"),
        remarks: f.remarks,
        location,
        preparedAt,
        receivedByName: f.receivedByName,
        receivedByOffice: f.receivedByOffice,
        receivedByAddress: f.receivedByAddress,
        serviceMode: f.serviceMode,
        courierName: f.courierName,
        waybillNo: f.waybillNo,
        replyNeeded: f.replyNeeded || undefined,
        replyDueAt: f.replyDueDate ? endOfDayZoned(f.replyDueDate) : undefined,
      },
      [
        { type: "PREPARED", remarks: f.remarks },
        { type: "FORWARDED", location },
      ],
      { recipient: [f.receivedByName], office: [f.receivedByOffice] },
    );
    trackingNo = doc.trackingNo;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not save the document.",
      values: values(formData),
    };
  }
  redirect(`/documents/${trackingNo}/slip`);
}
