import { createFileRoute } from "@tanstack/react-router";
import { AttendanceRoster } from "@/components/attendance-roster";

export const Route = createFileRoute("/admin/absence")({
  validateSearch: (search: Record<string, unknown>): { range?: string } => ({
    range: typeof search.range === "string" ? search.range : undefined,
  }),
  component: AbsencePage,
});

function AbsencePage() {
  const { range } = Route.useSearch();
  return <AttendanceRoster kind="absence" initialRange={range} />;
}
