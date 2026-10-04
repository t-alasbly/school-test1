import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { OfficialLetterhead } from "@/components/print-forms";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listAttendanceRoster, logParentMessage } from "@/lib/school/api";
import { getStudentAttendanceDays } from "@/lib/school/attendance-totals";
import { weekdayAr } from "@/lib/school/calendar";
import { formatDay, formatTime, hijriDate, todayLabel, toWhatsAppNumber } from "@/lib/school/constants";
import { staffCan } from "@/lib/school/permissions";
import { printElement } from "@/lib/school/print";
import { useWorkspace } from "@/lib/school/workspace";

export type RosterKind = "absence" | "late";

function isoToday() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthStart(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

/** الفصلان الدراسيان للعام 1448 حسب تقويم وزارة التعليم. */
function currentTerm(today: string) {
  if (today < "2027-01-17") {
    const from = "2026-08-23";
    const end = "2027-01-09";
    const to = today < from ? from : today < end ? today : end;
    return { from, to, label: "الفصل الدراسي الأول" };
  }
  const from = "2027-01-17";
  const end = "2027-06-24";
  const to = today < end ? today : end;
  return { from, to, label: "الفصل الدراسي الثاني" };
}

export function rangeFromPreset(preset: string | undefined): { from: string; to: string; label: string } {
  const today = isoToday();
  if (preset === "week") return { from: addDays(today, -6), to: today, label: "أسبوع" };
  if (preset === "month") return { from: monthStart(today), to: today, label: "شهر" };
  if (preset === "term") {
    const term = currentTerm(today);
    return { from: term.from, to: term.to, label: term.label };
  }
  if (preset === "all") return { from: "2000-01-01", to: today, label: "كل المدة" };
  return { from: today, to: today, label: "اليوم" };
}

function dayCountLabel(n: number) {
  if (n === 1) return "1 يوم";
  if (n === 2) return "2 يومين";
  if (n >= 3 && n <= 10) return `${n} أيام`;
  return `${n} يوماً`;
}

const GREG_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

type DayMark = { day: string; extra: string };

function splitIso(iso: string) {
  const [year = "", month = "", date = ""] = iso.slice(0, 10).split("-");
  return { year, month, date: String(Number(date) || date), key: `${year}-${month}` };
}

/** أرقام أيام الشهر بين قوسين، ثم اسم الشهر. كل شهر سطر. */
export function compactMonthLines(days: DayMark[]): string[] {
  const buckets = new Map<string, { name: string; year: string; items: string[] }>();
  for (const mark of [...days].sort((a, b) => a.day.localeCompare(b.day))) {
    const part = splitIso(mark.day);
    const name = GREG_MONTHS[Number(part.month) - 1] || part.month;
    const bucket = buckets.get(part.key) ?? { name, year: part.year, items: [] };
    bucket.items.push(mark.extra ? `${part.date} · ${mark.extra}` : part.date);
    buckets.set(part.key, bucket);
  }
  const multiYear = new Set([...buckets.values()].map((bucket) => bucket.year)).size > 1;
  return [...buckets.values()].map(
    (bucket) => `(${bucket.items.join("، ")}) ${multiYear ? `${bucket.name} ${bucket.year}` : bucket.name}`,
  );
}

export function MonthDays({ days }: { days: DayMark[] }) {
  const lines = compactMonthLines(days);
  if (lines.length === 0) return null;
  return (
    <span className="block text-right leading-6">
      {lines.map((line, index) => (
        <span key={`${line}-${index}`} className="block">
          {line}
        </span>
      ))}
    </span>
  );
}

type StudentGroup = {
  studentId: number;
  studentName: string;
  classLabel: string;
  days: DayMark[];
  count: number;
};

function isPeriodDetails(details: string) {
  return details.includes("حصة");
}

function groupStudents(list: Row[], withTime: boolean): StudentGroup[] {
  const map = new Map<number, { studentId: number; studentName: string; classLabel: string; days: Map<string, string[]> }>();
  for (const row of list) {
    const day = String(row.day).slice(0, 10);
    const current = map.get(row.studentId) ?? {
      studentId: row.studentId,
      studentName: row.studentName,
      classLabel: row.classLabel,
      days: new Map<string, string[]>(),
    };
    const bits = current.days.get(day) ?? [];
    const extra = [withTime && row.arrivedAt ? formatTime(row.arrivedAt) : "", row.excused ? "بعذر" : ""]
      .filter(Boolean)
      .join(" ");
    if (extra && !bits.includes(extra)) bits.push(extra);
    current.days.set(day, bits);
    map.set(row.studentId, current);
  }
  return [...map.values()]
    .map((group) => {
      const days = [...group.days.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, bits]) => ({
          day,
          extra: bits.join("، "),
        }));
      return {
        studentId: group.studentId,
        studentName: group.studentName,
        classLabel: group.classLabel,
        days,
        count: days.length,
      };
    })
    .sort((a, b) => a.classLabel.localeCompare(b.classLabel, "ar") || a.studentName.localeCompare(b.studentName, "ar"));
}

