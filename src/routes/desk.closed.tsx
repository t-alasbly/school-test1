import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/desk/closed")({ component: DeskClosed });

function DeskClosed() {
  return null;
}
