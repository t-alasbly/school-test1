import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/desk/ledger")({ component: DeskLedger });

function DeskLedger() {
  return null;
}
