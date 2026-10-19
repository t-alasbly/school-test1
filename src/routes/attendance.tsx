import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Printer } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { OfficialLetterhead } from "@/components/print-forms";
import { StudentSheet } from "@/components/student-sheet";
import { ExitPermitBadge } from "@/components/exit-permit";
import { AppGate } from "@/components/app-gate";
import { PageHelp } from "@/components/page-help";
import { DayField, CalendarSwitch } from "@/components/day-field";
import { StageClassBar, sortedStudents, type ClassSort } from "@/components/stage-class-bar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDailyAttendance, saveDailyAttendance, updateAppearance } from "@/lib/school/api";
import { listAttendanceDayCounts } from "@/lib/school/attendance-totals";
import { formatPrimaryDate, isoFromDate, type CalendarKind } from "@/lib/school/calendar";
import { formatTime, scheduleFor } from "@/lib/school/constants";
import { printElement } from "@/lib/school/print";
import { studentLabel, useLocale, tr } from "@/lib/school/i18n";
import { staffCan } from "@/lib/school/permissions";
import { mergeAppearance, applyAppearance } from "@/lib/school/theme";
import { useCalendar } from "@/lib/school/use-calendar";
import type { DailyAttendanceRow, DailyKind } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/attendance")({ component: AttendancePage });

type PrintKind = "all" | "absence" | "late" | "leave";
type Marks = {
  absence: boolean;
  late: boolean;
  leave: boolean;
  excused: boolean;
  arrivedAt: string | null;
  leaveDetails: string;
};

