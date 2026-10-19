import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppGate } from "@/components/app-gate";
import { ClassSwitcher } from "@/components/class-switcher";
import { StageClassBar, type ClassSort } from "@/components/stage-class-bar";
import { AddStudentButton } from "@/components/student-editor";
import { StudentSheet } from "@/components/student-sheet";
import { ClassBoard, ClassRecords } from "@/components/teacher-studio";
import { NoteComposer, NoteActions } from "@/components/note-actions";
import { ExitPermitBadge } from "@/components/exit-permit";
import { DayName } from "@/components/day-name";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { claimClassSubjectNotes, getClassPage } from "@/lib/school/api";
import {
  addGroupStudents,
  clearGroupStudents,
  finishGroupPick,
  setGroupPicking,
  toggleGroupStudent,
  useGroupPick,
} from "@/lib/school/group-pick";
import { studentLabel, useLocale, tr } from "@/lib/school/i18n";
import type { StudentRow } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/class/$classId")({
  validateSearch: (search: Record<string, unknown>): { student?: number; subject?: string; period?: string; from?: "desk" } => ({
    student: Number(search.student) > 0 ? Number(search.student) : undefined,
    subject: typeof search.subject === "string" && search.subject.trim() ? search.subject.trim().slice(0, 40) : undefined,
    period: typeof search.period === "string" && /^p\d+$/.test(search.period) ? search.period : undefined,
    from: search.from === "desk" ? "desk" : undefined,
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

function arrivedClock(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function ClassBody() {
  const { classId } = Route.useParams();
  const { student: studentParam, subject: lessonFromTable, period: periodFromTable, from } = Route.useSearch();
  const fromDesk = from === "desk";
  const id = Number(classId);
  const { stages, classes } = useWorkspace();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [activeStudent, setActiveStudent] = useState<number | null>(studentParam ?? null);
  const [sort, setSort] = useState<ClassSort>("order");
  const [groupOpen, setGroupOpen] = useState(false);
  const [followMode, setFollowMode] = useState<"one" | "group" | "year" | "analysis" | "attendance" | "summary" | "roster">("one");
  const [printTick, setPrintTick] = useState(0);
  const [followStudent, setFollowStudent] = useState<number | null>(null);
  const { picking, targets } = useGroupPick();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["class", id, periodFromTable ?? ""],
    queryFn: () => getClassPage({ data: { classId: id, period: periodFromTable } }),
    enabled: Number.isFinite(id),
  });
  const claim = useMutation({
    mutationFn: (subject: string) => claimClassSubjectNotes({ data: { classId: id, subject } }),
    onSuccess: (res) => {
      const count = (res as { count?: number }).count ?? 0;
      toast.success(count ? tr(`نُقلت ${count} ملاحظة إليك`) : tr("لا توجد ملاحظات لنقلها"));
      void queryClient.invalidateQueries({ queryKey: ["class", id] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر النقل")),
  });

  useEffect(() => {
    if (studentParam) setActiveStudent(studentParam);
  }, [studentParam]);

  const students = useMemo(() => {
    const list = query.data?.students ?? [];
    const term = q.trim();
    const filtered = term
      ? list.filter((s: StudentRow) => s.name.includes(term) || (s.nameEn ?? "").toLowerCase().includes(term.toLowerCase()))
      : list;
    if (sort === "alpha") {
      return [...filtered].sort((a: StudentRow, b: StudentRow) => a.name.localeCompare(b.name, "ar"));
    }
    return filtered;
  }, [query.data, q, sort]);

  const pickedIds = useMemo(() => new Set(targets.map((item) => item.studentId)), [targets]);

  if (query.isPending) {
    const current = classes.find((c) => c.id === id);
    return (
      <div className="space-y-3">
        {current && !fromDesk ? (
          <StageClassBar
            stages={stages}
            classes={classes}
            selectedStageId={current.stageId}
            selectedClassId={id}
            sort={sort}
            onSort={setSort}
            onChange={(nextStage, nextClass) => {
              if (nextClass) {
                void navigate({ to: "/class/$classId", params: { classId: String(nextClass) }, search: {} });
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
    return <p className="text-danger">{tr("تعذر تحميل الفصل.")}</p>;
  }

  const { classInfo, subjectHandoff = [] } = query.data as typeof query.data & {
    subjectHandoff?: { subject: string; count: number }[];
  };

  return (
    <div className="space-y-5">
      {fromDesk ? null : (
      <StageClassBar
        stages={stages}
        classes={classes}
        selectedStageId={classInfo.stageId}
        selectedClassId={id}
        sort={sort}
        onSort={setSort}
        onChange={(nextStage, nextClass) => {
          if (nextClass) {
            void navigate({ to: "/class/$classId", params: { classId: String(nextClass) }, search: {} });
            return;
          }
          void navigate({ to: "/classes", search: { stage: nextStage, sort: sort === "alpha" ? "alpha" : undefined } });
        }}
      />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <ClassSwitcher
            classId={id}
            stageId={classInfo.stageId}
            stageName={classInfo.stageName}
            shortName={classInfo.shortName}
            label={classInfo.label}
            backTo={fromDesk ? "/desk" : undefined}
          />
        </div>
        <AddStudentButton classId={id} />
      </div>
      {lessonFromTable ? (
        <p className="rounded-[var(--radius-md)] bg-primary/10 px-3 py-2 text-sm font-semibold">
          {tr("مادة هذه الحصة")}: {lessonFromTable}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["one", "فردي"],
            ["group", "جماعي"],
            ["year", "كشف أعمال السنة"],
            ["analysis", "التقرير الشامل"],
            ["summary", "تحليل الدرجات"],
            ["roster", "كشف الفصل"],
            ["attendance", "الحضور والغياب"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setFollowMode(mode)}
            className={cn(
              "min-h-8 rounded-full border px-3 py-1 text-sm font-semibold",
              followMode === mode ? "border-primary bg-primary/10 text-primary" : "border-border bg-card",
            )}
          >
            {tr(label)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            if (followMode === "one" || followMode === "group") setFollowMode("year");
            setPrintTick((tick) => tick + 1);
          }}
          className="min-h-8 rounded-full border border-border bg-card px-3 py-1 text-sm font-semibold"
        >
          {tr("طباعة")}
        </button>
        {followMode === "group" ? (
          <button
            type="button"
            onClick={() => setGroupPicking(!picking)}
            className={cn(
              "min-h-8 rounded-full border px-3 py-1 text-sm font-semibold",
              picking ? "border-danger bg-danger text-white" : "border-danger bg-danger-soft text-danger",
            )}
          >
            {tr("إضافة مخالفة")}
          </button>
        ) : null}
      </div>
      {subjectHandoff.length > 0 ? (
        <div className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-card p-3">
          <p className="text-sm font-semibold">{tr("ملاحظات مادة لدى معلم آخر")}</p>
          <div className="flex flex-wrap gap-2">
            {subjectHandoff.map((item) => (
              <Button
                key={item.subject}
                type="button"
                size="sm"
                variant="secondary"
                disabled={claim.isPending}
                onClick={() => claim.mutate(item.subject)}
              >
                {tr("نقل ملاحظات")} {item.subject} ({item.count})
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {followMode === "group" && picking ? (
        <div className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-card p-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                addGroupStudents(students.map((student: StudentRow) => ({
                  studentId: student.id,
                  studentName: studentLabel(locale, student.name, student.nameEn),
                  classId: id,
                })));
                setGroupOpen(true);
              }}
            >
              {tr("الجميع")}
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={targets.length === 0} onClick={() => setGroupOpen(true)}>
              {tr("تسجيل على المحدد")} {targets.length ? `(${targets.length})` : ""}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                clearGroupStudents();
                setGroupPicking(false);
              }}
            >
              {tr("إلغاء")}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {students.map((student: StudentRow) => {
              const label = studentLabel(locale, student.name, student.nameEn);
              const on = pickedIds.has(student.id);
              return (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => toggleGroupStudent({ studentId: student.id, studentName: label, classId: id })}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm",
                    on ? "border-primary bg-primary text-primary-fg" : "border-border bg-bg",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {followMode === "year" || followMode === "analysis" || followMode === "attendance" || followMode === "summary" || followMode === "roster" ? (
        <ClassRecords classId={id} presetSubject={lessonFromTable} view={followMode} printTick={printTick} />
      ) : null}
      {followMode === "group" ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-card">
          <ClassBoard classId={id} presetSubject={lessonFromTable} presetPeriod={periodFromTable} onClose={() => setFollowMode("one")} />
        </div>
      ) : null}
      {followMode === "one" ? (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tr("ابحث عن طالب…")}
              className="pr-10"
            />
          </div>
          <ul className="divide-y divide-border rounded-[var(--radius-lg)] border border-border bg-card">
            {students.map((student: StudentRow) => {
              const label = studentLabel(locale, student.name, student.nameEn);
              const open = followStudent === student.id;
              const taps = student.todayTaps ?? [];
              const marks = student.marks ?? [];
              const chips = [...taps.reduce((map, tap) => {
                const row = map.get(tap.label) ?? { label: tap.label, points: 0 };
                row.points += tap.points;
                map.set(tap.label, row);
                return map;
              }, new Map<string, { label: string; points: number }>()).values()];
              const lesson = chips.length ? chips.reduce((sum, chip) => sum + chip.points, 0) : marks.reduce((sum, mark) => sum + mark.lesson, 0);
              const absent = student.dailyKind === "absence";
              const late = student.dailyKind === "late";
              return (
                <li key={student.id} className={cn("px-3 py-2", absent ? "bg-red-100" : late ? "bg-orange-50" : lesson > 0 ? "bg-emerald-50" : lesson < 0 ? "bg-orange-100" : "")}>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFollowStudent(open ? null : student.id)}
                      className="min-w-0 flex-1 text-right"
                    >
                      <span className="block min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <DayName studentId={student.id} className={cn("block truncate text-base font-semibold leading-6", lesson > 0 && !absent && "text-emerald-700", lesson < 0 && !absent && "text-orange-700")}>{label}</DayName>
                          {absent ? <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">{tr("غائب")}</span> : null}
                          {late ? <span className="text-xs font-bold text-orange-700">{tr("متأخر")} {arrivedClock(student.arrivedAt)}</span> : null}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <ExitPermitBadge studentId={student.id} />
                          {student.healthNote ? <span className="rounded bg-fuchsia-200 px-1.5 py-0.5 text-[11px] font-bold text-fuchsia-900">{student.healthNote}</span> : null}
                          {chips.map((tap) => (
                            <span key={tap.label} className={cn("rounded px-1.5 py-0.5 text-[11px] font-bold", tap.points < 0 ? "bg-orange-500 text-white" : "bg-emerald-600 text-white")}>
                              {tap.label} {tap.points > 0 ? "+" : ""}{tap.points}
                            </span>
                          ))}
                          {marks.map((mark) => (
                            <span key={mark.subject || "total"} className={cn("text-sm font-bold tabular-nums", mark.total < 0 ? "text-orange-700" : "text-emerald-700")}>
                              {marks.length > 1 && mark.subject ? `${mark.subject} ` : `${tr("المجموع")} `}
                              {mark.total > 0 ? "+" : ""}{mark.total}
                            </span>
                          ))}
                          {lesson && chips.length === 0 ? <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-bold", lesson > 0 ? "bg-emerald-600 text-white" : "bg-orange-500 text-white")}>{lesson > 0 ? `+${lesson}` : lesson}</span> : null}
                          <span className="text-xs text-fg-muted">{tr("متابعة تحصيلية")}</span>
                        </span>
                      </span>
                    </button>
                    {open ? (
                      <button
                        type="button"
                        onClick={() => setFollowStudent(null)}
                        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-lg leading-none"
                        aria-label={tr("إغلاق")}
                      >
                        ×
                      </button>
                    ) : null}
                    <Button type="button" size="sm" variant="secondary" onClick={() => setActiveStudent(student.id)}>
                      {tr("السجل")}
                    </Button>
                    <NoteActions
                      studentId={student.id}
                      studentName={label}
                      classId={id}
                      presetSubject={lessonFromTable}
                      presetPeriod={periodFromTable}
                    />
                  </div>
                  {open ? <ClassBoard classId={id} onlyStudentId={student.id} compact presetSubject={lessonFromTable} presetPeriod={periodFromTable} lessonTaps={taps} onClose={() => setFollowStudent(null)} /> : null}
                </li>
              );
            })}
            {students.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-fg-muted">{tr("لا يوجد طلاب مطابقون")}</li>
            ) : null}
          </ul>
        </>
      ) : null}
      <NoteComposer
        targets={targets}
        open={groupOpen}
        onOpenChange={setGroupOpen}
        onSubmitted={(result) => finishGroupPick(result.failedIds)}
        presetSubject={lessonFromTable}
        presetPeriod={periodFromTable}
      />
      <StudentSheet
        studentId={activeStudent}
        open={activeStudent != null}
        onOpenChange={(open) => {
          if (!open) setActiveStudent(null);
        }}
        presetSubject={lessonFromTable}
        presetPeriod={periodFromTable}
      />
    </div>
  );
}
