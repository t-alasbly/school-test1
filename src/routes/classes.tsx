import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { placeLabel, studentLabel, tr, useLocale } from "@/lib/school/i18n";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHelp } from "@/components/page-help";
import { AppGate } from "@/components/app-gate";
import { GroupViolationBar, PickMark } from "@/components/group-violation-bar";
import { NoteComposer } from "@/components/note-actions";
import { StageClassBar, sortedStudents, type ClassSort } from "@/components/stage-class-bar";
import { StudentQuickActions } from "@/components/student-quick-actions";
import { StudentSheet } from "@/components/student-sheet";
import { ExitPermitBadge } from "@/components/exit-permit";
import { DayName } from "@/components/day-name";
import { Badge } from "@/components/ui/badge";
import { ClassRecords } from "@/components/teacher-studio";
import { Input } from "@/components/ui/input";
import { listStudents } from "@/lib/school/api";
import {
  addGroupStudents,
  clearGroupStudents,
  elsewhereLabel,
  finishGroupPick,
  setGroupPicking,
  toggleGroupStudent,
  useGroupPick,
} from "@/lib/school/group-pick";
import { parseSubjects } from "@/lib/school/constants";
import { staffCan } from "@/lib/school/permissions";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

type Search = { stage?: number; sort?: ClassSort };

export const Route = createFileRoute("/classes")({
  validateSearch: (search: Record<string, unknown>): Search => {
    const next: Search = {};
    if (Number(search.stage) > 0) next.stage = Number(search.stage);
    if (search.sort === "alpha") next.sort = "alpha";
    return next;
  },
  component: ClassesPage,
});

function ClassesPage() {
  return (
    <AppGate>
      <ClassesBody />
    </AppGate>
  );
}

type RosterStudent = {
  id: number;
  name: string;
  classId: number;
  stageId: number;
  className: string;
  stageName: string;
  shortName: string;
  label: string;
  parentPhone?: string;
  healthNote?: string;
};

