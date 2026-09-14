import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppGate } from "@/components/app-gate";
import { ImproveDialog } from "@/components/improve-dialog";
import { NoteActions } from "@/components/note-actions";
import { NoteSession } from "@/components/note-session";
import { AddStudentButton } from "@/components/student-editor";
import { StudentSheet } from "@/components/student-sheet";
import { WhatsAppDialog } from "@/components/whatsapp-dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getClassPage } from "@/lib/school/api";
import { NOTE_META, formatTime, noteTone } from "@/lib/school/constants";
import { staffCan } from "@/lib/school/permissions";
import type { DailyKind, StudentRow } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/class/$classId")({
  validateSearch: (search: Record<string, unknown>): { student?: number } => ({
    student: Number(search.student) > 0 ? Number(search.student) : undefined,
  }),
  component: ClassPage,
});

function ClassPage() {
  return (
    <AppGate>
      <ClassBody />
    </AppGate>
  );
}

function dailyRank(kind: DailyKind | null) {
  if (kind === "absence") return 0;
  if (kind === "late") return 1;
  return 2;
}

function ClassBody() {
  const { classId } = Route.useParams();
  const { student: studentParam } = Route.useSearch();
  const id = Number(classId);
  const { school, staff } = useWorkspace();
  const [q, setQ] = useState("");
  const [activeStudent, setActiveStudent] = useState<number | null>(studentParam ?? null);
  const canMessage = staffCan(staff, "sendMessages");
  const query = useQuery({
    queryKey: ["class", id],
    queryFn: () => getClassPage({ data: { classId: id } }),
    enabled: Number.isFinite(id),
  });

  useEffect(() => {
    if (studentParam) setActiveStudent(studentParam);
  }, [studentParam]);

  const students = useMemo(() => {
    const list = query.data?.students ?? [];
    const term = q.trim();
    const filtered = term ? list.filter((s: StudentRow) => s.name.includes(term)) : list;
    return [...filtered].sort((a: StudentRow, b: StudentRow) => {
      const r = dailyRank(a.dailyKind) - dailyRank(b.dailyKind);
      if (r !== 0) return r;
      return a.name.localeCompare(b.name, "ar");
    });
  }, [query.data, q]);

  if (query.isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-[var(--radius-md)]" />
        ))}
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <p className="text-danger">تعذر تحميل الفصل.</p>;
  }

  const { classInfo } = query.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/stage/$stageId"
          params={{ stageId: String(classInfo.stageId) }}
          className="grid size-11 place-items-center rounded-[var(--radius-sm)] hover:bg-muted"
          aria-label="رجوع للمرحلة"
        >
          <ArrowRight className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-fg-muted">{classInfo.stageName}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{classInfo.label}</h1>
        </div>
        <AddStudentButton classId={id} />
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-subtle" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث عن طالب…"
          className="pr-10"
        />
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
        {students.map((student: StudentRow) => {
          const latest = student.todayNotes[0];
          const extra = student.todayNotes.length - 1;
          const absent = student.dailyKind === "absence";
          const late = student.dailyKind === "late";
          return (
            <li
              key={student.id}
              className={cn(
                "px-3 py-3 sm:px-4",
                absent && "bg-danger-soft/40",
                late && "bg-warn-soft/40",
              )}
            >
              <div className="flex items-start gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveStudent(student.id)}
                  className="min-w-0 flex-1 text-right"
                >
                  <span className="flex items-start gap-2">
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-lg font-semibold leading-7 break-words",
                        absent && "text-danger",
                        late && "text-warn",
                      )}
                    >
                      {student.name}
                    </span>
                    {student.todayNotes.length > 0 ? (
                      <span
                        className="mt-2 inline-block size-2 shrink-0 rounded-full bg-danger"
                        title={staff.role === "teacher" ? "لديك ملاحظات اليوم" : "ملاحظات اليوم"}
                      />
                    ) : null}
                  </span>
                  {absent ? (
                    <span className="mt-1 inline-flex items-center">
                      <Badge tone="danger">غائب اليوم — مسجّل في الكشف اليومي</Badge>
                    </span>
                  ) : late ? (
                    <span className="mt-1 inline-flex flex-wrap items-center gap-1.5">
                      <Badge tone="warn">
                        متأخر
                        {student.arrivedAt ? ` · حضر الساعة ${formatTime(student.arrivedAt)}` : ""}
                      </Badge>
                    </span>
                  ) : null}
                  {student.healthNote ? (
                    <span className="mt-1 block text-xs font-medium leading-5 text-warn">
                      ملاحظة صحية: {student.healthNote}
                    </span>
                  ) : null}
                  <span className="mt-1 block">
                    {student.todayNotes.length === 0 ? (
                      <span className="text-xs text-fg-subtle">
                        اضغط الاسم للرسائل والطباعة والتعديل
                      </span>
                    ) : (
                      <span className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-full border border-border bg-bg-elevated px-2 py-0.5">
                        <Badge tone={noteTone(latest.type, latest.status)}>
                          {latest.behaviorTypeName
                            ? `${NOTE_META[latest.type as keyof typeof NOTE_META].short} · ${latest.behaviorTypeName}`
                            : NOTE_META[latest.type as keyof typeof NOTE_META].short}
                        </Badge>
                        <NoteSession
                          periodKey={latest.periodKey}
                          subject={latest.teacherSubject}
                          season={school.season}
                        />
                        {extra > 0 ? (
                          <span className="text-[11px] text-fg-muted">و{extra} أخرى — اضغط الاسم</span>
                        ) : null}
                      </span>
                    )}
                  </span>
                </button>
                <div className="flex shrink-0 items-center">
                  {canMessage ? (
                    <WhatsAppDialog
                      studentId={student.id}
                      studentName={student.name}
                      parentPhone={student.parentPhone}
                      className={classInfo.name}
                      shortName={classInfo.shortName}
                      defaultType={latest?.type ?? "general"}
                      details={latest?.behaviorTypeName ?? latest?.details ?? ""}
                      subject={latest?.teacherSubject}
                      createdAt={latest?.createdAt}
                      periodKey={latest?.periodKey}
                    />
                  ) : null}
                  <ImproveDialog
                    studentId={student.id}
                    studentName={student.name}
                    classId={id}
                  />
                  <NoteActions
                    studentId={student.id}
                    studentName={student.name}
                    classId={id}
                  />
                </div>
              </div>
            </li>
          );
        })}
        {students.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-fg-muted">لا يوجد طلاب مطابقون</li>
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
