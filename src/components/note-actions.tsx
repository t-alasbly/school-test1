import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { studentLabel, tr, useLocale } from "@/lib/school/i18n";
import { Check, ChevronDown, Plus, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createNote, closeNote, getMyTimetable, previewBehaviorOccurrence, previewStudyOccurrence } from "@/lib/school/api";
import { NOTE_META, NOTE_TYPES, SHORTCUT_VIOLATIONS, STUDY_ACTIONS, STUDY_NOTES, classLabel, currentPeriod, degreeLabel, degreeTone, formatDay, formatTime, fromDatetimeLocalValue, isOtherChoice, isStaffViolation, isTeacherVerbal, occurrenceLabel, parseSubjects, procedureLadder, procedureStageLabel, resolveOther, scheduleFor, stageIndexFor, studyActionFor, toDatetimeLocalValue, toWhatsAppNumber } from "@/lib/school/constants";
import { staffCan } from "@/lib/school/permissions";
import type { NoteType } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { PrintFormsButton } from "@/components/print-forms";
import { EXIT_PERMITS, useGrantExitPermit, type ExitKind } from "@/components/exit-permit";
import { WhatsAppDialog } from "@/components/whatsapp-dialog";
import { cn } from "@/lib/utils";

const TYPE_HINT: Record<NoteType, string> = {
  absence: "يسجّل غياب الطالب عن هذه الحصة",
  late: "يسجّل التأخر عن بداية الحصة",
  homework: "اختر الملاحظة الدراسية من القائمة",
  behavior: "اختر نوع المخالفة من الدليل ثم أرسل",
};

function minutesAfterStart(startMin: number, occurredAt: string): number {
  const time = occurredAt.slice(11, 16);
  const [hour, minute] = time.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 0;
  return Math.max(0, hour * 60 + minute - startMin);
}

function lateMinutesLine(minutes: number): string {
  if (minutes === 1) return "تأخر دقيقة واحدة عن بداية الحصة";
  if (minutes === 2) return "تأخر دقيقتين عن بداية الحصة";
  if (minutes >= 3 && minutes <= 10) return `تأخر ${minutes} دقائق عن بداية الحصة`;
  return `تأخر ${minutes} دقيقة عن بداية الحصة`;
}

export type NoteTarget = {
  studentId: number;
  studentName: string;
  classId: number;
};

