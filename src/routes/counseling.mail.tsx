import { createFileRoute } from "@tanstack/react-router";
import { StaffMailInbox } from "@/components/staff-mail-inbox";

export const Route = createFileRoute("/counseling/mail")({ component: CounselingMail });

function CounselingMail() {
  return (
    <StaffMailInbox
      title="المراسلات"
      hint="مراسلات المعلمين حول الطلاب — ردّ أو حوّلها لوكيل شؤون الطلاب أو المرشد الصحي أو معلم آخر"
    />
  );
}
