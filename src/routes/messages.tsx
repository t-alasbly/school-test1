import { createFileRoute } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppGate } from "@/components/app-gate";
import { StageClassBar, type ClassSort } from "@/components/stage-class-bar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { listMessageRecipients, logParentMessage } from "@/lib/school/api";
import { isoFromDate } from "@/lib/school/calendar";
import {
  NOTE_META,
  WHATSAPP_TEMPLATES,
  classLabel,
  fillTemplate,
  formatDay,
  toWhatsAppNumber,
  weekdayName,
} from "@/lib/school/constants";
import { staffCan } from "@/lib/school/permissions";
import type { MessageKind } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/messages")({ component: MessagesPage });

const KEYS = ["absence", "late", "homework", "behavior", "general"] as const;
type Scope = "class" | "stage" | "absence" | "late" | "all";

type Recipient = {
  id: number;
  name: string;
  classId: number;
  className: string;
  shortName: string;
  parentPhone: string;
  label: string;
};

const SCOPES: { id: Scope; label: string; hint: string }[] = [
  { id: "class", label: tr("فصل"), hint: tr("أولياء فصل واحد") },
  { id: "stage", label: tr("صف كامل"), hint: tr("كل فصول الصف") },
  { id: "absence", label: tr("غائبو اليوم"), hint: tr("من سجل الغياب اليومي") },
  { id: "late", label: tr("متأخرو اليوم"), hint: tr("من سجل التأخر الصباحي") },
  { id: "all", label: tr("كل الطلاب"), hint: tr("من لهم جوال محفوظ") },
];

function todayISO() {
  return isoFromDate(new Date());
}

function MessagesPage() {
  return (
    <AppGate>
      <MessagesBody />
    </AppGate>
  );
}

