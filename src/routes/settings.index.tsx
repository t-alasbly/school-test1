import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Award,
  Gavel,
  HeartPulse,
  KeyRound,
  MessageCircle,
  Palette,
  Printer,
  School,
  ShieldAlert,
  Smartphone,
  Sprout,
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
      body: "المنطقة وإدارة التعليم واسم المدرسة وأسماء القيادة كما تظهر في الخطابات.",
      icon: School,
      show: admin,
    },
    {
      to: "/settings/app" as const,
      title: "أيقونة التطبيق",
      body: "شعار المدرسة وعبارة التطبيق على الشاشة الرئيسية وشاشة الدخول.",
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
      title: "المعلمون والمستخدمون",
      body: "إضافة المعلمين وتعديل بياناتهم وتفعيل الصلاحيات أمام كل موظف.",
      icon: Users,
      show: staffCan(staff, "editStaff"),
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
      to: "/settings/permissions" as const,
      title: "صلاحيات المعلمين",
      body: "الافتراضي للمعلمين الجدد: مراسلة ولي الأمر، ومشاهدة مخالفات الزملاء.",
      icon: KeyRound,
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
      to: "/settings/messages" as const,
      title: "الرسائل",
      body: "قوالب واتساب للغياب والتأخر والواجب والسلوك، مع رسائل عامة مخصصة تُضاف للقائمة.",
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
