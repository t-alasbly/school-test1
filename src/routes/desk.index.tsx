import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/desk/")({ component: DeskAll });

function DeskAll() {
  return null;
}
