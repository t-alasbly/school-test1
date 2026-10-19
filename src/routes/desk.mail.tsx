import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/desk/mail")({ component: DeskMail });

function DeskMail() {
  return null;
}