function todayISO() {
  return isoFromDate(new Date());
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function nowTime() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function timeFromIso(iso: string | null) {
  if (!iso) return nowTime();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return nowTime();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoFromDayTime(day: string, time: string) {
  const d = new Date(`${day}T${time || nowTime()}:00`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function slotBy(season: "winter" | "summer", schedules: Parameters<typeof scheduleFor>[1], key: string, hint: string) {
  const slots = scheduleFor(season, schedules);
  return slots.find((item) => item.key === key) ?? slots.find((item) => item.label.includes(hint)) ?? null;
}

function clockMinutes(iso: string | null) {
  const [hour, minute] = timeFromIso(iso).split(":").map(Number);
  return hour * 60 + minute;
}

function lateFromFirst(iso: string | null, season: "winter" | "summer", schedules: Parameters<typeof scheduleFor>[1]) {
  const assembly = slotBy(season, schedules, "assembly", "الطابور");
  const first = slotBy(season, schedules, "p1", "الأولى");
  if (!assembly || !first) return null;
  const mins = clockMinutes(iso);
  if (mins < assembly.startMin) return { phase: "before" as const, minutes: 0 };
  if (mins < first.startMin) return { phase: "assembly" as const, minutes: 0 };
  return { phase: "lesson" as const, minutes: mins - first.startMin };
}

function lateCountLabel(iso: string | null, season: "winter" | "summer", schedules: Parameters<typeof scheduleFor>[1]) {
  const count = lateFromFirst(iso, season, schedules);
  if (!count || count.phase === "before") return "";
  if (count.phase === "assembly") return tr("من الطابور");
  return count.minutes <= 0 ? tr("بداية الأولى") : `${count.minutes} ${tr("د")} ${tr("من الأولى")}`;
}

function minutesAfterSlot(
  season: "winter" | "summer",
  schedules: Parameters<typeof scheduleFor>[1],
  key: string,
  hint: string,
) {
  const period = slotBy(season, schedules, key, hint);
  if (!period) return null;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < period.endMin) return null;
  return mins - period.endMin;
}

function afterPeriod7Details(minutes: number) {
  return `p7m:${minutes}@${nowTime()}`;
}

function parseAfterPeriod6(details: string) {
  const match = String(details ?? "").match(/^p[67](only|m):(\d+)(?:@(\d{1,2}:\d{2}))?$/);
  if (!match) return null;
  return { only: match[1] === "only", minutes: Number(match[2]), time: match[3] ?? "" };
}

function afterPeriod7Label(minutes: number, time: string) {
  const mins = minutes <= 0 ? tr("بعد السابعة") : `${minutes} ${tr("د")} ${tr("بعد السابعة")}`;
  return time ? `${mins} · ${time}` : mins;
}

function AttendancePage() {
  return (
    <AppGate>
      <AttendanceBody />
    </AppGate>
  );
}

function AttendanceBody() {
  const { school, staff, classes, stages } = useWorkspace();
  const { locale } = useLocale();
  const calendar = useCalendar();
  const queryClient = useQueryClient();
  const sheetRef = useRef<HTMLElement>(null);
  const [day, setDay] = useState(todayISO);
  const [stageId, setStageId] = useState<number | null>(stages[0]?.id ?? null);
  const [classId, setClassId] = useState<number | null>(null);
  const [sort, setSort] = useState<ClassSort>("order");
  const [sheetStudentId, setSheetStudentId] = useState<number | null>(null);
  const [local, setLocal] = useState<Record<number, Marks>>({});
  const [pendingIds, setPendingIds] = useState<number[]>([]);
  const [printKind, setPrintKind] = useState<PrintKind>("all");
  const [showSheet, setShowSheet] = useState(false);
  const [printAll, setPrintAll] = useState(false);
  const [printStageIds, setPrintStageIds] = useState<number[]>(() => (stageId ? [stageId] : []));
  const [sheetRows, setSheetRows] = useState<DailyAttendanceRow[]>([]);
  const [sheetScope, setSheetScope] = useState("");
  const [busyPrint, setBusyPrint] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const selectedIds = useMemo(() => {
    if (classId) return [classId];
    if (stageId) return classes.filter((c) => c.stageId === stageId).map((c) => c.id);
    return classes.map((c) => c.id);
  }, [classId, stageId, classes]);

  const can = staffCan(staff, "dailyAttendance");
  const appearance = mergeAppearance(school.appearance, staff.appearance);
  const saveCalendar = useMutation({
    mutationFn: (next: CalendarKind) =>
      updateAppearance({
        data: { scope: "personal", appearance: { ...appearance, calendar: next } },
      }),
    onSuccess: (result, next) => {
      applyAppearance(result.appearance ?? { ...appearance, calendar: next });
      toast.success(next === "hijri" ? tr("التواريخ بالهجري") : tr("التواريخ بالميلادي"));
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
  });
  const queryKey = ["daily-attendance", day, selectedIds.join(",")];
  const query = useQuery({
    queryKey,
    queryFn: () =>
      getDailyAttendance({
        data: {
          day,
          classIds: selectedIds,
        },
      }),
    enabled: can,
  });
  const totals = useQuery({
    queryKey: ["attendance-day-counts"],
    queryFn: () => listAttendanceDayCounts(),
    enabled: can,
  });

  useEffect(() => {
    setLocal({});
  }, [day]);

  const students: DailyAttendanceRow[] = (query.data as { students?: DailyAttendanceRow[] } | undefined)?.students ?? [];

  function marksOf(row: DailyAttendanceRow): Marks {
    return local[row.studentId] ?? {
      absence: row.kind === "absence",
      late: row.kind === "late",
      leave: Boolean(row.hasLeave),
      excused: row.excused,
      arrivedAt: row.arrivedAt,
      leaveDetails: row.leaveDetails ?? "",
    };
  }

  function statusOf(row: DailyAttendanceRow): DailyKind | "present" {
    const marks = marksOf(row);
    if (marks.absence) return "absence";
    if (marks.late) return "late";
    return "present";
  }

  function dayTotals(row: DailyAttendanceRow) {
    const found = totals.data?.counts.find((item) => item.studentId === row.studentId);
    let absenceDays = found?.absenceDays ?? 0;
    let lateDays = found?.lateDays ?? 0;
    let leaveDays = found?.leaveDays ?? 0;
    const saved = { absence: row.kind === "absence", late: row.kind === "late", leave: Boolean(row.hasLeave) };
    const now = marksOf(row);
    if (saved.absence !== now.absence) absenceDays += now.absence ? 1 : -1;
    if (saved.late !== now.late) lateDays += now.late ? 1 : -1;
    if (saved.leave !== now.leave) leaveDays += now.leave ? 1 : -1;
    return {
      absenceDays: Math.max(0, absenceDays),
      lateDays: Math.max(0, lateDays),
      leaveDays: Math.max(0, leaveDays),
    };
  }

  function arrivedOf(row: DailyAttendanceRow): string | null {
    return marksOf(row).arrivedAt;
  }

  const shown = useMemo(() => {
    return sortedStudents(
      students.map((s) => ({ ...s })),
      sort,
    );
  }, [students, sort]);
  const dismissalWord = day < todayISO() || (day === todayISO() && minutesAfterSlot(school.season, school.schedules, "p6", "السادسة") != null);

  async function persist(s: DailyAttendanceRow, target: "absence" | "late" | "leave", extras?: Partial<Marks>) {
    const current = marksOf(s);
    const next: Marks = { ...current, ...extras };
    if (target === "absence") {
      if (current.absence && !extras) {
        next.absence = false;
      } else if (!extras) {
        next.absence = true;
        next.late = false;
        next.leave = false;
        next.leaveDetails = "";
      }
    } else if (target === "late") {
      const arrivedAt = extras?.arrivedAt || current.arrivedAt || isoFromDayTime(day, nowTime());
      if (day === todayISO() && lateFromFirst(arrivedAt, school.season, school.schedules)?.phase === "before") {
        toast.error(tr("التأخر يبدأ مع بداية الطابور"));
        return;
      }
      if (extras?.arrivedAt) {
        next.late = true;
        next.absence = false;
        next.arrivedAt = extras.arrivedAt;
      } else if (current.late) {
        next.late = false;
      } else {
        next.late = true;
        next.absence = false;
        next.arrivedAt = arrivedAt;
      }
    } else if (current.leave && !extras?.leaveDetails) {
      next.leave = false;
      next.leaveDetails = "";
    } else {
      const after = day === todayISO() ? minutesAfterSlot(school.season, school.schedules, "p7", "السابعة") : 0;
      if (day === todayISO() && after == null) {
        toast.error(tr("تأخر الانصراف يُحسب بعد نهاية الحصة السابعة حسب الجدول"));
        return;
      }
      next.leave = true;
      next.absence = false;
      next.late = false;
      next.leaveDetails = afterPeriod7Details(after ?? 0);
    }
    setLocal((prev) => ({ ...prev, [s.studentId]: next }));
    setPendingIds((p) => (p.includes(s.studentId) ? p : [...p, s.studentId]));
    const turningOff = target === "absence" ? !next.absence : target === "late" ? !next.late : !next.leave;
    try {
      await saveDailyAttendance({
        data: {
          day,
          entries: [
            turningOff
              ? { studentId: s.studentId, kind: "present" as const, clear: target }
              : {
                  studentId: s.studentId,
                  kind: target,
                  excused: next.excused,
                  details: target === "leave" ? next.leaveDetails : "",
                  arrivedAt: target === "late" ? next.arrivedAt ?? undefined : undefined,
                },
          ],
        },
      });
      queryClient.setQueryData(queryKey, (old: { day: string; students: DailyAttendanceRow[] } | undefined) => {
        if (!old?.students) return old;
        return {
          ...old,
          students: old.students.map((row) =>
            row.studentId === s.studentId
              ? {
                  ...row,
                  kind: next.absence ? "absence" : next.late ? "late" : null,
                  excused: next.excused,
                  arrivedAt: next.late ? next.arrivedAt : null,
                  hasLeave: next.leave,
                  leaveDetails: next.leave ? next.leaveDetails : "",
                }
              : row,
          ),
        };
      });
      void queryClient.invalidateQueries({ queryKey: ["class"] });
      void queryClient.invalidateQueries({ queryKey: ["today-marks"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
      void queryClient.invalidateQueries({ queryKey: ["attendance-day-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["student-attendance-days", s.studentId] });
    } catch (err) {
      toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ"));
    } finally {
      setPendingIds((p) => p.filter((id) => id !== s.studentId));
    }
  }

  const marked = useMemo(
    () =>
      shown.filter((s) => {
        const marks = marksOf(s);
        return marks.absence || marks.late || marks.leave;
      }),
    [shown, local],
  );

  function scopeText() {
    if (printAll) return tr("كل المراحل");
    return printStageIds
      .map((id) => stages.find((s) => s.id === id)?.name)
      .filter(Boolean)
      .join(" · ");
  }

  function withDrafts(rows: DailyAttendanceRow[]): DailyAttendanceRow[] {
    return rows.map((row) => {
      const draft = local[row.studentId];
      if (!draft) return row;
      const kind: DailyKind | null = draft.absence ? "absence" : draft.late ? "late" : null;
      return {
        ...row,
        kind,
        excused: draft.excused,
        arrivedAt: draft.late ? draft.arrivedAt : null,
        hasLeave: draft.leave,
        leaveDetails: draft.leave ? draft.leaveDetails : "",
      };
    });
  }

  async function loadPrintStudents() {
    if (printAll) {
      const res = (await getDailyAttendance({ data: { day } })) as { students?: DailyAttendanceRow[] };
      return res.students ?? [];
    }
    const ordered = [...printStageIds].sort((a, b) => {
      const sa = stages.find((s) => s.id === a)?.sortOrder ?? 0;
      const sb = stages.find((s) => s.id === b)?.sortOrder ?? 0;
      return sa - sb;
    });
    const chunks = await Promise.all(
      ordered.map(
        (stage) =>
          getDailyAttendance({ data: { day, stageId: stage } }) as Promise<{ students?: DailyAttendanceRow[] }>,
      ),
    );
    const seen = new Set<number>();
    const rows: DailyAttendanceRow[] = [];
    for (const chunk of chunks) {
      for (const row of chunk.students ?? []) {
        if (seen.has(row.studentId)) continue;
        seen.add(row.studentId);
        rows.push(row);
      }
    }
    return rows;
  }

  function togglePrintStage(id: number) {
    const base = printAll ? [] : printStageIds;
    if (base.includes(id)) {
      setPrintAll(false);
      setPrintStageIds(base.filter((x) => x !== id));
      return;
    }
    if (base.length >= 2) {
      toast("يمكن طباعة كل المراحل، أو مرحلة واحدة، أو مرحلتين فقط.");
      return;
    }
    setPrintAll(false);
    setPrintStageIds([...base, id]);
  }

  async function prepareSheet(kind: PrintKind, doPrint: boolean) {
    if (!printAll && printStageIds.length === 0) {
      toast.error(tr("اختر كل المراحل، أو مرحلة، أو مرحلتين."));
      return false;
    }
    setBusyPrint(true);
    try {
      const rows = withDrafts(await loadPrintStudents());
      const scope = scopeText();
      flushSync(() => {
        setPrintKind(kind);
        setSheetRows(rows);
        setSheetScope(scope);
        setShowSheet(true);
      });
      if (doPrint && sheetRef.current) printElement(sheetRef.current);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? tr(err.message) : tr("تعذر تجهيز الكشف"));
      return false;
    } finally {
      setBusyPrint(false);
    }
  }

  if (!can) {
    return <p className="text-fg-muted">{tr("تسجيل الغياب اليومي متاح لمسجل الغياب ولمن مُنح الصلاحية.")}</p>;
  }

  const printTitle =
    printKind === "absence"
      ? tr("كشف الغياب اليومي")
      : printKind === "late"
        ? tr("كشف التأخر الصباحي")
        : printKind === "leave"
          ? tr("كشف الانصراف")
          : tr("كشف الغياب اليومي والتأخر والانصراف");
  const dayStamp = `${day}T12:00:00`;
  const sheetNames = sheetRows.filter((s) => {
    if (printKind === "absence") return s.kind === "absence";
    if (printKind === "late") return s.kind === "late";
    if (printKind === "leave") return Boolean(s.hasLeave);
    return s.kind === "absence" || s.kind === "late" || Boolean(s.hasLeave);
  });
  const sheetAbsenceCount = sheetRows.filter((s) => s.kind === "absence").length;
  const sheetLateCount = sheetRows.filter((s) => s.kind === "late").length;
  const sheetLeaveCount = sheetRows.filter((s) => s.hasLeave).length;
  const showArrival = printKind === "late" || printKind === "all";
  const showLeaveCol = printKind === "leave" || printKind === "all";
  const nameColSpan = 4 + (showArrival ? 1 : 0) + (showLeaveCol ? 1 : 0);

  return (
    <div className="space-y-2">
      <StageClassBar
        stages={stages}
        classes={classes}
        selectedStageId={stageId}
        selectedClassId={classId}
        sort={sort}
        shortSort
        onSort={setSort}
        onChange={(nextStage, nextClass) => {
          setStageId(nextStage);
          setClassId(nextClass);
        }}
        actions={
          <>
            <Button type="button" size="sm" variant="secondary" className="h-8 px-2 text-[11px]" onClick={() => setPrintOpen(true)}>
              <Printer className="size-3.5" />
              {tr("طباعة")}
            </Button>
            {showSheet ? (
              <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-[11px]" onClick={() => setShowSheet(false)}>
                {tr("إخفاء")}
              </Button>
            ) : null}
          </>
        }
      />
      <header className="no-print flex items-center gap-2">
        <h1 className="flex min-w-0 items-center gap-1 text-xl font-semibold tracking-tight sm:text-3xl">
          <span className="truncate">{tr("الغياب اليومي")}</span>
          <PageHelp text={tr("التأخر يبدأ مع الطابور ويُحسب من الحصة الأولى. بعد الحصة السادسة يصبح الزر انصرافًا، ويُحسب تأخر الانصراف بعد نهاية الحصة السابعة حسب الجدول.")} />
        </h1>
        <div className="ms-auto shrink-0">
          <CalendarSwitch calendar={calendar} onCalendar={(next) => saveCalendar.mutate(next)} />
        </div>
      </header>
      <div className="no-print mx-[calc(2mm-1rem)] sm:mx-0">
        <DayField
          value={day}
          onChange={setDay}
          calendar={calendar}
          showCalendarToggle={false}
        />
      </div>

      <ul className="no-print mx-[calc(2mm-1rem)] divide-y divide-border overflow-hidden rounded-[var(--radius-md)] border border-border bg-card sm:mx-0 sm:rounded-[var(--radius-lg)]">
        {shown.map((s) => {
          const kind = statusOf(s);
          const saving = pendingIds.includes(s.studentId);
          const days = dayTotals(s);
          return (
            <li key={s.studentId} className="px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setSheetStudentId(s.studentId)}
                    className={cn(
                      "block w-fit max-w-full truncate rounded px-1.5 text-right text-base font-semibold leading-6 hover:underline",
                      kind === "absence" && "bg-danger text-white",
                      kind === "late" && "bg-orange-500 text-white",
                    )}
                  >
                    {studentLabel(locale, s.studentName, s.nameEn)}
                    <ExitPermitBadge studentId={s.studentId} className="ms-1.5 align-middle" />
                    {saving ? <span className="ms-2 text-xs font-normal text-fg-muted">{tr("يُحفظ…")}</span> : null}
                  </button>
                  <p className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-xs text-fg-muted">{s.classLabel}</span>
                    {kind === "late" ? (
                      <label className="flex h-6 shrink-0 items-center gap-1 rounded-full bg-warn px-2 text-[10px] font-bold text-primary-fg">
                        <button
                          type="button"
                          className="grid place-items-center"
                          aria-label={tr("وقت الحضور")}
                          onClick={(e) => {
                            e.preventDefault();
                            const input = e.currentTarget.parentElement?.querySelector("input");
                            input?.focus();
                            try {
                              input?.showPicker();
                            } catch {
                              /* المتصفح لا يدعم فتح الساعة مباشرة */
                            }
                          }}
                        >
                          <Clock className="size-3.5 shrink-0 text-primary-fg" />
                        </button>
                        {tr("وقت الحضور")}
                        <input
                          type="time"
                          value={timeFromIso(arrivedOf(s))}
                          onChange={(e) =>
                            void persist(s, "late", { arrivedAt: isoFromDayTime(day, e.target.value), late: true })
                          }
                          onClick={(e) => {
                            try {
                              e.currentTarget.showPicker();
                            } catch {
                              /* المتصفح يفتح الساعة بنفسه */
                            }
                          }}
                          className="bg-transparent text-[11px] font-bold text-primary-fg scheme-dark [&::-webkit-calendar-picker-indicator]:hidden"
                          dir="ltr"
                        />
                        <span>{lateCountLabel(arrivedOf(s), school.season, school.schedules)}</span>
                      </label>
                    ) : null}
                    {marksOf(s).leave ? (
                      <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-[#1e3a5f] px-2 text-[10px] font-bold text-white">
                        {afterPeriod7Label(parseAfterPeriod6(marksOf(s).leaveDetails)?.minutes ?? 0, parseAfterPeriod6(marksOf(s).leaveDetails)?.time ?? "")}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-start gap-1">
                  <div className="flex flex-col items-center">
                    <button
                      type="button"
                      aria-pressed={dismissalWord ? marksOf(s).leave : kind === "late"}
                      onClick={() => {
                        void persist(s, dismissalWord ? "leave" : "late");
                      }}
                      className={cn(
                        "h-10 rounded-full border px-2.5 text-sm font-medium",
                        dismissalWord
                          ? marksOf(s).leave
                            ? "border-violet-700 bg-violet-100 text-violet-800"
                            : "border-border bg-bg-elevated text-fg-muted"
                          : kind === "late"
                            ? "border-orange-500 bg-orange-500 text-white"
                            : "border-border bg-bg-elevated text-fg-muted",
                      )}
                    >
                      {dismissalWord ? tr("انصراف") : tr("تأخر")}
                    </button>
                    <span className="mt-0.5 flex gap-1 text-[10px] leading-3 tabular-nums">
                      <span className={days.lateDays > 0 ? "text-orange-600" : "text-fg-subtle"}>{days.lateDays}</span>
                      <span className={days.leaveDays > 0 ? "text-violet-700" : "text-fg-subtle"}>{days.leaveDays}</span>
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <button
                      type="button"
                      aria-pressed={kind === "absence"}
                      onClick={() => {
                        void persist(s, "absence");
                      }}
                      className={cn(
                        "h-10 rounded-full border px-2.5 text-sm font-medium",
                        kind === "absence" ? "border-danger bg-danger-soft text-danger" : "border-border bg-bg-elevated text-fg-muted",
                      )}
                    >
                      {tr("غياب")}
                    </button>
                    <span className={cn("mt-0.5 text-[10px] leading-3 tabular-nums", days.absenceDays > 0 ? "text-danger" : "text-fg-subtle")}>
                      {days.absenceDays}
                    </span>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
        {shown.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-fg-muted">{tr("لا يوجد طلاب في هذا النطاق")}</li>
        ) : null}
      </ul>

      <article
        ref={sheetRef}
        className={cn("print-form attendance-print official-sheet bg-white font-naskh text-black", !showSheet && "hidden")}
      >
        <OfficialLetterhead school={school} />
        <h2 className="mt-2 text-center text-[20px] font-semibold">{printTitle}</h2>
        <p className="text-center text-[15px] font-semibold">{sheetScope || "—"}</p>
        <p className="text-center text-[13px] text-[#00857c]">
          {formatPrimaryDate(dayStamp, calendar)} — {formatPrimaryDate(dayStamp, calendar === "hijri" ? "gregorian" : "hijri")}
        </p>
        <table className="official-table mb-3">
          <thead>
            <tr>
              <th>{tr("التاريخ")}</th>
              {printKind === "absence" || printKind === "all" ? <th>{tr("عدد الغائبين")}</th> : null}
              {printKind === "late" || printKind === "all" ? <th>{tr("عدد المتأخرين")}</th> : null}
              {printKind === "leave" || printKind === "all" ? <th>{tr("عدد الانصراف")}</th> : null}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 text-[16px] font-semibold">{formatPrimaryDate(dayStamp, calendar)}</td>
              {printKind === "absence" || printKind === "all" ? (
                <td className="text-[16px] font-semibold">{sheetAbsenceCount}</td>
              ) : null}
              {printKind === "late" || printKind === "all" ? (
                <td className="text-[16px] font-semibold">{sheetLateCount}</td>
              ) : null}
              {printKind === "leave" || printKind === "all" ? (
                <td className="text-[16px] font-semibold">{sheetLeaveCount}</td>
              ) : null}
            </tr>
          </tbody>
        </table>
        <table className="official-table">
          <thead>
            <tr>
              <th className="w-10">{tr("م")}</th>
              <th>{tr("اسم الطالب")}</th>
              <th>{tr("الصف")}</th>
              <th>{tr("النوع")}</th>
              {showArrival ? <th>{tr("وقت الحضور")}</th> : null}
              {showLeaveCol ? <th>{tr("انصراف")}</th> : null}
            </tr>
          </thead>
          <tbody>
            {sheetNames.length === 0 ? (
              <tr>
                <td colSpan={nameColSpan} className="py-8">
                  {printKind === "absence"
                    ? tr("لا يوجد غائبون في هذا النطاق.")
                    : printKind === "late"
                      ? tr("لا يوجد متأخرون في هذا النطاق.")
                      : printKind === "leave"
                        ? tr("لا يوجد انصراف متأخر في هذا النطاق.")
                        : tr("لا يوجد غائبون أو متأخرون في هذا النطاق.")}
                </td>
              </tr>
            ) : (
              sheetNames.map((s, i) => {
                const leave = parseAfterPeriod6(s.leaveDetails ?? "");
                const kindText = [
                  s.kind === "absence" ? tr("غياب اليوم الكامل") : "",
                  s.kind === "late" ? tr("تأخر صباحي") : "",
                  s.hasLeave ? tr("انصراف") : "",
                ].filter(Boolean).join(" · ");
                return (
                  <tr key={s.studentId}>
                    <td>{i + 1}</td>
                    <td className="text-[15px] font-semibold">{studentLabel(locale, s.studentName, s.nameEn)}</td>
                    <td>{s.classLabel}</td>
                    <td>{kindText || "—"}</td>
                    {showArrival ? (
                      <td>{s.kind === "late" && s.arrivedAt ? `${formatTime(s.arrivedAt)} · ${lateCountLabel(s.arrivedAt, school.season, school.schedules) || "—"}` : "—"}</td>
                    ) : null}
                    {showLeaveCol ? (
                      <td>{s.hasLeave ? (leave ? afterPeriod7Label(leave.minutes, leave.time) : tr("انصراف")) : "—"}</td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <p className="mt-6 text-center text-[13px] leading-7">
          {school.principalName ? `${school.principalName} — ` : ""}
          التوقيع: ……………… — الختم
        </p>
      </article>

      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("طباعة الكشف")}</DialogTitle>
            <DialogDescription>{tr("اختر نوع الكشف ونطاق المراحل، ثم اطبع. التسجيل على الشاشة لا يتغير.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold">{tr("نوع الكشف")}</p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["absence", tr("الغياب")],
                    ["late", tr("التأخر")],
                    ["leave", tr("انصراف")],
                    ["all", tr("الكل")],
                  ] as const
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setPrintKind(kind)}
                    className={cn(
                      "min-h-8 rounded-[var(--radius-md)] border text-sm font-semibold",
                      printKind === kind
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-bg text-fg",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">{tr("المراحل")}</p>
              <p className="text-xs text-fg-muted">{tr("كل المراحل، أو مرحلة واحدة، أو مرحلتين.")}</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setPrintAll(true);
                    setPrintStageIds([]);
                  }}
                  className={cn(
                    "min-h-8 rounded-full border px-3 text-sm font-medium",
                    printAll ? "border-primary bg-primary/5 text-primary" : "border-border bg-bg text-fg",
                  )}
                >
                  {tr("كل المراحل")}
                </button>
                {stages.map((stage) => {
                  const on = !printAll && printStageIds.includes(stage.id);
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => togglePrintStage(stage.id)}
                      className={cn(
                        "min-h-8 rounded-full border px-3 text-sm font-medium",
                        on ? "border-primary bg-primary/5 text-primary" : "border-border bg-bg text-fg",
                      )}
                    >
                      {stage.shortName || stage.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                disabled={busyPrint}
                onClick={() => {
                  void prepareSheet(printKind, true).then((ok) => {
                    if (ok) setPrintOpen(false);
                  });
                }}
              >
                <Printer className="size-4" />
                {busyPrint ? tr("جارٍ…") : tr("طباعة")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busyPrint}
                onClick={() => {
                  void prepareSheet(printKind, false).then((ok) => {
                    if (ok) setPrintOpen(false);
                  });
                }}
              >
                عرض الكشف
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <StudentSheet
        studentId={sheetStudentId}
        open={sheetStudentId != null}
        onOpenChange={(open) => {
          if (!open) setSheetStudentId(null);
        }}
      />
    </div>
  );
}
