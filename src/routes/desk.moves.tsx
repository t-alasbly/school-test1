import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/desk/moves")({ component: DeskMoves });

function DeskMoves() {
  return null;
}
