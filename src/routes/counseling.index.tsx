import { createFileRoute } from '@tanstack/react-router'
import { tr } from "@/lib/school/i18n";
import { FollowupStatsPanel } from "@/components/followup-stats-panel";
import { PageHelp } from "@/components/page-help";

export const Route = createFileRoute("/counseling/")({ component: CounselingStats });

function CounselingStats() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          {tr("إحصاءات الإرشاد")}
          <PageHelp text={tr("عدد الغياب والتأخر والمخالفات يومياً وأسبوعياً وشهرياً — اضغط العداد للانتقال للكشف")} />
        </h1>
      </header>
      <FollowupStatsPanel allowAdd />
    </div>
  );
}