function BehaviorPicker({
  items,
  audience,
  degree,
  currentId,
  onAudience,
  onDegree,
  onPick,
  onClose,
}: {
  items: { id: number; name: string; degree?: number; procedures?: string[][]; branches?: string[] }[];
  audience: "students" | "staff";
  degree: number;
  currentId: number | null;
  onAudience: (next: "students" | "staff") => void;
  onDegree: (degree: number) => void;
  onPick: (id: number, branch?: string) => void;
  onClose: () => void;
}) {
  const pool = items.filter((item) => isStaffViolation(item) === (audience === "staff") && item.name !== "أخرى");
  const other = items.find((item) => item.name === "أخرى");
  const degrees = audience === "staff" ? [4, 5] : [1, 2, 3, 4, 5];
  const active = degrees.includes(degree) ? degree : degrees[0]!;
  const list = pool.filter((item) => (item.degree ?? 1) === active);
  const deduct: Record<number, string> = { 1: tr("حسم 1"), 2: tr("حسم 2"), 3: tr("حسم 3"), 4: tr("حسم 10"), 5: tr("حسم 15") };
  const [draft, setDraft] = useState<number | null>(currentId);
  const [branch, setBranch] = useState("");
  const [ask, setAsk] = useState(false);
  const [help, setHelp] = useState<number | null>(null);
  const helpLadder = help == null ? [] : procedureLadder(help);
  const picked = [...list, other].find((item) => item?.id === draft);
  const branches = picked?.branches ?? [];
  return (
    <>
    <Dialog open onOpenChange={(next) => { if (!next) setAsk(true); }}>
      <DialogContent
        hideClose
        className={cn(
          "flex flex-col gap-2 overflow-hidden bg-bg p-3",
          "!inset-0 !h-dvh !max-h-dvh !w-full !max-w-none !translate-x-0 !translate-y-0 !rounded-none",
        )}
      >
        <DialogTitle className="sr-only">{tr("المخالفات")}</DialogTitle>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setAsk(true)} className="h-11 shrink-0 rounded-full border border-border px-4 text-sm font-semibold">
            {tr("إغلاق")}
          </button>
          <div className="grid h-11 min-w-0 flex-1 grid-cols-2 rounded-full border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => onAudience("students")}
              className={cn("rounded-full text-sm font-bold", audience === "students" ? "bg-primary text-primary-fg" : "text-fg")}
            >
              {tr("مخالفات الطلبة")}
            </button>
            <button
              type="button"
              onClick={() => onAudience("staff")}
              className={cn("rounded-full text-sm font-bold", audience === "staff" ? "bg-[#7f1d1d] text-white" : "text-fg")}
            >
              {tr("تجاه المعلمين")}
            </button>
          </div>
        </div>
        <div className={cn("grid shrink-0 gap-1.5", degrees.length === 2 ? "grid-cols-2" : "grid-cols-5")}>
          {degrees.map((value) => (
            <div
              key={value}
              className={cn(
                "relative min-h-12 rounded-xl border-2 px-0.5 py-1 text-center leading-tight",
                degreeTone(value),
                active === value ? "ring-2 ring-offset-1 ring-current" : "opacity-70",
              )}
            >
              <button type="button" className="w-full" onClick={() => onDegree(value)}>
                <span className="flex items-center justify-center gap-1 text-sm font-black">
                  {value}
                </span>
                <span className="block text-[10px] font-semibold">{deduct[value]}</span>
              </button>
              <button
                type="button"
                aria-label={tr("إجراءات هذه الدرجة")}
                className="absolute top-0.5 start-0.5 grid size-5 place-items-center rounded-full bg-white text-[12px] font-black leading-none text-[#111]"
                onClick={() => setHelp((current) => current === value ? null : value)}
              >
                !
              </button>
            </div>
          ))}
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-2">
          {help != null ? (
            <section className={cn("space-y-2 rounded-2xl border-2 p-3", degreeTone(help))}>
              <h2 className="text-sm font-bold">{tr("الإجراءات")} — {degreeLabel(help)}</h2>
              {helpLadder.map((stage, index) => (
                <div key={index} className="rounded-xl bg-white/80 px-3 py-2 text-[#111]">
                  <p className="text-xs font-semibold">{procedureStageLabel(index + 1)}</p>
                  <p className="text-sm">{stage.join(" — ")}</p>
                </div>
              ))}
            </section>
          ) : null}
          {list.map((bt) => (
            <div
              key={bt.id}
              className={cn(
                "min-h-10 w-full rounded-2xl border-2 px-3 py-3 text-right",
                degreeTone(bt.degree ?? 1),
                draft === bt.id ? "ring-2 ring-offset-1 ring-current" : "",
              )}
            >
              <button type="button" className="w-full text-right" onClick={() => { setDraft(bt.id); setBranch(""); }}>
                <p className="text-base font-semibold leading-7">{tr(bt.name)}</p>
              </button>
              {draft === bt.id && bt.branches?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {bt.branches.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setBranch(option)}
                      className={cn("rounded-full border px-3 py-1 text-sm font-semibold", branch === option ? "border-current bg-white" : "border-transparent bg-white/70")}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {audience === "students" && active === 1 && other ? (
            <button
              type="button"
              onClick={() => setDraft(other.id)}
              className={cn("min-h-10 w-full rounded-2xl border-2 border-border bg-card px-3 py-3 text-right", draft === other.id && "ring-2 ring-primary")}
            >
              <p className="text-base font-semibold leading-7">{tr("أخرى")}</p>
            </button>
          ) : null}
          {list.length === 0 ? <p className="px-2 py-6 text-center text-sm text-fg-muted">{tr("لا مخالفات في هذه الدرجة.")}</p> : null}
        </div>
        <Button type="button" className="shrink-0" disabled={draft == null || (branches.length > 0 && !branch)} onClick={() => draft != null && onPick(draft, branch)}>
          {tr("اعتماد التعديل")}
        </Button>
      </DialogContent>
    </Dialog>
    <Dialog open={ask} onOpenChange={setAsk}>
      <DialogContent className="!inset-auto !top-1/2 !left-1/2 z-[80] !h-auto !max-h-none w-[min(92vw,24rem)] !max-w-sm !-translate-x-1/2 !-translate-y-1/2 rounded-2xl p-5 shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-center text-lg">{tr("اعتماد وإغلاق بدون تعديل؟")}</DialogTitle>
          <DialogDescription className="text-center">{tr("لن يُحفظ أي تغيير على المخالفة.")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" onClick={() => setAsk(false)}>{tr("البقاء")}</Button>
          <Button type="button" onClick={onClose}>{tr("إغلاق بدون تعديل")}</Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

function ProcedurePreview({
  degree,
  procedures,
  nextOccurrence,
  shared,
}: {
  degree: number;
  procedures?: string[][];
  nextOccurrence?: number;
  shared?: boolean;
}) {
  const ladder = procedureLadder(degree, procedures);
  const currentIndex = shared || nextOccurrence == null ? 0 : stageIndexFor(nextOccurrence, ladder.length);
  const [open, setOpen] = useState<number[]>([currentIndex]);
  useEffect(() => {
    setOpen([currentIndex]);
  }, [currentIndex]);
  return (
    <div className="space-y-1">
      {shared ? <p className="text-xs text-fg-muted">{tr("المرحلة تعتمد على عدد مرات كل طالب.")}</p> : null}
      {ladder.map((lines, index) => {
        const time = index + 1;
        const current = index === currentIndex;
        const done = !shared && index < currentIndex;
        const expanded = open.includes(index);
        const verbal = isTeacherVerbal(degree, time);
        return (
          <div
            key={time}
            className={cn(
              "overflow-hidden rounded-xl border-2",
              current && "border-primary bg-primary/15",
              done && "border-border bg-muted/70",
              !current && !done && "border-border bg-bg",
            )}
          >
            <button
              type="button"
              className={cn(
                "flex w-full items-center justify-between gap-2 px-3 text-right",
                expanded ? "min-h-8 py-2" : "min-h-0 py-1",
              )}
              aria-expanded={expanded}
              onClick={() => setOpen((currentOpen) => currentOpen.includes(index) ? currentOpen.filter((item) => item !== index) : [...currentOpen, index])}
            >
              <span className={cn("text-sm font-semibold leading-5", done && "text-fg-muted line-through", current && "text-primary")}>
                {occurrenceLabel(time)}
                {current ? ` — ${tr("هذه المرة")}` : ""}
                {done ? ` — ${tr("سُجّل سابقاً")}` : ""}
                {!done && verbal ? ` — ${tr("دون إجراء من الوكيل")}` : ""}
                {!done && degree === 1 && !verbal ? ` — ${tr("تُحال إلى الوكيل")}` : ""}
              </span>
              <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", expanded && "rotate-180", done && "text-fg-muted")} />
            </button>
            {expanded ? (
              <ol className="space-y-1 border-t border-border px-3 py-2">
                {lines.map((line, lineIndex) => (
                  <li key={line} className="flex gap-2 text-sm leading-6">
                    <span className="font-bold tabular-nums">{lineIndex + 1}.</span>
                    <span>{tr(line)}</span>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function BehaviorReview({
  student,
  name,
  degree,
  staffAudience,
  procedures,
  nextOccurrence,
  shared,
  other,
  late,
  lateMinutes,
  onLateMinutes,
  details,
  onDetails,
  formKey,
  pending,
  canSend,
  onBack,
  onSend,
}: {
  student: string;
  name: string;
  degree: number;
  staffAudience: boolean;
  procedures?: string[][];
  nextOccurrence?: number;
  shared?: boolean;
  other: boolean;
  late: boolean;
  lateMinutes: string;
  onLateMinutes: (value: string) => void;
  details: string;
  onDetails: (value: string) => void;
  formKey: string;
  pending: boolean;
  canSend: boolean;
  onBack: () => void;
  onSend: () => void;
}) {
  const notesRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const field = notesRef.current;
    if (!field) return;
    field.style.height = "0px";
    field.style.height = `${field.scrollHeight}px`;
  }, [details]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DialogHeader className="sr-only">
        <DialogTitle>{tr("الإجراءات")}</DialogTitle>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pe-1">
        {late ? (
          <div className="space-y-1.5">
            <Label htmlFor={`late-minutes-${formKey}`}>{tr("دقائق التأخر عن بداية الحصة")}</Label>
            <Input id={`late-minutes-${formKey}`} type="number" min={1} max={90} inputMode="numeric" value={lateMinutes} onChange={(event) => onLateMinutes(event.target.value)} />
          </div>
        ) : null}
        <Textarea
          ref={notesRef}
          id={`review-notes-${formKey}`}
          rows={1}
          aria-label={other ? tr("صف المخالفة يدوياً") : tr("الملاحظات")}
          className="!min-h-0 resize-none overflow-hidden rounded-lg border-2 border-amber-600 bg-amber-200 px-2 py-0.5 text-sm font-medium leading-5 text-amber-950 placeholder:text-amber-900/80"
          placeholder={other ? tr("اكتب وصف المخالفة") : tr("ملاحظة توضيحية اختيارية")}
          value={details}
          onChange={(event) => onDetails(event.target.value)}
        />
        <ProcedurePreview degree={degree} procedures={procedures} nextOccurrence={nextOccurrence} shared={shared} />
      </div>
      <div className="mt-2 grid shrink-0 grid-cols-[auto_1fr] gap-2 border-t border-border pt-3">
        <Button type="button" variant="secondary" onClick={onBack}>{tr("رجوع")}</Button>
        <Button type="button" disabled={!canSend || pending} onClick={onSend}>
          <Send className="size-4" />
          {pending ? tr("جارٍ الإرسال…") : tr("إرسال واعتماد")}
        </Button>
      </div>
    </div>
  );
}

type SavedBehavior = {
  id: number;
  studentId: number;
  studentName: string;
  parentPhone: string;
  className: string;
  shortName: string;
  stageName: string;
  occurrence: number;
  behaviorName: string;
  degree: number;
  details: string;
  periodKey: string;
};

function ActionSequence({
  notes,
  procedures,
  onDone,
}: {
  notes: SavedBehavior[];
  procedures?: string[][];
  onDone: () => void;
}) {
  const { staff } = useWorkspace();
  const queryClient = useQueryClient();
  const [pickedById, setPickedById] = useState<Record<number, string[]>>({});
  const canSend = staffCan(staff, "sendMessages");
  const rows = notes.map((note) => {
    const ladder = procedureLadder(note.degree, procedures);
    const stage = stageIndexFor(note.occurrence, ladder.length);
    return { note, stage, lines: ladder[stage] ?? [] };
  });
  const sameStage = rows.length > 0 && rows.every((row) => row.stage === rows[0]?.stage);
  const head = rows[0]?.note;

  useEffect(() => {
    const next: Record<number, string[]> = {};
    for (const row of rows) next[row.note.id] = [...row.lines];
    setPickedById(next);
  }, [notes.map((note) => `${note.id}:${note.occurrence}`).join("|")]);

  function pickedFor(id: number) {
    return pickedById[id] ?? [];
  }

  function toggle(id: number, line: string) {
    setPickedById((prev) => {
      const current = prev[id] ?? [];
      const next = current.includes(line) ? current.filter((item) => item !== line) : [...current, line];
      if (!sameStage) return { ...prev, [id]: next };
      const all: Record<number, string[]> = {};
      for (const row of rows) all[row.note.id] = next;
      return all;
    });
  }

  const mutation = useMutation({
    mutationFn: async () => {
      for (const row of rows) {
        const actionTaken = resolveOther(pickedFor(row.note.id), "").join(" — ");
        if (actionTaken.trim().length < 2) throw new Error(`اختر إجراء ${row.note.studentName}`);
        await closeNote({ data: { noteId: row.note.id, actionTaken } });
      }
    },
    onSuccess: () => {
      toast.success(notes.length > 1 ? `تم إنهاء المخالفة على ${notes.length} طلاب` : tr("تم إنهاء المخالفة"));
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: ["class"] });
      void queryClient.invalidateQueries({ queryKey: ["today-marks"] });
      void queryClient.invalidateQueries({ queryKey: ["student"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      onDone();
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر حفظ الإجراء")),
  });

  if (!head) return null;

  function tools(note: SavedBehavior, action: string) {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <PrintFormsButton
          className="w-full"
          size="default"
          student={{
            name: note.studentName,
            classLabel: classLabel(note.shortName, note.className),
            className: note.className,
            stageName: note.stageName,
            parentPhone: note.parentPhone,
          }}
          notes={[{
            type: "behavior",
            details: note.details,
            behaviorTypeName: note.behaviorName,
            behaviorDegree: note.degree,
            periodKey: note.periodKey,
            actionTaken: action,
            createdAt: new Date().toISOString(),
            teacherName: staff.displayName,
            teacherSubject: staff.subject,
            occurrence: note.occurrence,
          }]}
          studentId={note.studentId}
          defaultKind="pledge"
          label={tr("طباعة التعهد")}
        />
        {canSend ? (
          <WhatsAppDialog
            studentId={note.studentId}
            studentName={note.studentName}
            parentPhone={note.parentPhone}
            className={note.className}
            shortName={note.shortName}
            defaultType="behavior"
            details={note.behaviorName}
            sharedText={note.details}
            subject={staff.subject}
            periodKey={note.periodKey}
            noteId={note.id}
            behaviorDegree={note.degree}
            label={tr("إرسال رسالة")}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <DialogHeader className="shrink-0">
        <DialogTitle>{tr("إجراءات المخالفة")}</DialogTitle>
        <DialogDescription>
          {notes.length > 1 ? `${notes.map((note) => note.studentName).join(tr("، "))} · ` : `${head.studentName} · `}
          {tr(head.behaviorName)}
          {notes.length === 1 ? ` · ${occurrenceLabel(head.occurrence)}` : ""}
          {head.degree ? ` · ${degreeLabel(head.degree)}` : ""}
        </DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {sameStage ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold">
              {procedureStageLabel(rows[0]!.stage + 1)} — {tr("المناسب لهذه المرة")}
              {notes.length > 1 ? ` · يُطبَّق على ${notes.length} طلاب` : ""}
            </p>
            {rows[0]!.lines.map((line) => (
              <label key={line} className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-sm", pickedFor(head.id).includes(line) ? "border-primary bg-primary/5" : "border-border")}>
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={pickedFor(head.id).includes(line)}
                  onChange={() => toggle(head.id, line)}
                />
                <span>{tr(line)}</span>
              </label>
            ))}
            {notes.length === 1 ? tools(head, resolveOther(pickedFor(head.id), "").join(" — ")) : notes.map((note) => (
              <div key={note.id} className="space-y-2 rounded-xl border border-border p-3">
                <p className="text-sm font-semibold">{note.studentName} · {occurrenceLabel(note.occurrence)}</p>
                {tools(note, resolveOther(pickedFor(note.id), "").join(" — "))}
              </div>
            ))}
          </div>
        ) : rows.map((row) => (
          <div key={row.note.id} className="space-y-2 rounded-xl border border-border p-3">
            <p className="text-sm font-semibold">
              {row.note.studentName} · {occurrenceLabel(row.note.occurrence)} · {procedureStageLabel(row.stage + 1)}
            </p>
            {row.lines.map((line) => (
              <label key={line} className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-sm", pickedFor(row.note.id).includes(line) ? "border-primary bg-primary/5" : "border-border")}>
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={pickedFor(row.note.id).includes(line)}
                  onChange={() => toggle(row.note.id, line)}
                />
                <span>{tr(line)}</span>
              </label>
            ))}
            {tools(row.note, resolveOther(pickedFor(row.note.id), "").join(" — "))}
          </div>
        ))}
      </div>
      <Button className="w-full shrink-0" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? tr("جارٍ الحفظ…") : notes.length > 1 ? `إنهاء المخالفة على ${notes.length}` : tr("إنهاء المخالفة")}
      </Button>
    </div>
  );
}

export function NoteActions({
  studentId,
  studentName,
  classId,
  presetSubject,
  presetPeriod,
}: {
  studentId: number;
  studentName: string;
  classId: number;
  presetSubject?: string;
  presetPeriod?: string;
}) {
  return (
    <NoteComposer
      targets={[{ studentId, studentName, classId }]}
      presetSubject={presetSubject}
      presetPeriod={presetPeriod}
      trigger={
        <Button size="icon" variant="secondary" aria-label={`تسجيل ملاحظة لـ ${studentName}`}>
          <Plus className="size-5" />
        </Button>
      }
    />
  );
}

export function NoteComposer({
  targets,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  onSubmitted,
  trigger,
  presetSubject,
  presetPeriod,
}: {
  targets: NoteTarget[];
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  onSubmitted?: (result: { count: number; failedIds: number[] }) => void;
  trigger?: ReactNode;
  presetSubject?: string;
  presetPeriod?: string;
}) {
  const { behaviorTypes, school, staff, studyNotes = [] } = useWorkspace();
  const { locale } = useLocale();
  const showName = (name: string) => studentLabel(locale, name);
  const slots = scheduleFor(school.season, school.schedules);
  const auto = useMemo(() => currentPeriod(school.season, new Date(), school.schedules)?.key ?? "", [school.season, school.schedules]);
  const [innerOpen, setInnerOpen] = useState(false);
  const open = openProp ?? innerOpen;
  const [whenOpen, setWhenOpen] = useState(false);
  const [details, setDetails] = useState("");
  const [periodKey, setPeriodKey] = useState(auto);
  const [type, setType] = useState<NoteType | null>(null);
  const [shortcut, setShortcut] = useState<NoteType | null>(null);
  const [behaviorTypeId, setBehaviorTypeId] = useState<number | null>(null);
  const [behaviorBranch, setBehaviorBranch] = useState("");
  const [behaviorStep, setBehaviorStep] = useState<"choose" | "review">("choose");
  const [exitKind, setExitKind] = useState<ExitKind | null>(null);
  const grantExit = useGrantExitPermit();
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [picking, setPicking] = useState(false);
  const [audience, setAudience] = useState<"students" | "staff">("students");
  const [degreePick, setDegreePick] = useState(1);
  const [follow, setFollow] = useState<SavedBehavior[] | null>(null);
  const [occurredAt, setOccurredAt] = useState(toDatetimeLocalValue());
  const [sent, setSent] = useState(0);
  const [shared, setShared] = useState(false);
  const [lateMinutes, setLateMinutes] = useState("");
  const [lateTouched, setLateTouched] = useState(false);
  const [studyId, setStudyId] = useState("");
  const [deduction, setDeduction] = useState("");
  const deskSubjects = useQuery({
    queryKey: ["my-timetable", "note-subject"],
    queryFn: () => getMyTimetable(),
    enabled: parseSubjects(staff.subject).length === 0,
  });
  const subjects = parseSubjects(staff.subject).length
    ? parseSubjects(staff.subject)
    : parseSubjects(String((deskSubjects.data as { subject?: string } | undefined)?.subject || ""));
  const lockedSubject = presetSubject && subjects.includes(presetSubject) ? presetSubject : "";
  const [lessonSubject, setLessonSubject] = useState(lockedSubject || (subjects.length === 1 ? subjects[0] : ""));
  const [pickSubject, setPickSubject] = useState(false);
  const timetable = useQuery({
    queryKey: ["my-timetable"],
    queryFn: () => getMyTimetable(),
    enabled: open,
  });
  const wasOpen = useRef(false);
  const queryClient = useQueryClient();
  const selectedBehavior = behaviorTypes.find((bt) => bt.id === behaviorTypeId);
  const otherBehavior = Boolean(selectedBehavior && isOtherChoice(selectedBehavior.name));
  const studyChoices = useMemo(() => {
    const saved = studyNotes
      .filter((item) => item.active !== false)
      .map((item) => ({ id: String(item.id), label: item.name }));
    const base = saved.length > 0 ? saved : STUDY_NOTES.filter((item) => item.id !== "other");
    return [...base, { id: "other", label: "ملاحظة أخرى" }];
  }, [studyNotes]);
  const periodLabel = slots.find((s) => s.key === periodKey)?.label ?? tr("الحصة غير محددة");
  const many = targets.length > 1;
  const formKey = many ? "group" : String(targets[0]?.studentId ?? "note");
  const occurrencePreview = useQuery({
    queryKey: ["behavior-occurrence", targets[0]?.studentId, behaviorTypeId],
    queryFn: () => previewBehaviorOccurrence({ data: { studentId: targets[0]!.studentId, behaviorTypeId: behaviorTypeId! } }),
    enabled: !many && type === "behavior" && behaviorTypeId != null && targets[0] != null,
  });
  const studyCatalogId = studyId !== "" && studyId !== "other" ? Number(studyId) : null;
  const studyPreview = useQuery({
    queryKey: ["study-occurrence", targets.map((item) => item.studentId).join(","), studyCatalogId, studyId === "other" ? details.trim() : ""],
    queryFn: () =>
      previewStudyOccurrence({
        data: {
          studentIds: targets.map((item) => item.studentId),
          studyNoteId: studyCatalogId ?? undefined,
          details: studyId === "other" ? details.trim() : undefined,
        },
      }),
    enabled: type === "homework" && targets.length > 0 && (studyCatalogId != null || (studyId === "other" && details.trim().length >= 2)),
  });
  const studyStage = studyPreview.data?.stage ?? 1;
  const studyAction = studyActionFor(studyStage);
  const studyNeedsDeduction = (studyPreview.data?.students ?? []).some((row) => row.stage >= 3) || studyStage >= 3;
  const studyHandsOff = (studyStage === 2 || studyStage === 3) && !staffCan(staff, "sendMessages");
  useEffect(() => {
    if (!open) return;
    if (lockedSubject) {
      setLessonSubject(lockedSubject);
      return;
    }
    if (subjects.length === 1) {
      setLessonSubject(subjects[0]);
      return;
    }
    const day = new Date(fromDatetimeLocalValue(occurredAt)).getDay();
    const cells = ((timetable.data as { cells?: { day: number; periodKey: string; subject?: string }[] } | undefined)?.cells ?? []);
    const cell = cells.find((item) => item.day === day && item.periodKey === periodKey);
    setLessonSubject(cell?.subject?.trim() || "");
  }, [open, periodKey, occurredAt, subjects.join("|"), timetable.data, lockedSubject]);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setPeriodKey(presetPeriod || currentPeriod(school.season, new Date(), school.schedules)?.key || "");
      setOccurredAt(toDatetimeLocalValue());
      setWhenOpen(false);
    }
    wasOpen.current = open;
  }, [open, school.season, school.schedules, presetPeriod]);
  useEffect(() => {
    if (shortcut !== "late" || lateTouched) return;
    const slot = slots.find((item) => item.key === periodKey);
    if (!slot) return;
    setLateMinutes(String(minutesAfterStart(slot.startMin, occurredAt)));
  }, [shortcut, lateTouched, periodKey, occurredAt, slots]);
  const namePreview =
    targets.length <= 4
      ? targets.map((t) => t.studentName).join(tr("، "))
      : `${targets
          .slice(0, 3)
          .map((t) => t.studentName)
          .join(tr("، "))} و${targets.length - 3} آخرين`;

  function composeDetails() {
    const extra = details.trim();
    const branch = behaviorBranch.trim();
    const minutes = Number(lateMinutes);
    const late = shortcut === "late" && Number.isFinite(minutes) && minutes > 0 ? lateMinutesLine(minutes) : "";
    if (many && shared) {
      const base = sharedDetails();
      const text = late ? `${late}. ${base}` : base;
      return text.length > 500 ? text.slice(0, 500) : text;
    }
    const text = [late, branch && !extra.startsWith(branch) ? branch : "", extra].filter(Boolean).join(". ");
    return text.length > 500 ? text.slice(0, 500) : text;
  }

  function sharedDetails() {
    const extra = [behaviorBranch.trim(), details.trim()].filter(Boolean).join(". ");
    const names = targets.map((item) => item.studentName);
    let shown = [...names];
    const build = (list: string[], more: number) => {
      const who = `${list.join(tr("، "))}${more > 0 ? ` و${more} آخرين` : ""}`;
      const line = `مخالفة مشتركة — المشتركون: ${who}`;
      return extra ? `${line}. ${extra}` : line;
    };
    while (shown.length > 1 && build(shown, names.length - shown.length).length > 500) {
      shown = shown.slice(0, -1);
    }
    const text = build(shown, names.length - shown.length);
    return text.length > 500 ? text.slice(0, 500) : text;
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!type) throw new Error(tr("اختر نوع الملاحظة"));
      if (targets.length === 0) throw new Error(tr("لم يُحدد طلاب"));
      if (type === "behavior" && !behaviorTypeId) throw new Error(tr("اختر نوع المخالفة السلوكية"));
      if (type === "behavior" && (selectedBehavior?.branches?.length ?? 0) > 0 && !behaviorBranch.trim()) {
        throw new Error(tr("اختر خيار الفرع"));
      }
      if (otherBehavior && details.trim().length < 2) throw new Error(tr("صف المخالفة يدوياً"));
      if (shortcut === "late" && !(Number(lateMinutes) >= 1)) throw new Error(tr("أدخل دقائق التأخر عن بداية الحصة"));
      const noteDetails = composeDetails();
      const saved: SavedBehavior[] = [];
      const whatsapps: { phone: string; body: string }[] = [];
      const failedIds: number[] = [];
      const failedNames: string[] = [];
      let label = "";
      let count = 0;
      let transferred = 0;
      let messageStages = 0;
      let firstError = tr("تعذر التسجيل");
      setSent(0);
      for (const target of targets) {
        try {
          const result = (await createNote({
            data: {
              studentId: target.studentId,
              type,
              details: noteDetails,
              behaviorTypeId: type === "behavior" ? behaviorTypeId ?? undefined : undefined,
              studyNoteId: type === "homework" && studyCatalogId != null ? studyCatalogId : undefined,
              deduction: type === "homework" && studyNeedsDeduction ? Number(deduction) : undefined,
              periodKey,
              occurredAt: fromDatetimeLocalValue(occurredAt),
              subject: lessonSubject,
            },
          })) as {
            id: number;
            label: string;
            studentName: string;
            parentPhone?: string;
            className?: string;
            shortName?: string;
            stageName?: string;
            occurrence?: number;
            behaviorName?: string | null;
            behaviorDegree?: number | null;
            whatsapp?: { phone?: string; body?: string } | null;
            studyAction?: string;
            studyStage?: number | null;
            transferred?: boolean;
          };
          label = result.studyAction ? `${result.label}` : result.label;
          count += 1;
          setSent(count);
          if (result.transferred) transferred += 1;
          if (result.studyStage === 2 || result.studyStage === 3) messageStages += 1;
          if (result.whatsapp?.phone && result.whatsapp.body) {
            whatsapps.push({ phone: result.whatsapp.phone, body: result.whatsapp.body });
          }
          if (type === "behavior" && result.id) {
            saved.push({
              id: result.id,
              studentId: target.studentId,
              studentName: result.studentName || target.studentName,
              parentPhone: result.parentPhone ?? "",
              className: result.className ?? "",
              shortName: result.shortName ?? "",
              stageName: result.stageName ?? "",
              occurrence: result.occurrence ?? 1,
              behaviorName: result.behaviorName || selectedBehavior?.name || "",
              degree: result.behaviorDegree ?? selectedBehavior?.degree ?? 1,
              details: noteDetails,
              periodKey,
            });
          }
        } catch (err) {
          failedIds.push(target.studentId);
          failedNames.push(target.studentName);
          if (failedIds.length === 1 && err instanceof Error && err.message) firstError = err.message;
        }
      }
      if (count === 0) throw new Error(firstError);
      return { label, count, failedIds, failedNames, saved, whatsapps, transferred, messageStages };
    },
    onSuccess: (result) => {
      if (result.failedIds.length > 0) {
        toast.error(`تعذر على ${result.failedIds.length}: ${result.failedNames.slice(0, 4).join(tr("، "))}`);
      }
      const verbal = result.saved.filter((note) => isTeacherVerbal(note.degree, note.occurrence));
      const pending = result.saved.filter((note) => !isTeacherVerbal(note.degree, note.occurrence));
      const actNow = type === "behavior" && staffCan(staff, "takeActions") && pending.length > 0;
      if (type === "homework") {
        const onlyTransfer = result.transferred > 0 && result.whatsapps.length === 0;
        if (!onlyTransfer) {
          toast.success(
            many
              ? tr("سُجّل لكل طالب الإجراء المناسب لعدد مراته")
              : `${tr("سُجّل الإجراء")}: ${tr(studyAction.label)}`,
          );
        }
        const link = result.whatsapps[0];
        if (result.whatsapps.length === 1 && link) {
          const number = toWhatsAppNumber(link.phone);
          if (number) {
            window.open(`https://wa.me/${number}?text=${encodeURIComponent(link.body)}`, "_blank", "noopener,noreferrer");
          }
        } else if (result.whatsapps.length > 1) {
          toast.success(tr("حُفظ إشعار ولي الأمر في سجل كل طالب"));
        }
        if (result.transferred > 0) {
          toast.success(tr("حُوّلت إشعارات أولياء الأمور إلى المرشد الطلابي ووكيل شؤون الطلاب"));
        } else if (result.messageStages > 0 && result.whatsapps.length === 0) {
          toast(tr("سُجّل الإجراء. لا يوجد رقم ولي أمر لفتح واتساب."));
        }
      } else if (verbal.length > 0) {
        toast.success(
          verbal.length > 1
            ? tr("سُجّل تنبيه شفهي على الطلاب وأُغلق دون إجراء من الوكيل")
            : `${tr("سُجّل تنبيه شفهي")} — ${occurrenceLabel(verbal[0]!.occurrence)}. ${tr("لا يحتاج إجراء من الوكيل.")}`,
        );
      }
      if (type !== "homework" && actNow) {
        toast.success(tr("سُجّلت المخالفة. أكمل الإجراء ثم التعهد ثم الإرسال."));
        setFollow(pending);
        setPicking(false);
      } else if (type !== "homework" && verbal.length === 0 && targets.length === 1) {
        toast.success(
          type === "behavior" && (result.saved[0]?.occurrence ?? 1) >= 3
            ? `${tr("أُرسلت المخالفة إلى وكيل شؤون الطلاب")} — ${occurrenceLabel(result.saved[0]?.occurrence ?? 3)}`
            : `تم تسجيل ${result.label} لـ ${targets[0]?.studentName ?? ""}`,
        );
      } else if (type !== "homework" && verbal.length === 0) {
        toast.success(
          many && shared
            ? `تم تسجيل مخالفة مشتركة على ${result.count} طلاب`
            : `تم تسجيل ${result.label} على ${result.count} طلاب`,
        );
      } else if (type !== "homework" && pending.length > 0) {
        toast.success(tr("أُرسلت المخالفة إلى وكيل شؤون الطلاب من المرة الثالثة"));
      }
      if (!actNow) {
        reset();
        setInnerOpen(false);
        onOpenChangeProp?.(false);
        onSubmitted?.({ count: result.count, failedIds: result.failedIds });
      }
      void queryClient.invalidateQueries({ queryKey: ["class"] });
      void queryClient.invalidateQueries({ queryKey: ["today-marks"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: ["desk-notes"] });
      void queryClient.invalidateQueries({ queryKey: ["desk-inbox"] });
      void queryClient.invalidateQueries({ queryKey: ["counseling-desk"] });
      void queryClient.invalidateQueries({ queryKey: ["student"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? tr(err.message) : tr("تعذر تسجيل الملاحظة"));
    },
  });

  function reset() {
    setDetails("");
    setType(null);
    setShortcut(null);
    setBehaviorTypeId(null);
    setBehaviorBranch("");
    setBehaviorStep("choose");
    setExitKind(null);
    setPicking(false);
    setPeriodKey(currentPeriod(school.season, new Date(), school.schedules)?.key ?? "");
    setOccurredAt(toDatetimeLocalValue());
    setWhenOpen(false);
    setSent(0);
    setShared(false);
    setLateMinutes("");
    setLateTouched(false);
    setStudyId("");
    setDeduction("");
    setFollow(null);
  }

  function onOpenChange(next: boolean) {
    if (!next && type === "behavior" && behaviorStep === "review") {
      setLeaveAsk(true);
      return;
    }
    setLeaveAsk(false);
    setInnerOpen(next);
    onOpenChangeProp?.(next);
    if (next) {
      setPeriodKey(currentPeriod(school.season, new Date(), school.schedules)?.key ?? periodKey);
      setOccurredAt(toDatetimeLocalValue());
      setWhenOpen(false);
    }
    if (!next) reset();
  }

  function confirmLeave() {
    setLeaveAsk(false);
    setInnerOpen(false);
    onOpenChangeProp?.(false);
    reset();
  }

  const canSend =
    targets.length > 0 &&
    type != null &&
    (type !== "behavior" || behaviorTypeId != null) &&
    (type !== "behavior" || !(selectedBehavior?.branches?.length) || Boolean(behaviorBranch.trim())) &&
    (!otherBehavior || details.trim().length >= 2) &&
    (shortcut !== "late" || Number(lateMinutes) >= 1) &&
    (shortcut !== "homework" || (studyId !== "" && (studyId !== "other" || details.trim().length >= 2) && (!studyNeedsDeduction || Number(deduction) > 0) && !studyPreview.isFetching)) &&
    (subjects.length <= 1 || Boolean(lessonSubject)) &&
    !mutation.isPending;
  const iso = fromDatetimeLocalValue(occurredAt);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        className={cn(
          "flex max-w-[100vw] flex-col overflow-hidden p-4",
          "!inset-0 !h-dvh !max-h-dvh !w-auto !max-w-[100vw] !translate-x-0 !translate-y-0 !rounded-none",
          "sm:!inset-auto sm:!top-1/2 sm:!left-1/2 sm:!h-[92vh] sm:!max-h-[92vh] sm:!w-[min(48rem,calc(100vw-2rem))] sm:!max-w-3xl sm:!-translate-x-1/2 sm:!-translate-y-1/2 sm:!rounded-[var(--radius-lg)]",
        )}
      >
        {follow ? (
          <ActionSequence
            notes={follow}
            procedures={behaviorTypes.find((bt) => bt.name === follow[0]?.behaviorName)?.procedures}
            onDone={() => {
              const count = follow.length;
              setFollow(null);
              reset();
              setInnerOpen(false);
              onOpenChangeProp?.(false);
              onSubmitted?.({ count, failedIds: [] });
            }}
          />
        ) : type === "behavior" && behaviorStep === "review" && selectedBehavior ? (
          <BehaviorReview
            student={many ? namePreview : showName(targets[0]?.studentName ?? "")}
            name={selectedBehavior.name}
            degree={selectedBehavior.degree ?? 1}
            staffAudience={isStaffViolation(selectedBehavior)}
            procedures={selectedBehavior.procedures}
            nextOccurrence={many ? undefined : occurrencePreview.data?.next}
            shared={many}
            other={otherBehavior}
            late={shortcut === "late"}
            lateMinutes={lateMinutes}
            onLateMinutes={(value) => { setLateTouched(true); setLateMinutes(value); }}
            details={details}
            onDetails={setDetails}
            formKey={formKey}
            pending={mutation.isPending}
            canSend={canSend}
            onBack={() => { setBehaviorStep("choose"); setPicking(true); }}
            onSend={() => mutation.mutate()}
          />
        ) : (
        <>
        <DialogHeader className="mb-2 shrink-0">
          <DialogTitle>{many ? tr("مخالفة جماعية") : tr("تسجيل ملاحظة أو مخالفة")}</DialogTitle>
          <DialogDescription>
            {many
              ? namePreview
              : `${showName(targets[0]?.studentName ?? "")}${staff.subject ? ` · ${tr(staff.subject)}` : ""}`}
          </DialogDescription>
          {many ? (
            <p className="-mt-1 mb-2 text-xs text-fg-muted">
              {shared
                ? tr("ستُكتب أسماء كل المشاركين في تسجيل كل طالب، ويبقى لكل واحد إجراءه عند وكيل شؤون الطلاب.")
                : tr("تُسجَّل نفس المخالفة على كل طالب وحده، ولكل واحد إجراءه عند وكيل شؤون الطلاب.")}
            </p>
          ) : null}
          {many ? (
            <button
              type="button"
              aria-pressed={shared}
              onClick={() => setShared((value) => !value)}
              className={cn(
                "mb-2 flex w-full items-start gap-3 rounded-[var(--radius-md)] border px-3 py-3 text-right",
                shared ? "border-primary bg-primary/5" : "border-border bg-bg",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded border",
                  shared ? "border-primary bg-primary text-primary-fg" : "border-border bg-bg-elevated",
                )}
              >
                {shared ? <Check className="size-3.5" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{tr("مخالفة مشتركة")}</span>
                <span className="mt-0.5 block text-xs leading-5 text-fg-muted">
                  {tr("مثل المضاربة: يظهر في التسجيل اسم كل من اشترك، وليس نسخة منفصلة بلا ذكر البقية.")}
                </span>
              </span>
            </button>
          ) : null}
        </DialogHeader>

        <button
          type="button"
          onClick={() => setWhenOpen((v) => !v)}
          className="mb-2 flex min-h-12 w-full shrink-0 items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border bg-bg-elevated px-3 text-right"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-5">{tr(periodLabel)}</span>
            <span className="block text-xs text-fg-muted">
              {formatDay(iso)} · {formatTime(iso)}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
            {tr("تعديل")}
            <ChevronDown className={cn("size-4 transition-transform", whenOpen && "rotate-180")} />
          </span>
        </button>
        {whenOpen ? (
          <div className="mb-2 shrink-0 space-y-2 rounded-[var(--radius-md)] border border-border bg-bg p-3">
            <div className="space-y-1.5">
              <Label htmlFor={`period-${formKey}`}>{tr("الحصة")}</Label>
              <Select
                id={`period-${formKey}`}
                value={periodKey}
                onChange={(e) => setPeriodKey(e.target.value)}
              >
                <option value="">{tr("غير محدد")}</option>
                {slots.map((s) => (
                  <option key={s.key} value={s.key}>
                    {tr(s.label)} ({s.from}–{s.to})
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`when-${formKey}`}>{tr("التاريخ والوقت")}</Label>
              <Input
                id={`when-${formKey}`}
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                dir="ltr"
                className="text-left"
              />
            </div>
          </div>
        ) : null}

        {lockedSubject && !pickSubject ? (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-primary/10 px-3 py-2">
            <p className="text-sm font-semibold">{tr("المادة")}: {tr(lockedSubject)}</p>
            {subjects.length > 1 ? (
              <button type="button" className="text-xs font-medium text-primary" onClick={() => setPickSubject(true)}>
                {tr("تغيير المادة")}
              </button>
            ) : null}
          </div>
        ) : subjects.length === 1 ? (
          <p className="mb-2 text-sm font-semibold">{tr("المادة")}: {tr(subjects[0])}</p>
        ) : subjects.length > 1 ? (
          <div className="mb-2 space-y-1">
            <p className="text-xs text-fg-muted">{tr("اختر المادة. لا تُحدَّد واحدة مسبقاً.")}</p>
            <div className="flex flex-wrap gap-2">
              {subjects.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setLessonSubject(name)}
                  className={cn(
                    "min-h-10 rounded-full border px-3 text-sm",
                    lessonSubject === name ? "border-primary bg-primary text-primary-fg" : "border-border bg-bg",
                  )}
                >
                  {tr(name)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-2 min-h-0 flex-1 touch-pan-y space-y-3 overflow-y-auto overscroll-contain pe-1">
          <Label>{tr("نوع الملاحظة")}</Label>
          <div className="grid grid-cols-4 gap-1.5">
            {NOTE_TYPES.map((item) => {
              const meta = NOTE_META[item];
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setExitKind(null);
                    if (item === "homework") {
                      setShortcut("homework");
                      setStudyId("");
                      setType(null);
                      setBehaviorTypeId(null);
                      setPicking(false);
                      setDetails("");
                      return;
                    }
                    const linked = SHORTCUT_VIOLATIONS[item];
                    if (linked) {
                      const found = behaviorTypes.find((bt) => bt.name === linked);
                      setShortcut(item);
                      setType("behavior");
                      setBehaviorTypeId(found?.id ?? null);
                      setPicking(false);
                      setStudyId("");
                      setBehaviorStep(found ? "review" : "choose");
                      if (item === "late") setLateTouched(false);
                      if (!found) toast.error(tr("المخالفة غير جاهزة بعد. حدّث الصفحة ثم أعد المحاولة."));
                      return;
                    }
                    setShortcut(null);
                    setStudyId("");
                    setType(item);
                    if (item === "behavior") setPicking(true);
                    else {
                      setBehaviorTypeId(null);
                      setPicking(false);
                    }
                  }}
                  className={cn(
                    "flex min-h-8 items-center justify-center rounded-[var(--radius-md)] border px-1 text-center font-semibold leading-4",
                    item === "homework" ? "text-[11px]" : "text-[13px]",
                    (shortcut ? shortcut === item : type === item)
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-bg text-fg",
                  )}
                >
                  {tr(meta.short)}
                </button>
              );
            })}
          </div>
          {!many ? (
            <div className="space-y-1.5">
              <Label>{tr("الاستئذان")}</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {EXIT_PERMITS.map((item) => (
                  <button
                    key={item.kind}
                    type="button"
                    onClick={() => {
                      setExitKind(item.kind);
                      setType(null);
                      setShortcut(null);
                      setBehaviorTypeId(null);
                      setPicking(false);
                      setStudyId("");
                      setBehaviorStep("choose");
                    }}
                    className={cn(
                      "flex min-h-8 items-center justify-center rounded-[var(--radius-md)] border px-2 text-center text-[13px] font-semibold leading-4",
                      exitKind === item.kind ? "border-primary bg-primary/5 text-primary" : "border-border bg-bg text-fg",
                    )}
                  >
                    {tr(item.label)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {shortcut === "homework" ? (
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">{tr("الملاحظة الدراسية")}</p>
              <div className="grid gap-1.5">
                {studyChoices.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => {
                      setExitKind(null);
                      setStudyId(note.id);
                      setType("homework");
                      setBehaviorTypeId(null);
                      setShortcut("homework");
                      setDetails(note.id === "other" ? "" : "");
                      setDeduction("");
                    }}
                    className={cn(
                      "min-h-8 rounded-[var(--radius-md)] border px-3 py-2 text-right text-sm font-semibold",
                      studyId === note.id ? "border-primary bg-primary/5 text-primary" : "border-border bg-bg text-fg",
                    )}
                  >
                    {tr(note.label)}
                  </button>
                ))}
              </div>
            </div>
          ) : shortcut && selectedBehavior ? (
            <p className="text-xs text-fg-muted">
              {tr("اختصار للتسجيل السريع، وتُعامل كمخالفة سلوكية من الدرجة")} {degreeLabel(selectedBehavior.degree)}. {tr("بعد الإرسال تُكمَل إجراءاتها.")}
            </p>
          ) : type ? (
            <p className="text-xs text-fg-muted">{tr(TYPE_HINT[type])}</p>
          ) : null}

          {type === "behavior" ? (
            selectedBehavior ? (
              <button
                type="button"
                onClick={() => setPicking(true)}
                className={cn("w-full rounded-2xl border-2 px-3 py-3 text-right", degreeTone(selectedBehavior.degree ?? 1))}
              >
                <p className="text-base font-semibold leading-7">{tr(selectedBehavior.name)}</p>
                {behaviorBranch ? <p className="text-sm font-semibold">{behaviorBranch}</p> : null}
                <p className="text-sm font-medium">
                  {degreeLabel(selectedBehavior.degree)}
                  {isStaffViolation(selectedBehavior) ? tr(" · تجاه المعلمين ومن في حكمهم") : ""}
                  {" "}— {tr("اضغط لتغيير المخالفة")}
                </p>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="min-h-10 w-full rounded-2xl border-2 border-dashed border-primary px-3 text-base font-bold text-primary"
              >
                {tr("اختيار المخالفة")}
              </button>
            )
          ) : type === "homework" ? (
            <div className="space-y-3">
              <div className="space-y-2 rounded-2xl border border-border bg-bg-elevated p-3">
                <p className="text-sm font-semibold">{tr("الإجراء حسب التكرار")}</p>
                {many ? (
                  <p className="text-xs text-fg-muted">{tr("المرحلة تعتمد على عدد مرات كل طالب.")}</p>
                ) : (
                  <p className="text-xs text-fg-muted">{occurrenceLabel(studyPreview.data?.students?.[0]?.next ?? studyStage)} — {tr("هذه المرة")}</p>
                )}
                {STUDY_ACTIONS.map((action, index) => {
                  const current = index + 1 === studyStage;
                  return (
                    <div
                      key={action.id}
                      className={cn("rounded-xl border px-3 py-2", current ? "border-primary bg-primary/5" : "border-border bg-bg")}
                    >
                      <p className="text-xs font-semibold">
                        {occurrenceLabel(index + 1)}
                        {current ? ` — ${tr("هذه المرة")}` : ""}
                      </p>
                      <p className="text-sm font-semibold">{tr(action.label)}</p>
                      <p className="text-xs leading-5 text-fg-muted">{tr(action.hint)}</p>
                    </div>
                  );
                })}
              </div>
              {studyHandsOff ? (
                <p className="text-xs leading-5 text-fg-muted">{tr("إشعار ولي الأمر يرسله المرشد الطلابي أو وكيل شؤون الطلاب، ما لم تُمنح صلاحية الرسائل.")}</p>
              ) : null}
              {studyId === "other" ? (
                <div className="space-y-1.5">
                  <Label htmlFor={`details-${formKey}`}>{tr("اكتب الملاحظة الدراسية")}</Label>
                  <Textarea
                    id={`details-${formKey}`}
                    className="min-h-20"
                    placeholder={tr("مثال: لم يحضر أدوات الرسم")}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor={`details-${formKey}`}>{tr("تفصيل إضافي")}</Label>
                  <Textarea
                    id={`details-${formKey}`}
                    className="min-h-8"
                    placeholder={tr("اختياري، مثل اسم الواجب أو الدرس")}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                  />
                </div>
              )}
              {studyNeedsDeduction ? (
                <div className="space-y-1.5">
                  <Label htmlFor={`deduct-${formKey}`}>{tr("الدرجة المخصومة من أعمال السنة")}</Label>
                  <Input
                    id={`deduct-${formKey}`}
                    type="number"
                    min={0.5}
                    max={30}
                    step={0.5}
                    inputMode="decimal"
                    value={deduction}
                    onChange={(e) => setDeduction(e.target.value)}
                  />
                  <p className="text-xs text-fg-muted">{tr("تُخصم من درجات المادة لا من السلوك، ويُشعر ولي الأمر.")}</p>
                </div>
              ) : null}
            </div>
          ) : type ? (
            <div className="space-y-1.5">
              <Label htmlFor={`details-${formKey}`}>{tr("الملاحظات")}</Label>
              <Textarea
                id={`details-${formKey}`}
                className="min-h-20"
                placeholder={tr("أضف تفاصيل الملاحظة…")}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>
          ) : exitKind ? (
            <p className="px-1 text-xs text-fg-muted">{tr("يظهر أمام اسم الطالب لمدة ١٥ دقيقة.")}</p>
          ) : (
            <p className="px-1 py-6 text-center text-sm text-fg-muted">{tr("اختر نوع الملاحظة أعلاه لعرض القائمة.")}</p>
          )}
        </div>

        <div className="mt-2 shrink-0 border-t border-border pt-3">
          {exitKind ? (
            <Button
              className="w-full"
              disabled={grantExit.isPending || !targets[0]}
              onClick={() => {
                const studentId = targets[0]?.studentId;
                if (!studentId) return;
                grantExit.mutate(
                  { studentId, kind: exitKind },
                  {
                    onSuccess: () => {
                      reset();
                      setInnerOpen(false);
                      onOpenChangeProp?.(false);
                    },
                  },
                );
              }}
            >
              {grantExit.isPending ? tr("جارٍ الحفظ…") : tr("سماح بالخروج")}
            </Button>
          ) : type === "behavior" && behaviorStep === "choose" ? (
            <Button className="w-full" disabled={!selectedBehavior} onClick={() => setBehaviorStep("review")}>
              {tr("التالي: الإجراءات")}
            </Button>
          ) : (
          <Button className="w-full" disabled={!canSend} onClick={() => mutation.mutate()}>
            <Send className="size-4" />
            {mutation.isPending
              ? many
                ? `جارٍ التسجيل… ${sent} من ${targets.length}`
                : tr("جارٍ الإرسال…")
              : many
                ? type === "homework"
                  ? studyHandsOff
                    ? `${tr("تحويل حسب تكرار كل طالب")} — ${targets.length}`
                    : `${tr(studyAction.label)} — ${targets.length}`
                  : selectedBehavior
                  ? `تسجيل «${tr(selectedBehavior.name)}» على ${targets.length}`
                  : type
                    ? `تسجيل ${tr(NOTE_META[type].label)} على ${targets.length}`
                    : `تسجيل على ${targets.length}`
                : type === "homework"
                  ? !many && studyHandsOff
                    ? studyStage === 2
                      ? tr("تحويل الإشعار للمرشد والوكيل")
                      : tr("تسجيل الحسم وتحويل الإشعار")
                    : tr(studyAction.label)
                  : selectedBehavior
                  ? `${tr("إرسال")} — ${tr(selectedBehavior.name)}`
                  : type
                    ? `${tr("إرسال")} — ${tr(NOTE_META[type].label)}`
                    : tr("إرسال الملاحظة")}
          </Button>
          )}
        </div>
        </>
        )}
      </DialogContent>
      {picking ? (
        <BehaviorPicker
          items={behaviorTypes}
          audience={audience}
          degree={degreePick}
          currentId={behaviorTypeId}
          onAudience={(next) => {
            setAudience(next);
            setDegreePick(next === "staff" ? 4 : 1);
          }}
          onDegree={setDegreePick}
          onPick={(id, branch) => {
            setType("behavior");
            setBehaviorTypeId(id);
            setBehaviorBranch(branch ?? "");
            setPicking(false);
            setBehaviorStep("review");
          }}
          onClose={() => {
            setPicking(false);
            if (behaviorTypeId != null) setBehaviorStep("review");
          }}
        />
      ) : null}
    </Dialog>
    <Dialog open={leaveAsk} onOpenChange={setLeaveAsk}>
      <DialogContent className="!inset-auto !top-1/2 !left-1/2 z-[80] !h-auto !max-h-none w-[min(92vw,24rem)] !max-w-sm !-translate-x-1/2 !-translate-y-1/2 rounded-2xl p-5 shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-center text-lg">{tr("إغلاق المخالفة دون حفظها؟")}</DialogTitle>
          <DialogDescription className="text-center">{tr("لم يُعتمد الإجراء ولن تُحفظ المخالفة.")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" onClick={() => setLeaveAsk(false)}>{tr("البقاء")}</Button>
          <Button type="button" onClick={confirmLeave}>{tr("إغلاق دون حفظ")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>
  );
}
