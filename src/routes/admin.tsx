import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";
import { SectionNav } from "@/components/section-nav";
import { canFollowup } from "@/lib/school/permissions";
import { useLocale, tr } from "@/lib/school/i18n";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

const ADMIN_NAV = [
  { to: "/admin", label: tr("الإحصاء") },
  { to: "/admin/behavior", label: tr("المخالفات") },
  { to: "/admin/absence", label: tr("الغائبون") },
  { to: "/admin/late", label: tr("المتأخرون") },
];

function AdminLayout() {
  return (
    <AppGate>
      <AdminFrame />
    </AppGate>
  );
}

function AdminFrame() {
  const { staff } = useWorkspace();
  const { t } = useLocale();
  if (!canFollowup(staff)) {
    return <p className="text-fg-muted">{t("هذه الصفحة مخصصة لمتابعة الغياب والإجراءات وتحسين السلوك.")}</p>;
  }
  const isCounselor = staff.role === "counselor";
  return (
    <div className="space-y-5">
      <header className="no-print">
        <p className="text-sm text-fg-muted">
          {isCounselor
            ? t("متابعة الغياب والتأخر والمخالفات الواردة من المعلمين")
            : t("رقابة لحظية على الملاحظات والغياب")}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {isCounselor ? t("شؤون الطلاب") : t("لوحة الإدارة")}
        </h1>
      </header>
      <SectionNav items={ADMIN_NAV} />
      <Outlet />
    </div>
  );
}
