import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { OfficialLetterhead } from "@/components/print-forms";
import { AppGate } from "@/components/app-gate";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDailyAttendance, saveDailyAttendance } from "@/lib/school/api";
import { formatDay, formatTime, hijriDate, todayLabel } from "@/lib/school/constants";
import { printElement } from "@/lib/school/print";
import { staffCan } from "@/lib/school/permissions";
import type { DailyAttendanceRow, DailyKind } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/attendance")({ component: AttendancePage });

type PrintKind = "all" | "absence" | "late";
type Draft = { kind: DailyKind | "present"; excused: boolean; arrivedAt: string | null };

function todayISO() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
  const queryClient = useQueryClient();
  const sheetRef = useRef<HTMLElement>(null);
  const [day, setDay] = useState(todayISO);
  const allClassIds = useMemo(() => classes.map((c) => c.id), [classes]);
  const [classIds, setClassIds] = useState<number[] | null>(null);
  const [openStages, setOpenStages] = useState<Set<number>>(new Set());
  const selectedIds = classIds ?? allClassIds;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [draft, setDraft] = useState<Record<number, Draft>>({});
  const [printKind, setPrintKind] = useState<PrintKind>("all");
  const [showSheet, setShowSheet] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const dirty = Object.keys(draft).length > 0;
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const blocker = useBlocker({
    shouldBlockFn: () => dirtyRef.current,
    withResolver: true,
    enableBeforeUnload: dirty,
  });

  const can = staffCan(staff, "dailyAttendance");
  const query = useQuery({
    queryKey: ["daily-attendance", day, selectedIds.join(",")],
    queryFn: () =>
      getDailyAttendance({
        data: {
          day,
          classIds: selectedIds,
        },
      }),
    enabled: can,
  });

  const students: DailyAttendanceRow[] = query.data?.students ?? [];

  function stageOn(stageId: number) {
    const ids = classes.filter((c) => c.stageId === stageId).map((c) => c.id);
    return ids.length > 0 && ids.every((id) => selectedSet.has(id));
  }
  function selectStage(stageId: number, on: boolean) {
    const ids = classes.filter((c) => c.stageId === stageId).map((c) => c.id);
    setClassIds(() => {
      const cur = new Set(selectedIds);
      for (const id of ids) on ? cur.add(id) : cur.delete(id);
      return [...cur];
    });
  }
  function toggleStageOpen(stageId: number) {
    setOpenStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId); else next.add(stageId);
      return next;
    });
  }
  function toggleClass(id: number, on: boolean) {
    setClassIds(() => {
      const cur = new Set(selectedIds);
      if (on) cur.add(id);
      else cur.delete(id);
      return [...cur];
    });
  }

  function statusOf(row: DailyAttendanceRow): DailyKind | "present" {
    return draft[row.studentId]?.kind ?? row.kind ?? "present";
  }

  function arrivedOf(row: DailyAttendanceRow): string | null {
    if (draft[row.studentId]?.arrivedAt !== undefined) return draft[row.studentId].arrivedAt;
    return row.arrivedAt;
  }

  const mutation = useMutation({
    mutationFn: () =>
      saveDailyAttendance({
        data: {
          day,
          entries: students.map((s) => {
            const st = statusOf(s);
            return {
              studentId: s.studentId,
              kind: st,
              excused: draft[s.studentId]?.excused ?? s.excused,
              arrivedAt: st === "late" ? arrivedOf(s) ?? isoFromDayTime(day, nowTime()) : undefined,
            };
          }),
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ الغياب اليومي");
      setDraft({});
      void queryClient.invalidateQueries({ queryKey: ["daily-attendance"] });
      void queryClient.invalidateQueries({ queryKey: ["class"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });

  const marked = useMemo(
    () =>
      students.filter((s) => {
        const kind = statusOf(s);
        return kind === "absence" || kind === "late";
      }),
    [students, draft],
  );

  const printRows = marked.filter((s) => {
    const kind = statusOf(s);
    if (printKind === "absence") return kind === "absence";
    if (printKind === "late") return kind === "late";
    return true;
  });

  function printSheet(kind: PrintKind) {
    flushSync(() => setPrintKind(kind));
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

  return (
    <div className="space-y-5">
      <header className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-fg-muted">
            غياب اليوم الكامل أو التأخر الصباحي — غير غياب الحصة الذي يسجّله المعلم في الفصل
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">الغياب اليومي والتأخر</h1>
        </div>
      </header>

      <form className="no-print space-y-4 rounded-[var(--radius-lg)] border border-border bg-card p-4">
        <div className="space-y-1.5 sm:max-w-xs">
          <Label htmlFor="att-day">اليوم</Label>
          <Input id="att-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">الصف</p>
          <div className="flex flex-wrap gap-1.5">
            {stages.map((stage) => {
              const on = stageOn(stage.id);
              const open = openStages.has(stage.id);
              return (
                <div key={stage.id} className="w-full rounded-[var(--radius-sm)] border border-border bg-bg-elevated p-2 sm:w-auto sm:min-w-40">
                  <button type="button" onClick={() => toggleStageOpen(stage.id)} className="flex w-full items-center justify-between gap-3 px-2 py-1.5 text-sm font-semibold">
                    <span>{stage.shortName || stage.name}</span><span className="text-xs text-fg-muted">{open ? "إخفاء" : "عرض الفصول"}</span>
                  </button>
                  {open ? (
                    <div className="mt-2 space-y-2 border-t border-border pt-2">
                      <button type="button" onClick={() => selectStage(stage.id, !on)} className="text-xs font-medium text-primary">{on ? "إلغاء تحديد المرحلة" : "تحديد كل فصول المرحلة"}</button>
                      <div className="flex flex-wrap gap-1.5">
                        {classes.filter((c) => c.stageId === stage.id).map((cls) => {
                          const checked = selectedSet.has(cls.id);
                          return <button key={cls.id} type="button" onClick={() => toggleClass(cls.id, !checked)} className={cn("h-9 rounded-full border px-3 text-xs font-medium", checked ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-fg-muted")}>{cls.label || cls.name}</button>;
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

      </form>

      <ul className="no-print divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
        {students.map((s) => {
          const kind = statusOf(s);
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
                </p>
                <p className="text-xs text-fg-muted">{s.classLabel}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    ["present", "حاضر"],
                    ["late", "تأخر صباحي"],
                    ["absence", "غياب اليوم"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        [s.studentId]: {
                          kind: k,
                          excused: prev[s.studentId]?.excused ?? s.excused,
                          arrivedAt:
                            k === "late"
                              ? prev[s.studentId]?.arrivedAt ?? s.arrivedAt ?? isoFromDayTime(day, nowTime())
                              : null,
                        },
                      }))
                    }
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
                        setDraft((prev) => ({
                          ...prev,
                          [s.studentId]: {
                            kind: "late",
                            excused: prev[s.studentId]?.excused ?? s.excused,
                            arrivedAt: isoFromDayTime(day, e.target.value),
                          },
                        }))
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
        {students.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-fg-muted">لا يوجد طلاب في هذا النطاق</li>
        ) : null}
      </ul>

      <article
        ref={sheetRef}
        className={cn("print-form official-sheet bg-white text-black font-naskh", !showSheet && "hidden")}
      >
        <OfficialLetterhead school={school} />
        <h2 className="mt-2 text-center text-[20px] font-semibold">{printTitle}</h2>
        <p className="text-center text-[13px] text-[#00857c]">
          {todayLabel()} — {hijriDate(`${day}T12:00:00`)} — {formatDay(`${day}T12:00:00`)}
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
              <td className="py-2 text-[16px] font-semibold">{formatDay(`${day}T12:00:00`)}</td>
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
                    <td>
                      {statusOf(s) === "late" && arrivedOf(s) ? formatTime(arrivedOf(s)!) : "—"}
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
        <p className="mt-6 text-center text-[13px] leading-7">
          {school.principalName ? `${school.principalName} — ` : ""}التوقيع: ……………… — الختم
        </p>
      </article>

      <div className="no-print pointer-events-none h-20 md:h-16" />
      <div className="no-print fixed inset-x-0 bottom-[3.6rem] z-30 border-t border-border bg-bg-elevated/95 p-3 backdrop-blur-sm md:bottom-0">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-1">
          <p className="text-xs text-fg-muted">
            {dirty ? "هناك تغييرات غير محفوظة" : "لا تغييرات بانتظار الحفظ"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={showSheet ? "default" : "secondary"}
              onClick={() => setShowSheet((v) => !v)}
            >
              {showSheet ? "إخفاء الكشوف" : "الكشوف"}
            </Button>
            <Button variant="secondary" onClick={() => setPrintOpen(true)}>
              <Printer className="size-4" />
              طباعة
            </Button>
            <Button
              disabled={!dirty || mutation.isPending}
              className={dirty ? "" : "opacity-40"}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "جارٍ الحفظ…" : "حفظ الكشف"}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>طباعة كشف الغياب</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-fg-muted">اختر الكشف المراد طباعته لهذا اليوم.</p>
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => {
                printSheet("late");
                setPrintOpen(false);
              }}
            >
              <Printer className="size-4" />
              طباعة المتأخرين
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                printSheet("absence");
                setPrintOpen(false);
              }}
            >
              <Printer className="size-4" />
              طباعة الغياب
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                printSheet("all");
                setPrintOpen(false);
              }}
            >
              <Printer className="size-4" />
              طباعة الكل
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={blocker.status === "blocked"} onOpenChange={(open) => !open && blocker.reset?.()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>هل تريد حفظ التغيير؟</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-fg-muted">هناك تعديلات في كشف الغياب لم تُحفظ بعد.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="flex-1"
              disabled={mutation.isPending}
              onClick={() => {
                mutation.mutate(undefined, {
                  onSuccess: () => blocker.proceed?.(),
                });
              }}
            >
              حفظ ثم مغادرة
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => blocker.proceed?.()}
            >
              مغادرة دون حفظ
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => blocker.reset?.()}>
              البقاء
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
