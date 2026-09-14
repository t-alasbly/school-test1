import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { AppGate } from "@/components/app-gate";
import { useWorkspace } from "@/lib/school/workspace";
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
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm text-fg-muted">
          {staff.role === "admin"
            ? "مرحباً بك في لوحة الإدارة"
            : staff.role === "counselor"
              ? "مرحباً بك وكيل شؤون الطلاب"
              : "لوحة تحكم المعلم"}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">اختر المرحلة</h1>
      </header>
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
        <p className={cn("rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center text-fg-muted")}>
          لم تُضف مراحل بعد.
        </p>
      ) : null}
    </div>
  );
}
