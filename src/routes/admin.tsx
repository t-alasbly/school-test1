import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";
import { SectionNav } from "@/components/section-nav";
import { canFollowup } from "@/lib/school/permissions";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

const ADMIN_NAV = [
  { to: "/admin", label: "الإحصاء" },
  { to: "/admin/behavior", label: "المخالفات" },
  { to: "/admin/absence", label: "الغائبون" },
  { to: "/admin/late", label: "المتأخرون" },
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
  if (!canFollowup(staff)) {
    return <p className="text-fg-muted">هذه الصفحة مخصصة لمتابعة الغياب والإجراءات وتحسين السلوك.</p>;
  }
  const isCounselor = staff.role === "counselor";
  return (
    <div className="space-y-5">
      <header className="no-print">
        <p className="text-sm text-fg-muted">
          {isCounselor
            ? "متابعة الغياب والتأخر والمخالفات الواردة من المعلمين"
            : "رقابة لحظية على الملاحظات والغياب"}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {isCounselor ? "شؤون الطلاب" : "لوحة الإدارة"}
        </h1>
      </header>
      <SectionNav items={ADMIN_NAV} />
      <Outlet />
    </div>
  );
}
