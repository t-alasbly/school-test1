import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppGate } from "@/components/app-gate";
import { ClassSwitcher } from "@/components/class-switcher";
import { GroupViolationBar, PickMark } from "@/components/group-violation-bar";
import { NoteComposer } from "@/components/note-actions";
import { StageClassBar, type ClassSort } from "@/components/stage-class-bar";
import { AddStudentButton } from "@/components/student-editor";
import { StudentQuickActions } from "@/components/student-quick-actions";
import { StudentSheet } from "@/components/student-sheet";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getClassPage } from "@/lib/school/api";
import {
  addGroupStudents,
  clearGroupStudents,
  elsewhereLabel,
  finishGroupPick,
  setGroupPicking,
  toggleGroupStudent,
  useGroupPick,
} from "@/lib/school/group-pick";
import { NOTE_META, formatTime, noteTone } from "@/lib/school/constants";
import type { DailyKind, StudentRow } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";
import { NoteSession } from "@/components/note-session";

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
  const { school, staff, stages, classes } = useWorkspace();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [activeStudent, setActiveStudent] = useState<number | null>(studentParam ?? null);
  const [sort, setSort] = useState<ClassSort>("order");
  const [groupOpen, setGroupOpen] = useState(false);
  const { picking, targets } = useGroupPick();
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
    if (sort === "alpha") {
      return [...filtered].sort((a: StudentRow, b: StudentRow) => a.name.localeCompare(b.name, "ar"));
    }
    return [...filtered].sort((a: StudentRow, b: StudentRow) => {
      const r = dailyRank(a.dailyKind) - dailyRank(b.dailyKind);
      if (r !== 0) return r;
      return a.name.localeCompare(b.name, "ar");
    });
  }, [query.data, q, sort]);

  const pickedIds = useMemo(() => new Set(targets.map((item) => item.studentId)), [targets]);
  const visibleIds = useMemo(() => new Set(students.map((student: StudentRow) => student.id)), [students]);
  const kept = elsewhereLabel(targets, visibleIds);

  if (query.isPending) {
    const current = classes.find((c) => c.id === id);
    return (
      <div className="space-y-3">
        {current ? (
          <StageClassBar
            stages={stages}
            classes={classes}
            selectedStageId={current.stageId}
            selectedClassId={id}
            sort={sort}
            onSort={setSort}
            onChange={(nextStage, nextClass) => {
              if (nextClass) {
                void navigate({ to: "/class/$classId", params: { classId: String(nextClass) } });
                return;
              }
              void navigate({ to: "/classes", search: { stage: nextStage, sort: sort === "alpha" ? "alpha" : undefined } });
            }}
          />
        ) : null}
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
      <StageClassBar
        stages={stages}
        classes={classes}
        selectedStageId={classInfo.stageId}
        selectedClassId={id}
        sort={sort}
        onSort={setSort}
        onChange={(nextStage, nextClass) => {
          if (nextClass) {
            void navigate({ to: "/class/$classId", params: { classId: String(nextClass) } });
            return;
          }
          void navigate({ to: "/classes", search: { stage: nextStage, sort: sort === "alpha" ? "alpha" : undefined } });
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <ClassSwitcher
            classId={id}
            stageId={classInfo.stageId}
            stageName={classInfo.stageName}
            shortName={classInfo.shortName}
            label={classInfo.label}
          />
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
      <div className={cn(picking && "sticky top-14 z-20 -mx-4 border-y border-border bg-bg/95 px-4 py-2 backdrop-blur-sm")}>
        <GroupViolationBar
          picking={picking}
          selected={targets.length}
          shownCount={students.length}
          elsewhere={kept}
          onTogglePicking={() => {
            setGroupPicking(!picking);
            setGroupOpen(false);
          }}
          onSelectShown={() => {
            addGroupStudents(
              students.map((student: StudentRow) => ({
                studentId: student.id,
                studentName: student.name,
                classId: id,
              })),
            );
          }}
          onClear={clearGroupStudents}
          onApply={() => setGroupOpen(true)}
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
                picking && pickedIds.has(student.id) && "bg-primary/5",
              )}
            >
              <div className="flex items-start gap-1.5">
                {picking ? (
                  <PickMark
                    checked={pickedIds.has(student.id)}
                    label={student.name}
                    onToggle={() =>
                      toggleGroupStudent({
                        studentId: student.id,
                        studentName: student.name,
                        classId: id,
                      })
                    }
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    if (picking) {
                      toggleGroupStudent({
                        studentId: student.id,
                        studentName: student.name,
                        classId: id,
                      });
                    } else setActiveStudent(student.id);
                  }}
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
                <StudentQuickActions
                  studentId={student.id}
                  studentName={student.name}
                  classId={id}
                  parentPhone={student.parentPhone}
                  className={classInfo.name}
                  shortName={classInfo.shortName}
                />
              </div>
            </li>
          );
        })}
        {students.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-fg-muted">لا يوجد طلاب مطابقون</li>
        ) : null}
      </ul>
      <NoteComposer
        targets={targets}
        open={groupOpen}
        onOpenChange={setGroupOpen}
        onSubmitted={(result) => finishGroupPick(result.failedIds)}
      />
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
