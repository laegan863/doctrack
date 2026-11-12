import { PRIORITY_LABELS, STATUSES, type Direction, type Priority, type Status } from "@/lib/documents";
import { Badge } from "./ui";

const statusTone: Record<Status, "slate" | "green" | "amber" | "red" | "indigo"> = {
  RECEIVED: "indigo",
  PREPARED: "indigo",
  FORWARDED: "amber",
  RECEIVED_BY_UNIT: "indigo",
  ACTION_TAKEN: "indigo",
  RETURNED: "red",
  RELEASED: "amber",
  SERVED: "green",
  COMPLETED: "green",
  ARCHIVED: "slate",
};

export function StatusBadge({ status }: { status: Status }) {
  return <Badge tone={statusTone[status]}>{STATUSES[status]}</Badge>;
}

export function DirectionBadge({ direction }: { direction: Direction }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold tracking-wide ${
        direction === "IN" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"
      }`}
    >
      {direction}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "NORMAL") return <Badge>{PRIORITY_LABELS[priority]}</Badge>;
  return <Badge tone="red">{PRIORITY_LABELS[priority]}</Badge>;
}
