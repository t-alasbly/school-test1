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
import { createNote } from "@/lib/school/api";
import { NOTE_META, NOTE_TYPES, currentPeriod, degreeLabel, formatDay, formatTime, fromDatetimeLocalValue, isOtherChoice, scheduleFor, toDatetimeLocalValue } from "@/lib/school/constants";
import type { NoteType } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
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
  const [behaviorTypeId, setBehaviorTypeId] = useState<number | null>(null);
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
          })) as { label: string };
          label = result.label;
          count += 1;
          setSent(count);
        } catch (err) {
          failedIds.push(target.studentId);
          failedNames.push(target.studentName);
          if (failedIds.length === 1 && err instanceof Error && err.message) firstError = err.message;
        }
      }
      if (count === 0) throw new Error(firstError);
      return { label, count, failedIds, failedNames };
    },
    onSuccess: (result) => {
      if (targets.length === 1) {
        toast.success(`تم تسجيل ${result.label} لـ ${targets[0]?.studentName ?? ""}`);
      } else {
        toast.success(
          many && shared
            ? `تم تسجيل مخالفة مشتركة على ${result.count} طلاب`
            : `تم تسجيل ${result.label} على ${result.count} طلاب`,
        );
      }
      if (result.failedIds.length > 0) {
        toast.error(`تعذر على ${result.failedIds.length}: ${result.failedNames.slice(0, 4).join("، ")}`);
      }
      reset();
      setInnerOpen(false);
      onOpenChangeProp?.(false);
      onSubmitted?.({ count: result.count, failedIds: result.failedIds });
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
    setBehaviorTypeId(null);
    setPeriodKey(currentPeriod(school.season, new Date(), school.schedules)?.key ?? "");
    setOccurredAt(toDatetimeLocalValue());
    setWhenOpen(false);
    setSent(0);
    setShared(false);
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
              const selected = type === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setType(item);
                    if (item !== "behavior") setBehaviorTypeId(null);
                  }}
                  className={cn(
                    "min-h-11 rounded-[var(--radius-md)] border px-1 text-sm font-semibold",
                    selected
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-bg text-fg",
                  )}
                >
                  {meta.short}
                </button>
              );
            })}
          </div>
          {type ? <p className="text-xs text-fg-muted">{TYPE_HINT[type]}</p> : null}
        </div>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pe-1">
          {type === "behavior" ? (
            selectedBehavior ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setBehaviorTypeId(null)}
                  className="w-full rounded-[var(--radius-md)] border border-primary bg-primary/5 px-3 py-2.5 text-right"
                >
                  <p className="text-sm font-semibold leading-6">{selectedBehavior.name}</p>
                  <p className="text-xs text-fg-muted">
                    الدرجة {degreeLabel(selectedBehavior.degree)} — اضغط لتغيير المخالفة
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
            ) : behaviorTypes.length === 0 ? (
              <p className="rounded-[var(--radius-md)] border border-border px-3 py-2 text-sm text-fg-muted">
                لا توجد أنواع مخالفات. اطلب من مدير التطبيق إضافتها من الإعدادات.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {behaviorTypes.map((bt) => (
                  <button
                    key={bt.id}
                    type="button"
                    onClick={() => setBehaviorTypeId(bt.id)}
                    className="min-h-14 w-full rounded-[var(--radius-md)] border border-border bg-bg px-3 py-3 text-right hover:border-primary/40"
                  >
                    <p className="text-sm font-semibold leading-6">{bt.name}</p>
                    {bt.degree ? (
                      <p className="mt-0.5 text-xs text-fg-muted">الدرجة {degreeLabel(bt.degree)}</p>
                    ) : null}
                  </button>
                ))}
              </div>
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
      </DialogContent>
    </Dialog>
  );
}
