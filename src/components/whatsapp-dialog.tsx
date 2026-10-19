import { MessageCircle } from "lucide-react";
import { tr } from "@/lib/school/i18n";
import { useEffect, useMemo, useState } from "react";
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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { logParentMessage } from "@/lib/school/api";
import {
  NOTE_META,
  WHATSAPP_TEMPLATES,
  classLabel,
  degreeDeductionLabel,
  fillTemplate,
  formatDay,
  sharedParticipantNames,
  violationTextForMessage,
  weekdayName,
  toWhatsAppNumber,
  periodShort,
  withParticipantLine,
  withoutParticipantLine,
} from "@/lib/school/constants";
import { staffCan } from "@/lib/school/permissions";
import type { MessageKind, MessageTemplate, NoteType } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";

const KEYS = ["absence", "late", "homework", "behavior", "general"] as const;

export function WhatsAppDialog({
  studentId,
  studentName,
  parentPhone,
  className,
  shortName,
  defaultType = "general",
  details = "",
  sharedText = "",
  subject,
  createdAt,
  periodKey,
  label,
  noteId,
  embedded = false,
  occurrenceText = "",
  deductionText = "",
  behaviorDegree = null,
  initialDraft = "",
}: {
  studentId: number;
  studentName: string;
  parentPhone: string;
  className: string;
  shortName: string;
  defaultType?: NoteType | "general";
  details?: string;
  /** Raw note text that may include «مخالفة مشتركة — المشتركون». */
  sharedText?: string;
  subject?: string;
  createdAt?: string;
  periodKey?: string;
  label?: string;
  noteId?: number;
  /** Render the composer in place, for the action step before closing a violation. */
  embedded?: boolean;
  occurrenceText?: string;
  deductionText?: string;
  /** درجة المخالفة السلوكية؛ تُظهر درجات الخصم حتى لو خلا نص الإجراء من كلمة حسم. */
  behaviorDegree?: number | null;
  /** Ready message for one required send, instead of the generic template. */
  initialDraft?: string;
}) {
  const { school, staff } = useWorkspace();
  const custom = school.customMessages ?? [];
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState<string>(defaultType);
  const [draft, setDraft] = useState("");
  const [includeParticipants, setIncludeParticipants] = useState(true);

  const allowed = staffCan(staff, "sendMessages");
  const number = toWhatsAppNumber(parentPhone);
  const stamp = createdAt || new Date().toISOString();
  const subjectName = (subject ?? staff.subject).trim();
  const period = periodKey ? periodShort(periodKey, school.season, school.schedules) : "";
  const session = [period, subjectName ? `مادة ${subjectName}` : ""].filter(Boolean).join(" — ");

  function templateOf(key: string): MessageTemplate {
    if (key.startsWith("c:")) {
      const found = custom.find((m) => m.id === key.slice(2));
      if (found) return found;
    }
    const k = key as MessageKind;
    return school.messageTemplates[k] ?? WHATSAPP_TEMPLATES[k] ?? WHATSAPP_TEMPLATES.general;
  }

  function logKind(key: string): MessageKind {
    if (key.startsWith("c:")) return "general";
    if ((KEYS as readonly string[]).includes(key)) return key as MessageKind;
    return "general";
  }

  const participants = useMemo(
    () => sharedParticipantNames(sharedText || details),
    [sharedText, details],
  );

  const degreePhrase = degreeDeductionLabel(behaviorDegree);
  const marksLine = deductionText
    ? deductionText.includes("الدرجات المخصومة")
      ? deductionText
      : `الدرجات المخصومة من السلوك: ${deductionText}.`
    : degreePhrase
      ? `الدرجات المخصومة من السلوك: ${degreePhrase}.`
      : "";

  const vars = useMemo(
    () => ({
      name: studentName,
      date: formatDay(stamp),
      weekday: weekdayName(stamp),
      class: classLabel(shortName, className),
      school: school.name,
      details: violationTextForMessage(details, sharedText) || "—",
      subjectLine: subjectName ? ` مادة ${subjectName}` : "",
      session: session ? ` (${session})` : "",
      repeat: occurrenceText || "—",
      deductionLine: marksLine,
    }),
    [studentName, className, shortName, school.name, details, sharedText, subjectName, stamp, session, occurrenceText, marksLine],
  );

  function withCaseFacts(body: string) {
    const extra: string[] = [];
    if (occurrenceText && !body.includes("تكرار المخالفة:")) extra.push(`تكرار المخالفة: ${occurrenceText}.`);
    if (marksLine && !body.includes("الدرجات المخصومة") && !body.includes("الخصم من درجات السلوك")) extra.push(marksLine);
    return extra.length ? `${body.trim()}\n${extra.join("\n")}` : body;
  }

  function draftFrom(key: string, withNames: boolean) {
    const source = initialDraft.trim() || fillTemplate(templateOf(key).body, vars);
    const filled = withCaseFacts(source);
    return withNames ? withParticipantLine(filled, participants) : withoutParticipantLine(filled);
  }

  function applyKind(next: string) {
    setPicker(next);
    setDraft(draftFrom(next, includeParticipants));
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setPicker(defaultType);
      setIncludeParticipants(true);
      setDraft(draftFrom(defaultType, true));
    }
  }

  useEffect(() => {
    if (!embedded || !allowed) return;
    setPicker(defaultType);
    setIncludeParticipants(true);
    setDraft(draftFrom(defaultType, true));
  }, [embedded, allowed, defaultType, initialDraft, occurrenceText, deductionText, behaviorDegree, marksLine]);

  async function send() {
    if (!number) return;
    try {
      await logParentMessage({
        data: {
          studentId,
          kind: logKind(picker),
          body: draft,
          parentPhone,
          noteId,
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? tr(err.message) : tr("تعذر حفظ الرسالة"));
      return;
    }
    const url = `https://wa.me/${number}?text=${encodeURIComponent(draft)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    toast.success(tr("فُتحت واتساب وحُفظت الرسالة في السجل"));
    setOpen(false);
  }

  if (!allowed) {
    if (!embedded) return null;
    return <p className="text-sm text-fg-muted">{tr("صلاحية الرسائل غير مفعّلة، ولا يمكن فتح واتساب من هذا الحساب.")}</p>;
  }

  const composer = (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`tpl-${studentId}`}>{tr("نوع الرسالة")}</Label>
        <Select
          id={`tpl-${studentId}`}
          value={picker}
          onChange={(e) => applyKind(e.target.value)}
          disabled={Boolean(initialDraft)}
        >
          {KEYS.map((key) => (
            <option key={key} value={key}>
              {key === "general"
                ? (school.messageTemplates.general?.title ?? tr("رسالة عامة"))
                : tr(NOTE_META[key].label)}
            </option>
          ))}
          {custom.map((item) => (
            <option key={item.id} value={`c:${item.id}`}>
              {item.title}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`msg-${studentId}`}>{tr("نص الرسالة")}</Label>
        <Textarea
          id={`msg-${studentId}`}
          className="min-h-40"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </div>
      {participants.length > 0 ? (
        <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-[var(--radius-sm)] border border-border bg-bg-elevated px-3 py-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={includeParticipants}
            onChange={(e) => {
              const on = e.target.checked;
              setIncludeParticipants(on);
              setDraft((current) =>
                on ? withParticipantLine(current, participants) : withoutParticipantLine(current),
              );
            }}
          />
          <span>
            <span className="block font-semibold">{tr("إضافة أسماء المشاركين في الرسالة")}</span>
            <span className="mt-0.5 block text-xs leading-5 text-fg-muted">
              تُذكر أسماء من اشتركوا في المخالفة الجماعية داخل نص الرسالة. ألغِ الخيار لإرسال الرسالة عن الطالب وحده.
            </span>
          </span>
        </label>
      ) : null}
      {!number ? <p className="text-sm text-danger">{tr("لا يوجد رقم جوال محفوظ")}</p> : null}
      <Button className="w-full" onClick={send} disabled={!number || !draft.trim()}>
        {tr("إرسال عبر واتساب")}
      </Button>
    </div>
  );

  if (embedded) return composer;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          size={label ? "default" : "icon"}
          variant={label ? "secondary" : "ghost"}
          className={label ? "w-full" : undefined}
          aria-label={label ?? `مراسلة ولي أمر ${studentName}`}
          disabled={!number}
        >
          <MessageCircle className="size-5" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>رسالة واتساب — {studentName}</DialogTitle>
          <DialogDescription>
            {number ? `جوال ولي الأمر: ${parentPhone}` : tr("لا يوجد رقم جوال محفوظ")}
          </DialogDescription>
        </DialogHeader>
        {composer}
      </DialogContent>
    </Dialog>
  );
}
