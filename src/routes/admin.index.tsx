import { createFileRoute } from "@tanstack/react-router";
import { FollowupStatsPanel } from "@/components/followup-stats-panel";

export const Route = createFileRoute("/admin/")({ component: AdminStats });

function AdminStats() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        اضغط العداد لفتح الكشف. من «تنسيق» تُظهر أو تُخفي العدادات أو تضيف عدّاداً جديداً.
      </p>
      <FollowupStatsPanel allowAdd />
    </div>
  );
}
