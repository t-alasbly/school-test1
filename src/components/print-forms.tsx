import { Fragment, useEffect, useRef, useState } from "react";
import { tr } from "@/lib/school/i18n";
import { Printer } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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
  procedureStageLabel,
  proceduresFor,
  schoolLogoSrc,
  sharedParticipantNames,
  stageIndexFor,
  studentNoun,
  weekdayName,
} from "@/lib/school/constants";
import { printElement } from "@/lib/school/print";
import type { School } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";

export type FormKind = (typeof FORM_ORDER)[number];
export type FormOverrides = Partial<{
  name: string;
  classLine: string;
  violation: string;
  degree: string;
  day: string;
  weekday: string;
  period: string;
  subject: string;
  extra: string;
  actionText: string;
}>;
export type PrintableNote = {
  type: string;
  details: string;
  behaviorTypeName?: string | null;
  behaviorDegree?: number | null;
  periodKey?: string;
  actionTaken?: string | null;
  createdAt: string;
  occurredAt?: string;
  teacherName?: string;
  teacherSubject?: string;
  occurrence?: number;
  suggestedAction?: string;
  compensation?: string;
};

export const FORM_ORDER = [
  "pledge",
  "notice",
  "deduction",
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
] as const;
export const FORM_META: Record<string, { title: string; confidential?: boolean }> = {
  commitment: {
    title: tr("نموذج الالتزام المدرسي"),
  },
  excellence: {
    title: tr("نموذج رصد درجات السلوك المتميز"),
  },
  plan: {
    title: tr("نموذج خطة تعديل السلوك"),
  },
  "teacher-log": {
    title: tr("نموذج رصد المعلم لمشكلة سلوكية"),
  },
  record: {
    title: tr("نموذج رصد المشكلات السلوكية"),
  },
  compensation: {
    title: tr("نموذج فرص تعويض درجات السلوك الإيجابي"),
  },
  referral: {
    title: tr("إحالة طالب / طالبة"),
    confidential: true,
  },
  pledge: {
    title: tr("تعهد سلوكي"),
  },
  notice: {
    title: tr("إشعار ولي الأمر بمشكلة سلوكية"),
    confidential: true,
  },
  deduction: {
    title: tr("إشعار خصم درجات السلوك"),
    confidential: true,
  },
  invite: {
    title: tr("خطاب دعوة ولي الأمر"),
  },
  incident: {
    title: tr("محضر ضبط واقعة"),
    confidential: true,
  },
  committee: {
    title: tr("محضر اجتماع لجنة التوجيه الطلابي"),
    confidential: true,
  },
  violence: {
    title: tr("إبلاغ عن حالة إيذاء"),
    confidential: true,
  },
  risk: {
    title: tr("إبلاغ عن حالة عالية الخطورة"),
    confidential: true,
  },
  "absence-excused": {
    title: tr("نموذج إجراءات الغياب بعذر"),
  },
  "absence-unexcused": {
    title: tr("نموذج إجراءات الغياب بدون عذر"),
  },
  attendance: {
    title: tr("تعهد الالتزام بالحضور"),
  },
  receipt: {
    title: tr("إفادة استلام قواعد السلوك"),
  },
};
export function notesToPrintable(notes) {
  const now = new Date().toISOString();
  return notes.map((n) => ({
    type: n.type,
    details: n.details,
    behaviorTypeName: n.behaviorTypeName,
    behaviorDegree: n.behaviorDegree ?? null,
    periodKey: n.periodKey,
    actionTaken: n.actionTaken ?? "",
    createdAt: n.createdAt ?? now,
    occurredAt: n.occurredAt ?? n.createdAt ?? now,
    teacherName: n.teacherName ?? "",
    teacherSubject: n.teacherSubject ?? "",
    occurrence: n.occurrence,
    suggestedAction: n.suggestedAction,
    compensation: n.compensation,
  }));
}
export function PrintFormsButton({
  student,
  notes,
  defaultKind,
  label = tr("طباعة نموذج"),
  size = "sm",
  studentId,
  className,
  appointment,
}) {
  const [open, setOpen] = useState(false);
  return (
    <Fragment>
      <Button
        type="button"
        size={size}
        variant="secondary"
        className={className}
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
        appointment={appointment}
      />
    </Fragment>
  );
}
function PrintFormsDialog({
  open,
  onOpenChange,
  student,
  notes,
  defaultKind,
  studentId,
  appointment,
}) {
  const { school } = useWorkspace();
  const [kind, setKind] = useState(defaultKind ?? "pledge");
  const [noteIdx, setNoteIdx] = useState(0);
  const [manual, setManual] = useState(false);
  const [overrides, setOverrides] = useState({});
  const [showCompensation, setShowCompensation] = useState(true);
  const [showParticipants, setShowParticipants] = useState(true);
  const [showProcedure, setShowProcedure] = useState(true);
  const sheetRef = useRef(null);
  const historyNotes = useQuery({
    queryKey: ["student", studentId, "print-forms"],
    queryFn: () =>
      getStudentNotes({
        data: {
          studentId,
        },
      }),
    enabled: open && studentId != null,
  }).data?.notes;
  const allNotes = historyNotes?.length
    ? notesToPrintable(historyNotes)
    : notes;
  const seedAt = notes[0]?.createdAt;
  const seedType = notes[0]?.type;
  useEffect(() => {
    if (!open) return;
    setKind(
      defaultKind && FORM_ORDER.includes(defaultKind) ? defaultKind : "pledge",
    );
    if (!seedAt) {
      setNoteIdx(0);
      return;
    }
    const idx = (
      historyNotes?.length ? notesToPrintable(historyNotes) : notes
    ).findIndex((n) => n.createdAt === seedAt && n.type === seedType);
    setNoteIdx(idx >= 0 ? idx : 0);
  }, [open, defaultKind, historyNotes, seedAt, seedType, notes]);
  const selected = allNotes[noteIdx] ?? null;
  const participants = sharedParticipantNames(selected?.details);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader className="no-print">
          <DialogTitle>نماذج الوزارة — {student.name}</DialogTitle>
        </DialogHeader>
        <div className="no-print mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1 space-y-1.5">
            <Label htmlFor="form-kind">{tr("النموذج")}</Label>
            <Select
              id="form-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {FORM_ORDER.map((k) => (
                <option value={k}>{tr(FORM_META[k].title)}</option>
              ))}
            </Select>
          </div>
          {allNotes.length > 1 ? (
            <div className="min-w-48 flex-1 space-y-1.5">
              <Label htmlFor="form-note">{tr("الملاحظة المعتمدة للتعبئة")}</Label>
              <Select
                id="form-note"
                value={String(noteIdx)}
                onChange={(e) => setNoteIdx(Number(e.target.value))}
              >
                {allNotes.map((n, i) => (
                  <option value={i}>
                    {(n.behaviorTypeName || n.details || tr("ملاحظة")) +
                      (n.createdAt ? ` — ${formatDay(n.createdAt)}` : "")}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <Button
            onClick={() => sheetRef.current && printElement(sheetRef.current)}
          >
            <Printer className="size-4" />
            {tr("طباعة")}
          </Button>
          <span className="text-xs text-fg-muted">في نافذة الطباعة اترك الهوامش على «افتراضي»</span>
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
          {kind === "pledge" && participants.length > 0 ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-bg-elevated px-3 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={showParticipants}
                onChange={(e) => setShowParticipants(e.target.checked)}
              />
              إضافة أسماء المشاركين في التعهد
            </label>
          ) : null}
          {kind === "pledge" ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-bg-elevated px-3 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={showProcedure}
                onChange={(e) => setShowProcedure(e.target.checked)}
              />
              إظهار الإجراء أسفل التعهد
            </label>
          ) : null}
        </div>
        {manual ? (
          <div className="no-print mb-4 grid gap-3 rounded-[var(--radius-md)] border border-border bg-bg-elevated p-3 sm:grid-cols-2">
            {[
              ["name", tr("اسم الطالب"), student.name],
              ["classLine", tr("الصف / الفصل"), student.classLabel],
              [
                "violation",
                tr("المخالفة / الموضوع"),
                selected?.behaviorTypeName || selected?.details || "",
              ],
              [
                "degree",
                tr("الدرجة"),
                selected?.behaviorDegree ? String(selected.behaviorDegree) : "",
              ],
              [
                "day",
                tr("التاريخ"),
                selected
                  ? formatDay(selected.occurredAt || selected.createdAt)
                  : "",
              ],
              [
                "weekday",
                tr("اليوم"),
                selected
                  ? weekdayName(selected.occurredAt || selected.createdAt)
                  : "",
              ],
              ["period", tr("الحصة"), ""],
              ["subject", tr("المادة"), selected?.teacherSubject || ""],
            ].map(([key, label, fallback]) => (
              <div className="space-y-1.5">
                <Label htmlFor={`ov-${key}`}>{label}</Label>
                <input
                  id={`ov-${key}`}
                  className="h-11 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 text-sm"
                  value={overrides[key] ?? fallback}
                  onChange={(e) =>
                    setOverrides((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }))
                  }
                />
              </div>
            ))}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ov-action">{tr("الإجراءات (سطر لكل إجراء)")}</Label>
              <textarea
                id="ov-action"
                className="min-h-20 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 py-2 text-sm"
                value={overrides.actionText ?? ""}
                onChange={(e) =>
                  setOverrides((prev) => ({
                    ...prev,
                    actionText: e.target.value,
                  }))
                }
                placeholder={tr("اتركه فارغاً لاستخدام الإجراء الرسمي تلقائياً")}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ov-extra">{tr("بيانات إضافية / ملاحظات يدوية")}</Label>
              <textarea
                id="ov-extra"
                className="min-h-16 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 py-2 text-sm"
                value={overrides.extra ?? ""}
                onChange={(e) =>
                  setOverrides((prev) => ({
                    ...prev,
                    extra: e.target.value,
                  }))
                }
                placeholder={tr("يظهر في النموذج أسفل بيانات المخالفة")}
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
          overrides={manual ? overrides : void 0}
          showCompensation={showCompensation && Boolean(selected?.compensation)}
          showParticipants={kind === "pledge" && showParticipants}
          showProcedure={kind === "pledge" && showProcedure}
          participants={participants}
          appointment={kind === "invite" ? appointment : undefined}
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
  showParticipants = false,
  showProcedure = false,
  participants = [],
  appointment,
  ref,
}) {
  const { behaviorTypes } = useWorkspace();
  const behaviorNotes = notes.filter((n) => n.type === "behavior");
  const absenceNotes = notes.filter((n) => n.type === "absence");
  const focus =
    selectedNote ??
    (kind === "attendance" || kind.startsWith("absence")
      ? absenceNotes[0]
      : behaviorNotes[0]) ??
    notes[0] ??
    null;
  const stamp = focus?.occurredAt || focus?.createdAt;
  const violation =
    overrides?.violation ||
    focus?.behaviorTypeName ||
    focus?.details ||
    "……………………";
  const degree =
    overrides?.degree || degreeLabel(focus?.behaviorDegree) || "…………";
  const weekday = appointment?.weekday || overrides?.weekday || (stamp ? weekdayName(stamp) : "…………");
  const day = appointment?.day || overrides?.day || (stamp ? formatDay(stamp) : "…………");
  const hijri = stamp ? hijriDate(stamp) : "…………";
  const studentWord = studentNoun(school.studentGender);
  const principal = principalTitle(school.leadershipGender);
  const counselor = counselorTitle(school.leadershipGender);
  const did = school.studentGender === "female" ? tr("قامت") : tr("قام");
  const previous = previousSame(notes, focus);
  const occurrence =
    focus?.occurrence ||
    (focus?.type === "behavior" ? Math.max(previous.length + 1, 1) : 1);
  const bt = behaviorTypes.find((b) => b.name === focus?.behaviorTypeName);
  const ladder = procedureLadder(focus?.behaviorDegree, bt?.procedures);
  const stageIdx = stageIndexFor(occurrence, ladder.length);
  const official = proceduresFor(
    focus?.behaviorDegree,
    occurrence,
    bt?.procedures,
  );
  const overrideSteps = overrides?.actionText
    ?.split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const parsedAction = parseActionTaken(
    focus?.actionTaken || focus?.suggestedAction,
  );
  const actionSteps = overrideSteps?.length
    ? overrideSteps
    : parsedAction.steps.length
      ? parsedAction.steps
      : official.length
        ? official
        : [];
  const period =
    overrides?.period ||
    (focus?.periodKey
      ? periodShort(focus.periodKey, school.season, school.schedules)
      : "");
  const subject = overrides?.subject || focus?.teacherSubject?.trim() || "";
  const ctx = {
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
    showParticipants: Boolean(showParticipants && participants.length),
    showProcedure: Boolean(showProcedure),
    participants,
    appointmentTime: appointment?.time || "",
  };
  return (
    <article
      ref={ref}
      className="print-form official-sheet bg-white text-black font-naskh"
    >
      <FormHeader school={school} confidential={FORM_META[kind].confidential} />
      <h2 className="mb-2 text-center text-[20px] font-semibold tracking-wide">
        {tr(FORM_META[kind].title)}
      </h2>
      <StudentIdentity
        name={ctx.name}
        classLine={ctx.classLine}
        studentWord={ctx.studentWord}
      />
      {kind === "receipt" ||
      kind === "commitment" ||
      kind === "excellence" ? null : (
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
      {kind === "deduction" ? <DeductionBody ctx={ctx} /> : null}
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
function parseActionTaken(action) {
  const raw = action?.trim() ?? "";
  if (!raw)
    return {
      steps: [],
      note: "",
    };
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
    const onlyNote = raw.match(
      /^ملاحظة(?:\s*على\s*الإجراء)?\s*[:：]\s*([\s\S]+)$/,
    );
    if (onlyNote) {
      body = "";
      note = onlyNote[1].trim();
    }
  }
  return {
    steps: body
      .split(/\n|;|؛|—/)
      .map((s) => s.replace(/^ملاحظة للمعلم:.*/, "").trim())
      .filter((s) => s.length > 0 && !/^ملاحظة\s*[:：]/.test(s)),
    note,
  };
}
function actionDisplay(action) {
  const parsed = parseActionTaken(action);
  return parsed.steps.join(" — ") || parsed.note || "";
}
function briefActionText(text: string | null | undefined, max = 46) {
  const raw = String(text ?? "").trim();
  if (!raw) return "—";
  const first = raw.split(/[،,؛;]/)[0].trim();
  return first.length > max ? first.slice(0, max - 1) + "…" : first;
}
function newStepsForOccurrence(steps: string[], degree: number | null | undefined, occurrence: number, ladder: string[][]) {
  const current = steps.length ? steps : proceduresFor(degree, occurrence, ladder);
  const prev = occurrence > 1 ? proceduresFor(degree, occurrence - 1, ladder) : [];
  const prevSet = new Set(prev);
  const news = current.filter((s) => s && !prevSet.has(s));
  return news.length ? news : current.slice(0, 1);
}
function ActionNoteBox({ note }) {
  if (!note.trim()) return null;
  return (
    <div className="my-2 rounded-sm border border-black px-3 py-2 text-[13.5px] leading-7">
      <p className="font-semibold">{tr("الملاحظات")}</p>
      <p>{note}</p>
    </div>
  );
}
function previousSame(notes, focus) {
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
function FormHeader({ school, confidential }) {
  return <OfficialLetterhead school={school} confidential={confidential} />;
}
export function OfficialLetterhead({
  school,
  confidential,
}: {
  school: School;
  confidential?: boolean;
}) {
  const line1 = school.region.trim();
  const line2 = school.governorate.trim();
  const line3 = school.name.trim();
  return (
    <header className="mb-3">
      <div className="official-accent h-1.5 bg-[#00857c]" />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-1 py-2">
        <div className="flex flex-col items-center justify-center px-1 text-center">
          <img
            src="/ksa-diwani.png"
            alt={tr("المملكة العربية السعودية")}
            className="ksa-diwani mx-auto h-[35px] w-auto max-w-full object-contain object-center"
          />
          <p className="ksa-ministry mt-0.5 text-[13px] font-semibold tracking-wide text-[#14532d]">
            {tr("وزارة التعليم")}
          </p>
          {confidential ? (
            <p className="mt-1 text-[12px] font-semibold text-[#00857c]">{tr("سري")}</p>
          ) : null}
        </div>
        <div className="flex items-center justify-center gap-2">
          <img
            src="/moe-logo.jpg"
            alt={tr("شعار وزارة التعليم")}
            className="h-[62px] w-auto max-w-[6.5rem] object-contain"
          />
          {school.extraLogoUrl ? (
            <img
              src={school.extraLogoUrl}
              alt={tr("شعار الرؤية")}
              className="h-[62px] w-auto max-w-[6.5rem] object-contain"
            />
          ) : null}
        </div>
        <div className="flex items-center justify-center gap-2 px-1">
          {school.printSchoolLogo && schoolLogoSrc(school.logoUrl) ? (
            <img
              src={schoolLogoSrc(school.logoUrl)}
              alt={tr("شعار المدرسة")}
              className="h-[62px] w-auto max-w-[5.5rem] object-contain"
            />
          ) : null}
          <div className="text-center text-[12px] leading-5">
            <p>{line1 || "………………"}</p>
            <p>{line2 || "………………"}</p>
            <p className="font-semibold">{line3 || "………………"}</p>
          </div>
        </div>
      </div>
      <div className="official-accent h-px bg-[#00857c]" />
    </header>
  );
}
function StudentIdentity({ name, classLine, studentWord }) {
  return (
    <table className="official-table mb-3">
      <thead>
        <tr>
          <th>اسم {studentWord}</th>
          <th>{tr("الصف / الفصل")}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="py-2.5 text-[18px] font-semibold leading-7">
            {name || "………………"}
          </td>
          <td className="py-2.5 text-[16px] font-semibold leading-7">
            {classLine || "………………"}
          </td>
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
}) {
  const cells = [
    [tr("المخالفة / الموضوع"), violation || "………………"],
    [tr("الدرجة"), degree || "…………"],
    [
      tr("اليوم والتاريخ"),
      [weekday || "…………", day || "………………", time].filter(Boolean).join(" — "),
    ],
    [
      tr("الحصة / المادة"),
      [period, subject].filter(Boolean).join(" · ") || "………………",
    ],
  ];
  const widths = ["minmax(0,2.6fr)", "minmax(0,0.55fr)", "minmax(0,0.95fr)", "minmax(0,0.9fr)"];
  return (
    <div
      className="official-meta mb-3 grid overflow-hidden rounded-sm border border-black text-center"
      style={{ gridTemplateColumns: widths.join(" ") }}
    >
      {cells.map(([label, value], i) => (
        <div className="border-l border-black px-1.5 py-1.5 last:border-l-0">
          <p className="text-[11px] font-semibold text-[#00857c]">{label}</p>
          <p className={`font-medium leading-6 ${i === 0 ? "text-[13.5px]" : "text-[12px]"}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}
function Dotted({ value }) {
  return (
    <strong className="underline decoration-dotted underline-offset-4">
      {value}
    </strong>
  );
}
function SignRow({ items, note }) {
  return (
    <Fragment>
      {note ? <ActionNoteBox note={note} /> : null}
      <div className="mt-5 grid grid-cols-3 gap-3 text-center text-[12px] leading-6">
        {items.map((item) => (
          <div>
            <p className="font-semibold">{tr(item.title)}</p>
            <p>الاسم: {item.name || "………………"}</p>
            <p>{tr("التوقيع: ………………")}</p>
            <p>{tr("التاريخ: ………………")}</p>
          </div>
        ))}
      </div>
    </Fragment>
  );
}
function NamesTail({ note, children }) {
  return (
    <Fragment>
      {note ? <ActionNoteBox note={note} /> : null}
      {children}
    </Fragment>
  );
}
function RepeatBox({ ctx }) {
  const { behaviorTypes } = useWorkspace();
  if (ctx.occurrence <= 1 && ctx.previous.length === 0) return null;
  const bt = behaviorTypes.find((b) => b.name === ctx.focus?.behaviorTypeName);
  const ladder = procedureLadder(ctx.focus?.behaviorDegree, bt?.procedures);
  const history = [...ctx.previous, ctx.focus].filter(Boolean);
  const rows = (history.length > 4 ? history.slice(-4) : history);
  const periodBare = (key) => {
    if (!key) return "—";
    const label = periodShort(key, ctx.season, ctx.schedules);
    return label.replace(/^الحصة\s*/, "").trim() || label;
  };
  const dateBare = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short" }).format(d);
  };
  return (
    <div className="official-tint my-2 rounded-sm border border-[#00857c] px-2 py-1.5 text-[11px] leading-5">
      {rows.length ? (
        <table className="official-table mt-1 text-[11px] font-semibold">
          <colgroup>
            <col style={{ width: "5%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "57%" }} />
          </colgroup>
          <thead>
            <tr>
              {[
                tr("المرة"),
                tr("اليوم والتاريخ"),
                tr("الحصة"),
                tr("المادة"),
                tr("الإجراء المتخذ"),
              ].map((h) => (
                <th className="!py-1">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((n, i) => {
              const occ = n.occurrence || i + 1;
              const recorded = parseActionTaken(n.actionTaken).steps;
              const news = newStepsForOccurrence(recorded, n.behaviorDegree ?? ctx.focus?.behaviorDegree, occ, ladder);
              const brief = briefActionText(news[0], 90);
              return (
                <tr className={n.id === ctx.focus?.id ? "bg-[#f3faf9]" : undefined}>
                  <td className="!py-1 font-bold">{occ}</td>
                  <td className="!py-1 font-bold">{dateBare(n.createdAt)}</td>
                  <td className="!py-1">{periodBare(n.periodKey)}</td>
                  <td className="!py-1">{n.teacherSubject || "—"}</td>
                  <td className="!py-1 text-right">{brief}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
function ProcedureList({ ctx }) {
  const { behaviorTypes } = useWorkspace();
  const bt = behaviorTypes.find((b) => b.name === ctx.focus?.behaviorTypeName);
  const ladder = procedureLadder(ctx.focus?.behaviorDegree, bt?.procedures);
  const cleaned = ctx.actionSteps.filter(
    (s) => s.trim() && s.replace(/[.…\s]/g, "").length > 0,
  );
  const list = newStepsForOccurrence(cleaned, ctx.focus?.behaviorDegree, ctx.occurrence, ladder);
  if (!list.length) return null;
  return (
    <div className="my-2 rounded-sm border border-black px-3 py-2">
      <p className="font-semibold">
        {ctx.stageLabel} وفق قواعد السلوك والمواظبة
        {ctx.occurrence > 1 ? ` — ${occurrenceLabel(ctx.occurrence)}` : ""}:
      </p>
      <ol className="list-decimal pr-5 leading-7">
        {list.map((s) => (
          <li>{s}</li>
        ))}
      </ol>
    </div>
  );
}
function CompensationLine({ ctx }) {
  if (!ctx.showCompensation || !ctx.compensation) return null;
  return (
    <p className="rounded-sm border border-black px-3 py-2 text-[13.5px] leading-7">
      فرص تعويض درجات السلوك المتاحة للطالب: {ctx.compensation}
    </p>
  );
}
function PledgeBody({ ctx }) {
  return (
    <div className="space-y-2 text-[13.5px] leading-8">
      {ctx.showParticipants && ctx.participants?.length ? (
        <p>
          والمشاركون في هذه المخالفة المشتركة:{" "}
          <Dotted value={ctx.participants.join(tr("، "))} />
        </p>
      ) : null}
      <RepeatBox ctx={ctx} />
      {ctx.showProcedure ? <ProcedureList ctx={ctx} /> : null}
      <CompensationLine ctx={ctx} />
      <p>{tr("وأتعهد بعدم تكرار أي مشكلة سلوكية مستقبلاً وعلى ذلك جرى التوقيع.")}</p>
      <SignRow
        note={ctx.actionNote}
        items={[
          {
            title: ctx.studentWord,
            name: ctx.name,
          },
          {
            title: tr("ولي الأمر"),
          },
          {
            title: ctx.principal,
            name: ctx.principalName,
          },
        ]}
      />
    </div>
  );
}
function ReceiptBody({ ctx }) {
  return (
    <div className="space-y-3 text-[13.5px] leading-8">
      <p>
        أفيد أنا ولي أمر {ctx.studentWord} <Dotted value={ctx.name} /> بالصف{" "}
        <Dotted value={ctx.classLine} /> بأنني استلمت نسخة من قواعد السلوك
        والمواظبة لطلبة التعليم العام (الإصدار الخامس 1447هـ) الخاصة بـ{" "}
        <Dotted value={ctx.schoolName} />، واطلعت على ما ورد فيها، وأتعهد
        بالتعاون مع إدارة المدرسة لتطبيقها.
      </p>
      <p>{tr("اسم ولي الأمر: …………………………………… رقم الهوية: ……………………")}</p>
      <p>الجوال: {ctx.parentPhone || "……………………"}</p>
      <SignRow
        note={ctx.actionNote}
        items={[
          {
            title: tr("ولي الأمر"),
          },
          {
            title: ctx.principal,
            name: ctx.principalName,
          },
        ]}
      />
    </div>
  );
}
function CommitmentBody({ ctx }) {
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
          نعم أنا {ctx.studentWord} الموضح اسمه وبياناته أعلاه، قد اطلعت على
          محتوى قواعد السلوك والمواظبة، وبناء عليه أتعهد أن ألتزم بالأنظمة
          والتعليمات الخاصة بها.
        </p>
        <p className="mt-2">{tr("التوقيع: ……………… التاريخ: / / 14هـ")}</p>
      </div>
      <div className="rounded border border-black p-3">
        <p className="mb-1 text-[11px] font-semibold">{tr("خاص بولي الأمر")}</p>
        <p>
          نعم أنا ولي أمر {ctx.studentWord} الموضح اسمه أعلاه، قد اطلعت على
          محتوى قواعد السلوك والمواظبة، وأتعهد أن أتعاون مع إدارة المدرسة في
          سبيل مصلحة ابني / ابنتي، وأتحمل مسؤولية صحة أرقام التواصل التالية:
        </p>
        <p className="mt-1">{tr("الاسم: ……………… العمل: ………………")}</p>
        <p>{tr("هاتف العمل: ……………… هاتف المنزل: ………………")}</p>
        <p>رقم الجوال: {ctx.parentPhone || "………………"} رقم آخر: ………………</p>
        <p className="mt-1">{tr("التوقيع: ……………… التاريخ: / / 14هـ")}</p>
      </div>
      <p className="text-[11px] leading-5">
        ملحوظة: يؤخذ توقيع {ctx.studentWord} وولي الأمر في بداية العام الدراسي،
        وتحفظ النماذج لدى {ctx.counselor}.
      </p>
    </div>
  );
}
function NoticeBody({ ctx }) {
  return (
    <div className="space-y-2 text-[13.5px] leading-8">
      <p>
        المكرم ولي أمر {ctx.studentWord} <Dotted value={ctx.name} /> بالصف{" "}
        <Dotted value={ctx.classLine} />
      </p>
      <p>{tr("السلام عليكم ورحمة الله وبركاته")}</p>
      <p>
        نشعركم بأن {ctx.studentWord} {ctx.did} بمشكلة سلوكية من الدرجة{" "}
        <Dotted value={ctx.degree} /> {tr("وهي")}<Dotted value={ctx.violation} />
        {ctx.period ? (
          <Fragment>
            {" "}
            في <Dotted value={ctx.period} />
          </Fragment>
        ) : null}
        {ctx.subject ? (
          <Fragment>
            {" "}
            مادة <Dotted value={ctx.subject} />
          </Fragment>
        ) : null}
      </p>
      <RepeatBox ctx={ctx} />
      <ProcedureList ctx={ctx} />
      <CompensationLine ctx={ctx} />
      <p>
        لذا يرجى منكم المتابعة والتعاون مع المدرسة بما يسهم في انضباط سلوك ابنكم
        / ابنتكم.
      </p>
      <NamesTail note={ctx.actionNote}>
        <div className="mt-6 flex justify-between">
          <p className="text-[12px]">{tr("الختم")}</p>
          <div className="text-center text-[12px] leading-6">
            <p className="font-semibold">{ctx.principal}</p>
            <p>الاسم: {ctx.principalName || "………………"}</p>
            <p>{tr("التوقيع: ………………")}</p>
          </div>
        </div>
      </NamesTail>
    </div>
  );
}
function DeductionBody({ ctx }) {
  const cuts = ctx.actionSteps.filter((step) => /خصم|حسم/.test(step));
  return (
    <div className="space-y-2 text-[13.5px] leading-8">
      <p>
        المكرم ولي أمر {ctx.studentWord} <Dotted value={ctx.name} /> بالصف{" "}
        <Dotted value={ctx.classLine} />
      </p>
      <p>{tr("السلام عليكم ورحمة الله وبركاته")}</p>
      <p>
        نشعركم بأنه تقرر خصم من درجات سلوك {ctx.studentWord} بسبب مشكلة سلوكية من الدرجة{" "}
        <Dotted value={ctx.degree} /> {tr("وهي")}
        <Dotted value={ctx.violation} />.
      </p>
      {cuts.length > 0 ? (
        <div className="my-2 rounded-sm border border-black px-3 py-2">
          <p className="font-semibold">{tr("إشعار الخصم")}</p>
          <ul className="list-disc pr-5 leading-7">
            {cuts.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
      ) : (
        <ProcedureList ctx={ctx} />
      )}
      <CompensationLine ctx={ctx} />
      <p>{tr("لذا يرجى المتابعة والتعاون مع المدرسة، ويمكن للطالب تعويض الدرجات وفق الفرص المتاحة.")}</p>
      <NamesTail note={ctx.actionNote}>
        <div className="mt-6 flex justify-between">
          <p className="text-[12px]">{tr("الختم")}</p>
          <div className="text-center text-[12px] leading-6">
            <p className="font-semibold">{ctx.principal}</p>
            <p>الاسم: {ctx.principalName || "………………"}</p>
            <p>{tr("التوقيع: ………………")}</p>
          </div>
        </div>
      </NamesTail>
    </div>
  );
}
function InviteBody({ ctx }) {
  return (
    <div className="space-y-2 text-[13.5px] leading-8">
      <p>
        المكرم ولي أمر {ctx.studentWord} <Dotted value={ctx.name} /> بالصف{" "}
        <Dotted value={ctx.classLine} />
      </p>
      <p>{tr("السلام عليكم ورحمة الله وبركاته")}</p>
      <p>
        نأمل منكم الحضور إلى المدرسة في يوم <Dotted value={ctx.weekday} />{" "}
        الموافق <Dotted value={ctx.day} />
        {ctx.appointmentTime ? (
          <Fragment>
            {" "}
            الساعة <Dotted value={ctx.appointmentTime} />
          </Fragment>
        ) : null}{" "}
        {tr("هجريًا")}<Dotted value={ctx.hijri} />{" "}
        لمقابلة {ctx.principal}، وذلك بهدف مناقشة مشكلة سلوكية ({ctx.violation}
        ).
      </p>
      <p>شاكرين لكم تعاونكم معنا لتحقيق مصلحة {ctx.studentWord}.</p>
      <NamesTail note={ctx.actionNote}>
        <div className="mt-4 flex justify-between">
          <p className="text-[12px]">{tr("الختم")}</p>
          <div className="text-center text-[12px] leading-6">
            <p className="font-semibold">{ctx.principal}</p>
            <p>الاسم: {ctx.principalName || "………………"}</p>
            <p>{tr("التوقيع: ………………")}</p>
          </div>
        </div>
      </NamesTail>
      <div className="mt-4 border-t border-black pt-2 text-[13px] leading-7">
        <p className="font-semibold">{tr("رد ولي الأمر:")}</p>
        <p>{tr("☐ أقر بالعلم، وسأحضر في الموعد المحدد.")}</p>
        <p>
          ☐ أقر بالعلم، وأرغب بتغيير الموعد (خلال نفس الأسبوع)، وذلك في يوم
          ……………… الموافق / / 14هـ
        </p>
        <p>{tr("الاسم: ……………… التوقيع: ……………… التاريخ: ………………")}</p>
      </div>
    </div>
  );
}
function ReferralBody({ ctx }) {
  return (
    <div className="space-y-2 text-[13.5px] leading-8">
      <p>{tr("المكرم الموجه الطلابي / الموجهة الطلابية")}</p>
      <p>{tr("السلام عليكم ورحمة الله وبركاته")}</p>
      <p>
        نحيل إليكم {ctx.studentWord} <Dotted value={ctx.name} /> بالصف{" "}
        <Dotted value={ctx.classLine} /> ذي المشكلة السلوكية من الدرجة{" "}
        <Dotted value={ctx.degree} /> {tr("وهي")}<Dotted value={ctx.violation} />
      </p>
      <RepeatBox ctx={ctx} />
      <p>
        يرجى متابعة الحالة ودراسة وضعها ووضع الحلول التربوية والعلاجية المناسبة.
      </p>
      <NamesTail note={ctx.actionNote}>
        <div className="mt-8 flex justify-between">
          <p className="text-[12px]">{tr("الختم")}</p>
          <div className="text-center text-[12px] leading-6">
            <p className="font-semibold">{ctx.counselor}</p>
            <p>الاسم: {ctx.counselorName || "………………"}</p>
            <p>{tr("التوقيع: ………………")}</p>
          </div>
        </div>
      </NamesTail>
    </div>
  );
}
function AttendanceBody({ ctx }) {
  const days = ctx.absenceNotes.length
    ? String(ctx.absenceNotes.length)
    : "…………";
  const dates =
    ctx.absenceNotes.map((n) => formatDay(n.createdAt)).join(tr("، ")) || "………………";
  return (
    <div className="space-y-3 text-[13.5px] leading-8">
      <p>
        أنا {ctx.studentWord} <Dotted value={ctx.name} /> بالصف{" "}
        <Dotted value={ctx.classLine} />
      </p>
      <p>
        أنني تغيبت عن الحضور للمدرسة بدون عذر لمدة <Dotted value={days} /> أيام،
        بتاريخ <Dotted value={dates} />
      </p>
      <p>
        وأتعهد بالالتزام بالخطة التربوية والعلاجية المقدمة لتحسين الحضور، وعلى
        ذلك جرى التوقيع.
      </p>
      <SignRow
        note={ctx.actionNote}
        items={[
          {
            title: ctx.studentWord,
            name: ctx.name,
          },
          {
            title: tr("ولي الأمر"),
          },
          {
            title: ctx.principal,
            name: ctx.principalName,
          },
        ]}
      />
    </div>
  );
}
function RecordBody({ ctx }) {
  const rows = ctx.behaviorNotes.slice(0, 6);
  if (!rows.length)
    return (
      <p className="py-4 text-center text-[13px]">
        لا توجد مخالفات مسجّلة في السجل.
      </p>
    );
  return (
    <div className="space-y-2 text-[13px]">
      <table className="official-table">
        <thead>
          <tr>
            {[
              tr("المشكلة السلوكية"),
              tr("نوعها ودرجتها"),
              tr("تاريخها"),
              tr("درجات السلوك المحسومة"),
              tr("الإجراءات المتخذة"),
              tr("تاريخ الإجراء"),
              tr("توقيع الطالب"),
              tr("توقيع ولي الأمر"),
            ].map((h) => (
              <th>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((n, i) => (
            <tr>
              <td>{n?.behaviorTypeName || n?.details || ""}</td>
              <td>
                {n ? `${degreeLabel(n.behaviorDegree) || "—"}` : ""}
              </td>
              <td>{n ? formatDay(n.createdAt) : ""}</td>
              <td>
                {n?.behaviorDegree === 4
                  ? "10"
                  : n?.behaviorDegree === 5
                    ? "15"
                    : n?.behaviorDegree
                      ? String(n.behaviorDegree)
                      : ""}
              </td>
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
        <p>
          الاسم: {ctx.principalName || "………………"} — التوقيع: ……………… — التاريخ:
          ………………
        </p>
      </div>
    </div>
  );
}
function TeacherLogBody({ ctx }) {
  const rows = ctx.behaviorNotes.slice(0, 7);
  const teacher =
    ctx.behaviorNotes.find((n) => n.teacherName)?.teacherName || "";
  if (!rows.length)
    return (
      <p className="py-4 text-center text-[13px]">
        لا توجد مخالفات مسجّلة لعرضها في السجل.
      </p>
    );
  return (
    <div className="space-y-2 text-[13px]">
      <table className="official-table">
        <thead>
          <tr>
            {[
              tr("اسم الطالب"),
              tr("المشكلة السلوكية"),
              tr("درجة المشكلة"),
              tr("الإجراء المتخذ"),
              tr("مدى الاستجابة"),
              tr("التكرار"),
              tr("التاريخ"),
              tr("الحصة"),
            ].map((h) => (
              <th>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((n) => (
            <tr>
              <td>{ctx.name}</td>
              <td>{n?.behaviorTypeName || n?.details || ""}</td>
              <td>{n ? degreeLabel(n.behaviorDegree) : ""}</td>
              <td>{actionDisplay(n?.actionTaken)}</td>
              <td />
              <td>{n?.occurrence ? occurrenceLabel(n.occurrence) : ""}</td>
              <td>{n ? formatDay(n.createdAt) : ""}</td>
              <td>
                {n ? periodShort(n.periodKey, ctx.season, ctx.schedules) : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {ctx.actionNote ? <ActionNoteBox note={ctx.actionNote} /> : null}
      <div className="pt-3 text-center text-[12px] leading-6">
        <p className="font-semibold">{tr("المعلم / المعلمة")}</p>
        <p>الاسم: {teacher || "………………"} — التوقيع: ……………… — التاريخ: ………………</p>
      </div>
    </div>
  );
}
function PlanBody({ ctx }) {
  return (
    <div className="space-y-2 text-[13.5px] leading-7">
      <p className="font-semibold">{tr("أولاً: البيانات والمشكلة")}</p>
      <p>
        المشكلة: <Dotted value={ctx.violation} /> درجتها:{" "}
        <Dotted value={ctx.degree} />
      </p>
      <p>وصف المشكلة والمظاهر التي تبدو عند الطالب: {ctx.focus?.details || "…………………………………………"}</p>
      <RepeatBox ctx={ctx} />
      <p className="font-semibold">{tr("ثانياً: قياس التكرار")}</p>
      <table className="official-table">
        <thead>
          <tr>
            {[tr("اليوم"), tr("التاريخ"), tr("فترة الملاحظة"), "1", "2", "3", "4", "5", tr("المجموع")].map((h) => (
              <th>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[0, 1].map((row) => (
            <tr>
              {Array.from({ length: 9 }).map(() => (
                <td className="h-6" />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="font-semibold">{tr("ثالثاً: الإجراءات المستخدمة لإكساب السلوك المرغوب")}</p>
      <ol className="list-decimal pr-5">
        {(ctx.actionSteps.filter((s) => s.trim()).length
          ? ctx.actionSteps.filter((s) => s.trim())
          : [1, 2, 3, 4, 5, 6].map(() => "…………………………………………")
        ).map((s) => (
          <li>{s}</li>
        ))}
      </ol>
      <p className="font-semibold">{tr("رابعاً: تقييم فاعلية الخطة")}</p>
      <p>رأي {ctx.counselor}: …………………………………………</p>
      <p>{tr("رأي معلم الفصل: …………………………………………")}</p>
      <p>{tr("رأي ولي الأمر: …………………………………………")}</p>
      <SignRow
        note={ctx.actionNote}
        items={[
          {
            title: tr("القائم بتعديل السلوك"),
          },
          {
            title: ctx.counselor,
            name: ctx.counselorName,
          },
          {
            title: ctx.principal,
            name: ctx.principalName,
          },
        ]}
      />
    </div>
  );
}
function CompensationBody({ ctx }) {
  const rows = ctx.behaviorNotes.slice(0, 5);
  if (!rows.length)
    return (
      <p className="py-4 text-center text-[13px]">
        لا توجد مخالفات لعرض فرص التعويض.
      </p>
    );
  return (
    <div className="space-y-2 text-[13px]">
      <table className="official-table">
        <thead>
          <tr>
            {[
              tr("المشكلة السلوكية"),
              tr("نوعها ودرجتها"),
              tr("درجات السلوك المحسومة"),
              tr("فرص التعويض"),
              tr("الدرجات المكتسبة"),
              tr("توقيع الطالب"),
            ].map((h) => (
              <th>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((n, i) => (
            <tr>
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
function ExcellenceBody({ ctx }) {
  return (
    <div className="space-y-2 text-[13px]">
      <table className="official-table">
        <thead>
          <tr>
            {[
              tr("موضوع ممارسة السلوك المتميز"),
              tr("نوع الممارسة"),
              tr("تاريخ التنفيذ"),
              tr("شواهد السلوك المتميز"),
              tr("الدرجة المكتسبة"),
              tr("اسم راصد السلوك"),
              tr("التوقيع"),
            ].map((h) => (
              <th>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({
            length: 8,
          }).map((_, i) => (
            <tr>
              {Array.from({
                length: 7,
              }).map((__, j) => (
                <td className="h-7" />
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
function IncidentBody({ ctx }) {
  return (
    <div className="space-y-2 text-[14px] leading-7">
      <p>
        المشكلة السلوكية: <Dotted value={ctx.violation} /> درجتها:{" "}
        <Dotted value={ctx.degree} />
      </p>
      <RepeatBox ctx={ctx} />
      <p>{tr("نوع المشاهدة المضبوطة: ☐ صور ☐ مقاطع فيديو ☐ محادثات ☐ أخرى ………………")}</p>
      <p>{tr("مكان ضبط الواقعة: …………………………………… شهود الواقعة: ……………………")}</p>
      <table className="official-table">
        <thead>
          <tr>
            {[tr("م"), tr("الاسم"), tr("الوظيفة"), tr("العمل المسند إليه"), tr("التوقيع")].map(
              (h) => (
                <th>{h}</th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 7 }).map((_, i) => (
            <tr>
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
          {
            title: ctx.studentWord,
            name: ctx.name,
          },
          {
            title: tr("ولي الأمر"),
          },
          {
            title: ctx.principal,
            name: ctx.principalName,
          },
        ]}
      />
    </div>
  );
}
function CommitteeBody({ ctx }) {
  return (
    <div className="space-y-2 text-[13px] leading-7">
      <p>
        وصف المشكلة السلوكية: <Dotted value={ctx.violation} />
      </p>
      <p>
        تصنيف المشكلة: الدرجة <Dotted value={ctx.degree} />
      </p>
      <RepeatBox ctx={ctx} />
      <p>{tr("قرارات اللجنة:")}</p>
      {ctx.actionSteps.filter((s) => s.trim()).length ? (
        <ol className="list-decimal pr-5">
          {ctx.actionSteps
            .filter((s) => s.trim())
            .map((s) => (
              <li>{s}</li>
            ))}
        </ol>
      ) : null}
      <table className="official-table">
        <thead>
          <tr>
            {[tr("م"), tr("اسم العضو"), tr("الوظيفة"), tr("العمل المسند إليه"), tr("التوقيع")].map(
              (h) => (
                <th>{h}</th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {[
            ["1", ctx.counselorName || "", ctx.counselor, tr("رئيس / رئيسة")],
            ["2", "", tr("وكيل الشؤون التعليمية"), tr("عضو")],
            ["3", "", tr("الموجه الطلابي"), tr("مقرر / مقررة")],
            ["4", "", tr("معلم متميز"), tr("عضو")],
            ["5", "", tr("معلم متميز"), tr("عضو")],
            ["6", "", tr("معلم متميز"), tr("عضو")],
          ].map((row) => (
            <tr>
              {row.map((c, i) => (
                <td>{c}</td>
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
function ViolenceBody({ ctx }) {
  return (
    <div className="space-y-2 text-[12.5px] leading-7">
      <p className="text-center text-[11px] font-semibold">{tr("(سري للغاية)")}</p>
      <p>
        اليوم: {ctx.weekday} — الساعة: ……………… — التاريخ: {ctx.day}
      </p>
      <table className="official-table">
        <tbody>
          <tr>
            <th colSpan={4}>{tr("بيانات الحالة المتعرضة للعنف")}</th>
          </tr>
          <tr>
            <th>{tr("الاسم")}</th>
            <td>{ctx.name}</td>
            <th>{tr("العمر")}</th>
            <td>………………</td>
          </tr>
          <tr>
            <th>{tr("الحالة الاجتماعية")}</th>
            <td>………………</td>
            <th>{tr("الجنس")}</th>
            <td>{ctx.studentWord}</td>
          </tr>
          <tr>
            <th>{tr("رقم السجل المدني")}</th>
            <td>………………</td>
            <th>{tr("الجنسية")}</th>
            <td>………………</td>
          </tr>
          <tr>
            <th>{tr("رقم الهاتف")}</th>
            <td>{ctx.parentPhone || "………………"}</td>
            <th>{tr("رقم الجوال")}</th>
            <td>{ctx.parentPhone || "………………"}</td>
          </tr>
          <tr>
            <th>{tr("العنوان")}</th>
            <td colSpan={3}>{ctx.classLine}</td>
          </tr>
          <tr>
            <th colSpan={4}>{tr("اسم الجهة المبلغة")}</th>
          </tr>
          <tr>
            <th>{tr("اسم المبلغ")}</th>
            <td>{ctx.focus?.teacherName || ctx.counselorName || "………………"}</td>
            <th>{tr("رقم السجل المدني")}</th>
            <td>………………</td>
          </tr>
          <tr>
            <th>{tr("الجنسية")}</th>
            <td>………………</td>
            <th>{tr("رقم الهاتف")}</th>
            <td>………………</td>
          </tr>
          <tr>
            <th>{tr("ملخص المشكلة")}</th>
            <td colSpan={3}>{ctx.violation}</td>
          </tr>
          <tr>
            <th>{tr("أبرز الإجراءات المتخذة")}</th>
            <td colSpan={3}>{ctx.actionSteps.join(" — ") || "………………"}</td>
          </tr>
        </tbody>
      </table>
      {ctx.actionNote ? <ActionNoteBox note={ctx.actionNote} /> : null}
      <div className="flex items-end justify-between pt-3 text-[12px] leading-6">
        <p>{tr("الختم المدرسي")}</p>
        <div className="text-center">
          <p className="font-semibold">{ctx.principal}</p>
          <p>الاسم: {ctx.principalName || "………………"}</p>
          <p>{tr("التوقيع: ………………")}</p>
          <p>التاريخ: {ctx.day}</p>
        </div>
      </div>
    </div>
  );
}
function RiskBody({ ctx }) {
  return (
    <div className="space-y-2 text-[13px] leading-7">
      <p className="text-center text-[11px] font-semibold">{tr("(سري للغاية)")}</p>
      <p>وصف الحالة: {ctx.violation}</p>
      <p>
        اسم راصد الحالة: {ctx.focus?.teacherName || "………………"} تاريخ الرصد:{" "}
        {ctx.day} وقت الرصد: ………………
      </p>
      <p className="font-semibold">{tr("الإجراءات المتخذة مع الحالة:")}</p>
      {[
        tr("تبليغ إدارة التعليم"),
        tr("تبليغ الجهات الأمنية"),
        tr("تبليغ الحماية من العنف الأسري وحماية الطفل"),
        tr("تبليغ وزارة الصحة"),
        tr("التواصل مع الأسرة لإخطارها بوضع الحالة"),
        tr("عقد اجتماع طارئ للجنة التوجيه الطلابي"),
        tr("رفع بلاغ عن الحالة في الأنظمة التقنية الخاصة بالبلاغات"),
      ].map((item) => (
        <p>☐ {item}</p>
      ))}
      {ctx.actionNote ? <ActionNoteBox note={ctx.actionNote} /> : null}
      <div className="pt-2 text-center text-[12px] leading-6">
        <p className="font-semibold">{ctx.principal}</p>
        <p>الاسم: {ctx.principalName || "………………"} — التوقيع: ………………</p>
      </div>
    </div>
  );
}
function AbsenceExcusedBody({ ctx }) {
  return (
    <div className="space-y-2 text-[13px]">
      <table className="official-table">
        <thead>
          <tr>
            {[
              tr("عدد أيام الغياب"),
              tr("الإجراء المتخذ"),
              tr("تاريخ الإجراء"),
              tr("توقيع الطالب"),
              tr("توقيع ولي الأمر"),
            ].map((h) => (
              <th>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[tr("3 أيام"), tr("5 أيام"), tr("10 أيام")].map((d) => (
            <tr>
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
function AbsenceUnexcusedBody({ ctx }) {
  return (
    <div className="space-y-2 text-[13px]">
      <table className="official-table">
        <thead>
          <tr>
            {[
              tr("عدد أيام الغياب"),
              tr("الإجراء المتخذ"),
              tr("تاريخ الإجراء"),
              tr("توقيع الطالب"),
              tr("توقيع ولي الأمر"),
              tr("عدد درجات المواظبة المحسومة"),
            ].map((h) => (
              <th>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[tr("3 أيام"), tr("3 أيام متصلة"), tr("5 أيام"), tr("10 أيام")].map((d) => (
            <tr>
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
