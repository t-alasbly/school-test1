import { createFileRoute } from "@tanstack/react-router";
import { FollowupStatsPanel } from "@/components/followup-stats-panel";

export const Route = createFileRoute("/counseling/")({ component: CounselingStats });

function CounselingStats() {
  return <FollowupStatsPanel allowAdd />;
}
