import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";
import { SectionNav } from "@/components/section-nav";
import { PageHelp } from "@/components/page-help";
import { useLocale, tr } from "@/lib/school/i18n";

export const Route = createFileRoute("/desk")({ component: DeskLayout });

const DESK_NAV = [
  { to: "/desk", label: tr("ملاحظاتي") },
  { to: "/desk/closed", label: tr("رُد عليها") },
  { to: "/desk/waiting", label: tr("تنتظر الرد") },
  { to: "/desk/counselor", label: tr("حالاتي") },
  { to: "/desk/mail", label: tr("مراسلاتي") },
];

function DeskLayout() {
  const { t } = useLocale();
  return (
    <AppGate>
      <div className="space-y-5">
        <header className="no-print">
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
            {t("مكتبي")}
            <PageHelp text={t("صفحة خاصة بك وبطلابك: ما حرّرته وما أُحيل للإرشاد أو لوكيل شؤون الطلاب وما جرى عليه")} />
          </h1>
        </header>
        <SectionNav items={DESK_NAV} />
        <Outlet />
      </div>
    </AppGate>
  );
}
