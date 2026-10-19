import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/desk/notes")({ component: DeskNotes });

function DeskNotes() {
  return null;
}
