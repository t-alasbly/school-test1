import { createFileRoute } from "@tanstack/react-router";
import { TeacherCases } from "@/components/teacher-cases";

export const Route = createFileRoute("/desk/counselor")({ component: DeskCounselor });

function DeskCounselor() {
  return <TeacherCases />;
}
