import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useRef, useState } from "react";
import { toast } from "sonner";
import { ImproveDialog } from "@/components/improve-dialog";
import { NoteSession } from "@/components/note-session";
import { NoteActions } from "@/components/note-actions";
import { ExitPermitBadge } from "@/components/exit-permit";
import { DayName } from "@/components/day-name";
import { StaffMailDialog } from "@/components/staff-mail-dialog";
import { StaffMailInbox } from "@/components/staff-mail-inbox";
import { OfficialLetterhead, PrintFormsButton } from "@/components/print-forms";
import { StudentDossier } from "@/components/student-dossier";
import { NoteRecordTools, ImprovementRecordTools, MessageRecordTools } from "@/components/record-actions";
import { EditStudentButton } from "@/components/student-editor";
import { studentLabel, useLocale, tr } from "@/lib/school/i18n";
import { WhatsAppDialog } from "@/components/whatsapp-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { followImprovement, getStudentNotes, getTeacherStudentReport, listImprovements, listParentMessages, requestClassMove, deleteNote, createStudentMail } from "@/lib/school/api";
import { getStudentAttendanceDays } from "@/lib/school/attendance-totals";
import {
  IMPROVEMENT_STATUS,
  NOTE_META,
  degreeLabel,
  formatStamp,
  hijriDate,
  messageKindLabel,
  noteTone,
  occurrenceLabel,
} from "@/lib/school/constants";
import { NoteThread } from "@/components/note-thread";
import { printElement } from "@/lib/school/print";
import { staffCan } from "@/lib/school/permissions";
import type { BehaviorImprovement, ImprovementStatus, MessageKind, NoteDest } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";

function Ring({ label, value, color }: { label: string; value: string; color: string }) {
  const numeric = value.endsWith("%") ? Number(value.slice(0, -1)) : null;
  const pct = numeric == null || Number.isNaN(numeric) ? 0 : Math.max(0, Math.min(100, numeric));
  const radius = 28;
  const length = 2 * Math.PI * radius;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="78" height="78" viewBox="0 0 78 78" aria-hidden>
        <circle cx="39" cy="39" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        {numeric != null ? (
          <circle
            cx="39"
            cy="39"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={`${(pct / 100) * length} ${length}`}
            strokeLinecap="round"
            transform="rotate(-90 39 39)"
          />
        ) : null}
        <text x="39" y="44" textAnchor="middle" fontSize="13" fill="#111827">{value}</text>
      </svg>
      <span className="text-xs">{label}</span>
    </div>
  );
}

