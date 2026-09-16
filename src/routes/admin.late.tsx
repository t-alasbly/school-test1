import { createFileRoute } from "@tanstack/react-router";
import { AttendanceRoster } from "@/components/attendance-roster";

export const Route = createFileRoute("/admin/late")({
  validateSearch: (search: Record<string, unknown>): { range?: string } => ({
    range: typeof search.range === "string" ? search.range : undefined,
  }),
  component: LatePage,
});

function LatePage() {
  const { range } = Route.useSearch();
  return <AttendanceRoster kind="late" initialRange={range} />;
}
