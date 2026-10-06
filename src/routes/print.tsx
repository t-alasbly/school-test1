import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";
import { SectionNav } from "@/components/section-nav";
import { staffCan } from "@/lib/school/permissions";
import { useLocale, tr } from "@/lib/school/i18n";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/print")({ component: PrintLayout });

const PRINT_NAV = [
  { to: "/print", label: tr("التقارير") },
  { to: "/print/forms", label: tr("النماذج") },
];

function PrintLayout() {
  return (
    <AppGate>
      <PrintFrame />
    </AppGate>
  );
}

function PrintFrame() {
  const { staff } = useWorkspace();
  const { t } = useLocale();
  if (!staffCan(staff, "viewPrint")) {
    return <p className="text-fg-muted">{t("صفحة الطباعة متاحة لمن مُنح إظهار التقارير والنماذج.")}</p>;
  }
  return (
    <div className="space-y-5">
      <header className="no-print">
        <p className="text-sm text-fg-muted">{t("كشوف وإحصاءات رسمية، ونماذج الوزارة")}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{t("الطباعة")}</h1>
      </header>
      <SectionNav items={PRINT_NAV} />
      <Outlet />
    </div>
  );
}
