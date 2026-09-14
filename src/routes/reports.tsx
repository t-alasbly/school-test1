import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { AppGate } from "@/components/app-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getReport, listParentMessages } from "@/lib/school/api";
import {
  NOTE_META,
  NOTE_TYPES,
  classLabel,
  counselorTitle,
  formatDay,
  formatStamp,
  hijriDate,
  messageKindLabel,
  occurrenceLabel,
  periodShort,
  principalTitle,
  todayLabel,
} from "@/lib/school/constants";
import { printElement } from "@/lib/school/print";
import { staffCan } from "@/lib/school/permissions";
import type { NoteType } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/reports")({ component: ReportsPage });

function ReportsPage() {
  return (
    <AppGate>
      <ReportsBody />
    </AppGate>
  );
}

function ReportsBody() {
  const { staff, school } = useWorkspace();
  const [stageId, setStageId] = useState<string>("");
  const [classId, setClassId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");
  const [type, setType] = useState<"all" | NoteType>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mode, setMode] = useState<"notes" | "messages">("notes");
  const sheetRef = useRef<HTMLElement>(null);

  const filters = useMemo(
    () => ({
      stageId: stageId ? Number(stageId) : undefined,
      classId: classId ? Number(classId) : undefined,
      studentId: studentId ? Number(studentId) : undefined,
      type,
      from: from || undefined,
      to: to || undefined,
    }),
    [stageId, classId, studentId, type, from, to],
  );

  const query = useQuery({
    queryKey: ["report", filters],
    queryFn: () => getReport({ data: filters }),
  });

  const stages = query.data?.stages ?? [];
  const classes = (query.data?.classes ?? []).filter((c) =>
    stageId ? c.stageId === Number(stageId) : true,
  );
  const students = (query.data?.students ?? []).filter((s) => {
    if (classId) return s.classId === Number(classId);
    if (stageId) return s.stageId === Number(stageId);
    return true;
  });
  const messagesQuery = useQuery({
    queryKey: ["parent-messages", studentId, classId, stageId, from, to],
    queryFn: () =>
      listParentMessages({
        data: {
          studentId: studentId ? Number(studentId) : undefined,
          classId: classId ? Number(classId) : undefined,
          stageId: stageId ? Number(stageId) : undefined,
          from: from || undefined,
          to: to || undefined,
        },
      }),
    enabled: mode === "messages",
  });
  const messages = messagesQuery.data?.messages ?? [];
  const scopedToTeacher = query.data?.scopedToTeacher;
  const notes = query.data?.notes ?? [];
  const reportSchool = query.data?.school ?? school;

  const selectedClass = classes.find((c) => String(c.id) === classId);
  const selectedStage = stages.find((s: any) => String(s.id) === stageId);
  const selectedStudent = students.find((s: any) => String(s.id) === studentId);

  const classLine = selectedClass
    ? selectedClass.label
    : selectedStage
      ? selectedStage.name
      : "جميع الفصول";
  const rangeLine =
    from || to
      ? `${from ? formatDay(`${from}T12:00:00`) : "البداية"} — ${to ? formatDay(`${to}T12:00:00`) : "اليوم"}`
      : "جميع التواريخ";
  const typeLine = type === "all" ? "جميع الملاحظات" : NOTE_META[type].label;

  const counts = useMemo(() => {
    const empty = { absence: 0, late: 0, homework: 0, behavior: 0, open: 0, closed: 0 };
    for (const n of notes) {
      empty[n.type as keyof typeof empty] += 1;
      if (n.status === "open") empty.open += 1;
      else empty.closed += 1;
    }
    return empty;
  }, [notes]);

  function handlePrint() {
    if (sheetRef.current) printElement(sheetRef.current);
  }

  const gov = reportSchool.governorate.replace(/^محافظة\s*/, "").trim();
  const region = reportSchool.region.trim();
  const schoolLine = reportSchool.name.startsWith("مدرسة")
    ? reportSchool.name
    : `مدرسة ${reportSchool.name || "………………"}`;
  const principal = principalTitle(reportSchool.leadershipGender);
  const counselor = counselorTitle(reportSchool.leadershipGender);

  return (
    <div className="space-y-6">
      <header className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-fg-muted">
            {staffCan(staff, "viewAllViolations")
              ? "تظهر مخالفات جميع المعلمين — ويمكن طباعة رسائل أولياء الأمور حسب الفترة"
              : "تقرير ملاحظاتك فقط — ورسائل أولياء الأمور التي أرسلتها"}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">التقارير</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-sm)] border border-border">
            <button
              type="button"
              onClick={() => setMode("notes")}
              className={
                mode === "notes"
                  ? "h-11 px-4 text-sm font-medium bg-primary text-primary-fg"
                  : "h-11 px-4 text-sm bg-bg-elevated"
              }
            >
              الملاحظات
            </button>
            <button
              type="button"
              onClick={() => setMode("messages")}
              className={
                mode === "messages"
                  ? "h-11 px-4 text-sm font-medium bg-primary text-primary-fg"
                  : "h-11 px-4 text-sm bg-bg-elevated"
              }
            >
              رسائل أولياء الأمور
            </button>
          </div>
          <Button
            onClick={handlePrint}
            disabled={mode === "notes" ? query.isPending : messagesQuery.isPending}
          >
            <Printer className="size-4" />
            {mode === "messages" ? "طباعة الرسائل" : "طباعة الكشف"}
          </Button>
        </div>
      </header>

      <form className="no-print grid gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="stage">المرحلة</Label>
          <Select
            id="stage"
            value={stageId}
            onChange={(e) => {
              setStageId(e.target.value);
              setClassId("");
              setStudentId("");
            }}
          >
            <option value="">الكل</option>
            {stages.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cls">الفصل</Label>
          <Select
            id="cls"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setStudentId("");
            }}
          >
            <option value="">الكل</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="student">اسم الطالب</Label>
          <Select id="student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">الكل</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        {mode === "notes" ? (
        <div className="space-y-1.5">
          <Label htmlFor="type">نوع الملاحظة</Label>
          <Select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as "all" | NoteType)}
          >
            <option value="all">الكل</option>
            {NOTE_TYPES.map((t) => (
              <option key={t} value={t}>
                {NOTE_META[t].label}
              </option>
            ))}
          </Select>
        </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="from">من تاريخ</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">إلى تاريخ</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </form>

      <article
        ref={sheetRef}
        className="print-form print-report official-sheet official-report overflow-hidden rounded-[var(--radius-lg)] border border-border bg-white text-black font-naskh sm:px-5 sm:py-4"
      >
        <header className="mb-2">
          <div className="official-accent h-1.5 bg-[#00857c]" />
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-1 py-2">
            <div className="text-[11px] leading-5">
              <p className="font-semibold">المملكة العربية السعودية</p>
              <p>وزارة التعليم</p>
              <p>متابعة الطلاب الشاملة</p>
            </div>
            <div className="flex items-center gap-3">
              <img src="/moe-logo.jpg" alt="" className="h-[58px] w-auto object-contain" />
              {reportSchool.logoUrl ? (
                <img src={reportSchool.logoUrl} alt="" className="h-[58px] w-auto object-contain" />
              ) : (
                <img src="/app-logo.jpg" alt="" className="h-[58px] w-[58px] object-contain" />
              )}
            </div>
            <div className="text-left text-[11px] leading-5">
              <p>
                {region
                  ? `إدارة التعليم ب${region.replace(/^المنطقة\s*/, "")}`
                  : "إدارة التعليم: ………………"}
              </p>
              {gov ? <p>المحافظة: {gov}</p> : null}
              <p className="font-semibold">{schoolLine}</p>
            </div>
          </div>
          <div className="official-accent h-px bg-[#00857c]" />
          <h2 className="mt-2 text-center text-[20px] font-semibold tracking-wide">
            {mode === "messages" ? "كشف رسائل أولياء الأمور" : "كشف متابعة الطلاب"}
          </h2>
          <p className="text-center text-[13px] text-[#00857c]">
            {todayLabel()} — {hijriDate()}
          </p>
        </header>

        {selectedStudent ? (
          <table className="official-table mb-3">
            <thead>
              <tr>
                <th>اسم الطالب</th>
                <th>الصف / الفصل</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2.5 text-[18px] font-semibold">{selectedStudent.name}</td>
                <td className="py-2.5 text-[16px] font-semibold">{classLine}</td>
              </tr>
            </tbody>
          </table>
        ) : (
        <div className="official-meta mb-2 grid grid-cols-2 overflow-hidden rounded-sm border border-black text-center sm:grid-cols-4">
          {[
            ["الصف / المرحلة", classLine],
            ["اسم الطالب", "جميع الطلاب"],
            ["نوع الملاحظة", mode === "messages" ? "رسائل أولياء الأمور" : typeLine],
            ["الفترة", rangeLine],
          ].map(([label, value]) => (
            <div key={label} className="border-l border-black px-1.5 py-1.5 last:border-l-0">
              <p className="text-[11px] font-semibold text-[#00857c]">{label}</p>
              <p className="text-[13px] font-medium leading-5">{value}</p>
            </div>
          ))}
        </div>
        )}

        {mode === "notes" ? (
        <div className="official-tint mb-2 grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-[#00857c] bg-[#00857c] text-center text-[11px] sm:grid-cols-6">
          {(
            [
              ["غياب", counts.absence],
              ["تأخر", counts.late],
              ["واجب", counts.homework],
              ["سلوك", counts.behavior],
              ["مفتوحة", counts.open],
              ["أُغلقت", counts.closed],
            ] as const
          ).map(([label, n]) => (
            <div key={label} className="bg-[#f3faf8] px-1 py-1.5">
              <p className="font-semibold text-[#0f4f4a]">{label}</p>
              <p className="text-[13px] font-semibold tabular-nums">{n}</p>
            </div>
          ))}
        </div>
        ) : (
          <p className="official-tint mb-2 rounded-sm border border-[#00857c] px-3 py-2 text-center text-[12px]">
            سجل الرسائل المرسلة إلى أولياء الأمور — عدد السجلات: {messages.length}
          </p>
        )}

        <div className="overflow-x-auto">
        {mode === "messages" ? (
        <table className="official-table official-report-table">
          <thead>
            <tr>
              <th className="w-8">م</th>
              <th>اسم الطالب</th>
              <th>النوع</th>
              <th>المرسل</th>
              <th>التاريخ</th>
              <th>نص الرسالة</th>
            </tr>
          </thead>
          <tbody>
            {messages.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center">
                  لا توجد رسائل ضمن الفترة المحددة.
                </td>
              </tr>
            ) : (
              messages.map((msg, index) => (
                <tr key={msg.id}>
                  <td className="tabular-nums">{index + 1}</td>
                  <td className="text-right">
                    <span className="block font-medium leading-5">{msg.studentName}</span>
                    <span className="block text-[10px] leading-4">
                      {classLabel(msg.shortName, msg.className)}
                    </span>
                  </td>
                  <td>{messageKindLabel(msg.kind)}</td>
                  <td>{msg.staffName}</td>
                  <td className="whitespace-nowrap">{formatStamp(msg.createdAt)}</td>
                  <td className="text-right text-[11px] leading-5">{msg.body}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        ) : (
        <table className="official-table official-report-table">
          <thead>
            <tr>
              <th className="w-8">م</th>
              <th>اسم الطالب</th>
              <th>النوع / المخالفة</th>
              <th>الحصة · المادة</th>
              <th>التاريخ</th>
              <th>الحالة / الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {notes.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center">
                  لا توجد نتائج ضمن عوامل التصفية الحالية.
                </td>
              </tr>
            ) : (
              notes.map((note: any, index: number) => (
                <tr key={note.id}>
                  <td className="tabular-nums">{index + 1}</td>
                  <td className="text-right">
                    <span className="block font-medium leading-5">{note.studentName}</span>
                    <span className="block text-[10px] leading-4">
                      {classLabel(note.shortName, note.className)}
                    </span>
                  </td>
                  <td className="text-right">
                    <span className="block leading-5">{NOTE_META[note.type as NoteType].label}</span>
                    {note.behaviorTypeName ? (
                      <span className="block text-[10px] leading-4">
                        {note.behaviorTypeName}
                        {note.occurrence > 1 ? ` · ${occurrenceLabel(note.occurrence)}` : ""}
                      </span>
                    ) : note.details ? (
                      <span className="block text-[10px] leading-4">{note.details}</span>
                    ) : null}
                  </td>
                  <td>
                    <span className="block leading-5">
                      {periodShort(note.periodKey, reportSchool.season)}
                    </span>
                    <span className="block text-[10px] leading-4">
                      {note.teacherSubject || note.teacherName || "—"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">{formatDay(note.createdAt)}</td>
                  <td className="text-right">
                    {note.status === "closed"
                      ? note.actionTaken || "أُغلقت"
                      : "قيد المتابعة"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        )}
        </div>

        <p className="mt-2 text-[10px] leading-5">
          أعدّ الكشف: {staff.displayName} · عدد السجلات:{" "}
          {mode === "messages" ? messages.length : notes.length} · طُبع في {todayLabel()}
          {scopedToTeacher && mode === "notes" ? " · ملاحظات هذا المعلم فقط" : ""}
        </p>

        <footer className="mt-4 grid grid-cols-3 gap-3 text-center text-[12px] leading-6">
          <div>
            <p className="font-semibold">المعلم</p>
            <p>الاسم: {query.data?.teacherName || staff.displayName}</p>
            <p>التوقيع: ………………</p>
          </div>
          <div>
            <p className="font-semibold">{counselor}</p>
            <p>الاسم: {reportSchool.counselorName || "………………"}</p>
            <p>التوقيع: ………………</p>
          </div>
          <div>
            <p className="font-semibold">{principal}</p>
            <p>الاسم: {reportSchool.principalName || "………………"}</p>
            <p>التوقيع: ………………</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
