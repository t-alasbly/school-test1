import { createFileRoute } from "@tanstack/react-router";
import { FollowupStatsPanel } from "@/components/followup-stats-panel";

export const Route = createFileRoute("/counseling/")({ component: CounselingStats });

function CounselingStats() {
  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-fg-muted">
          عدد الغياب والتأخر والمخالفات يومياً وأسبوعياً وشهرياً — اضغط العداد للانتقال للكشف
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">إحصاءات الإرشاد</h1>
      </header>
      <FollowupStatsPanel allowAdd />
    </div>
  );
}
