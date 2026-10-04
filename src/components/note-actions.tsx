import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { createNote, closeNote } from "@/lib/school/api";
import { NOTE_META, NOTE_TYPES, SHORTCUT_VIOLATIONS, classLabel, currentPeriod, degreeLabel, degreeTone, formatDay, formatTime, fromDatetimeLocalValue, isOtherChoice, isStaffViolation, occurrenceLabel, procedureLadder, procedureStageLabel, resolveOther, scheduleFor, stageIndexFor, toDatetimeLocalValue } from "@/lib/school/constants";
import { staffCan } from "@/lib/school/permissions";
import type { NoteType } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { PrintFormsButton } from "@/components/print-forms";
import { WhatsAppDialog } from "@/components/whatsapp-dialog";
import { cn } from "@/lib/utils";

const TYPE_HINT: Record<NoteType, string> = {
  absence: "يسجّل غياب الطالب عن هذه الحصة",
  late: "يسجّل التأخر عن بداية الحصة",
  homework: "يسجّل عدم حل الواجب المطلوب",
  behavior: "اختر نوع المخالفة من الدليل ثم أرسل",
};

export type NoteTarget = {
  studentId: number;
  studentName: string;
  classId: number;
};

function BehaviorPicker({
  items,
  audience,
  degree,
  onAudience,
  onDegree,
  onPick,
  onClose,
}: {
  items: { id: number; name: string; degree?: number }[];
  audience: "students" | "staff";
  degree: number;
  onAudience: (next: "students" | "staff") => void;
  onDegree: (degree: number) => void;
  onPick: (id: number) => void;
  onClose: () => void;
}) {
  const pool = items.filter((item) => isStaffViolation(item) === (audience === "staff") && item.name !== "أخرى");
  const other = items.find((item) => item.name === "أخرى");
  const degrees = audience === "staff" ? [4, 5] : [1, 2, 3, 4, 5];
  const active = degrees.includes(degree) ? degree : degrees[0]!;
  const list = pool.filter((item) => (item.degree ?? 1) === active);
  const deduct: Record<number, string> = { 1: "حسم 1", 2: "حسم 2", 3: "حسم 3", 4: "حسم 10", 5: "حسم 15" };
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        hideClose
        className={cn(
          "flex flex-col gap-2 overflow-hidden bg-bg p-3",
          "!inset-0 !h-dvh !max-h-dvh !w-full !max-w-none !translate-x-0 !translate-y-0 !rounded-none",
        )}
      >
        <DialogTitle className="sr-only">اختيار المخالفة</DialogTitle>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={onClose} className="h-11 shrink-0 rounded-full border border-border px-4 text-sm font-semibold">
            رجوع
          </button>
          <div className="grid h-11 min-w-0 flex-1 grid-cols-2 rounded-full border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => onAudience("students")}
              className={cn(
                "rounded-full text-sm font-bold",
                audience === "students" ? "bg-primary text-primary-fg" : "text-fg",
              )}
            >
              طلبة
            </button>
            <button
              type="button"
              onClick={() => onAudience("staff")}
              className={cn(
                "rounded-full text-sm font-bold",
                audience === "staff" ? "bg-[#7f1d1d] text-white" : "text-fg",
              )}
            >
              تجاه المعلمين
            </button>
          </div>
        </div>
        <div className={cn("grid shrink-0 gap-1.5", degrees.length === 2 ? "grid-cols-2" : "grid-cols-5")}>
          {degrees.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onDegree(value)}
              className={cn(
                "min-h-12 rounded-xl border-2 px-0.5 py-1 text-center leading-tight",
                degreeTone(value),
                active === value ? "ring-2 ring-offset-1 ring-current" : "opacity-70",
              )}
            >
              <span className="block text-[12px] font-bold">{degreeLabel(value)}</span>
              <span className="block text-[10px] font-semibold">{deduct[value]}</span>
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-2">
          {list.map((bt) => (
            <button
              key={bt.id}
              type="button"
              onClick={() => onPick(bt.id)}
              className={cn("min-h-16 w-full rounded-2xl border-2 px-3 py-3 text-right", degreeTone(bt.degree ?? 1))}
            >
              <p className="text-base font-semibold leading-7">{bt.name}</p>
            </button>
          ))}
          {audience === "students" && active === 1 && other ? (
            <button
              type="button"
              onClick={() => onPick(other.id)}
              className="min-h-16 w-full rounded-2xl border-2 border-border bg-card px-3 py-3 text-right"
            >
              <p className="text-base font-semibold leading-7">أخرى</p>
            </button>
          ) : null}
          {list.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-fg-muted">لا مخالفات في هذه الدرجة.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
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
      toast.success(notes.length > 1 ? `تم إنهاء المخالفة على ${notes.length} طلاب` : "تم إنهاء المخالفة");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: ["class"] });
      void queryClient.invalidateQueries({ queryKey: ["student"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      onDone();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر حفظ الإجراء"),
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
          label="طباعة التعهد"
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
            label="إرسال رسالة"
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <DialogHeader className="shrink-0">
        <DialogTitle>إجراءات المخالفة</DialogTitle>
        <DialogDescription>
          {notes.length > 1 ? `${notes.map((note) => note.studentName).join("، ")} · ` : `${head.studentName} · `}
          {head.behaviorName}
          {notes.length === 1 ? ` · ${occurrenceLabel(head.occurrence)}` : ""}
          {head.degree ? ` · الدرجة ${degreeLabel(head.degree)}` : ""}
        </DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {sameStage ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold">
              {procedureStageLabel(rows[0]!.stage + 1)} — المناسب لهذه المرة
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
                <span>{line}</span>
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
                <span>{line}</span>
              </label>
            ))}
            {tools(row.note, resolveOther(pickedFor(row.note.id), "").join(" — "))}
          </div>
        ))}
      </div>
      <Button className="w-full shrink-0" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "جارٍ الحفظ…" : notes.length > 1 ? `إنهاء المخالفة على ${notes.length}` : "إنهاء المخالفة"}
      </Button>
    </div>
  );
}

