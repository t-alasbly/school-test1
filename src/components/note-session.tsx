import { BookOpen, Clock } from "lucide-react";
import { periodShort } from "@/lib/school/constants";
import type { Season } from "@/lib/school/types";

export function NoteSession({
  periodKey,
  subject,
  season,
}: {
  periodKey?: string | null;
  subject?: string | null;
  season: Season;
}) {
  const period = periodKey ? periodShort(periodKey, season) : "";
  const sub = subject?.trim() ?? "";
  if (!period && !sub) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-[11px] text-fg-muted">
      {period ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-elevated px-2 py-0.5">
          <Clock className="size-3" />
          {period}
        </span>
      ) : null}
      {sub ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-primary">
          <BookOpen className="size-3" />
          {sub}
        </span>
      ) : null}
    </span>
  );
}

export function sessionLine(periodKey: string | undefined, subject: string | undefined, season: Season) {
  const period = periodKey ? periodShort(periodKey, season) : "";
  const sub = subject?.trim() ?? "";
  if (period && sub) return ` في ${period} مادة ${sub}`;
  if (period) return ` في ${period}`;
  if (sub) return ` في مادة ${sub}`;
  return "";
}
