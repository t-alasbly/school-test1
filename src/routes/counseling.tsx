import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";
import { SectionNav } from "@/components/section-nav";
import { staffCan } from "@/lib/school/permissions";
import { useLocale, tr } from "@/lib/school/i18n";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/counseling")({ component: CounselingLayout });

const COUNSELING_NAV = [
  { to: "/counseling", label: tr("الإحصاء") },
  { to: "/counseling/health", label: tr("الملاحظات الصحية") },
  { to: "/counseling/improve", label: tr("خطط التحسين") },
  { to: "/counseling/messages", label: tr("مراسلات المعلمين") },
  { to: "/counseling/mail", label: tr("المراسلات") },
  { to: "/counseling/referrals", label: tr("الإحالات") },
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
  const { t } = useLocale();
  if (!staffCan(staff, "counseling")) {
    return <p className="text-fg-muted">{t("صفحة الإرشاد الطلابي لمن مُنح صلاحية الإرشاد.")}</p>;
  }
  return (
    <div className="space-y-5">
      <SectionNav items={COUNSELING_NAV} />
      <Outlet />
    </div>
  );
}
