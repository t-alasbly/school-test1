import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { OfficialLetterhead } from "@/components/print-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listAttendanceRoster } from "@/lib/school/api";
import { formatDay, formatTime, hijriDate, todayLabel } from "@/lib/school/constants";
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

export function rangeFromPreset(preset: string | undefined): { from: string; to: string } {
  const today = isoToday();
  if (preset === "week") return { from: addDays(today, -6), to: today };
  if (preset === "month") return { from: monthStart(today), to: today };
  if (preset === "all") return { from: "2000-01-01", to: today };
  return { from: today, to: today };
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
  const { school } = useWorkspace();
  const sheetRef = useRef<HTMLElement>(null);
  const bounds = rangeFromPreset(initialRange);
  const [from, setFrom] = useState(bounds.from);
  const [to, setTo] = useState(bounds.to);
  const [q, setQ] = useState("");
  const title = kind === "absence" ? "كشف الغائبين" : "كشف المتأخرين";

  const query = useQuery({
    queryKey: ["attendance-roster", kind, from, to],
    queryFn: () => listAttendanceRoster({ data: { kind, from, to } }),
  });

  const rows: Row[] = useMemo(() => {
    const list: Row[] = query.data?.rows ?? [];
    const term = q.trim();
    if (!term) return list;
    return list.filter((r) => r.studentName.includes(term) || r.classLabel.includes(term));
  }, [query.data, q]);

  const days = from === to ? formatDay(`${from}T12:00:00`) : `${formatDay(`${from}T12:00:00`)} — ${formatDay(`${to}T12:00:00`)}`;

  return (
    <div className="space-y-5">
      <header className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-fg-muted">
            {kind === "absence" ? "كل الغياب اليومي — يوم واحد أو فترة أو طالب" : "كل التأخر الصباحي — يوم واحد أو فترة أو طالب"}
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

      <p className="no-print text-sm text-fg-muted">{rows.length} سجل</p>

      <ul className="no-print divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
        {rows.map((row, i) => (
          <li key={`${row.studentId}-${row.day}-${i}`} className="flex flex-wrap items-center gap-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{row.studentName}</p>
              <p className="text-xs text-fg-muted">
                {row.classLabel} · {formatDay(`${row.day}T12:00:00`)}
                {row.excused ? " · بعذر" : ""}
              </p>
            </div>
            {kind === "late" && row.arrivedAt ? (
              <span className="text-sm text-warn">{formatTime(row.arrivedAt)}</span>
            ) : null}
          </li>
        ))}
        {query.isPending ? (
          <li className="px-4 py-8 text-center text-sm text-fg-muted">جارٍ التحميل…</li>
        ) : rows.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-fg-muted">
            {kind === "absence" ? "لا يوجد غائبون في هذا النطاق." : "لا يوجد متأخرون في هذا النطاق."}
          </li>
        ) : null}
      </ul>

      <article ref={sheetRef} className="print-form official-sheet bg-white text-black font-naskh">
        <OfficialLetterhead school={school} />
        <h2 className="mt-2 text-center text-[20px] font-semibold">{title}</h2>
        <p className="text-center text-[13px] text-[#00857c]">
          {todayLabel()} — {hijriDate(`${to}T12:00:00`)} — {days}
        </p>
        <table className="official-table mb-3">
          <thead>
            <tr>
              <th>الفترة</th>
              <th>العدد</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 text-[16px] font-semibold">{days}</td>
              <td className="text-[16px] font-semibold">{rows.length}</td>
            </tr>
          </tbody>
        </table>
        <table className="official-table">
          <thead>
            <tr>
              <th className="w-10">م</th>
              <th>اسم الطالب</th>
              <th>الصف</th>
              <th>التاريخ</th>
              {kind === "late" ? <th>وقت الحضور</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={kind === "late" ? 5 : 4} className="py-8">
                  {kind === "absence" ? "لا يوجد غائبون في هذا النطاق." : "لا يوجد متأخرون في هذا النطاق."}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={`${row.studentId}-${row.day}-${i}`}>
                  <td>{i + 1}</td>
                  <td className="text-[15px] font-semibold">{row.studentName}</td>
                  <td>{row.classLabel}</td>
                  <td>{formatDay(`${row.day}T12:00:00`)}</td>
                  {kind === "late" ? (
                    <td>{row.arrivedAt ? formatTime(row.arrivedAt) : "—"}</td>
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
