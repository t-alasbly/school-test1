import { Link, createFileRoute } from "@tanstack/react-router";
import { Award, Gavel, HeartPulse, KeyRound, MessageCircle, Palette, School, ShieldAlert } from "lucide-react";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/settings/")({ component: SettingsHub });

function SettingsHub() {
  const { staff } = useWorkspace();
  const admin = staff.role === "admin";
  const cards = [
    {
      to: "/settings/school" as const,
      title: "البيانات",
      body: admin
        ? "بيانات المدرسة والشعار، وحسابك (الاسم واسم المستخدم وكلمة المرور والمادة)، وإضافة المعلمين."
        : "اسمك الظاهر، اسم المستخدم، كلمة المرور، والمادة الدراسية.",
      icon: School,
      show: true,
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
      body: "إظهار أو إخفاء مراسلة ولي الأمر، والسماح للمعلم بمشاهدة مخالفات زملائه أو حصرها عليه.",
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
      to: "/settings/messages" as const,
      title: "الرسائل",
      body: "قوالب رسائل ولي الأمر عبر واتساب: الغياب والتأخر والواجب والسلوك.",
      icon: MessageCircle,
      show: admin,
    },
  ].filter((c) => c.show);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-fg-muted">ضبط الهوية والمظهر والمخالفات والصلاحيات</p>
        <h1 className="text-3xl font-semibold tracking-tight">الإعدادات</h1>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.to}
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
