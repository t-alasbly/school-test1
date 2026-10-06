import { createFileRoute } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { StaffMailInbox } from "@/components/staff-mail-inbox";

export const Route = createFileRoute("/counseling/mail")({ component: CounselingMail });

function CounselingMail() {
  return (
    <StaffMailInbox
      title={tr("المراسلات")}
      hint={tr("مراسلات المعلمين حول الطلاب — ردّ أو حوّلها لوكيل شؤون الطلاب أو المرشد الصحي أو معلم آخر")}
    />
  );
}
