import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppGate } from "@/components/app-gate";
import { OptionChips } from "@/components/option-chips";
import { PrintFormsButton } from "@/components/print-forms";
import {
  CaseRecordTools,
  ImprovementRecordTools,
  NoteRecordTools,
} from "@/components/record-actions";
import { StudentSheet } from "@/components/student-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createCompensationOption,
  createHealthCondition,
  getCounselingDesk,
  listImprovements,
  setNoteCompensation,
  updateHealthNote,
} from "@/lib/school/api";
import {
  CASE_KINDS,
  COMPENSATION_OPTIONS,
  IMPROVEMENT_STATUS,
  NOTE_META,
  degreeLabel,
  formatStamp,
  isOtherChoice,
  noteTone,
  resolveOther,
} from "@/lib/school/constants";
import { staffCan } from "@/lib/school/permissions";
import type { CatalogItem, CounselingCase } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";
import { MessageCircle } from "lucide-react";

export const Route = createFileRoute("/counseling")({ component: CounselingPage });

function CounselingPage() {
  return (
    <AppGate>
      <CounselingBody />
    </AppGate>
  );
}

function caseKindLabel(kind: CounselingCase["kind"]) {
  return CASE_KINDS.find((item) => item.key === kind)?.label ?? kind;
}

function CounselingBody() {
  const { staff, healthConditions = [], compensations = [] } = useWorkspace();
  const can = staffCan(staff, "counseling");
  const [q, setQ] = useState("");
  const [healthId, setHealthId] = useState<number | "">("");
  const [healthNote, setHealthNote] = useState("");
  const [customHealth, setCustomHealth] = useState("");
  const [activeStudent, setActiveStudent] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const desk = useQuery({
    queryKey: ["counseling-desk"],
    queryFn: () => getCounselingDesk(),
    enabled: can,
  });
  const improvements = useQuery({
    queryKey: ["improvements", "counseling"],
    queryFn: () => listImprovements({ data: { openOnly: true } }),
    enabled: can,
  });

  const roster = desk.data?.roster ?? [];
  const filtered = useMemo(() => {
    const term = q.trim();
    if (!term) return roster;
    return roster.filter((s: { name: string; classLabel: string }) => s.name.includes(term) || s.classLabel.includes(term));
  }, [roster, q]);

  function applyChip(name: string) {
    setHealthNote((prev) => {
      if (!prev.trim()) return name;
      if (prev.includes(name)) return prev;
      return `${prev}، ${name}`;
    });
  }

  const healthMutation = useMutation({
    mutationFn: () =>
      updateHealthNote({
        data: { studentId: Number(healthId), healthNote },
      }),
    onSuccess: (res) => {
      toast.success(`حُفظت الملاحظة الصحية لـ ${res.studentName}`);
      setHealthNote("");
      void queryClient.invalidateQueries({ queryKey: ["counseling-desk"] });
      void queryClient.invalidateQueries({ queryKey: ["class"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });

  const addHealth = useMutation({
    mutationFn: () => createHealthCondition({ data: { name: customHealth } }),
    onSuccess: (res) => {
      applyChip(res.name);
      setCustomHealth("");
      toast.success(res.existed ? "موجود في القائمة واخترناه" : "أُضيف للقائمة واخترناه");
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
      void queryClient.invalidateQueries({ queryKey: ["health-conditions"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الإضافة"),
  });

  if (!can) {
    return <p className="text-fg-muted">صفحة الإرشاد الطلابي لمن مُنح صلاحية الإرشاد.</p>;
  }

  const selected = roster.find((s: { id: number }) => s.id === Number(healthId));
  const cases: CounselingCase[] = desk.data?.cases ?? [];

  return (
    <div className="space-y-6">
      {staffCan(staff, "sendMessages") ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-4">
          <div><h2 className="font-semibold">الرسائل الجماعية</h2><p className="text-sm text-fg-muted">فتح شاشة مستقلة لاختيار المتأخرين أو الغائبين حسب اليوم.</p></div>
          <Link to="/messages" className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-fg"><MessageCircle className="size-4" />الرسائل الجماعية</Link>
        </div>
      ) : null}
      <header>
        <p className="text-sm text-fg-muted">
          الإحالات من وكيل شؤون الطلاب، مراسلات المعلمين، خطط التحسين، والملاحظات الصحية
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">الإرشاد الطلابي</h1>
      </header>

      <section className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-card p-4">
        <h2 className="text-xl font-semibold">فرص تعويض درجات السلوك</h2>
        <p className="text-sm text-fg-muted">
          يختار المرشد منها للطالب المحال، ويمكن إضافة فرصة غير موجودة في القائمة.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(compensations.length
            ? compensations.map((c) => c.name)
            : COMPENSATION_OPTIONS
          ).map((name) => (
            <span
              key={name}
              className="inline-flex min-h-10 items-center rounded-full border border-border bg-bg-elevated px-3 text-xs font-medium"
            >
              {name}
            </span>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">المحالة إلى الإرشاد</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
          {(desk.data?.referrals ?? []).map((item: any) => (
            <li key={item.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="text-right text-base font-semibold"
                  onClick={() => setActiveStudent(item.studentId)}
                >
                  {item.studentName}
                </button>
                <span className="text-xs text-fg-muted">{item.classLabel}</span>
                <Badge tone={noteTone(item.type, item.status)}>{NOTE_META[item.type as keyof typeof NOTE_META]?.short ?? item.type}</Badge>
                {item.behaviorTypeName ? (
                  <span className="text-xs text-fg-muted">
                    {item.behaviorTypeName}
                    {item.behaviorDegree ? ` · ${degreeLabel(item.behaviorDegree)}` : ""}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-fg-subtle">
                {item.teacherName}
                {item.teacherSubject ? ` · ${item.teacherSubject}` : ""} · {formatStamp(item.occurredAt)}
              </p>
              {item.suggestedAction ? (
                <p className="text-sm text-fg">إجراء مقترح: {item.suggestedAction}</p>
              ) : null}
              {item.details ? <p className="text-sm text-fg-muted">{item.details}</p> : null}
              <ReferralCompensation noteId={item.id} current={item.compensation ?? ""} />
              <div className="flex flex-wrap gap-2">
              <NoteRecordTools note={item} />
              <PrintFormsButton
                student={{
                  name: item.studentName,
                  classLabel: item.classLabel,
                }}
                notes={[
                  {
                    type: item.type as "behavior",
                    details: item.details,
                    behaviorTypeName: item.behaviorTypeName,
                    behaviorDegree: item.behaviorDegree,
                    periodKey: item.periodKey,
                    actionTaken: item.actionTaken,
                    createdAt: item.createdAt,
                    occurredAt: item.occurredAt,
                    teacherName: item.teacherName,
                    teacherSubject: item.teacherSubject,
                    suggestedAction: item.suggestedAction,
                    compensation: item.compensation,
                  },
                ]}
                studentId={item.studentId}
                defaultKind="referral"
                label="نموذج الإحالة"
              />
              <PrintFormsButton
                student={{
                  name: item.studentName,
                  classLabel: item.classLabel,
                }}
                notes={[
                  {
                    type: item.type as "behavior",
                    details: item.details,
                    behaviorTypeName: item.behaviorTypeName,
                    behaviorDegree: item.behaviorDegree,
                    periodKey: item.periodKey,
                    actionTaken: item.actionTaken,
                    createdAt: item.createdAt,
                    occurredAt: item.occurredAt,
                    teacherName: item.teacherName,
                    teacherSubject: item.teacherSubject,
                    suggestedAction: item.suggestedAction,
                    compensation: item.compensation,
                  },
                ]}
                studentId={item.studentId}
                defaultKind="compensation"
                label="نموذج التعويض"
              />
              </div>
            </li>
          ))}
          {(desk.data?.referrals ?? []).length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-fg-muted">
              لا توجد إحالات بعد. يحوّل وكيل شؤون الطلاب المخالفات السلوكية إلى هنا من شؤون الطلاب.
            </li>
          ) : null}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">مراسلات المعلمين</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
          {cases.map((item) => (
            <li key={item.id} className="space-y-1.5 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="text-right text-base font-semibold"
                  onClick={() => setActiveStudent(item.studentId)}
                >
                  {item.studentName}
                </button>
                <span className="text-xs text-fg-muted">{item.classLabel}</span>
                <Badge tone={item.kind === "health" ? "warn" : item.kind === "psych" ? "danger" : "primary"}>
                  {caseKindLabel(item.kind)}
                </Badge>
                <span className="ms-auto">
                  <CaseRecordTools id={item.id} body={item.body} />
                </span>
              </div>
              <p className="text-sm">{item.body}</p>
              <p className="text-xs text-fg-subtle">
                {item.authorName} · {formatStamp(item.createdAt)}
              </p>
            </li>
          ))}
          {cases.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-fg-muted">
              لا توجد مراسلات بعد. يرسلها المعلم من سجل الطالب: حالة صحية أو نفسية أو صعوبات تعلم.
            </li>
          ) : null}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">خطط تحسين السلوك</h2>
        <ul className="space-y-2">
          {(improvements.data ?? []).map((item: any) => (
            <li key={item.id} className="rounded-[var(--radius-md)] border border-border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="font-semibold"
                  onClick={() => setActiveStudent(item.studentId)}
                >
                  {item.studentName}
                </button>
                <span className="text-xs text-fg-muted">{item.classLabel}</span>
                <Badge tone={item.status === "closed" ? "ok" : "warn"}>{IMPROVEMENT_STATUS[item.status as keyof typeof IMPROVEMENT_STATUS]}</Badge>
                <span className="ms-auto">
                  <ImprovementRecordTools id={item.id} plan={item.plan} />
                </span>
              </div>
              <p className="mt-1 text-sm">{item.plan}</p>
              <p className="mt-1 text-xs text-fg-subtle">
                {item.teacherName}
                {item.teacherSubject ? ` · ${item.teacherSubject}` : ""} · {formatStamp(item.createdAt)}
              </p>
            </li>
          ))}
          {(improvements.data ?? []).length === 0 ? (
            <li className="rounded-[var(--radius-md)] border border-border px-4 py-8 text-center text-sm text-fg-muted">
              لا توجد خطط تحسين مفتوحة.
            </li>
          ) : null}
        </ul>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>الملاحظات الصحية</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-fg-muted">
            اختر من قائمة الأمراض المحفوظة أو أضف ما ليس فيها فيُحفظ تلقائياً. تظهر أسفل اسم الطالب في كشف الفصل.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="health-q">بحث عن طالب</Label>
              <Input id="health-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="الاسم أو الصف" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="health-student">الطالب</Label>
              <select
                id="health-student"
                className="h-11 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 text-sm"
                value={healthId}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : "";
                  setHealthId(id);
                  const found = roster.find((s: { id: number; healthNote?: string }) => s.id === Number(id));
                  setHealthNote(found?.healthNote ?? "");
                }}
              >
                <option value="">اختر طالباً</option>
                {filtered.slice(0, 80).map((s: { id: number; name: string; classLabel: string }) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.classLabel}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(healthConditions as CatalogItem[]).map((item) => {
              const on = healthNote.includes(item.name);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => applyChip(item.name)}
                  className={cn(
                    "min-h-10 rounded-full border px-3 text-sm",
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-bg-elevated text-fg-muted",
                  )}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (customHealth.trim().length >= 2) addHealth.mutate();
            }}
          >
            <Input
              value={customHealth}
              onChange={(e) => setCustomHealth(e.target.value)}
              placeholder="مرض غير موجود في القائمة…"
              className="min-w-48 flex-1"
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={addHealth.isPending || customHealth.trim().length < 2}
            >
              إضافة للقائمة
            </Button>
          </form>
          <div className="space-y-1.5">
            <Label htmlFor="health-note">الملاحظة الصحية</Label>
            <Textarea
              id="health-note"
              className="min-h-20"
              placeholder="مثال: يعاني من الربو — يحتاج بخاخاً عند الضيق"
              value={healthNote}
              onChange={(e) => setHealthNote(e.target.value)}
            />
          </div>
          <Button
            disabled={healthMutation.isPending || !healthId}
            onClick={() => healthMutation.mutate()}
          >
            حفظ الملاحظة الصحية
          </Button>
          {selected?.healthNote ? (
            <p className="text-sm text-warn">الحالية: {selected.healthNote}</p>
          ) : null}

          {(desk.data?.health ?? []).length ? (
            <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-md)] border border-border">
              {desk.data!.health.map((s: { id: number; name: string; classLabel: string; healthNote: string }) => (
                <li key={s.id} className="px-3 py-2">
                  <p className="font-medium">{s.name} <span className="text-xs text-fg-muted">{s.classLabel}</span></p>
                  <p className="text-sm text-warn">{s.healthNote}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <StudentSheet
        studentId={activeStudent}
        open={activeStudent != null}
        onOpenChange={(open) => {
          if (!open) setActiveStudent(null);
        }}
      />
    </div>
  );
}

function ReferralCompensation({ noteId, current }: { noteId: number; current: string }) {
  const { compensations = [] } = useWorkspace();
  const queryClient = useQueryClient();
  const options =
    compensations.length > 0 ? compensations.map((c) => c.name) : COMPENSATION_OPTIONS;
  const initial = current
    ? current.split(" — ").filter(Boolean)
    : [];
  const [picked, setPicked] = useState<string[]>(() => {
    return initial.map((name) => (options.includes(name) ? name : "أخرى"));
  });
  const [other, setOther] = useState(() =>
    initial.find((name) => !options.includes(name) && !isOtherChoice(name)) ?? "",
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const names = resolveOther(picked, other);
      if (picked.some(isOtherChoice) && other.trim().length < 2) {
        throw new Error("اكتب فرصة التعويض يدوياً");
      }
      const custom = names.filter((name) => !options.some((o) => o === name));
      for (const name of custom) {
        try {
          await createCompensationOption({ data: { name } });
        } catch {
          /* ignore */
        }
      }
      return setNoteCompensation({ data: { noteId, compensation: names.join(" — ") } });
    },
    onSuccess: () => {
      toast.success("حُفظت فرص التعويض");
      void queryClient.invalidateQueries({ queryKey: ["counseling-desk"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });

  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-border bg-bg p-3">
      <Label>فرص تعويض درجات السلوك</Label>
      {current ? <p className="text-sm text-ok">المحفوظ: {current}</p> : null}
      <OptionChips
        items={options}
        selected={picked}
        onToggle={(name) =>
          setPicked((prev) =>
            prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
          )
        }
        otherValue={other}
        onOtherChange={setOther}
        otherPlaceholder="اكتب فرصة التعويض يدوياً…"
      />
      <Button
        size="sm"
        variant="secondary"
        disabled={mutation.isPending || (picked.length === 0 && !other.trim())}
        onClick={() => mutation.mutate()}
      >
        حفظ فرص التعويض
      </Button>
    </div>
  );
}
