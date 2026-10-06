import { createFileRoute } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { DeskNotesList } from "@/components/desk-notes";

export const Route = createFileRoute("/desk/waiting")({ component: DeskWaiting });

function DeskWaiting() {
  return <DeskNotesList status="open" empty={tr("لا توجد ملاحظات بانتظار الرد.")} />;
}
