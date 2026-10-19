import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { OfficialLetterhead } from "@/components/print-forms";
import { rangeFromPreset } from "@/components/attendance-roster";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  getStudentNotes,
  listAttendanceRoster,
  listFollowupNotes,
  listParentMessages,
  listStudents,
} from "@/lib/school/api";
import { classLabel, formatStamp, formatTime, messageKindLabel } from "@/lib/school/constants";
import { tr } from "@/lib/school/i18n";
import { printElement } from "@/lib/school/print";
import { useWorkspace } from "@/lib/school/workspace";

type ReportKind = "messages" | "student" | "work";
type Audience = "all" | "class" | "student";
type RangeKey = "today" | "week" | "month" | "term" | "custom";

const RANGES: { id: RangeKey; label: string }[] = [
  { id: "today", label: "يومي" },
  { id: "week", label: "أسبوعي" },
  { id: "month", label: "شهري" },
  { id: "term", label: "فصل دراسي" },
  { id: "custom", label: "فترة محددة" },
];

const REPORTS: { id: ReportKind; label: string }[] = [
  { id: "messages", label: "الرسائل المرسلة" },
  { id: "student", label: "تقرير شامل للطالب" },
  { id: "work", label: "تقرير العمل" },
];

function localDay(iso: string | undefined) {
  const raw = String(iso ?? "").trim();
  if (!raw) return "";
  const parsed = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
}

function detailCell(value: string) {
  const text = value.trim();
  return text || "—";
}

function parseDismissal(details: string) {
  const match = String(details ?? "").match(/p7(only|m):(\d+)(?:@(\d{1,2}:\d{2}))?/);
  if (!match) return null;
  return { only: match[1] === "only", minutes: Number(match[2]), time: match[3] ?? "" };
}

function dismissalText(mark: { minutes: number; time: string }) {
  const duration = mark.minutes > 0 ? `${tr("تأخر")} ${mark.minutes} ${tr("د")}` : tr("انصراف");
  return mark.time ? `${mark.time} ${duration}` : duration;
}

function inRange(iso: string | undefined, from: string, to: string) {
  const day = String(iso ?? "").slice(0, 10);
  return day >= from && day <= to;
}

