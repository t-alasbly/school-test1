import { createFileRoute } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { NoteThread } from "@/components/note-thread";
import { NoteRecordTools } from "@/components/record-actions";
import { ReferralCompensation } from "@/components/referral-compensation";
import { StudentSheet } from "@/components/student-sheet";
import { Badge } from "@/components/ui/badge";
import { getCounselingDesk } from "@/lib/school/api";
import { COMPENSATION_OPTIONS, NOTE_META, degreeLabel, formatStamp, noteTone } from "@/lib/school/constants";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/counseling/referrals")({ component: ReferralsPage });

function ReferralsPage() {
  const { compensations = [] } = useWorkspace();
  const [activeStudent, setActiveStudent] = useState<number | null>(null);
  const desk = useQuery({
    queryKey: ["counseling-desk"],
    queryFn: () => getCounselingDesk(),
  });
  const options = compensations.length > 0 ? compensations.map((c) => c.name) : COMPENSATION_OPTIONS;

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-fg-muted">{tr("يحيلها وكيل شؤون الطلاب من لوحة المخالفات")}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{tr("المخالفات المحالة للإرشاد")}</h1>
      </header>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
          {(desk.data?.referrals ?? []).map((item: any) => (
            <li key={item.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="text-right text-base font-semibold"
                  onClick={() => setActiveStudent(item.studentId)}
                >
                  {item.studentName}
                </button>
                <span className="text-xs text-fg-muted">{item.classLabel}</span>
                <Badge tone={noteTone(item.type, item.status)}>
                  {NOTE_META[item.type as keyof typeof NOTE_META]?.short ?? item.type}
                </Badge>
                {item.behaviorTypeName ? (
                  <span className="text-xs text-fg-muted">
                    {tr(item.behaviorTypeName)}
                    {item.behaviorDegree ? ` · ${degreeLabel(item.behaviorDegree)}` : ""}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-fg-subtle">
                {item.teacherName}
                {item.teacherSubject ? ` · ${item.teacherSubject}` : ""} · {formatStamp(item.occurredAt)}
              </p>
              {item.suggestedAction ? (
                <p className="text-sm text-fg">إجراء مقترح: {item.suggestedAction}</p>
              ) : null}
              {item.details ? <p className="text-sm text-fg-muted">{item.details}</p> : null}
              <NoteThread noteId={item.id} dest="counselor" compact />
              <ReferralCompensation noteId={item.id} current={item.compensation ?? ""} />
              <div className="flex flex-wrap gap-2">
                <NoteRecordTools note={item} />
                <PrintFormsButton
                  student={{
                    name: item.studentName,
                    classLabel: item.classLabel,
                  }}
                  notes={[
                    {
                      type: item.type as "behavior",
                      details: item.details,
                      behaviorTypeName: item.behaviorTypeName,
                      behaviorDegree: item.behaviorDegree,
                      periodKey: item.periodKey,
                      actionTaken: item.actionTaken,
                      createdAt: item.createdAt,
                      occurredAt: item.occurredAt,
                      teacherName: item.teacherName,
                      teacherSubject: item.teacherSubject,
                      suggestedAction: item.suggestedAction,
                      compensation: item.compensation,
                    },
                  ]}
                  studentId={item.studentId}
                  defaultKind="referral"
                  label={tr("نموذج الإحالة")}
                />
                <PrintFormsButton
                  student={{
                    name: item.studentName,
                    classLabel: item.classLabel,
                  }}
                  notes={[
                    {
                      type: item.type as "behavior",
                      details: item.details,
                      behaviorTypeName: item.behaviorTypeName,
                      behaviorDegree: item.behaviorDegree,
                      periodKey: item.periodKey,
                      actionTaken: item.actionTaken,
                      createdAt: item.createdAt,
                      occurredAt: item.occurredAt,
                      teacherName: item.teacherName,
                      teacherSubject: item.teacherSubject,
                      suggestedAction: item.suggestedAction,
                      compensation: item.compensation,
                    },
                  ]}
                  studentId={item.studentId}
                  defaultKind="compensation"
                  label={tr("نموذج التعويض")}
                />
              </div>
            </li>
          ))}
          {(desk.data?.referrals ?? []).length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-fg-muted">
              لا توجد إحالات بعد. يحوّل وكيل شؤون الطلاب المخالفات السلوكية إلى هنا من شؤون الطلاب.
            </li>
          ) : null}
        </ul>
        <aside className="h-fit space-y-3 rounded-[var(--radius-lg)] border border-border bg-card p-4 lg:sticky lg:top-24">
          <h2 className="text-base font-semibold">{tr("فرص تعويض الدرجات")}</h2>
          <p className="text-xs leading-5 text-fg-muted">
            خاصية جانبية. اختر منها للطالب المحال في بطاقته، أو أضف فرصة غير موجودة في القائمة.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {options.map((name) => (
              <span
                key={name}
                className="inline-flex min-h-9 items-center rounded-full border border-border bg-bg-elevated px-3 text-xs font-medium"
              >
                {name}
              </span>
            ))}
          </div>
        </aside>
      </div>
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
