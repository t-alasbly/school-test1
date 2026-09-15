import { Printer } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getStudentNotes } from "@/lib/school/api";
import {
  counselorTitle,
  degreeLabel,
  formatDay,
  formatStamp,
  formatTime,
  hijriDate,
  occurrenceLabel,
  periodShort,
  principalTitle,
  procedureLadder,
  schoolLogoSrc,
  procedureStageLabel,
  proceduresFor,
  stageIndexFor,
  studentNoun,
  weekdayName,
} from "@/lib/school/constants";
import { printElement } from "@/lib/school/print";
import type { NoteType, School, SchoolSchedules, Season } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";

export type PrintableNote = {
  type: NoteType;
  details: string;
  behaviorTypeName: string | null;
  behaviorDegree: number | null;
  periodKey: string;
  actionTaken: string;
  createdAt: string;
  occurredAt?: string;
  teacherName: string;
  teacherSubject: string;
  occurrence?: number;
  suggestedAction?: string;
  compensation?: string;
};

export type FormOverrides = {
  name?: string;
  classLine?: string;
  violation?: string;
  degree?: string;
  day?: string;
  weekday?: string;
  period?: string;
  subject?: string;
  actionText?: string;
  extra?: string;
};


export type PrintableStudent = {
  name: string;
  classLabel: string;
  className?: string;
  stageName?: string;
  parentPhone?: string;
};

export type FormKind =
  | "commitment"
  | "excellence"
  | "plan"
  | "teacher-log"
  | "record"
  | "compensation"
  | "referral"
  | "pledge"
  | "notice"
  | "invite"
  | "incident"
  | "committee"
  | "violence"
  | "risk"
  | "absence-excused"
  | "absence-unexcused"
  | "attendance"
  | "receipt";

export const FORM_ORDER: FormKind[] = [
  "pledge",
  "notice",
  "invite",
  "referral",
  "teacher-log",
  "record",
  "commitment",
  "receipt",
  "plan",
  "compensation",
  "excellence",
  "incident",
  "committee",
  "attendance",
  "absence-excused",
  "absence-unexcused",
  "violence",
  "risk",
];

export const FORM_META: Record<FormKind, { title: string; confidential?: boolean }> = {
  commitment: { title: "نموذج الالتزام المدرسي" },
  excellence: { title: "نموذج رصد درجات السلوك المتميز" },
  plan: { title: "نموذج خطة تعديل السلوك" },
  "teacher-log": { title: "نموذج رصد المعلم لمشكلة سلوكية" },
  record: { title: "نموذج رصد المشكلات السلوكية" },
  compensation: { title: "نموذج فرص تعويض درجات السلوك الإيجابي" },
  referral: { title: "إحالة طالب / طالبة", confidential: true },
  pledge: { title: "تعهد سلوكي" },
  notice: { title: "إشعار ولي الأمر بمشكلة سلوكية", confidential: true },
  invite: { title: "خطاب دعوة ولي الأمر" },
  incident: { title: "محضر ضبط واقعة", confidential: true },
  committee: { title: "محضر اجتماع لجنة التوجيه الطلابي", confidential: true },
  violence: { title: "إبلاغ عن حالة إيذاء", confidential: true },
  risk: { title: "إبلاغ عن حالة عالية الخطورة", confidential: true },
  "absence-excused": { title: "نموذج إجراءات الغياب بعذر" },
  "absence-unexcused": { title: "نموذج إجراءات الغياب بدون عذر" },
  attendance: { title: "تعهد الالتزام بالحضور" },
  receipt: { title: "إفادة استلام قواعد السلوك" },
};

export function notesToPrintable(
  notes: Array<{
    type: NoteType;
    details: string;
    behaviorTypeName: string | null;
    behaviorDegree?: number | null;
    periodKey: string;
    actionTaken?: string;
    createdAt?: string;
    teacherName?: string;
    teacherSubject?: string;
    occurrence?: number;
  }>,
): PrintableNote[] {
  const now = new Date().toISOString();
  return notes.map((n) => ({
    type: n.type,
    details: n.details,
    behaviorTypeName: n.behaviorTypeName,
    behaviorDegree: n.behaviorDegree ?? null,
    periodKey: n.periodKey,
    actionTaken: n.actionTaken ?? "",
    createdAt: n.createdAt ?? now,
    occurredAt: (n as { occurredAt?: string }).occurredAt ?? n.createdAt ?? now,
    teacherName: n.teacherName ?? "",
    teacherSubject: n.teacherSubject ?? "",
    occurrence: n.occurrence,
    suggestedAction: (n as { suggestedAction?: string }).suggestedAction,
    compensation: (n as { compensation?: string }).compensation,
  }));
}

export function PrintFormsButton({
  student,
  notes,
  defaultKind,
  label = "طباعة نموذج",
  size = "sm",
  studentId,
}: {
  student: PrintableStudent;
  notes: PrintableNote[];
  defaultKind?: FormKind;
  label?: string;
  size?: "sm" | "default" | "icon-sm";
  studentId?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size={size}
        variant="secondary"
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        <Printer className="size-4" />
        {size === "icon-sm" ? null : label}
      </Button>
      <PrintFormsDialog
        open={open}
        onOpenChange={setOpen}
        student={student}
        notes={notes}
        defaultKind={defaultKind}
        studentId={studentId}
      />
    </>
  );
}

