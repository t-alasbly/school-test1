import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock3,
  HeartHandshake,
} from "lucide-react";
import { AppGate } from "@/components/app-gate";
import { ROLE_LABEL, schoolLogoSrc } from "@/lib/school/constants";
import { formatToday } from "@/lib/school/calendar";
import { staffCan } from "@/lib/school/permissions";
import { getHomeDesk } from "@/lib/school/api";
import { useCalendar } from "@/lib/school/use-calendar";
import { useWorkspace } from "@/lib/school/workspace";
import { SchoolMark } from "@/components/school-mark";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <AppGate>
      <WelcomeDesk />
    </AppGate>
  );
}

function WelcomeDesk() {
  const { school, staff } = useWorkspace();
  const calendar = useCalendar();
  const desk = useQuery({
    queryKey: ["home-desk"],
    queryFn: () => getHomeDesk(),
  });
  const stats = (desk.data ?? {}) as {
    myNotes?: number;
    myClosed?: number;
    waiting?: number;
    referrals?: number;
  };
  const schoolLogo = schoolLogoSrc(school.logoUrl);
  const counsel = staffCan(staff, "counseling");
  const classes = staffCan(staff, "viewClasses");

  const cards = [
    {
      id: "notes",
      label: "ملاحظاتي",
      hint: "كل ما سجّلته على الطلاب",
      value: stats?.myNotes ?? 0,
      tone: "ok" as const,
      icon: ClipboardList,
      to: "/desk",
    },
    {
      id: "closed",
      label: "رُد عليها",
      hint: "مخالفات أُغلق فيها الإجراء",
      value: stats?.myClosed ?? 0,
      tone: "ok" as const,
      icon: CheckCircle2,
      to: "/desk/closed",
    },
    {
      id: "waiting",
      label: "تنتظر الرد",
      hint: "لا تزال مفتوحة بانتظار الإجراء",
      value: stats?.waiting ?? 0,
      tone: "warn" as const,
      icon: Clock3,
      to: "/desk/waiting",
    },
    {
      id: "referrals",
      label: "حالاتي",
      hint: counsel ? "محالة إلى الإرشاد الطلابي" : "ما حرّرته وأحلتَه للإرشاد أو لوكيل شؤون الطلاب",
      value: stats?.referrals ?? 0,
      tone: "danger" as const,
      icon: HeartHandshake,
      to: counsel ? "/counseling/referrals" : "/desk/counselor",
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <SchoolMark size="lg" src={schoolLogo || undefined} />
        <div className="min-w-0 space-y-1">
          <p className="text-xs text-fg-muted">{formatToday(calendar)}</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            مرحباً {staff.displayName}
          </h1>
          <p className="text-sm text-fg-muted">
            {ROLE_LABEL[staff.role]}
            {staff.subject ? ` · ${staff.subject}` : ""} — {school.name}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const inner = (
            <>
              <span className="flex items-start justify-between gap-2">
                <span className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </span>
                <span
                  className={cn(
                    "text-2xl font-semibold tabular-nums sm:text-3xl",
                    card.tone === "danger" && "text-danger",
                    card.tone === "warn" && "text-warn",
                    card.tone === "ok" && "text-ok",
                  )}
                >
                  {desk.isPending ? "…" : card.value}
                </span>
              </span>
              <span>
                <span className="block text-base font-semibold">{card.label}</span>
                <span className="mt-0.5 block text-xs text-fg-muted">{card.hint}</span>
              </span>
            </>
          );
          const cls =
            "flex min-h-36 flex-col justify-between rounded-[var(--radius-xl)] border border-border bg-card p-4 text-right shadow-[var(--shadow-card)] transition-[transform,border-color] duration-200";
          if (card.to) {
            return (
              <Link
                key={card.id}
                to={card.to}
                className={cn(cls, "hover:-translate-y-0.5 hover:border-primary")}
              >
                {inner}
              </Link>
            );
          }
          return (
            <div key={card.id} className={cls}>
              {inner}
            </div>
          );
        })}
      </div>

      {classes ? (
        <Link
          to="/classes"
          className="flex min-h-16 items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-card px-4 py-3 shadow-[var(--shadow-card)] hover:border-primary"
        >
          <span className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-[var(--radius-sm)] bg-primary/10 text-primary">
              <BookOpen className="size-5" />
            </span>
            <span>
              <span className="block font-semibold">الفصول</span>
              <span className="block text-xs text-fg-muted">افتح قائمة الصفوف لتسجيل ملاحظة أو غياب حصة</span>
            </span>
          </span>
          <span className="text-sm text-primary">فتح</span>
        </Link>
      ) : null}
    </div>
  );
}
