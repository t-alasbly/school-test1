import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteCounselingCase,
  deleteImprovement,
  deleteNote,
  deleteParentMessage,
  updateCounselingCase,
  updateImprovementPlan,
  updateNote,
  updateParentMessage,
} from "@/lib/school/api";
import {
  NOTE_META,
  NOTE_TYPES,
  degreeLabel,
  fromDatetimeLocalValue,
  isOtherChoice,
  isStaffViolation,
  scheduleFor,
  toDatetimeLocalValue,
} from "@/lib/school/constants";
import { staffCan } from "@/lib/school/permissions";
import type { NoteStatus, NoteType } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";

export function invalidateRecords(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["student"] });
  void qc.invalidateQueries({ queryKey: ["admin"] });
  void qc.invalidateQueries({ queryKey: ["report"] });
  void qc.invalidateQueries({ queryKey: ["parent-messages"] });
  void qc.invalidateQueries({ queryKey: ["improvements"] });
  void qc.invalidateQueries({ queryKey: ["counseling-desk"] });
  void qc.invalidateQueries({ queryKey: ["class"] });
  void qc.invalidateQueries({ queryKey: ["workspace"] });
  void qc.invalidateQueries({ queryKey: ["notifications"] });
  void qc.invalidateQueries({ queryKey: ["archive-cases"] });
  void qc.invalidateQueries({ queryKey: ["desk-notes"] });
  void qc.invalidateQueries({ queryKey: ["home-desk"] });
}

export type EditableNote = {
  id: number;
  type: NoteType;
  details: string;
  behaviorTypeId?: number | null;
  periodKey?: string;
  occurredAt?: string;
  createdAt?: string;
  actionTaken?: string;
  status?: NoteStatus;
  compensation?: string;
};

export function NoteRecordTools({ note }: { note: EditableNote }) {
  const { staff } = useWorkspace();
  if (!staffCan(staff, "editRecords")) return null;
  return (
    <span className="no-print inline-flex shrink-0 items-center gap-1">
      <EditNoteButton note={note} />
      <DeleteRecordButton
        label="حذف الملاحظة"
        confirm={`حذف هذه الملاحظة نهائياً؟ لا يمكن التراجع.`}
        onConfirm={() => deleteNote({ data: { noteId: note.id } })}
      />
    </span>
  );
}

export function MessageRecordTools({
  id,
  body,
}: {
  id: number;
  body: string;
}) {
  const { staff } = useWorkspace();
  if (!staffCan(staff, "editRecords")) return null;
  return (
    <span className="no-print inline-flex shrink-0 items-center gap-1">
      <EditTextButton
        title="تعديل الرسالة"
        value={body}
        min={2}
        onSave={(next) => updateParentMessage({ data: { id, body: next } })}
      />
      <DeleteRecordButton
        label="حذف الرسالة"
        confirm="حذف هذه الرسالة من السجل؟"
        onConfirm={() => deleteParentMessage({ data: { id } })}
      />
    </span>
  );
}

export function ImprovementRecordTools({
  id,
  plan,
}: {
  id: number;
  plan: string;
}) {
  const { staff } = useWorkspace();
  if (!staffCan(staff, "editRecords")) return null;
  return (
    <span className="no-print inline-flex shrink-0 items-center gap-1">
      <EditTextButton
        title="تعديل خطة التحسين"
        value={plan}
        min={4}
        onSave={(next) => updateImprovementPlan({ data: { id, plan: next } })}
      />
      <DeleteRecordButton
        label="حذف خطة التحسين"
        confirm="حذف خطة تحسين السلوك؟"
        onConfirm={() => deleteImprovement({ data: { id } })}
      />
    </span>
  );
}

export function CaseRecordTools({ id, body }: { id: number; body: string }) {
  const { staff } = useWorkspace();
  if (!staffCan(staff, "editRecords")) return null;
  return (
    <span className="no-print inline-flex shrink-0 items-center gap-1">
      <EditTextButton
        title="تعديل الحالة"
        value={body}
        min={2}
        onSave={(next) => updateCounselingCase({ data: { id, body: next } })}
      />
      <DeleteRecordButton
        label="حذف الحالة"
        confirm="حذف هذه المراسلة / الحالة؟"
        onConfirm={() => deleteCounselingCase({ data: { id } })}
      />
    </span>
  );
}