export function NoteActions({
  studentId,
  studentName,
  classId,
}: {
  studentId: number;
  studentName: string;
  classId: number;
}) {
  return (
    <NoteComposer
      targets={[{ studentId, studentName, classId }]}
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
}: {
  targets: NoteTarget[];
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  onSubmitted?: (result: { count: number; failedIds: number[] }) => void;
  trigger?: ReactNode;
}) {
  const { behaviorTypes, school, staff } = useWorkspace();
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
  const [picking, setPicking] = useState(false);
  const [audience, setAudience] = useState<"students" | "staff">("students");
  const [degreePick, setDegreePick] = useState(1);
  const [follow, setFollow] = useState<SavedBehavior[] | null>(null);
  const [occurredAt, setOccurredAt] = useState(toDatetimeLocalValue());
  const [sent, setSent] = useState(0);
  const [shared, setShared] = useState(false);
  const wasOpen = useRef(false);
  const queryClient = useQueryClient();
  const selectedBehavior = behaviorTypes.find((bt) => bt.id === behaviorTypeId);
  const otherBehavior = Boolean(selectedBehavior && isOtherChoice(selectedBehavior.name));
  const periodLabel = slots.find((s) => s.key === periodKey)?.label ?? "الحصة غير محددة";
  const many = targets.length > 1;
  const formKey = many ? "group" : String(targets[0]?.studentId ?? "note");
  useEffect(() => {
    if (open && !wasOpen.current) {
      setPeriodKey(currentPeriod(school.season, new Date(), school.schedules)?.key ?? "");
      setOccurredAt(toDatetimeLocalValue());
      setWhenOpen(false);
    }
    wasOpen.current = open;
  }, [open, school.season, school.schedules]);
  const namePreview =
    targets.length <= 4
      ? targets.map((t) => t.studentName).join("، ")
      : `${targets
          .slice(0, 3)
          .map((t) => t.studentName)
          .join("، ")} و${targets.length - 3} آخرين`;

  function sharedDetails() {
    const extra = details.trim();
    const names = targets.map((item) => item.studentName);
    let shown = [...names];
    const build = (list: string[], more: number) => {
      const who = `${list.join("، ")}${more > 0 ? ` و${more} آخرين` : ""}`;
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
      if (!type) throw new Error("اختر نوع الملاحظة");
      if (targets.length === 0) throw new Error("لم يُحدد طلاب");
      if (type === "behavior" && !behaviorTypeId) throw new Error("اختر نوع المخالفة السلوكية");
      if (otherBehavior && details.trim().length < 2) throw new Error("صف المخالفة يدوياً");
      const saved: SavedBehavior[] = [];
      const failedIds: number[] = [];
      const failedNames: string[] = [];
      let label = "";
      let count = 0;
      let firstError = "تعذر التسجيل";
      setSent(0);
      for (const target of targets) {
        try {
          const result = (await createNote({
            data: {
              studentId: target.studentId,
              type,
              details: many && shared ? sharedDetails() : details,
              behaviorTypeId: type === "behavior" ? behaviorTypeId ?? undefined : undefined,
              periodKey,
              occurredAt: fromDatetimeLocalValue(occurredAt),
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
          };
          label = result.label;
          count += 1;
          setSent(count);
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
              details: many && shared ? sharedDetails() : details,
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
      return { label, count, failedIds, failedNames, saved };
    },
    onSuccess: (result) => {
      if (result.failedIds.length > 0) {
        toast.error(`تعذر على ${result.failedIds.length}: ${result.failedNames.slice(0, 4).join("، ")}`);
      }
      const actNow = type === "behavior" && staffCan(staff, "takeActions") && result.saved.length > 0;
      if (actNow) {
        toast.success("سُجّلت المخالفة. أكمل الإجراء ثم التعهد ثم الإرسال.");
        setFollow(result.saved);
        setPicking(false);
      } else if (targets.length === 1) {
        toast.success(`تم تسجيل ${result.label} لـ ${targets[0]?.studentName ?? ""}`);
      } else {
        toast.success(
          many && shared
            ? `تم تسجيل مخالفة مشتركة على ${result.count} طلاب`
            : `تم تسجيل ${result.label} على ${result.count} طلاب`,
        );
      }
      if (!actNow) {
        reset();
        setInnerOpen(false);
        onOpenChangeProp?.(false);
        onSubmitted?.({ count: result.count, failedIds: result.failedIds });
      }
      void queryClient.invalidateQueries({ queryKey: ["class"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: ["desk-notes"] });
      void queryClient.invalidateQueries({ queryKey: ["counseling-desk"] });
      void queryClient.invalidateQueries({ queryKey: ["student"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "تعذر تسجيل الملاحظة");
    },
  });

  function reset() {
    setDetails("");
    setType(null);
    setShortcut(null);
    setBehaviorTypeId(null);
    setPicking(false);
    setPeriodKey(currentPeriod(school.season, new Date(), school.schedules)?.key ?? "");
    setOccurredAt(toDatetimeLocalValue());
    setWhenOpen(false);
    setSent(0);
    setShared(false);
    setFollow(null);
  }

  function onOpenChange(next: boolean) {
    setInnerOpen(next);
    onOpenChangeProp?.(next);
    if (next) {
      setPeriodKey(currentPeriod(school.season, new Date(), school.schedules)?.key ?? periodKey);
      setOccurredAt(toDatetimeLocalValue());
      setWhenOpen(false);
    }
    if (!next) reset();
  }

  const canSend =
    targets.length > 0 &&
    type != null &&
    (type !== "behavior" || behaviorTypeId != null) &&
    (!otherBehavior || details.trim().length >= 2) &&
    !mutation.isPending;
  const iso = fromDatetimeLocalValue(occurredAt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        className={cn(
          "flex flex-col overflow-hidden p-4",
          "!inset-0 !h-dvh !max-h-dvh !w-full !max-w-none !translate-x-0 !translate-y-0 !rounded-none",
          "sm:!inset-auto sm:!top-1/2 sm:!left-1/2 sm:!h-auto sm:!max-h-[92vh] sm:!w-[calc(100%-2rem)] sm:!max-w-3xl sm:!-translate-x-1/2 sm:!-translate-y-1/2 sm:!rounded-[var(--radius-lg)]",
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
        ) : (
        <>
        <DialogHeader className="mb-2 shrink-0">
          <DialogTitle>{many ? "مخالفة جماعية" : "تسجيل ملاحظة أو مخالفة"}</DialogTitle>
          <DialogDescription>
            {many
              ? namePreview
              : `${targets[0]?.studentName ?? ""}${staff.subject ? ` · ${staff.subject}` : ""}`}
          </DialogDescription>
          {many ? (
            <p className="-mt-1 mb-2 text-xs text-fg-muted">
              {shared
                ? "ستُكتب أسماء كل المشاركين في تسجيل كل طالب، ويبقى لكل واحد إجراءه عند وكيل شؤون الطلاب."
                : "تُسجَّل نفس المخالفة على كل طالب وحده، ولكل واحد إجراءه عند وكيل شؤون الطلاب."}
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
                <span className="block text-sm font-semibold">مخالفة مشتركة</span>
                <span className="mt-0.5 block text-xs leading-5 text-fg-muted">
                  مثل المضاربة: يظهر في التسجيل اسم كل من اشترك، وليس نسخة منفصلة بلا ذكر البقية.
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
            <span className="block text-sm font-semibold leading-5">{periodLabel}</span>
            <span className="block text-xs text-fg-muted">
              {formatDay(iso)} · {formatTime(iso)}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
            تعديل
            <ChevronDown className={cn("size-4 transition-transform", whenOpen && "rotate-180")} />
          </span>
        </button>
        {whenOpen ? (
          <div className="mb-2 shrink-0 space-y-2 rounded-[var(--radius-md)] border border-border bg-bg p-3">
            <div className="space-y-1.5">
              <Label htmlFor={`period-${formKey}`}>الحصة</Label>
              <Select
                id={`period-${formKey}`}
                value={periodKey}
                onChange={(e) => setPeriodKey(e.target.value)}
              >
                <option value="">غير محدد</option>
                {slots.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label} ({s.from}–{s.to})
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`when-${formKey}`}>التاريخ والوقت</Label>
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

        <div className="shrink-0 space-y-2">
          <Label>نوع الملاحظة</Label>
          <div className="grid grid-cols-4 gap-1.5">
            {NOTE_TYPES.map((item) => {
              const meta = NOTE_META[item];
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    const linked = SHORTCUT_VIOLATIONS[item];
                    if (linked) {
                      const found = behaviorTypes.find((bt) => bt.name === linked);
                      setShortcut(item);
                      setType("behavior");
                      setBehaviorTypeId(found?.id ?? null);
                      setPicking(false);
                      if (!found) toast.error("المخالفة غير جاهزة بعد. حدّث الصفحة ثم أعد المحاولة.");
                      return;
                    }
                    setShortcut(null);
                    setType(item);
                    if (item === "behavior") setPicking(true);
                    else {
                      setBehaviorTypeId(null);
                      setPicking(false);
                    }
                  }}
                  className={cn(
                    "flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border px-1 text-[13px] font-semibold leading-4",
                    (shortcut ? shortcut === item : type === item)
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-bg text-fg",
                  )}
                >
                  {meta.short}
                </button>
              );
            })}
          </div>
          {shortcut && selectedBehavior ? (
            <p className="text-xs text-fg-muted">
              اختصار للتسجيل السريع، وتُعامل كمخالفة سلوكية من الدرجة {degreeLabel(selectedBehavior.degree)}. بعد الإرسال تُكمَل إجراءاتها.
            </p>
          ) : type ? (
            <p className="text-xs text-fg-muted">{TYPE_HINT[type]}</p>
          ) : null}
        </div>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pe-1">
          {type === "behavior" ? (
            selectedBehavior ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  className={cn("w-full rounded-2xl border-2 px-3 py-3 text-right", degreeTone(selectedBehavior.degree ?? 1))}
                >
                  <p className="text-base font-semibold leading-7">{selectedBehavior.name}</p>
                  <p className="text-sm font-medium">
                    الدرجة {degreeLabel(selectedBehavior.degree)}
                    {isStaffViolation(selectedBehavior) ? " · تجاه المعلمين ومن في حكمهم" : ""}
                    {" "}— اضغط لتغيير المخالفة
                  </p>
                </button>
                {otherBehavior ? (
                  <div className="space-y-1.5">
                    <Label htmlFor={`other-${formKey}`}>صف المخالفة يدوياً</Label>
                    <Textarea
                      id={`other-${formKey}`}
                      className="min-h-20"
                      placeholder="اكتب نوع المخالفة…"
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      autoFocus
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor={`details-${formKey}`}>الملاحظات</Label>
                    <Textarea
                      id={`details-${formKey}`}
                      className="min-h-11"
                      placeholder="أضف تفاصيل الملاحظة…"
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                    />
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="min-h-16 w-full rounded-2xl border-2 border-dashed border-primary px-3 text-base font-bold text-primary"
              >
                اختيار المخالفة
              </button>
            )
          ) : type ? (
            <div className="space-y-1.5">
              <Label htmlFor={`details-${formKey}`}>الملاحظات</Label>
              <Textarea
                id={`details-${formKey}`}
                className="min-h-20"
                placeholder="أضف تفاصيل الملاحظة…"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>
          ) : (
            <p className="px-1 py-6 text-center text-sm text-fg-muted">اختر نوع الملاحظة أعلاه لعرض القائمة.</p>
          )}
        </div>

        <div className="mt-2 shrink-0 border-t border-border pt-3">
          <Button className="w-full" disabled={!canSend} onClick={() => mutation.mutate()}>
            <Send className="size-4" />
            {mutation.isPending
              ? many
                ? `جارٍ التسجيل… ${sent} من ${targets.length}`
                : "جارٍ الإرسال…"
              : many
                ? selectedBehavior
                  ? `تسجيل «${selectedBehavior.name}» على ${targets.length}`
                  : type
                    ? `تسجيل ${NOTE_META[type].label} على ${targets.length}`
                    : `تسجيل على ${targets.length}`
                : selectedBehavior
                  ? `إرسال — ${selectedBehavior.name}`
                  : type
                    ? `إرسال — ${NOTE_META[type].label}`
                    : "إرسال الملاحظة"}
          </Button>
        </div>
        </>
        )}
      </DialogContent>
      {picking ? (
        <BehaviorPicker
          items={behaviorTypes}
          audience={audience}
          degree={degreePick}
          onAudience={(next) => {
            setAudience(next);
            setDegreePick(next === "staff" ? 4 : 1);
          }}
          onDegree={setDegreePick}
          onPick={(id) => {
            setBehaviorTypeId(id);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </Dialog>
  );
}