function TeacherReport({ studentId }: { studentId: number }) {
  const { school } = useWorkspace();
  const printRef = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState("");
  const [shown, setShown] = useState(false);
  const query = useQuery({
    queryKey: ["teacher-student-report", studentId],
    queryFn: () => getTeacherStudentReport({ data: { studentId } }),
    enabled: studentId > 0,
  });
  const send = useMutation({
    mutationFn: async () => {
      const data = query.data as {
        student: { name: string; classLabel: string };
        teacher: string;
        notes: { type: string; details: string; subject: string }[];
        grades: { subject: string; combine: string; total: number; periods: { title: string; total: number }[] }[];
      } | undefined;
      if (!data) throw new Error("افتح التقرير أولاً");
      const lines = [
        `تقرير لإرساله لولي الأمر عبر واتساب`,
        `${data.student.name} — ${data.student.classLabel}${data.subject ? ` — ${data.subject}` : ""}`,
        ...data.grades.map((grade) => `${grade.subject}: ${grade.combine === "avg" ? "متوسط" : "مجموع"} ${grade.total} (${grade.periods.map((period) => `${period.title} ${period.total}`).join("، ")})`),
        ...data.notes.map((item) => `${NOTE_META[item.type as keyof typeof NOTE_META]?.label || item.type}${item.subject ? ` · ${item.subject}` : ""}: ${item.details || "—"}`),
        note.trim() ? `ملاحظة المعلم: ${note.trim()}` : "",
      ].filter(Boolean).join("\n").slice(0, 7500);
      await createStudentMail({ data: { studentId, dest: "vp", body: lines } });
    },
    onSuccess: () => toast.success(tr("أُرسل التقرير كاملاً إلى الوكيل ليرسله لولي الأمر")),
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الإرسال")),
  });
  const data = query.data as {
    student: { name: string; classLabel: string; stageName?: string };
    teacher: string;
    subject?: string;
    stats?: {
      points: number;
      count: number;
      positive: number;
      negative: number;
      days: number;
      badges: number;
      lastLabel: string;
      frequentLabel: string;
      summary: string;
    };
    indicators?: { positive: number | null; negative: number | null; attendance: number };
    evals?: { label: string; points: number; subject: string; createdAt: string }[];
    attendance?: { percent: number; rows: { status: string; days: number; dates: string }[] };
    notes: { id: number; type: string; details: string; subject: string; createdAt: string }[];
    grades: { subject: string; combine: string; total: number; periods: { no: number; title: string; participation: number; exam: number; evalPoints: number; total: number }[] }[];
  } | undefined;
  const stats = data?.stats ?? { points: 0, count: 0, positive: 0, negative: 0, days: 0, badges: 0, lastLabel: "—", frequentLabel: "—", summary: "" };
  const issued = `${hijriDate()} — ${new Intl.DateTimeFormat("ar-SA", { hour: "numeric", minute: "2-digit" }).format(new Date())}`;
  const statRow = (label: string, value: string | number) => (
    <div className="flex items-center justify-between gap-2">
      <span className="min-w-0 flex-1 rounded-lg border border-[#d7e3dc] bg-[#f7fbf8] px-2 py-1 text-xs">{label}</span>
      <span className="w-14 rounded-lg border border-[#d7e3dc] bg-white px-2 py-1 text-center text-sm">{value}</span>
    </div>
  );
  return (
    <section className="space-y-2 rounded-[var(--radius-md)] border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">{tr("تقرير المعلم")}</h2>
        <Button type="button" size="sm" variant="secondary" onClick={() => setShown(true)}>{tr("عرض التقرير")}</Button>
        <Button type="button" size="sm" variant="secondary" disabled={!data} onClick={() => printRef.current && printElement(printRef.current)}>{tr("طباعة")}</Button>
      </div>
      {shown && query.isPending ? <p className="text-sm text-fg-muted">{tr("جارٍ التحميل…")}</p> : null}
      {shown && data ? (
        <>
          <div ref={printRef} className="space-y-3 rounded-[var(--radius-md)] bg-white p-3 text-sm text-black">
            <OfficialLetterhead school={school} />
            <div className="mx-auto max-w-xl border border-[#1f8a4c] px-3 py-2 text-center text-sm font-semibold">
              تقرير الطالب/ة [{data.student.name}]
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["اسم الطالب/ة", data.student.name],
                ["المرحلة الدراسية / الصف", `${data.student.stageName || "—"} - ${data.student.classLabel}`],
                ["المادة", data.subject || data.grades[0]?.subject || "—"],
                ["تاريخ الإصدار", issued],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-[#1f8a4c] px-2 py-2 text-center">
                  <p className="text-[11px] text-[#1f8a4c]">{label}</p>
                  <p className="text-xs font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <section className="space-y-2 rounded-xl border border-[#d7e3dc] p-2">
                <h3 className="text-center text-sm font-semibold text-[#1f8a4c]">الإحصائيات العامة</h3>
                {statRow("نقاط التقييمات", stats.points)}
                {statRow("عدد التقييمات", stats.count)}
                {statRow("تقييمات إيجابية", stats.positive)}
                {statRow("تقييمات سلبية", stats.negative)}
                {statRow("أيام تقييمه", stats.days)}
                {statRow("الأوسمة", stats.badges)}
              </section>
              <section className="space-y-2 rounded-xl border border-[#d7e3dc] p-2">
                <h3 className="text-center text-sm font-semibold text-[#1f8a4c]">ملخص الأداء</h3>
                <p className="rounded-lg bg-[#4b5563] px-2 py-2 text-center text-xs text-white">{stats.summary}</p>
                <div className="grid grid-cols-[1fr_auto] gap-1 text-xs">
                  <span className="rounded bg-[#e5e7eb] px-2 py-1 text-center">المؤشر</span>
                  <span className="rounded bg-[#e5e7eb] px-2 py-1 text-center">القيمة</span>
                  <span className="rounded bg-[#1f8a4c] px-2 py-1 text-center text-white">التقييمات الإيجابية</span>
                  <span className="rounded border px-2 py-1 text-center">{stats.positive}</span>
                  <span className="rounded bg-[#2563eb] px-2 py-1 text-center text-white">آخر تقييم</span>
                  <span className="rounded border px-2 py-1 text-center">{stats.lastLabel}</span>
                  <span className="rounded bg-[#f59e0b] px-2 py-1 text-center text-white">أكثر تقييم تكراراً</span>
                  <span className="rounded border px-2 py-1 text-center">{stats.frequentLabel}</span>
                  <span className="rounded bg-[#dc2626] px-2 py-1 text-center text-white">التقييمات السلبية</span>
                  <span className="rounded border px-2 py-1 text-center">{stats.negative}</span>
                </div>
              </section>
            </div>
            <div className="flex justify-center">
              <span className="rounded-full bg-[#1f8a4c] px-4 py-1 text-sm font-semibold text-white">التحليل البياني</span>
            </div>
            <p className="text-center text-xs">مؤشرات الطالب</p>
            <div className="flex flex-wrap items-start justify-around gap-3 rounded-xl border border-[#d7e3dc] py-3">
              <Ring label="الحضور" value={`%${data.indicators?.attendance ?? data.attendance?.percent ?? 100}`} color="#2563eb" />
              <Ring label="التقييمات السلبية" value={data.indicators?.negative == null ? "—" : `%${data.indicators.negative}`} color="#dc2626" />
              <Ring label="التقييمات الإيجابية" value={data.indicators?.positive == null ? "—" : `%${data.indicators.positive}`} color="#1f8a4c" />
            </div>
            <div className="flex justify-center">
              <span className="rounded-full bg-[#1f8a4c] px-4 py-1 text-sm font-semibold text-white">سجل التقييمات ({stats.count})</span>
            </div>
            {(data.evals ?? []).length === 0 ? <p className="text-center text-xs">لا توجد تقييمات بعد</p> : (
              <ul className="space-y-1 text-xs">
                {(data.evals ?? []).map((item, index) => (
                  <li key={`${item.createdAt}-${index}`} className="flex justify-between gap-2 border-b border-[#e5e7eb] py-1">
                    <span>{formatStamp(item.createdAt)}{item.subject ? ` · ${item.subject}` : ""}</span>
                    <span>{item.label} ({item.points > 0 ? "+" : ""}{item.points})</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-center">
              <span className="rounded-full bg-[#1f8a4c] px-4 py-1 text-sm font-semibold text-white">الحضور والغياب</span>
            </div>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  {["الحالة", "عدد الأيام", "التواريخ"].map((label) => (
                    <th key={label} className="border border-[#1f8a4c] bg-[#1f8a4c] px-2 py-1 text-white">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.attendance?.rows ?? []).map((row) => (
                  <tr key={row.status}>
                    <td className="border border-[#d7e3dc] px-2 py-1 text-center">{row.status}</td>
                    <td className="border border-[#d7e3dc] px-2 py-1 text-center">{row.days}</td>
                    <td className="border border-[#d7e3dc] px-2 py-1 text-center">{row.dates}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.grades.map((grade) => (
              <p key={grade.subject} className="text-xs">{grade.subject}: {grade.combine === "avg" ? "متوسط" : "مجموع"} {grade.total}</p>
            ))}
            {note.trim() ? <p className="text-xs">{tr("ملاحظة الإرسال")}: {note.trim()}</p> : null}
            <div className="mt-6 grid grid-cols-2 gap-4 text-center text-sm">
              <div>
                <p className="font-semibold">معلم/ة المادة</p>
                <p className="mt-1">{data.subject || data.grades[0]?.subject || "………………"}</p>
              </div>
              <div>
                <p className="font-semibold">مدير/ة المدرسة</p>
                <p className="mt-1">{school.principalName || "………………"}</p>
              </div>
            </div>
          </div>
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={tr("ملاحظة تُرفق مع الرسالة")} />
          <Button type="button" size="sm" disabled={send.isPending || !data} onClick={() => send.mutate()}>{tr("إرسال للوكيل لولي الأمر")}</Button>
        </>
      ) : null}
    </section>
  );
}

function hijriParts(iso: string) {
  const date = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { day: pick("day"), month: pick("month"), year: pick("year") };
}

function compactDates(dates: string[], suffix?: Map<string, string>) {
  const years = new Map<string, Map<string, string[]>>();
  for (const iso of [...new Set(dates.filter(Boolean))].sort()) {
    const part = hijriParts(iso);
    if (!part?.day) continue;
    const months = years.get(part.year) ?? new Map<string, string[]>();
    const days = months.get(part.month) ?? [];
    const label = suffix?.get(iso) ? `${part.day} (${suffix.get(iso)})` : part.day;
    if (!days.includes(label)) days.push(label);
    months.set(part.month, days);
    years.set(part.year, months);
  }
  return [...years.entries()].map(([year, months]) => ({
    year,
    line: [...months.entries()].map(([month, days]) => `${days.join("، ")} ${month}`).join(" · "),
  }));
}

function behaviorDeduct(note: { behaviorDegree?: number | null; occurrence?: number | null }) {
  const degree = Number(note.behaviorDegree) || 0;
  const times = Number(note.occurrence) || 1;
  if (degree === 1) return times >= 3 ? 1 : 0;
  if (degree === 2) return 2;
  if (degree === 3) return 3;
  if (degree === 4) return 10;
  if (degree === 5) return 15;
  return 0;
}

function dateKey(value: string | null | undefined) {
  if (!value) return "";
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function StudentBehaviorReport({
  student,
  notes,
  days,
  parent,
}: {
  student: { name: string; classLabel: string; stageName?: string };
  notes: {
    type: string;
    details: string;
    behaviorTypeName?: string;
    behaviorDegree?: number | null;
    teacherSubject?: string;
    actionTaken?: string;
    occurrence?: number | null;
    occurredAt?: string;
    createdAt?: string;
  }[];
  days: { day: string; kind: string; arrivedAt?: string | null }[];
  parent: { studentId: number; phone: string; className: string; shortName: string };
}) {
  const { school, staff } = useWorkspace();
  const printRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [detailed, setDetailed] = useState(false);
  const behavior = notes.filter((note) => note.type === "behavior");
  const absenceDays = [...new Set([
    ...days.filter((row) => row.kind === "absence").map((row) => row.day),
    ...notes.filter((note) => note.type === "absence").map((note) => dateKey(note.occurredAt || note.createdAt)),
  ].filter(Boolean))].sort();
  const lateDays = [...new Set([
    ...days.filter((row) => row.kind === "late").map((row) => row.day),
    ...notes.filter((note) => note.type === "late").map((note) => dateKey(note.occurredAt || note.createdAt)),
  ].filter(Boolean))].sort();
  const lateTime = new Map(days.filter((row) => row.kind === "late" && row.arrivedAt).map((row) => [row.day, String(row.arrivedAt).slice(11, 16)]));
  const degrees = [1, 2, 3, 4, 5].map((degree) => ({
    degree,
    count: behavior.filter((note) => Number(note.behaviorDegree) === degree).length,
  })).filter((item) => item.degree <= 3 || item.count > 0);
  const deducted = behavior.reduce((sum, note) => sum + behaviorDeduct(note), 0);
  const frequent = [...behavior.reduce((map, note) => {
    const name = (note.behaviorTypeName || note.details || "مخالفة").trim();
    map.set(name, (map.get(name) ?? 0) + 1);
    return map;
  }, new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const issued = `${hijriDate()} — ${new Intl.DateTimeFormat("ar-SA", { hour: "numeric", minute: "2-digit" }).format(new Date())}`;
  const canSendParent = ["admin", "principal", "school_vp", "teachers_vp"].includes(staff.role);
  const summaryText = [
    `السلام عليكم ولي أمر الطالب ${student.name}`,
    school.name,
    `الصف: ${student.classLabel}`,
    "",
    "تقرير عن الطالب",
    `عدد أيام التأخر: ${lateDays.length}`,
    `عدد أيام الغياب: ${absenceDays.length}`,
    ...degrees.map((item) => `${degreeLabel(item.degree)}: ${item.count}`),
    `درجات السلوك المخصومة: ${deducted}`,
    `المتبقي من 100: ${Math.max(0, 100 - deducted)}`,
    "",
    "أكثر المخالفات تكرارًا:",
    ...(frequent.length ? frequent.map(([name, count], index) => `${index + 1}. ${name} (${count})`) : ["لا توجد مخالفات سلوكية"]),
  ].join("\n");
  const detailedText = [
    summaryText,
    "",
    "التقرير المفصل",
    `الغياب (${absenceDays.length})`,
    compactDates(absenceDays).map((group) => `${group.year}: ${group.line}`).join("\n") || "لا يوجد",
    `التأخر (${lateDays.length})`,
    compactDates(lateDays, lateTime).map((group) => `${group.year}: ${group.line}`).join("\n") || "لا يوجد",
    `المخالفات (${behavior.length})`,
    behavior.length
      ? behavior.map((note) => {
          const title = `${note.behaviorTypeName || "مخالفة"}${note.details ? ` — ${note.details}` : ""}`;
          const meta = [
            note.behaviorDegree ? degreeLabel(note.behaviorDegree) : "",
            behaviorDeduct(note) ? `حسم ${behaviorDeduct(note)}` : "",
            formatStamp(note.occurredAt || note.createdAt || ""),
            note.teacherSubject || "",
            note.actionTaken ? `الإجراء: ${note.actionTaken}` : "",
          ].filter(Boolean).join(" · ");
          return `- ${title}\n  ${meta}`;
        }).join("\n")
      : "لا توجد مخالفات",
  ].join("\n");
  const statRow = (label: string, value: string | number) => (
    <div className="flex items-center justify-between gap-2">
      <span className="min-w-0 flex-1 rounded-lg border border-[#d7e3dc] bg-[#f7fbf8] px-2 py-1 text-xs">{label}</span>
      <span className="w-14 rounded-lg border border-[#d7e3dc] bg-white px-2 py-1 text-center text-sm">{value}</span>
    </div>
  );
  const dateBlock = (title: string, dates: string[], suffix?: Map<string, string>) => {
    const groups = compactDates(dates, suffix);
    return (
      <section className="space-y-1">
        <h3 className="text-center text-sm font-semibold text-[#1f8a4c]">{title} ({dates.length})</h3>
        {groups.length === 0 ? <p className="text-center text-xs">لا يوجد</p> : groups.map((group) => (
          <p key={`${title}-${group.year}`} className="text-xs leading-6">
            <span className="font-semibold">{group.year}: </span>{group.line}
          </p>
        ))}
      </section>
    );
  };
  return (
    <section className="space-y-2 rounded-[var(--radius-md)] border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">{tr("تقرير الطالب")}</h2>
        <Button type="button" size="sm" variant="secondary" onClick={() => setShown(true)}>{tr("عرض التقرير")}</Button>
        <Button type="button" size="sm" variant={detailed ? "default" : "secondary"} onClick={() => { setShown(true); setDetailed((open) => !open); }}>{tr("تقرير مفصل")}</Button>
        <Button type="button" size="sm" variant="secondary" disabled={!shown} onClick={() => printRef.current && printElement(printRef.current)}>{tr("طباعة")}</Button>
        {canSendParent ? (
          <>
            <WhatsAppDialog
              studentId={parent.studentId}
              studentName={student.name}
              parentPhone={parent.phone}
              className={parent.className}
              shortName={parent.shortName}
              defaultType="behavior"
              label={tr("إرسال التقرير لولي الأمر")}
              initialDraft={summaryText}
            />
            <WhatsAppDialog
              studentId={parent.studentId}
              studentName={student.name}
              parentPhone={parent.phone}
              className={parent.className}
              shortName={parent.shortName}
              defaultType="behavior"
              label={tr("إرسال المفصل لولي الأمر")}
              initialDraft={detailedText}
            />
          </>
        ) : null}
      </div>
      {shown ? (
        <div ref={printRef} className="space-y-3 rounded-[var(--radius-md)] bg-white p-3 text-sm text-black">
          <OfficialLetterhead school={school} />
          <div className="mx-auto max-w-xl border border-[#1f8a4c] px-3 py-2 text-center text-sm font-semibold">
            تقرير الطالب/ة [{student.name}]
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              ["اسم الطالب/ة", student.name],
              ["المرحلة الدراسية / الصف", `${student.stageName || "—"} - ${student.classLabel}`],
              ["تاريخ الإصدار", issued],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[#1f8a4c] px-2 py-2 text-center">
                <p className="text-[11px] text-[#1f8a4c]">{label}</p>
                <p className="text-xs font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <section className="space-y-2 rounded-xl border border-[#d7e3dc] p-2">
              <h3 className="text-center text-sm font-semibold text-[#1f8a4c]">الإحصائيات العامة</h3>
              {statRow("عدد أيام التأخر", lateDays.length)}
              {statRow("عدد أيام الغياب", absenceDays.length)}
              {degrees.map((item) => statRow(degreeLabel(item.degree), item.count))}
              {statRow("درجات السلوك المخصومة", deducted)}
              {statRow("المتبقي من 100", Math.max(0, 100 - deducted))}
            </section>
            <section className="space-y-2 rounded-xl border border-[#d7e3dc] p-2">
              <h3 className="text-center text-sm font-semibold text-[#1f8a4c]">ملخص الأداء</h3>
              <p className="rounded-lg bg-[#4b5563] px-2 py-2 text-center text-xs text-white">أكثر المخالفات تكرارًا</p>
              {frequent.length === 0 ? <p className="text-center text-xs">لا توجد مخالفات سلوكية</p> : (
                <ol className="space-y-1 text-xs">
                  {frequent.map(([name, count], index) => (
                    <li key={name} className="flex items-center justify-between gap-2 rounded border border-[#d7e3dc] px-2 py-1">
                      <span>{index + 1}. {name}</span>
                      <span className="font-semibold">{count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
          {detailed ? (
            <div className="space-y-3 border-t border-[#d7e3dc] pt-3" style={{ breakBefore: "page" }}>
              <h3 className="text-center text-sm font-semibold">التقرير المفصل</h3>
              {dateBlock("الغياب", absenceDays)}
              {dateBlock("التأخر", lateDays, lateTime)}
              <section className="space-y-2">
                <h3 className="text-center text-sm font-semibold text-[#1f8a4c]">المخالفات ({behavior.length})</h3>
                {behavior.length === 0 ? <p className="text-center text-xs">لا توجد مخالفات</p> : behavior.map((note, index) => (
                  <article key={`${note.createdAt}-${index}`} className="overflow-hidden rounded-md border border-[#d7e3dc]">
                    <p className="px-2 py-2 text-sm font-semibold leading-6">
                      {note.behaviorTypeName || "مخالفة"}
                      {note.details ? ` — ${note.details}` : ""}
                    </p>
                    <p className="border-t border-[#d7e3dc] px-2 py-1 text-[11px] text-[#374151]">
                      {[
                        note.behaviorDegree ? degreeLabel(note.behaviorDegree) : "",
                        behaviorDeduct(note) ? `حسم ${behaviorDeduct(note)}` : "",
                        formatStamp(note.occurredAt || note.createdAt || ""),
                        note.teacherSubject || "",
                        note.actionTaken ? `الإجراء: ${note.actionTaken}` : "",
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </article>
                ))}
              </section>
            </div>
          ) : null}
          <div className="mt-6 grid grid-cols-2 gap-4 text-center text-sm">
            <div>
              <p className="font-semibold">وكيل شؤون الطلاب</p>
              <p className="mt-1">………………</p>
            </div>
            <div>
              <p className="font-semibold">مدير/ة المدرسة</p>
              <p className="mt-1">{school.principalName || "………………"}</p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function StudentSheet({
  studentId,
  open,
  onOpenChange,
  presetSubject,
  presetPeriod,
}: {
  studentId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetSubject?: string;
  presetPeriod?: string;
}) {
  const { school, staff, classes } = useWorkspace();
  const { locale } = useLocale();
  const query = useQuery({
    queryKey: ["student", studentId],
    queryFn: () => getStudentNotes({ data: { studentId: studentId! } }),
    enabled: open && studentId != null,
  });
  const improvements = useQuery({
    queryKey: ["improvements", studentId],
    queryFn: () => listImprovements({ data: { studentId: studentId! } }),
    enabled: open && studentId != null,
  });
  const messages = useQuery({
    queryKey: ["parent-messages", studentId],
    queryFn: () => listParentMessages({ data: { studentId: studentId! } }),
    enabled: open && studentId != null,
  });
  const attendance = useQuery({
    queryKey: ["student-attendance-days", studentId],
    queryFn: () => getStudentAttendanceDays({ data: { studentId: studentId! } }),
    enabled: open && studentId != null,
  });
  const queryClient = useQueryClient();
  const [moveClassId, setMoveClassId] = useState("");
  const move = useMutation({
    mutationFn: () => requestClassMove({ data: { studentId: studentId!, classId: Number(moveClassId) } }),
    onSuccess: () => {
      toast.success(tr("أُضيف طلب النقل في مكتب الوكيل والمرشد ومن لديه صلاحية تعديل الطلاب"));
      setMoveClassId("");
      void queryClient.invalidateQueries({ queryKey: ["desk-inbox"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["home-desk"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر إرسال الطلب")),
  });

  const student = query.data?.student;
  const shown = student ? studentLabel(locale, student.name, student.nameEn) : "";
  const notes = query.data?.notes ?? [];
  const violRef = useRef<HTMLDivElement>(null);
  const violationNotes = notes.some((note) => note.type === "behavior") ? notes.filter((note) => note.type === "behavior") : notes;
  const scoped = query.data?.scopedToTeacher;
  const canEditRecords = staffCan(staff, "editRecords");
  const canMessage = staffCan(staff, "sendMessages");
  const classFollow = staffCan(staff, "viewClassFollow");
  const officialPrint = staffCan(staff, "viewOfficialPrint");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="max-w-4xl overflow-hidden">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              {student ? <ExitPermitBadge studentId={student.id} /> : null}
              {student ? <DayName studentId={student.id}>{shown || tr("سجل الطالب")}</DayName> : <span className="min-w-0">{tr("سجل الطالب")}</span>}
            </span>
            {student ? (
              <StaffMailDialog studentId={student.id} studentName={student.name} compact />
            ) : null}
          </SheetTitle>
          <p className="text-sm text-fg-muted">
            {student?.classLabel}
            {canMessage && [student?.parentPhone, student?.parentPhone2, student?.workPhone].filter(Boolean).length
              ? ` · ${[student?.parentPhone, student?.parentPhone2, student?.workPhone].filter(Boolean).join(" · ")}`
              : ""}
          </p>
          {student ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {officialPrint && canMessage ? (
              <WhatsAppDialog
                studentId={student.id}
                studentName={student.name}
                parentPhone={student.parentPhone}
                className={student.className}
                shortName={student.shortName}
                defaultType={notes[0]?.type ?? "general"}
                details={notes[0]?.behaviorTypeName || notes[0]?.details || ""}
                sharedText={notes[0]?.details ?? ""}
                subject={notes[0]?.teacherSubject}
                createdAt={notes[0]?.createdAt}
                periodKey={notes[0]?.periodKey}
                noteId={notes[0]?.id}
                behaviorDegree={notes[0]?.type === "behavior" ? notes[0]?.behaviorDegree : null}
              />
              ) : null}
              {officialPrint ? (
              <PrintFormsButton
                student={{
                  name: student.name,
                  classLabel: student.classLabel,
                  className: student.className,
                  stageName: student.stageName,
                  parentPhone: canMessage ? student.parentPhone : "",
                }}
                notes={notes}
                studentId={student.id}
                defaultKind={
                  notes.some((n) => n.type === "behavior")
                    ? "pledge"
                    : notes.some((n) => n.type === "absence")
                      ? "attendance"
                      : "record"
                }
              />
              ) : null}
              <StudentDossier studentId={student.id} />
              <Button type="button" size="sm" variant="secondary" disabled={violationNotes.length === 0} onClick={() => violRef.current && printElement(violRef.current)}>
                {tr("طباعة المخالفات")}
              </Button>
              <EditStudentButton
                student={{
                  id: student.id,
                  name: student.name,
                  nameEn: student.nameEn,
                  parentPhone: student.parentPhone,
                  parentPhone2: student.parentPhone2,
                  workPhone: student.workPhone,
                  classId: student.classId,
                }}
              />
              <span className="flex-1" />
              <ImproveDialog
                studentId={student.id}
                studentName={student.name}
                classId={student.classId}
              />
              <NoteActions
                studentId={student.id}
                studentName={student.name}
                classId={student.classId}
                presetSubject={presetSubject}
                presetPeriod={presetPeriod}
              />
            </div>
          ) : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-auto p-5">
          {query.isPending ? (
            <p className="text-sm text-fg-muted">{tr("جارٍ التحميل…")}</p>
          ) : (
            <div className="space-y-6">
              {studentId && classFollow ? <TeacherReport studentId={studentId} /> : null}
              {student ? (
                <StudentBehaviorReport
                  student={{ name: shown || student.name, classLabel: student.classLabel, stageName: student.stageName }}
                  notes={notes}
                  days={attendance.data?.days ?? []}
                  parent={{
                    studentId: student.id,
                    phone: student.parentPhone || "",
                    className: student.className,
                    shortName: student.shortName,
                  }}
                />
              ) : null}
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">{tr("الغياب والتأخر والانصراف")}</h2>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-danger-soft px-2 py-1 text-danger">
                    {tr("غياب")} {(attendance.data?.days ?? []).filter((row) => row.kind === "absence").length}
                  </span>
                  <span className="rounded-full bg-warn-soft px-2 py-1 text-warn">
                    {tr("تأخر")} {(attendance.data?.days ?? []).filter((row) => row.kind === "late").length}
                  </span>
                  <span className="rounded-full bg-[#1d4ed8]/10 px-2 py-1 text-[#1d4ed8]">
                    {tr("انصراف")} {(attendance.data?.days ?? []).filter((row) => row.kind === "leave" || row.leave).length}
                  </span>
                </div>
                {(attendance.data?.days ?? []).length > 0 ? (
                  <ul className="max-h-36 space-y-1 overflow-y-auto text-xs text-fg-muted">
                    {[...(attendance.data?.days ?? [])].reverse().slice(0, 12).map((row) => (
                      <li key={`${row.kind}-${row.day}`}>
                        {row.day} — {row.kind === "leave" || row.leave ? tr("انصراف") : row.kind === "late" ? tr("تأخر") : tr("غياب")}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="h-9 rounded-[var(--radius-md)] border border-border bg-bg px-2 text-sm"
                      value={moveClassId}
                      onChange={(e) => setMoveClassId(e.target.value)}
                    >
                      <option value="">{tr("طلب نقل إلى فصل")}</option>
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>{cls.label}</option>
                      ))}
                    </select>
                    <Button type="button" size="sm" disabled={!moveClassId || move.isPending} onClick={() => move.mutate()}>
                      {tr("إرسال")}
                    </Button>
                  </div>
                </section>
              {scoped ? (
                <p className="rounded-[var(--radius-md)] border border-border bg-muted px-3 py-2 text-xs text-fg-muted">
                  يظهر سجل ملاحظاتك فقط. مخالفات المعلمين الآخرين تظهر لمن مُنح صلاحية الاطلاع على جميع المخالفات.
                </p>
              ) : null}
              <div ref={violRef} className="hidden bg-white p-3 text-black">
                <OfficialLetterhead school={school} />
                <h2 className="my-2 text-center text-lg font-semibold">{tr("تقرير مخالفات الطالب")}</h2>
                <p className="mb-3 text-center text-sm">
                  {shown} · {student.classLabel}
                </p>
                <div className="space-y-2">
                  {violationNotes.map((note, index) => (
                    <article
                      key={note.id}
                      className="viol-block overflow-hidden rounded-md border border-black"
                      style={{ background: index % 2 ? "#f3f6f4" : "#ffffff", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
                    >
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 border-b border-black/10 px-2 py-1 text-[11px] sm:grid-cols-4">
                        <p><span className="text-[#0f4f4a]">{tr("التاريخ")}: </span>{formatStamp(note.occurredAt || note.createdAt)}</p>
                        <p><span className="text-[#0f4f4a]">{tr("الحصة / المادة")}: </span>{note.teacherSubject || "—"}</p>
                        <p><span className="text-[#0f4f4a]">{tr("النوع")}: </span>{tr(NOTE_META[note.type].label)}{note.behaviorDegree ? ` · ${degreeLabel(note.behaviorDegree)}` : ""}{note.occurrence > 1 ? ` · ${occurrenceLabel(note.occurrence)}` : ""}</p>
                      </div>
                      <p className="px-2 py-2 text-base font-semibold leading-7">
                        {note.behaviorTypeName ? tr(note.behaviorTypeName) : ""}
                        {note.behaviorTypeName && note.details ? " — " : ""}
                        {note.details || tr("بدون وصف")}
                      </p>
                      <p className="border-t border-black/10 px-2 py-1 text-xs">
                        <span className="font-semibold">{tr("الإجراء")}: </span>
                        {note.actionTaken || note.suggestedAction || tr("لم يُتخذ إجراء بعد")}
                        {note.enteredByName && note.enteredByName !== note.teacherName ? ` · ${tr("المسجل")}: ${note.enteredByName}` : ""}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
              {notes.length === 0 ? (
                <p className="text-sm text-fg-muted">{tr("لا توجد ملاحظات مسجّلة بعد.")}</p>
              ) : (
            <div className="space-y-2">
              {notes.map((note, index) => {
                const tone = noteTone(note.type, note.status);
                return (
                  <article key={note.id} className="overflow-hidden rounded-[var(--radius-md)] border border-border" style={{ background: index % 2 ? "rgba(15,79,74,0.04)" : "transparent" }}>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={tone}>{tr(NOTE_META[note.type].label)}</Badge>
                        {note.behaviorTypeName ? <span className="text-sm font-semibold">{tr(note.behaviorTypeName)}</span> : null}
                        {note.behaviorDegree ? <span className="text-xs text-fg-muted">{degreeLabel(note.behaviorDegree)}</span> : null}
                        {note.type === "behavior" ? <Badge tone={note.occurrence > 1 ? "danger" : "default"}>{occurrenceLabel(note.occurrence)}</Badge> : null}
                      </div>
                      <span className="text-xs text-fg-muted">{formatStamp(note.occurredAt || note.createdAt)}</span>
                    </div>
                    <p className="px-3 py-2 text-sm leading-7">{note.details || tr("بدون وصف")}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 pb-2 text-xs text-fg-muted">
                      <span>{tr("المادة")}: {note.teacherSubject || "—"}</span>
                      <span>{tr("المعلم")}: {note.teacherName}</span>
                      {note.enteredByName && note.enteredByName !== note.teacherName ? <span>{tr("المسجل")}: {note.enteredByName}</span> : null}
                      <span>{note.status === "closed" ? tr("أُغلقت") : tr("مفتوحة")}</span>
                      <span>{tr("الإجراء")}: {note.status === "closed" ? note.actionTaken || "—" : "—"}</span>
                    </div>
                    <div className="no-print flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2">
                      {canEditRecords || note.teacherId === staff.userId ? <NoteRecordTools note={note} teacherId={note.teacherId} /> : <span />}
                    </div>
                    <div className="border-t border-border px-3 py-2">
                      <NoteThread noteId={note.id} dest={(note.dest as NoteDest | undefined) ?? (note.referCounselor ? "counselor" : "vp")} compact />
                    </div>
                  </article>
                );
              })}
            </div>
              )}
              <ImprovementsBlock
                items={improvements.data ?? []}
                studentId={studentId}
                lead={staffCan(staff, "acceptImprovements")}
                teacherId={staff.userId}
              />
              {studentId ? (
                <StaffMailInbox
                  studentId={studentId}
                  title={tr("المراسلات")}
                  hint={tr("بينك وبين الوكيل أو المرشد أو المرشد الصحي أو معلم آخر — يمكن تتبعها وتحويلها")}
                />
              ) : null}
              {officialPrint ? <MessagesBlock items={messages.data?.messages ?? []} /> : null}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CancelOwnNote({ noteId }: { noteId: number }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteNote({ data: { noteId } }),
    onSuccess: () => {
      toast.success(tr("تم الحذف"));
      void queryClient.invalidateQueries({ queryKey: ["student"] });
      void queryClient.invalidateQueries({ queryKey: ["class"] });
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحذف")),
  });
  return (
    <Button type="button" size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
      {tr("إلغاء المخالفة")}
    </Button>
  );
}

function ImprovementsBlock({
  items,
  studentId,
  lead,
  teacherId,
}: {
  items: BehaviorImprovement[];
  studentId: number | null;
  lead: boolean;
  teacherId: string;
}) {
  if (!studentId) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">{tr("تحسين السلوك — متابعة المرشد")}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-fg-muted">{tr("لا توجد خطط تحسين بعد. أرسل خطة من زر النبتة.")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <ImprovementCard key={item.id} item={item} lead={lead} mine={item.teacherId === teacherId} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ImprovementCard({
  item,
  lead,
  mine,
}: {
  item: BehaviorImprovement;
  lead: boolean;
  mine: boolean;
}) {
  const queryClient = useQueryClient();
  const [followup, setFollowup] = useState(item.teacherFollowup);
  const [counselorNote, setCounselorNote] = useState(item.counselorNote);
  const mutation = useMutation({
    mutationFn: (input: {
      teacherFollowup?: string;
      counselorNote?: string;
      status?: ImprovementStatus;
    }) => followImprovement({ data: { id: item.id, ...input } }),
    onSuccess: () => {
      toast.success(tr("تم حفظ متابعة التحسين"));
      void queryClient.invalidateQueries({ queryKey: ["improvements"] });
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
  });
  const tone =
    item.status === "closed" ? "ok" : item.status === "following" ? "primary" : "warn";

  return (
    <li className="rounded-[var(--radius-md)] border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{IMPROVEMENT_STATUS[item.status]}</Badge>
        <span className="text-xs text-fg-subtle">{formatStamp(item.createdAt)}</span>
        <span className="text-xs text-fg-muted">
          {item.teacherName}
          {item.teacherSubject ? ` · ${item.teacherSubject}` : ""}
        </span>
        <span className="ms-auto">
          <ImprovementRecordTools id={item.id} plan={item.plan} />
        </span>
      </div>
      <p className="mt-2 font-medium">{item.plan}</p>
      {item.teacherFollowup ? (
        <p className="mt-1 text-xs text-fg-muted">متابعة المعلم: {item.teacherFollowup}</p>
      ) : null}
      {item.counselorNote ? (
        <p className="mt-1 text-xs text-ok">المرشد: {item.counselorNote}</p>
      ) : null}
      {mine && item.status !== "closed" ? (
        <div className="mt-2 space-y-2">
          <Textarea
            className="min-h-16"
            placeholder={tr("متابعة المعلم…")}
            value={followup}
            onChange={(e) => setFollowup(e.target.value)}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={mutation.isPending || followup.trim().length < 2}
            onClick={() => mutation.mutate({ teacherFollowup: followup })}
          >
            حفظ متابعة المعلم
          </Button>
        </div>
      ) : null}
      {lead && item.status !== "closed" ? (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <Textarea
            className="min-h-16"
            placeholder={tr("ملاحظة المرشد الطلابي…")}
            value={counselorNote}
            onChange={(e) => setCounselorNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({ counselorNote, status: "following" })
              }
            >
              متابعة
            </Button>
            <Button
              size="sm"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ counselorNote, status: "closed" })}
            >
              إغلاق الخطة
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function MessagesBlock({
  items,
}: {
  items: { id: number; body: string; kind: string; staffName: string; createdAt: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">{tr("رسائل ولي الأمر")}</h3>
      <ul className="space-y-2">
        {items.map((msg) => (
          <li key={msg.id} className="rounded-[var(--radius-md)] border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{messageKindLabel(msg.kind as MessageKind)}</Badge>
              <span className="text-xs text-fg-subtle">
                {msg.staffName} · {formatStamp(msg.createdAt)}
              </span>
              <span className="ms-auto">
                <MessageRecordTools id={msg.id} body={msg.body} />
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap">{msg.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
