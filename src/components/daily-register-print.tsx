import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { OfficialLetterhead } from "@/components/print-forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { MonthDays } from "@/components/attendance-roster";
import { listDailyRegister, listStudents } from "@/lib/school/api";
import { formatTime } from "@/lib/school/constants";
import { tr } from "@/lib/school/i18n";
import { printElement } from "@/lib/school/print";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

type RegisterKind = "absence" | "late" | "leave";
type Who = "all" | "student";
type Span = "day" | "range" | "all";

const KINDS: { id: RegisterKind; label: string }[] = [
  { id: "absence", label: "الغياب" },
  { id: "late", label: "التأخر" },
  { id: "leave", label: "الانصراف المتأخر" },
];

function todayISO() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function rowDetail(kind: RegisterKind, row: { arrivedAt: string | null; details: string }) {
  if (kind === "absence") return tr("غياب");
  if (kind === "late") return row.arrivedAt ? formatTime(row.arrivedAt) : "—";
  return leaveText(row.details);
}

function groupedStudents(rows: { studentId: number; studentName: string; classLabel: string; day: string; arrivedAt: string | null; details: string }[]) {
  const groups: { studentId: number; studentName: string; classLabel: string; items: typeof rows }[] = [];
  const index = new Map<number, (typeof groups)[number]>();
  for (const row of rows) {
    const found = index.get(row.studentId);
    if (found) found.items.push(row);
    else {
      const group = { studentId: row.studentId, studentName: row.studentName, classLabel: row.classLabel, items: [row] };
      index.set(row.studentId, group);
      groups.push(group);
    }
  }
  for (const group of groups) group.items.sort((a, b) => a.day.localeCompare(b.day));
  return groups;
}

function leaveText(details: string) {
  const match = String(details ?? "").match(/^p7(?:only|m):(\d+)(?:@(\d{1,2}:\d{2}))?$/);
  if (!match) return "—";
  const minutes = Number(match[1]);
  const time = match[2] ?? "";
  const mins = minutes <= 0 ? tr("بعد السابعة") : `${minutes} ${tr("د")} ${tr("بعد السابعة")}`;
  return time ? `${mins} · ${time}` : mins;
}

