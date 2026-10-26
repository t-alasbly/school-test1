import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppGate } from "@/components/app-gate";
import { ClassSwitcher } from "@/components/class-switcher";
import { StageClassBar, type ClassSort } from "@/components/stage-class-bar";
import { AddStudentButton } from "@/components/student-editor";
import { StudentSheet } from "@/components/student-sheet";
import { CallParent } from "@/components/call-parent";
import { StudentQuickActions } from "@/components/student-quick-actions";
import { ClassBoard, ClassRecords } from "@/components/teacher-studio";
import { NoteComposer } from "@/components/note-actions";
import { ExitPermitBadge } from "@/components/exit-permit";
import { DayName } from "@/components/day-name";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { claimClassSubjectNotes, getClassPage, getMyTimetable } from "@/lib/school/api";
import {
  finishGroupPick,
  useGroupPick,
} from "@/lib/school/group-pick";
import { studentLabel, tr, useLocale } from "@/lib/school/i18n";
import { staffCan, canSeeParentPhone } from "@/lib/school/permissions";
import type { StudentRow } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/class/$classId")({
  validateSearch: (search: Record<string, unknown>): { student?: number; subject?: string; period?: string; from?: "desk"; pane?: "behavior" | "one" | "group" | "year" } => ({
    student: Number(search.student) > 0 ? Number(search.student) : undefined,
    subject: typeof search.subject === "string" && search.subject.trim() ? search.subject.trim().slice(0, 40) : undefined,
    period: typeof search.period === "string" && /^p\d+$/.test(search.period) ? search.period : undefined,
    from: search.from === "desk" ? "desk" : undefined,
    pane: search.pane === "behavior" || search.pane === "one" || search.pane === "group" || search.pane === "year" ? search.pane : undefined,
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

type FollowMode = "behavior" | "one" | "group" | "year";

function ClassBody() {
  const { classId } = Route.useParams();
  const { student: studentParam, subject: lessonFromTable, period: periodFromTable, from, pane } = Route.useSearch();
  const fromDesk = from === "desk";
  const id = Number(classId);
  const { stages, classes, staff } = useWorkspace();
  const tableQuery = useQuery({ queryKey: ["my-timetable"], queryFn: () => getMyTimetable() });
  const owner = tableQuery.data as { role?: string; showFollow?: boolean; showYear?: boolean } | undefined;
  const asTeacher = fromDesk && owner?.role === "teacher";
  const classFollow = asTeacher ? Boolean(owner?.showFollow) : staffCan(staff, "viewClassFollow");
  const yearSheet = asTeacher ? Boolean(owner?.showYear) : staffCan(staff, "viewYearSheet");
  const showPhones = asTeacher ? false : canSeeParentPhone(staff);
  const { locale } = useLocale();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [activeStudent, setActiveStudent] = useState<number | null>(studentParam ?? null);
  const [sort, setSort] = useState<ClassSort>("order");
  const [groupOpen, setGroupOpen] = useState(false);
  const [followMode, setFollowMode] = useState<FollowMode>(pane ?? (fromDesk || lessonFromTable ? "behavior" : classFollow ? "one" : yearSheet ? "year" : "behavior"));
  const [printTick, setPrintTick] = useState(0);
  const [followStudent, setFollowStudent] = useState<number | null>(null);
  const { targets } = useGroupPick();
  const queryClient = useQueryClient();
  const taughtIds = new Set((tableQuery.data?.cells ?? []).map((cell) => cell.classId).filter((value): value is number => value != null));
  const onTable = taughtIds.size === 0 || taughtIds.has(id);
  const allowFollow = classFollow && onTable;
  const allowYear = yearSheet && onTable;
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

  useEffect(() => {
    if (!onTable && followMode !== "behavior") setFollowMode("behavior");
  }, [onTable, id]);
  useEffect(() => {
    if (followMode === "one" && !allowFollow) setFollowMode(allowYear ? "year" : "behavior");
    if (followMode === "group" && !allowFollow) setFollowMode("behavior");
    if (followMode === "year" && !allowYear) setFollowMode(allowFollow ? "one" : "behavior");
  }, [allowFollow, allowYear, followMode]);

  const students = useMemo(() => {
    const list = query.data?.students ?? [];
    const term = q.trim();
    const filtered = term
      ? list.filter((s: StudentRow) => s.name.includes(term) || (s.nameEn ?? "").toLowerCase().includes(term.toLowerCase()))
      : list;
    if (sort === "alpha") return [...filtered].sort((a: StudentRow, b: StudentRow) => a.name.localeCompare(b.name, "ar"));
    return filtered;
  }, [query.data, q, sort]);

  const keepSearch = {
    subject: lessonFromTable,
    period: periodFromTable,
    from: fromDesk ? ("desk" as const) : undefined,
    pane: followMode,
  };

  function openPane(mode: FollowMode) {
    setFollowMode(mode);
    void navigate({ to: "/class/$classId", params: { classId: String(id) }, search: { ...keepSearch, pane: mode }, replace: true });
  }

  function changeClass(nextStage: number, nextClass: number | null) {
    if (nextClass) {
      void navigate({ to: "/class/$classId", params: { classId: String(nextClass) }, search: keepSearch });
      return;
    }
    void navigate({ to: "/classes", search: { stage: nextStage, sort: sort === "alpha" ? "alpha" : undefined } });
  }

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
            onChange={changeClass}
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
  const modes = [
    ["behavior", "سلوكي"],
    ...(allowFollow ? ([["one", "متابعة صفية"], ["group", "جماعي"]] as const) : []),
    ...(allowYear ? ([["year", "أعمال السنة"]] as const) : []),
  ] as const;

  return (
    <div className="space-y-5">
      <StageClassBar
        stages={stages}
        classes={classes}
        selectedStageId={classInfo.stageId}
        selectedClassId={id}
        sort={sort}
        onSort={setSort}
        onChange={changeClass}
      />
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
          {tr("مادة هذه الحصة")}: {tr(lessonFromTable)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {modes.map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => openPane(mode)}
            className={cn(
              "min-h-8 rounded-full border px-3 py-1 text-sm font-semibold",
              followMode === mode ? "border-primary bg-primary/10 text-primary" : "border-border bg-card",
            )}
          >
            {tr(label)}
          </button>
        ))}
        {allowYear ? (
          <button
            type="button"
            onClick={() => {
              setFollowMode("year");
              setPrintTick((tick) => tick + 1);
            }}
            className="min-h-8 rounded-full border border-border bg-card px-3 py-1 text-sm font-semibold"
          >
            {tr("طباعة")}
          </button>
        ) : null}
        {allowFollow || allowYear ? (
          <Link to="/desk/format" className="min-h-8 rounded-full border border-amber-600 bg-amber-500 px-3 py-1 text-sm font-semibold text-white">
            {tr("تنسيق الدرجات")}
          </Link>
        ) : null}
      </div>
      {subjectHandoff.length > 0 && allowFollow ? (
        <div className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-card p-3">
          <p className="text-sm font-semibold">{tr("ملاحظات مادة لدى معلم آخر")}</p>
          <div className="flex flex-wrap gap-2">
            {subjectHandoff.map((item) => (
              <Button key={item.subject} type="button" size="sm" variant="secondary" disabled={claim.isPending} onClick={() => claim.mutate(item.subject)}>
                {tr("نقل ملاحظات")} {item.subject} ({item.count})
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {followMode === "year" && allowYear ? <ClassRecords classId={id} presetSubject={lessonFromTable} view="year" printTick={printTick} /> : null}
      {followMode === "group" && allowFollow ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-card">
          <ClassBoard classId={id} presetSubject={lessonFromTable} presetPeriod={periodFromTable} onClose={() => setFollowMode(allowFollow ? "one" : "behavior")} />
        </div>
      ) : null}
      {followMode === "behavior" || (followMode === "one" && allowFollow) ? (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("ابحث عن طالب…")} className="pr-10" />
          </div>
          <ul className="divide-y divide-border rounded-[var(--radius-lg)] border border-border bg-card">
            {students.map((student: StudentRow) => {
              const label = studentLabel(locale, student.name, student.nameEn);
              const open = allowFollow && followMode === "one" && followStudent === student.id;
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
              const phones = [student.parentPhone, student.parentPhone2, student.workPhone].filter(Boolean);
              return (
                <li key={student.id} className={cn("px-3 py-2", absent ? "bg-red-100" : late ? "bg-orange-50" : lesson > 0 && allowFollow ? "bg-emerald-50" : lesson < 0 && allowFollow ? "bg-orange-100" : "")}>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (followMode === "one" && allowFollow) setFollowStudent(open ? null : student.id);
                        else setActiveStudent(student.id);
                      }}
                      className="min-w-0 flex-1 text-right"
                    >
                      <span className="flex flex-wrap items-center gap-1.5">
                        <DayName studentId={student.id} className={cn("truncate text-base font-semibold leading-6", allowFollow && lesson > 0 && !absent && "text-emerald-700", allowFollow && lesson < 0 && !absent && "text-orange-700")}>{label}</DayName>
                        {absent ? <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">{tr("غائب")}</span> : null}
                        {late ? <span className="text-xs font-bold text-orange-700">{tr("متأخر")} {arrivedClock(student.arrivedAt)}</span> : null}
                        <ExitPermitBadge studentId={student.id} />
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {student.healthNote ? <span className="rounded bg-fuchsia-200 px-1.5 py-0.5 text-[11px] font-bold text-fuchsia-900">{tr(student.healthNote)}</span> : null}
                        {allowFollow ? chips.map((tap) => (
                          <span key={tap.label} className={cn("rounded px-1.5 py-0.5 text-[11px] font-bold", tap.points < 0 ? "bg-orange-500 text-white" : "bg-emerald-600 text-white")}>
                            {tap.label} {tap.points > 0 ? "+" : ""}{tap.points}
                          </span>
                        )) : null}
                        {allowFollow ? marks.map((mark) => (
                          <span key={mark.subject || "total"} className={cn("text-sm font-bold tabular-nums", mark.total < 0 ? "text-orange-700" : "text-emerald-700")}>
                            {marks.length > 1 && mark.subject ? `${tr(mark.subject)} ` : `${tr("المجموع")} `}
                            {mark.total > 0 ? "+" : ""}{mark.total}
                          </span>
                        )) : null}
                        {showPhones && phones.length ? <span className="text-xs text-fg-muted" dir="ltr">{phones.join(" · ")}</span> : null}
                      </span>
                    </button>
                    {open ? (
                      <button type="button" onClick={() => setFollowStudent(null)} className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-lg leading-none" aria-label={tr("إغلاق")}>×</button>
                    ) : null}
                    {followMode === "one" && allowFollow ? (
                      <Button type="button" size="sm" variant="secondary" onClick={() => setActiveStudent(student.id)}>{tr("السجل")}</Button>
                    ) : null}
                    <CallParent phones={[student.parentPhone, student.parentPhone2, student.workPhone]} />
                    <StudentQuickActions
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
            {students.length === 0 ? <li className="px-4 py-10 text-center text-sm text-fg-muted">{tr("لا يوجد طلاب مطابقون")}</li> : null}
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
