import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";
import { SectionNav } from "@/components/section-nav";
import { PageHelp } from "@/components/page-help";
import { staffCan } from "@/lib/school/permissions";
import { useLocale, tr } from "@/lib/school/i18n";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/counseling")({ component: CounselingLayout });

const COUNSELING_NAV = [
  { to: "/counseling", label: tr("الإحصاء"), hint: "عدد الغياب والتأخر والمخالفات. اضغط العداد لفتح الكشف." },
  { to: "/counseling/health", label: tr("الملاحظات الصحية"), hint: "شارة بجانب اسم الطالب في الفصل. المتابعة والتسجيل من هنا." },
  { to: "/counseling/improve", label: tr("خطط التحسين"), hint: "الخطط المفتوحة المرسلة من المعلمين" },
  { to: "/counseling/messages", label: tr("مراسلات المعلمين"), hint: "حالة صحية أو نفسية أو صعوبات تعلم يرسلها المعلم من سجل الطالب" },
  { to: "/counseling/referrals", label: tr("الإحالات"), hint: "يحيلها وكيل شؤون الطلاب من لوحة المخالفات" },
];

function currentSection(pathname: string) {
  if (pathname.startsWith("/counseling/health")) return COUNSELING_NAV[1]!;
  if (pathname.startsWith("/counseling/improve")) return COUNSELING_NAV[2]!;
  if (pathname.startsWith("/counseling/messages")) return COUNSELING_NAV[3]!;
  if (pathname.startsWith("/counseling/referrals")) return COUNSELING_NAV[4]!;
  if (pathname.startsWith("/counseling/mail")) {
    return { to: "/counseling/mail", label: tr("المراسلات"), hint: "مراسلات المعلمين حول الطلاب. الرد والتحويل من هنا دون مغادرة الصفحة." };
  }
  return COUNSELING_NAV[0]!;
}

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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!staffCan(staff, "counseling")) {
    return <p className="text-fg-muted">{t("صفحة الإرشاد الطلابي لمن مُنح صلاحية الإرشاد.")}</p>;
  }
  const section = currentSection(pathname);
  return (
    <div className="space-y-5">
      <header className="no-print space-y-1">
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          {t("الإرشاد")}
          <PageHelp text={t("صفحة واحدة. الأزرار تبدّل القسم فقط. طلبات النقل تبقى في مكتبي.")} />
        </h1>
        <p className="text-sm text-fg-muted">{t("الأزرار لا تنقلك إلى صفحة أخرى. تبدّل القسم داخل هذه الصفحة.")}</p>
      </header>
      <SectionNav items={COUNSELING_NAV.map((item) => ({ to: item.to, label: item.label }))} />
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
