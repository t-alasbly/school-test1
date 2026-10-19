import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AttendanceRoster } from "@/components/attendance-roster";
import { tr } from "@/lib/school/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/late")({
  validateSearch: (search: Record<string, unknown>): { range?: string } => ({
    range: typeof search.range === "string" ? search.range : undefined,
  }),
  component: LatePage,
});

function LatePage() {
  const { range } = Route.useSearch();
  const [mode, setMode] = useState<"late" | "leave">("late");
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {(
          [
            ["late", "التأخر الصباحي"],
            ["leave", "الانصراف المتأخر"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={cn(
              "h-9 rounded-full border px-3 text-sm font-semibold",
              mode === id ? "border-primary bg-primary text-primary-fg" : "border-border bg-bg text-fg-muted",
            )}
          >
            {tr(label)}
          </button>
        ))}
      </div>
      <AttendanceRoster kind={mode} initialRange={range} />
    </div>
  );
}