export function PrintFormsDialog({
  open,
  onOpenChange,
  student,
  notes,
  defaultKind,
  studentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: PrintableStudent;
  notes: PrintableNote[];
  defaultKind?: FormKind;
  studentId?: number;
}) {
  const { school } = useWorkspace();
  const [kind, setKind] = useState<FormKind>(defaultKind ?? "pledge");
  const [noteIdx, setNoteIdx] = useState(0);
  const [manual, setManual] = useState(false);
  const [overrides, setOverrides] = useState<FormOverrides>({});
  const [showCompensation, setShowCompensation] = useState(true);
  const sheetRef = useRef<HTMLElement>(null);

  const history = useQuery({
    queryKey: ["student", studentId, "print-forms"],
    queryFn: () => getStudentNotes({ data: { studentId: studentId! } }),
    enabled: open && studentId != null,
  });

  const historyNotes = history.data?.notes;
  const allNotes = historyNotes?.length ? notesToPrintable(historyNotes) : notes;
  const seedAt = notes[0]?.createdAt;
  const seedType = notes[0]?.type;

  useEffect(() => {
    if (!open) return;
    setKind(defaultKind && FORM_ORDER.includes(defaultKind) ? defaultKind : "pledge");
    if (!seedAt) {
      setNoteIdx(0);
      return;
    }
    const list = historyNotes?.length ? notesToPrintable(historyNotes) : notes;
    const idx = list.findIndex((n) => n.createdAt === seedAt && n.type === seedType);
    setNoteIdx(idx >= 0 ? idx : 0);
  }, [open, defaultKind, historyNotes, seedAt, seedType, notes]);

  const selected = allNotes[noteIdx] ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader className="no-print">
          <DialogTitle>نماذج الوزارة — {student.name}</DialogTitle>
        </DialogHeader>
        <div className="no-print mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1 space-y-1.5">
            <Label htmlFor="form-kind">النموذج</Label>
            <Select
              id="form-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as FormKind)}
            >
              {FORM_ORDER.map((k) => (
                <option key={k} value={k}>
                  {FORM_META[k].title}
                </option>
              ))}
            </Select>
          </div>
          {allNotes.length > 1 ? (
            <div className="min-w-48 flex-1 space-y-1.5">
              <Label htmlFor="form-note">الملاحظة المعتمدة للتعبئة</Label>
              <Select
                id="form-note"
                value={String(noteIdx)}
                onChange={(e) => setNoteIdx(Number(e.target.value))}
              >
                {allNotes.map((n, i) => (
                  <option key={`${n.createdAt}-${i}`} value={i}>
                    {(n.behaviorTypeName || n.details || "ملاحظة") +
                      (n.createdAt ? ` — ${formatDay(n.createdAt)}` : "")}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <Button onClick={() => sheetRef.current && printElement(sheetRef.current)}>
            <Printer className="size-4" />
            طباعة
          </Button>
          <Button
            type="button"
            variant={manual ? "default" : "secondary"}
            onClick={() => setManual((v) => !v)}
          >
            تعبئة يدوية
          </Button>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-bg-elevated px-3 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={showCompensation && Boolean(selected?.compensation)}
              disabled={!selected?.compensation}
              onChange={(e) => setShowCompensation(e.target.checked)}
            />
            إظهار فرص التعويض في التعهد والخطاب
          </label>
        </div>
        {manual ? (
          <div className="no-print mb-4 grid gap-3 rounded-[var(--radius-md)] border border-border bg-bg-elevated p-3 sm:grid-cols-2">
            {(
              [
                ["name", "اسم الطالب", student.name],
                ["classLine", "الصف / الفصل", student.classLabel],
                ["violation", "المخالفة / الموضوع", selected?.behaviorTypeName || selected?.details || ""],
                ["degree", "الدرجة", selected?.behaviorDegree ? String(selected.behaviorDegree) : ""],
                ["day", "التاريخ", selected ? formatDay(selected.occurredAt || selected.createdAt) : ""],
                ["weekday", "اليوم", selected ? weekdayName(selected.occurredAt || selected.createdAt) : ""],
                ["period", "الحصة", ""],
                ["subject", "المادة", selected?.teacherSubject || ""],
              ] as const
            ).map(([key, label, fallback]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`ov-${key}`}>{label}</Label>
                <input
                  id={`ov-${key}`}
                  className="h-11 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 text-sm"
                  value={overrides[key] ?? fallback}
                  onChange={(e) => setOverrides((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ov-action">الإجراءات (سطر لكل إجراء)</Label>
              <textarea
                id="ov-action"
                className="min-h-20 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 py-2 text-sm"
                value={overrides.actionText ?? ""}
                onChange={(e) => setOverrides((prev) => ({ ...prev, actionText: e.target.value }))}
                placeholder="اتركه فارغاً لاستخدام الإجراء الرسمي تلقائياً"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ov-extra">بيانات إضافية / ملاحظات يدوية</Label>
              <textarea
                id="ov-extra"
                className="min-h-16 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 py-2 text-sm"
                value={overrides.extra ?? ""}
                onChange={(e) => setOverrides((prev) => ({ ...prev, extra: e.target.value }))}
                placeholder="يظهر في النموذج أسفل بيانات المخالفة"
              />
            </div>
          </div>
        ) : null}
        <OfficialForm
          ref={sheetRef}
          kind={kind}
          student={student}
          notes={allNotes}
          selectedNote={selected}
          school={school}
          overrides={manual ? overrides : undefined}
          showCompensation={showCompensation && Boolean(selected?.compensation)}
        />
      </DialogContent>
    </Dialog>
  );
}

export function OfficialForm({
  kind,
  student,
  notes,
  selectedNote,
  school,
  overrides,
  showCompensation = false,
  ref,
}: {
  kind: FormKind;
  student: PrintableStudent;
  notes: PrintableNote[];
  selectedNote: PrintableNote | null;
  school: School;
  overrides?: FormOverrides;
  showCompensation?: boolean;
  ref?: Ref<HTMLElement>;
}) {
  const { behaviorTypes } = useWorkspace();
  const behaviorNotes = notes.filter((n) => n.type === "behavior");
  const absenceNotes = notes.filter((n) => n.type === "absence");
  const focus =
    selectedNote ??
    (kind === "attendance" || kind.startsWith("absence") ? absenceNotes[0] : behaviorNotes[0]) ??
    notes[0] ??
    null;
  const stamp = focus?.occurredAt || focus?.createdAt;
  const violation = overrides?.violation || focus?.behaviorTypeName || focus?.details || "……………………";
  const degree = overrides?.degree || degreeLabel(focus?.behaviorDegree) || "…………";
  const weekday = overrides?.weekday || (stamp ? weekdayName(stamp) : "…………");
  const day = overrides?.day || (stamp ? formatDay(stamp) : "…………");
  const hijri = stamp ? hijriDate(stamp) : "…………";
  const studentWord = studentNoun(school.studentGender);
  const principal = principalTitle(school.leadershipGender);
  const counselor = counselorTitle(school.leadershipGender);
  const did = school.studentGender === "female" ? "قامت" : "قام";
  const previous = previousSame(notes, focus);
  const occurrence =
    focus?.occurrence ||
    (focus?.type === "behavior" ? Math.max(previous.length + 1, 1) : 1);
  const bt = behaviorTypes.find((b) => b.name === focus?.behaviorTypeName);
  const ladder = procedureLadder(focus?.behaviorDegree, bt?.procedures);
  const stageIdx = stageIndexFor(occurrence, ladder.length);
  const official = proceduresFor(focus?.behaviorDegree, occurrence, bt?.procedures);
  const overrideSteps = overrides?.actionText
    ?.split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const parsedAction = parseActionTaken(focus?.actionTaken || focus?.suggestedAction);
  const actionSteps = overrideSteps?.length
    ? overrideSteps
    : parsedAction.steps.length
      ? parsedAction.steps
      : official.length
        ? official
        : [];
  const period = overrides?.period || (focus?.periodKey ? periodShort(focus.periodKey, school.season, school.schedules) : "");
  const subject = overrides?.subject || focus?.teacherSubject?.trim() || "";
  const ctx: FormCtx = {
    name: overrides?.name || student.name,
    studentWord,
    classLine: overrides?.classLine || student.classLabel,
    stageLine: student.stageName || student.classLabel,
    parentPhone: student.parentPhone || "",
    weekday,
    day,
    hijri,
    degree,
    violation,
    actionSteps,
    actionNote: overrides?.extra?.trim() || parsedAction.note,
    previous,
    occurrence,
    principal,
    counselor,
    principalName: school.principalName,
    counselorName: school.counselorName,
    did,
    schoolName: school.name,
    season: school.season,
    schedules: school.schedules,
    focus,
    behaviorNotes,
    absenceNotes,
    period,
    subject,
    stageLabel: procedureStageLabel(stageIdx + 1),
    compensation: focus?.compensation || "",
    showCompensation: Boolean(showCompensation && focus?.compensation),
  };

  return (
    <article ref={ref} className="print-form official-sheet bg-white text-black font-naskh">
      <FormHeader school={school} confidential={FORM_META[kind].confidential} />
      <h2 className="mb-2 text-center text-[20px] font-semibold tracking-wide">{FORM_META[kind].title}</h2>
      <StudentIdentity name={ctx.name} classLine={ctx.classLine} studentWord={ctx.studentWord} />
      {kind === "receipt" || kind === "commitment" || kind === "excellence" ? null : (
        <ViolationStrip
          violation={ctx.violation}
          degree={ctx.degree}
          day={ctx.day}
          weekday={ctx.weekday}
          period={ctx.period}
          subject={ctx.subject}
          time={stamp ? formatTime(stamp) : ""}
        />
      )}
      {overrides?.extra ? (
        <p className="mb-3 rounded-sm border border-black px-3 py-2 text-[13.5px] leading-7">
          {overrides.extra}
        </p>
      ) : null}
      {kind === "pledge" ? <PledgeBody ctx={ctx} /> : null}
      {kind === "receipt" ? <ReceiptBody ctx={ctx} /> : null}
      {kind === "commitment" ? <CommitmentBody ctx={ctx} /> : null}
      {kind === "notice" ? <NoticeBody ctx={ctx} /> : null}
      {kind === "invite" ? <InviteBody ctx={ctx} /> : null}
      {kind === "referral" ? <ReferralBody ctx={ctx} /> : null}
      {kind === "attendance" ? <AttendanceBody ctx={ctx} /> : null}
      {kind === "record" ? <RecordBody ctx={ctx} /> : null}
      {kind === "teacher-log" ? <TeacherLogBody ctx={ctx} /> : null}
      {kind === "plan" ? <PlanBody ctx={ctx} /> : null}
      {kind === "compensation" ? <CompensationBody ctx={ctx} /> : null}
      {kind === "excellence" ? <ExcellenceBody ctx={ctx} /> : null}
      {kind === "incident" ? <IncidentBody ctx={ctx} /> : null}
      {kind === "committee" ? <CommitteeBody ctx={ctx} /> : null}
      {kind === "violence" ? <ViolenceBody ctx={ctx} /> : null}
      {kind === "risk" ? <RiskBody ctx={ctx} /> : null}
      {kind === "absence-excused" ? <AbsenceExcusedBody ctx={ctx} /> : null}
      {kind === "absence-unexcused" ? <AbsenceUnexcusedBody ctx={ctx} /> : null}
    </article>
  );
}

type FormCtx = {
  name: string;
  studentWord: string;
  classLine: string;
  stageLine: string;
  parentPhone: string;
  weekday: string;
  day: string;
  hijri: string;
  degree: string;
  violation: string;
  actionSteps: string[];
  actionNote: string;
  previous: PrintableNote[];
  occurrence: number;
  principal: string;
  counselor: string;
  principalName: string;
  counselorName: string;
  did: string;
  schoolName: string;
  season: Season;
  schedules?: SchoolSchedules;
  focus: PrintableNote | null;
  behaviorNotes: PrintableNote[];
  absenceNotes: PrintableNote[];
  period: string;
  subject: string;
  stageLabel: string;
  compensation: string;
  showCompensation: boolean;
};

function parseActionTaken(action: string | undefined): { steps: string[]; note: string } {
  const raw = action?.trim() ?? "";
  if (!raw) return { steps: [], note: "" };
  const marker = raw.search(/[—\-]\s*ملاحظة(?:\s*على\s*الإجراء)?\s*[:：]/);
  let body = raw;
  let note = "";
  if (marker >= 0) {
    body = raw.slice(0, marker).trim();
    note = raw
      .slice(marker)
      .replace(/^[—\-]\s*/, "")
      .replace(/^ملاحظة(?:\s*على\s*الإجراء)?\s*[:：]\s*/, "")
      .trim();
  } else {
    const onlyNote = raw.match(/^ملاحظة(?:\s*على\s*الإجراء)?\s*[:：]\s*([\s\S]+)$/);
    if (onlyNote) {
      body = "";
      note = onlyNote[1].trim();
    }
  }
  const steps = body
    .split(/\n|;|؛|—/)
    .map((s) => s.replace(/^ملاحظة للمعلم:.*/, "").trim())
    .filter((s) => s.length > 0 && !/^ملاحظة\s*[:：]/.test(s));
  return { steps, note };
}

function actionDisplay(action: string | undefined) {
  const parsed = parseActionTaken(action);
  return parsed.steps.join(" — ") || parsed.note || "";
}

function ActionNoteBox({ note }: { note: string }) {
  if (!note.trim()) return null;
  return (
    <div className="my-2 rounded-sm border border-black px-3 py-2 text-[13.5px] leading-7">
      <p className="font-semibold">الملاحظات</p>
      <p>{note}</p>
    </div>
  );
}

function previousSame(notes: PrintableNote[], focus: PrintableNote | null) {
  if (!focus || focus.type !== "behavior") return [];
  return notes
    .filter(
      (n) =>
        n.type === "behavior" &&
        n.createdAt < focus.createdAt &&
        (focus.behaviorTypeName
          ? n.behaviorTypeName === focus.behaviorTypeName
          : n.details === focus.details),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function FormHeader({ school, confidential }: { school: School; confidential?: boolean }) {
  return <OfficialLetterhead school={school} confidential={confidential} />;
}

export function OfficialLetterhead({
  school,
  confidential,
}: {
  school: School;
  confidential?: boolean;
}) {
  const gov = school.governorate.replace(/^محافظة\s*/, "").trim();
  const region = school.region.trim();
  const regionCore = region.replace(/^المنطقة\s*/, "").trim();
  const rawName = school.name.trim();
  const schoolLine = !rawName
    ? "………………"
    : /^(مدرسة|متوسطة|متوسطه|ابتدائية|ابتدائيه|ثانوية|ثانويه|روضة|مجمع)(\s|$)/.test(rawName)
      ? rawName
      : `مدرسة ${rawName}`;
  const eduLine = regionCore ? `إدارة التعليم ب${regionCore}` : "";
  return (
    <header className="mb-3">
      <div className="official-accent h-1.5 bg-[#00857c]" />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-1 py-2">
        <div className="flex flex-col items-center justify-center px-1 text-center">
          <img
            src="/ksa-diwani.png"
            alt="المملكة العربية السعودية"
            className="ksa-diwani mx-auto h-[35px] w-auto max-w-full object-contain object-center"
          />
          <p className="ksa-ministry mt-0.5 text-[13px] font-semibold tracking-wide text-[#14532d]">
            وزارة التعليم
          </p>
          {confidential ? <p className="mt-1 text-[12px] font-semibold text-[#00857c]">سري</p> : null}
        </div>
        <div className="flex items-center justify-center gap-2">
          <img
            src="/moe-logo.jpg"
            alt="شعار وزارة التعليم"
            className="h-[62px] w-auto max-w-[6.5rem] object-contain"
          />
          {school.extraLogoUrl ? (
            <img
              src={school.extraLogoUrl}
              alt="شعار الرؤية"
              className="h-[62px] w-auto max-w-[6.5rem] object-contain"
            />
          ) : null}
        </div>
        <div className="flex items-center justify-center gap-2 px-1">
          {school.printSchoolLogo && schoolLogoSrc(school.logoUrl) ? (
            <img
              src={schoolLogoSrc(school.logoUrl)}
              alt="شعار المدرسة"
              className="h-[62px] w-auto max-w-[5.5rem] object-contain"
            />
          ) : null}
          <div className="text-center text-[12px] leading-5">
            <p>{eduLine || "إدارة التعليم: ………………"}</p>
            {gov ? <p>{gov.startsWith("محافظة") ? gov : `محافظة ${gov}`}</p> : null}
            <p className="font-semibold">{schoolLine}</p>
          </div>
        </div>
      </div>
      <div className="official-accent h-px bg-[#00857c]" />
    </header>
  );
}

function StudentIdentity({
  name,
  classLine,
  studentWord,
}: {
  name: string;
  classLine: string;
  studentWord: string;
}) {
  return (
    <table className="official-table mb-3">
      <thead>
        <tr>
          <th>اسم {studentWord}</th>
          <th>الصف / الفصل</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="py-2.5 text-[18px] font-semibold leading-7">{name || "………………"}</td>
          <td className="py-2.5 text-[16px] font-semibold leading-7">{classLine || "………………"}</td>
        </tr>
      </tbody>
    </table>
  );
}

function ViolationStrip({
  violation,
  degree,
  day,
  weekday,
  period,
  subject,
  time,
}: {
  violation: string;
  degree: string;
  day: string;
  weekday: string;
  period: string;
  subject: string;
  time: string;
}) {
  const cells = [
    ["المخالفة / الموضوع", violation || "………………"],
    ["الدرجة", degree || "…………"],
    ["اليوم والتاريخ", [weekday || "…………", day || "………………", time].filter(Boolean).join(" — ")],
    ["الحصة / المادة", [period, subject].filter(Boolean).join(" · ") || "………………"],
  ];
  return (
    <div className="official-meta mb-3 grid grid-cols-2 overflow-hidden rounded-sm border border-black text-center sm:grid-cols-4">
      {cells.map(([label, value]) => (
        <div key={label} className="border-l border-black px-1.5 py-1.5 last:border-l-0">
          <p className="text-[11px] font-semibold text-[#00857c]">{label}</p>
          <p className="text-[13px] font-medium leading-6">{value}</p>
        </div>
      ))}
    </div>
  );
}

function Dotted({ value }: { value: string }) {
  return <strong className="underline decoration-dotted underline-offset-4">{value}</strong>;
}

function SignRow({
  items,
  note,
}: {
  items: { title: string; name?: string }[];
  note?: string;
}) {
  return (
    <>
      {note ? <ActionNoteBox note={note} /> : null}
      <div className="mt-5 grid grid-cols-3 gap-3 text-center text-[12px] leading-6">
        {items.map((item) => (
          <div key={item.title}>
            <p className="font-semibold">{item.title}</p>
            <p>الاسم: {item.name || "………………"}</p>
            <p>التوقيع: ………………</p>
            <p>التاريخ: ………………</p>
          </div>
        ))}
      </div>
    </>
  );
}

function NamesTail({ note, children }: { note?: string; children: ReactNode }) {
  return (
    <>
      {note ? <ActionNoteBox note={note} /> : null}
      {children}
    </>
  );
}

function RepeatBox({ ctx }: { ctx: FormCtx }) {
  if (ctx.occurrence <= 1 && ctx.previous.length === 0) return null;
  return (
    <div className="official-tint my-2 rounded-sm border border-[#00857c] px-3 py-2 text-[12px] leading-6">
      <p className="font-semibold text-[#00857c]">
        هذه {occurrenceLabel(ctx.occurrence)} لنفس المخالفة
        {ctx.focus?.behaviorTypeName ? ` (${ctx.focus.behaviorTypeName})` : ""}.
      </p>
      {ctx.previous.length ? (
        <table className="official-table mt-1">
          <thead>
            <tr>
              {["المرة", "اليوم والتاريخ", "الحصة", "المادة", "الإجراء السابق"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ctx.previous.slice(0, 4).map((n, i) => (
              <tr key={`${n.createdAt}-${i}`}>
                <td>{occurrenceLabel(n.occurrence || i + 1)}</td>
                <td>{formatStamp(n.createdAt)}</td>
                <td>{n.periodKey ? periodShort(n.periodKey, ctx.season, ctx.schedules) : "—"}</td>
                <td>{n.teacherSubject || "—"}</td>
                <td>{actionDisplay(n.actionTaken) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

function ProcedureList({ ctx }: { ctx: FormCtx }) {
  const list = ctx.actionSteps.filter((s) => s.trim() && s.replace(/[.…\s]/g, "").length > 0);
  if (!list.length) return null;
  return (
    <div className="my-2 rounded-sm border border-black px-3 py-2">
      <p className="font-semibold">
        {ctx.stageLabel} وفق قواعد السلوك والمواظبة
        {ctx.occurrence > 1 ? ` — ${occurrenceLabel(ctx.occurrence)}` : ""}:
      </p>
      <ol className="list-decimal pr-5 leading-7">
        {list.slice(0, 6).map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>
  );
}

function CompensationLine({ ctx }: { ctx: FormCtx }) {
  if (!ctx.showCompensation || !ctx.compensation) return null;
  return (
    <p className="rounded-sm border border-black px-3 py-2 text-[13.5px] leading-7">
      فرص تعويض درجات السلوك المتاحة للطالب: {ctx.compensation}
    </p>
  );
}

function PledgeBody({ ctx }: { ctx: FormCtx }) {
  return (
    <div className="space-y-2 text-[13.5px] leading-8">
      <p>
        أنا {ctx.studentWord} <Dotted value={ctx.name} /> بالصف <Dotted value={ctx.classLine} />
      </p>
      <p>
        أنني قمت في يوم <Dotted value={ctx.weekday} /> الموافق <Dotted value={ctx.day} /> هجريًا{" "}
        <Dotted value={ctx.hijri} />
        {ctx.period ? (
          <>
            {" "}
            في <Dotted value={ctx.period} />
          </>
        ) : null}
        {ctx.subject ? (
          <>
            {" "}
            مادة <Dotted value={ctx.subject} />
          </>
        ) : null}
      </p>
      <p>
        بمشكلة سلوكية من الدرجة <Dotted value={ctx.degree} /> وهي <Dotted value={ctx.violation} />
      </p>
      <RepeatBox ctx={ctx} />
      <ProcedureList ctx={ctx} />
      <CompensationLine ctx={ctx} />
      <p>وأتعهد بعدم تكرار أي مشكلة سلوكية مستقبلاً وعلى ذلك جرى التوقيع.</p>
      <SignRow
        note={ctx.actionNote}
        items={[
          { title: ctx.studentWord, name: ctx.name },
          { title: "ولي الأمر" },
          { title: ctx.principal, name: ctx.principalName },
        ]}
      />
    </div>
  );
}

function ReceiptBody({ ctx }: { ctx: FormCtx }) {
  return (
    <div className="space-y-3 text-[13.5px] leading-8">
      <p>
        أفيد أنا ولي أمر {ctx.studentWord} <Dotted value={ctx.name} /> بالصف{" "}
        <Dotted value={ctx.classLine} /> بأنني استلمت نسخة من قواعد السلوك والمواظبة لطلبة التعليم
        العام (الإصدار الخامس 1447هـ) الخاصة بـ <Dotted value={ctx.schoolName} />، واطلعت على ما ورد
        فيها، وأتعهد بالتعاون مع إدارة المدرسة لتطبيقها.
      </p>
      <p>اسم ولي الأمر: …………………………………… رقم الهوية: ……………………</p>
      <p>الجوال: {ctx.parentPhone || "……………………"}</p>
      <SignRow
        note={ctx.actionNote}
        items={[
          { title: "ولي الأمر" },
          { title: ctx.principal, name: ctx.principalName },
        ]}
      />
    </div>
  );
}

function CommitmentBody({ ctx }: { ctx: FormCtx }) {
  return (
    <div className="space-y-3 text-[13px] leading-7">
      <p>
        الاسم: <Dotted value={ctx.name} />
        <span className="mx-4">
          المرحلة: <Dotted value={ctx.stageLine} />
        </span>
        الصف: <Dotted value={ctx.classLine} />
      </p>
      <div className="rounded border border-black p-3">
        <p className="mb-1 text-[11px] font-semibold">خاص ب{ctx.studentWord}</p>
        <p>
          نعم أنا {ctx.studentWord} الموضح اسمه وبياناته أعلاه، قد اطلعت على محتوى قواعد السلوك
          والمواظبة، وبناء عليه أتعهد أن ألتزم بالأنظمة والتعليمات الخاصة بها.
        </p>
        <p className="mt-2">التوقيع: ……………… التاريخ: / / 14هـ</p>
      </div>
      <div className="rounded border border-black p-3">
        <p className="mb-1 text-[11px] font-semibold">خاص بولي الأمر</p>
        <p>
          نعم أنا ولي أمر {ctx.studentWord} الموضح اسمه أعلاه، قد اطلعت على محتوى قواعد السلوك
          والمواظبة، وأتعهد أن أتعاون مع إدارة المدرسة في سبيل مصلحة ابني / ابنتي، وأتحمل مسؤولية
          صحة أرقام التواصل التالية:
        </p>
        <p className="mt-1">الاسم: ……………… العمل: ………………</p>
        <p>هاتف العمل: ……………… هاتف المنزل: ………………</p>
        <p>رقم الجوال: {ctx.parentPhone || "………………"} رقم آخر: ………………</p>
        <p className="mt-1">التوقيع: ……………… التاريخ: / / 14هـ</p>
      </div>
      <p className="text-[11px] leading-5">
        ملحوظة: يؤخذ توقيع {ctx.studentWord} وولي الأمر في بداية العام الدراسي، وتحفظ النماذج لدى{" "}
        {ctx.counselor}.
      </p>
    </div>
  );
}

function NoticeBody({ ctx }: { ctx: FormCtx }) {
  return (
    <div className="space-y-2 text-[13.5px] leading-8">
      <p>
        المكرم ولي أمر {ctx.studentWord} <Dotted value={ctx.name} /> بالصف{" "}
        <Dotted value={ctx.classLine} />
      </p>
      <p>السلام عليكم ورحمة الله وبركاته</p>
      <p>
        نشعركم بأن {ctx.studentWord} {ctx.did} بمشكلة سلوكية من الدرجة <Dotted value={ctx.degree} /> وهي{" "}
        <Dotted value={ctx.violation} />
        {ctx.period ? (
          <>
            {" "}
            في <Dotted value={ctx.period} />
          </>
        ) : null}
        {ctx.subject ? (
          <>
            {" "}
            مادة <Dotted value={ctx.subject} />
          </>
        ) : null}
      </p>
      <RepeatBox ctx={ctx} />
      <ProcedureList ctx={ctx} />
      <CompensationLine ctx={ctx} />
      <p>لذا يرجى منكم المتابعة والتعاون مع المدرسة بما يسهم في انضباط سلوك ابنكم / ابنتكم.</p>
      <NamesTail note={ctx.actionNote}>
      <div className="mt-6 flex justify-between">
        <p className="text-[12px]">الختم</p>
        <div className="text-center text-[12px] leading-6">
          <p className="font-semibold">{ctx.principal}</p>
          <p>الاسم: {ctx.principalName || "………………"}</p>
          <p>التوقيع: ………………</p>
        </div>
      </div>
      </NamesTail>
    </div>
  );
}

function InviteBody({ ctx }: { ctx: FormCtx }) {
  return (
    <div className="space-y-2 text-[13.5px] leading-8">
      <p>
        المكرم ولي أمر {ctx.studentWord} <Dotted value={ctx.name} /> بالصف{" "}
        <Dotted value={ctx.classLine} />
      </p>
      <p>السلام عليكم ورحمة الله وبركاته</p>
      <p>
        نأمل منكم الحضور إلى المدرسة في يوم <Dotted value={ctx.weekday} /> الموافق{" "}
        <Dotted value={ctx.day} /> هجريًا <Dotted value={ctx.hijri} /> لمقابلة {ctx.principal}، وذلك
        بهدف مناقشة مشكلة سلوكية ({ctx.violation}).
      </p>
      <p>شاكرين لكم تعاونكم معنا لتحقيق مصلحة {ctx.studentWord}.</p>
      <NamesTail note={ctx.actionNote}>
      <div className="mt-4 flex justify-between">
        <p className="text-[12px]">الختم</p>
        <div className="text-center text-[12px] leading-6">
          <p className="font-semibold">{ctx.principal}</p>
          <p>الاسم: {ctx.principalName || "………………"}</p>
          <p>التوقيع: ………………</p>
        </div>
      </div>
      </NamesTail>
      <div className="mt-4 border-t border-black pt-2 text-[13px] leading-7">
        <p className="font-semibold">رد ولي الأمر:</p>
        <p>☐ أقر بالعلم، وسأحضر في الموعد المحدد.</p>
        <p>☐ أقر بالعلم، وأرغب بتغيير الموعد (خلال نفس الأسبوع)، وذلك في يوم ……………… الموافق / / 14هـ</p>
        <p>الاسم: ……………… التوقيع: ……………… التاريخ: ………………</p>
      </div>
    </div>
  );
}

function ReferralBody({ ctx }: { ctx: FormCtx }) {
  return (
    <div className="space-y-2 text-[13.5px] leading-8">
      <p>المكرم الموجه الطلابي / الموجهة الطلابية</p>
      <p>السلام عليكم ورحمة الله وبركاته</p>
      <p>
        نحيل إليكم {ctx.studentWord} <Dotted value={ctx.name} /> بالصف{" "}
        <Dotted value={ctx.classLine} /> ذي المشكلة السلوكية من الدرجة <Dotted value={ctx.degree} /> وهي{" "}
        <Dotted value={ctx.violation} />
      </p>
      <RepeatBox ctx={ctx} />
      <p>يرجى متابعة الحالة ودراسة وضعها ووضع الحلول التربوية والعلاجية المناسبة.</p>
      <NamesTail note={ctx.actionNote}>
      <div className="mt-8 flex justify-between">
        <p className="text-[12px]">الختم</p>
        <div className="text-center text-[12px] leading-6">
          <p className="font-semibold">{ctx.counselor}</p>
          <p>الاسم: {ctx.counselorName || "………………"}</p>
          <p>التوقيع: ………………</p>
        </div>
      </div>
      </NamesTail>
    </div>
  );
}

function AttendanceBody({ ctx }: { ctx: FormCtx }) {
  const days = ctx.absenceNotes.length ? String(ctx.absenceNotes.length) : "…………";
  const dates = ctx.absenceNotes.map((n) => formatDay(n.createdAt)).join("، ") || "………………";
  return (
    <div className="space-y-3 text-[13.5px] leading-8">
      <p>
        أنا {ctx.studentWord} <Dotted value={ctx.name} /> بالصف <Dotted value={ctx.classLine} />
      </p>
      <p>
        أنني تغيبت عن الحضور للمدرسة بدون عذر لمدة <Dotted value={days} /> أيام، بتاريخ{" "}
        <Dotted value={dates} />
      </p>
      <p>وأتعهد بالالتزام بالخطة التربوية والعلاجية المقدمة لتحسين الحضور، وعلى ذلك جرى التوقيع.</p>
      <SignRow
        note={ctx.actionNote}
        items={[
          { title: ctx.studentWord, name: ctx.name },
          { title: "ولي الأمر" },
          { title: ctx.principal, name: ctx.principalName },
        ]}
      />
    </div>
  );
}

function RecordBody({ ctx }: { ctx: FormCtx }) {
  const rows = ctx.behaviorNotes.slice(0, 6);
  if (!rows.length) {
    return <p className="py-4 text-center text-[13px]">لا توجد مخالفات مسجّلة في السجل.</p>;
  }
  return (
    <div className="space-y-2 text-[13px]">
      <table className="official-table">
        <thead>
          <tr>
            {[
              "المشكلة السلوكية",
              "نوعها ودرجتها",
              "تاريخها",
              "درجات السلوك المحسومة",
              "الإجراءات المتخذة",
              "تاريخ الإجراء",
              "توقيع الطالب",
              "توقيع ولي الأمر",
            ].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((n, i) => (
            <tr key={n?.createdAt ?? i}>
              <td>{n?.behaviorTypeName || n?.details || ""}</td>
              <td>{n ? `الدرجة ${degreeLabel(n.behaviorDegree) || "—"}` : ""}</td>
              <td>{n ? formatDay(n.createdAt) : ""}</td>
              <td />
              <td>{actionDisplay(n?.actionTaken)}</td>
              <td>{n?.actionTaken ? formatDay(n.createdAt) : ""}</td>
              <td />
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      {ctx.actionNote ? <ActionNoteBox note={ctx.actionNote} /> : null}
      <div className="pt-3 text-center text-[12px] leading-6">
        <p className="font-semibold">{ctx.principal}</p>
        <p>الاسم: {ctx.principalName || "………………"} — التوقيع: ……………… — التاريخ: ………………</p>
      </div>
    </div>
  );
}

function TeacherLogBody({ ctx }: { ctx: FormCtx }) {
  const rows = ctx.behaviorNotes.slice(0, 7);
  const teacher = ctx.behaviorNotes.find((n) => n.teacherName)?.teacherName || "";
  if (!rows.length) {
    return (
      <p className="py-4 text-center text-[13px]">لا توجد مخالفات مسجّلة لعرضها في السجل.</p>
    );
  }
  return (
    <div className="space-y-2 text-[13px]">
      <table className="official-table">
        <thead>
          <tr>
            {[
              "المشكلة السلوكية",
              "درجة المشكلة",
              "الإجراء المتخذ",
              "مدى الاستجابة",
              "عدد مرات التكرار",
              "التاريخ",
              "الحصة",
            ].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((n, i) => (
            <tr key={n?.createdAt ?? i}>
              <td>{n?.behaviorTypeName || n?.details || ""}</td>
              <td>{n ? degreeLabel(n.behaviorDegree) : ""}</td>
              <td>{actionDisplay(n?.actionTaken)}</td>
              <td />
              <td>{n?.occurrence ? occurrenceLabel(n.occurrence) : ""}</td>
              <td>{n ? formatDay(n.createdAt) : ""}</td>
              <td>{n ? periodShort(n.periodKey, ctx.season, ctx.schedules) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {ctx.actionNote ? <ActionNoteBox note={ctx.actionNote} /> : null}
      <div className="pt-3 text-center text-[12px] leading-6">
        <p className="font-semibold">المعلم / المعلمة</p>
        <p>الاسم: {teacher || "………………"} — التوقيع: ……………… — التاريخ: ………………</p>
      </div>
    </div>
  );
}

function PlanBody({ ctx }: { ctx: FormCtx }) {
  return (
    <div className="space-y-2 text-[13.5px] leading-7">
      <p className="font-semibold">أولاً: تحديد المشكلة السلوكية</p>
      <p>
        المشكلة: <Dotted value={ctx.violation} /> درجتها: <Dotted value={ctx.degree} />
      </p>
      <RepeatBox ctx={ctx} />
      <p>وصف المشكلة / المظاهر: {ctx.focus?.details || "—"}</p>
      <p className="font-semibold">ثالثاً: الإجراءات المستخدمة</p>
      {ctx.actionSteps.filter((s) => s.trim()).length ? (
        <ol className="list-decimal pr-5">
          {ctx.actionSteps
            .filter((s) => s.trim())
            .slice(0, 6)
            .map((s, i) => (
              <li key={i}>{s}</li>
            ))}
        </ol>
      ) : null}
      <p className="font-semibold">رابعاً: تقييم فاعلية الخطة</p>
      <p>رأي {ctx.counselor}: …………………………………………</p>
      <p>رأي معلم الفصل: …………………………………………</p>
      <p>رأي ولي الأمر: …………………………………………</p>
      <SignRow
        note={ctx.actionNote}
        items={[
          { title: "القائم بتعديل السلوك" },
          { title: ctx.counselor, name: ctx.counselorName },
          { title: ctx.principal, name: ctx.principalName },
        ]}
      />
    </div>
  );
}

function CompensationBody({ ctx }: { ctx: FormCtx }) {
  const rows = ctx.behaviorNotes.slice(0, 5);
  if (!rows.length) {
    return <p className="py-4 text-center text-[13px]">لا توجد مخالفات لعرض فرص التعويض.</p>;
  }
  return (
    <div className="space-y-2 text-[13px]">
      <table className="official-table">
        <thead>
          <tr>
            {["المشكلة السلوكية", "نوعها ودرجتها", "درجات السلوك المحسومة", "فرص التعويض", "الدرجات المكتسبة", "توقيع الطالب"].map(
              (h) => (
                <th key={h}>{h}</th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((n, i) => (
            <tr key={n?.createdAt ?? i}>
              <td>{n?.behaviorTypeName || n?.details || ""}</td>
              <td>{n ? degreeLabel(n.behaviorDegree) : ""}</td>
              <td />
              <td>{n?.compensation || ""}</td>
              <td />
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      {ctx.actionNote ? <ActionNoteBox note={ctx.actionNote} /> : null}
      <div className="pt-3 text-center text-[12px] leading-6">
        <p className="font-semibold">{ctx.principal}</p>
        <p>الاسم: {ctx.principalName || "………………"} — التوقيع: ………………</p>
      </div>
    </div>
  );
}

function ExcellenceBody({ ctx }: { ctx: FormCtx }) {
  return (
    <div className="space-y-2 text-[13px]">
      <table className="official-table">
        <thead>
          <tr>
            {[
              "موضوع ممارسة السلوك المتميز",
              "نوع الممارسة",
              "تاريخ التنفيذ",
              "شواهد السلوك المتميز",
              "الدرجة المكتسبة",
              "اسم راصد السلوك",
              "التوقيع",
            ].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 8 }).map((_, i) => (
            <tr key={i}>
              {Array.from({ length: 7 }).map((__, j) => (
                <td key={j} className="h-7" />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {ctx.actionNote ? <ActionNoteBox note={ctx.actionNote} /> : null}
      <div className="pt-3 text-center text-[12px] leading-6">
        <p className="font-semibold">{ctx.principal}</p>
        <p>الاسم: {ctx.principalName || "………………"} — التوقيع: ………………</p>
      </div>
    </div>
  );
}

function IncidentBody({ ctx }: { ctx: FormCtx }) {
  return (
    <div className="space-y-2 text-[14px] leading-7">
      <p>
        المشكلة السلوكية: <Dotted value={ctx.violation} /> درجتها: <Dotted value={ctx.degree} />
      </p>
      <RepeatBox ctx={ctx} />
      <p>نوع المشاهدة المضبوطة: ☐ صور ☐ مقاطع فيديو ☐ محادثات ☐ أخرى ………………</p>
      <p>مكان ضبط الواقعة: …………………………………… شهود الواقعة: ……………………</p>
      <table className="official-table">
        <thead>
          <tr>
            {["م", "الاسم", "الوظيفة", "العمل المسند إليه", "التوقيع"].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td />
              <td />
              <td />
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      <SignRow
        note={ctx.actionNote}
        items={[
          { title: ctx.studentWord, name: ctx.name },
          { title: "ولي الأمر" },
          { title: ctx.principal, name: ctx.principalName },
        ]}
      />
    </div>
  );
}

function CommitteeBody({ ctx }: { ctx: FormCtx }) {
  return (
    <div className="space-y-2 text-[13px] leading-7">
      <p>
        وصف المشكلة السلوكية: <Dotted value={ctx.violation} />
      </p>
      <p>
        تصنيف المشكلة: الدرجة <Dotted value={ctx.degree} />
      </p>
      <RepeatBox ctx={ctx} />
      <p>قرارات اللجنة:</p>
      {ctx.actionSteps.filter((s) => s.trim()).length ? (
        <ol className="list-decimal pr-5">
          {ctx.actionSteps
            .filter((s) => s.trim())
            .slice(0, 4)
            .map((s, i) => (
              <li key={i}>{s}</li>
            ))}
        </ol>
      ) : null}
      <table className="official-table">
        <thead>
          <tr>
            {["م", "اسم العضو", "الوظيفة", "العمل المسند إليه", "التوقيع"].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            ["1", ctx.counselorName || "", ctx.counselor, "رئيس / رئيسة"],
            ["2", "", "وكيل الشؤون التعليمية", "عضو"],
            ["3", "", "الموجه الطلابي", "مقرر / مقررة"],
            ["4", "", "معلم متميز", "عضو"],
            ["5", "", "معلم متميز", "عضو"],
            ["6", "", "معلم متميز", "عضو"],
          ].map((row) => (
            <tr key={row[0]}>
              {row.map((c, i) => (
                <td key={i}>{c}</td>
              ))}
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      {ctx.actionNote ? <ActionNoteBox note={ctx.actionNote} /> : null}
      <div className="pt-2 text-center text-[12px] leading-6">
        <p className="font-semibold">{ctx.principal}</p>
        <p>الاسم: {ctx.principalName || "………………"} — التوقيع: ………………</p>
      </div>
    </div>
  );
}

function ViolenceBody({ ctx }: { ctx: FormCtx }) {
  return (
    <div className="space-y-2 text-[12.5px] leading-7">
      <p className="text-center text-[11px] font-semibold">(سري للغاية)</p>
      <p>اليوم: {ctx.weekday} — التاريخ: {ctx.day} — الساعة: ………………</p>
      <table className="official-table">
        <tbody>
          <tr>
            <th className="w-1/3">ملخص المشكلة</th>
            <td>{ctx.violation}</td>
          </tr>
          <tr>
            <th>أبرز الإجراءات المتخذة</th>
            <td>{ctx.actionSteps.join(" — ") || "………………"}</td>
          </tr>
        </tbody>
      </table>
      {ctx.actionNote ? <ActionNoteBox note={ctx.actionNote} /> : null}
      <div className="pt-3 text-center text-[12px] leading-6">
        <p className="font-semibold">{ctx.principal}</p>
        <p>الاسم: {ctx.principalName || "………………"} — التوقيع: ……………… — الختم المدرسي</p>
      </div>
    </div>
  );
}

function RiskBody({ ctx }: { ctx: FormCtx }) {
  return (
    <div className="space-y-2 text-[13px] leading-7">
      <p className="text-center text-[11px] font-semibold">(سري للغاية)</p>
      <p>وصف الحالة: {ctx.violation}</p>
      <p>
        اسم راصد الحالة: {ctx.focus?.teacherName || "………………"} تاريخ الرصد: {ctx.day} وقت الرصد: ………………
      </p>
      <p className="font-semibold">الإجراءات المتخذة مع الحالة:</p>
      {[
        "تبليغ إدارة التعليم",
        "تبليغ الجهات الأمنية",
        "تبليغ الحماية من العنف الأسري وحماية الطفل",
        "تبليغ وزارة الصحة",
        "التواصل مع الأسرة لإخطارها بوضع الحالة",
        "عقد اجتماع طارئ للجنة التوجيه الطلابي",
        "رفع بلاغ عن الحالة في الأنظمة التقنية الخاصة بالبلاغات",
      ].map((item) => (
        <p key={item}>☐ {item}</p>
      ))}
      {ctx.actionNote ? <ActionNoteBox note={ctx.actionNote} /> : null}
      <div className="pt-2 text-center text-[12px] leading-6">
        <p className="font-semibold">{ctx.principal}</p>
        <p>الاسم: {ctx.principalName || "………………"} — التوقيع: ………………</p>
      </div>
    </div>
  );
}

function AbsenceExcusedBody({ ctx }: { ctx: FormCtx }) {
  return (
    <div className="space-y-2 text-[13px]">
      <table className="official-table">
        <thead>
          <tr>
            {["عدد أيام الغياب", "الإجراء المتخذ", "تاريخ الإجراء", "توقيع الطالب", "توقيع ولي الأمر"].map(
              (h) => (
                <th key={h}>{h}</th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {["3 أيام", "5 أيام", "10 أيام"].map((d) => (
            <tr key={d}>
              <td>{d}</td>
              <td />
              <td />
              <td />
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      {ctx.actionNote ? <ActionNoteBox note={ctx.actionNote} /> : null}
      <div className="pt-3 text-center text-[12px] leading-6">
        <p className="font-semibold">{ctx.principal}</p>
        <p>الاسم: {ctx.principalName || "………………"} — التوقيع: ………………</p>
      </div>
    </div>
  );
}

function AbsenceUnexcusedBody({ ctx }: { ctx: FormCtx }) {
  return (
    <div className="space-y-2 text-[13px]">
      <table className="official-table">
        <thead>
          <tr>
            {[
              "عدد أيام الغياب",
              "الإجراء المتخذ",
              "تاريخ الإجراء",
              "توقيع الطالب",
              "توقيع ولي الأمر",
              "عدد درجات المواظبة المحسومة",
            ].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {["3 أيام", "3 أيام متصلة", "5 أيام", "10 أيام"].map((d) => (
            <tr key={d}>
              <td>{d}</td>
              <td />
              <td />
              <td />
              <td />
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      {ctx.actionNote ? <ActionNoteBox note={ctx.actionNote} /> : null}
      <div className="pt-3 text-center text-[12px] leading-6">
        <p className="font-semibold">{ctx.principal}</p>
        <p>الاسم: {ctx.principalName || "………………"} — التوقيع: ………………</p>
      </div>
    </div>
  );
}
