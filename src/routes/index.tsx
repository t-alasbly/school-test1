import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap } from "lucide-react";
import { AppGate } from "@/components/app-gate";
import { ROLE_LABEL } from "@/lib/school/constants";
import { useWorkspace } from "@/lib/school/workspace";
import { getReport } from "@/lib/school/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <AppGate>
      <Dashboard />
    </AppGate>
  );
}

function Dashboard() {
  const { stages, staff } = useWorkspace();
  const report = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => getReport({ data: {} }),
  });
  const notes = report.data?.notes ?? [];
  const openNotes = notes.filter((note: any) => note.status === "open").length;
  const todayNotes = notes.filter(
    (note: any) => String(note.createdAt).slice(0, 10) === new Date().toISOString().slice(0, 10),
  ).length;
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm text-fg-muted">مرحباً بك — {ROLE_LABEL[staff.role]}</p>
        <h1 className="text-3xl font-semibold tracking-tight">اختر المرحلة</h1>
      </header>
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          [
            "إجمالي الطلاب",
            report.data?.students?.length ??
              stages.reduce((sum, stage) => sum + stage.studentCount, 0),
          ],
          ["حالات مفتوحة", openNotes],
          ["سجلات اليوم", todayNotes],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-[var(--radius-lg)] border border-border bg-card p-4 shadow-[var(--shadow-card)]"
          >
            <p className="text-sm text-fg-muted">{label}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>
      <div className="grid gap-4 sm:grid-cols-3">
        {stages.map((stage) => (
          <Link
            key={stage.id}
            to="/stage/$stageId"
            params={{ stageId: String(stage.id) }}
            className="group flex min-h-44 flex-col justify-between rounded-[var(--radius-xl)] border border-border bg-card p-6 shadow-[var(--shadow-card)] transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary"
          >
            <span className="flex items-start justify-between gap-3">
              <span className="grid size-12 place-items-center rounded-[var(--radius-md)] bg-primary/10 text-primary">
                <GraduationCap className="size-6" />
              </span>
              {stage.openNotes > 0 ? (
                <span className="rounded-full bg-danger-soft px-2.5 py-1 text-xs font-medium text-danger tabular-nums">
                  {stage.openNotes} مفتوحة
                </span>
              ) : (
                <span className="rounded-full bg-ok-soft px-2.5 py-1 text-xs font-medium text-ok">
                  منتظم
                </span>
              )}
            </span>
            <span>
              <span className="block text-2xl font-semibold">{stage.name}</span>
              <span className="mt-1 block text-sm text-fg-muted">
                {stage.classCount} فصول · {stage.studentCount} طالب
              </span>
            </span>
          </Link>
        ))}
      </div>
      {stages.length === 0 ? (
        <p
          className={cn(
            "rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center text-fg-muted",
          )}
        >
          لم تُضف مراحل بعد. ارفع ملف الطلاب من صفحة الاستيراد ليُنشأ الهيكل تلقائياً.
        </p>
      ) : null}
    </div>
  );
}
