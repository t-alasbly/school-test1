import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/desk/waiting")({ component: DeskWaiting });

function DeskWaiting() {
  return null;
}
