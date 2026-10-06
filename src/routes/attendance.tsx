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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDailyAttendance, logParentMessage, requestClassMove, saveDailyAttendance, updateAppearance } from "@/lib/school/api";
import { getStudentAttendanceDays, listAttendanceDayCounts } from "@/lib/school/attendance-totals";
import { formatPrimaryDate, isoFromDate, weekdayAr, type CalendarKind } from "@/lib/school/calendar";
import { formatTime, toWhatsAppNumber } from "@/lib/school/constants";
import { printElement } from "@/lib/school/print";
import { studentLabel, useLocale, tr } from "@/lib/school/i18n";
import { rangeFromPreset } from "@/components/attendance-roster";
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

function dayCountLabel(n: number) {
  if (n === 1) return tr("1 يوم");
  if (n === 2) return tr("2 يومين");
  if (n >= 3 && n <= 10) return `${n} أيام`;
  return `${n} يوماً`;
}

type HistoryDay = { day: string; kind: DailyKind; arrivedAt: string | null };

function historyLine(row: HistoryDay, calendar: CalendarKind) {
  const date = `${weekdayAr(row.day)} ${formatPrimaryDate(row.day, calendar)}`;
  if (row.kind === "late" && row.arrivedAt) return `${date} — ${formatTime(row.arrivedAt)}`;
  return date;
}

