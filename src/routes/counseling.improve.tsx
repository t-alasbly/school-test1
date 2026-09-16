import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ImprovementRecordTools } from "@/components/record-actions";
import { StudentSheet } from "@/components/student-sheet";
import { Badge } from "@/components/ui/badge";
import { listImprovements } from "@/lib/school/api";
import { IMPROVEMENT_STATUS, formatStamp } from "@/lib/school/constants";

export const Route = createFileRoute("/counseling/improve")({ component: ImprovePage });

function ImprovePage() {
  const [activeStudent, setActiveStudent] = useState<number | null>(null);
  const improvements = useQuery({
    queryKey: ["improvements", "counseling"],
    queryFn: () => listImprovements({ data: { openOnly: true } }),
  });

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-fg-muted">الخطط المفتوحة المرسلة من المعلمين</p>
        <h1 className="text-3xl font-semibold tracking-tight">خطط تحسين السلوك</h1>
      </header>
      <ul className="space-y-2">
        {(improvements.data ?? []).map((item: any) => (
          <li key={item.id} className="rounded-[var(--radius-md)] border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="font-semibold" onClick={() => setActiveStudent(item.studentId)}>
                {item.studentName}
              </button>
              <span className="text-xs text-fg-muted">{item.classLabel}</span>
              <Badge tone={item.status === "closed" ? "ok" : "warn"}>
                {IMPROVEMENT_STATUS[item.status as keyof typeof IMPROVEMENT_STATUS]}
              </Badge>
              <span className="ms-auto">
                <ImprovementRecordTools id={item.id} plan={item.plan} />
              </span>
            </div>
            <p className="mt-1 text-sm">{item.plan}</p>
            <p className="mt-1 text-xs text-fg-subtle">
              {item.teacherName}
              {item.teacherSubject ? ` · ${item.teacherSubject}` : ""} · {formatStamp(item.createdAt)}
            </p>
          </li>
        ))}
        {(improvements.data ?? []).length === 0 ? (
          <li className="rounded-[var(--radius-md)] border border-border px-4 py-8 text-center text-sm text-fg-muted">
            لا توجد خطط تحسين مفتوحة.
          </li>
        ) : null}
      </ul>
      <StudentSheet
        studentId={activeStudent}
        open={activeStudent != null}
        onOpenChange={(open) => {
          if (!open) setActiveStudent(null);
        }}
      />
    </div>
  );
}
