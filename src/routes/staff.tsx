import { createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";
import { StaffManager } from "@/components/staff-manager";
import { staffCan } from "@/lib/school/permissions";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/staff")({ component: StaffPage });

function StaffPage() {
  return (
    <AppGate>
      <StaffBody />
    </AppGate>
  );
}

function StaffBody() {
  const { staff } = useWorkspace();
  if (!staffCan(staff, "editStaff")) {
    return <p className="text-fg-muted">إدارة الموظفين متاحة لمن مُنح صلاحية تعديل الموظفين.</p>;
  }
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-fg-muted">
          أمام كل موظف الاختيارات المسموح له بها، ومنها الغياب اليومي والإرشاد الطلابي.
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">الموظفون</h1>
      </header>
      <StaffManager />
    </div>
  );
}