function MessagesBody() {
  const { school, staff, stages, classes } = useWorkspace();
  const can = staffCan(staff, "sendMessages");
  const custom = school.customMessages ?? [];
  const [scope, setScope] = useState<Scope>("class");
  const [stageId, setStageId] = useState<number | null>(stages[0]?.id ?? null);
  const [classId, setClassId] = useState<number | null>(
    classes.find((c) => c.stageId === stages[0]?.id)?.id ?? classes[0]?.id ?? null,
  );
  const [sort, setSort] = useState<ClassSort>("order");
  const [picker, setPicker] = useState<string>(scope === "late" ? "late" : scope === "absence" ? "absence" : "general");
  const [details, setDetails] = useState("");
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [cursor, setCursor] = useState(0);
  const [sent, setSent] = useState<Set<number>>(new Set());

  const day = todayISO();
  const requestScope: Scope = scope === "class" && classId == null && stageId != null ? "stage" : scope;
  const query = useQuery({
    queryKey: ["message-recipients", requestScope, stageId, classId, day],
    enabled:
      can &&
      (requestScope === "all" ||
        ((requestScope === "stage" || requestScope === "absence" || requestScope === "late") && stageId != null) ||
        (requestScope === "class" && classId != null) ||
        requestScope === "absence" ||
        requestScope === "late"),
    queryFn: () =>
      listMessageRecipients({
        data: {
          scope: requestScope,
          stageId: requestScope === "all" ? undefined : stageId ?? undefined,
          classId:
            requestScope === "class" || ((requestScope === "absence" || requestScope === "late") && classId)
              ? classId ?? undefined
              : undefined,
          day,
        },
      }),
  });

  const students = ((query.data as { students?: Recipient[] } | undefined)?.students ?? []) as Recipient[];

  const template = useMemo(() => {
    if (picker.startsWith("c:")) {
      return custom.find((m) => m.id === picker.slice(2)) ?? school.messageTemplates.general ?? WHATSAPP_TEMPLATES.general;
    }
    const k = picker as MessageKind;
    return school.messageTemplates[k] ?? WHATSAPP_TEMPLATES[k] ?? WHATSAPP_TEMPLATES.general;
  }, [picker, custom, school.messageTemplates]);

  function bodyFor(row: Recipient) {
    return fillTemplate(template.body, {
      name: row.name,
      date: formatDay(`${day}T12:00:00`),
      weekday: weekdayName(`${day}T12:00:00`),
      class: classLabel(row.shortName, row.className),
      school: school.name,
      details: details.trim() || "—",
      subjectLine: staff.subject ? ` مادة ${staff.subject}` : "",
      session: "",
    });
  }

  function kindOf(): MessageKind {
    if (picker.startsWith("c:")) return "general";
    if ((KEYS as readonly string[]).includes(picker)) return picker as MessageKind;
    return "general";
  }

  const withPhone = students.filter((s) => toWhatsAppNumber(s.parentPhone));
  const selected = withPhone.filter((s) => picked[s.id] !== false);
  const remaining = selected.filter((s) => !sent.has(s.id));
  const current = remaining[Math.min(cursor, Math.max(0, remaining.length - 1))] ?? remaining[0] ?? null;

  const sendOne = useMutation({
    mutationFn: async (row: Recipient) => {
      const number = toWhatsAppNumber(row.parentPhone);
      if (!number) throw new Error(tr("لا يوجد جوال"));
      const body = bodyFor(row);
      await logParentMessage({
        data: { studentId: row.id, kind: kindOf(), body, parentPhone: row.parentPhone },
      });
      return { row, number, body };
    },
    onSuccess: ({ row, number, body }) => {
      window.open(`https://wa.me/${number}?text=${encodeURIComponent(body)}`, "_blank", "noopener,noreferrer");
      setSent((prev) => new Set(prev).add(row.id));
      setCursor(0);
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الإرسال")),
  });

  if (!can) {
    return <p className="text-fg-muted">{tr("الرسائل الجماعية لمن مُنح صلاحية إرسال الرسائل.")}</p>;
  }

  function toggleAll(on: boolean) {
    const next: Record<number, boolean> = {};
    for (const s of withPhone) next[s.id] = on;
    setPicked(next);
    setSent(new Set());
    setCursor(0);
  }

  function copyPhones() {
    const nums = selected.map((s) => s.parentPhone).filter(Boolean);
    if (!nums.length) {
      toast.error(tr("لا أرقام للنسخ"));
      return;
    }
    void navigator.clipboard.writeText(nums.join("\n"));
    toast.success(`نُسخ ${nums.length} رقماً`);
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-fg-muted">{tr("واتساب لأولياء فصل أو صف أو غائبي اليوم — كل رسالة تُحفظ في السجل")}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{tr("رسائل جماعية")}</h1>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {SCOPES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setScope(item.id);
              setSent(new Set());
              setCursor(0);
              if (item.id === "absence") setPicker("absence");
              else if (item.id === "late") setPicker("late");
              else if (picker === "absence" || picker === "late") setPicker("general");
            }}
            className={cn(
              "min-h-11 rounded-full border px-3 text-sm font-semibold",
              scope === item.id ? "border-primary bg-primary text-primary-fg" : "border-border bg-bg-elevated text-fg-muted",
            )}
          >
            {tr(item.label)}
          </button>
        ))}
      </div>
      <p className="text-xs text-fg-muted">{SCOPES.find((s) => s.id === scope)?.hint}</p>

      {scope !== "all" ? (
        <StageClassBar
          stages={stages}
          classes={classes}
          selectedStageId={stageId}
          selectedClassId={scope === "class" ? classId : null}
          sort={sort}
          onSort={setSort}
          onChange={(nextStage, nextClass) => {
            setStageId(nextStage);
            setClassId(nextClass);
            setSent(new Set());
            setCursor(0);
          }}
          studentCount={students.length}
        />
      ) : null}

      <div className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor="bulk-tpl">{tr("القالب")}</Label>
          <Select
            id="bulk-tpl"
            value={picker}
            onChange={(e) => {
              setPicker(e.target.value);
              setSent(new Set());
            }}
          >
            {KEYS.map((key) => (
              <option key={key} value={key}>
                {key === "general" ? (school.messageTemplates.general?.title ?? tr("رسالة عامة")) : tr(NOTE_META[key].label)}
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
          <Label htmlFor="bulk-details">تفاصيل إضافية (اختياري) — تظهر مكان {"{details}"}</Label>
          <Textarea
            id="bulk-details"
            className="min-h-20"
            placeholder={tr("مثال: الاجتماع مساء الأحد…")}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
        </div>
        {current ? (
          <div className="rounded-[var(--radius-md)] border border-border bg-bg-elevated p-3 text-sm leading-7 whitespace-pre-wrap">
            <p className="mb-1 text-xs text-fg-muted">معاينة لـ {current.name}</p>
            {bodyFor(current)}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => toggleAll(true)}>
          تحديد الكل
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => toggleAll(false)}>
          إلغاء التحديد
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={copyPhones}>
          نسخ الأرقام
        </Button>
        <span className="text-sm text-fg-muted">
          {selected.length} محددون · {withPhone.length} بجوال · {students.length - withPhone.length} بلا جوال
        </span>
      </div>

      {remaining.length > 0 && current ? (
        <div className="sticky bottom-16 z-20 space-y-2 rounded-[var(--radius-lg)] border border-primary bg-card p-4 shadow-[var(--shadow-card)] md:bottom-4">
          <p className="text-sm font-semibold">
            التالي: {current.name}
            <span className="ms-2 text-xs font-normal text-fg-muted">
              {sent.size + 1} من {selected.length}
            </span>
          </p>
          <Button
            className="w-full"
            disabled={sendOne.isPending}
            onClick={() => sendOne.mutate(current)}
          >
            <MessageCircle className="size-4" />
            {sendOne.isPending ? tr("جارٍ الفتح…") : tr("افتح واتساب ثم التالي")}
          </Button>
        </div>
      ) : selected.length > 0 && remaining.length === 0 ? (
        <p className="rounded-[var(--radius-md)] border border-ok bg-ok-soft px-3 py-2 text-sm text-ok">
          أُرسلت كل الرسائل المحددة وحُفظت في السجل.
        </p>
      ) : null}

      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
        {query.isPending ? (
          <li className="px-4 py-8 text-center text-sm text-fg-muted">{tr("جارٍ تحميل الأسماء…")}</li>
        ) : students.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-fg-muted">
            {scope === "absence" || scope === "late" ? tr("لا يوجد طلاب في هذا السجل اليوم.") : tr("لا طلاب في هذا النطاق.")}
          </li>
        ) : (
          students.map((row) => {
            const number = toWhatsAppNumber(row.parentPhone);
            const on = picked[row.id] !== false && Boolean(number);
            return (
              <li key={row.id} className="flex items-start gap-2 px-3 py-3">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={on}
                  disabled={!number}
                  onChange={(e) => {
                    setPicked((prev) => ({ ...prev, [row.id]: e.target.checked }));
                    setSent((prev) => {
                      const next = new Set(prev);
                      next.delete(row.id);
                      return next;
                    });
                  }}
                  aria-label={`تحديد ${row.name}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{row.name}</p>
                  <p className="text-xs text-fg-muted">
                    {row.label}
                    {number ? ` · ${row.parentPhone}` : tr(" · بلا جوال")}
                    {sent.has(row.id) ? tr(" · أُرسلت") : ""}
                  </p>
                </div>
                {number ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={sendOne.isPending}
                    onClick={() => sendOne.mutate(row)}
                    aria-label={`واتساب ${row.name}`}
                  >
                    <MessageCircle className="size-4" />
                  </Button>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