export function VpReports() {
  const { school, stages, classes } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<ReportKind>("messages");
  const [range, setRange] = useState<RangeKey>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [classId, setClassId] = useState<number | "">("");
  const [studentId, setStudentId] = useState<number | "">("");
  const sheetRef = useRef<HTMLElement>(null);
  const preset = range === "custom" ? "today" : range === "today" ? undefined : range;
  const base = rangeFromPreset(preset);
  const bounds = range === "custom" && customFrom && customTo
    ? { from: customFrom, to: customTo, label: `${customFrom} — ${customTo}` }
    : base;
  const needStudents = open && (report === "student" || (report === "messages" && audience === "student"));
  const studentsQuery = useQuery({
    queryKey: ["vp-report-students"],
    queryFn: () => listStudents({ data: {} }),
    enabled: needStudents,
  });
  const messagesQuery = useQuery({
    queryKey: ["vp-report-messages", bounds.from, bounds.to, audience, classId, studentId],
    queryFn: () =>
      listParentMessages({
        data: {
          from: bounds.from,
          to: bounds.to,
          classId: audience === "class" && classId ? Number(classId) : undefined,
          studentId: audience === "student" && studentId ? Number(studentId) : undefined,
        },
      }),
    enabled: open && report === "messages" && (audience !== "class" || Boolean(classId)) && (audience !== "student" || Boolean(studentId)),
  });
  const studentNotes = useQuery({
    queryKey: ["vp-report-student", studentId],
    queryFn: () => getStudentNotes({ data: { studentId: Number(studentId) } }),
    enabled: open && report === "student" && Boolean(studentId),
  });
  const workEnabled = open && (report === "work" || report === "student");
  const absDaily = useQuery({
    queryKey: ["vp-report-abs", bounds.from, bounds.to],
    queryFn: () => listAttendanceRoster({ data: { kind: "absence", from: bounds.from, to: bounds.to } }),
    enabled: workEnabled,
  });
  const lateDaily = useQuery({
    queryKey: ["vp-report-late", bounds.from, bounds.to],
    queryFn: () => listAttendanceRoster({ data: { kind: "late", from: bounds.from, to: bounds.to } }),
    enabled: workEnabled,
  });
  const leaveDaily = useQuery({
    queryKey: ["vp-report-leave", bounds.from, bounds.to],
    queryFn: () => listAttendanceRoster({ data: { kind: "leave", from: bounds.from, to: bounds.to } }),
    enabled: workEnabled,
  });
  const behaviorNotes = useQuery({
    queryKey: ["vp-report-beh", bounds.from, bounds.to],
    queryFn: () => listFollowupNotes({ data: { type: "behavior", from: bounds.from, to: bounds.to } }),
    enabled: workEnabled,
  });
  const studyNotes = useQuery({
    queryKey: ["vp-report-hw", bounds.from, bounds.to],
    queryFn: () => listFollowupNotes({ data: { type: "homework", from: bounds.from, to: bounds.to } }),
    enabled: workEnabled,
  });
  const workMessages = useQuery({
    queryKey: ["vp-report-work-msg", bounds.from, bounds.to],
    queryFn: () => listParentMessages({ data: { from: bounds.from, to: bounds.to } }),
    enabled: open && report === "work",
  });
  const students = studentsQuery.data?.students ?? [];
  const messages = messagesQuery.data?.messages ?? [];
  const sid = Number(studentId) || 0;
  const absRows = absDaily.data?.rows ?? [];
  const lateRows = lateDaily.data?.rows ?? [];
  const leaveRows = leaveDaily.data?.rows ?? [];
  const behaviorRows = behaviorNotes.data ?? [];
  const studyRows = studyNotes.data ?? [];
  const studentAbs = absRows.filter((row) => row.studentId === sid);
  const studentLate = lateRows.filter((row) => row.studentId === sid);
  const profileMessages = useQuery({
    queryKey: ["vp-report-one-msg", studentId, bounds.from, bounds.to],
    queryFn: () => listParentMessages({ data: { studentId: Number(studentId) } }),
    enabled: open && report === "student" && Boolean(studentId),
  });
  const oneMessages = profileMessages.data?.messages ?? [];
  const profile = studentNotes.data?.student;
  const profileNotes = (studentNotes.data?.notes ?? []).filter((note) => inRange(note.occurredAt || note.createdAt, bounds.from, bounds.to));
  const title = useMemo(() => {
    const name = REPORTS.find((item) => item.id === report)?.label ?? "";
    return `${name} — ${bounds.label}`;
  }, [report, bounds.label]);

  function print() {
    if (sheetRef.current) printElement(sheetRef.current);
  }

  return (
    <>
      <Button type="button" size="sm" variant="secondary" className="no-print h-9 shrink-0" onClick={() => setOpen(true)}>
        <Printer className="size-4" />
        {tr("طباعة التقارير")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="no-print max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{tr("طباعة التقارير")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {RANGES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setRange(item.id)}
                  className={`h-8 rounded-full border px-3 text-xs font-semibold ${range === item.id ? "border-primary bg-primary text-primary-fg" : "border-border bg-bg text-fg-muted"}`}
                >
                  {tr(item.label)}
                </button>
              ))}
            </div>
            {range === "custom" ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>{tr("من")}</Label>
                  <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} dir="ltr" />
                </div>
                <div className="space-y-1">
                  <Label>{tr("إلى")}</Label>
                  <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} dir="ltr" />
                </div>
              </div>
            ) : null}
            <div className="grid gap-1.5">
              {REPORTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setReport(item.id)}
                  className={`rounded-[var(--radius-md)] border px-3 py-2 text-right text-sm font-semibold ${report === item.id ? "border-primary bg-primary/5 text-primary" : "border-border bg-bg"}`}
                >
                  {item.id === "messages" ? tr("تقرير الرسائل المرسلة لطالب أو مجموعة أو الجميع") : tr(item.label)}
                </button>
              ))}
            </div>
            {report === "messages" ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-1">
                  {(["all", "class", "student"] as Audience[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setAudience(item)}
                      className={`h-9 rounded-full border text-xs font-semibold ${audience === item ? "border-primary bg-primary text-primary-fg" : "border-border"}`}
                    >
                      {item === "all" ? tr("الجميع") : item === "class" ? tr("مجموعة") : tr("طالب")}
                    </button>
                  ))}
                </div>
                {audience === "class" ? (
                  <Select value={String(classId)} onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : "")}>
                    <option value="">{tr("اختر الفصل")}</option>
                    {stages.map((stage) => (
                      <optgroup key={stage.id} label={stage.name}>
                        {classes.filter((cls) => cls.stageId === stage.id).map((cls) => (
                          <option key={cls.id} value={cls.id}>{cls.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                ) : null}
                {audience === "student" ? (
                  <Select value={String(studentId)} onChange={(e) => setStudentId(e.target.value ? Number(e.target.value) : "")}>
                    <option value="">{tr("اختر الطالب")}</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>{student.name} — {student.label}</option>
                    ))}
                  </Select>
                ) : null}
              </div>
            ) : null}
            {report === "student" ? (
              <Select value={String(studentId)} onChange={(e) => setStudentId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">{tr("اختر الطالب")}</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>{student.name} — {student.label}</option>
                ))}
              </Select>
            ) : null}
            <Button type="button" className="w-full" onClick={print} disabled={report === "student" && !studentId}>
              <Printer className="size-4" />
              {tr("طباعة")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <article ref={sheetRef} className="print-form print-report official-sheet hidden bg-white font-naskh text-black">
        <OfficialLetterhead school={school} />
        <h2 className="mt-2 text-center text-[18px] font-semibold">{title}</h2>
        <p className="mb-3 text-center text-[12px]">{bounds.from} — {bounds.to}</p>
        {report === "messages" ? (
          <MessagesReport messages={messages} />
        ) : null}
        {report === "student" && profile ? (
          <div className="space-y-3 text-[13px]">
            <p className="text-center font-semibold">{profile.name} — {profile.classLabel}</p>
            <ReportTable
              headers={[tr("التاريخ"), tr("النوع"), tr("المخالفة أو الملاحظة"), tr("الإجراء"), tr("الرسالة")]}
              rows={studentReportRows(studentAbs, studentLate, profileNotes, oneMessages, bounds.from, bounds.to, leaveRows.filter((row) => row.studentId === sid))}
              empty={tr("لا سجلات لهذا الطالب في هذه الفترة")}
            />
          </div>
        ) : null}
        {report === "work" ? (
          <div className="space-y-3 text-[13px]">
            <p className="text-center">
              {tr("غياب")} {absRows.length} · {tr("تأخر")} {lateRows.length} · {tr("مخالفات")} {behaviorRows.length} · {tr("ملاحظات دراسية")} {studyRows.length} · {tr("رسائل")} {(workMessages.data?.messages ?? []).length}
            </p>
            <WorkReport
              rows={[
                ...absRows.map((row) => ({ studentId: row.studentId, studentName: row.studentName, classLabel: row.classLabel, day: row.day, text: `${tr("غياب")} — ${row.details}` })),
                ...lateRows.map((row) => {
                  const leave = parseDismissal(row.details);
                  const text = leave?.only
                    ? `${tr("انصراف")} — ${dismissalText(leave)}`
                    : leave
                      ? `${tr("تأخر")} — ${row.arrivedAt ? formatTime(row.arrivedAt) : tr("تأخر صباحي")} — ${tr("انصراف")} ${dismissalText(leave)}`
                      : `${tr("تأخر")} — ${row.arrivedAt ? formatTime(row.arrivedAt) : row.details}`;
                  return { studentId: row.studentId, studentName: row.studentName, classLabel: row.classLabel, day: row.day, text };
                }),
                ...(leaveDaily.data?.rows ?? []).map((row) => ({
                  studentId: row.studentId,
                  studentName: row.studentName,
                  classLabel: row.classLabel,
                  day: row.day,
                  text: `${tr("انصراف")} — ${dismissalText(parseDismissal(row.details) ?? { minutes: 0, time: "" })}`,
                })),
                ...behaviorRows.map((note) => ({
                  studentId: note.studentId,
                  studentName: note.studentName,
                  classLabel: classLabel(note.shortName, note.className),
                  day: String(note.occurredAt).slice(0, 10),
                  text: note.behaviorTypeName || note.details || tr("مخالفة"),
                })),
                ...studyRows.map((note) => ({
                  studentId: note.studentId,
                  studentName: note.studentName,
                  classLabel: classLabel(note.shortName, note.className),
                  day: String(note.occurredAt).slice(0, 10),
                  text: note.details || tr("ملاحظات دراسية"),
                })),
                ...(workMessages.data?.messages ?? []).map((item) => ({
                  studentId: item.studentId,
                  studentName: item.studentName,
                  classLabel: classLabel(item.shortName, item.className),
                  day: String(item.createdAt).slice(0, 10),
                  text: `${tr("رسالة")} — ${item.body}`,
                })),
              ]}
            />
          </div>
        ) : null}
      </article>
    </>
  );
}

