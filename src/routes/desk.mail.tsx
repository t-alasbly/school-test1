import { createFileRoute } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { StaffMailInbox } from "@/components/staff-mail-inbox";

export const Route = createFileRoute("/desk/mail")({ component: DeskMail });

function DeskMail() {
  return (
    <StaffMailInbox
      title={tr("مراسلاتي")}
      hint={tr("الملاحظات التي أرسلتها أو وصلت إليك عن الطلاب — ردّ أو حوّلها لصاحب الاختصاص")}
    />
  );
}
