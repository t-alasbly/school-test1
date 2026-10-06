import { createFileRoute } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { DeskNotesList } from "@/components/desk-notes";

export const Route = createFileRoute("/desk/closed")({ component: DeskClosed });

function DeskClosed() {
  return (
    <DeskNotesList
      status="closed"
      empty={tr("لا توجد ملاحظات أُغلق فيها الإجراء بعد. عند رد الإدارة تظهر هنا منفصلة عن بقية ملاحظاتك.")}
    />
  );
}
