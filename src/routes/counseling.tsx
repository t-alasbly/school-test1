import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";
import { SectionNav } from "@/components/section-nav";
import { staffCan } from "@/lib/school/permissions";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/counseling")({ component: CounselingLayout });

const COUNSELING_NAV = [
  { to: "/counseling", label: "الإحصاء" },
  { to: "/counseling/health", label: "الملاحظات الصحية" },
  { to: "/counseling/improve", label: "خطط التحسين" },
  { to: "/counseling/messages", label: "مراسلات المعلمين" },
  { to: "/counseling/mail", label: "المراسلات" },
  { to: "/counseling/referrals", label: "الإحالات" },
];

function CounselingLayout() {
  return (
    <AppGate>
      <CounselingFrame />
    </AppGate>
  );
}

function CounselingFrame() {
  const { staff } = useWorkspace();
  if (!staffCan(staff, "counseling")) {
    return <p className="text-fg-muted">صفحة الإرشاد الطلابي لمن مُنح صلاحية الإرشاد.</p>;
  }
  return (
    <div className="space-y-5">
      <SectionNav items={COUNSELING_NAV} />
      <Outlet />
    </div>
  );
}