function WorkReport({
  rows,
}: {
  rows: { studentId: number; studentName: string; classLabel: string; day: string; text: string }[];
}) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm">{tr("لا عمل مسجّل في هذه الفترة")}</p>;
  const groups = new Map<number, typeof rows>();
  for (const row of [...rows].sort((a, b) => b.day.localeCompare(a.day))) {
    const list = groups.get(row.studentId) ?? [];
    list.push(row);
    groups.set(row.studentId, list);
  }
  const ordered = [...groups.values()].sort((a, b) => {
    const classOrder = a[0].classLabel.localeCompare(b[0].classLabel, "ar");
    if (classOrder !== 0) return classOrder;
    return a[0].studentName.localeCompare(b[0].studentName, "ar");
  });
  return (
    <table className="w-full border-collapse text-right text-[12px]">
      <thead>
        <tr className="bg-[#e7f4f2]">
          {[tr("م"), tr("الطالب"), tr("الفصل"), tr("التاريخ"), tr("العمل")].map((header) => (
            <th key={header} className="border border-black px-2 py-1.5 font-semibold whitespace-nowrap">{header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ordered.map((items, index) =>
          items.map((item, itemIndex) => (
            <tr key={`${item.studentId}-${item.day}-${itemIndex}`} className={index % 2 ? "bg-[#f7fbfa]" : ""}>
              {itemIndex === 0 ? <td className="border border-black px-2 py-1.5 align-top" rowSpan={items.length}>{index + 1}</td> : null}
              {itemIndex === 0 ? <td className="border border-black px-2 py-1.5 align-top font-semibold" rowSpan={items.length}>{items[0].studentName}</td> : null}
              {itemIndex === 0 ? <td className="border border-black px-2 py-1.5 align-top" rowSpan={items.length}>{items[0].classLabel}</td> : null}
              <td className="border border-black px-2 py-1.5 align-top">{item.day}</td>
              <td className="border border-black px-2 py-1.5 align-top leading-5">{item.text}</td>
            </tr>
          )),
        )}
      </tbody>
    </table>
  );
}

function MessagesReport({
  messages,
}: {
  messages: { id: number; studentId: number; studentName: string; shortName: string; className: string; kind: string; body: string; createdAt: string }[];
}) {
  if (messages.length === 0) return <p className="py-6 text-center text-sm">{tr("لا رسائل في هذه الفترة")}</p>;
  const groups = new Map<number, typeof messages>();
  for (const item of [...messages].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))) {
    const list = groups.get(item.studentId) ?? [];
    list.push(item);
    groups.set(item.studentId, list);
  }
  const ordered = [...groups.values()].sort((a, b) => {
    const classOrder = classLabel(a[0].shortName, a[0].className).localeCompare(classLabel(b[0].shortName, b[0].className), "ar");
    if (classOrder !== 0) return classOrder;
    return a[0].studentName.localeCompare(b[0].studentName, "ar");
  });
  return (
    <table className="w-full border-collapse text-right text-[12px]">
      <thead>
        <tr className="bg-[#e7f4f2]">
          {[tr("م"), tr("الطالب"), tr("الفصل"), tr("التاريخ"), tr("النوع"), tr("الرسالة")].map((header) => (
            <th key={header} className="border border-black px-2 py-1.5 font-semibold whitespace-nowrap">{header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ordered.map((items, index) =>
          items.map((item, itemIndex) => (
            <tr key={item.id} className={index % 2 ? "bg-[#f7fbfa]" : ""}>
              {itemIndex === 0 ? (
                <td className="border border-black px-2 py-1.5 align-top" rowSpan={items.length}>{index + 1}</td>
              ) : null}
              {itemIndex === 0 ? (
                <td className="border border-black px-2 py-1.5 align-top font-semibold" rowSpan={items.length}>{items[0].studentName}</td>
              ) : null}
              {itemIndex === 0 ? (
                <td className="border border-black px-2 py-1.5 align-top" rowSpan={items.length}>{classLabel(items[0].shortName, items[0].className)}</td>
              ) : null}
              <td className="border border-black px-2 py-1.5 align-top">{formatStamp(item.createdAt)}</td>
              <td className="border border-black px-2 py-1.5 align-top">{tr(messageKindLabel(item.kind))}</td>
              <td className="border border-black px-2 py-1.5 align-top leading-5">{item.body}</td>
            </tr>
          )),
        )}
      </tbody>
    </table>
  );
}

function studentReportRows(
  absences: { day: string; details: string }[],
  lates: { day: string; details: string; arrivedAt?: string | null }[],
  notes: { id?: number; type: string; details: string; occurredAt?: string; createdAt: string; behaviorTypeName?: string | null; actionTaken?: string | null }[],
  messages: { id: number; kind: string; body: string; createdAt: string; noteId?: number | null }[],
  from: string,
  to: string,
  leaves: { day: string; details: string }[] = [],
) {
  const lines: { day: string; type: string; text: string; action: string; kind: string; noteId?: number; hint: string; message: string }[] = [];
  const noteOn = (type: string, day: string, details: string) => {
    const same = notes.filter((note) => note.type === type && localDay(note.occurredAt || note.createdAt) === day);
    const text = details.trim();
    const named = same.filter((note) => note.details.trim().length > 3 && text.includes(note.details.trim()));
    if (named.length === 1) return named[0];
    if (same.length === 1 && (text.includes(same[0].details.trim()) || !same[0].details.trim())) return same[0];
    return undefined;
  };
  for (const row of absences) {
    const note = noteOn("absence", row.day, row.details);
    lines.push({ day: row.day, type: tr("غياب"), text: row.details, action: note?.actionTaken ?? "", kind: "absence", noteId: note?.id, hint: row.details, message: "" });
  }
  for (const row of lates) {
    const note = noteOn("late", row.day, row.details);
    const leave = parseDismissal(row.details);
    const base = { action: note?.actionTaken ?? "", noteId: note?.id, message: "" };
    if (!leave?.only) {
      lines.push({
        day: row.day,
        type: tr("تأخر"),
        text: row.arrivedAt ? formatTime(row.arrivedAt) : tr("تأخر صباحي"),
        kind: "late",
        hint: row.details,
        ...base,
      });
    }
    if (leave) {
      lines.push({
        day: row.day,
        type: tr("انصراف"),
        text: dismissalText(leave),
        kind: leave.only ? "late" : "leave",
        hint: dismissalText(leave),
        ...base,
        noteId: leave.only ? note?.id : undefined,
      });
    }
  }
  for (const row of leaves) {
    const leave = parseDismissal(row.details);
    lines.push({
      day: row.day,
      type: tr("انصراف"),
      text: leave ? dismissalText(leave) : row.details,
      action: "",
      kind: "leave",
      hint: row.details,
      message: "",
    });
  }
  for (const note of notes.filter((item) => item.type === "behavior")) {
    const day = localDay(note.occurredAt || note.createdAt);
    lines.push({
      day,
      type: tr("مخالفة"),
      text: [note.behaviorTypeName, note.details].filter(Boolean).join(" — "),
      action: note.actionTaken ?? "",
      kind: "behavior",
      noteId: note.id,
      hint: note.behaviorTypeName || note.details || "",
      message: "",
    });
  }
  for (const note of notes.filter((item) => item.type === "homework")) {
    const day = localDay(note.occurredAt || note.createdAt);
    lines.push({
      day,
      type: tr("ملاحظة دراسية"),
      text: note.details,
      action: note.actionTaken ?? "",
      kind: "homework",
      noteId: note.id,
      hint: note.details,
      message: "",
    });
  }
  const used = new Set<number>();
  const open = () => lines.filter((line) => !line.message);
  const free = () => messages.filter((item) => !used.has(item.id));
  const take = (line: (typeof lines)[number], item: (typeof messages)[number]) => {
    used.add(item.id);
    const text = item.body.trim();
    line.message = line.message ? `${line.message} · ${text}` : text;
  };
  for (const line of lines) {
    const hit = free().find((item) => line.noteId && item.noteId === line.noteId);
    if (hit) take(line, hit);
  }
  for (const line of open()) {
    const sameSlot = lines.filter((item) => item.kind === line.kind && localDay(item.day) === localDay(line.day));
    const hits = free().filter((item) => item.kind === line.kind && localDay(item.createdAt) === localDay(line.day));
    if (!hits.length) continue;
    if (sameSlot.length === 1) {
      take(line, hits[0]);
      continue;
    }
    const hint = line.hint.trim();
    const named = hint.length >= 4 ? hits.find((item) => item.body.includes(hint.slice(0, 40))) : undefined;
    if (named) take(line, named);
  }
  const rows = lines.map((line) => [line.day, line.type, detailCell(line.text), detailCell(line.action), detailCell(line.message)]);
  for (const item of free()) {
    const day = localDay(item.createdAt);
    if (day < from || day > to) continue;
    rows.push([day, tr("رسالة"), "—", "—", detailCell(item.body)]);
  }
  return rows.sort((a, b) => String(b[0]).localeCompare(String(a[0])));
}

function ReportTable({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty: string }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm">{empty}</p>;
  return (
    <table className="w-full border-collapse text-right text-[12px]">
      <thead>
        <tr className="bg-[#e7f4f2]">
          {headers.map((header) => (
            <th key={header} className="border border-black px-2 py-1.5 font-semibold whitespace-nowrap">{header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 200).map((row, index) => (
          <tr key={index} className={index % 2 ? "bg-[#f7fbfa]" : ""}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} className="border border-black px-2 py-1.5 align-top leading-5">{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