type FullDay = { day: string; arrivedAt: string | null };

function fullDate(iso: string) {
  const part = splitIso(iso);
  const month = GREG_MONTHS[Number(part.month) - 1] || part.month;
  return `${weekdayAr(iso)} ${part.date} ${month} ${part.year}`;
}

function parentDaysMessage(opts: { name: string; classLabel: string; school: string; kind: RosterKind; lines: string[] }) {
  const what = opts.kind === "absence" ? "الغياب" : "التأخر";
  const head = `السلام عليكم ولي أمر الطالب ${opts.name}،\nنود إعلامكم بأيام ${what} لابنكم في صف ${opts.classLabel}، وعددها ${dayCountLabel(opts.lines.length)}:\n`;
  const tail = `\nنرجو المتابعة والتواصل مع إدارة المدرسة عند الحاجة.\n\n${opts.school}`;
  const packed = (lines: string[], note = "") => `${head}${note}${lines.join("\n")}${tail}`;
  if (opts.lines.length === 0) return packed([]);
  if (packed(opts.lines).length <= 1900) return packed(opts.lines);
  const note = "… وأيام أقدم لم تُذكر لطول الرسالة.\n";
  const kept = [...opts.lines];
  while (kept.length > 1 && packed(kept, note).length > 1900) kept.shift();
  return packed(kept, note).slice(0, 2000);
}