export function DailyRegisterPrint() {
  const { school } = useWorkspace();
  const sheetRef = useRef<HTMLElement>(null);
  const today = todayISO();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<RegisterKind>("absence");
  const [who, setWho] = useState<Who>("all");
  const [studentId, setStudentId] = useState<number | "">("");
  const [span, setSpan] = useState<Span>("day");
  const [brief, setBrief] = useState(false);
  const [day, setDay] = useState(today);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const fromDay = span === "all" ? undefined : span === "day" ? day : from;
  const toDay = span === "all" ? undefined : span === "day" ? day : to;
  const ready = who === "all" || Boolean(studentId);

  const students = useQuery({
    queryKey: ["register-students"],
    queryFn: () => listStudents({ data: {} }),
    enabled: open,
  });
  const register = useQuery({
    queryKey: ["daily-register", kind, who, studentId, fromDay ?? "", toDay ?? ""],
    queryFn: () =>
      listDailyRegister({
        data: {
          kind,
          studentId: who === "student" && studentId ? Number(studentId) : undefined,
          from: fromDay,
          to: toDay,
        },
      }),
    enabled: open && ready,
  });

  const rows = register.data?.rows ?? [];
  const kindLabel = tr(KINDS.find((item) => item.id === kind)?.label ?? "الغياب");
  const spanLabel = span === "all" ? tr("كل المدة") : span === "day" ? day : `${from} — ${to}`;
  const whoLabel =
    who === "student"
      ? students.data?.students.find((item) => item.id === studentId)?.name ?? tr("طالب")
      : tr("جميع الطلاب");

  function print() {
    if (!ready) {
      toast.error(tr("اختر الطالب"));
      return;
    }
    if (!rows.length) {
      toast.error(tr("لا سجلات في هذه الفترة"));
      return;
    }
    if (sheetRef.current) printElement(sheetRef.current);
  }

  return (
    <>
      <Button type="button" size="sm" variant="secondary" className="no-print h-9 shrink-0" onClick={() => setOpen(true)}>
        <Printer className="size-4" />
        {tr("كشف الغياب والتأخر")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="no-print max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{tr("طباعة كشف الغياب والتأخر")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-1.5">
              {KINDS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setKind(item.id)}
                  className={cn(
                    "min-h-10 rounded-[var(--radius-md)] border px-2 text-xs font-semibold",
                    kind === item.id ? "border-primary bg-primary text-primary-fg" : "border-border bg-bg text-fg",
                  )}
                >
                  {tr(item.label)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ["all", "جميع الطلاب"],
                  ["student", "طالب واحد"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setWho(id)}
                  className={cn(
                    "h-9 rounded-full border text-xs font-semibold",
                    who === id ? "border-primary bg-primary text-primary-fg" : "border-border bg-bg text-fg-muted",
                  )}
                >
                  {tr(label)}
                </button>
              ))}
            </div>
            {who === "student" ? (
              <Select value={String(studentId)} onChange={(e) => setStudentId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">{tr("اختر الطالب")}</option>
                {(students.data?.students ?? []).map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name} — {student.label}
                  </option>
                ))}
              </Select>
            ) : null}
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ["day", "يوم"],
                  ["range", "مدة محددة"],
                  ["all", "الكل"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSpan(id)}
                  className={cn(
                    "h-9 rounded-full border text-xs font-semibold",
                    span === id ? "border-primary bg-primary text-primary-fg" : "border-border bg-bg text-fg-muted",
                  )}
                >
                  {tr(label)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  [false, "عرض مفصل"],
                  [true, "عرض مختصر"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setBrief(id)}
                  className={cn(
                    "h-9 rounded-full border text-xs font-semibold",
                    brief === id ? "border-primary bg-primary text-primary-fg" : "border-border bg-bg text-fg-muted",
                  )}
                >
                  {tr(label)}
                </button>
              ))}
            </div>
            {span === "day" ? (
              <div className="space-y-1">
                <Label>{tr("اليوم")}</Label>
                <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
              </div>
            ) : null}
            {span === "range" ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>{tr("من")}</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{tr("إلى")}</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </div>
            ) : null}
            <p className="text-xs text-fg-muted">
              {register.isFetching ? tr("جارٍ…") : `${rows.length} ${tr("سجل")}`}
            </p>
            <Button type="button" className="w-full" onClick={print} disabled={!ready || register.isFetching}>
              <Printer className="size-4" />
              {tr("طباعة")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <article ref={sheetRef} className="print-form print-report official-sheet hidden bg-white font-naskh text-black">
        <OfficialLetterhead school={school} />
        <h2 className="mt-2 text-center text-[18px] font-semibold">
          {tr("كشف")} {kindLabel}
        </h2>
        <p className="mb-3 text-center text-[12px]">
          {whoLabel} — {spanLabel}
        </p>
        {brief ? (
          <table className="w-full border-collapse text-right text-[12px]">
            <thead>
              <tr className="bg-[#e7f4f2]">
                <th className="border border-black px-2 py-1">{tr("م")}</th>
                <th className="border border-black px-2 py-1">{tr("اسم الطالب")}</th>
                <th className="border border-black px-2 py-1">{tr("الصف")}</th>
                <th className="border border-black px-2 py-1">{tr("عدد الأيام")}</th>
                <th className="border border-black px-2 py-1">{tr("الأيام")}</th>
              </tr>
            </thead>
            <tbody>
              {groupedStudents(rows).map((group, index) => (
                <tr key={group.studentId}>
                  <td className="border border-black px-2 py-1 align-top">{index + 1}</td>
                  <td className="border border-black px-2 py-1 align-top font-semibold">{group.studentName}</td>
                  <td className="border border-black px-2 py-1 align-top">{group.classLabel}</td>
                  <td className="border border-black px-2 py-1 align-top font-semibold">{group.items.length}</td>
                  <td className="border border-black px-2 py-1 align-top">
                    <MonthDays
                      days={group.items.map((item) => ({
                        day: item.day,
                        extra: kind === "absence" ? "" : rowDetail(kind, item) === "—" ? "" : rowDetail(kind, item),
                      }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full border-collapse text-right text-[12px]">
          <thead>
            <tr className="bg-[#e7f4f2]">
              <th className="border border-black px-2 py-1">{tr("م")}</th>
              <th className="border border-black px-2 py-1">{tr("الطالب")}</th>
              <th className="border border-black px-2 py-1">{tr("الفصل")}</th>
              <th className="border border-black px-2 py-1">{tr("التاريخ")}</th>
              <th className="border border-black px-2 py-1">
                {kind === "absence" ? tr("الغياب") : kind === "late" ? tr("التأخر") : tr("الانصراف المتأخر")}
              </th>
            </tr>
          </thead>
          <tbody>
            {span === "day"
              ? rows.map((row, index) => (
                  <tr key={`${row.studentId}-${row.day}-${index}`}>
                    <td className="border border-black px-2 py-1">{index + 1}</td>
                    <td className="border border-black px-2 py-1">{row.studentName}</td>
                    <td className="border border-black px-2 py-1">{row.classLabel}</td>
                    <td className="border border-black px-2 py-1">{row.day}</td>
                    <td className="border border-black px-2 py-1">{rowDetail(kind, row)}</td>
                  </tr>
                ))
              : groupedStudents(rows).map((group, index) =>
                  group.items.map((row, itemIndex) => (
                    <tr key={`${group.studentId}-${row.day}-${itemIndex}`}>
                      {itemIndex === 0 ? (
                        <td className="border border-black px-2 py-1 align-top" rowSpan={group.items.length}>
                          {index + 1}
                        </td>
                      ) : null}
                      {itemIndex === 0 ? (
                        <td className="border border-black px-2 py-1 align-top font-semibold" rowSpan={group.items.length}>
                          {group.studentName}
                        </td>
                      ) : null}
                      {itemIndex === 0 ? (
                        <td className="border border-black px-2 py-1 align-top" rowSpan={group.items.length}>
                          {group.classLabel}
                        </td>
                      ) : null}
                      <td className="border border-black px-2 py-1">{row.day}</td>
                      <td className="border border-black px-2 py-1">{rowDetail(kind, row)}</td>
                    </tr>
                  )),
                )}
          </tbody>
        </table>
        )}
      </article>
    </>
  );
}
