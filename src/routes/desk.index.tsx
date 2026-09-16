import { createFileRoute } from "@tanstack/react-router";
import { DeskNotesList } from "@/components/desk-notes";

export const Route = createFileRoute("/desk/")({ component: DeskAll });

function DeskAll() {
  return <DeskNotesList status="all" empty="لم تسجّل ملاحظات بعد. ستظهر هنا فور تسجيل ملاحظة من الفصل." />;
}
