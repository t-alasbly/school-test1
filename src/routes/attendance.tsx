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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

  function scopeText() {
    if (printAll) return "كل المراحل";
    return printStageIds
      .map((id) => stages.find((s) => s.id === id)?.name)
      .filter(Boolean)
      .join(" · ");
  }

  function withDrafts(rows: DailyAttendanceRow[]) {
    return rows.map((row) => {
      const draft = local[row.studentId];
      if (!draft) return row;
      return {
        ...row,
        kind: draft.kind === "present" ? null : draft.kind,
        excused: draft.excused,
        arrivedAt: draft.kind === "late" ? draft.arrivedAt : null,
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
      toast.error("اختر كل المراحل، أو مرحلة، أو مرحلتين.");
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
      toast.error(err instanceof Error ? err.message : "تعذر تجهيز الكشف");
      return false;
    } finally {
      setBusyPrint(false);
    }
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
  const sheetNames = sheetRows.filter((s) => {
    if (printKind === "absence") return s.kind === "absence";
    if (printKind === "late") return s.kind === "late";
    return s.kind === "absence" || s.kind === "late";
  });
  const sheetAbsenceCount = sheetRows.filter((s) => s.kind === "absence").length;
  const sheetLateCount = sheetRows.filter((s) => s.kind === "late").length;

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
        actions={
          <>
            <Button type="button" size="sm" variant="secondary" className="h-8 px-2 text-[11px]" onClick={() => setPrintOpen(true)}>
              <Printer className="size-3.5" />
              طباعة
            </Button>
            {showSheet ? (
              <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-[11px]" onClick={() => setShowSheet(false)}>
                إخفاء
              </Button>
            ) : null}
          </>
        }
      />
      <header className="no-print space-y-1">
        <p className="text-sm text-fg-muted">حضور أو غياب اليوم أو التأخر عن الاصطفاف</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">الغياب اليومي</h1>
      </header>
      <div className="no-print">
        <DayField
          value={day}
          onChange={setDay}
          calendar={calendar}
          onCalendar={(next) => saveCalendar.mutate(next)}
        />
      </div>
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
            <li key={s.studentId} className="px-3 py-2.5">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-base font-semibold leading-6",
                      kind === "absence" && "text-danger",
                      kind === "late" && "text-warn",
                    )}
                  >
                    {s.studentName}
                    {saving ? <span className="ms-2 text-xs font-normal text-fg-muted">يُحفظ…</span> : null}
                  </p>
                  <p className="truncate text-xs text-fg-muted">{s.classLabel}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
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
                        "h-10 rounded-full border px-2.5 text-sm font-medium",
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
                </div>
              </div>
              {kind === "late" ? (
                <label className="mt-2 flex h-10 w-fit items-center gap-1.5 rounded-full border border-warn bg-warn-soft px-3 text-xs text-warn">
                  وقت الحضور
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
        <p className="text-center text-[15px] font-semibold">{sheetScope || "—"}</p>
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
                <td className="text-[16px] font-semibold">{sheetAbsenceCount}</td>
              ) : null}
              {printKind !== "absence" ? (
                <td className="text-[16px] font-semibold">{sheetLateCount}</td>
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
            {sheetNames.length === 0 ? (
              <tr>
                <td colSpan={printKind === "absence" ? 4 : 5} className="py-8">
                  {printKind === "absence"
                    ? "لا يوجد غائبون في هذا النطاق."
                    : printKind === "late"
                      ? "لا يوجد متأخرون في هذا النطاق."
                      : "لا يوجد غائبون أو متأخرون في هذا النطاق."}
                </td>
              </tr>
            ) : (
              sheetNames.map((s, i) => (
                <tr key={s.studentId}>
                  <td>{i + 1}</td>
                  <td className="text-[15px] font-semibold">{s.studentName}</td>
                  <td>{s.classLabel}</td>
                  <td>{s.kind === "late" ? "تأخر صباحي" : "غياب اليوم الكامل"}</td>
                  {printKind !== "absence" ? (
                    <td>{s.kind === "late" && s.arrivedAt ? formatTime(s.arrivedAt) : "—"}</td>
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

      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>طباعة الكشف</DialogTitle>
            <DialogDescription>اختر نوع الكشف ونطاق المراحل، ثم اطبع. التسجيل على الشاشة لا يتغير.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold">نوع الكشف</p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["absence", "الغياب"],
                    ["late", "التأخر"],
                    ["all", "الكل"],
                  ] as const
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setPrintKind(kind)}
                    className={cn(
                      "min-h-11 rounded-[var(--radius-md)] border text-sm font-semibold",
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
              <p className="text-sm font-semibold">المراحل</p>
              <p className="text-xs text-fg-muted">كل المراحل، أو مرحلة واحدة، أو مرحلتين.</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setPrintAll(true);
                    setPrintStageIds([]);
                  }}
                  className={cn(
                    "min-h-11 rounded-full border px-3 text-sm font-medium",
                    printAll ? "border-primary bg-primary/5 text-primary" : "border-border bg-bg text-fg",
                  )}
                >
                  كل المراحل
                </button>
                {stages.map((stage) => {
                  const on = !printAll && printStageIds.includes(stage.id);
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => togglePrintStage(stage.id)}
                      className={cn(
                        "min-h-11 rounded-full border px-3 text-sm font-medium",
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
                {busyPrint ? "جارٍ…" : "طباعة"}
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
    </div>
  );
}
