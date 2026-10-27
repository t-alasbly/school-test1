import { Link, createFileRoute } from "@tanstack/react-router";
import { tr, useLocale, type Locale } from "@/lib/school/i18n";
import {
  Archive,
  Award,
  Gavel,
  Database,
  HeartPulse,
  NotebookPen,
  Languages,
  Layers,
  MessageCircle,
  Palette,
  Printer,
  School,
  ShieldAlert,
  Smartphone,
  Sprout,
  CalendarDays,
  SlidersHorizontal,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import { staffCan } from "@/lib/school/permissions";
import { PageHelp } from "@/components/page-help";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/settings/")({ component: SettingsHub });

function SettingsHub() {
  const { staff } = useWorkspace();
  const { locale, setLocale } = useLocale();
  const admin = staff.role === "admin";
  const cards = [
    {
      to: "/settings/subject" as const,
      title: tr("إعدادات المادة"),
      body: tr("فترات أعمال السنة ودرجة كل فترة واختبارها الشهري، من فترة واحدة حتى ثلاث."),
      icon: SlidersHorizontal,
      show: true,
    },
    {
      to: "/settings/profile" as const,
      title: tr("حسابك"),
      body: tr("اسمك الظاهر، رقم الجوال، كلمة المرور، والمادة الدراسية."),
      icon: UserRound,
      show: true,
    },
    {
      to: "/settings/school" as const,
      title: tr("بيانات المدرسة"),
      body: tr("ثلاثة أسطر تُكتب يدوياً لترويسة الخطاب، ثم اسم المدرسة في السطر الأسفل، وأسماء القيادة."),
      icon: School,
      show: admin,
    },
    {
      to: "/settings/classes" as const,
      title: tr("تنسيق الصفوف والفصول"),
      body: tr("صفوف المدرسة وأقسامها كما في ملف الطلاب. احذف الأقسام الفارغة القديمة من هنا."),
      icon: Layers,
      show: staffCan(staff, "editClasses"),
    },
    {
      to: "/settings/timetable" as const,
      title: tr("جدول المدرسة"),
      body: tr("توزيع حصص كل فصل ومعلم ومادة، فتظهر في جدول المعلم."),
      icon: CalendarDays,
      show: admin,
    },
    {
      to: "/settings/app" as const,
      title: tr("أيقونة التطبيق"),
      body: tr("شعار البرنامج للأيقونة، وشعار المدرسة عند التشغيل وفي رأس الصفحة، وشعار الرؤية بجانب الوزارة."),
      icon: Smartphone,
      show: admin,
    },
    {
      to: "/settings/print" as const,
      title: tr("هوامش الطباعة"),
      body: tr("ضبط هوامش الورقة بالمليمتر لتوافق الطابعة المستخدمة."),
      icon: Printer,
      show: admin,
    },
    {
      to: "/staff" as const,
      title: tr("شؤون الموظفين"),
      body: tr("المسميات والصلاحيات لكل موظف، وافتراضي المعلمين الجدد: الرسائل ومشاهدة المخالفات، وإظهار صفحات الفصول والطباعة والغياب."),
      icon: Users,
      show: staffCan(staff, "editStaff"),
    },
    {
      to: "/import" as const,
      title: tr("الاستيراد والبيانات"),
      body: tr("رفع ملف الطلاب والمعلمين من إكسل، واستعراض الأسماء مع التعديل والحذف."),
      icon: Upload,
      show: admin,
    },
    {
      to: "/archive" as const,
      title: tr("الأرشيف"),
      body: tr("كل الملاحظات والرسائل وخطط التحسين والحالات — تصحيح أو حذف ما سُجّل بالخطأ لمن مُنح الصلاحية."),
      icon: Archive,
      show: staffCan(staff, "editRecords"),
    },
    {
      to: "/settings/appearance" as const,
      title: tr("المظهر"),
      body: tr("قوالب ألوان جاهزة، خطوط عربية، وتكبير أو تصغير حجم الخط."),
      icon: Palette,
      show: true,
    },
    {
      to: "/settings/backup" as const,
      title: tr("النسخة الاحتياطية"),
      body: tr("تنزيل نسخة كاملة من البيانات، أو استعادتها، أو تصفية المخالفات والفصول والمعلمين في نهاية العام."),
      icon: Database,
      show: admin,
    },
    {
      to: "/settings/health" as const,
      title: tr("الأمراض والحالات الصحية"),
      body: tr("قائمة الأمراض المتكررة التي يختار منها المرشد، ويُضاف إليها تلقائياً ما ليس موجوداً."),
      icon: HeartPulse,
      show: admin,
    },
    {
      to: "/settings/violations" as const,
      title: tr("المخالفات"),
      body: tr("أنواع المخالفات السلوكية وإجراءات كل مخالفة: الإجراء الأول ثم الثاني حتى الأخير."),
      icon: ShieldAlert,
      show: admin,
    },
    {
      to: "/settings/actions" as const,
      title: tr("الإجراءات"),
      body: tr("خيارات اتخاذ الإجراء الإضافية التي تظهر لوكيل شؤون الطلاب."),
      icon: Gavel,
      show: admin,
    },
    {
      to: "/settings/compensation" as const,
      title: tr("فرص تعويض السلوك"),
      body: tr("فرص تعويض درجات السلوك التي يختار منها الوكيل والمرشد عند اتخاذ الإجراء."),
      icon: Award,
      show: admin,
    },
    {
      to: "/settings/improve" as const,
      title: tr("خيارات تحسين السلوك"),
      body: tr("السلوكيات التي يختار منها المعلم عند تحسين سلوك الطالب — يضيفها المدير أو المرشد."),
      icon: Sprout,
      show: admin || staffCan(staff, "counseling") || staffCan(staff, "acceptImprovements"),
    },
    {
      to: "/settings/study" as const,
      title: tr("الملاحظات الدراسية"),
      body: tr("قائمة الملاحظات الدراسية السبع، وإجراءاتها المتدرجة من التنبيه حتى إحالة الموجه الطلابي."),
      icon: NotebookPen,
      show: admin,
    },
    {
      to: "/settings/messages" as const,
      title: tr("قوالب واتساب"),
      body: tr("نصوص الغياب والتأخر والواجب والسلوك، مع رسائل عامة مخصصة تُضاف للقائمة."),
      icon: MessageCircle,
      show: admin,
    },
  ].filter((c) => c.show);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          {tr("الإعدادات")}
          <PageHelp text={tr("كل بطاقة تفتح صفحتها فقط")} />
        </h1>
      </header>
      <section className="rounded-[var(--radius-xl)] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-[var(--radius-md)] bg-primary/10 text-primary">
              <Languages className="size-6" />
            </span>
            <div>
              <h2 className="text-xl font-semibold">{tr("اللغة المفضلة")}</h2>
              <p className="mt-1 text-sm text-fg-muted">{tr("تُفتح لك الصفحة بهذه اللغة عند الدخول، ويتغير العرض فوراً بعد التحديث.")}</p>
            </div>
          </div>
          <div className="grid h-11 w-full grid-cols-2 overflow-hidden rounded-[var(--radius-sm)] border border-border sm:w-64">
            {(
              [
                ["ar", "العربية"],
                ["en", "English"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setLocale(key as Locale)}
                className={
                  locale === key
                    ? "bg-primary text-sm font-semibold text-primary-fg"
                    : "bg-bg text-sm font-medium text-fg-muted hover:text-fg"
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.title}
              to={card.to}
              className="group flex min-h-40 flex-col justify-between rounded-[var(--radius-xl)] border border-border bg-card p-6 shadow-[var(--shadow-card)] transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary"
            >
              <span className="grid size-12 place-items-center rounded-[var(--radius-md)] bg-primary/10 text-primary">
                <Icon className="size-6" />
              </span>
              <span>
                <span className="block text-xl font-semibold">{card.title}</span>
                <span className="mt-1 block text-sm text-fg-muted">{card.body}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