function historyMessage(opts: {
  name: string;
  classLabel: string;
  school: string;
  kind: DailyKind;
  span: string;
  lines: string[];
}) {
  const what = opts.kind === "absence" ? tr("الغياب") : tr("التأخر");
  const head = `السلام عليكم ولي أمر الطالب ${opts.name}،\nنود إعلامكم بأيام ${what} لابنكم في صف ${opts.classLabel} خلال ${opts.span}، وعددها ${dayCountLabel(opts.lines.length)}:\n`;
  const tail = `\nنرجو المتابعة والتواصل مع إدارة المدرسة عند الحاجة.\n\n${opts.school}`;
  const packed = (lines: string[], note = "") => `${head}${note}${lines.join("\n")}${tail}`;
  if (packed(opts.lines).length <= 1900) return packed(opts.lines);
  const note = tr("… وأيام أقدم لم تُذكر لطول الرسالة.\n");
  const kept = [...opts.lines];
  while (kept.length > 1 && packed(kept, note).length > 1900) kept.shift();
  return packed(kept, note).slice(0, 2000);
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
  const historyRef = useRef<HTMLElement>(null);
  const [day, setDay] = useState(todayISO);
  const [stageId, setStageId] = useState<number | null>(stages[0]?.id ?? null);
  const [classId, setClassId] = useState<number | null>(null);
  const [sort, setSort] = useState<ClassSort>("order");
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [historyKind, setHistoryKind] = useState<DailyKind>("absence");
  const [historySpan, setHistorySpan] = useState<"week" | "month" | "term" | "all">("term");
  const [historyDraft, setHistoryDraft] = useState("");
  const [moveClassId, setMoveClassId] = useState("");
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
  const history = useQuery({
    queryKey: ["student-attendance-days", historyId],
    queryFn: () => getStudentAttendanceDays({ data: { studentId: historyId! } }),
    enabled: can && historyId != null,
  });
  const historyBounds = useMemo(() => rangeFromPreset(historySpan), [historySpan]);
  const historySpanText =
    historySpan === "all"
      ? tr("كل الأيام المسجّلة")
      : `${historyBounds.label} (${formatPrimaryDate(historyBounds.from, calendar)} — ${formatPrimaryDate(historyBounds.to, calendar)})`;
  const historyDays = useMemo(() => {
    const all = history.data?.days ?? [];
    return all.filter((row) => {
      const iso = String(row.day).slice(0, 10);
      return row.kind === historyKind && iso >= historyBounds.from && iso <= historyBounds.to;
    });
  }, [history.data, historyKind, historyBounds]);

  useEffect(() => {
    if (!history.data) return;
    const lines = (history.data.days ?? [])
      .filter((row) => {
        const iso = String(row.day).slice(0, 10);
        return row.kind === historyKind && iso >= historyBounds.from && iso <= historyBounds.to;
      })
      .map((row) => historyLine(row, calendar));
    setHistoryDraft(
      historyMessage({
        name: history.data.studentName,
        classLabel: history.data.classLabel,
        school: school.name,
        kind: historyKind,
        span: historySpan === "all" ? tr("كل المدة المسجّلة") : historyBounds.label,
        lines,
      }),
    );
  }, [history.data, historyKind, historyBounds, historySpan, calendar, school.name]);

  useEffect(() => {
    setLocal({});
  }, [day]);

  const students: DailyAttendanceRow[] = (query.data as { students?: DailyAttendanceRow[] } | undefined)?.students ?? [];

  function statusOf(row: DailyAttendanceRow): DailyKind | "present" {
    return local[row.studentId]?.kind ?? row.kind ?? "present";
  }

  function dayTotals(row: DailyAttendanceRow) {
    const found = totals.data?.counts.find((item) => item.studentId === row.studentId);
    let absenceDays = found?.absenceDays ?? 0;
    let lateDays = found?.lateDays ?? 0;
    const saved = row.kind;
    const now = statusOf(row);
    if (saved !== now) {
      if (saved === "absence") absenceDays -= 1;
      if (saved === "late") lateDays -= 1;
      if (now === "absence") absenceDays += 1;
      if (now === "late") lateDays += 1;
    }
    return {
      absenceDays: Math.max(0, absenceDays),
      lateDays: Math.max(0, lateDays),
    };
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
        const kind = statusOf(s);
        return kind === "absence" || kind === "late";
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

  const canMessage = staffCan(staff, "sendMessages");
  const historyPhone = history.data?.parentPhone ?? "";
  const historyNumber = toWhatsAppNumber(historyPhone);

  function printHistory() {
    if (!historyRef.current || historyDays.length === 0) return;
    printElement(historyRef.current);
  }

  async function sendHistory() {
    if (!history.data || !historyNumber || !historyDraft.trim()) return;
    try {
      await logParentMessage({
        data: {
          studentId: history.data.studentId,
          kind: historyKind,
          body: historyDraft.trim(),
          parentPhone: historyPhone,
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? tr(err.message) : tr("تعذر حفظ الرسالة"));
      return;
    }
    window.open(
      `https://wa.me/${historyNumber}?text=${encodeURIComponent(historyDraft.trim())}`,
      "_blank",
      "noopener,noreferrer",
    );
    toast.success(tr("فُتحت واتساب وحُفظت الرسالة في السجل"));
  }

  const moveClass = useMutation({
    mutationFn: () =>
      requestClassMove({
        data: { studentId: historyId!, classId: Number(moveClassId) },
      }),
    onSuccess: (result) => {
      if (result.applied) {
        toast.success(`تم نقل الطالب إلى ${result.toLabel}`);
        void queryClient.invalidateQueries({ queryKey: ["daily-attendance"] });
        void queryClient.invalidateQueries({ queryKey: ["student-attendance-days"] });
        void queryClient.invalidateQueries({ queryKey: ["attendance-roster"] });
      } else {
        toast.success(`أُرسل طلب النقل إلى ${result.count}`);
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }
      setMoveClassId("");
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر إرسال الطلب")),
  });

  if (!can) {
    return <p className="text-fg-muted">{tr("تسجيل الغياب اليومي متاح لمسجل الغياب ولمن مُنح الصلاحية.")}</p>;
  }

  const printTitle =
    printKind === "absence"
      ? tr("كشف الغياب اليومي")
      : printKind === "late"
        ? tr("كشف التأخر الصباحي")
        : tr("كشف الغياب اليومي والتأخر الصباحي");
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
      <header className="no-print space-y-1">
        <p className="text-sm text-fg-muted">{tr("غياب اليوم أو التأخر عن الاصطفاف. الضغط مرة ثانية يلغي التحديد.")}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{tr("الغياب اليومي")}</h1>
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
          const days = dayTotals(s);
          return (
            <li key={s.studentId} className="px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryKind(kind === "late" ? "late" : "absence");
                      setHistoryId(s.studentId);
                    }}
                    className={cn(
                      "block w-full truncate text-right text-base font-semibold leading-6 hover:underline",
                      kind === "absence" && "text-danger",
                      kind === "late" && "text-warn",
                    )}
                  >
                    {studentLabel(locale, s.studentName, s.nameEn)}
                    {saving ? <span className="ms-2 text-xs font-normal text-fg-muted">{tr("يُحفظ…")}</span> : null}
                  </button>
                  <p className="truncate text-xs text-fg-muted">{s.classLabel}</p>
                </div>
                <div className="flex shrink-0 items-start gap-1">
                  {(
                    [
                      ["late", tr("تأخر"), days.lateDays, "text-warn"],
                      ["absence", tr("غياب"), days.absenceDays, "text-danger"],
                    ] as const
                  ).map(([k, label, count, tone]) => (
                    <div key={k} className="flex flex-col items-center">
                      <button
                        type="button"
                        aria-pressed={kind === k}
                        onClick={() => void persist(s, kind === k ? "present" : k)}
                        className={cn(
                          "h-10 rounded-full border px-2.5 text-sm font-medium",
                          kind === k
                            ? k === "late"
                              ? "border-warn bg-warn-soft text-warn"
                              : "border-danger bg-danger-soft text-danger"
                            : "border-border bg-bg-elevated text-fg-muted",
                        )}
                      >
                        {label}
                      </button>
                      <span
                        title={`${count} أيام`}
                        className={cn("mt-0.5 text-[10px] leading-3 tabular-nums", count > 0 ? tone : "text-fg-subtle")}
                      >
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {kind === "late" ? (
                <label className="mt-2 flex h-10 w-fit items-center gap-1.5 rounded-full border border-warn bg-warn-soft px-3 text-xs text-warn">
                  {tr("وقت الحضور")}
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
              {printKind !== "late" ? <th>{tr("عدد الغائبين")}</th> : null}
              {printKind !== "absence" ? <th>{tr("عدد المتأخرين")}</th> : null}
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
              <th className="w-10">{tr("م")}</th>
              <th>{tr("اسم الطالب")}</th>
              <th>{tr("الصف")}</th>
              <th>{tr("النوع")}</th>
              {printKind !== "absence" ? <th>{tr("وقت الحضور")}</th> : null}
            </tr>
          </thead>
          <tbody>
            {sheetNames.length === 0 ? (
              <tr>
                <td colSpan={printKind === "absence" ? 4 : 5} className="py-8">
                  {printKind === "absence"
                    ? tr("لا يوجد غائبون في هذا النطاق.")
                    : printKind === "late"
                      ? tr("لا يوجد متأخرون في هذا النطاق.")
                      : tr("لا يوجد غائبون أو متأخرون في هذا النطاق.")}
                </td>
              </tr>
            ) : (
              sheetNames.map((s, i) => (
                <tr key={s.studentId}>
                  <td>{i + 1}</td>
                  <td className="text-[15px] font-semibold">{studentLabel(locale, s.studentName, s.nameEn)}</td>
                  <td>{s.classLabel}</td>
                  <td>{s.kind === "late" ? tr("تأخر صباحي") : tr("غياب اليوم الكامل")}</td>
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
            <DialogTitle>{tr("طباعة الكشف")}</DialogTitle>
            <DialogDescription>{tr("اختر نوع الكشف ونطاق المراحل، ثم اطبع. التسجيل على الشاشة لا يتغير.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold">{tr("نوع الكشف")}</p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["absence", tr("الغياب")],
                    ["late", tr("التأخر")],
                    ["all", tr("الكل")],
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
                    "min-h-11 rounded-full border px-3 text-sm font-medium",
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

      <Dialog open={historyId != null} onOpenChange={(open) => { if (!open) { setHistoryId(null); setMoveClassId(""); } }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{history.data?.studentName ?? tr("أيام الطالب")}</DialogTitle>
            <DialogDescription>
              {history.data?.classLabel
                ? `${history.data.classLabel} — طباعة أيام المدة في صفحة واحدة`
                : tr("طباعة أيام الغياب أو التأخر حسب المدة")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["absence", tr("أيام الغياب")],
                ["late", tr("أيام التأخر")],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => setHistoryKind(kind)}
                className={cn(
                  "min-h-11 rounded-[var(--radius-md)] border text-sm font-semibold",
                  historyKind === kind
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-bg text-fg",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["week", tr("أسبوع")],
                ["month", tr("شهر")],
                ["term", tr("ترم")],
                ["all", tr("الكل")],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setHistorySpan(key)}
                className={cn(
                  "h-9 rounded-full border px-3 text-sm font-medium",
                  historySpan === key
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-bg text-fg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-fg-muted">{historySpanText}</p>
          {history.isPending ? (
            <p className="text-sm text-fg-muted">{tr("جارٍ التحميل…")}</p>
          ) : historyDays.length === 0 ? (
            <p className="text-sm text-fg-muted">
              {historyKind === "absence" ? tr("لا أيام غياب في هذه المدة.") : tr("لا أيام تأخر في هذه المدة.")}
            </p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-[var(--radius-md)] border border-border px-3 py-2 text-sm">
              {historyDays.map((row) => (
                <li key={`${row.kind}-${row.day}`}>{historyLine(row, calendar)}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-fg-muted">المجموع: {dayCountLabel(historyDays.length)}</p>
          <Textarea
            className="min-h-36"
            value={historyDraft}
            onChange={(e) => setHistoryDraft(e.target.value)}
            aria-label={tr("نص الرسالة")}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" disabled={historyDays.length === 0} onClick={printHistory}>
              <Printer className="size-4" />
              {tr("طباعة")}
            </Button>
            {canMessage ? (
              <Button type="button" disabled={!historyNumber || historyDays.length === 0 || !historyDraft.trim()} onClick={() => void sendHistory()}>
                {tr("إرسال لولي الأمر")}
              </Button>
            ) : null}
          </div>
          {canMessage && history.data && !historyNumber ? (
            <p className="text-xs text-fg-muted">{tr("لا يوجد رقم جوال محفوظ لولي الأمر.")}</p>
          ) : null}
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-sm font-semibold">{tr("طلب تغيير الفصل")}</p>
            <Select value={moveClassId} onChange={(e) => setMoveClassId(e.target.value)} aria-label={tr("الفصل الجديد")}>
              <option value="">{tr("اختر الفصل الجديد")}</option>
              {classes
                .filter((item) => item.id !== history.data?.classId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {tr(item.label)}
                  </option>
                ))}
            </Select>
            <Button
              type="button"
              className="w-full"
              disabled={!historyId || !moveClassId || moveClass.isPending}
              onClick={() => moveClass.mutate()}
            >
              {moveClass.isPending ? tr("جارٍ الإرسال…") : tr("إرسال لمن يعدّل بيانات الطلاب")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <article
        ref={historyRef}
        className="print-form print-report attendance-print official-sheet hidden bg-white font-naskh text-black"
      >
        <OfficialLetterhead school={school} />
        <h2 className="mt-2 text-center text-[18px] font-semibold">
          {historyKind === "absence" ? tr("كشف أيام الغياب") : tr("كشف أيام التأخر")}
        </h2>
        <p className="student-print-line">
          <strong>{history.data?.studentName ?? ""}</strong>
          {history.data?.classLabel ? <span> · {history.data.classLabel}</span> : null}
          <span> · {historySpan === "all" ? tr("كل المدة") : historyBounds.label}</span>
          <span> · المجموع: {dayCountLabel(historyDays.length)}</span>
        </p>
        <table className="official-table">
          <thead>
            <tr>
              <th className="w-10">{tr("م")}</th>
              <th>{tr("اليوم والتاريخ")}</th>
              {historyKind === "late" ? <th>{tr("وقت الحضور")}</th> : null}
            </tr>
          </thead>
          <tbody>
            {historyDays.length === 0 ? (
              <tr>
                <td colSpan={historyKind === "late" ? 3 : 2}>{tr("لا أيام مسجّلة.")}</td>
              </tr>
            ) : (
              historyDays.map((row, index) => (
                <tr key={`${row.kind}-${row.day}`}>
                  <td>{index + 1}</td>
                  <td>{weekdayAr(row.day)} {formatPrimaryDate(row.day, calendar)}</td>
                  {historyKind === "late" ? <td>{row.arrivedAt ? formatTime(row.arrivedAt) : "—"}</td> : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </article>
    </div>
  );
}
