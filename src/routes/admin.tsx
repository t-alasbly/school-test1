import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";
import { SectionNav } from "@/components/section-nav";
import { PageHelp } from "@/components/page-help";
import { canFollowup } from "@/lib/school/permissions";
import { useLocale, tr } from "@/lib/school/i18n";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

const ADMIN_NAV = [
  { to: "/admin", label: tr("الإحصاء"), hint: "أعداد فقط. اضغط العداد لفتح الكشف." },
  { to: "/admin/behavior", label: tr("المخالفات"), hint: "تنفيذ الإجراء وإغلاقه والتعهد ورسالة ولي الأمر." },
  { to: "/admin/absence", label: tr("الغائبون"), hint: "متابعة الغياب. التسجيل يتم من الغياب اليومي." },
  { to: "/admin/late", label: tr("المتأخرون"), hint: "التأخر الصباحي والانصراف المتأخر. التسجيل من الغياب اليومي." },
];

function currentSection(pathname: string) {
  if (pathname.startsWith("/admin/behavior")) return ADMIN_NAV[1]!;
  if (pathname.startsWith("/admin/absence")) return ADMIN_NAV[2]!;
  if (pathname.startsWith("/admin/late")) return ADMIN_NAV[3]!;
  return ADMIN_NAV[0]!;
}

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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!canFollowup(staff)) {
    return <p className="text-fg-muted">{t("هذه الصفحة مخصصة لمتابعة الغياب والإجراءات وتحسين السلوك.")}</p>;
  }
  const isCounselor = staff.role === "counselor";
  const section = currentSection(pathname);
  return (
    <div className="space-y-5">
      <header className="no-print space-y-1">
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          {isCounselor ? t("شؤون الطلاب") : t("لوحة الإدارة")}
          <PageHelp
            text={t("صفحة واحدة. الأزرار تبدّل القسم فقط، ولا تفتح مكتباً آخر. طلبات النقل تبقى في مكتبي.")}
          />
        </h1>
        <p className="text-sm text-fg-muted">{t("الأزرار لا تنقلك إلى صفحة أخرى. تبدّل القسم داخل هذه الصفحة.")}</p>
      </header>
      <SectionNav items={ADMIN_NAV.map((item) => ({ to: item.to, label: item.label }))} />
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{t(section.label)}</h2>
          <p className="text-sm text-fg-muted">{t(section.hint)}</p>
        </div>
        <Outlet />
      </section>
    </div>
  );
}
