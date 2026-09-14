import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { AppGate } from "@/components/app-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
  const [stageId, setStageId] = useState("");
  const [classId, setClassId] = useState("");
  const [draft, setDraft] = useState<Record<number, Draft>>({});
  const [printKind, setPrintKind] = useState<PrintKind>("all");

  const can = staffCan(staff, "dailyAttendance");
  const query = useQuery({
    queryKey: ["daily-attendance", day, classId, stageId],
    queryFn: () =>
      getDailyAttendance({
        data: {
          day,
          classId: classId ? Number(classId) : undefined,
          stageId: stageId ? Number(stageId) : undefined,
        },
      }),
    enabled: can,
  });

  const classOptions = classes.filter((c) => (stageId ? c.stageId === Number(stageId) : true));
  const students: DailyAttendanceRow[] = query.data?.students ?? [];

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

  const gov = school.governorate.replace(/^محافظة\s*/, "").trim();
  const region = school.region.trim();
  const schoolLine = school.name.startsWith("مدرسة") ? school.name : `مدرسة ${school.name}`;
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
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => printSheet("absence")}>
            <Printer className="size-4" />
            طباعة الغياب
          </Button>
          <Button variant="secondary" onClick={() => printSheet("late")}>
            <Printer className="size-4" />
            طباعة التأخر
          </Button>
          <Button variant="secondary" onClick={() => printSheet("all")}>
            <Printer className="size-4" />
            طباعة الكل
          </Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            حفظ الكشف
          </Button>
        </div>
      </header>

      <form className="no-print grid gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="att-day">اليوم</Label>
          <Input id="att-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="att-stage">المرحلة</Label>
          <Select
            id="att-stage"
            value={stageId}
            onChange={(e) => {
              setStageId(e.target.value);
              setClassId("");
            }}
          >
            <option value="">الكل</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="att-class">الفصل</Label>
          <Select id="att-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">الكل</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
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

      <article ref={sheetRef} className="print-form official-sheet bg-white text-black font-naskh">
        <header className="mb-3">
          <div className="official-accent h-1.5 bg-[#00857c]" />
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-1 py-2.5">
            <div className="text-[12px] leading-5">
              <p className="font-semibold">المملكة العربية السعودية</p>
              <p>وزارة التعليم</p>
            </div>
            <div className="flex items-center gap-3">
              <img src="/moe-logo.jpg" alt="" className="h-[58px] w-auto object-contain" />
              {school.logoUrl ? (
                <img src={school.logoUrl} alt="" className="h-[58px] w-auto object-contain" />
              ) : null}
            </div>
            <div className="text-left text-[12px] leading-5">
              <p>{region ? `إدارة التعليم ب${region.replace(/^المنطقة\s*/, "")}` : "إدارة التعليم"}</p>
              {gov ? <p>المحافظة: {gov}</p> : null}
              <p className="font-semibold">{schoolLine}</p>
            </div>
          </div>
          <div className="official-accent h-px bg-[#00857c]" />
          <h2 className="mt-2 text-center text-[20px] font-semibold">{printTitle}</h2>
          <p className="text-center text-[13px] text-[#00857c]">
            {todayLabel()} — {hijriDate(`${day}T12:00:00`)} — {formatDay(`${day}T12:00:00`)}
          </p>
        </header>
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
    </div>
  );
}
