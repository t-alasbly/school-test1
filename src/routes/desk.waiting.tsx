import { createFileRoute } from "@tanstack/react-router";
import { DeskNotesList } from "@/components/desk-notes";

export const Route = createFileRoute("/desk/waiting")({ component: DeskWaiting });

function DeskWaiting() {
  return <DeskNotesList status="open" empty="لا توجد ملاحظات بانتظار الرد." />;
}
