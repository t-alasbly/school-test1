import { MessageCircle } from "lucide-react";
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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { logParentMessage } from "@/lib/school/api";
import {
  NOTE_META,
  WHATSAPP_TEMPLATES,
  classLabel,
  fillTemplate,
  formatDay,
  weekdayName,
  toWhatsAppNumber,
  periodShort,
} from "@/lib/school/constants";
import { staffCan } from "@/lib/school/permissions";
import type { MessageKind, NoteType } from "@/lib/school/types";
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
  subject,
  createdAt,
  periodKey,
}: {
  studentId: number;
  studentName: string;
  parentPhone: string;
  className: string;
  shortName: string;
  defaultType?: NoteType | "general";
  details?: string;
  subject?: string;
  createdAt?: string;
  periodKey?: string;
}) {
  const { school, staff } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<MessageKind>(defaultType);
  const [draft, setDraft] = useState("");

  const allowed = staffCan(staff, "sendMessages");
  const number = toWhatsAppNumber(parentPhone);
  const stamp = createdAt || new Date().toISOString();
  const subjectName = (subject ?? staff.subject).trim();
  const period = periodKey ? periodShort(periodKey, school.season) : "";
  const session = [period, subjectName ? `مادة ${subjectName}` : ""].filter(Boolean).join(" — ");

  function templateOf(k: MessageKind) {
    return school.messageTemplates[k] ?? WHATSAPP_TEMPLATES[k];
  }

  const vars = useMemo(
    () => ({
      name: studentName,
      date: formatDay(stamp),
      weekday: weekdayName(stamp),
      class: classLabel(shortName, className),
      school: school.name,
      details: details || "—",
      subjectLine: subjectName ? ` مادة ${subjectName}` : "",
      session: session ? ` (${session})` : "",
    }),
    [studentName, className, shortName, school.name, details, subjectName, stamp, session],
  );

  if (!allowed) return null;

  function applyKind(next: MessageKind) {
    setKind(next);
    setDraft(fillTemplate(templateOf(next).body, vars));
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setKind(defaultType);
      setDraft(fillTemplate(templateOf(defaultType).body, vars));
    }
  }

  async function send() {
    if (!number) return;
    try {
      await logParentMessage({
        data: {
          studentId,
          kind,
          body: draft,
          parentPhone,
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر حفظ الرسالة");
      return;
    }
    const url = `https://wa.me/${number}?text=${encodeURIComponent(draft)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    toast.success("فُتحت واتساب وحُفظت الرسالة في السجل");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`مراسلة ولي أمر ${studentName}`}
          disabled={!number}
        >
          <MessageCircle className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>رسالة واتساب — {studentName}</DialogTitle>
          <DialogDescription>
            {number ? `جوال ولي الأمر: ${parentPhone}` : "لا يوجد رقم جوال محفوظ"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tpl">القالب</Label>
            <Select
              id="tpl"
              value={kind}
              onChange={(e) =>
                applyKind(e.target.value as MessageKind)
              }
            >
              {KEYS.map((key) => (
                <option key={key} value={key}>
                  {key === "general" ? "رسالة عامة" : NOTE_META[key].label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="msg">نص الرسالة</Label>
            <Textarea
              id="msg"
              className="min-h-40"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          <Button className="w-full" onClick={send} disabled={!number || !draft.trim()}>
            إرسال عبر واتساب
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
