import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus, Send } from "lucide-react";
import { useMemo, useState } from "react";
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
import {
  NOTE_META,
  NOTE_TYPES,
  currentPeriod,
  degreeLabel,
  formatDay,
  formatTime,
  fromDatetimeLocalValue,
  isOtherChoice,
  scheduleFor,
  toDatetimeLocalValue,
} from "@/lib/school/constants";
import type { NoteType } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

const TYPE_HINT: Record<NoteType, string> = {
  absence: "يسجّل غياب الطالب عن هذه الحصة",
  late: "يسجّل التأخر عن بداية الحصة",
  homework: "يسجّل عدم حل الواجب المطلوب",
  behavior: "اختر نوع المخالفة من الدليل ثم أرسل",
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
  const { behaviorTypes, school, staff } = useWorkspace();
  const slots = scheduleFor(school.season);
  const auto = useMemo(() => currentPeriod(school.season)?.key ?? "", [school.season]);
  const [open, setOpen] = useState(false);
  const [whenOpen, setWhenOpen] = useState(false);
  const [details, setDetails] = useState("");
  const [periodKey, setPeriodKey] = useState(auto);
  const [type, setType] = useState<NoteType | null>(null);
  const [behaviorTypeId, setBehaviorTypeId] = useState<number | null>(null);
  const [occurredAt, setOccurredAt] = useState(toDatetimeLocalValue());
  const queryClient = useQueryClient();
  const selectedBehavior = behaviorTypes.find((bt) => bt.id === behaviorTypeId);
  const otherBehavior = Boolean(selectedBehavior && isOtherChoice(selectedBehavior.name));
  const periodLabel = slots.find((s) => s.key === periodKey)?.label ?? "الحصة غير محددة";
  const mutation = useMutation({
    mutationFn: () => {
      if (!type) throw new Error("اختر نوع الملاحظة");
      if (type === "behavior" && !behaviorTypeId) throw new Error("اختر نوع المخالفة السلوكية");
      if (otherBehavior && details.trim().length < 2) throw new Error("صف المخالفة يدوياً");
      return createNote({
        data: {
          studentId,
          type,
          details,
          behaviorTypeId: type === "behavior" ? behaviorTypeId ?? undefined : undefined,
          periodKey,
          occurredAt: fromDatetimeLocalValue(occurredAt),
        },
      });
    },
    onSuccess: (result) => {
      toast.success(`تم تسجيل ${result.label} لـ ${result.studentName}`);
      reset();
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["class", classId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
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
    setPeriodKey(currentPeriod(school.season)?.key ?? "");
    setOccurredAt(toDatetimeLocalValue());
    setWhenOpen(false);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setPeriodKey(currentPeriod(school.season)?.key ?? periodKey);
      setOccurredAt(toDatetimeLocalValue());
      setWhenOpen(false);
    }
    if (!next) reset();
  }

  const canSend =
    type != null &&
    (type !== "behavior" || behaviorTypeId != null) &&
    (!otherBehavior || details.trim().length >= 2) &&
    !mutation.isPending;
  const iso = fromDatetimeLocalValue(occurredAt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="icon" variant="secondary" aria-label={`تسجيل ملاحظة لـ ${studentName}`}>
          <Plus className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          "flex flex-col overflow-hidden p-4",
          "!inset-0 !h-dvh !max-h-dvh !w-full !max-w-none !translate-x-0 !translate-y-0 !rounded-none",
          "sm:!inset-auto sm:!top-1/2 sm:!left-1/2 sm:!h-auto sm:!max-h-[92vh] sm:!w-[calc(100%-2rem)] sm:!max-w-3xl sm:!-translate-x-1/2 sm:!-translate-y-1/2 sm:!rounded-[var(--radius-lg)]",
        )}
      >
        <DialogHeader className="mb-2 shrink-0">
          <DialogTitle>تسجيل ملاحظة أو مخالفة</DialogTitle>
          <DialogDescription>
            {studentName}
            {staff.subject ? ` · ${staff.subject}` : ""}
          </DialogDescription>
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
              <Label htmlFor={`period-${studentId}`}>الحصة</Label>
              <Select
                id={`period-${studentId}`}
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
              <Label htmlFor={`when-${studentId}`}>التاريخ والوقت</Label>
              <Input
                id={`when-${studentId}`}
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
                    <Label htmlFor={`other-${studentId}`}>صف المخالفة يدوياً</Label>
                    <Textarea
                      id={`other-${studentId}`}
                      className="min-h-20"
                      placeholder="اكتب نوع المخالفة…"
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      autoFocus
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor={`details-${studentId}`}>الملاحظات</Label>
                    <Textarea
                      id={`details-${studentId}`}
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
              <Label htmlFor={`details-${studentId}`}>الملاحظات</Label>
              <Textarea
                id={`details-${studentId}`}
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
              ? "جارٍ الإرسال…"
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
