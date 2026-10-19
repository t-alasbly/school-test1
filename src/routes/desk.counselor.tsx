import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/desk/counselor")({ component: DeskCounselor });

function DeskCounselor() {
  return null;
}