function ClassesBody() {
  const { locale } = useLocale();
  const { stages, classes, staff } = useWorkspace();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [stageId, setStageId] = useState<number | null>(search.stage ?? stages[0]?.id ?? null);
  const [classId, setClassId] = useState<number | null>(null);
  const [sort, setSort] = useState<ClassSort>(search.sort ?? "order");
  const [q, setQ] = useState("");
  const [activeStudent, setActiveStudent] = useState<number | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [pane, setPane] = useState<"year" | "behavior">("year");
  const [printTick, setPrintTick] = useState(0);
  const subjects = parseSubjects(staff.subject);
  const [sheetSubject, setSheetSubject] = useState(subjects[0] ?? "");
  const { picking, targets } = useGroupPick();

  useEffect(() => {
    if (search.stage && search.stage !== stageId) setStageId(search.stage);
    else if (stageId == null && stages[0]) setStageId(stages[0].id);
  }, [search.stage, stages, stageId]);

  const roster = useQuery({
    queryKey: ["stage-students", stageId, classId],
    queryFn: () =>
      listStudents({
        data: {
          stageId: stageId ?? undefined,
          classId: classId ?? undefined,
        },
      }),
    enabled: Boolean(stageId) && staffCan(staff, "viewClasses"),
  });
  const students = ((roster.data as { students?: RosterStudent[] } | undefined)?.students ?? []) as RosterStudent[];

  const shown = useMemo(() => {
    const term = q.trim();
    const filtered = term ? students.filter((s) => s.name.includes(term) || s.label.includes(term)) : students;
    return sortedStudents(
      filtered.map((s) => ({ ...s, studentName: s.name, classLabel: s.label })),
      sort,
    );
  }, [students, q, sort]);

  const pickedIds = useMemo(() => new Set(targets.map((item) => item.studentId)), [targets]);
  const kept = elsewhereLabel(targets, new Set(shown.map((student) => student.id)));

  const yearSheet = staffCan(staff, "viewYearSheet");
  const stageClasses = classes.filter((item) => item.stageId === stageId).map((item) => item.id);
  const showYear = yearSheet && classId == null && pane === "year";

  if (!staffCan(staff, "viewClasses")) {
    return (
      <p className="rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center text-sm text-fg-muted">
        {tr("صفحة الفصول غير ظاهرة لحسابك.")}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <StageClassBar
        stages={stages}
        classes={classes}
        selectedStageId={stageId}
        selectedClassId={classId}
        sort={sort}
        studentCount={shown.length}
        onSort={(next) => {
          setSort(next);
          void navigate({
            to: "/classes",
            search: { stage: stageId ?? undefined, sort: next === "alpha" ? "alpha" : undefined },
          });
        }}
        onChange={(nextStage, nextClass) => {
          setStageId(nextStage);
          setClassId(nextClass);
          setQ("");
          if (nextClass) {
            void navigate({ to: "/class/$classId", params: { classId: String(nextClass) } });
            return;
          }
          void navigate({
            to: "/classes",
            search: { stage: nextStage, sort: sort === "alpha" ? "alpha" : undefined },
          });
        }}
      />
      {yearSheet && classId == null && stageId ? (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setPane("year")} className={cn("min-h-8 rounded-full border px-3 py-1 text-sm font-semibold", pane === "year" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card")}>{tr("أعمال السنة")}</button>
          <button type="button" onClick={() => setPane("behavior")} className={cn("min-h-8 rounded-full border px-3 py-1 text-sm font-semibold", pane === "behavior" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card")}>{tr("المخالفات السلوكية")}</button>
          <button
            type="button"
            onClick={() => {
              setPane("year");
              setPrintTick((tick) => tick + 1);
            }}
            className="min-h-8 rounded-full border border-border bg-card px-3 py-1 text-sm font-semibold"
          >
            {tr("طباعة")}
          </button>
          {subjects.length > 1 ? (
            <select className="h-8 rounded-full border border-border bg-card px-3 text-sm" value={sheetSubject} onChange={(event) => setSheetSubject(event.target.value)}>
              {subjects.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          ) : null}
        </div>
      ) : null}
      {showYear && stageClasses.length ? (
        <ClassRecords classId={stageClasses[0]} mergeClassIds={stageClasses} presetSubject={sheetSubject || undefined} view="year" printTick={printTick} />
      ) : null}
      {showYear ? null : (
      <>
      <header className="mx-[calc(2mm-1rem)] grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-2 sm:mx-0">
        <h1 className="flex items-center gap-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          {tr("الفصول")}
          <PageHelp text={tr("اختر المرحلة ثم كل الفصول أو فصلاً واحداً — النبتة لتحسين السلوك والزائد لتسجيل مخالفة لطالب. المخالفة الجماعية تُبقي التحديد وأنت تنتقل بين المراحل والفصول، ثم تُسجَّل مرة واحدة وتذهب لوكيل شؤون الطلاب. الرسائل ومراسلة الزملاء داخل صفحة الطالب")} />
        </h1>
        <GroupViolationBar
          picking={picking}
          selected={targets.length}
          shownCount={shown.length}
          elsewhere={kept}
          onTogglePicking={() => {
            setGroupPicking(!picking);
            setGroupOpen(false);
          }}
          onSelectShown={() => {
            addGroupStudents(
              shown.map((student) => ({
                studentId: student.id,
                studentName: student.name,
                classId: student.classId,
              })),
            );
          }}
          onClear={clearGroupStudents}
          onApply={() => setGroupOpen(true)}
        />
      </header>
      <div className="relative mx-[calc(2mm-1rem)] sm:mx-0">
        <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-subtle" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr("ابحث عن طالب…")}
          className="pr-10"
        />
      </div>
      <ul className="mx-[calc(2mm-1rem)] divide-y divide-border overflow-hidden rounded-[var(--radius-md)] border border-border bg-card sm:mx-0 sm:rounded-[var(--radius-lg)]">
        {shown.map((student) => (
          <li
            key={student.id}
            className={cn(
              "flex items-start gap-1.5 px-3 py-3 sm:px-4",
              picking && pickedIds.has(student.id) && "bg-primary/5",
            )}
          >
            {picking ? (
              <PickMark
                checked={pickedIds.has(student.id)}
                label={student.name}
                onToggle={() =>
                  toggleGroupStudent({
                    studentId: student.id,
                    studentName: student.name,
                    classId: student.classId,
                  })
                }
              />
            ) : null}
            <button
              type="button"
              className="min-w-0 flex-1 text-right"
              onClick={() => {
                if (picking) {
                  toggleGroupStudent({
                    studentId: student.id,
                    studentName: student.name,
                    classId: student.classId,
                  });
                } else setActiveStudent(student.id);
              }}
            >
              <span className="flex flex-wrap items-center gap-2">
                {student.healthNote ? (
                  <span className="inline-flex max-w-full items-center gap-1.5">
                    <Badge tone="warn" className="shrink-0">{tr("ملاحظة صحية")}</Badge>
                    <span className="text-xs font-medium leading-5 text-warn">{student.healthNote}</span>
                  </span>
                ) : null}
                <DayName studentId={student.id} className="min-w-0 text-base font-semibold">{studentLabel(locale, student.name)}</DayName>
                <ExitPermitBadge studentId={student.id} />
              </span>
              <span className="block text-xs text-fg-muted">{placeLabel(student.label)}</span>
            </button>
            <StudentQuickActions
              studentId={student.id}
              studentName={student.name}
              classId={student.classId}
              parentPhone={student.parentPhone}
              className={student.className}
              shortName={student.shortName}
            />
          </li>
        ))}
        {roster.isFetching ? (
          <li className="px-4 py-10 text-center text-sm text-fg-muted">{tr("جارٍ تحميل الأسماء…")}</li>
        ) : shown.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-fg-muted">
            {stages.length === 0
              ? tr("لم تُضف مراحل بعد. ارفع ملف الطلاب من الإعدادات ← الاستيراد.")
              : tr("لا يوجد طلاب في هذا النطاق.")}
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
      <NoteComposer
        targets={targets}
        open={groupOpen}
        onOpenChange={setGroupOpen}
        onSubmitted={(result) => finishGroupPick(result.failedIds)}
      />
      <p className={cn("text-xs text-fg-muted", shown.length === 0 && "hidden")}>
        {tr("اضغط الاسم لسجل الطالب. في المخالفة الجماعية يبقى التحديد عند تغيير المرحلة أو الفصل حتى تسجّل الجميع.")}
      </p>
      </>
      )}
    </div>
  );
}