function DeleteRecordButton({
  label,
  confirm,
  onConfirm,
}: {
  label: string;
  confirm: string;
  onConfirm: () => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: onConfirm,
    onSuccess: () => {
      toast.success("تم الحذف");
      setOpen(false);
      invalidateRecords(queryClient);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحذف"),
  });
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4 text-danger" />
        حذف
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-fg-muted">{confirm}</p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>
              تراجع
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              تأكيد الحذف
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditTextButton({
  title,
  value,
  min,
  onSave,
}: {
  title: string;
  value: string;
  min: number;
  onSave: (next: string) => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const mutation = useMutation({
    mutationFn: () => onSave(draft.trim()),
    onSuccess: () => {
      toast.success("تم الحفظ");
      setOpen(false);
      invalidateRecords(queryClient);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={title}
        onClick={() => {
          setDraft(value);
          setOpen(true);
        }}
      >
        <Pencil className="size-4" />
        تعديل
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <Textarea className="min-h-32" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <Button
            disabled={mutation.isPending || draft.trim().length < min}
            onClick={() => mutation.mutate()}
          >
            حفظ التصحيح
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditNoteButton({ note }: { note: EditableNote }) {
  const { behaviorTypes, school } = useWorkspace();
  const queryClient = useQueryClient();
  const slots = scheduleFor(school.season, school.schedules);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<NoteType>(note.type);
  const [details, setDetails] = useState(note.details ?? "");
  const [behaviorTypeId, setBehaviorTypeId] = useState<number | "">(note.behaviorTypeId ?? "");
  const [periodKey, setPeriodKey] = useState(note.periodKey ?? "");
  const [occurredAt, setOccurredAt] = useState(
    toDatetimeLocalValue(note.occurredAt || note.createdAt),
  );
  const [actionTaken, setActionTaken] = useState(note.actionTaken ?? "");
  const [status, setStatus] = useState<NoteStatus>(note.status ?? "open");
  const [compensation, setCompensation] = useState(note.compensation ?? "");

  const selected = behaviorTypes.find((b) => b.id === Number(behaviorTypeId));
  const other = Boolean(selected && isOtherChoice(selected.name));

  const mutation = useMutation({
    mutationFn: () =>
      updateNote({
        data: {
          noteId: note.id,
          type,
          details,
          behaviorTypeId: type === "behavior" ? (behaviorTypeId === "" ? null : Number(behaviorTypeId)) : null,
          periodKey,
          occurredAt: fromDatetimeLocalValue(occurredAt),
          actionTaken,
          status,
          compensation,
        },
      }),
    onSuccess: () => {
      toast.success("صُحّحت الملاحظة");
      setOpen(false);
      invalidateRecords(queryClient);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });

  function openDialog() {
    setType(note.type);
    setDetails(note.details ?? "");
    setBehaviorTypeId(note.behaviorTypeId ?? "");
    setPeriodKey(note.periodKey ?? "");
    setOccurredAt(toDatetimeLocalValue(note.occurredAt || note.createdAt));
    setActionTaken(note.actionTaken ?? "");
    setStatus(note.status ?? "open");
    setCompensation(note.compensation ?? "");
    setOpen(true);
  }

  const ready =
    (type !== "behavior" || behaviorTypeId !== "") &&
    (!other || details.trim().length >= 2);

  return (
    <>
      <Button type="button" size="sm" variant="ghost" aria-label="تعديل الملاحظة" onClick={openDialog}>
        <Pencil className="size-4" />
        تعديل
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تصحيح الملاحظة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`en-type-${note.id}`}>النوع</Label>
              <Select
                id={`en-type-${note.id}`}
                value={type}
                onChange={(e) => setType(e.target.value as NoteType)}
              >
                {NOTE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {NOTE_META[t].label}
                  </option>
                ))}
              </Select>
            </div>
            {type === "behavior" ? (
              <div className="space-y-1.5">
                <Label htmlFor={`en-bt-${note.id}`}>نوع المخالفة</Label>
                <Select
                  id={`en-bt-${note.id}`}
                  value={behaviorTypeId === "" ? "" : String(behaviorTypeId)}
                  onChange={(e) =>
                    setBehaviorTypeId(e.target.value ? Number(e.target.value) : "")
                  }
                >
                  <option value="">اختر…</option>
                  {[1, 2, 3, 4, 5].map((degree) => {
                    const group = behaviorTypes.filter((b) => (b.degree ?? 1) === degree && !isStaffViolation(b));
                    if (!group.length) return null;
                    return (
                      <optgroup key={`s-${degree}`} label={`مخالفات الطلبة — الدرجة ${degreeLabel(degree)}`}>
                        {group.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                  {[4, 5].map((degree) => {
                    const group = behaviorTypes.filter((b) => (b.degree ?? 1) === degree && isStaffViolation(b));
                    if (!group.length) return null;
                    return (
                      <optgroup key={`t-${degree}`} label={`تجاه المعلمين — الدرجة ${degreeLabel(degree)}`}>
                        {group.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                </Select>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor={`en-details-${note.id}`}>التفاصيل</Label>
              <Textarea
                id={`en-details-${note.id}`}
                className="min-h-20"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`en-period-${note.id}`}>الحصة</Label>
                <Select
                  id={`en-period-${note.id}`}
                  value={periodKey}
                  onChange={(e) => setPeriodKey(e.target.value)}
                >
                  <option value="">غير محددة</option>
                  {slots.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`en-when-${note.id}`}>وقت التسجيل</Label>
                <Input
                  id={`en-when-${note.id}`}
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`en-status-${note.id}`}>الحالة</Label>
              <Select
                id={`en-status-${note.id}`}
                value={status}
                onChange={(e) => setStatus(e.target.value as NoteStatus)}
              >
                <option value="open">مفتوحة</option>
                <option value="closed">أُغلقت</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`en-action-${note.id}`}>الإجراء المتخذ</Label>
              <Textarea
                id={`en-action-${note.id}`}
                className="min-h-16"
                value={actionTaken}
                onChange={(e) => setActionTaken(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`en-comp-${note.id}`}>فرص التعويض</Label>
              <Input
                id={`en-comp-${note.id}`}
                value={compensation}
                onChange={(e) => setCompensation(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              disabled={mutation.isPending || !ready}
              onClick={() => mutation.mutate()}
            >
              حفظ التصحيح
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
