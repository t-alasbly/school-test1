import { createFileRoute, Link } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Users } from "lucide-react";
import { AppGate } from "@/components/app-gate";
import { Skeleton } from "@/components/ui/skeleton";
import { getStagePage } from "@/lib/school/api";
import { classLabel } from "@/lib/school/constants";

export const Route = createFileRoute("/stage/$stageId")({ component: StagePage });

function StagePage() {
  return (
    <AppGate>
      <StageBody />
    </AppGate>
  );
}

function StageBody() {
  const { stageId } = Route.useParams();
  const id = Number(stageId);
  const query = useQuery({
    queryKey: ["stage", id],
    queryFn: () => getStagePage({ data: { stageId: id } }),
    enabled: Number.isFinite(id),
  });

  if (query.isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-[var(--radius-lg)]" />
        ))}
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <p className="text-danger">{tr("تعذر تحميل المرحلة.")}</p>;
  }

  const { stage, classes } = query.data;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/classes"
          className="grid size-11 place-items-center rounded-[var(--radius-sm)] hover:bg-muted"
          aria-label={tr("رجوع")}
        >
          <ArrowRight className="size-5" />
        </Link>
        <div>
          <p className="text-sm text-fg-muted">{tr("المرحلة")}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{stage.name}</h1>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {classes.map((cls) => (
          <Link
            key={cls.id}
            to="/class/$classId"
            params={{ classId: String(cls.id) }}
            className="flex min-h-36 flex-col justify-between rounded-[var(--radius-lg)] border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary"
          >
            <span className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-muted text-primary">
              <Users className="size-5" />
            </span>
            <span>
              <span className="block text-xl font-semibold">
                {classLabel(stage.shortName, cls.name)}
              </span>
              <span className="mt-1 block text-xs text-fg-muted">
                {cls.studentCount} طالب
                {cls.openNotes ? ` · ${cls.openNotes} مفتوحة` : ""}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
