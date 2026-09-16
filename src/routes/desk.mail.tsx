import { createFileRoute } from "@tanstack/react-router";
import { StaffMailInbox } from "@/components/staff-mail-inbox";

export const Route = createFileRoute("/desk/mail")({ component: DeskMail });

function DeskMail() {
  return (
    <StaffMailInbox
      title="مراسلاتي"
      hint="الملاحظات التي أرسلتها أو وصلت إليك عن الطلاب — ردّ أو حوّلها لصاحب الاختصاص"
    />
  );
}