function StudentDaysTable({ days, kind, print = false }: { days: FullDay[]; kind: RosterKind; print?: boolean }) {
  return (
    <table className={print ? "official-table" : "w-full border-collapse text-sm"}>
      <thead>
        <tr className={print ? undefined : "border-b border-border text-right text-fg-muted"}>
          <th className="w-10 py-2 text-right">م</th>
          <th className="py-2 text-right">التاريخ</th>
          {kind === "late" ? <th className="py-2 text-right">وقت الحضور</th> : null}
        </tr>
      </thead>
      <tbody>
        {days.map((row, index) => (
          <tr key={row.day} className={print ? undefined : "border-b border-border"}>
            <td className="py-1.5">{index + 1}</td>
            <td className="py-1.5 text-right">{fullDate(row.day)}</td>
            {kind === "late" ? <td>{row.arrivedAt ? formatTime(row.arrivedAt) : "—"}</td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type Row = {
  day: string;
  studentId: number;
  studentName: string;
  classLabel: string;
  excused: boolean;
  arrivedAt: string | null;
  details: string;
};

export function AttendanceRoster({
  kind,
  initialRange,
}: {
  kind: RosterKind;
  initialRange?: string;
}) {
  const { school, staff } = useWorkspace();
  const sheetRef = useRef<HTMLElement>(null);
  const bounds = rangeFromPreset(initialRange);
  const [from, setFrom] = useState(bounds.from);
  const [to, setTo] = useState(bounds.to);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const detailRef = useRef<HTMLElement>(null);
  const title = kind === "absence" ? "كشف الغائبين" : "كشف المتأخرين";

  const query = useQuery({
    queryKey: ["attendance-roster", kind, from, to],
    queryFn: () => listAttendanceRoster({ data: { kind, from, to } }),
  });

  const rows: Row[] = useMemo(() => {
    const list: Row[] = (query.data as { rows?: Row[] } | undefined)?.rows ?? [];
    const term = q.trim();
    if (!term) return list;
    return list.filter((r) => r.studentName.includes(term) || r.classLabel.includes(term));
  }, [query.data, q]);

  const groups = useMemo(
    () => groupStudents(rows.filter((row) => !isPeriodDetails(row.details)), kind === "late"),
    [rows, kind],
  );
  const detail = useQuery({
    queryKey: ["student-attendance-days", openId],
    queryFn: () => getStudentAttendanceDays({ data: { studentId: openId! } }),
    enabled: openId != null,
  });
  const detailDays = useMemo(() => {
    const list = detail.data?.days ?? [];
    return list.filter((row) => row.kind === kind).sort((a, b) => a.day.localeCompare(b.day));
  }, [detail.data, kind]);
  const canMessage = staffCan(staff, "sendMessages");
  const parentPhone = detail.data?.parentPhone ?? "";
  const parentNumber = toWhatsAppNumber(parentPhone);

  useEffect(() => {
    if (!detail.data || openId == null) return;
    const lines = detailDays.map((row) =>
      kind === "late" && row.arrivedAt ? `${fullDate(row.day)} — ${formatTime(row.arrivedAt)}` : fullDate(row.day),
    );
    setDraft(
      parentDaysMessage({
        name: detail.data.studentName,
        classLabel: detail.data.classLabel,
        school: school.name,
        kind,
        lines,
      }),
    );
  }, [detail.data, detailDays, kind, openId, school.name]);

  async function sendParent() {
    if (!detail.data || !parentNumber || !draft.trim()) return;
    try {
      await logParentMessage({
        data: {
          studentId: detail.data.studentId,
          kind,
          body: draft.trim(),
          parentPhone,
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر حفظ الرسالة");
      return;
    }
    window.open(`https://wa.me/${parentNumber}?text=${encodeURIComponent(draft.trim())}`, "_blank", "noopener,noreferrer");
    toast.success("فُتحت واتساب وحُفظت الرسالة في السجل");
  }
  const dayTotal = groups.reduce((sum, group) => sum + group.count, 0);
  const emptyText = kind === "absence" ? "لا يوجد غياب يومي في هذا النطاق." : "لا يوجد تأخر صباحي في هذا النطاق.";

  const days = from === to ? formatDay(`${from}T12:00:00`) : `${formatDay(`${from}T12:00:00`)} — ${formatDay(`${to}T12:00:00`)}`;

  return (
    <div className="space-y-5">
      <header className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-fg-muted">
            {kind === "absence"
              ? "الغياب اليومي فقط. كل طالب يظهر مرة مع عدد أيام غيابه في المدة."
              : "التأخر اليومي فقط. كل طالب يظهر مرة مع عدد أيام تأخره في المدة."}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        </div>
        <Button
          variant="secondary"
          onClick={() => sheetRef.current && printElement(sheetRef.current)}
        >
          <Printer className="size-4" />
          طباعة الكشف
        </Button>
      </header>

      <form className="no-print grid gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${kind}-from`}>من</Label>
          <Input id={`${kind}-from`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${kind}-to`}>إلى</Label>
          <Input id={`${kind}-to`} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${kind}-q`}>طالب أو فصل</Label>
          <Input
            id={`${kind}-q`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="اسم الطالب أو الفصل"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 sm:col-span-2 lg:col-span-4">
          {(
            [
              ["today", "اليوم"],
              ["week", "أسبوع"],
              ["month", "شهر"],
              ["all", "الكل"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                const next = rangeFromPreset(key);
                setFrom(next.from);
                setTo(next.to);
              }}
              className="h-10 rounded-full border border-border bg-bg-elevated px-3 text-sm font-medium text-fg-muted hover:border-primary hover:text-primary"
            >
              {label}
            </button>
          ))}
        </div>
      </form>

      <p className="no-print text-sm text-fg-muted">
        {groups.length} طالب · {dayCountLabel(dayTotal)}
      </p>
      <ul className="no-print divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
        {groups.map((group) => (
          <li key={group.studentId} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <button
                  type="button"
                  className="text-right font-semibold hover:text-primary hover:underline"
                  onClick={() => setOpenId(group.studentId)}
                >
                  {group.studentName}
                </button>
                <p className="text-xs text-fg-muted">{group.classLabel}</p>
              </div>
              <span
                className={
                  kind === "absence"
                    ? "shrink-0 rounded-full bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger"
                    : "shrink-0 rounded-full bg-warn-soft px-2.5 py-1 text-xs font-semibold text-warn"
                }
              >
                {dayCountLabel(group.count)}
              </span>
            </div>
            <div className="mt-1 text-xs text-fg-muted">
              <MonthDays days={group.days} />
            </div>
          </li>
        ))}
        {query.isPending ? (
          <li className="px-4 py-8 text-center text-sm text-fg-muted">جارٍ التحميل…</li>
        ) : groups.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-fg-muted">{emptyText}</li>
        ) : null}
      </ul>

      <article ref={sheetRef} className="print-form attendance-print official-sheet bg-white text-black font-naskh">
        <OfficialLetterhead school={school} />
        <h2 className="mt-2 text-center text-[20px] font-semibold">{title}</h2>
        <p className="text-center text-[13px] text-[#00857c]">
          {todayLabel()} — {hijriDate(`${to}T12:00:00`)} — {days}
        </p>
        <table className="official-table mb-3">
          <thead>
            <tr>
              <th>الفترة</th>
              <th>الطلاب</th>
              <th>عدد الأيام</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 text-[15px] font-semibold">{days}</td>
              <td className="text-[16px] font-semibold">{groups.length}</td>
              <td className="text-[16px] font-semibold">{dayTotal}</td>
            </tr>
          </tbody>
        </table>
        <table className="official-table">
          <thead>
            <tr>
              <th className="w-10">م</th>
              <th>اسم الطالب</th>
              <th>الصف</th>
              <th className="w-16">عدد الأيام</th>
              <th>الأيام</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6">{emptyText}</td>
              </tr>
            ) : (
              groups.map((group, i) => (
                <tr key={group.studentId}>
                  <td>{i + 1}</td>
                  <td className="text-[15px] font-semibold">{group.studentName}</td>
                  <td>{group.classLabel}</td>
                  <td className="font-semibold">{group.count}</td>
                  <td className="text-right align-top text-[12px]"><MonthDays days={group.days} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <p className="mt-6 text-center text-[13px] leading-7">
          {school.principalName ? `${school.principalName} — ` : ""}التوقيع: ……………… — الختم
        </p>
      </article>

      <Dialog open={openId != null} onOpenChange={(open) => { if (!open) setOpenId(null); }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail.data?.studentName ?? "أيام الطالب"}</DialogTitle>
            <DialogDescription>
              {detail.data?.classLabel
                ? `${detail.data.classLabel} — كل أيام ${kind === "absence" ? "الغياب اليومي" : "التأخر اليومي"}`
                : "كل الأيام المسجّلة لهذا الطالب"}
            </DialogDescription>
          </DialogHeader>
          {detail.isPending ? (
            <p className="text-sm text-fg-muted">جارٍ التحميل…</p>
          ) : detail.isError ? (
            <p className="text-sm text-danger">تعذر تحميل أيام الطالب.</p>
          ) : detailDays.length === 0 ? (
            <p className="text-sm text-fg-muted">لا توجد أيام مسجّلة لهذا الطالب.</p>
          ) : (
            <>
              <p className="text-sm text-fg-muted">المجموع: {dayCountLabel(detailDays.length)}</p>
              <div className="max-h-64 overflow-y-auto rounded-[var(--radius-md)] border border-border">
                <StudentDaysTable days={detailDays} kind={kind} />
              </div>
              {canMessage ? (
                <Textarea
                  className="min-h-32"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label="نص الرسالة"
                />
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" className="min-w-36 flex-1" onClick={() => detailRef.current && printElement(detailRef.current)}>
                  <Printer className="size-4" />
                  طباعة
                </Button>
                {canMessage ? (
                  <Button type="button" className="min-w-36 flex-1" disabled={!parentNumber || !draft.trim()} onClick={() => void sendParent()}>
                    إرسال لولي الأمر
                  </Button>
                ) : null}
              </div>
              {canMessage && !parentNumber ? (
                <p className="text-xs text-fg-muted">لا يوجد رقم جوال محفوظ لولي الأمر.</p>
              ) : null}
            </>
          )}
        </DialogContent>
      </Dialog>

      <article ref={detailRef} className="print-form print-report attendance-print official-sheet hidden bg-white font-naskh text-black">
        <OfficialLetterhead school={school} />
        <h2 className="mt-2 text-center text-[18px] font-semibold">
          {kind === "absence" ? "كشف غياب الطالب" : "كشف تأخر الطالب"}
        </h2>
        <p className="student-print-line">
          <strong>{detail.data?.studentName ?? ""}</strong>
          {detail.data?.classLabel ? <span> · {detail.data.classLabel}</span> : null}
          <span> · المجموع: {dayCountLabel(detailDays.length)}</span>
        </p>
        {detailDays.length === 0 ? (
          <p className="py-6 text-center">لا توجد أيام مسجّلة.</p>
        ) : (
          <StudentDaysTable days={detailDays} kind={kind} print />
        )}
      </article>
    </div>
  );
}
