import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { OfficialLetterhead } from "@/components/print-forms";
import { AppGate } from "@/components/app-gate";
import { DayField } from "@/components/day-field";
import { StageClassBar, sortedStudents, type ClassSort } from "@/components/stage-class-bar";
import { Button } from "@/components/ui/button";
import { getDailyAttendance, saveDailyAttendance, updateAppearance } from "@/lib/school/api";
import { formatPrimaryDate, isoFromDate, type CalendarKind } from "@/lib/school/calendar";
import { formatTime } from "@/lib/school/constants";
import { printElement } from "@/lib/school/print";
import { staffCan } from "@/lib/school/permissions";
import { mergeAppearance, applyAppearance } from "@/lib/school/theme";
import { useCalendar } from "@/lib/school/use-calendar";
import type { DailyAttendanceRow, DailyKind } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/attendance")({ component: AttendancePage });

type PrintKind = "all" | "absence" | "late";
type Draft = { kind: DailyKind | "present"; excused: boolean; arrivedAt: string | null };

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

function AttendancePage() {
  return (
    <AppGate>
      <AttendanceBody />
    </AppGate>
  );
}

function AttendanceBody() {
  const { school, staff, classes, stages } = useWorkspace();
  const calendar = useCalendar();
  const queryClient = useQueryClient();
  const sheetRef = useRef<HTMLElement>(null);
  const [day, setDay] = useState(todayISO);
  const [stageId, setStageId] = useState<number | null>(stages[0]?.id ?? null);
  const [classId, setClassId] = useState<number | null>(null);
  const [sort, setSort] = useState<ClassSort>("order");
  const [local, setLocal] = useState<Record<number, Draft>>({});
  const [pendingIds, setPendingIds] = useState<number[]>([]);
  const [printKind, setPrintKind] = useState<PrintKind>("all");
  const [showSheet, setShowSheet] = useState(false);

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
      toast.success(next === "hijri" ? "التواريخ بالهجري" : "التواريخ بالميلادي");
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

  useEffect(() => {
    setLocal({});
  }, [day]);

  const students: DailyAttendanceRow[] = (query.data as { students?: DailyAttendanceRow[] } | undefined)?.students ?? [];

  function statusOf(row: DailyAttendanceRow): DailyKind | "present" {
    return local[row.studentId]?.kind ?? row.kind ?? "present";
  }

  function arrivedOf(row: DailyAttendanceRow): string | null {
    if (local[row.studentId]?.arrivedAt !== undefined) return local[row.studentId].arrivedAt;
    return row.arrivedAt;
  }

  const shown = useMemo(() => {
    return sortedStudents(
      students.map((s) => ({ ...s })),
      sort,
    );
  }, [students, sort]);

  async function persist(s: DailyAttendanceRow, kind: DailyKind | "present", extras?: Partial<Draft>) {
    const excused = extras?.excused ?? local[s.studentId]?.excused ?? s.excused;
    const arrivedAt =
      kind === "late"
        ? extras?.arrivedAt ?? local[s.studentId]?.arrivedAt ?? s.arrivedAt ?? isoFromDayTime(day, nowTime())
        : null;
    const draft: Draft = { kind, excused, arrivedAt };
    setLocal((prev) => ({ ...prev, [s.studentId]: draft }));
    setPendingIds((p) => (p.includes(s.studentId) ? p : [...p, s.studentId]));
    try {
      await saveDailyAttendance({
        data: {
          day,
          entries: [
            {
              studentId: s.studentId,
              kind,
              excused,
              arrivedAt: arrivedAt ?? undefined,
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
                  kind: kind === "present" ? null : kind,
                  excused,
                  arrivedAt: kind === "late" ? arrivedAt : null,
                }
              : row,
          ),
        };
      });
      void queryClient.invalidateQueries({ queryKey: ["class"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر الحفظ");
    } finally {
      setPendingIds((p) => p.filter((id) => id !== s.studentId));
    }
  }

  const marked = useMemo(
    () =>
      shown.filter((s) => {
        const kind = statusOf(s);
        return kind === "absence" || kind === "late";
      }),
    [shown, local],
  );

  const printRows = marked.filter((s) => {
    const kind = statusOf(s);
    if (printKind === "absence") return kind === "absence";
    if (printKind === "late") return kind === "late";
    return true;
  });

  function printSheet(kind: PrintKind) {
    flushSync(() => {
      setPrintKind(kind);
      setShowSheet(true);
    });
    if (sheetRef.current) printElement(sheetRef.current);
  }

  if (!can) {
    return <p className="text-fg-muted">تسجيل الغياب اليومي متاح لمسجل الغياب ولمن مُنح الصلاحية.</p>;
  }

  const printTitle =
    printKind === "absence"
      ? "كشف الغياب اليومي"
      : printKind === "late"
        ? "كشف التأخر الصباحي"
        : "كشف الغياب اليومي والتأخر الصباحي";
  const dayStamp = `${day}T12:00:00`;

  return (
    <div className="space-y-5">
      <StageClassBar
        stages={stages}
        classes={classes}
        selectedStageId={stageId}
        selectedClassId={classId}
        sort={sort}
        onSort={setSort}
        onChange={(nextStage, nextClass) => {
          setStageId(nextStage);
          setClassId(nextClass);
        }}
      />
      <header className="no-print space-y-2">
        <p className="text-sm text-fg-muted">حضور أو غياب اليوم الكامل أو التأخر عن الاصطفاف — بدون حصص</p>
        <h1 className="text-3xl font-semibold tracking-tight">الغياب اليومي والتأخر</h1>
        <DayField
          value={day}
          onChange={setDay}
          calendar={calendar}
          onCalendar={(next) => saveCalendar.mutate(next)}
        />
      </header>
      <div className="no-print flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-danger-soft px-2.5 py-1 font-medium text-danger">
          غائب {marked.filter((s) => statusOf(s) === "absence").length}
        </span>
        <span className="rounded-full bg-warn-soft px-2.5 py-1 font-medium text-warn">
          متأخر {marked.filter((s) => statusOf(s) === "late").length}
        </span>
        <span className="rounded-full bg-muted px-2.5 py-1 text-fg-muted">طالب {shown.length}</span>
      </div>

      <ul className="no-print divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
        {shown.map((s) => {
          const kind = statusOf(s);
          const saving = pendingIds.includes(s.studentId);
          return (
            <li key={s.studentId} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-base font-semibold leading-6",
                    kind === "absence" && "text-danger",
                    kind === "late" && "text-warn",
                  )}
                >
                  {s.studentName}
                  {saving ? <span className="ms-2 text-xs font-normal text-fg-muted">يُحفظ…</span> : null}
                </p>
                <p className="text-xs text-fg-muted">{s.classLabel}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    ["present", "حاضر"],
                    ["late", "تأخر"],
                    ["absence", "غياب"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => void persist(s, k)}
                    className={cn(
                      "h-10 rounded-full border px-3 text-sm font-medium",
                      kind === k
                        ? k === "present"
                          ? "border-ok bg-ok-soft text-ok"
                          : k === "late"
                            ? "border-warn bg-warn-soft text-warn"
                            : "border-danger bg-danger-soft text-danger"
                        : "border-border bg-bg-elevated text-fg-muted",
                    )}
                  >
                    {label}
                  </button>
                ))}
                {kind === "late" ? (
                  <label className="flex h-10 items-center gap-1.5 rounded-full border border-warn bg-warn-soft px-3 text-xs text-warn">
                    حضور
                    <input
                      type="time"
                      value={timeFromIso(arrivedOf(s))}
                      onChange={(e) =>
                        void persist(s, "late", { arrivedAt: isoFromDayTime(day, e.target.value) })
                      }
                      className="bg-transparent text-sm text-warn"
                      dir="ltr"
                    />
                  </label>
                ) : null}
              </div>
            </li>
          );
        })}
        {shown.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-fg-muted">لا يوجد طلاب في هذا النطاق</li>
        ) : null}
      </ul>

      <article
        ref={sheetRef}
        className={cn("print-form official-sheet bg-white font-naskh text-black", !showSheet && "hidden")}
      >
        <OfficialLetterhead school={school} />
        <h2 className="mt-2 text-center text-[20px] font-semibold">{printTitle}</h2>
        <p className="text-center text-[13px] text-[#00857c]">
          {formatPrimaryDate(dayStamp, calendar)} — {formatPrimaryDate(dayStamp, calendar === "hijri" ? "gregorian" : "hijri")}
        </p>
        <table className="official-table mb-3">
          <thead>
            <tr>
              <th>التاريخ</th>
              {printKind !== "late" ? <th>عدد الغائبين</th> : null}
              {printKind !== "absence" ? <th>عدد المتأخرين</th> : null}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 text-[16px] font-semibold">{formatPrimaryDate(dayStamp, calendar)}</td>
              {printKind !== "late" ? (
                <td className="text-[16px] font-semibold">
                  {marked.filter((s) => statusOf(s) === "absence").length}
                </td>
              ) : null}
              {printKind !== "absence" ? (
                <td className="text-[16px] font-semibold">
                  {marked.filter((s) => statusOf(s) === "late").length}
                </td>
              ) : null}
            </tr>
          </tbody>
        </table>
        <table className="official-table">
          <thead>
            <tr>
              <th className="w-10">م</th>
              <th>اسم الطالب</th>
              <th>الصف</th>
              <th>النوع</th>
              {printKind !== "absence" ? <th>وقت الحضور</th> : null}
            </tr>
          </thead>
          <tbody>
            {printRows.length === 0 ? (
              <tr>
                <td colSpan={printKind === "absence" ? 4 : 5} className="py-8">
                  {printKind === "absence"
                    ? "لا يوجد غائبون في هذا اليوم."
                    : printKind === "late"
                      ? "لا يوجد متأخرون في هذا اليوم."
                      : "لا يوجد غائبون أو متأخرون في هذا اليوم."}
                </td>
              </tr>
            ) : (
              printRows.map((s, i) => (
                <tr key={s.studentId}>
                  <td>{i + 1}</td>
                  <td className="text-[15px] font-semibold">{s.studentName}</td>
                  <td>{s.classLabel}</td>
                  <td>{statusOf(s) === "late" ? "تأخر صباحي" : "غياب اليوم الكامل"}</td>
                  {printKind !== "absence" ? (
                    <td>{statusOf(s) === "late" && arrivedOf(s) ? formatTime(arrivedOf(s)) : "—"}</td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
        <p className="mt-6 text-center text-[13px] leading-7">
          {school.principalName ? `${school.principalName} — ` : ""}
          التوقيع: ……………… — الختم
        </p>
      </article>

      <div className="no-print pointer-events-none h-24 md:h-16" />
      <div className="no-print fixed inset-x-0 bottom-[3.6rem] z-30 border-t border-border bg-bg-elevated/95 p-2 backdrop-blur-sm md:bottom-0">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2 px-1">
          <Button variant="secondary" size="sm" onClick={() => printSheet("absence")}>
            <Printer className="size-4" />
            طباعة الغياب
          </Button>
          <Button variant="secondary" size="sm" onClick={() => printSheet("late")}>
            <Printer className="size-4" />
            طباعة التأخر
          </Button>
          <Button variant="secondary" size="sm" onClick={() => printSheet("all")}>
            <Printer className="size-4" />
            طباعة الكل
          </Button>
          <Button variant={showSheet ? "default" : "secondary"} size="sm" onClick={() => setShowSheet((v) => !v)}>
            {showSheet ? "إخفاء الكشف" : "الكشف"}
          </Button>
        </div>
      </div>
    </div>
  );
}
