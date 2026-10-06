import { createFileRoute } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CaseRecordTools } from "@/components/record-actions";
import { StudentSheet } from "@/components/student-sheet";
import { Badge } from "@/components/ui/badge";
import { getCounselingDesk } from "@/lib/school/api";
import { CASE_KINDS, formatStamp } from "@/lib/school/constants";
import type { CounselingCase } from "@/lib/school/types";

export const Route = createFileRoute("/counseling/messages")({ component: MessagesPage });

function caseKindLabel(kind: CounselingCase["kind"]) {
  return CASE_KINDS.find((item) => item.key === kind)?.label ?? kind;
}

function MessagesPage() {
  const [activeStudent, setActiveStudent] = useState<number | null>(null);
  const desk = useQuery({
    queryKey: ["counseling-desk"],
    queryFn: () => getCounselingDesk(),
  });
  const cases: CounselingCase[] = desk.data?.cases ?? [];

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-fg-muted">{tr("حالة صحية أو نفسية أو صعوبات تعلم يرسلها المعلم من سجل الطالب")}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{tr("مراسلات المعلمين")}</h1>
      </header>
      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
        {cases.map((item) => (
          <li key={item.id} className="space-y-1.5 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="text-right text-base font-semibold"
                onClick={() => setActiveStudent(item.studentId)}
              >
                {item.studentName}
              </button>
              <span className="text-xs text-fg-muted">{item.classLabel}</span>
              <Badge tone={item.kind === "health" ? "warn" : item.kind === "psych" ? "danger" : "primary"}>
                {caseKindLabel(item.kind)}
              </Badge>
              <span className="ms-auto">
                <CaseRecordTools id={item.id} body={item.body} />
              </span>
            </div>
            <p className="text-sm">{item.body}</p>
            <p className="text-xs text-fg-subtle">
              {item.authorName} · {formatStamp(item.createdAt)}
            </p>
          </li>
        ))}
        {cases.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-fg-muted">
            لا توجد مراسلات بعد. يرسلها المعلم من سجل الطالب: حالة صحية أو نفسية أو صعوبات تعلم.
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
