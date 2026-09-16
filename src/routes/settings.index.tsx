import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Archive,
  Award,
  Gavel,
  HeartPulse,
  Layers,
  MessageCircle,
  Palette,
  Printer,
  School,
  ShieldAlert,
  Smartphone,
  Sprout,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import { staffCan } from "@/lib/school/permissions";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/settings/")({ component: SettingsHub });

function SettingsHub() {
  const { staff } = useWorkspace();
  const admin = staff.role === "admin";
  const cards = [
    {
      to: "/settings/profile" as const,
      title: "حسابك",
      body: "اسمك الظاهر، رقم الجوال، كلمة المرور، والمادة الدراسية.",
      icon: UserRound,
      show: true,
    },
    {
      to: "/settings/school" as const,
      title: "بيانات المدرسة",
      body: "ثلاثة أسطر تُكتب يدوياً لترويسة الخطاب، ثم اسم المدرسة في السطر الأسفل، وأسماء القيادة.",
      icon: School,
      show: admin,
    },
    {
      to: "/settings/classes" as const,
      title: "تنسيق الصفوف والفصول",
      body: "صفوف المدرسة وأقسامها كما في ملف الطلاب. احذف الأقسام الفارغة القديمة من هنا.",
      icon: Layers,
      show: staffCan(staff, "editClasses"),
    },
    {
      to: "/settings/app" as const,
      title: "أيقونة التطبيق",
      body: "شعار البرنامج للأيقونة، وشعار المدرسة عند التشغيل وفي رأس الصفحة، وشعار الرؤية بجانب الوزارة.",
      icon: Smartphone,
      show: admin,
    },
    {
      to: "/settings/print" as const,
      title: "هوامش الطباعة",
      body: "ضبط هوامش الورقة بالمليمتر لتوافق الطابعة المستخدمة.",
      icon: Printer,
      show: admin,
    },
    {
      to: "/staff" as const,
      title: "شؤون الموظفين",
      body: "المسميات والصلاحيات لكل موظف، وافتراضي المعلمين الجدد: الرسائل ومشاهدة المخالفات، وإظهار صفحات الفصول والطباعة والغياب.",
      icon: Users,
      show: staffCan(staff, "editStaff"),
    },
    {
      to: "/import" as const,
      title: "الاستيراد والبيانات",
      body: "رفع ملف الطلاب والمعلمين من إكسل، واستعراض الأسماء مع التعديل والحذف.",
      icon: Upload,
      show: admin,
    },
    {
      to: "/archive" as const,
      title: "الأرشيف",
      body: "كل الملاحظات والرسائل وخطط التحسين والحالات — تصحيح أو حذف ما سُجّل بالخطأ لمن مُنح الصلاحية.",
      icon: Archive,
      show: staffCan(staff, "editRecords"),
    },
    {
      to: "/settings/appearance" as const,
      title: "المظهر",
      body: "قوالب ألوان جاهزة، خطوط عربية، وتكبير أو تصغير حجم الخط.",
      icon: Palette,
      show: true,
    },
    {
      to: "/settings/health" as const,
      title: "الأمراض والحالات الصحية",
      body: "قائمة الأمراض المتكررة التي يختار منها المرشد، ويُضاف إليها تلقائياً ما ليس موجوداً.",
      icon: HeartPulse,
      show: admin,
    },
    {
      to: "/settings/violations" as const,
      title: "المخالفات",
      body: "أنواع المخالفات السلوكية وإجراءات كل مخالفة: الإجراء الأول ثم الثاني حتى الأخير.",
      icon: ShieldAlert,
      show: admin,
    },
    {
      to: "/settings/actions" as const,
      title: "الإجراءات",
      body: "خيارات اتخاذ الإجراء الإضافية التي تظهر لوكيل شؤون الطلاب.",
      icon: Gavel,
      show: admin,
    },
    {
      to: "/settings/compensation" as const,
      title: "فرص تعويض السلوك",
      body: "فرص تعويض درجات السلوك التي يختار منها الوكيل والمرشد عند اتخاذ الإجراء.",
      icon: Award,
      show: admin,
    },
    {
      to: "/settings/improve" as const,
      title: "خيارات تحسين السلوك",
      body: "السلوكيات التي يختار منها المعلم عند تحسين سلوك الطالب — يضيفها المدير أو المرشد.",
      icon: Sprout,
      show: admin || staffCan(staff, "counseling") || staffCan(staff, "acceptImprovements"),
    },
    {
      to: "/messages" as const,
      title: "رسائل جماعية",
      body: "إرسال واتساب لفصل أو صف كامل أو غائبي اليوم ومتأخريه، بالقالب الذي تختاره.",
      icon: MessageCircle,
      show: staffCan(staff, "sendMessages"),
    },
    {
      to: "/settings/messages" as const,
      title: "قوالب واتساب",
      body: "نصوص الغياب والتأخر والواجب والسلوك، مع رسائل عامة مخصصة تُضاف للقائمة.",
      icon: MessageCircle,
      show: admin,
    },
  ].filter((c) => c.show);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-fg-muted">كل بطاقة تفتح صفحتها فقط</p>
        <h1 className="text-3xl font-semibold tracking-tight">الإعدادات</h1>
      </header>
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
