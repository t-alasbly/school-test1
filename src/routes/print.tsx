import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";
import { SectionNav } from "@/components/section-nav";
import { PageHelp } from "@/components/page-help";
import { DailyRegisterPrint } from "@/components/daily-register-print";
import { VpReports } from "@/components/vp-reports";
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
  const official = staffCan(staff, "viewOfficialPrint");
  if (!staffCan(staff, "viewPrint")) {
    return <p className="text-fg-muted">{t("صفحة الطباعة متاحة لمن مُنح إظهار التقارير والنماذج.")}</p>;
  }
  const nav = official ? PRINT_NAV : PRINT_NAV.filter((item) => item.to === "/print");
  return (
    <div className="space-y-5">
      <header className="no-print">
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          {t("الطباعة")}
          <PageHelp text={official
            ? t("كشوف الغياب والتأخر والانصراف، وتقارير الرسائل والطالب والعمل، ثم النماذج الفارغة. طباعة تعهد مخالفة مفتوحة تبقى من سجل المخالفة.")
            : t("كشف الأسماء، ومخالفاتك وغياب حصصك فقط. التعهد ومراسلة ولي الأمر لمن مُنحت له الصلاحية.")} />
        </h1>
        {official || staffCan(staff, "dailyAttendance") ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {staffCan(staff, "dailyAttendance") || official ? <DailyRegisterPrint /> : null}
          {official ? <VpReports /> : null}
        </div>
        ) : null}
      </header>
      <SectionNav items={nav} />
      <Outlet />
    </div>
  );
}
