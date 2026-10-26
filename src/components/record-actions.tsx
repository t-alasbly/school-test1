import { useMutation, useQueryClient } from "@tanstack/react-query";
import { tr } from "@/lib/school/i18n";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  degreeTone,
  fromDatetimeLocalValue,
  isOtherChoice,
  isStaffViolation,
  procedureLadder,
  procedureStageLabel,
  scheduleFor,
  toDatetimeLocalValue,
} from "@/lib/school/constants";
import { staffCan } from "@/lib/school/permissions";
import type { NoteStatus, NoteType } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

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

export function NoteRecordTools({ note, teacherId }: { note: EditableNote; teacherId?: string }) {
  const { staff } = useWorkspace();
  const own = Boolean(teacherId && teacherId === staff.userId);
  if (!own && staff.role !== "admin" && !staffCan(staff, "editRecords")) return null;
  return (
    <span className="no-print inline-flex shrink-0 items-center gap-1">
      <EditNoteButton note={note} />
      <DeleteRecordButton
        label={tr("حذف الملاحظة")}
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
        title={tr("تعديل الرسالة")}
        value={body}
        min={2}
        onSave={(next) => updateParentMessage({ data: { id, body: next } })}
      />
      <DeleteRecordButton
        label={tr("حذف الرسالة")}
        confirm={tr("حذف هذه الرسالة من السجل؟")}
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
        title={tr("تعديل خطة التحسين")}
        value={plan}
        min={4}
        onSave={(next) => updateImprovementPlan({ data: { id, plan: next } })}
      />
      <DeleteRecordButton
        label={tr("حذف خطة التحسين")}
        confirm={tr("حذف خطة تحسين السلوك؟")}
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
        title={tr("تعديل الحالة")}
        value={body}
        min={2}
        onSave={(next) => updateCounselingCase({ data: { id, body: next } })}
      />
      <DeleteRecordButton
        label={tr("حذف الحالة")}
        confirm={tr("حذف هذه المراسلة / الحالة؟")}
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
      toast.success(tr("تم الحذف"));
      setOpen(false);
      invalidateRecords(queryClient);
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحذف")),
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
        {tr("حذف")}
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
              {tr("تأكيد الحذف")}
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
      toast.success(tr("تم الحفظ"));
      setOpen(false);
      invalidateRecords(queryClient);
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
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
        {tr("تعديل")}
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
  const current = behaviorTypes.find((item) => item.id === (note.behaviorTypeId ?? -1));
  const [audience, setAudience] = useState<"students" | "staff">(current && isStaffViolation(current) ? "staff" : "students");
  const [degree, setDegree] = useState(current?.degree ?? 1);
  const [askClose, setAskClose] = useState(false);

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
      toast.success(tr("صُحّحت الملاحظة"));
      setOpen(false);
      invalidateRecords(queryClient);
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
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
    const again = behaviorTypes.find((item) => item.id === (note.behaviorTypeId ?? -1));
    setAudience(again && isStaffViolation(again) ? "staff" : "students");
    setDegree(again?.degree ?? 1);
    setAskClose(false);
    setOpen(true);
  }

  const ready =
    (type !== "behavior" || behaviorTypeId !== "") &&
    (!other || details.trim().length >= 2);

  return (
    <>
      <Button type="button" size="sm" variant="ghost" aria-label={tr("تعديل الملاحظة")} onClick={openDialog}>
        <Pencil className="size-4" />
        {tr("تعديل")}
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (!next && type === "behavior") setAskClose(true); else setOpen(next); }}>
        <DialogContent className={cn("max-h-[90dvh] overflow-y-auto", type === "behavior" && "flex max-h-[100dvh] flex-col")}>
          <DialogHeader>
            <DialogTitle>{type === "behavior" ? tr("المخالفات") : tr("تصحيح الملاحظة")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {type === "behavior" ? (
              <BehaviorEditCatalog
                items={behaviorTypes}
                audience={audience}
                degree={degree}
                selectedId={behaviorTypeId === "" ? null : Number(behaviorTypeId)}
                onAudience={(next) => { setAudience(next); setDegree(next === "staff" ? 4 : 1); }}
                onDegree={setDegree}
                onSelect={(id) => setBehaviorTypeId(id)}
              />
            ) : (
            <div className="space-y-1.5">
              <Label htmlFor={`en-type-${note.id}`}>{tr("النوع")}</Label>
              <Select
                id={`en-type-${note.id}`}
                value={type}
                onChange={(e) => setType(e.target.value as NoteType)}
              >
                {NOTE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {tr(NOTE_META[t].label)}
                  </option>
                ))}
              </Select>
            </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor={`en-details-${note.id}`}>{tr("التفاصيل")}</Label>
              <Textarea
                id={`en-details-${note.id}`}
                className="min-h-20"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`en-period-${note.id}`}>{tr("الحصة")}</Label>
                <Select
                  id={`en-period-${note.id}`}
                  value={periodKey}
                  onChange={(e) => setPeriodKey(e.target.value)}
                >
                  <option value="">{tr("غير محددة")}</option>
                  {slots.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`en-when-${note.id}`}>{tr("وقت التسجيل")}</Label>
                <Input
                  id={`en-when-${note.id}`}
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`en-status-${note.id}`}>{tr("الحالة")}</Label>
              <Select
                id={`en-status-${note.id}`}
                value={status}
                onChange={(e) => setStatus(e.target.value as NoteStatus)}
              >
                <option value="open">{tr("مفتوحة")}</option>
                <option value="closed">{tr("أُغلقت")}</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`en-action-${note.id}`}>{tr("الإجراء المتخذ")}</Label>
              <Textarea
                id={`en-action-${note.id}`}
                className="min-h-16"
                value={actionTaken}
                onChange={(e) => setActionTaken(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`en-comp-${note.id}`}>{tr("فرص التعويض")}</Label>
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
              {type === "behavior" ? tr("اعتماد التعديل") : tr("حفظ التصحيح")}
            </Button>
            {type === "behavior" ? (
              <Button type="button" variant="secondary" className="w-full" onClick={() => setAskClose(true)}>
                {tr("إغلاق")}
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={askClose} onOpenChange={setAskClose}>
        <DialogContent className="!inset-auto !top-1/2 !left-1/2 z-[80] !h-auto !max-h-none w-[min(92vw,24rem)] !max-w-sm !-translate-x-1/2 !-translate-y-1/2 rounded-2xl p-5 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-center text-lg">{tr("اعتماد وإغلاق بدون تعديل؟")}</DialogTitle>
            <DialogDescription className="text-center">{tr("لن يُحفظ أي تغيير على المخالفة.")}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" onClick={() => setAskClose(false)}>{tr("البقاء")}</Button>
            <Button type="button" onClick={() => { setAskClose(false); setOpen(false); }}>{tr("إغلاق بدون تعديل")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BehaviorEditCatalog({
  items,
  audience,
  degree,
  selectedId,
  onAudience,
  onDegree,
  onSelect,
}: {
  items: { id: number; name: string; degree?: number; procedures?: string[][] }[];
  audience: "students" | "staff";
  degree: number;
  selectedId: number | null;
  onAudience: (next: "students" | "staff") => void;
  onDegree: (degree: number) => void;
  onSelect: (id: number) => void;
}) {
  const pool = items.filter((item) => isStaffViolation(item) === (audience === "staff") && item.name !== "أخرى");
  const other = items.find((item) => item.name === "أخرى");
  const degrees = audience === "staff" ? [4, 5] : [1, 2, 3, 4, 5];
  const active = degrees.includes(degree) ? degree : degrees[0]!;
  const list = pool.filter((item) => (item.degree ?? 1) === active);
  const [help, setHelp] = useState<number | null>(null);
  const helpLadder = help == null ? [] : procedureLadder(help);
  const deduct: Record<number, string> = { 1: "حسم 1", 2: "حسم 2", 3: "حسم 3", 4: "حسم 10", 5: "حسم 15" };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onAudience("students")} className={cn("min-h-8 rounded-2xl border text-sm font-bold", audience === "students" ? "border-primary bg-primary text-primary-fg" : "border-border bg-card")}>{tr("مخالفات الطلبة")}</button>
        <button type="button" onClick={() => onAudience("staff")} className={cn("min-h-8 rounded-2xl border text-sm font-bold", audience === "staff" ? "border-[#7f1d1d] bg-[#7f1d1d] text-white" : "border-border bg-card")}>{tr("تجاه المعلمين")}</button>
      </div>
      <div className={cn("grid gap-1.5", degrees.length === 2 ? "grid-cols-2" : "grid-cols-5")}>
        {degrees.map((value) => (
          <div key={value} className={cn("relative min-h-12 rounded-xl border-2 px-0.5 text-center", degreeTone(value), active === value ? "ring-2 ring-offset-1 ring-current" : "opacity-70")}>
            <button type="button" className="w-full py-1" onClick={() => onDegree(value)}>
              <span className="block text-sm font-black">{value}</span>
              <span className="block text-[10px]">{tr(deduct[value] ?? "")}</span>
            </button>
            <button type="button" aria-label={tr("إجراءات هذه الدرجة")} className="absolute top-0.5 start-0.5 grid size-5 place-items-center rounded-full bg-white text-[12px] font-black text-[#111]" onClick={() => setHelp((current) => current === value ? null : value)}>!</button>
          </div>
        ))}
      </div>
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
      {list.map((item) => (
        <button key={item.id} type="button" onClick={() => onSelect(item.id)} className={cn("min-h-10 w-full rounded-2xl border-2 px-3 py-2 text-right", degreeTone(item.degree ?? 1), selectedId === item.id && "ring-2 ring-offset-1 ring-current")}>
          <p className="text-sm font-semibold">{item.name}</p>
        </button>
      ))}
      {audience === "students" && active === 1 && other ? (
        <button type="button" onClick={() => onSelect(other.id)} className={cn("min-h-10 w-full rounded-2xl border-2 border-border bg-card px-3 text-right", selectedId === other.id && "ring-2 ring-primary")}>
          <p className="text-sm font-semibold">{tr("أخرى")}</p>
        </button>
      ) : null}
    </div>
  );
}
