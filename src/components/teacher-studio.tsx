import { useMutation, useQuery, useQueryClient, useQueries } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { OfficialLetterhead } from "@/components/print-forms";
import { GRADE_SHEET_COLUMNS, type ExtraCol } from "@/components/roster-builder";
import { ExitPermitBadge } from "@/components/exit-permit";
import { DayName } from "@/components/day-name";
import {
  applyClassEval,
  getClassEval,
  getTeacherPins,
  applyGradeFormat,
  getGradeStudio,
  getFollowLedger,
  saveGradeFormat,
  deleteGradeFormat,
  saveEvalCard,
  reorderEvalCards,
  saveEvalScale,
  savePeriodMark,
  saveSubjectPlan,
  linkFollowCards,
  setPeriodClosed,
  setTeacherPins,
  undoClassEval,
  undoLastClassEval,
} from "@/lib/school/api";
import { EVAL_PAIRS, formatPoints, scoreBand, shortEvalLabel } from "@/lib/school/eval";
import { parseSubjects, hijriDate, formatStamp } from "@/lib/school/constants";
import { tr } from "@/lib/school/i18n";
import { printElement } from "@/lib/school/print";
import { staffCan } from "@/lib/school/permissions";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

function sheetGrade(value: number) {
  if (!value) return "";
  return formatPoints(value);
}

function isSumColumn(col: { id: string; title?: string; calc?: string }) {
  const title = (col.title || "").replace(/\s/g, "");
  return col.calc === "sum" || col.id === "total" || title === "المجموع" || title.startsWith("المجموع");
}

function isCalcColumn(col: { calc?: string; id: string; title?: string }) {
  return col.calc === "sum" || col.calc === "avg" || (isSumColumn(col) && col.calc !== "");
}

function columnMath(col: { id: string; calc?: string; sources?: string[]; title?: string }, cols: { id: string; calc?: string; title?: string }[], values: Record<string, string | number | undefined>) {
  if (col.calc === "cards") return Number(values[col.id]) || 0;
  const manual = cols.filter((item) => item.id !== col.id && item.calc !== "sum" && item.calc !== "avg" && !isSumColumn(item));
  const ids = col.sources?.length ? col.sources : col.calc === "avg" ? [] : manual.map((item) => item.id);
  if (!ids.length) return 0;
  const total = ids.reduce((sum, id) => sum + (Number(values[id]) || 0), 0);
  return col.calc === "avg" ? total / ids.length : total;
}

function withinMax(raw: string, max: number) {
  const text = raw.trim();
  if (!text) return "";
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return null;
  if (max > 0 && value > max) return null;
  return text;
}

type Tab = "eval" | "grades" | "reports" | "cards";
type PinClass = { id: number; label: string; stageName: string; studentCount: number };
type EvalCard = { id: number; label: string; points: number; bucket: "tasks" | "quizzes"; enabled: boolean; sortOrder?: number; columnId?: string };
type EvalStudent = {
  id: number;
  name: string;
  nationalId: string;
  nationality: string;
  phone: string;
  today: string;
  tasks: number;
  quizzes: number;
  participation: number;
  exam: number;
  evalPoints: number;
  total: number;
  positive: number;
  negative: number;
  taps?: { label: string; count: number; points: number }[];
};
type EvalPayload = {
  class: { label: string; stageName: string };
  subject: string;
  scale: { tasksMax: number; quizzesMax: number; totalMax: number };
  cards: EvalCard[];
  students: EvalStudent[];
};

export function TeacherStudio() {
  const { classes, staff } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<number[] | null>(null);
  const pins = useQuery({ queryKey: ["teacher-pins"], queryFn: () => getTeacherPins() });
  const savePins = useMutation({
    mutationFn: (classIds: number[]) => setTeacherPins({ data: { classIds } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teacher-pins"] });
      setPicking(false);
      toast.success(tr("حُفظت فصول مكتبك"));
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
  });
  const mine = ((pins.data as { classes?: PinClass[] } | undefined)?.classes ?? []);
  const chosen = picked ?? mine.map((item) => item.id);

  function toggle(id: number) {
    setPicked((prev) => {
      const base = prev ?? mine.map((item) => item.id);
      return base.includes(id) ? base.filter((item) => item !== id) : [...base, id];
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">{tr("فصولي")}</h2>
          <p className="text-sm text-fg-muted">
            {tr("اضغط الفصل للانتقال مباشرة إلى متابعته، والمرحلة والفصل محددان. تنسيق الدرجات من داخل شاشة المتابعة.")}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setPicked(mine.map((item) => item.id));
            setPicking((open) => !open);
          }}
        >
          {tr("اختيار الفصول")}
        </Button>
      </div>
      {picking ? (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {classes.map((cls) => (
                <label key={cls.id} className="flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border border-border px-3 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={chosen.includes(cls.id)}
                    onChange={() => toggle(cls.id)}
                  />
                  <span className="min-w-0 flex-1">
                    {cls.label}
                    <span className="block text-xs text-fg-muted">{cls.stageName}</span>
                  </span>
                </label>
              ))}
            </div>
            <Button type="button" disabled={savePins.isPending} onClick={() => savePins.mutate(chosen)}>
              {savePins.isPending ? tr("جارٍ الحفظ…") : tr("حفظ فصول المكتب")}
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {pins.isPending ? <p className="text-sm text-fg-muted">{tr("جارٍ التحميل…")}</p> : null}
      {!pins.isPending && mine.length === 0 ? (
        <p className="rounded-[var(--radius-md)] border border-dashed border-border px-3 py-6 text-sm text-fg-muted">
          {tr("لم تختر فصولاً بعد. أضف الفصول التي تدرّسها ليظهر كشف المتابعة هنا.")}
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {mine.map((cls) => (
            <button
              key={cls.id}
              type="button"
              onClick={() => void navigate({ to: "/class/$classId", params: { classId: String(cls.id) }, search: { from: "desk" } })}
              className="rounded-[var(--radius-lg)] border border-border bg-card px-3 py-2 text-right hover:border-primary"
            >
              <span className="block font-semibold">{cls.label}</span>
              <span className="block text-xs text-fg-muted">
                {cls.stageName} · {cls.studentCount} {tr("طالب")}
                {staff.subject ? ` · ${staff.subject}` : ""}
              </span>
              <span className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{tr("متابعة")}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function ClassBoard({
  classId,
  onlyStudentId,
  compact,
  presetSubject,
  presetPeriod,
  onClose,
  lessonTaps,
}: {
  classId: number;
  onlyStudentId?: number;
  compact?: boolean;
  presetSubject?: string;
  presetPeriod?: string;
  onClose?: () => void;
  lessonTaps?: { label: string; points: number }[];
}) {
  const { school, staff } = useWorkspace();
  const subjects = parseSubjects(staff.subject);
  const fromTable = presetSubject?.trim() || "";
  const [lessonSubject, setLessonSubject] = useState(fromTable || (subjects.length === 1 ? subjects[0] : ""));
  const [pickSubject, setPickSubject] = useState(false);
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("eval");
  const [selected, setSelected] = useState<number[] | null>(null);
  const [undoIds, setUndoIds] = useState<number[]>([]);
  const [report, setReport] = useState<"year" | "analysis" | "attendance" | "student">("year");
  const [focusId, setFocusId] = useState<number | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantPoints, setGrantPoints] = useState("1");
  const [grantLabel, setGrantLabel] = useState("منح");
  const [grantBucket, setGrantBucket] = useState<"tasks" | "quizzes">("tasks");
  const [draftLabel, setDraftLabel] = useState("");
  const [draftPoints, setDraftPoints] = useState("1");
  const [draftBucket, setDraftBucket] = useState<"tasks" | "quizzes">("tasks");
  const [tasksMax, setTasksMax] = useState("");
  const [quizzesMax, setQuizzesMax] = useState("");
  const [litCard, setLitCard] = useState<number | null>(null);
  const [solidIds, setSolidIds] = useState<number[]>([]);
  const [armPrint, setArmPrint] = useState(false);
  const query = useQuery({
    queryKey: ["class-eval", classId, lessonSubject, presetPeriod || ""],
    queryFn: () => getClassEval({ data: { classId, subject: lessonSubject || undefined, lessonKey: presetPeriod || undefined } }),
  });
  const data = query.data as EvalPayload | undefined;
  const students = data?.students ?? [];
  const active = onlyStudentId != null ? [onlyStudentId] : (selected ?? students.map((student) => student.id));
  const cards = (data?.cards ?? []).filter((card) => card.enabled);
  const cardRows = pairEvalCards([...cards].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));

  useEffect(() => {
    if (!armPrint || tab !== "reports") return;
    const timer = window.setTimeout(() => {
      if (printRef.current) printElement(printRef.current);
      setArmPrint(false);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [armPrint, tab, data, report]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["class-eval", classId] });
  }

  const apply = useMutation({
    mutationFn: (payload: { cardId?: number; label?: string; points?: number; bucket?: "tasks" | "quizzes" }) =>
      applyClassEval({ data: { classId, studentIds: active, subject: lessonSubject || undefined, lessonKey: presetPeriod || undefined, ...payload } }),
    onSuccess: (res, payload) => {
      const done = res as { ids: number[]; count: number; label?: string; points?: number };
      setUndoIds(done.ids);
      if (payload.cardId) {
        setLitCard(payload.cardId);
        setSolidIds((prev) => (prev.includes(payload.cardId!) ? prev : [...prev, payload.cardId!]));
      }
      const score = Number(done.points) || 0;
      toast.success(`${tr("سُجّل")} ${done.label || tr("التقييم")} ${score > 0 ? "+" : ""}${score}`);
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["class"] });
      void queryClient.invalidateQueries({ queryKey: ["follow-ledger"] });
      if (onClose) onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر التقييم")),
  });
  const undo = useMutation({
    mutationFn: () => undoClassEval({ data: { ids: undoIds } }),
    onSuccess: () => {
      setUndoIds([]);
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["class"] });
      void queryClient.invalidateQueries({ queryKey: ["follow-ledger"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر التراجع")),
  });
  const undoLast = useMutation({
    mutationFn: (payload?: { label?: string; cardId?: number }) =>
      undoLastClassEval({
        data: {
          classId,
          studentIds: active,
          subject: lessonSubject || undefined,
          label: payload?.label,
          cardId: payload?.cardId,
          lessonKey: presetPeriod || undefined,
        },
      }),
    onSuccess: () => {
      setUndoIds([]);
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["class"] });
      void queryClient.invalidateQueries({ queryKey: ["follow-ledger"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر التراجع")),
  });
  const reorderCards = useMutation({
    mutationFn: (ids: number[]) => reorderEvalCards({ data: { ids } }),
    onSuccess: refresh,
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الترتيب")),
  });
  const saveCard = useMutation({
    mutationFn: (payload: { id?: number; label: string; points: number; bucket: "tasks" | "quizzes"; enabled?: boolean; columnId?: string }) =>
      saveEvalCard({ data: payload }),
    onSuccess: () => {
      setDraftLabel("");
      refresh();
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
  });
  const saveScale = useMutation({
    mutationFn: () =>
      saveEvalScale({
        data: {
          tasksMax: Number(tasksMax || data?.scale.tasksMax || 40),
          quizzesMax: Number(quizzesMax || data?.scale.quizzesMax || 20),
        },
      }),
    onSuccess: () => {
      refresh();
      toast.success(tr("حُفظ توزيع الدرجات"));
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
  });

  function toggleStudent(id: number) {
    setSelected((prev) => {
      const base = prev ?? students.map((student) => student.id);
      return base.includes(id) ? base.filter((item) => item !== id) : [...base, id];
    });
  }

  const focusOne = onlyStudentId != null
    ? students.find((student) => student.id === onlyStudentId)
    : active.length === 1
      ? students.find((student) => student.id === active[0])
      : undefined;
  const focus = students.find((student) => student.id === (focusId ?? active[0])) ?? students[0];
  function lessonCount(label: string) {
    return (lessonTaps ?? []).filter((tap) => tap.label === label).length;
  }
  function pressLevel(label: string) {
    const fromLesson = lessonCount(label);
    if (fromLesson > 0) return fromLesson;
    const ids = focusOne ? [focusOne.id] : onlyStudentId != null ? [onlyStudentId] : active;
    let level = 0;
    for (const id of ids) {
      const count = students.find((student) => student.id === id)?.taps?.find((tap) => tap.label === label)?.count ?? 0;
      if (count > level) level = count;
    }
    return level;
  }
  function cardUsed(label: string) {
    if (lessonCount(label) > 0) return true;
    const ids = onlyStudentId != null ? [onlyStudentId] : active;
    if (!ids.length || !label) return false;
    return ids.some((id) => (students.find((student) => student.id === id)?.taps ?? []).some((tap) => tap.label === label && tap.count > 0));
  }
  function kept(label: string) {
    if (lessonCount(label) > 0 && (onlyStudentId != null || active.length <= 1)) return true;
    const ids = onlyStudentId != null ? [onlyStudentId] : active;
    if (!ids.length || !label) return false;
    return ids.every((id) => (students.find((student) => student.id === id)?.taps ?? []).some((tap) => tap.label === label && tap.count > 0));
  }
  const scale = data?.scale ?? { tasksMax: 40, quizzesMax: 20, totalMax: 60 };

  return (
    <div className={cn("space-y-2", compact ? "px-1 py-2" : "border-t border-border bg-bg px-3 py-4")}>
        {compact ? null : onClose ? (
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="flex size-8 items-center justify-center rounded-full border border-border text-lg leading-none" aria-label={tr("إغلاق")}>×</button>
          </div>
        ) : null}
        {query.isPending ? <p className="text-sm text-fg-muted">{tr("جارٍ التحميل…")}</p> : null}
        {tab === "eval" && data ? (
          <div className="space-y-3">
            {fromTable && !pickSubject ? (
              <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-primary/10 px-3 py-2">
                <p className="text-sm font-semibold">{tr("المادة")}: {lessonSubject}</p>
                {subjects.length > 1 ? (
                  <button type="button" className="text-xs font-medium text-primary" onClick={() => setPickSubject(true)}>
                    {tr("تغيير المادة")}
                  </button>
                ) : null}
              </div>
            ) : subjects.length === 1 ? (
              <p className="text-sm font-semibold">{tr("المادة")}: {subjects[0]}</p>
            ) : subjects.length > 1 ? (
              <div className="space-y-1">
                <p className="text-xs text-fg-muted">
                  {lessonSubject ? tr("المادة الحالية من الجدول. اختر غيرها إن أردت.") : tr("متابعة كل مادة على حدة. اختر المادة، ولا تُحدَّد واحدة مسبقاً.")}
                </p>
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
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {subjects.length > 1 && !lessonSubject ? (
              <p className="text-sm text-fg-muted">{tr("اختر المادة ثم اضغط التقييم. تُغلق الشاشة بعد الاختيار.")}</p>
            ) : null}
            {compact ? null : subjects.length < 2 || lessonSubject ? (
            <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>{tr("المحددون")} {active.length} {tr("من")} {students.length}</span>
              <Button type="button" size="sm" variant="secondary" onClick={() => setSelected(students.map((student) => student.id))}>
                {tr("الكل")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setSelected(students.map((student) => student.id).filter((id) => !active.includes(id)))}
              >
                {tr("عكس التحديد")}
              </Button>
              {undoIds.length ? (
                <Button type="button" size="sm" variant="secondary" disabled={undo.isPending} onClick={() => undo.mutate()}>
                  {tr("تراجع")}
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {students.map((student) => {
                const on = active.includes(student.id);
                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => toggleStudent(student.id)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm",
                      on ? "border-primary bg-primary text-primary-fg" : "border-border bg-bg",
                    )}
                  >
                    <DayName studentId={student.id} className={on ? "text-primary-fg" : undefined}>{student.name}</DayName>
                    <ExitPermitBadge studentId={student.id} className="ms-1" />
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-fg-muted">{tr("اختر الطلاب ثم اضغط البطاقة. الموجب يمين والسالب يسار. هذه درجات تقييم إضافية، وليست درجة السلوك.")}</p>
            </>
            ) : null}
            <div className="space-y-1">
              {cardRows.map((row, index) => (
                <div key={index} className="grid grid-cols-2 gap-1">
                  <EvalTap
                    card={row.positive}
                    count={row.positive ? pressLevel(row.positive.label) : 0}
                    lit={row.positive?.id === litCard}
                    solid={Boolean(row.positive && (solidIds.includes(row.positive.id) || kept(row.positive.label)))}
                    used={Boolean(row.positive && (cardUsed(row.positive.label) || solidIds.includes(row.positive.id)))}
                    pending={apply.isPending || active.length === 0}
                    undoPending={undoLast.isPending}
                    onApply={(cardId) => {
                      if (subjects.length > 1 && !lessonSubject) {
                        toast.error(tr("اختر المادة"));
                        return;
                      }
                      apply.mutate({ cardId });
                    }}
                    onUndo={(card) => undoLast.mutate({ label: card.label, cardId: card.id })}
                  />
                  <EvalTap
                    card={row.negative}
                    count={row.negative ? pressLevel(row.negative.label) : 0}
                    lit={row.negative?.id === litCard}
                    solid={Boolean(row.negative && (solidIds.includes(row.negative.id) || kept(row.negative.label)))}
                    used={Boolean(row.negative && (cardUsed(row.negative.label) || solidIds.includes(row.negative.id)))}
                    pending={apply.isPending || active.length === 0}
                    undoPending={undoLast.isPending}
                    onApply={(cardId) => {
                      if (subjects.length > 1 && !lessonSubject) {
                        toast.error(tr("اختر المادة"));
                        return;
                      }
                      apply.mutate({ cardId });
                    }}
                    onUndo={(card) => undoLast.mutate({ label: card.label, cardId: card.id })}
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              className="min-h-9 w-full rounded-[var(--radius-md)] border border-dashed border-border px-3 py-1.5 text-sm"
              onClick={() => setGrantOpen((open) => !open)}
            >
              {tr("منح درجة مخصصة")}
            </button>
            {grantOpen ? (
              <div className="grid gap-2 sm:grid-cols-4">
                <Input value={grantLabel} onChange={(e) => setGrantLabel(e.target.value)} placeholder={tr("اسم التقييم")} />
                <Input value={grantPoints} onChange={(e) => setGrantPoints(e.target.value)} inputMode="decimal" placeholder={tr("الدرجة")} />
                <Select value={grantBucket} onChange={(e) => setGrantBucket(e.target.value as "tasks" | "quizzes")}>
                  <option value="tasks">{tr("مهام ومشاركة")}</option>
                  <option value="quizzes">{tr("تقويمات")}</option>
                </Select>
                <Button
                  type="button"
                  disabled={apply.isPending || !grantLabel.trim() || !Number(grantPoints)}
                  onClick={() =>
                    apply.mutate({
                      label: grantLabel.trim(),
                      points: Number(grantPoints),
                      bucket: grantBucket,
                    })
                  }
                >
                  {tr("تطبيق")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {tab === "reports" && data ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["year", "كشف أعمال السنة"],
                  ["analysis", "التقرير الشامل"],
                  ["attendance", "الحضور والغياب"],
                  ["student", "تقرير الطالب"],
                ] as const
              ).map(([id, label]) => (
                <Button key={id} type="button" size="sm" variant={report === id ? "default" : "secondary"} onClick={() => setReport(id)}>
                  {tr(label)}
                </Button>
              ))}
              <Button type="button" onClick={() => printRef.current && printElement(printRef.current)}>
                {tr("طباعة")}
              </Button>
            </div>
            {report === "student" ? (
              <Select value={String(focus?.id ?? "")} onChange={(e) => setFocusId(Number(e.target.value))}>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                  </option>
                ))}
              </Select>
            ) : null}
            <div ref={printRef} className="rounded-[var(--radius-md)] border border-border bg-white p-4 text-black">
              <OfficialLetterhead school={school} />
              <h3 className="mb-2 text-center text-lg font-semibold">
                {report === "year"
                  ? tr("كشف أعمال السنة")
                  : report === "analysis"
                    ? tr("تحليل نتائج الفصل")
                    : report === "attendance"
                      ? tr("تقرير الحضور والغياب")
                      : tr("تقرير الطالب")}
                {` — ${data.class.label}`}
                {data.subject ? ` — ${data.subject}` : ""}
              </h3>
              {report === "year" ? <YearTable students={students} scale={scale} /> : null}
              {report === "analysis" ? (
                <ComprehensiveReport
                  students={students}
                  totalMax={scale.totalMax}
                  subject={data.subject}
                  classLabel={data.class.label}
                  stageName={data.class.stageName}
                  teacher={((data as { teacherName?: string }).teacherName || staff.displayName)}
                  principal={school.principalName}
                />
              ) : null}
              {report === "attendance" ? (
                <AttendanceReport
                  students={students}
                  dutyDays={(data as { dutyDays?: number }).dutyDays ?? 0}
                  subject={data.subject}
                  classLabel={data.class.label}
                  stageName={data.class.stageName}
                  teacher={((data as { teacherName?: string }).teacherName || staff.displayName)}
                  principal={school.principalName}
                />
              ) : null}
              {report === "student" && focus ? <StudentReport student={focus} scale={scale} subject={data.subject} teacher={((data as { teacherName?: string }).teacherName || staff.displayName)} /> : null}
              <p className="mt-6 text-sm">{tr("معلم المادة")}: {((data as { teacherName?: string }).teacherName || staff.displayName)}</p>
            </div>
          </div>
        ) : null}
        {tab === "cards" && data ? (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">{tr("رتّب ما يظهر أولاً، وعدّل الدرجة، واربط الاختيار بعمود المشاركة أو الاختبار أو التقويم.")}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>{tr("سقف المشاركة")}</Label>
                <Input
                  value={tasksMax}
                  placeholder={String(scale.tasksMax)}
                  onChange={(e) => setTasksMax(e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1">
                <Label>{tr("سقف الاختبار")}</Label>
                <Input
                  value={quizzesMax}
                  placeholder={String(scale.quizzesMax)}
                  onChange={(e) => setQuizzesMax(e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div className="flex items-end">
                <Button type="button" variant="secondary" disabled={saveScale.isPending} onClick={() => saveScale.mutate()}>
                  {tr("حفظ التوزيع")}
                </Button>
              </div>
            </div>
            <ul className="space-y-2">
              {[...data.cards].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((card, index, list) => {
                const periods = (data as { periods?: PeriodPlan[] }).periods ?? [];
                const open = periods.find((period) => !period.closed) ?? periods[0];
                const columns = open?.columns ?? [];
                return (
                  <li key={card.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-24 flex-1">{shortEvalLabel(card.label)}</span>
                    <Input
                      className="h-9 w-20"
                      defaultValue={String(card.points)}
                      key={`${card.id}-${card.points}`}
                      inputMode="decimal"
                      onBlur={(event) => saveCard.mutate({ id: card.id, label: card.label, points: Number(event.target.value) || 0, bucket: card.bucket, enabled: card.enabled, columnId: card.columnId || "" })}
                    />
                    <Select
                      className="h-9 w-auto min-w-36"
                      value={card.columnId || ""}
                      onChange={(event) => saveCard.mutate({ id: card.id, label: card.label, points: card.points, bucket: card.bucket, enabled: card.enabled, columnId: event.target.value })}
                    >
                      <option value="">{tr("بدون عمود")}</option>
                      {columns.map((column) => (
                        <option key={column.id} value={column.id}>
                          {(column.group === "exam" ? "اختبار" : column.group === "tasks" ? "مشاركة" : "تقويم")}: {column.title}
                        </option>
                      ))}
                    </Select>
                    <Button type="button" size="sm" variant="secondary" disabled={index === 0 || reorderCards.isPending} onClick={() => {
                      const next = [...list];
                      const [item] = next.splice(index, 1);
                      next.splice(index - 1, 0, item);
                      reorderCards.mutate(next.map((item) => item.id));
                    }}>{tr("أعلى")}</Button>
                    <Button type="button" size="sm" variant="secondary" disabled={index === list.length - 1 || reorderCards.isPending} onClick={() => {
                      const next = [...list];
                      const [item] = next.splice(index, 1);
                      next.splice(index + 1, 0, item);
                      reorderCards.mutate(next.map((item) => item.id));
                    }}>{tr("أسفل")}</Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => saveCard.mutate({ id: card.id, label: card.label, points: card.points, bucket: card.bucket, enabled: !card.enabled, columnId: card.columnId || "" })}
                    >
                      {card.enabled ? tr("إخفاء") : tr("إظهار")}
                    </Button>
                  </li>
                );
              })}
            </ul>
            <div className="grid gap-2 sm:grid-cols-4">
              <Input value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} placeholder={tr("بطاقة جديدة")} />
              <Input value={draftPoints} onChange={(e) => setDraftPoints(e.target.value)} inputMode="decimal" />
              <Select value={draftBucket} onChange={(e) => setDraftBucket(e.target.value as "tasks" | "quizzes")}>
                <option value="tasks">{tr("مهام ومشاركة")}</option>
                <option value="quizzes">{tr("تقويمات")}</option>
              </Select>
              <Button
                type="button"
                disabled={!draftLabel.trim() || !Number(draftPoints)}
                onClick={() => saveCard.mutate({ label: draftLabel.trim(), points: Number(draftPoints), bucket: draftBucket })}
              >
                {tr("إضافة")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
  );
}

function lessonName(key?: string) {
  const names = ["", "الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة"];
  const match = String(key ?? "").match(/^p(\d+)$/);
  if (!match) return "";
  return `الحصة ${names[Number(match[1])] || match[1]}`;
}

export function FollowLedgerPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["follow-ledger"], queryFn: () => getFollowLedger() });
  const data = query.data as {
    rows?: { id: number; studentId: number; classId: number; label: string; points: number; subject: string; lessonKey: string; createdAt: string; studentName: string; className: string }[];
    classes?: { id: number; name: string; pinned: boolean }[];
    students?: { id: number; name: string; classId: number }[];
  } | undefined;
  const rows = data?.rows ?? [];
  const classes = data?.classes ?? [];
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [q, setQ] = useState("");
  const [sign, setSign] = useState<"all" | "up" | "down">("all");
  const drop = useMutation({
    mutationFn: (id: number) => undoClassEval({ data: { ids: [id] } }),
    onSuccess: () => {
      toast.success(tr("حُذف السجل وعُدّلت الدرجة"));
      void queryClient.invalidateQueries({ queryKey: ["follow-ledger"] });
      void queryClient.invalidateQueries({ queryKey: ["class-eval"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحذف")),
  });
  const students = (data?.students ?? []).filter((student) => !classId || String(student.classId) === classId);
  const favorites = classes.filter((item) => item.pinned);
  const taught = classes.filter((item) => !item.pinned);
  const shown = rows.filter((row) => {
    if (classId && String(row.classId) !== classId) return false;
    if (studentId && String(row.studentId) !== studentId) return false;
    if (sign === "up" && row.points < 0) return false;
    if (sign === "down" && row.points >= 0) return false;
    return !q.trim() || row.studentName.includes(q.trim());
  });
  return (
    <section className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">{tr("الفصل")}</span>
          <Select className="h-10 w-full" value={classId} onChange={(event) => { setClassId(event.target.value); setStudentId(""); }}>
            <option value="">{tr("كل فصولي")}</option>
            {favorites.length ? <optgroup label={tr("المفضلة")}>{favorites.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup> : null}
            {taught.length ? <optgroup label={tr("التي أدرّسها")}>{taught.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup> : null}
          </Select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">{tr("الطالب")}</span>
          <Select className="h-10 w-full" value={studentId} onChange={(event) => setStudentId(event.target.value)}>
            <option value="">{tr("كل الطلاب")}</option>
            {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
          </Select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder={tr("أو ابحث بالاسم")} className="max-w-xs" />
        <Select className="h-10 w-auto" value={sign} onChange={(event) => setSign(event.target.value as "all" | "up" | "down")}>
          <option value="all">{tr("الكل")}</option>
          <option value="up">{tr("إيجابي")}</option>
          <option value="down">{tr("سلبي")}</option>
        </Select>
      </div>
      {query.isPending ? <p className="text-sm text-fg-muted">{tr("جارٍ التحميل…")}</p> : null}
      {shown.length === 0 && !query.isPending ? <p className="text-sm text-fg-muted">{tr("لا توجد متابعة محفوظة لهذا الاختيار.")}</p> : null}
      <ul className="divide-y divide-border rounded-[var(--radius-lg)] border border-border bg-card">
        {shown.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <div>
              <p className="font-medium">{row.studentName}</p>
              <p className="text-xs text-fg-muted">
                {row.className} · {formatStamp(row.createdAt)}{row.subject ? ` · ${row.subject}` : ""}{lessonName(row.lessonKey) ? ` · ${lessonName(row.lessonKey)}` : ""}{row.enteredByName ? ` · ${row.enteredByName}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={row.points < 0 ? "font-semibold text-danger" : "font-semibold text-ok"}>
                {shortEvalLabel(row.label)} {row.points > 0 ? "+" : ""}{formatPoints(row.points)}
              </span>
              <Button type="button" size="sm" variant="secondary" disabled={drop.isPending} onClick={() => { if (window.confirm(tr("حذف هذا السجل؟ لا يمكن التراجع."))) drop.mutate(row.id); }}>{tr("حذف")}</Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function pairEvalCards(cards: EvalCard[]) {
  const byLabel = new Map(cards.map((card) => [card.label, card]));
  const used = new Set<number>();
  const rows: { positive: EvalCard | null; negative: EvalCard | null }[] = [];
  for (const [positiveLabel, negativeLabel] of EVAL_PAIRS) {
    const positive = byLabel.get(positiveLabel) ?? null;
    const negative = byLabel.get(negativeLabel) ?? null;
    if (!positive && !negative) continue;
    if (positive) used.add(positive.id);
    if (negative) used.add(negative.id);
    rows.push({ positive, negative });
  }
  for (const card of [...cards].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id)) {
    if (used.has(card.id)) continue;
    used.add(card.id);
    const open = rows.find((row) => (card.points < 0 ? !row.negative : !row.positive));
    if (open) {
      if (card.points < 0) open.negative = card;
      else open.positive = card;
    } else {
      rows.push(card.points < 0 ? { positive: null, negative: card } : { positive: card, negative: null });
    }
  }
  return rows;
}

function EvalTap({
  card,
  pending,
  count,
  lit,
  solid,
  used,
  undoPending,
  onApply,
  onUndo,
}: {
  card: EvalCard | null;
  pending: boolean;
  count?: number;
  lit?: boolean;
  solid?: boolean;
  used?: boolean;
  undoPending?: boolean;
  onApply: (cardId: number) => void;
  onUndo: (card: EvalCard) => void;
}) {
  if (!card) return <span className="min-h-9 rounded-[var(--radius-md)] border border-dashed border-border/70" />;
  const negative = card.points < 0;
  const level = count ?? 0;
  const usedNow = level > 0 || Boolean(solid || used);
  return (
    <div className="flex items-stretch gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => onApply(card.id)}
        className={cn(
          "flex min-h-9 min-w-0 flex-1 items-center justify-between gap-1 rounded-[var(--radius-md)] border px-2 py-1 text-sm font-semibold leading-5",
          usedNow
            ? negative
              ? "border-orange-600 bg-orange-500 text-white"
              : "border-emerald-700 bg-emerald-600 text-white"
            : negative
              ? "border-orange-300 bg-orange-50 text-orange-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800",
        )}
      >
        <span className="truncate text-right">{shortEvalLabel(card.label)}</span>
        {level > 0 ? <span className="shrink-0 rounded-full bg-white px-1.5 text-[11px] font-bold text-fg">{level}</span> : null}
        <span className="shrink-0 text-xs tabular-nums">
          {level > 0 ? (card.points * level > 0 ? "+" : "") + formatPoints(card.points * level) : (card.points > 0 ? "+" : "") + formatPoints(card.points)}
        </span>
      </button>
      {level > 0 ? (
        <button
          type="button"
          disabled={undoPending}
          onClick={() => onUndo(card)}
          className="shrink-0 rounded-[var(--radius-md)] border border-danger bg-white px-2 text-[11px] font-bold text-danger"
        >
          {tr("إلغاء")}
        </button>
      ) : null}
    </div>
  );
}

function YearTable({
  students,
  scale,
}: {
  students: { name: string; nationalId: string; participation: number; exam: number; evalPoints: number; total: number }[];
  scale: { tasksMax: number; quizzesMax: number; totalMax: number };
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          <th className="border border-black px-2 py-1">{tr("م")}</th>
          <th className="border border-black px-2 py-1">{tr("اسم الطالب")}</th>
          <th className="border border-black px-2 py-1">{tr("المشاركة")} ({formatPoints(scale.tasksMax)})</th>
          <th className="border border-black px-2 py-1">{tr("الاختبار")} ({formatPoints(scale.quizzesMax)})</th>
          <th className="border border-black px-2 py-1">{tr("التقييم")}</th>
          <th className="border border-black px-2 py-1">{tr("المجموع")} ({formatPoints(scale.totalMax)})</th>
        </tr>
      </thead>
      <tbody>
        {students.map((student, index) => (
          <tr key={student.name + index}>
            <td className="border border-black px-2 py-1">{index + 1}</td>
            <td className="border border-black px-2 py-1">{student.name}</td>
            <td className="border border-black px-2 py-1">{formatPoints(student.participation)}</td>
            <td className="border border-black px-2 py-1">{formatPoints(student.exam)}</td>
            <td className="border border-black px-2 py-1">{formatPoints(student.evalPoints)}</td>
            <td className="border border-black px-2 py-1">{formatPoints(student.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ComprehensiveReport({
  students,
  totalMax,
  subject,
  classLabel,
  stageName,
  teacher,
  principal,
}: {
  students: {
    name: string;
    total: number;
    positive: number;
    negative: number;
    absent?: number;
    late?: number;
    excused?: number;
    attendancePercent?: number;
    byPeriod?: { no: number; exam: number }[];
  }[];
  totalMax: number;
  subject: string;
  classLabel: string;
  stageName: string;
  teacher: string;
  principal: string;
}) {
  const subjectName = subject || "المادة";
  const percents = students.map((student) => (totalMax ? Math.round((student.total / totalMax) * 100) : 0));
  const averageTotal = students.length ? Math.round((students.reduce((sum, student) => sum + student.total, 0) / students.length) * 10) / 10 : 0;
  const averagePercent = percents.length ? Math.round(percents.reduce((sum, value) => sum + value, 0) / percents.length) : 0;
  const high = percents.length ? Math.max(...percents) : 0;
  const low = percents.length ? Math.min(...percents) : 0;
  const passed = percents.filter((value) => value >= 50).length;
  const examCount = new Set(students.flatMap((student) => (student.byPeriod ?? []).filter((period) => period.exam > 0).map((period) => period.no))).size;
  const head = "border border-[#1f8a4c] bg-[#1f8a4c] px-2 py-1.5 text-center text-xs font-semibold text-white";
  const cell = "border border-[#d7e3dc] px-2 py-1.5 text-center text-xs";
  const title = (text: string) => (
    <div className="my-3 flex justify-center">
      <span className="rounded-full bg-[#1f8a4c] px-4 py-1 text-sm font-semibold text-white">{text}</span>
    </div>
  );
  const result = (percent: number) => (
    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
      <span>%{percent}</span>
      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold text-white", percent >= 50 ? "bg-[#1f8a4c]" : "bg-[#d4534e]")}>
        {percent >= 50 ? "ناجح" : "راسب"}
      </span>
    </div>
  );
  return (
    <div className="space-y-2 text-[13px] text-black">
      <div className="mx-auto mb-3 max-w-xl border border-[#1f8a4c] px-3 py-2 text-center text-sm font-semibold">
        التقرير الشامل التفصيلي [{stageName ? `${stageName} - ` : ""}{classLabel}]
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["المرحلة الدراسية / الصف", `${stageName || "—"} - ${classLabel}`],
          ["عدد الطلاب", String(students.length)],
          ["عدد المواد", "1"],
          ["تاريخ الإصدار", hijriDate()],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[#1f8a4c] px-2 py-2 text-center">
            <p className="text-[11px] text-[#1f8a4c]">{label}</p>
            <p className="font-semibold">{value}</p>
          </div>
        ))}
      </div>
      {title("مقارنة المواد")}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={head}>المادة</th>
            <th className={head}>الدرجة الكلية</th>
            <th className={head}>متوسط المجموع</th>
            <th className={head}>متوسط النسبة</th>
            <th className={head}>أعلى نسبة</th>
            <th className={head}>أقل نسبة</th>
            <th className={head}>الناجحون (+50)</th>
            <th className={head}>عدد الاختبارات</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={cell}>{subjectName}</td>
            <td className={cell}>{formatPoints(totalMax)}</td>
            <td className={cell}>{formatPoints(averageTotal)}</td>
            <td className={cell}>%{averagePercent}</td>
            <td className={cell}>%{high}</td>
            <td className={cell}>%{low}</td>
            <td className={cell}>{passed} من {students.length}</td>
            <td className={cell}>{examCount}</td>
          </tr>
        </tbody>
      </table>
      {title("درجات الطلاب في المادة")}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={head}>م</th>
            <th className={head}>اسم الطالب</th>
            <th className={head}>{subjectName}</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student, index) => (
            <tr key={student.name + index} className={index % 2 ? "bg-[#f4f7f5]" : "bg-white"}>
              <td className={cell}>{index + 1}</td>
              <td className={`${cell} text-right`}>{student.name}</td>
              <td className={cell}>{result(percents[index] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {title("الحضور والغياب (بالأيام) — منذ بداية الفترة")}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={head}>م</th>
            <th className={head}>اسم الطالب</th>
            <th className={head}>نسبة الحضور</th>
            <th className={head}>غائب</th>
            <th className={head}>متأخر</th>
            <th className={head}>مستأذن/بعذر</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student, index) => (
            <tr key={`a-${student.name}-${index}`} className={index % 2 ? "bg-[#f4f7f5]" : "bg-white"}>
              <td className={cell}>{index + 1}</td>
              <td className={`${cell} text-right`}>{student.name}</td>
              <td className={cell}>%{student.attendancePercent ?? 100}</td>
              <td className={cell}>{student.absent ?? 0}</td>
              <td className={cell}>{student.late ?? 0}</td>
              <td className={cell}>{student.excused ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {title("التقييمات والأوسمة")}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={head}>م</th>
            <th className={head}>اسم الطالب</th>
            <th className={head}>تقييمات إيجابية</th>
            <th className={head}>تقييمات سلبية</th>
            <th className={head}>صافي النقاط</th>
            <th className={head}>الأوسمة</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student, index) => {
            const net = student.positive - student.negative;
            return (
              <tr key={`e-${student.name}-${index}`} className={index % 2 ? "bg-[#f4f7f5]" : "bg-white"}>
                <td className={cell}>{index + 1}</td>
                <td className={`${cell} text-right`}>{student.name}</td>
                <td className={cell}>{student.positive}</td>
                <td className={cell}>{student.negative}</td>
                <td className={cell}>{net}</td>
                <td className={cell}>{net >= 10 ? "وسام" : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-8 grid grid-cols-2 gap-6 text-center text-sm">
        <div>
          <p className="font-semibold">معلم/ة المادة</p>
          <p className="mt-2">{teacher || "………………"}</p>
        </div>
        <div>
          <p className="font-semibold">مدير/ة المدرسة</p>
          <p className="mt-2">{principal || "………………"}</p>
        </div>
      </div>
    </div>
  );
}

function ShareRing({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const radius = 26;
  const length = 2 * Math.PI * radius;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden>
        <circle cx="36" cy="36" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle cx="36" cy="36" r={radius} fill="none" stroke={color} strokeWidth="8" strokeDasharray={`${(pct / 100) * length} ${length}`} strokeLinecap="round" transform="rotate(-90 36 36)" />
        <text x="36" y="40" textAnchor="middle" fontSize="11" fill="#111827">%{Math.round(pct)}</text>
      </svg>
      <span className="text-xs">{label}</span>
    </div>
  );
}

function AttendanceReport({
  students,
  dutyDays,
  subject,
  classLabel,
  stageName,
  teacher,
  principal,
}: {
  students: {
    name: string;
    absent?: number;
    late?: number;
    leave?: number;
    excusedAbsence?: number;
    presentDays?: number;
    absenceDates?: string;
    attendancePercent?: number;
  }[];
  dutyDays: number;
  subject: string;
  classLabel: string;
  stageName: string;
  teacher: string;
  principal: string;
}) {
  const rows = students.map((student) => {
    const absent = student.absent ?? 0;
    const present = student.presentDays ?? Math.max(0, dutyDays - absent);
    const percent = student.attendancePercent ?? (dutyDays > 0 ? Math.round((present / dutyDays) * 100) : 100);
    return {
      ...student,
      absent,
      late: student.late ?? 0,
      leave: student.leave ?? 0,
      excusedAbsence: student.excusedAbsence ?? 0,
      present,
      percent,
      dates: student.absenceDates && student.absenceDates !== "" ? student.absenceDates : "—",
    };
  });
  const levelOf = (percent: number) => (percent >= 90 ? "ممتاز" : percent >= 75 ? "جيد" : percent >= 50 ? "متوسط" : "منخفض");
  const levels = [
    { label: "ممتاز", range: "100 - 90", color: "bg-[#1f8a4c]", count: rows.filter((row) => levelOf(row.percent) === "ممتاز").length },
    { label: "جيد", range: "89 - 75", color: "bg-[#2563eb]", count: rows.filter((row) => levelOf(row.percent) === "جيد").length },
    { label: "متوسط", range: "74 - 50", color: "bg-[#f59e0b]", count: rows.filter((row) => levelOf(row.percent) === "متوسط").length },
    { label: "منخفض", range: "أقل من 50", color: "bg-[#dc2626]", count: rows.filter((row) => levelOf(row.percent) === "منخفض").length },
  ];
  const absentDays = rows.reduce((sum, row) => sum + row.absent, 0);
  const lateDays = rows.reduce((sum, row) => sum + row.late, 0);
  const excuseDays = rows.reduce((sum, row) => sum + row.leave + row.excusedAbsence, 0);
  const slots = Math.max(1, rows.length * Math.max(dutyDays, 1));
  const presentShare = dutyDays > 0 ? Math.round((rows.reduce((sum, row) => sum + row.present, 0) / slots) * 100) : rows.every((row) => row.absent === 0) ? 100 : 0;
  const absentShare = dutyDays > 0 ? Math.round((absentDays / slots) * 100) : 0;
  const excuseShare = dutyDays > 0 ? Math.round((excuseDays / slots) * 100) : 0;
  const lateShare = dutyDays > 0 ? Math.round((lateDays / slots) * 100) : 0;
  const average = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.percent, 0) / rows.length) : 100;
  const top = [...rows].sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name, "ar")).slice(0, 3);
  const worst = [...rows].filter((row) => row.absent > 0).sort((a, b) => b.absent - a.absent).slice(0, 3);
  const maxLevel = Math.max(1, ...levels.map((level) => level.count));
  const head = "border border-[#1f8a4c] bg-[#1f8a4c] px-1 py-1 text-center text-[11px] font-semibold text-white";
  const cell = "border border-[#d7e3dc] px-1 py-1 text-center text-[11px]";
  const pill = (text: string) => (
    <div className="my-3 flex justify-center">
      <span className="rounded-full bg-[#1f8a4c] px-4 py-1 text-sm font-semibold text-white">{text}</span>
    </div>
  );
  return (
    <div className="space-y-2 text-[13px] text-black">
      <div className="mx-auto mb-3 max-w-xl border border-[#1f8a4c] px-3 py-2 text-center text-sm font-semibold">
        تقرير الحضور والغياب [{stageName ? `${stageName} - ` : ""}{classLabel} — {subject || "المادة"}]
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["المرحلة الدراسية / الصف", `${stageName || "—"} - ${classLabel}`],
          ["المادة", subject || "—"],
          ["الفترة الزمنية للتقرير", hijriDate()],
          ["تاريخ الإصدار", hijriDate()],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[#1f8a4c] px-2 py-2 text-center">
            <p className="text-[11px] text-[#1f8a4c]">{label}</p>
            <p className="font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <section className="space-y-2 rounded-xl border border-[#d7e3dc] p-2">
          <h3 className="text-center text-sm font-semibold text-[#1f8a4c]">الإحصائيات العامة</h3>
          {[
            ["عدد الطلاب", String(rows.length)],
            ["أيام الدوام", String(dutyDays)],
            ["نسبة الحضور العامة", `%${average}`],
            ["مجموع أيام الغياب", String(absentDays)],
            ["مجموع أيام التأخر", String(lateDays)],
            ["الاستئذان والغياب بعذر", String(excuseDays)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="flex-1 rounded-lg border border-[#d7e3dc] bg-[#f7fbf8] px-2 py-1 text-xs">{label}</span>
              <span className="w-16 rounded-lg border border-[#d7e3dc] bg-white px-2 py-1 text-center text-sm">{value}</span>
            </div>
          ))}
        </section>
        <section className="space-y-2 rounded-xl border border-[#d7e3dc] p-2">
          <h3 className="text-center text-sm font-semibold text-[#1f8a4c]">مستويات الحضور</h3>
          <div className="grid grid-cols-[auto_1fr_auto] gap-1 text-xs">
            <span className="text-center">المستوى</span>
            <span className="text-center">النطاق</span>
            <span className="text-center">عدد الطلاب</span>
            {levels.map((level) => (
              <Fragment key={level.label}>
                <span className={cn("rounded px-2 py-1 text-center text-white", level.color)}>{level.label}</span>
                <span className="rounded border px-2 py-1 text-center">{level.range}</span>
                <span className="rounded border px-2 py-1 text-center">{level.count}</span>
              </Fragment>
            ))}
          </div>
        </section>
      </div>
      {pill("رسم بياني (توزيع حالات الحضور)")}
      <div className="flex flex-wrap items-start justify-around gap-2 rounded-xl border border-[#d7e3dc] py-3">
        <ShareRing label="حاضر" value={presentShare} color="#1f8a4c" />
        <ShareRing label="غائب" value={absentShare} color="#dc2626" />
        <ShareRing label="مستأذن" value={excuseShare} color="#2563eb" />
        <ShareRing label="متأخر" value={lateShare} color="#f59e0b" />
      </div>
      {pill("رسم بياني (عدد الطلاب لكل مستوى حضور)")}
      <div className="flex items-end justify-around gap-2 rounded-xl border border-[#d7e3dc] px-3 pt-3 pb-2">
        {levels.map((level) => (
          <div key={level.label} className="flex w-16 flex-col items-center gap-1">
            <span className="text-xs font-semibold">{level.count}</span>
            <div className={cn("w-8 rounded-t", level.color)} style={{ height: `${Math.max(8, Math.round((level.count / maxLevel) * 96))}px` }} />
            <span className="text-[11px]">{level.label}</span>
          </div>
        ))}
      </div>
      {pill("أبرز الطلاب")}
      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-xl border border-[#d7e3dc] p-2">
          <h3 className="mb-2 text-center text-sm font-semibold text-[#1f8a4c]">الأعلى حضوراً</h3>
          {top.map((row) => (
            <div key={row.name} className="mb-1 flex items-center justify-between rounded bg-[#f7fbf8] px-2 py-1 text-xs">
              <span>{row.name}</span>
              <span>%{row.percent}</span>
            </div>
          ))}
        </section>
        <section className="rounded-xl border border-[#d7e3dc] p-2">
          <h3 className="mb-2 text-center text-sm font-semibold text-[#dc2626]">الأكثر غياباً</h3>
          {worst.length === 0 ? <p className="text-center text-xs">لا يوجد غياب مرصود</p> : worst.map((row) => (
            <div key={row.name} className="mb-1 flex items-center justify-between rounded bg-[#fdf2f2] px-2 py-1 text-xs">
              <span>{row.name}</span>
              <span>{row.absent} أيام</span>
            </div>
          ))}
        </section>
      </div>
      {pill("السجل التفصيلي للحضور والغياب (بالأيام)")}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {["م", "اسم الطالب", "حاضر", "غائب", "بعذر", "مستأذن", "متأخر", "هارب", "الحضور %", "تواريخ الغياب"].map((label) => (
              <th key={label} className={head}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.name + index} className={index % 2 ? "bg-[#f4f7f5]" : "bg-white"}>
              <td className={cell}>{index + 1}</td>
              <td className={`${cell} text-right`}>{row.name}</td>
              <td className={cell}>{row.present}</td>
              <td className={cell}>{row.absent || "—"}</td>
              <td className={cell}>{row.excusedAbsence || "—"}</td>
              <td className={cell}>{row.leave || "—"}</td>
              <td className={cell}>{row.late || "—"}</td>
              <td className={cell}>—</td>
              <td className={cell}>%{row.percent}</td>
              <td className={cell}>{row.dates}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-8 grid grid-cols-2 gap-6 text-center text-sm">
        <div>
          <p className="font-semibold">معلم/ة المادة</p>
          <p className="mt-2">{teacher || "………………"}</p>
        </div>
        <div>
          <p className="font-semibold">مدير/ة المدرسة</p>
          <p className="mt-2">{principal || "………………"}</p>
        </div>
      </div>
    </div>
  );
}

function StudentReport({
  student,
  scale,
  subject,
  teacher,
}: {
  student: { name: string; nationalId: string; nationality: string; total: number; participation: number; exam: number; evalPoints: number; positive: number; negative: number; today: string };
  scale: { tasksMax: number; quizzesMax: number; totalMax: number };
  subject: string;
  teacher: string;
}) {
  const percent = scale.totalMax ? Math.round((student.total / scale.totalMax) * 100) : 0;
  return (
    <div className="space-y-2 text-sm">
      <p>{tr("اسم الطالب")}: {student.name}</p>
      {student.nationality ? <p>{tr("الجنسية")}: {student.nationality}</p> : null}
      <p>{tr("المادة")}: {subject || "—"}</p>
      <p>{tr("درجة المشاركة")}: {formatPoints(student.participation)} / {formatPoints(scale.tasksMax)}</p>
      <p>{tr("درجة الاختبار")}: {formatPoints(student.exam)} / {formatPoints(scale.quizzesMax)}</p>
      <p>{tr("درجات التقييم الإضافية")}: {formatPoints(student.evalPoints)}</p>
      <p>{tr("المجموع")}: {formatPoints(student.total)} / {formatPoints(scale.totalMax)} — {percent}% — {scoreBand(percent)}</p>
      <p>{tr("تقييمات إيجابية")}: {student.positive} · {tr("تقييمات سلبية")}: {student.negative}</p>
      <p>{tr("حضور اليوم")}: {student.today === "absence" ? "غائب" : student.today === "late" ? "متأخر" : "حاضر"}</p>
      <p>{tr("معلم المادة")}: {teacher}</p>
    </div>
  );
}

type PeriodPlan = { no: number; title: string; tasksMax: number; examMax: number; closed: boolean; columns?: { id: string; title: string; group?: "tasks" | "exam" | "eval"; max?: number; calc?: "" | "sum" | "avg" | "cards"; sources?: string[] }[] };
type PeriodScore = { no: number; participation: number; exam: number; evalPoints: number; total: number; extras?: Record<string, number> };

function GradeSummary({
  students,
  totalMax,
  classLabel,
  stageName,
  teacher,
  principal,
}: {
  students: { name: string; total: number }[];
  totalMax: number;
  classLabel: string;
  stageName: string;
  teacher: string;
  principal: string;
}) {
  const scores = students.map((student) => student.total);
  const percents = scores.map((score) => (totalMax > 0 ? Math.round((score / totalMax) * 100) : 0));
  const bandOf = (percent: number) => (percent >= 90 ? "ممتاز" : percent >= 80 ? "جيد جداً" : percent >= 70 ? "جيد" : percent >= 60 ? "مقبول" : "ضعيف");
  const bands = [
    { label: "ممتاز", range: "100-90", color: "#1f8a4c", count: percents.filter((value) => bandOf(value) === "ممتاز").length },
    { label: "جيد جداً", range: "89-80", color: "#2563eb", count: percents.filter((value) => bandOf(value) === "جيد جداً").length },
    { label: "جيد", range: "79-70", color: "#7c3aed", count: percents.filter((value) => bandOf(value) === "جيد").length },
    { label: "مقبول", range: "69-60", color: "#f59e0b", count: percents.filter((value) => bandOf(value) === "مقبول").length },
    { label: "ضعيف", range: "59-0", color: "#dc2626", count: percents.filter((value) => bandOf(value) === "ضعيف").length },
  ];
  const high = scores.length ? Math.max(...scores) : 0;
  const low = scores.length ? Math.min(...scores) : 0;
  const sum = scores.reduce((total, score) => total + score, 0);
  const average = scores.length ? Math.round((sum / scores.length) * 10) / 10 : 0;
  const passed = percents.filter((value) => value >= 60).length;
  const passRate = students.length ? Math.round((passed / students.length) * 1000) / 10 : 0;
  const maxBand = Math.max(1, ...bands.map((band) => band.count));
  const share = (count: number) => (students.length ? Math.round((count / students.length) * 100) : 0);
  return (
    <div className="space-y-2 text-[13px] text-black">
      <div className="mx-auto mb-3 max-w-xl border border-[#1f8a4c] px-3 py-2 text-center text-sm font-semibold">
        تحليل نتائج الفصل [{stageName ? `${stageName} - ` : ""}{classLabel} — جميع الدرجات]
      </div>
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          ["المرحلة الدراسية / الصف", `${stageName || "—"} - ${classLabel}`],
          ["السنة / الفصل الدراسي", hijriDate()],
          ["الدرجة الكلية للقياس", formatPoints(totalMax)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[#1f8a4c] px-2 py-2 text-center">
            <p className="text-[11px] text-[#1f8a4c]">{label}</p>
            <p className="font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <section className="space-y-2 rounded-xl border border-[#d7e3dc] p-2">
          <h3 className="text-center text-sm font-semibold text-[#1f8a4c]">الإحصائيات</h3>
          {[
            ["عدد الطلاب", String(students.length)],
            ["أعلى درجة", formatPoints(high)],
            ["أقل درجة", formatPoints(low)],
            ["متوسط الدرجات", formatPoints(average)],
            ["نسبة النجاح", `%${passRate}`],
            ["مجموع الدرجات", formatPoints(sum)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="flex-1 rounded-lg border border-[#d7e3dc] bg-[#f7fbf8] px-2 py-1 text-xs">{label}</span>
              <span className="w-16 rounded-lg border border-[#d7e3dc] bg-white px-2 py-1 text-center text-sm">{value}</span>
            </div>
          ))}
        </section>
        <section className="space-y-2 rounded-xl border border-[#d7e3dc] p-2">
          <h3 className="text-center text-sm font-semibold text-[#1f8a4c]">الإحصائيات التفصيلية</h3>
          <div className="grid grid-cols-[auto_1fr_auto] gap-1 text-xs">
            <span className="text-center">المستوى</span>
            <span className="text-center">النطاق</span>
            <span className="text-center">عدد الطلاب</span>
            {bands.map((band) => (
              <Fragment key={band.label}>
                <span className="rounded px-2 py-1 text-center text-white" style={{ background: band.color }}>{band.label}</span>
                <span className="rounded border px-2 py-1 text-center">{band.range}</span>
                <span className="rounded border px-2 py-1 text-center">{band.count}</span>
              </Fragment>
            ))}
          </div>
        </section>
      </div>
      <div className="my-3 flex justify-center">
        <span className="rounded-full bg-[#1f8a4c] px-4 py-1 text-sm font-semibold text-white">رسم بياني (نسب الطلاب لكل تقدير)</span>
      </div>
      <div className="flex flex-wrap items-start justify-around gap-2 rounded-xl border border-[#d7e3dc] py-3">
        {[...bands].reverse().map((band) => (
          <ShareRing key={band.label} label={band.label} value={share(band.count)} color={band.color} />
        ))}
      </div>
      <div className="my-3 flex justify-center">
        <span className="rounded-full bg-[#1f8a4c] px-4 py-1 text-sm font-semibold text-white">رسم بياني (عدد الطلاب لكل تقدير)</span>
      </div>
      <div className="flex items-end justify-around gap-2 rounded-xl border border-[#d7e3dc] px-3 pt-3 pb-2">
        {[...bands].reverse().map((band) => (
          <div key={band.label} className="flex w-16 flex-col items-center gap-1">
            <span className="text-xs font-semibold">{band.count}</span>
            <div className="w-8 rounded-t" style={{ background: band.color, height: `${Math.max(8, Math.round((band.count / maxBand) * 96))}px` }} />
            <span className="text-[11px]">{band.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-8 grid grid-cols-2 gap-6 text-center text-sm">
        <div>
          <p className="font-semibold">معلم/ة المادة</p>
          <p className="mt-2">{teacher || "………………"}</p>
        </div>
        <div>
          <p className="font-semibold">مدير/ة المدرسة</p>
          <p className="mt-2">{principal || "………………"}</p>
        </div>
      </div>
    </div>
  );
}
export function ClassRecords({
  classId,
  mergeClassIds,
  presetSubject,
  view,
  printTick,
}: {
  classId: number;
  mergeClassIds?: number[];
  presetSubject?: string;
  view: "year" | "analysis" | "attendance" | "summary" | "roster";
  printTick: number;
}) {
  const { school, staff } = useWorkspace();
  const classFollow = staffCan(staff, "viewClassFollow");
  const subjects = parseSubjects(staff.subject);
  const subject = presetSubject && subjects.includes(presetSubject) ? presetSubject : subjects[0] ?? "";
  const printRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [periodNo, setPeriodNo] = useState(1);
  const [sheetMode, setSheetMode] = useState<"period" | "exam" | "final">("period");
  const [drafts, setDrafts] = useState<Record<string, { participation: string; exam: string; extras: Record<string, string> }>>({});
  const [bulkTasks, setBulkTasks] = useState("");
  const [bulkExam, setBulkExam] = useState("");
  const [gradeShape, setGradeShape] = useState<"record" | "blank">("record");
  const [formatOpen, setFormatOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportKind, setExportKind] = useState<"xlsx" | "pdf">("xlsx");
  const [exportId, setExportId] = useState(false);
  const [newFormatName, setNewFormatName] = useState("");
  const [pullId, setPullId] = useState("");
  const [needYear, setNeedYear] = useState(60);
  const [needExam, setNeedExam] = useState(40);
  const [examLayout, setExamLayout] = useState({ row: 8, seq: 12, name: 70, col: 28 });
  const [finalLayout, setFinalLayout] = useState({ row: 8, seq: 10, name: 52, col: 16 });
  const [recordRow, setRecordRow] = useState(8);
  const [seqMm, setSeqMm] = useState(10);
  const [nameMm, setNameMm] = useState(46);
  const [colMm, setColMm] = useState(16);
  const [nameFont, setNameFont] = useState(13);
  const [bulkByCol, setBulkByCol] = useState<Record<string, string>>({});
  const [cellWarn, setCellWarn] = useState<Record<string, string>>({});
  const [blankMarks, setBlankMarks] = useState<Record<string, string>>({});
  const [finalLive, setFinalLive] = useState<Record<string, string>>({});
  const [showTeacherSign, setShowTeacherSign] = useState(true);
  const [showPrincipalSign, setShowPrincipalSign] = useState(true);
  const [sheetTitle, setSheetTitle] = useState("");
  const [sheetMargins, setSheetMargins] = useState({ top: 10, right: 10, bottom: 12, left: 8 });
  const [gradeCols, setGradeCols] = useState<ExtraCol[]>(() => GRADE_SHEET_COLUMNS.map((col) => ({ ...col })));
  const [recordCols, setRecordCols] = useState<NonNullable<PeriodPlan["columns"]> | null>(null);
  const [cardColumn, setCardColumn] = useState<Record<number, string> | null>(null);
  const [yearFormatId, setYearFormatId] = useState("");
  const formatsQuery = useQuery({
    queryKey: ["grade-studio"],
    queryFn: () => getGradeStudio(),
    enabled: view === "year",
  });
  const yearPack = formatsQuery.data as { activeFormatId?: number | null; formats?: { id: number; name: string; ownerName?: string; payload?: FormatPayload }[] } | undefined;
  const [gradeRow, setGradeRow] = useState(8);
  const sheetIds = mergeClassIds?.length ? mergeClassIds : [classId];
  const sheetQueries = useQueries({
    queries: sheetIds.map((id) => ({
      queryKey: ["class-eval", id, subject],
      queryFn: () => getClassEval({ data: { classId: id, subject: subject || undefined } }),
    })),
  });
  const pending = sheetQueries.some((item) => item.isPending);
  type SheetPart = EvalPayload & {
    openPeriod?: number | null;
    combine?: "sum" | "avg";
    periods?: PeriodPlan[];
    students: (EvalStudent & { classId?: number; byPeriod?: PeriodScore[]; yearWork?: number; sheetExam?: number; finalTotal?: number; finalExtras?: Record<string, number> })[];
  };
  const parts = sheetIds.flatMap((id, index) => {
    const part = sheetQueries[index]?.data as SheetPart | undefined;
    return part ? [{ id, part }] : [];
  });
  const first = parts[0]?.part;
  const data = first ? {
    ...first,
    class: sheetIds.length > 1 ? { label: first.class.stageName || first.class.label, stageName: first.class.stageName } : first.class,
    students: parts.flatMap(({ id, part }) => part.students.map((student) => ({ ...student, classId: id }))),
  } : undefined;
  const finalColumns = (data as { finalColumns?: { id: string; title: string; max: number }[] } | undefined)?.finalColumns ?? [];
  const periods = data?.periods ?? [];
  const selected = periods.find((period) => period.no === periodNo) ?? periods[0];
  const firstColumns = (periods.find((period) => period.no === 1) ?? periods[0])?.columns ?? [];
  const liveColumns = recordCols ?? (sheetMode === "period" ? firstColumns : (selected?.columns ?? firstColumns));
  function acceptGrade(raw: string, max: number, id: string) {
    const next = withinMax(raw, max);
    setCellWarn((prev) => {
      const copy = { ...prev };
      if (next === null && raw.trim()) copy[id] = `أعلى من ${formatPoints(max)}`;
      else delete copy[id];
      return copy;
    });
    return next;
  }
  const periodReady = useRef(false);
  useEffect(() => {
    if (periodReady.current || !data?.openPeriod) return;
    periodReady.current = true;
    setPeriodNo(data.openPeriod);
  }, [data?.openPeriod]);
  useEffect(() => {
    setRecordCols(null);
  }, [periodNo]);
  useEffect(() => {
    setFormatOpen(false);
  }, [sheetMode]);
  useEffect(() => {
    const active = yearPack?.activeFormatId;
    if (!active) return;
    const item = (yearPack?.formats ?? []).find((row) => row.id === active);
    if (!item?.payload) return;
    setYearFormatId(String(active));
    const sheet = item.payload.sheet === "blank" ? "blank" : "record";
    setGradeShape(sheet);
    if (sheet === "blank" && item.payload.gradeCols?.length) setGradeCols(item.payload.gradeCols.map((col) => ({ ...col })));
  }, [yearPack?.activeFormatId]);
  useEffect(() => {
    if (!data?.class) return;
    const year = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { year: "numeric" }).format(new Date());
    const saved = localStorage.getItem(`grade-title:${classId}:${subject}`);
    setSheetTitle(saved || `كشف أعمال السنة لمادة ${data.subject || "…"} للفصل ${data.class.label} الفصل الدراسي الأول للعام ${year}`);
    const raw = localStorage.getItem(`grade-margins:${classId}:${subject}`);
    if (raw) {
      try { setSheetMargins(JSON.parse(raw)); } catch { /* keep school margins */ }
    } else if (school.printMargins) setSheetMargins(school.printMargins);
    const savedSeq = Number(localStorage.getItem(`grade-seq:${classId}`));
    const savedName = Number(localStorage.getItem(`grade-name:${classId}`));
    if (savedSeq) setSeqMm(Math.min(30, Math.max(6, savedSeq)));
    if (savedName) setNameMm(Math.min(80, Math.max(24, savedName)));
    try {
      const layout = JSON.parse(localStorage.getItem(`grade-final-layout:${subject}`) || "");
      if (layout && typeof layout === "object") {
        if (layout.pullId) setPullId(String(layout.pullId));
        if (Number(layout.needYear) > 0) setNeedYear(Math.min(100, Number(layout.needYear)));
        if (Number(layout.needExam) > 0) setNeedExam(Math.min(100, Number(layout.needExam)));
      }
    } catch { /* keep the default ceilings */ }
    try {
      const examSaved = JSON.parse(localStorage.getItem(`grade-page:${subject}:exam`) || "");
      if (examSaved?.row) setExamLayout(examSaved);
      const finalSaved = JSON.parse(localStorage.getItem(`grade-page:${subject}:final`) || "");
      if (finalSaved?.row) setFinalLayout(finalSaved);
    } catch { /* keep default page sizes */ }
    const marks: Record<string, string> = {};
    const names = Array.from(new Set(["", "-", ...subjects, subject, data.subject || ""].filter((item) => item != null)));
    for (const id of sheetIds) {
      for (const name of names) {
        try {
          const savedMarks = localStorage.getItem(`grade-marks:${id}:${name}`);
          if (savedMarks) Object.assign(marks, JSON.parse(savedMarks));
        } catch { /* keep empty */ }
      }
      try {
        const savedMarks = localStorage.getItem(`grade-marks:${id}:${subject || data.subject || "-"}`);
        if (savedMarks) Object.assign(marks, JSON.parse(savedMarks));
      } catch { /* keep the merged marks */ }
    }
    setBlankMarks(marks);
    try {
      const savedCols = localStorage.getItem(`grade-cols:${classId}:${subject || "-"}`);
      if (savedCols) {
        const parsed = JSON.parse(savedCols);
        if (Array.isArray(parsed) && parsed.length) setGradeCols(parsed);
      }
    } catch { /* keep defaults */ }
    setShowTeacherSign(localStorage.getItem(`grade-sign-teacher:${classId}`) !== "0");
    setShowPrincipalSign(localStorage.getItem(`grade-sign-principal:${classId}`) !== "0");
  }, [classId, subject, data?.class?.label, data?.subject, sheetIds.join(",")]);
  const colsReady = useRef(false);
  useEffect(() => {
    if (!colsReady.current) {
      colsReady.current = true;
      return;
    }
    localStorage.setItem(`grade-cols:${classId}:${subject || "-"}`, JSON.stringify(gradeCols));
  }, [gradeCols, classId, subject]);
  const seenPrint = useRef(0);
  useEffect(() => {
    if (!printTick || printTick === seenPrint.current || pending || !printRef.current) return;
    seenPrint.current = printTick;
    printElement(printRef.current);
  }, [printTick, pending, data]);
  const closePeriod = useMutation({
    mutationFn: (closed: boolean) => setPeriodClosed({ data: { no: selected?.no ?? 1, closed, subject: subject || undefined } }),
    onSuccess: () => {
      const closing = selected ? !selected.closed : true;
      if (closing && selected) {
        const next = periods.find((period) => period.no > selected.no) ?? periods.find((period) => period.no !== selected.no);
        if (next) setPeriodNo(next.no);
      }
      void queryClient.invalidateQueries({ queryKey: ["class-eval", classId] });
      toast.success(tr("تم تحديث الفترة"));
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر تحديث الفترة")),
  });
  const save = useMutation({
    mutationFn: (payload: { studentId: number; classId?: number; participation: number; exam: number; extras?: Record<string, number> }) =>
      savePeriodMark({
        data: {
          studentId: payload.studentId,
          participation: payload.participation,
          exam: payload.exam,
          extras: payload.extras,
          classId: payload.classId || classId,
          periodNo: selected?.no ?? 1,
          subject: data?.subject || subject || undefined,
        },
      }),
    onSuccess: () => undefined,
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر حفظ الدرجة")),
  });
  const savePlan = useMutation({
    mutationFn: (next: { periods: PeriodPlan[]; combine: "sum" | "avg" }) =>
      saveSubjectPlan({
        data: {
          subject: subject || data?.subject || undefined,
          combine: next.combine,
          periods: next.periods.map((period) => ({
            title: period.title,
            tasksMax: period.tasksMax,
            examMax: period.examMax,
            closed: period.closed,
            columns: period.columns ?? [],
          })),
        },
      }),
    onSuccess: () => {
      toast.success(tr("حُفظ شكل الكشف"));
      void queryClient.invalidateQueries({ queryKey: ["class-eval", classId] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر حفظ الكشف")),
  });
  const applyAll = useMutation({
    mutationFn: async (which: "tasks" | "periodExam" | "finalExam") => {
      if (!data) throw new Error("تعذر تحميل الكشف");
      if (which !== "finalExam" && (!selected || selected.closed)) throw new Error("الفترة مغلقة");
      const raw = which === "tasks" ? bulkTasks : bulkExam;
      const value = Number(raw);
      if (raw.trim() === "" || Number.isNaN(value)) throw new Error("اكتب الدرجة أولاً");
      for (const student of data.students) {
        const score = student.byPeriod?.find((period) => period.no === selected?.no);
        const extras = which === "finalExam" ? { ...(student.finalExtras ?? {}) } : { ...(score?.extras ?? {}) };
        if (which === "finalExam") {
          const caps = (data as { finalColumns?: { id: string; title: string; max: number }[] }).finalColumns ?? [];
          const limit = Number((data.scale as { finalExamMax?: number }).finalExamMax) || 40;
          if (caps.length) {
            if (caps.length * value > limit) throw new Error(`مجموع أجزاء الاختبار أعلى من ${limit}`);
            for (const column of caps) {
              if (Number(column.max) > 0 && value > Number(column.max)) throw new Error(`الدرجة أعلى من حد ${column.title} (${column.max})`);
              extras[column.id] = value;
            }
          } else if (value > limit) throw new Error(`الحد الأعلى للاختبار النهائي هو ${limit}`);
        }
        if (which === "tasks") {
          const taskColumns = (liveColumns).filter((column) => (column.group ?? "eval") === "tasks");
          if (taskColumns.length) {
            const sum = taskColumns.length * value;
            if ((selected?.tasksMax ?? 0) > 0 && sum > (selected?.tasksMax ?? 0)) throw new Error(`مجموع الأعمدة أعلى من أعمال السنة (${selected?.tasksMax})`);
            for (const column of taskColumns) {
              const cap = Number(column.max) || 0;
              if (cap > 0 && value > cap) throw new Error(`الدرجة أعلى من حد ${column.title} (${cap})`);
              extras[column.id] = value;
            }
          } else if ((selected?.tasksMax ?? 0) > 0 && value > (selected?.tasksMax ?? 0)) {
            throw new Error(`الحد الأعلى لأعمال السنة هو ${selected?.tasksMax}`);
          }
        }
        if (which === "periodExam") {
          const examColumns = (liveColumns).filter((column) => column.group === "exam");
          if (examColumns.length) {
            const sum = examColumns.length * value;
            if ((selected?.examMax ?? 0) > 0 && sum > (selected?.examMax ?? 0)) throw new Error(`مجموع أعمدة الاختبار أعلى من حد الفترة (${selected?.examMax})`);
            for (const column of examColumns) {
              const cap = Number(column.max) || 0;
              if (cap > 0 && value > cap) throw new Error(`الدرجة أعلى من حد ${column.title} (${cap})`);
              extras[column.id] = value;
            }
          } else if ((selected?.examMax ?? 0) > 0 && value > (selected?.examMax ?? 0)) {
            throw new Error(`الحد الأعلى لاختبار الفترة هو ${selected?.examMax}`);
          }
        }
        await savePeriodMark({
          data: {
            classId: student.classId || classId,
            periodNo: which === "finalExam" ? 0 : (selected?.no ?? 1),
            subject: data.subject || subject || undefined,
            studentId: student.id,
            participation: which === "tasks" ? value : score?.participation ?? 0,
            exam: which === "tasks" ? score?.exam ?? 0 : value,
            extras,
          },
        });
      }
    },
    onSuccess: () => {
      if (selected) {
        setDrafts((prev) => {
          const next = { ...prev };
          for (const student of data?.students ?? []) delete next[`${student.id}:${selected.no}`];
          return next;
        });
      }
      toast.success(tr("وُزعت الدرجة على كل الطلاب"));
      void queryClient.invalidateQueries({ queryKey: ["class-eval"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر توزيع الدرجة")),
  });
  async function importGradeFile(file: File) {
    if (!data) throw new Error("تعذر تحميل الكشف");
    if (sheetMode === "period" && selected?.closed) throw new Error("الفترة مغلقة");
    const XLSX = await import("xlsx");
    const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = book.Sheets[book.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: "" });
    if (!matrix.length) throw new Error("الملف فارغ");
    const header = matrix[0].map((cell) => String(cell).trim());
    const idAt = header.findIndex((cell) => /سجل|هوي|مدني/.test(cell));
    const tasksAt = header.findIndex((cell) => /أعمال السنة|اعمال السنة|مشارك/.test(cell) && !/متوسط/.test(cell));
    const periodExamAt = header.findIndex((cell) => /اختبار الفترة/.test(cell));
    const finalExamAt = header.findIndex((cell) => /نهاية السنة|الاختبار النهائي|اختبار نهاية/.test(cell));
    const gradeAt = header.findIndex((cell) => cell === "الدرجة" || (/درج/.test(cell) && !/أعمال|اعمال|متوسط|نهاية/.test(cell)));
    const idCol = idAt >= 0 ? idAt : 0;
    const start = header.some((cell) => /سجل|اسم|درج/.test(cell)) ? 1 : 0;
    let applied = 0;
    let missed = 0;
    for (const line of matrix.slice(start)) {
      const record = String(line[idCol] ?? "").replace(/\D/g, "");
      if (!record) continue;
      const student = data.students.find((item) => String(item.nationalId || "").replace(/\D/g, "") === record);
      if (!student) { missed += 1; continue; }
      const numberAt = (index: number) => {
        if (index < 0) return null;
        const value = Number(String(line[index] ?? "").replace(",", "."));
        return Number.isNaN(value) ? null : value;
      };
      if (sheetMode === "period" && selected) {
        const score = student.byPeriod?.find((period) => period.no === selected.no);
        const tasks = numberAt(tasksAt);
        const exam = numberAt(periodExamAt);
        const grade = numberAt(gradeAt);
        if (tasks == null && exam == null && grade == null) continue;
        await savePeriodMark({
          data: {
            classId: student.classId || classId,
            periodNo: selected.no,
            subject: subject || undefined,
            studentId: student.id,
            participation: tasks ?? grade ?? score?.participation ?? 0,
            exam: exam ?? score?.exam ?? 0,
            extras: score?.extras ?? {},
          },
        });
      } else if (sheetMode === "final") {
        const exam = numberAt(finalExamAt);
        if (exam == null) continue;
        await savePeriodMark({
          data: { classId: student.classId || classId, periodNo: 0, subject: subject || undefined, studentId: student.id, participation: 0, exam },
        });
      } else {
        const exam = numberAt(finalExamAt) ?? numberAt(gradeAt);
        if (exam == null) continue;
        await savePeriodMark({
          data: { classId: student.classId || classId, periodNo: 0, subject: subject || undefined, studentId: student.id, participation: 0, exam },
        });
      }
      applied += 1;
    }
    if (!applied) throw new Error(missed ? "لم يُطابق السجل أي طالب" : "لا درجات في الملف");
    toast.success(missed ? `حُمّلت ${applied} درجة، ولم يُطابق ${missed}` : `تم استيراد ${applied} درجة`);
    void queryClient.invalidateQueries({ queryKey: ["class-eval", classId] });
  }
  if (pending && !data) return <p className="text-sm text-fg-muted">{tr("جارٍ التحميل…")}</p>;
  if (!data) return <p className="text-danger">{tr("تعذر تحميل الكشف")}</p>;
  function sheetMatrix(withId: boolean) {
    const students = data?.students ?? [];
    const idCell = (student: { nationalId?: string }) => withId ? [student.nationalId || ""] : [];
    if (gradeShape === "blank") {
      const heads = ["م", "اسم الطالب", ...(withId ? ["السجل المدني"] : []), ...gradeCols.map((col) => col.title || "عمود")];
      const rows = students.map((student, index) => {
        const values = Object.fromEntries(gradeCols.map((item) => [item.id, readBlank(student.id, item.id)]));
        return [
          String(index + 1),
          student.name,
          ...idCell(student),
          ...gradeCols.map((col) => isCalcColumn(col) || isSumColumn(col) ? String(sheetGrade(columnMath(col, gradeCols, values))) : (readBlank(student.id, col.id) || "0")),
        ];
      });
      return { heads, rows };
    }
    if (sheetMode === "exam") {
      return {
        heads: ["م", "اسم الطالب", ...(withId ? ["السجل المدني"] : []), "الدرجة"],
        rows: students.map((student, index) => [String(index + 1), student.name, ...idCell(student), String(student.sheetExam ?? 0)]),
      };
    }
    if (sheetMode === "final") {
      return {
        heads: ["م", "اسم الطالب", ...(withId ? ["السجل المدني"] : []), "متوسط أعمال السنة", "اختبار نهاية السنة", "الدرجة"],
        rows: students.map((student, index) => [String(index + 1), student.name, ...idCell(student), String(student.yearWork ?? 0), String(student.sheetExam ?? 0), String(student.finalTotal ?? ((student.yearWork ?? 0) + (student.sheetExam ?? 0)))]),
      };
    }
    const heads = ["م", "اسم الطالب", ...(withId ? ["السجل المدني"] : [])];
    if (taskColumns.length) {
      heads.push(...taskColumns.map((column) => column.title), "مجموع المشاركة");
    } else heads.push("أعمال السنة");
    if (examColumns.length) {
      heads.push(...examColumns.map((column) => column.title), "اختبار الفترة");
    } else heads.push("اختبار الفترة");
    heads.push(...evalColumns.map((column) => column.title), "مجموع الفترة");
    const rows = students.map((student, index) => {
      const score = student.byPeriod?.find((period) => period.no === selected?.no);
      const extras = score?.extras ?? {};
      const taskSum = taskColumns.length ? taskColumns.filter((column) => column.calc !== "sum" && column.calc !== "avg").reduce((sum, column) => sum + (Number(extras[column.id]) || 0), 0) : Number(score?.participation) || 0;
      const examSum = examColumns.length ? examColumns.filter((column) => column.calc !== "sum" && column.calc !== "avg").reduce((sum, column) => sum + (Number(extras[column.id]) || 0), 0) : Number(score?.exam) || 0;
      const cells = [String(index + 1), student.name, ...idCell(student)];
      if (taskColumns.length) cells.push(...taskColumns.map((column) => column.calc === "sum" || column.calc === "avg" || column.calc === "cards" ? String(sheetGrade(columnMath(column, liveColumns, extras))) : String(extras[column.id] ?? 0)), String(sheetGrade(taskSum)));
      else cells.push(String(score?.participation ?? 0));
      if (examColumns.length) cells.push(...examColumns.map((column) => column.calc === "sum" || column.calc === "avg" || column.calc === "cards" ? String(sheetGrade(columnMath(column, liveColumns, extras))) : String(extras[column.id] ?? 0)), String(sheetGrade(examSum)));
      else cells.push(String(score?.exam ?? 0));
      cells.push(...evalColumns.map((column) => column.calc === "sum" || column.calc === "avg" || column.calc === "cards" ? String(sheetGrade(columnMath(column, liveColumns, extras))) : String(extras[column.id] ?? 0)), String(score?.total ?? taskSum + examSum));
      return cells;
    });
    return { heads, rows };
  }
  function currentFormatPayload(): FormatPayload {
    return {
      sheet: gradeShape,
      combine: data.combine === "avg" ? "avg" : "sum",
      finalExamMax: Number((data.scale as { finalExamMax?: number }).finalExamMax) || 40,
      finalColumns: ((data as { finalColumns?: { id: string; title: string; max: number }[] }).finalColumns ?? []).map((column) => ({ ...column })),
      cards: [],
      gradeCols: gradeCols.map((col) => ({ ...col })),
      periods: periods.map((period) => ({
        title: period.title,
        tasksMax: period.tasksMax,
        examMax: period.examMax,
        columns: liveColumns.map((column) => ({
          id: column.id,
          title: column.title,
          group: column.group === "exam" || column.group === "tasks" ? column.group : "eval" as const,
          max: Number(column.max) || 0,
          calc: column.calc === "sum" || column.calc === "avg" || column.calc === "cards" ? column.calc : undefined,
          sources: column.sources,
        })),
      })),
    };
  }
  async function exportGrades(kind: "xlsx" | "pdf", withId = exportId) {
    const { heads, rows } = sheetMatrix(withId);
    const title = sheetTitle || (selected?.title || "كشف الدرجات");
    if (kind === "xlsx") {
      const XLSX = await import("xlsx");
      const book = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet([[title], heads, ...rows]);
      sheet["!cols"] = heads.map((head, index) => ({ wch: index === 1 ? 28 : head === "السجل المدني" ? 16 : 14 }));
      XLSX.utils.book_append_sheet(book, sheet, "الدرجات");
      XLSX.writeFile(book, `${title}.xlsx`);
      return;
    }
    const holder = document.createElement("div");
    holder.innerHTML = `<h2 style="text-align:center;font-size:16px;margin:0 0 8px">${title}</h2><table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px"><thead><tr>${heads.map((head) => `<th style="border:1px solid #000;padding:4px;background:#9aa0a6;color:#fff">${head}</th>`).join("")}</tr></thead><tbody>${rows.map((row, index) => `<tr style="height:${gradeShape === "blank" ? gradeRow : recordRow}mm;background:${index % 2 ? "#f3f4f6" : "#fff"}">${row.map((cell, cellIndex) => `<td style="border:1px solid #000;padding:3px;text-align:${cellIndex === 1 ? "right" : "center"};font-weight:${cellIndex === 1 ? "700" : "400"}">${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    printElement(holder);
  }
  async function applyRecordColumn(col: { id: string; title: string; max: number; kind: "participation" | "exam" | "extra" }) {
    if (!data || !selected || selected.closed) return;
    const raw = bulkByCol[col.id] ?? "";
    const next = acceptGrade(raw, col.max, `bulk:${col.id}`);
    if (next === null || next === "") {
      if (next === "") toast.error(tr("اكتب الدرجة أولاً"));
      return;
    }
    const value = Number(next) || 0;
    const written: typeof drafts = {};
    const jobs: { studentId: number; classId?: number; participation: number; exam: number; extras: Record<string, number> }[] = [];
    for (const student of data.students) {
      const score = student.byPeriod?.find((period) => period.no === selected.no);
      const key = `${student.id}:${selected.no}`;
      const current = drafts[key] ?? {
        participation: String(score?.participation ?? 0),
        exam: String(score?.exam ?? 0),
        extras: Object.fromEntries(liveColumns.map((column) => [column.id, String(score?.extras?.[column.id] ?? 0)])),
      };
      const updated = {
        participation: col.kind === "participation" ? next : current.participation,
        exam: col.kind === "exam" ? next : current.exam,
        extras: { ...current.extras, ...(col.kind === "extra" ? { [col.id]: next } : {}) },
      };
      written[key] = updated;
      jobs.push({
        studentId: student.id,
        classId: student.classId,
        participation: Number(updated.participation) || 0,
        exam: Number(updated.exam) || 0,
        extras: Object.fromEntries(Object.entries(updated.extras).map(([id, item]) => [id, Number(item) || 0])),
      });
    }
    setDrafts((prev) => ({ ...prev, ...written }));
    const results = await Promise.all(jobs.map((job) => savePeriodMark({
      data: {
        classId: job.classId || classId,
        periodNo: selected.no,
        subject: data.subject || subject || undefined,
        studentId: job.studentId,
        participation: job.participation,
        exam: job.exam,
        extras: job.extras,
      },
    }).then(() => true).catch(() => false)));
    const failed = results.filter((ok) => !ok).length;
    if (failed) toast.error(tr(`تعذر حفظ ${failed} طالب`));
    else toast.success(tr("وُزعت الدرجة على كل الطلاب وحُفظت"));
    void queryClient.invalidateQueries({ queryKey: ["class-eval"] });
  }
  function marksStorageKey(id: number) {
    return `grade-marks:${id}:${subject || data?.subject || "-"}`;
  }
  function blankKey(studentId: number, colId: string, no = periodNo) {
    return `${studentId}:p${no}:${colId}`;
  }
  function readBlank(studentId: number, colId: string, no = periodNo) {
    const key = blankKey(studentId, colId, no);
    if (Object.prototype.hasOwnProperty.call(blankMarks, key)) return blankMarks[key] ?? "";
    if (no === 1) return blankMarks[`${studentId}:${colId}`] ?? "";
    return "";
  }
  function yearWorkOf(student: { id: number; yearWork?: number; byPeriod?: { total?: number }[] }) {
    if (gradeShape === "blank") {
      const totals = (periods.length ? periods : [{ no: 1 }]).map((period) => gradeCols
        .filter((col) => !isCalcColumn(col) && !isSumColumn(col))
        .reduce((sum, col) => sum + (Number(readBlank(student.id, col.id, period.no)) || 0), 0));
      const sum = totals.reduce((total, value) => total + value, 0);
      return data.combine === "sum" ? sum : (totals.length ? sum / totals.length : 0);
    }
    const totals = (periods.length ? periods : [{ no: 1 }]).map((period) => periodScoreOf(student, period.no));
    const sum = totals.reduce((total, value) => total + value, 0);
    return data.combine === "sum" ? sum : (totals.length ? sum / totals.length : 0);
  }
  function periodScoreOf(student: { id: number; byPeriod?: PeriodScore[] }, no: number) {
    const period = periods.find((item) => item.no === no);
    const row = student.byPeriod?.find((item) => item.no === no);
    const columns = (period?.columns?.length ? period.columns : firstColumns) ?? [];
    const draft = drafts[`${student.id}:${no}`];
    const extras: Record<string, number> = {};
    if (draft) {
      for (const [id, value] of Object.entries(draft.extras)) extras[id] = Number(value) || 0;
    } else if (row?.extras) Object.assign(extras, row.extras);
    const manual = columns.filter((column) => column.calc !== "sum" && column.calc !== "avg");
    const cap = (value: number, max: number) => (max > 0 ? Math.min(value, max) : value);
    if (!manual.length) return cap((Number(draft?.participation ?? row?.participation) || 0) + (Number(draft?.exam ?? row?.exam) || 0), (period?.tasksMax ?? 0) + (period?.examMax ?? 0));
    const tasks = manual.filter((column) => (column.group ?? "eval") === "tasks");
    const exams = manual.filter((column) => column.group === "exam");
    const evals = manual.filter((column) => column.group === "eval");
    const taskScore = tasks.length ? cap(tasks.reduce((sum, column) => sum + cap(extras[column.id] || 0, Number(column.max) || 0), 0), period?.tasksMax ?? 0) : (Number(draft?.participation ?? row?.participation) || 0);
    const examScore = exams.length ? cap(exams.reduce((sum, column) => sum + cap(extras[column.id] || 0, Number(column.max) || 0), 0), period?.examMax ?? 0) : (Number(draft?.exam ?? row?.exam) || 0);
    const evalScore = evals.reduce((sum, column) => sum + cap(extras[column.id] || 0, Number(column.max) || 0), 0);
    return taskScore + examScore + evalScore;
  }
  function pulledCols() {
    if (gradeShape === "blank") return gradeCols;
    return null;
  }
  function periodFigure(student: { id: number; byPeriod?: { no?: number; total?: number }[] }, no: number) {
    const cols = pulledCols()?.filter((col) => !isCalcColumn(col) && !isSumColumn(col)) ?? null;
    const period = periods.find((item) => item.no === no);
    if (cols?.length) {
      const score = cols.reduce((sum, col) => sum + (Number(readBlank(student.id, col.id, no)) || 0), 0);
      const max = cols.reduce((sum, col) => sum + (Number(col.max) || 0), 0);
      return { score, max: max || ((period?.tasksMax ?? 0) + (period?.examMax ?? 0)) };
    }
    const row = student.byPeriod?.find((item) => item.no === no);
    return { score: periodScoreOf(student, no), max: (period?.tasksMax ?? 0) + (period?.examMax ?? 0) || Number(row?.total) || 0 };
  }
  function periodRatio(student: { id: number; byPeriod?: { no?: number; total?: number }[] }) {
    const rows = (periods.length ? periods : [{ no: 1 }]).map((period) => periodFigure(student, period.no));
    const usable = rows.filter((row) => row.max > 0);
    if (!usable.length) return 0;
    return usable.reduce((sum, row) => sum + Math.min(1, row.score / row.max), 0) / usable.length;
  }
  function equatedMark(student: { id: number; byPeriod?: { no?: number; total?: number }[] }, target: number) {
    return Math.min(target, Math.max(0, periodRatio(student) * target));
  }
  function enteredExam(student: { id: number; sheetExam?: number }) {
    const typed = finalLive[String(student.id)];
    const raw = typed != null && typed !== "" ? Number(typed) || 0 : Number(student.sheetExam) || 0;
    return Math.min(needExam, Math.max(0, raw));
  }
  function storeBlank(marks: Record<string, string>) {
    const ids = sheetIds.length ? sheetIds : [classId];
    for (const id of ids) {
      let prev: Record<string, string> = {};
      try { prev = JSON.parse(localStorage.getItem(marksStorageKey(id)) || "{}"); } catch { prev = {}; }
      const slice = { ...prev };
      for (const student of data?.students ?? []) {
        if (Number(student.classId || classId) !== Number(id)) continue;
        for (const col of gradeCols) {
          const key = blankKey(student.id, col.id);
          const legacy = `${student.id}:${col.id}`;
          if (marks[key] == null || marks[key] === "") {
            delete slice[key];
            if (periodNo === 1) delete slice[legacy];
          } else {
            slice[key] = marks[key];
            if (periodNo === 1) slice[legacy] = marks[key];
          }
        }
      }
      localStorage.setItem(marksStorageKey(id), JSON.stringify(slice));
    }
  }
  function applyBlankColumn(col: ExtraCol) {
    if (!data) return;
    const raw = bulkByCol[col.id] ?? "";
    const next = acceptGrade(raw, Number(col.max) || 0, `bulk:${col.id}`);
    if (next === null || next === "") {
      if (next === "") toast.error(tr("اكتب الدرجة أولاً"));
      return;
    }
    setBlankMarks((prev) => {
      const marks = { ...prev };
      for (const student of data.students) marks[blankKey(student.id, col.id)] = next;
      storeBlank(marks);
      return marks;
    });
    toast.success(tr("وُزعت الدرجة على كل الطلاب"));
  }
  const title = view === "year" ? "كشف أعمال السنة" : view === "analysis" ? "تحليل النتائج" : "تقرير الحضور";
  const taskColumns = liveColumns.filter((column) => (column.group ?? "eval") === "tasks");
  const examColumns = liveColumns.filter((column) => column.group === "exam");
  const evalColumns = liveColumns.filter((column) => column.group === "eval");
  const gradeSlots = (taskColumns.length || 1) + (taskColumns.length ? 1 : 0) + (examColumns.length || 1) + (examColumns.length ? 1 : 0) + evalColumns.length + 1;
  const widthTotal = seqMm + nameMm + gradeSlots * colMm;
  const colPct = (mm: number) => `${Math.round((mm / Math.max(widthTotal, 1)) * 1000) / 10}%`;
  const blankSum = seqMm + nameMm + gradeCols.reduce((sum, col) => sum + (Number(col.width) || 18), 0);
  const blankPct = (mm: number) => `${Math.round((mm / Math.max(blankSum, 1)) * 1000) / 10}%`;
  return (
    <div className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-card p-3">
      {view === "year" && periods.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="h-10 w-auto min-w-44 font-semibold"
            value={sheetMode === "period" ? String(selected?.no ?? 1) : sheetMode}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "exam" || value === "final") setSheetMode(value);
              else { setSheetMode("period"); setPeriodNo(Number(value)); }
            }}
          >
            {periods.map((period) => (
              <option key={period.no} value={period.no}>
                {period.title}{period.closed ? ` · ${tr("مغلقة")}` : ""}
              </option>
            ))}
            <option value="exam">{tr("اختبار نهاية السنة")}</option>
            <option value="final">{tr("النتيجة النهائية")}</option>
          </Select>
          {sheetMode === "period" && selected ? (
            <Button type="button" size="sm" variant="secondary" disabled={closePeriod.isPending} onClick={() => closePeriod.mutate(!selected.closed)}>
              {selected.closed ? tr("إعادة فتح") : tr("إغلاق")}
            </Button>
          ) : null}
          {periods.length < 4 ? (
            <Button type="button" size="sm" variant="secondary" disabled={savePlan.isPending} onClick={() => {
              const titles = ["الفترة الأولى", "الفترة الثانية", "الفترة الثالثة", "الفترة الرابعة"];
              const last = periods[periods.length - 1];
              savePlan.mutate({
                combine: data?.combine === "avg" ? "avg" : "sum",
                periods: [...periods.map((period) => ({ no: period.no, title: period.title, tasksMax: period.tasksMax, examMax: period.examMax, closed: period.closed, columns: liveColumns })), { no: periods.length + 1, title: titles[periods.length] || "فترة", tasksMax: last?.tasksMax ?? 20, examMax: last?.examMax ?? 0, closed: false, columns: liveColumns }],
              });
            }}>{tr("إضافة فترة")}</Button>
          ) : null}
          <button type="button" className="min-h-8 rounded-full border border-amber-600 bg-amber-500 px-3 text-sm font-semibold text-white" onClick={() => setFormatOpen((open) => !open)}>{tr("تنسيق")}</button>
          <Button type="button" size="sm" variant="secondary" onClick={() => printRef.current && printElement(printRef.current)}>{tr("طباعة")}</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setExportOpen((open) => !open)}>{tr("تصدير")}</Button>
        </div>
      ) : null}
      {view === "year" && exportOpen ? (
        <div className="no-print flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] border border-border bg-card p-3">
          <label className="space-y-1 text-sm">
            <span>{tr("نوع التصدير")}</span>
            <Select className="h-9 w-auto" value={exportKind} onChange={(event) => setExportKind(event.target.value === "pdf" ? "pdf" : "xlsx")}>
              <option value="xlsx">{tr("إكسل")}</option>
              <option value="pdf">{tr("PDF")}</option>
            </Select>
          </label>
          <label className="inline-flex items-center gap-1 text-sm">
            <input type="checkbox" checked={exportId} onChange={(event) => setExportId(event.target.checked)} />
            {tr("إضافة السجل المدني")}
          </label>
          <Button type="button" size="sm" onClick={() => { void exportGrades(exportKind, exportId); setExportOpen(false); }}>{tr("تصدير")}</Button>
        </div>
      ) : null}
      {view === "year" && gradeShape === "blank" && sheetMode === "period" ? (
        <div className="grade-bulk no-print flex flex-wrap items-end gap-2 rounded-[var(--radius-md)] border border-border bg-bg p-3">
          {gradeCols.filter((col) => !isSumColumn(col) && col.calc !== "avg").map((col) => (
            <label key={col.id} className="space-y-1 text-sm">
              <span>{col.title || tr("عمود")} {tr("للكل")}</span>
              <span className="flex items-center gap-1">
                <Input className="w-20" inputMode="decimal" value={bulkByCol[col.id] ?? ""} placeholder={col.max ? String(col.max) : tr("الدرجة")} onChange={(event) => setBulkByCol((prev) => ({ ...prev, [col.id]: event.target.value }))} />
                <Button type="button" size="sm" onClick={() => applyBlankColumn(col)}>{tr("للكل")}</Button>
              </span>
              {cellWarn[`bulk:${col.id}`] ? <span className="grade-warn">{cellWarn[`bulk:${col.id}`]}</span> : null}
            </label>
          ))}
        </div>
      ) : null}
      {view === "year" && gradeShape !== "blank" && sheetMode === "period" && selected && !selected.closed ? (
        <div className="grade-bulk no-print flex flex-wrap items-end gap-2 rounded-[var(--radius-md)] border border-border bg-bg p-3">
          {(taskColumns.filter((column) => column.calc !== "sum" && column.calc !== "avg").length ? taskColumns.filter((column) => column.calc !== "sum" && column.calc !== "avg").map((column) => ({ id: column.id, title: column.title, max: Number(column.max) || selected.tasksMax, kind: "extra" as const })) : [{ id: "tasks", title: tr("أعمال السنة"), max: selected.tasksMax, kind: "participation" as const }]).concat(examColumns.filter((column) => column.calc !== "sum" && column.calc !== "avg").length ? examColumns.filter((column) => column.calc !== "sum" && column.calc !== "avg").map((column) => ({ id: column.id, title: column.title, max: Number(column.max) || selected.examMax, kind: "extra" as const })) : [{ id: "exam", title: tr("اختبار الفترة"), max: selected.examMax, kind: "exam" as const }]).map((col) => (
            <label key={col.id} className="space-y-1 text-sm">
              <span>{col.title} {tr("للكل")}</span>
              <span className="flex items-center gap-1">
                <Input className="w-20" inputMode="decimal" value={bulkByCol[col.id] ?? ""} placeholder={col.max ? String(col.max) : tr("الدرجة")} onChange={(event) => setBulkByCol((prev) => ({ ...prev, [col.id]: event.target.value }))} />
                <Button type="button" size="sm" disabled={applyAll.isPending} onClick={() => void applyRecordColumn(col).catch((err) => toast.error(err instanceof Error ? err.message : tr("تعذر توزيع الدرجة")))}>{tr("للكل")}</Button>
              </span>
              {cellWarn[`bulk:${col.id}`] ? <span className="grade-warn">{cellWarn[`bulk:${col.id}`]}</span> : null}
            </label>
          ))}
        </div>
      ) : null}
      {view === "year" && (sheetMode === "exam" || sheetMode === "final") ? (
        <div className="no-print flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] border border-border bg-card p-3">
          <p className="basis-full text-sm font-semibold">{sheetMode === "exam" ? tr("كشف الاختبار النهائي") : tr("النتيجة النهائية")}</p>
          <label className="space-y-1 text-sm">
            <span>{tr("سقف أعمال السنة")}</span>
            <Input className="w-20" inputMode="decimal" value={needYear} onChange={(event) => setNeedYear(Math.min(100, Math.max(1, Number(event.target.value) || 60)))} />
          </label>
          <label className="space-y-1 text-sm">
            <span>{tr("سقف الاختبار")}</span>
            <Input className="w-20" inputMode="decimal" value={needExam} onChange={(event) => setNeedExam(Math.min(100, Math.max(1, Number(event.target.value) || 40)))} />
          </label>
          {sheetMode === "exam" ? (
            <label className="space-y-1 text-sm">
              <span>{tr("درجة الاختبار للكل")}</span>
              <span className="flex items-center gap-1">
                <Input className="w-20" inputMode="decimal" value={bulkExam} placeholder={String(needExam)} onChange={(event) => setBulkExam(event.target.value)} />
                <Button type="button" size="sm" onClick={() => {
                  const next = withinMax(bulkExam, needExam);
                  if (next === null || next === "") {
                    toast.error(next === "" ? tr("اكتب الدرجة أولاً") : tr(`أعلى من ${formatPoints(needExam)}`));
                    return;
                  }
                  const live: Record<string, string> = {};
                  for (const student of data?.students ?? []) live[String(student.id)] = next;
                  setFinalLive((prev) => ({ ...prev, ...live }));
                  void Promise.all((data?.students ?? []).map((student) => savePeriodMark({ data: { classId: student.classId || classId, periodNo: 0, subject: data?.subject || subject || undefined, studentId: student.id, participation: 0, exam: Number(next) || 0 } }))).then(() => {
                    toast.success(tr("وُزعت درجة الاختبار على كل الطلاب"));
                    void queryClient.invalidateQueries({ queryKey: ["class-eval"] });
                  }).catch(() => toast.error(tr("تعذر حفظ درجة الاختبار")));
                }}>{tr("للكل")}</Button>
              </span>
            </label>
          ) : null}
          <Button type="button" size="sm" onClick={() => {
            const layout = sheetMode === "exam" ? examLayout : finalLayout;
            localStorage.setItem(`grade-page:${subject}:${sheetMode}`, JSON.stringify(layout));
            localStorage.setItem(`grade-final-layout:${subject}`, JSON.stringify({ pullId, needYear, needExam }));
            toast.success(tr("حُفظ تنسيق هذه الصفحة فقط"));
            setFormatOpen(false);
          }}>{tr("حفظ تنسيق الصفحة")}</Button>
          <p className="basis-full text-xs text-fg-muted">{tr("أعمال السنة: متوسط الفترات يُعادل تلقائيًا إلى 60. الاختبار يُدخل يدويًا من 40. المجموع تلقائي من 100.")}</p>
        </div>
      ) : null}
      {view === "year" && formatOpen && (sheetMode === "exam" || sheetMode === "final") ? (
        <div className="no-print flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] border border-border bg-card p-3">
          <p className="basis-full text-sm font-semibold">{sheetMode === "exam" ? tr("تنسيق كشف الاختبار") : tr("تنسيق النتيجة النهائية")}</p>
          {([
            ["row", tr("ارتفاع الصف"), 5, 18],
            ["seq", tr("عرض م"), 8, 24],
            ["name", tr("عرض اسم الطالب"), 30, 90],
            ["col", tr("عرض عمود الدرجة"), 12, 40],
          ] as const).map(([key, label, min, max]) => {
            const current = sheetMode === "exam" ? examLayout : finalLayout;
            return (
              <label key={key} className="space-y-1 text-sm">
                <span>{label}</span>
                <Input className="w-20" type="number" min={min} max={max} value={current[key]} onChange={(event) => {
                  const next = { ...current, [key]: Math.min(max, Math.max(min, Number(event.target.value) || min)) };
                  if (sheetMode === "exam") setExamLayout(next);
                  else setFinalLayout(next);
                  localStorage.setItem(`grade-page:${subject}:${sheetMode}`, JSON.stringify(next));
                }} />
              </label>
            );
          })}
        </div>
      ) : null}
      {view === "year" && formatOpen && sheetMode === "period" ? (
        <div className="no-print flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-border bg-card p-3">
          <Select className="h-9 w-auto min-w-52" value={yearFormatId} onChange={(event) => setYearFormatId(event.target.value)}>
            <option value="">{tr("اختر قالب أعمال السنة")}</option>
            {(yearPack?.formats ?? []).filter((item) => item.name !== "اختبار نهاية السنة" && item.name !== "النتيجة النهائية").map((item) => <option key={item.id} value={item.id}>{item.name}{item.ownerName ? ` — ${item.ownerName}` : ""}</option>)}
          </Select>
          <Button type="button" size="sm" disabled={!yearFormatId} onClick={() => {
            const item = (yearPack?.formats ?? []).find((row) => String(row.id) === yearFormatId);
            if (!item?.payload) return;
            const payload: FormatPayload = {
              ...item.payload,
              sheet: item.payload.sheet === "blank" ? "blank" : "record",
              gradeCols: item.payload.gradeCols ?? [],
              periods: (() => {
                const rows = item.payload.periods?.length ? item.payload.periods : [{ title: "الفترة", tasksMax: 40, examMax: 20, columns: [] }];
                const base = rows[0];
                return rows.map((period) => ({ ...period, tasksMax: base?.tasksMax ?? period.tasksMax, examMax: base?.examMax ?? period.examMax, columns: (base?.columns ?? period.columns).map((column) => ({ ...column })) }));
              })(),
              cards: item.payload.cards ?? [],
              finalExamMax: item.payload.finalExamMax ?? 40,
              finalColumns: item.payload.finalColumns ?? [],
              combine: item.payload.combine === "avg" ? "avg" : "sum",
            };
            void applyGradeFormat({ data: { formatId: item.id, subject: subject || undefined, periodNo: 0, payload } }).then(() => {
              setGradeShape(payload.sheet === "blank" ? "blank" : "record");
              setRecordCols(null);
              if (payload.sheet === "blank" && payload.gradeCols?.length) setGradeCols(payload.gradeCols.map((col) => ({ ...col })));
              toast.success(tr("طُبّق القالب"));
              setFormatOpen(false);
              void queryClient.invalidateQueries({ queryKey: ["grade-studio"] });
              void queryClient.invalidateQueries({ queryKey: ["class-eval", classId] });
            }).catch((err) => toast.error(err instanceof Error ? err.message : tr("تعذر التطبيق")));
          }}>{tr("تطبيق")}</Button>
          <Input className="h-9 w-40" value={newFormatName} maxLength={60} placeholder={tr("اسم القالب الجديد")} onChange={(event) => setNewFormatName(event.target.value)} />
          <Button type="button" size="sm" variant="secondary" onClick={() => {
            const name = newFormatName.trim();
            if (name.length < 2) {
              toast.error(tr("اكتب اسم القالب"));
              return;
            }
            void saveGradeFormat({ data: { name, payload: currentFormatPayload() } }).then(() => {
              toast.success(tr("حُفظ القالب باسم جديد"));
              setNewFormatName("");
              setFormatOpen(false);
              void queryClient.invalidateQueries({ queryKey: ["grade-studio"] });
            }).catch((err) => toast.error(err instanceof Error ? err.message : tr("تعذر حفظ القالب")));
          }}>{tr("حفظ باسم جديد")}</Button>
          {(() => {
            const item = (yearPack?.formats ?? []).find((row) => String(row.id) === yearFormatId);
            if (!item?.payload) return null;
            const cols = item.payload.sheet === "blank" ? (item.payload.gradeCols ?? []) : (item.payload.periods?.[0]?.columns ?? []);
            const applied = String(yearPack?.activeFormatId ?? "") === yearFormatId;
            return (
              <div className="basis-full rounded-[var(--radius-md)] border border-border bg-white p-2">
                <p className="text-sm font-semibold">{applied ? tr("القالب الحالي") : tr("معاينة قبل التطبيق")}: {item.name}{item.ownerName ? ` — ${item.ownerName}` : ""}</p>
                <p className="text-xs text-fg-muted">{tr("الدرجات المدخلة في القوالب السابقة تبقى محفوظة.")}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {cols.map((col) => <span key={col.id || col.title} className="rounded border border-border px-2 py-0.5 text-xs">{col.title || tr("عمود")}{col.calc === "sum" ? ` (${tr("جمع")})` : col.calc === "avg" ? ` (${tr("متوسط")})` : ""}</span>)}
                </div>
              </div>
            );
          })()}
          <label className="text-sm">
              <span className="me-2">{tr("استيراد إكسل")}</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="max-w-52 text-xs"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  void importGradeFile(file).catch((err) => toast.error(err instanceof Error ? err.message : tr("تعذر قراءة الملف")));
                }}
              />
            </label>
        </div>
      ) : null}
      {view === "year" && formatOpen && sheetMode === "period" && gradeShape === "record" ? (
        <div className="no-print flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] border border-border bg-card p-3">
          <label className="space-y-1 text-sm">
            <span>{tr("ارتفاع الصف")}</span>
            <Input className="w-20" type="number" min={5} max={16} value={recordRow} onChange={(event) => setRecordRow(Math.min(16, Math.max(5, Number(event.target.value) || 8)))} />
          </label>
          <label className="space-y-1 text-sm">
            <span>{tr("عرض م")}</span>
            <Input className="w-20" type="number" min={6} max={30} value={seqMm} onChange={(event) => {
              const next = Math.min(30, Math.max(6, Number(event.target.value) || 10));
              setSeqMm(next);
              localStorage.setItem(`grade-seq:${classId}`, String(next));
            }} />
          </label>
          <label className="space-y-1 text-sm">
            <span>{tr("عرض اسم الطالب")}</span>
            <Input className="w-20" type="number" min={24} max={80} value={nameMm} onChange={(event) => {
              const next = Math.min(80, Math.max(24, Number(event.target.value) || 46));
              setNameMm(next);
              localStorage.setItem(`grade-name:${classId}`, String(next));
            }} />
          </label>
          <label className="space-y-1 text-sm">
            <span>{tr("حجم خط الاسم")}</span>
            <Input className="w-20" type="number" min={10} max={22} value={nameFont} onChange={(event) => setNameFont(Math.min(22, Math.max(10, Number(event.target.value) || 13)))} />
          </label>
          <label className="space-y-1 text-sm">
            <span>{tr("عرض عمود الدرجة")}</span>
            <Input className="w-20" type="number" min={10} max={40} value={colMm} onChange={(event) => setColMm(Math.min(40, Math.max(10, Number(event.target.value) || 16)))} />
          </label>
          {([["top", "أعلى"], ["bottom", "أسفل"], ["right", "يمين"], ["left", "يسار"]] as const).map(([key, label]) => (
            <label key={key} className="space-y-1 text-sm">
              <span>{tr("هامش")} {label}</span>
              <Input className="w-20" type="number" min={0} max={40} value={sheetMargins[key]} onChange={(event) => {
                const next = { ...sheetMargins, [key]: Math.min(40, Math.max(0, Number(event.target.value) || 0)) };
                setSheetMargins(next);
                localStorage.setItem(`grade-margins:${classId}:${subject}`, JSON.stringify(next));
              }} />
            </label>
          ))}
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={showTeacherSign} onChange={(event) => { setShowTeacherSign(event.target.checked); localStorage.setItem(`grade-sign-teacher:${classId}`, event.target.checked ? "1" : "0"); }} />
              {tr("اسم المعلم")}
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={showPrincipalSign} onChange={(event) => { setShowPrincipalSign(event.target.checked); localStorage.setItem(`grade-sign-principal:${classId}`, event.target.checked ? "1" : "0"); }} />
              {tr("اسم المدير")}
            </label>
          </div>
          <ul className="basis-full space-y-2">
            {liveColumns.map((col, index) => (
              <li key={col.id} className="space-y-1 rounded border border-border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Input className="max-w-40" value={col.title} maxLength={40} onChange={(event) => setRecordCols(liveColumns.map((item) => item.id === col.id ? { ...item, title: event.target.value } : item))} />
                  <Input className="w-16" inputMode="decimal" value={col.max ?? ""} placeholder={tr("الحد")} onChange={(event) => setRecordCols(liveColumns.map((item) => item.id === col.id ? { ...item, max: Number(event.target.value) || 0 } : item))} />
                  <Select className="h-9 w-auto" value={col.group || "tasks"} onChange={(event) => setRecordCols(liveColumns.map((item) => item.id === col.id ? { ...item, group: event.target.value === "exam" || event.target.value === "eval" ? event.target.value : "tasks" } : item))}>
                    <option value="tasks">{tr("أعمال السنة")}</option>
                    <option value="exam">{tr("اختبار الفترة")}</option>
                    <option value="eval">{tr("تقويم")}</option>
                  </Select>
                  <Select className="h-9 w-auto" value={col.calc || ""} onChange={(event) => setRecordCols(liveColumns.map((item) => item.id === col.id ? { ...item, calc: event.target.value === "sum" || event.target.value === "avg" || event.target.value === "cards" ? event.target.value : "" } : item))}>
                    <option value="">{tr("إدخال يدوي")}</option>
                    <option value="sum">{tr("جمع أعمدة")}</option>
                    <option value="avg">{tr("متوسط أعمدة")}</option>
                    <option value="cards">{tr("أدوات التقويم الصفي")}</option>
                  </Select>
                  <button type="button" className="text-xs" disabled={index === 0} onClick={() => {
                    const next = [...liveColumns];
                    const [item] = next.splice(index, 1);
                    next.splice(index - 1, 0, item);
                    setRecordCols(next);
                  }}>{tr("تقديم")}</button>
                  <button type="button" className="text-xs text-danger" onClick={() => { if (window.confirm(tr("حذف هذا العمود؟"))) setRecordCols(liveColumns.filter((item) => item.id !== col.id)); }}>{tr("حذف")}</button>
                </div>
                {col.calc === "sum" || col.calc === "avg" ? (
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="basis-full text-fg-muted">{col.calc === "avg" ? tr("المتوسط يحسب هذه الأعمدة") : tr("الجمع يجمع هذه الأعمدة")}</span>
                    {liveColumns.filter((item) => item.id !== col.id && item.calc !== "sum" && item.calc !== "avg").map((item) => (
                      <label key={item.id} className="inline-flex items-center gap-1">
                        <input type="checkbox" checked={col.sources?.includes(item.id) || false} onChange={(event) => {
                          const sources = new Set(col.sources ?? []);
                          if (event.target.checked) sources.add(item.id); else sources.delete(item.id);
                          setRecordCols(liveColumns.map((entry) => entry.id === col.id ? { ...entry, sources: [...sources] } : entry));
                        }} />
                        {item.title || tr("عمود")}
                      </label>
                    ))}
                  </div>
                ) : null}
                {col.calc === "cards" ? (
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="basis-full text-fg-muted">{tr("هذه الخانة تجمع أدوات التقويم الصفي المحددة، ولا تُكتب يدويًا")}</span>
                    {(data?.cards ?? []).filter((card) => card.enabled !== false).length ? (data?.cards ?? []).filter((card) => card.enabled !== false).map((card) => {
                      const current = cardColumn?.[card.id] ?? card.columnId ?? "";
                      return (
                        <label key={card.id} className="inline-flex items-center gap-1">
                          <input type="checkbox" checked={current === col.id} onChange={(event) => {
                            setCardColumn((prev) => {
                              const base = { ...(prev ?? Object.fromEntries((data?.cards ?? []).map((item) => [item.id, item.columnId || ""]))) };
                              base[card.id] = event.target.checked ? col.id : (base[card.id] === col.id ? "" : base[card.id]);
                              return base;
                            });
                          }} />
                          {card.label} ({formatPoints(card.points)})
                        </label>
                      );
                    }) : <span>{tr("لا توجد أدوات بعد. أضف صح وأتقن وحل الواجب من المتابعة الصفية.")}</span>}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <button type="button" className="text-sm font-medium text-primary" onClick={() => setRecordCols([...liveColumns, { id: `c${Date.now()}`.slice(0, 20), title: "عمود", group: "tasks", max: 10 }])}>{tr("إضافة عمود")}</button>
          <Button type="button" size="sm" onClick={() => {
            if (selected) {
              const columns = liveColumns;
              savePlan.mutate({
                combine: data?.combine === "avg" ? "avg" : "sum",
                periods: periods.map((period) => ({
                  no: period.no,
                  title: period.title,
                  tasksMax: period.tasksMax,
                  examMax: period.examMax,
                  closed: period.closed,
                  columns,
                })),
              });
              if (cardColumn) {
                void linkFollowCards({ data: { links: (data?.cards ?? []).map((card) => {
                  const columnId = cardColumn[card.id] ?? card.columnId ?? "";
                  const column = columns.find((item) => item.id === columnId);
                  return { cardId: card.id, columnId, columnRef: column ? `${column.group || "tasks"}:${column.title}` : "" };
                }) } }).then(() => queryClient.invalidateQueries({ queryKey: ["class-eval"] }));
              }
            }
            setFormatOpen(false);
          }}>{tr("حفظ")}</Button>
        </div>
      ) : null}
      {view === "year" && formatOpen && sheetMode === "period" && gradeShape === "blank" ? (
        <div className="no-print mt-2 space-y-2 rounded-[var(--radius-md)] border border-border bg-card p-3">
          <p className="text-xs text-fg-muted">{tr("الخانات فارغة للتعبئة اليدوية. عدّل اسم العمود وحدّه الأعلى وعرضه، وقدّمه أو أخّره.")}</p>
          <label className="flex max-w-xs items-center gap-2 text-sm">
            <span>{tr("ارتفاع الصف")}</span>
            <Input type="number" min={4} max={16} value={gradeRow} onChange={(event) => setGradeRow(Math.min(16, Math.max(4, Number(event.target.value) || 8)))} />
            <span className="text-xs text-fg-muted">{tr("مم")}</span>
          </label>
          <label className="flex max-w-xs items-center gap-2 text-sm">
            <span>{tr("عرض م")}</span>
            <Input className="w-20" type="number" min={6} max={30} value={seqMm} onChange={(event) => {
              const next = Math.min(30, Math.max(6, Number(event.target.value) || 10));
              setSeqMm(next);
              localStorage.setItem(`grade-seq:${classId}`, String(next));
            }} />
          </label>
          <label className="flex max-w-xs items-center gap-2 text-sm">
            <span>{tr("عرض اسم الطالب")}</span>
            <Input className="w-20" type="number" min={24} max={80} value={nameMm} onChange={(event) => {
              const next = Math.min(80, Math.max(24, Number(event.target.value) || 46));
              setNameMm(next);
              localStorage.setItem(`grade-name:${classId}`, String(next));
            }} />
          </label>
          <label className="flex max-w-xs items-center gap-2 text-sm">
            <span>{tr("حجم خط الاسم")}</span>
            <Input className="w-20" type="number" min={10} max={22} value={nameFont} onChange={(event) => setNameFont(Math.min(22, Math.max(10, Number(event.target.value) || 13)))} />
          </label>
          <div className="flex flex-wrap gap-2">
            {([["top", "أعلى"], ["bottom", "أسفل"], ["right", "يمين"], ["left", "يسار"]] as const).map(([key, label]) => (
              <label key={key} className="space-y-1 text-sm">
                <span>{tr("هامش")} {label}</span>
                <Input className="w-20" type="number" min={0} max={40} value={sheetMargins[key]} onChange={(event) => {
                  const next = { ...sheetMargins, [key]: Math.min(40, Math.max(0, Number(event.target.value) || 0)) };
                  setSheetMargins(next);
                  localStorage.setItem(`grade-margins:${classId}:${subject}`, JSON.stringify(next));
                }} />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={showTeacherSign} onChange={(event) => { setShowTeacherSign(event.target.checked); localStorage.setItem(`grade-sign-teacher:${classId}`, event.target.checked ? "1" : "0"); }} />
              {tr("اسم المعلم")}
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={showPrincipalSign} onChange={(event) => { setShowPrincipalSign(event.target.checked); localStorage.setItem(`grade-sign-principal:${classId}`, event.target.checked ? "1" : "0"); }} />
              {tr("اسم المدير")}
            </label>
          </div>
          <ul className="space-y-2">
            {gradeCols.map((col, index) => (
              <li key={col.id} className="space-y-1 rounded border border-border p-2">
                <div className="flex flex-wrap items-center gap-2">
                <Input className="max-w-40" value={col.title} maxLength={40} onChange={(event) => setGradeCols(gradeCols.map((item) => item.id === col.id ? { ...item, title: event.target.value } : item))} />
                <Input className="w-16" inputMode="decimal" value={col.max ?? ""} placeholder={tr("الحد")} disabled={col.calc === "sum" || col.calc === "avg"} onChange={(event) => setGradeCols(gradeCols.map((item) => item.id === col.id ? { ...item, max: Number(event.target.value) > 0 ? Number(event.target.value) : undefined } : item))} />
                <Input className="w-16" type="number" min={8} max={80} value={col.width} onChange={(event) => setGradeCols(gradeCols.map((item) => item.id === col.id ? { ...item, width: Math.min(80, Math.max(8, Number(event.target.value) || 18)) } : item))} />
                <Select className="h-9 w-auto" value={col.calc || ""} onChange={(event) => setGradeCols(gradeCols.map((item) => item.id === col.id ? { ...item, calc: event.target.value === "sum" || event.target.value === "avg" ? event.target.value : "", sources: item.sources ?? [] } : item))}>
                  <option value="">{tr("إدخال")}</option>
                  <option value="sum">{tr("جمع")}</option>
                  <option value="avg">{tr("متوسط")}</option>
                </Select>
                <button type="button" className="text-xs" disabled={index === 0} onClick={() => {
                  const next = [...gradeCols];
                  const [item] = next.splice(index, 1);
                  next.splice(index - 1, 0, item);
                  setGradeCols(next);
                }}>{tr("تقديم")}</button>
                <button type="button" className="text-xs text-danger" onClick={() => { if (window.confirm(tr("حذف هذا العمود؟"))) setGradeCols(gradeCols.filter((item) => item.id !== col.id)); }}>{tr("حذف")}</button>
                </div>
                {col.calc === "sum" || col.calc === "avg" ? (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {gradeCols.filter((item) => item.id !== col.id && item.calc !== "sum" && item.calc !== "avg" && !isSumColumn(item)).map((item) => (
                      <label key={item.id} className="inline-flex items-center gap-1">
                        <input type="checkbox" checked={col.sources?.includes(item.id) || false} onChange={(event) => {
                          const sources = new Set(col.sources ?? []);
                          if (event.target.checked) sources.add(item.id); else sources.delete(item.id);
                          setGradeCols(gradeCols.map((entry) => entry.id === col.id ? { ...entry, sources: [...sources] } : entry));
                        }} />
                        {item.title || tr("عمود")}
                      </label>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <button type="button" className="text-sm font-medium text-primary" onClick={() => setGradeCols([...gradeCols, { id: `c${Date.now()}`, title: "", width: 18 }])}>{tr("إضافة عمود")}</button>
          <Button type="button" size="sm" onClick={() => setFormatOpen(false)}>{tr("حفظ")}</Button>
        </div>
      ) : null}
      {view === "year" && sheetMode === "period" && selected?.closed ? (
        <p className="rounded-[var(--radius-md)] bg-muted px-3 py-2 text-sm">{tr("الفترة مغلقة والكشف ثابت. أعد فتحها إذا أردت التعديل.")}</p>
      ) : null}
      {view === "year" && sheetMode === "period" ? (
        <div className="grade-phone">
          {data.students.map((student, index) => {
            const score = student.byPeriod?.find((period) => period.no === selected?.no) ?? { participation: 0, exam: 0, evalPoints: 0, total: 0, extras: {} as Record<string, number> };
            const key = `${student.id}:${selected?.no ?? 1}`;
            const draft = drafts[key] ?? {
              participation: String(score.participation ?? 0),
              exam: String(score.exam ?? 0),
              extras: Object.fromEntries((liveColumns).map((column) => [column.id, String(score.extras?.[column.id] ?? 0)])),
            };
            const persist = (next = draft) => save.mutate({
              studentId: student.id,
              classId: student.classId,
              participation: Number(next.participation) || 0,
              exam: Number(next.exam) || 0,
              extras: Object.fromEntries(Object.entries(next.extras).map(([id, value]) => [id, Number(value) || 0])),
            });
            const box = (label: string, value: string, warnId: string, disabled: boolean, change: (value: string) => void, blur: (value: string) => void) => (
              <label key={warnId} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-white px-2 py-1">
                <span className="min-w-0 text-sm">{label}</span>
                <span className="flex flex-col items-end">
                  <Input className="h-11 w-24 border text-center text-base" inputMode="decimal" value={value === "0" ? "" : value} placeholder="0" disabled={disabled} onChange={(event) => change(event.target.value)} onBlur={(event) => blur(event.target.value)} />
                  {cellWarn[warnId] ? <span className="grade-warn">{cellWarn[warnId]}</span> : null}
                </span>
              </label>
            );
            return (
              <article key={student.id} className="rounded-xl border border-border bg-white p-3">
                <p className="text-base font-bold leading-6">{index + 1}. {student.name}</p>
                <div className="mt-2 space-y-2">
                  {gradeShape === "blank" && sheetMode === "period" ? gradeCols.map((col) => isCalcColumn(col) || isSumColumn(col) ? (
                    <p key={col.id} className="flex justify-between text-sm font-semibold"><span>{col.title || tr("المجموع")}</span><span>{sheetGrade(columnMath(col, gradeCols, Object.fromEntries(gradeCols.map((item) => [item.id, readBlank(student.id, item.id)]))))}</span></p>
                  ) : box(col.title || tr("عمود"), readBlank(student.id, col.id), blankKey(student.id, col.id), false, (value) => {
                    const next = acceptGrade(value, Number(col.max) || 0, blankKey(student.id, col.id));
                    if (next === null) return;
                    setBlankMarks((prev) => {
                      const marks = { ...prev, [blankKey(student.id, col.id)]: next };
                      storeBlank(marks);
                      return marks;
                    });
                  }, () => undefined)) : null}
                  {gradeShape !== "blank" && sheetMode === "period" && selected ? (
                    <>
                      {taskColumns.length ? taskColumns.map((column) => column.calc === "sum" || column.calc === "avg" || column.calc === "cards" ? (
                        <p key={column.id} className="flex justify-between text-sm font-semibold"><span>{column.title}</span><span>{sheetGrade(columnMath(column, liveColumns, draft.extras))}</span></p>
                      ) : box(`${column.title}${column.max ? ` (${formatPoints(column.max)})` : ""}`, draft.extras[column.id] ?? "", `${key}:${column.id}`, selected.closed, (value) => {
                        const next = acceptGrade(value, Number(column.max) || selected.tasksMax, `${key}:${column.id}`);
                        if (next === null) return;
                        const updated = { ...draft, extras: { ...draft.extras, [column.id]: next } };
                        setDrafts((prev) => ({ ...prev, [key]: updated }));
                      }, (value) => persist({ ...draft, extras: { ...draft.extras, [column.id]: value } }))) : box(`${tr("أعمال السنة")} (${formatPoints(selected.tasksMax)})`, draft.participation, `${key}:tasks`, selected.closed, (value) => {
                        const next = acceptGrade(value, selected.tasksMax, `${key}:tasks`);
                        if (next === null) return;
                        const updated = { ...draft, participation: next };
                        setDrafts((prev) => ({ ...prev, [key]: updated }));
                      }, (value) => {
                        const next = acceptGrade(value, selected.tasksMax, `${key}:tasks`);
                        if (next === null) return;
                        persist({ ...draft, participation: next });
                      })}
                      {examColumns.length ? examColumns.map((column) => column.calc === "sum" || column.calc === "avg" || column.calc === "cards" ? (
                        <p key={column.id} className="flex justify-between text-sm font-semibold"><span>{column.title}</span><span>{sheetGrade(columnMath(column, liveColumns, draft.extras))}</span></p>
                      ) : box(`${column.title}${column.max ? ` (${formatPoints(column.max)})` : ""}`, draft.extras[column.id] ?? "", `${key}:${column.id}`, selected.closed, (value) => {
                        const next = acceptGrade(value, Number(column.max) || selected.examMax, `${key}:${column.id}`);
                        if (next === null) return;
                        const updated = { ...draft, extras: { ...draft.extras, [column.id]: next } };
                        setDrafts((prev) => ({ ...prev, [key]: updated }));
                      }, (value) => persist({ ...draft, extras: { ...draft.extras, [column.id]: value } }))) : box(`${tr("اختبار الفترة")} (${formatPoints(selected.examMax)})`, draft.exam, `${key}:exam`, selected.closed, (value) => {
                        const next = acceptGrade(value, selected.examMax, `${key}:exam`);
                        if (next === null) return;
                        const updated = { ...draft, exam: next };
                        setDrafts((prev) => ({ ...prev, [key]: updated }));
                      }, (value) => {
                        const next = acceptGrade(value, selected.examMax, `${key}:exam`);
                        if (next === null) return;
                        persist({ ...draft, exam: next });
                      })}
                      <p className="flex justify-between text-sm font-semibold"><span>{tr("المجموع")}</span><span>{sheetGrade((taskColumns.length ? taskColumns.reduce((sum, column) => sum + (Number(draft.extras[column.id]) || 0), 0) : Number(draft.participation) || 0) + (examColumns.length ? examColumns.reduce((sum, column) => sum + (Number(draft.extras[column.id]) || 0), 0) : Number(draft.exam) || 0))}</span></p>
                    </>
                  ) : null}
                  {sheetMode === "final" ? (
                    <p className="flex justify-between text-sm font-semibold"><span>{tr("المعدل")}</span><span>{sheetGrade((needYear + needExam) > 0 ? ((equatedMark(student, needYear) + enteredExam(student)) / (needYear + needExam)) * 100 : 0)}%</span></p>
                  ) : null}
                  {sheetMode === "exam" ? (
                    <>
                      <p className="flex justify-between text-sm font-semibold"><span>{tr("أعمال السنة")}</span><span>{sheetGrade(equatedMark(student, needYear))}</span></p>
                      <label className="flex items-center justify-between gap-2 rounded-lg border border-border bg-white px-2 py-1">
                        <span className="text-sm font-semibold">{tr("درجة الاختبار لكل طالب")}</span>
                        <Input className="h-11 w-24 border text-center text-base" inputMode="decimal" defaultValue={student.sheetExam ? String(student.sheetExam) : ""} placeholder="0" onChange={(event) => setFinalLive((prev) => ({ ...prev, [String(student.id)]: event.target.value }))} onBlur={(event) => {
                          const next = withinMax(event.target.value, needExam);
                          if (next === null) return;
                          setFinalLive((prev) => ({ ...prev, [String(student.id)]: next }));
                          void savePeriodMark({ data: { classId: student.classId || classId, periodNo: 0, subject: data.subject || subject || undefined, studentId: student.id, participation: 0, exam: Number(next) || 0 } }).then(() => queryClient.invalidateQueries({ queryKey: ["class-eval", student.classId || classId] }));
                        }} />
                      </label>
                      <p className="flex justify-between text-sm font-semibold"><span>{tr("المجموع")}</span><span>{sheetGrade(equatedMark(student, needYear) + enteredExam(student))}</span></p>
                    </>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
      <div
        ref={printRef}
        className={`print-form year-sheet rounded-[var(--radius-md)] border border-border bg-white p-4 text-black${sheetMode === "exam" || sheetMode === "final" ? " exam-visible" : ""}`}
        style={{
          ["--print-margin-top" as string]: `${sheetMargins.top}mm`,
          ["--print-margin-right" as string]: `${sheetMargins.right}mm`,
          ["--print-margin-bottom" as string]: `${sheetMargins.bottom}mm`,
          ["--print-margin-left" as string]: `${sheetMargins.left}mm`,
        }}
      >
        <OfficialLetterhead school={school} />
        {view === "year" ? (
          <input
            className="year-title mb-2 w-full border-0 bg-transparent text-center text-[15px] font-semibold outline-none"
            value={sheetTitle}
            onChange={(event) => {
              setSheetTitle(event.target.value);
              localStorage.setItem(`grade-title:${classId}:${subject}`, event.target.value);
            }}
          />
        ) : null}
        {view === "analysis" || view === "attendance" || view === "summary" || view === "year" || view === "roster" ? null : (
        <h3 className="mb-2 text-center text-lg font-semibold">
          {tr(title)} — {data.class.label}
          {data.subject ? ` — ${data.subject}` : ""}
          {view === "year" && selected ? ` — ${selected.title}` : ""}
          {view === "year" ? ` — ${data.combine === "avg" ? tr("متوسط الفترات") : tr("جمع الفترات")}` : ""}
        </h3>
        )}
        {view === "year" ? (
          <p className="mb-2 text-center text-base font-bold">
            {sheetMode === "exam" ? tr("اختبار نهاية السنة") : sheetMode === "final" ? tr("النتيجة النهائية") : (selected?.title || tr("الفترة"))}
          </p>
        ) : null}
        {view === "year" && gradeShape !== "blank" && selected && sheetMode === "period" ? (
          <div className="grade-scroll">
          <table className="grade-equal grade-sheet w-full border-collapse text-sm" style={{ ["--row-h" as string]: `${recordRow}mm`, ["--name-font" as string]: `${nameFont}px` }}>
            <colgroup>
              <col style={{ width: colPct(seqMm) }} />
              <col style={{ width: colPct(nameMm) }} />
              {Array.from({ length: gradeSlots }).map((_, index) => <col key={index} style={{ width: colPct(colMm) }} />)}
            </colgroup>
            <thead>
              <tr>
                <th className="border border-black px-2 py-1">{tr("م")}</th>
                <th className="grade-name border border-black px-2 py-1">{tr("اسم الطالب")}</th>
                {liveColumns.some((column) => (column.group ?? "eval") === "tasks") ? (
                  <>
                    {liveColumns.filter((column) => (column.group ?? "eval") === "tasks").map((column) => (
                      <th key={column.id} className="border border-black px-2 py-1">{column.title}{column.max ? ` (${formatPoints(column.max)})` : ""}</th>
                    ))}
                    <th className="border border-black px-2 py-1">{tr("مجموع المشاركة")} ({formatPoints(selected.tasksMax)})</th>
                  </>
                ) : (
                  <th className="border border-black px-2 py-1">{tr("أعمال السنة")} ({formatPoints(selected.tasksMax)})</th>
                )}
                {liveColumns.some((column) => column.group === "exam") ? (
                  <>
                    {liveColumns.filter((column) => column.group === "exam").map((column) => (
                      <th key={column.id} className="border border-black px-2 py-1">{column.title}{column.max ? ` (${formatPoints(column.max)})` : ""}</th>
                    ))}
                    <th className="border border-black px-2 py-1">{tr("اختبار الفترة")} ({formatPoints(selected.examMax)})</th>
                  </>
                ) : (
                  <th className="border border-black px-2 py-1">{tr("اختبار الفترة")} ({formatPoints(selected.examMax)})</th>
                )}
                {evalColumns.map((column) => (
                  <th key={column.id} className="border border-black px-2 py-1">{column.title}</th>
                ))}
                <th className="border border-black px-2 py-1">{tr("مجموع الفترة")} ({formatPoints(selected.tasksMax + selected.examMax)})</th>
              </tr>
            </thead>
            <tbody>
              {data.students.map((student, index) => {
                const score = student.byPeriod?.find((period) => period.no === selected.no) ?? { participation: 0, exam: 0, evalPoints: 0, total: 0 };
                const key = `${student.id}:${selected.no}`;
                const draft = drafts[key] ?? {
                  participation: String(score.participation),
                  exam: String(score.exam),
                  extras: Object.fromEntries(liveColumns.map((column) => [column.id, String(score.extras?.[column.id] ?? 0)])),
                };
                const taskSum = taskColumns.length
                  ? taskColumns.filter((column) => column.calc !== "sum" && column.calc !== "avg").reduce((sum, column) => sum + (Number(draft.extras[column.id]) || 0), 0)
                  : Number(draft.participation) || 0;
                const examSum = examColumns.length
                  ? examColumns.filter((column) => column.calc !== "sum" && column.calc !== "avg").reduce((sum, column) => sum + (Number(draft.extras[column.id]) || 0), 0)
                  : Number(draft.exam) || 0;
                const extraSum = evalColumns.filter((column) => column.calc !== "sum" && column.calc !== "avg").reduce((sum, column) => sum + (Number(draft.extras[column.id]) || 0), 0);
                const periodSum = taskSum + examSum + (classFollow ? extraSum : 0);
                const persist = (next = draft) => save.mutate({
                  studentId: student.id,
                  classId: student.classId,
                  participation: Number(next.participation) || 0,
                  exam: Number(next.exam) || 0,
                  extras: Object.fromEntries(Object.entries(next.extras).map(([id, value]) => [id, Number(value) || 0])),
                });
                return (
                  <tr key={student.id} style={{ height: `${recordRow}mm` }}>
                    <td className="grade-no border border-black px-1 py-1 text-center" style={{ height: `${recordRow}mm` }}>{index + 1}</td>
                    <td className="grade-name border border-black px-2 py-1 text-right font-bold" style={{ height: `${recordRow}mm`, fontSize: `${nameFont}px` }}>{student.name}</td>
                    {liveColumns.some((column) => (column.group ?? "eval") === "tasks") ? (
                      <>
                        {liveColumns.filter((column) => (column.group ?? "eval") === "tasks").map((column) => column.calc === "sum" || column.calc === "avg" || column.calc === "cards" ? (
                          <td key={column.id} className="border border-black px-2 py-1 text-center font-semibold">{sheetGrade(columnMath(column, liveColumns, draft.extras))}</td>
                        ) : (
                          <td key={column.id} className="border border-black px-2 py-1">
                            <Input
                              value={(draft.extras[column.id] && draft.extras[column.id] !== "0") ? draft.extras[column.id] : ""}
                              placeholder="0"
                              inputMode="decimal"
                              disabled={selected.closed}
                              onChange={(event) => {
                                const next = acceptGrade(event.target.value, Number(column.max) || selected.tasksMax, `${key}:${column.id}`);
                                if (next === null) return;
                                const updated = { ...draft, extras: { ...draft.extras, [column.id]: next } };
                                setDrafts((prev) => ({ ...prev, [key]: updated }));
                              }}
                              onBlur={(event) => persist({ ...draft, extras: { ...draft.extras, [column.id]: event.target.value } })}
                            />
                            {cellWarn[`${key}:${column.id}`] ? <span className="grade-warn no-print">{cellWarn[`${key}:${column.id}`]}</span> : null}
                          </td>
                        ))}
                        <td className="border border-black px-2 py-1 text-center font-semibold">{sheetGrade(taskSum)}</td>
                      </>
                    ) : (
                      <td className="border border-black px-2 py-1">
                        <Input
                          value={draft.participation === "0" ? "" : draft.participation}
                          placeholder="0"
                          inputMode="decimal"
                          disabled={selected.closed}
                          onChange={(event) => {
                            const next = acceptGrade(event.target.value, selected.tasksMax, `${key}:tasks`);
                            if (next === null) return;
                            const updated = { ...draft, participation: next };
                            setDrafts((prev) => ({ ...prev, [key]: updated }));
                          }}
                          onBlur={(event) => {
                            const next = acceptGrade(event.target.value, selected.tasksMax, `${key}:tasks`);
                            if (next === null) return;
                            persist({ ...draft, participation: next });
                          }}
                        />
                        {cellWarn[`${key}:tasks`] ? <span className="grade-warn no-print">{cellWarn[`${key}:tasks`]}</span> : null}
                      </td>
                    )}
                    {liveColumns.some((column) => column.group === "exam") ? (
                      <>
                        {liveColumns.filter((column) => column.group === "exam").map((column) => column.calc === "sum" || column.calc === "avg" || column.calc === "cards" ? (
                          <td key={column.id} className="border border-black px-2 py-1 text-center font-semibold">{sheetGrade(columnMath(column, liveColumns, draft.extras))}</td>
                        ) : (
                          <td key={column.id} className="border border-black px-2 py-1">
                            <Input
                              value={(draft.extras[column.id] && draft.extras[column.id] !== "0") ? draft.extras[column.id] : ""}
                              placeholder="0"
                              inputMode="decimal"
                              disabled={selected.closed}
                              onChange={(event) => {
                                const next = acceptGrade(event.target.value, Number(column.max) || selected.examMax, `${key}:${column.id}`);
                                if (next === null) return;
                                const updated = { ...draft, extras: { ...draft.extras, [column.id]: next } };
                                setDrafts((prev) => ({ ...prev, [key]: updated }));
                              }}
                              onBlur={(event) => persist({ ...draft, extras: { ...draft.extras, [column.id]: event.target.value } })}
                            />
                            {cellWarn[`${key}:${column.id}`] ? <span className="grade-warn no-print">{cellWarn[`${key}:${column.id}`]}</span> : null}
                          </td>
                        ))}
                        <td className="border border-black px-2 py-1 text-center font-semibold">{sheetGrade(examSum)}</td>
                      </>
                    ) : (
                      <td className="border border-black px-2 py-1">
                        <Input
                          value={draft.exam === "0" ? "" : draft.exam}
                          placeholder="0"
                          inputMode="decimal"
                          disabled={selected.closed}
                          onChange={(event) => {
                            const next = acceptGrade(event.target.value, selected.examMax, `${key}:exam`);
                            if (next === null) return;
                            const updated = { ...draft, exam: next };
                            setDrafts((prev) => ({ ...prev, [key]: updated }));
                          }}
                          onBlur={(event) => {
                            const next = acceptGrade(event.target.value, selected.examMax, `${key}:exam`);
                            if (next === null) return;
                            persist({ ...draft, exam: next });
                          }}
                        />
                        {cellWarn[`${key}:exam`] ? <span className="grade-warn no-print">{cellWarn[`${key}:exam`]}</span> : null}
                      </td>
                    )}
                    {liveColumns.filter((column) => column.group === "eval").map((column) => column.calc === "sum" || column.calc === "avg" || column.calc === "cards" ? (
                      <td key={column.id} className="border border-black px-2 py-1 text-center font-semibold">{sheetGrade(columnMath(column, liveColumns, draft.extras))}</td>
                    ) : (
                      <td key={column.id} className="border border-black px-2 py-1">
                        <Input
                          value={(draft.extras[column.id] && draft.extras[column.id] !== "0") ? draft.extras[column.id] : ""}
                      placeholder="0"
                          inputMode="decimal"
                          disabled={selected.closed}
                          onChange={(event) => {
                            const next = acceptGrade(event.target.value, Number(column.max) || 0, `${key}:${column.id}`);
                            if (next === null) return;
                            const updated = { ...draft, extras: { ...draft.extras, [column.id]: next } };
                            setDrafts((prev) => ({ ...prev, [key]: updated }));
                          }}
                          onBlur={(event) => persist({ ...draft, extras: { ...draft.extras, [column.id]: event.target.value } })}
                        />
                        {cellWarn[`${key}:${column.id}`] ? <span className="grade-warn no-print">{cellWarn[`${key}:${column.id}`]}</span> : null}
                      </td>
                    ))}
                    <td className="border border-black px-2 py-1 text-center font-semibold">{sheetGrade(periodSum)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        ) : null}
        {view === "year" && sheetMode === "exam" ? (
          <div className="grade-scroll">
            <table className="grade-sheet w-full border-collapse text-sm" style={{ tableLayout: "fixed", ["--row-h" as string]: `${examLayout.row}mm`, ["--name-font" as string]: `${nameFont}px` }}>
              <colgroup>
                <col style={{ width: `${examLayout.seq}mm` }} />
                <col style={{ width: `${examLayout.name}mm` }} />
                <col style={{ width: `${examLayout.col}mm` }} />
                <col style={{ width: `${examLayout.col}mm` }} />
                <col style={{ width: `${examLayout.col}mm` }} />
              </colgroup>
              <thead>
                <tr className="bg-[#9aa0a6] text-white">
                  <th className="border border-black px-2 py-1">{tr("م")}</th>
                  <th className="grade-name border border-black px-2 py-1 text-right">{tr("اسم الطالب")}</th>
                  <th className="border border-black px-2 py-1">{tr("أعمال السنة")} ({formatPoints(needYear)})</th>
                  <th className="border border-black px-2 py-1">{tr("الاختبار النهائي")} ({formatPoints(needExam)})</th>
                  <th className="border border-black px-2 py-1">{tr("المجموع")} ({formatPoints(needYear + needExam)})</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((student, index) => (
                  <tr key={student.id} className={index % 2 ? "bg-[#f3f4f6]" : undefined} style={{ height: `${examLayout.row}mm` }}>
                    <td className="border border-black px-1 text-center">{index + 1}</td>
                    <td className="grade-name border border-black px-2 text-right font-bold" style={{ fontSize: `${nameFont}px` }}>{student.name}</td>
                    <td className="border border-black px-1 text-center font-semibold">{sheetGrade(equatedMark(student, needYear))}</td>
                    <td className="border border-black p-0.5">
                      <Input
                        className="exam-entry h-8 w-full px-1 text-center"
                        inputMode="decimal"
                        value={finalLive[String(student.id)] ?? (student.sheetExam ? String(student.sheetExam) : "")}
                        placeholder="0"
                        onChange={(event) => setFinalLive((prev) => ({ ...prev, [String(student.id)]: event.target.value }))}
                        onBlur={(event) => {
                          const next = withinMax(event.target.value, needExam);
                          if (next === null) {
                            setCellWarn((prev) => ({ ...prev, [`final:${student.id}`]: `أعلى من ${formatPoints(needExam)}` }));
                            return;
                          }
                          setCellWarn((prev) => { const copy = { ...prev }; delete copy[`final:${student.id}`]; return copy; });
                          setFinalLive((prev) => ({ ...prev, [String(student.id)]: next }));
                          void savePeriodMark({ data: { classId: student.classId || classId, periodNo: 0, subject: data.subject || subject || undefined, studentId: student.id, participation: 0, exam: Number(next) || 0 } }).then(() => queryClient.invalidateQueries({ queryKey: ["class-eval", student.classId || classId] }));
                        }}
                      />
                      {cellWarn[`final:${student.id}`] ? <span className="grade-warn no-print">{cellWarn[`final:${student.id}`]}</span> : null}
                    </td>
                    <td className="border border-black px-1 text-center font-semibold">{sheetGrade(equatedMark(student, needYear) + enteredExam(student))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {view === "year" && sheetMode === "final" ? (
          <div className="grade-scroll">
            <table className="grade-sheet w-full border-collapse text-sm" style={{ tableLayout: "fixed", ["--row-h" as string]: `${finalLayout.row}mm`, ["--name-font" as string]: `${nameFont}px` }}>
              <colgroup>
                <col style={{ width: `${finalLayout.seq}mm` }} />
                <col style={{ width: `${finalLayout.name}mm` }} />
                {Array.from({ length: periods.length + 4 }).map((_, index) => <col key={index} style={{ width: `${finalLayout.col}mm` }} />)}
              </colgroup>
              <thead>
                <tr className="bg-[#9aa0a6] text-white">
                  <th className="border border-black px-2 py-1">{tr("م")}</th>
                  <th className="grade-name border border-black px-2 py-1 text-right">{tr("اسم الطالب")}</th>
                  {periods.map((period) => <th key={period.no} className="border border-black px-2 py-1">{period.title}</th>)}
                  <th className="border border-black px-2 py-1">{tr("مجموع الفترات")}</th>
                  <th className="border border-black px-2 py-1">{tr("الاختبار النهائي")}</th>
                  <th className="border border-black px-2 py-1">{tr("المجموع")}</th>
                  <th className="border border-black px-2 py-1">{tr("المعدل")} %</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((student, index) => {
                  const scores = periods.map((period) => periodFigure(student, period.no).score);
                  const periodSum = scores.reduce((sum, value) => sum + value, 0);
                  const exam = enteredExam(student);
                  const total = equatedMark(student, needYear) + exam;
                  const ceiling = needYear + needExam;
                  const rate = ceiling > 0 ? (total / ceiling) * 100 : 0;
                  return (
                    <tr key={student.id} className={index % 2 ? "bg-[#f3f4f6]" : undefined} style={{ height: `${finalLayout.row}mm` }}>
                      <td className="border border-black px-1 text-center">{index + 1}</td>
                      <td className="grade-name border border-black px-2 text-right font-bold" style={{ fontSize: `${nameFont}px` }}>{student.name}</td>
                      {scores.map((score, scoreIndex) => <td key={periods[scoreIndex]?.no ?? scoreIndex} className="border border-black px-1 text-center">{sheetGrade(score)}</td>)}
                      <td className="border border-black px-1 text-center">{sheetGrade(periodSum)}</td>
                      <td className="border border-black px-1 text-center">{sheetGrade(exam)}</td>
                      <td className="border border-black px-1 text-center font-semibold">{sheetGrade(total)}</td>
                      <td className="border border-black px-1 text-center font-semibold">{sheetGrade(rate)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {view === "year" && gradeShape === "blank" && sheetMode === "period" ? (
          <div className="space-y-2 text-[13px] text-black">
            <div className="grade-scroll">
            <table className="grade-sheet w-full border-collapse text-xs" style={{ tableLayout: "fixed", ["--row-h" as string]: `${gradeRow}mm`, ["--name-font" as string]: `${nameFont}px` }}>
              <thead>
                <tr className="bg-[#9aa0a6] text-white">
                  <th className="border border-black px-1 py-1" rowSpan={2} style={{ width: blankPct(seqMm) }}>{tr("م")}</th>
                  <th className="grade-name border border-black px-1 py-1 text-right" rowSpan={2} style={{ width: blankPct(nameMm) }}>{tr("اسم الطالب")}</th>
                  {gradeCols.map((col) => (
                    <th key={col.id} className="border border-black px-1 py-1" style={{ width: blankPct(Number(col.width) || 18) }}>{col.title || tr("عمود")}</th>
                  ))}
                </tr>
                <tr>
                  {gradeCols.map((col) => {
                    const scored = gradeCols.filter((item) => !isCalcColumn(item) && !isSumColumn(item));
                    const max = isCalcColumn(col) || isSumColumn(col) ? (col.calc === "avg" ? "" : scored.filter((item) => !col.sources?.length || col.sources.includes(item.id)).reduce((sum, item) => sum + (Number(item.max) || 0), 0)) : col.max;
                    return <th key={`${col.id}-max`} className="border border-black bg-[#e5e7eb] px-1 py-1">{max || ""}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {data.students.map((student, index) => (
                  <tr key={student.id} className={index % 2 === 1 ? "bg-[#f3f4f6]" : undefined} style={{ height: `${gradeRow}mm` }}>
                    <td className="border border-black px-1 text-center" style={{ height: `${gradeRow}mm` }}>{index + 1}</td>
                    <td className="grade-name border border-black px-1 text-right font-bold" style={{ height: `${gradeRow}mm`, fontSize: `${nameFont}px` }}>{student.name}</td>
                    {gradeCols.map((col) => {
                      if (isCalcColumn(col) || isSumColumn(col)) {
                        const values = Object.fromEntries(gradeCols.map((item) => [item.id, readBlank(student.id, item.id)]));
                        return <td key={col.id} className="border border-black px-1 text-center font-semibold">{sheetGrade(columnMath(col, gradeCols, values))}</td>;
                      }
                      return (
                      <td key={col.id} className="border border-black p-0.5">
                        <Input
                          className="grade-cell h-8 w-full border-0 bg-transparent px-1 text-center shadow-none"
                          inputMode="decimal"
                          value={readBlank(student.id, col.id)}
                          placeholder="0"
                          onChange={(event) => {
                            const id = blankKey(student.id, col.id);
                            const next = acceptGrade(event.target.value, Number(col.max) || 0, id);
                            if (next === null) return;
                            setBlankMarks((prev) => {
                              const marks = { ...prev, [id]: next };
                              storeBlank(marks);
                              return marks;
                            });
                          }}
                        />
                        {cellWarn[blankKey(student.id, col.id)] ? <span className="grade-warn no-print">{cellWarn[blankKey(student.id, col.id)]}</span> : null}
                      </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        ) : null}
        {view === "year" && gradeShape !== "blank" ? (
          <div className="hidden">
            <div className="mx-auto mb-3 max-w-xl border border-[#1f8a4c] px-3 py-2 text-center text-sm font-semibold">
              كشف أعمال السنة [{data.class.stageName ? `${data.class.stageName} - ` : ""}{data.class.label}{data.subject ? ` — ${data.subject}` : ""}]
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["المرحلة الدراسية / الصف", `${data.class.stageName || "—"} - ${data.class.label}`],
                ["المادة", data.subject || "—"],
                ["عدد الطلاب", String(data.students.length)],
                ["تاريخ الإصدار", hijriDate()],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-[#1f8a4c] px-2 py-2 text-center">
                  <p className="text-[11px] text-[#1f8a4c]">{label}</p>
                  <p className="font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <table className="grade-equal w-full border-collapse">
              <colgroup>
                <col className="grade-name" />
                <col />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr>
                  {["م", "اسم الطالب", `متوسط أعمال السنة (${formatPoints((data.scale as { yearMax?: number }).yearMax ?? 60)})`, `اختبار نهاية السنة (${formatPoints((data.scale as { finalExamMax?: number }).finalExamMax ?? 40)})`, `المجموع (${formatPoints(data.scale.totalMax)})`].map((label) => (
                    <th key={label} className="border border-[#1f8a4c] bg-[#1f8a4c] px-2 py-1.5 text-center text-xs font-semibold text-white">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.students.map((student, index) => {
                  const yearWork = student.yearWork ?? (student.byPeriod ?? []).reduce((sum, period) => sum + period.participation, 0);
                  const exam = student.sheetExam ?? 0;
                  return (
                    <tr key={student.id} className={index % 2 ? "bg-[#f4f7f5]" : "bg-white"}>
                      <td className="grade-name border border-[#d7e3dc] px-2 py-1 text-right text-xs">{index + 1}</td>
                      <td className="border border-[#d7e3dc] px-2 py-1 text-right text-xs">{student.name}</td>
                      <td className="border border-[#d7e3dc] px-2 py-1 text-center text-xs">{sheetGrade(yearWork)}</td>
                      <td className="border border-[#d7e3dc] px-2 py-1 text-center text-xs">{sheetGrade(exam)}</td>
                      <td className="border border-[#d7e3dc] px-2 py-1 text-center text-xs font-semibold">{sheetGrade(student.finalTotal ?? yearWork + exam)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-8 grid grid-cols-2 gap-6 text-center text-sm">
              <div>
                <p className="font-semibold">معلم/ة المادة</p>
                <p className="mt-2">{((data as { teacherName?: string }).teacherName || staff.displayName) || "………………"}</p>
              </div>
              <div>
                <p className="font-semibold">مدير/ة المدرسة</p>
                <p className="mt-2">{school.principalName || "………………"}</p>
              </div>
            </div>
          </div>
        ) : null}
        {view === "year" && (showTeacherSign || showPrincipalSign) ? (
          <div className="sheet-signs mt-8 text-sm">
            {showTeacherSign ? (
              <div>
                <p className="font-semibold">{tr("المعلم")}</p>
                <p className="mt-3">{((data as { teacherName?: string }).teacherName || staff.displayName) || "………………"}</p>
              </div>
            ) : <span />}
            {showPrincipalSign ? (
              <div>
                <p className="font-semibold">{tr("المدير")}</p>
                <p className="mt-3">{school.principalName || "………………"}</p>
              </div>
            ) : <span />}
          </div>
        ) : null}
        {view === "analysis" ? (
          <ComprehensiveReport
            students={data.students}
            totalMax={data.scale.totalMax}
            subject={data.subject}
            classLabel={data.class.label}
            stageName={data.class.stageName}
            teacher={((data as { teacherName?: string }).teacherName || staff.displayName)}
            principal={school.principalName}
          />
        ) : null}
        {view === "attendance" ? (
          <AttendanceReport
            students={data.students}
            dutyDays={(data as { dutyDays?: number }).dutyDays ?? 0}
            subject={data.subject}
            classLabel={data.class.label}
            stageName={data.class.stageName}
            teacher={((data as { teacherName?: string }).teacherName || staff.displayName)}
            principal={school.principalName}
          />
        ) : null}
        {view === "summary" ? (
          <GradeSummary
            students={data.students}
            totalMax={data.scale.totalMax}
            classLabel={data.class.label}
            stageName={data.class.stageName}
            teacher={((data as { teacherName?: string }).teacherName || staff.displayName)}
            principal={school.principalName}
          />
        ) : null}
        {view === "roster" ? (
          <div className="space-y-2 text-[12px] text-black">
            <div className="mx-auto mb-3 max-w-xl border border-[#1e5aa8] px-3 py-2 text-center text-sm font-semibold">
              كشف الفصل التفصيلي [{data.class.stageName ? `${data.class.stageName} - ` : ""}{data.class.label}{data.subject ? ` — ${data.subject}` : ""}]
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["المرحلة الدراسية / الصف", `${data.class.stageName || "—"} - ${data.class.label}`],
                ["المادة", data.subject || "—"],
                ["عدد الطلاب", String(data.students.length)],
                ["تاريخ الإصدار", hijriDate()],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-[#1e5aa8] px-2 py-2 text-center">
                  <p className="text-[11px] text-[#1e5aa8]">{label}</p>
                  <p className="font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {[
                    "م",
                    "اسم الطالب",
                    "الغياب",
                    "التأخر",
                    "الأوسمة",
                    `المهام الأدائية والمشاركة والتفاعل (${formatPoints(data.scale.tasksMax)})`,
                    `تقويمات شفهية وتحريرية (${formatPoints(data.scale.quizzesMax)})`,
                    `المجموع (${formatPoints(data.scale.totalMax)})`,
                    "النسبة",
                    "التقدير",
                  ].map((label) => (
                    <th key={label} className="border border-[#1e5aa8] bg-[#1e5aa8] px-1 py-1 text-center text-[10px] font-semibold text-white">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.students.map((student, index) => {
                  const periods = student.byPeriod ?? [];
                  const count = Math.max(periods.length, 1);
                  const fold = (value: number) => data.combine === "avg" ? Math.round((value / count) * 10) / 10 : Math.round(value * 10) / 10;
                  const tasks = fold(periods.reduce((sum, period) => sum + period.participation, 0));
                  const exams = fold(periods.reduce((sum, period) => sum + period.exam, 0));
                  const percent = data.scale.totalMax ? Math.round((student.total / data.scale.totalMax) * 100) : 0;
                  const grade = percent >= 90 ? "ممتاز" : percent >= 80 ? "جيد جداً" : percent >= 70 ? "جيد" : percent >= 60 ? "مقبول" : "راسب";
                  const badges = (student.taps ?? []).filter((tap) => tap.label.includes("وسام")).reduce((sum, tap) => sum + tap.count, 0);
                  const cell = "border border-[#d7e3dc] px-1 py-1 text-center text-[11px]";
                  return (
                    <tr key={student.id} className={index % 2 ? "bg-[#f4f7fb]" : "bg-white"}>
                      <td className={cell}>{index + 1}</td>
                      <td className={`${cell} text-right`}>{student.name}</td>
                      <td className={cell}>{student.absent ? student.absent : "—"}</td>
                      <td className={cell}>{student.late ? student.late : "—"}</td>
                      <td className={cell}>{badges}</td>
                      <td className={cell}>{formatPoints(tasks)}</td>
                      <td className={cell}>{formatPoints(exams)}</td>
                      <td className={cell}>{formatPoints(student.total)}</td>
                      <td className={cell}>%{percent}</td>
                      <td className={cell}>{grade}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-8 grid grid-cols-2 gap-6 text-center text-sm">
              <div>
                <p className="font-semibold">معلم/ة المادة</p>
                <p className="mt-2">{((data as { teacherName?: string }).teacherName || staff.displayName) || "………………"}</p>
              </div>
              <div>
                <p className="font-semibold">مدير/ة المدرسة</p>
                <p className="mt-2">{school.principalName || "………………"}</p>
              </div>
            </div>
          </div>
        ) : null}
        {view === "analysis" || view === "attendance" || view === "summary" || view === "year" || view === "roster" ? null : <p className="mt-4 text-sm">{tr("معلم المادة")}: {((data as { teacherName?: string }).teacherName || staff.displayName)}</p>}
      </div>
    </div>
  );
}

type FormatColumn = { id?: string; title: string; group: "tasks" | "exam" | "eval"; max: number; calc?: "" | "sum" | "avg" | "cards"; sources?: string[] };
type FinalColumn = { id: string; title: string; max: number };
type FormatPeriod = { title: string; tasksMax: number; examMax: number; columns: FormatColumn[] };
type FormatCard = { label: string; points: number; bucket: "tasks" | "quizzes"; enabled: boolean; columnRef: string };
type FormatPayload = { combine: "sum" | "avg"; periods: FormatPeriod[]; cards: FormatCard[]; finalExamMax: number; finalColumns: FinalColumn[]; sheet?: "record" | "blank"; gradeCols?: ExtraCol[] };

function columnRef(column: FormatColumn) {
  return `${column.group}:${column.title}`;
}

function designSlot(payload: FormatPayload) {
  let at = 0;
  payload.periods.forEach((period, index) => {
    if ((period.columns?.length ?? 0) > (payload.periods[at]?.columns?.length ?? 0)) at = index;
  });
  return at;
}

function formatMark(payload: FormatPayload, at: number) {
  const period = payload.periods[at] ?? payload.periods[0];
  return JSON.stringify({
    combine: payload.combine,
    tasksMax: period?.tasksMax ?? 0,
    examMax: period?.examMax ?? 0,
    columns: period?.columns ?? [],
    cards: payload.cards ?? [],
    finalExamMax: payload.finalExamMax ?? 40,
    finalColumns: payload.finalColumns ?? [],
    sheet: payload.sheet === "blank" ? "blank" : "record",
    gradeCols: payload.gradeCols ?? [],
  });
}

function stampDesign(payload: FormatPayload, at: number, periodNo: number): FormatPayload {
  const source = payload.periods[at] ?? payload.periods[0];
  if (!source) return payload;
  return {
    ...payload,
    periods: payload.periods.map((period, index) => {
      if (periodNo !== 0 && periodNo !== index + 1) return period;
      return {
        ...period,
        tasksMax: source.tasksMax,
        examMax: source.examMax,
        columns: source.columns.map((column) => ({ ...column })),
      };
    }),
  };
}

export function GradeFormatStudio() {
  const { staff } = useWorkspace();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["grade-studio"], queryFn: () => getGradeStudio() });
  const data = query.data as {
    subjects?: { name: string; combine?: "sum" | "avg"; periods?: PeriodPlan[]; finalExamMax?: number; finalColumns?: FinalColumn[] }[];
    cards?: FormatCard[];
    formats?: { id: number; name: string; ownerName: string; mine: boolean; locked?: boolean; payload: FormatPayload }[];
    activeFormatId?: number | null;
  } | undefined;
  const [name, setName] = useState("");
  const [picked, setPicked] = useState("");
  const [subject, setSubject] = useState("");
  const [periodNo, setPeriodNo] = useState(0);
  const [draft, setDraft] = useState<FormatPayload | null>(null);
  const [taskName, setTaskName] = useState("");
  const [taskShare, setTaskShare] = useState("");
  const [examName, setExamName] = useState("");
  const [examShare, setExamShare] = useState("");
  const [finalName, setFinalName] = useState("");
  const [finalShare, setFinalShare] = useState("");
  const [cardLabel, setCardLabel] = useState("");
  const [cardPoints, setCardPoints] = useState("1");
  const [cardColumn, setCardColumn] = useState("");
  const [designAt, setDesignAt] = useState(0);
  const [savedMark, setSavedMark] = useState("");
  const [askSave, setAskSave] = useState(false);
  const subjects = (data?.subjects ?? []).map((item) => item.name).filter(Boolean);
  useEffect(() => {
    if (!data || draft) return;
    const first = data.subjects?.[0];
    const next: FormatPayload = {
      combine: first?.combine === "avg" ? "avg" : "sum",
      periods: (first?.periods?.length ? first.periods : [{ no: 1, title: "الفترة الأولى", tasksMax: 20, examMax: 10, closed: false }, { no: 2, title: "الفترة الثانية", tasksMax: 20, examMax: 10, closed: false }]).map((period) => ({
        title: period.title,
        tasksMax: period.tasksMax,
        examMax: period.examMax,
        columns: (period.columns ?? []).map((column) => ({ title: column.title, group: column.group === "exam" || column.group === "tasks" ? column.group : "eval" as const, max: Number((column as { max?: number }).max) || 0 })),
      })),
      cards: (data.cards ?? []).map((card) => ({ label: card.label, points: card.points, bucket: card.bucket, enabled: card.enabled !== false, columnRef: card.columnRef || "" })),
      finalExamMax: Number(first?.finalExamMax) || 40,
      finalColumns: (first?.finalColumns ?? []).map((column, index) => ({ id: column.id || `f${index + 1}`, title: column.title, max: Number(column.max) || 0 })),
      sheet: "record",
      gradeCols: [],
    };
    const at = designSlot(next);
    setDesignAt(at);
    setSavedMark(formatMark(next, at));
    setDraft(next);
  }, [data, draft]);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["grade-studio"] });
    void queryClient.invalidateQueries({ queryKey: ["class-eval"] });
  };
  const apply = useMutation({
    mutationFn: (input: { payload: FormatPayload; subject?: string; periodNo?: number; formatId?: number }) =>
      applyGradeFormat({ data: { subject: input.subject || undefined, periodNo: input.periodNo ?? 0, formatId: input.formatId, payload: input.payload } }),
    onSuccess: () => {
      toast.success(tr("طُبّق التنسيق"));
      refresh();
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر التطبيق")),
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("لا يوجد تنسيق");
      if (name.trim().length < 2) throw new Error("اكتب اسماً للتنسيق");
      const pickedRow = (data?.formats ?? []).find((item) => String(item.id) === picked);
      const locked = Boolean(pickedRow?.locked);
      if (locked && name.trim() === pickedRow?.name) throw new Error("هذا القالب مستخدم من معلم آخر. احفظه باسم جديد");
      const stored = stampDesign(draft, designAt, 0);
      const live = stampDesign(draft, designAt, periodNo);
      const saved = await saveGradeFormat({ data: { name: name.trim(), payload: stored, id: pickedRow && pickedRow.mine && !locked ? pickedRow.id : undefined } });
      await applyGradeFormat({ data: { subject: subject || undefined, periodNo, formatId: saved.id, payload: live } });
      return saved;
    },
    onSuccess: (saved) => {
      toast.success(saved?.copied ? tr("القالب مستخدم، وحُفظ باسم جديد") : tr("حُفظ القالب وطُبّق"));
      if (saved?.id) setPicked(String(saved.id));
      setName("");
      setAskSave(false);
      if (draft) setSavedMark(formatMark(draft, designAt));
      refresh();
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteGradeFormat({ data: { id } }),
    onSuccess: () => { setPicked(""); refresh(); },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحذف")),
  });
  if (!draft) return null;
  const design = draft.periods[designAt] ?? draft.periods[0];
  const choices = design?.columns ?? [];
  const mine = Boolean(picked && (data?.formats ?? []).some((item) => String(item.id) === picked && item.mine));
  function patchDesign(next: Partial<FormatPeriod>) {
    setDraft((current) => current && ({
      ...current,
      periods: current.periods.map((period, index) => index === designAt ? { ...period, ...next } : period),
    }));
  }
  function addCard() {
    const label = cardLabel.trim();
    if (!label || draft.cards.some((card) => card.label === label) || draft.cards.length >= 40) return;
    const points = Number(cardPoints) || 0;
    setDraft({
      ...draft,
      cards: [...draft.cards, { label, points, bucket: points < 0 ? "quizzes" : "tasks", enabled: true, columnRef: cardColumn }],
    });
    setCardLabel("");
  }
  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">{tr("تنسيق الدرجات")}</h2>
        <p className="text-sm text-fg-muted">{tr("اختر قالب أعمال السنة ثم طبّقه. يظهر جدول واحد عند الدخول على أعمال السنة.")}</p>
      </header>

      <section className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-card p-3">
        <h3 className="text-sm font-semibold">{tr("التنسيق وأين يُطبَّق")}</h3>
        <Select className="h-11 w-full" value={picked} onChange={(event) => {
          const id = event.target.value;
          setPicked(id);
          const item = (data?.formats ?? []).find((row) => String(row.id) === id);
          if (!item?.payload?.periods) return;
          const next: FormatPayload = {
            combine: item.payload.combine === "avg" ? "avg" : "sum",
            periods: item.payload.periods.map((period) => ({
              title: period.title || "فترة",
              tasksMax: Number(period.tasksMax) || 0,
              examMax: Number(period.examMax) || 0,
              columns: (period.columns ?? []).map((column) => ({ title: column.title, group: column.group === "exam" || column.group === "tasks" ? column.group : "eval" as const, max: Number((column as { max?: number }).max) || 0, calc: (column as { calc?: string }).calc === "sum" || (column as { calc?: string }).calc === "avg" || (column as { calc?: string }).calc === "cards" ? (column as { calc?: "" | "sum" | "avg" | "cards" }).calc : "", sources: (column as { sources?: string[] }).sources ?? [] })),
            })),
            cards: (item.payload.cards ?? []).map((card) => ({ label: card.label, points: Number(card.points) || 0, bucket: card.bucket === "quizzes" ? "quizzes" : "tasks", enabled: card.enabled !== false, columnRef: card.columnRef || "" })),
            finalExamMax: Number(item.payload.finalExamMax) || 40,
            finalColumns: (item.payload.finalColumns ?? []).map((column, index) => ({ id: column.id || `f${index + 1}`, title: column.title, max: Number(column.max) || 0 })),
            sheet: item.payload.sheet === "blank" ? "blank" : "record",
            gradeCols: (item.payload.gradeCols ?? []).map((column) => ({ id: column.id, title: column.title, width: Number(column.width) || 18, max: Number(column.max) || 0 })),
          };
          const at = designSlot(next);
          setDesignAt(at);
          setSavedMark(formatMark(next, at));
          setAskSave(false);
          setDraft(next);
          setName(item.locked ? "" : item.name);
        }}>
          <option value="">{tr("تنسيقي الحالي")}</option>
          {(data?.formats ?? []).map((item) => (
            <option key={item.id} value={item.id}>{item.name}{item.locked ? ` · ${tr("مستخدم")}` : item.mine ? ` · ${tr("تنسيقي")}` : ` · ${item.ownerName}`}</option>
          ))}
        </Select>
        <div className="grid gap-2 sm:grid-cols-2">
          <Select className="h-10 w-full" value={subject} onChange={(event) => setSubject(event.target.value)}>
            <option value="">{tr("كل المواد")}</option>
            {(subjects.length ? subjects : parseSubjects(staff.subject)).map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
          <Select className="h-10 w-full" value={String(periodNo)} onChange={(event) => setPeriodNo(Number(event.target.value))}>
            <option value="0">{tr("كل الفترات")}</option>
            {draft.periods.map((period, index) => <option key={`${period.title}-${index}`} value={index + 1}>{period.title}</option>)}
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={draft.sheet !== "blank" ? "default" : "secondary"} onClick={() => setDraft({ ...draft, sheet: "record" })}>{tr("قالب الكشف الحالي")}</Button>
          <Button type="button" size="sm" variant={draft.sheet === "blank" ? "default" : "secondary"} onClick={() => setDraft({ ...draft, sheet: "blank", gradeCols: draft.gradeCols?.length ? draft.gradeCols : GRADE_SHEET_COLUMNS.map((col) => ({ ...col })) })}>{tr("قالب كشف الدرجات")}</Button>
          <Button type="button" size="sm" variant={draft.combine === "sum" ? "default" : "secondary"} onClick={() => setDraft({ ...draft, combine: "sum" })}>{tr("جمع الفترات")}</Button>
          <Button type="button" size="sm" variant={draft.combine === "avg" ? "default" : "secondary"} onClick={() => setDraft({ ...draft, combine: "avg" })}>{tr("متوسط الفترات")}</Button>
        </div>
        {(data?.formats ?? []).find((item) => String(item.id) === picked)?.locked ? (
          <p className="rounded-[var(--radius-md)] border border-amber-500 bg-amber-50 p-2 text-sm dark:bg-amber-500/10">{tr("هذا القالب مستخدم من معلم آخر. لا يمكن تعديله، واحفظ التعديل باسم جديد.")}</p>
        ) : null}
        {askSave ? (
          <div className="space-y-2 rounded-[var(--radius-md)] border border-amber-500 bg-amber-50 p-3 text-sm dark:bg-amber-500/10">
            <p className="font-semibold">{tr("التعديل غير محفوظ")}</p>
            <p className="text-fg-muted">{tr("احفظ القالب باسم، أو تابع التطبيق دون حفظ القالب.")}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>{tr("حفظ القالب")}</Button>
              <Button type="button" variant="secondary" disabled={apply.isPending} onClick={() => { setAskSave(false); apply.mutate({ payload: stampDesign(draft, designAt, periodNo), subject, periodNo }); }}>{tr("متابعة بدون حفظ")}</Button>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-end gap-2">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={tr("اسم القالب")} className="max-w-xs" />
          <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>{(data?.formats ?? []).find((item) => String(item.id) === picked)?.locked ? tr("حفظ باسم جديد") : tr("حفظ")}</Button>
          <Button type="button" variant="secondary" disabled={apply.isPending} onClick={() => {
            if (formatMark(draft, designAt) !== savedMark) { setAskSave(true); return; }
            setAskSave(false);
            apply.mutate({ payload: stampDesign(draft, designAt, periodNo), subject, periodNo, formatId: picked ? Number(picked) : undefined });
          }}>{tr("تطبيق")}</Button>
          {mine && !(data?.formats ?? []).find((item) => String(item.id) === picked)?.locked ? <Button type="button" size="sm" variant="secondary" onClick={() => { if (window.confirm(tr("حذف هذا التنسيق؟ لا يمكن التراجع."))) remove.mutate(Number(picked)); }}>{tr("حذف التنسيق")}</Button> : null}
        </div>
      </section>

      {draft.sheet === "blank" ? (
        <section className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-card p-3">
          <h3 className="text-sm font-semibold">{tr("أعمدة كشف الدرجات")}</h3>
          {(draft.gradeCols ?? []).map((col, index) => (
            <div key={col.id || index} className="flex flex-wrap items-center gap-2">
              <Input value={col.title} onChange={(event) => setDraft({ ...draft, gradeCols: (draft.gradeCols ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) })} />
              <Input className="w-20" inputMode="decimal" value={String(col.max || "")} placeholder={tr("الحد")} onChange={(event) => setDraft({ ...draft, gradeCols: (draft.gradeCols ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, max: Number(event.target.value) || 0 } : item) })} />
              <Button type="button" size="sm" variant="secondary" onClick={() => { if (window.confirm(tr("حذف هذا العمود؟"))) setDraft({ ...draft, gradeCols: (draft.gradeCols ?? []).filter((_, itemIndex) => itemIndex !== index) }); }}>{tr("حذف")}</Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="secondary" onClick={() => setDraft({ ...draft, gradeCols: [...(draft.gradeCols ?? []), { id: `g${Date.now()}`.slice(0, 20), title: "عمود", width: 18, max: 10 }] })}>{tr("إضافة عمود")}</Button>
        </section>
      ) : (
      <section className="grid gap-3 lg:grid-cols-2">
        {design ? ([
          ["tasks", "أعمال السنة", "درجة أعمال السنة", design.tasksMax, taskName, setTaskName, taskShare, setTaskShare],
          ["exam", "اختبار الفترة", "درجة الاختبار", design.examMax, examName, setExamName, examShare, setExamShare],
        ] as const).map(([group, title, totalLabel, total, partName, setPartName, partMax, setPartMax]) => {
          const parts = design.columns.filter((column) => column.group === group);
          const used = parts.reduce((sum, column) => sum + (Number(column.max) || 0), 0);
          return (
            <div key={group} className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-card p-3">
              <h3 className="text-sm font-semibold">{tr(title)}</h3>
              <label className="block space-y-1 text-sm">
                <span>{tr(totalLabel)}</span>
                <Input inputMode="decimal" value={String(total)} onChange={(event) => patchDesign(group === "tasks" ? { tasksMax: Number(event.target.value) || 0 } : { examMax: Number(event.target.value) || 0 })} />
              </label>
              <p className={cn("text-xs", used === total ? "text-fg-muted" : "text-danger")}>{tr("التوزيع")}: {formatPoints(used)} / {formatPoints(total)}</p>
              {parts.map((column) => {
                const index = design.columns.indexOf(column);
                return (
                  <div key={`${column.title}-${index}`} className="flex items-center gap-2">
                    <Input value={column.title} onChange={(event) => patchDesign({ columns: design.columns.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) })} />
                    <Input className="w-24" inputMode="decimal" value={String(column.max || "")} placeholder={tr("الدرجة")} onChange={(event) => patchDesign({ columns: design.columns.map((item, itemIndex) => itemIndex === index ? { ...item, max: Number(event.target.value) || 0 } : item) })} />
                    <Button type="button" size="sm" variant="secondary" onClick={() => { if (window.confirm(tr("حذف هذا العمود؟"))) patchDesign({ columns: design.columns.filter((_, itemIndex) => itemIndex !== index) }); }}>{tr("حذف")}</Button>
                  </div>
                );
              })}
              <div className="flex items-end gap-2">
                <Input value={partName} onChange={(event) => setPartName(event.target.value)} placeholder={tr("اسم التوزيع")} />
                <Input className="w-24" inputMode="decimal" value={partMax} onChange={(event) => setPartMax(event.target.value)} placeholder={tr("درجته")} />
                <Button type="button" size="sm" variant="secondary" disabled={!partName.trim() || design.columns.length >= 9} onClick={() => {
                  patchDesign({ columns: [...design.columns, { title: partName.trim(), group, max: Number(partMax) || 0 }] });
                  setPartName("");
                  setPartMax("");
                }}>{tr("إضافة")}</Button>
              </div>
            </div>
          );
        }) : null}
        {design ? (
          <div className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-card p-3 lg:col-span-2">
            <h3 className="text-sm font-semibold">{tr("طريقة حساب كل خانة")}</h3>
            <p className="text-xs text-fg-muted">{tr("لكل خانة: إدخال يدوي، أو جمع أعمدة، أو متوسط أعمدة، أو جمع أدوات التقويم الصفي.")}</p>
            {design.columns.map((column, index) => (
              <div key={`${column.group}-${column.title}-${index}`} className="space-y-1 rounded border border-border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-28 text-sm font-semibold">{column.title}</span>
                  <span className="text-xs text-fg-muted">{column.group === "exam" ? tr("اختبار") : column.group === "tasks" ? tr("أعمال السنة") : tr("تقويم")}</span>
                  <Select className="h-9 w-auto" value={column.calc || ""} onChange={(event) => {
                    const calc = event.target.value === "sum" || event.target.value === "avg" || event.target.value === "cards" ? event.target.value : "";
                    patchDesign({ columns: design.columns.map((item, itemIndex) => itemIndex === index ? { ...item, calc } : item) });
                  }}>
                    <option value="">{tr("إدخال يدوي")}</option>
                    <option value="sum">{tr("جمع أعمدة")}</option>
                    <option value="avg">{tr("متوسط أعمدة")}</option>
                    <option value="cards">{tr("أدوات التقويم الصفي")}</option>
                  </Select>
                </div>
                {column.calc === "sum" || column.calc === "avg" ? (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {design.columns.filter((item, itemIndex) => itemIndex !== index && item.calc !== "sum" && item.calc !== "avg").map((item) => {
                      const id = item.id || `${item.group}:${item.title}`;
                      return (
                        <label key={id} className="inline-flex items-center gap-1">
                          <input type="checkbox" checked={column.sources?.includes(id) || false} onChange={(event) => {
                            const sources = new Set(column.sources ?? []);
                            if (event.target.checked) sources.add(id); else sources.delete(id);
                            patchDesign({ columns: design.columns.map((entry, entryIndex) => entryIndex === index ? { ...entry, sources: [...sources] } : entry) });
                          }} />
                          {item.title}
                        </label>
                      );
                    })}
                  </div>
                ) : null}
                {column.calc === "cards" ? (
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="basis-full text-fg-muted">{tr("تجمع هذه الأدوات، ولا تُكتب الدرجة يدويًا")}</span>
                    {draft.cards.filter((card) => card.enabled !== false).length ? draft.cards.filter((card) => card.enabled !== false).map((card) => {
                      const ref = columnRef(column);
                      return (
                        <label key={card.label} className="inline-flex items-center gap-1">
                          <input type="checkbox" checked={card.columnRef === ref} onChange={(event) => setDraft({ ...draft, cards: draft.cards.map((item) => item.label === card.label ? { ...item, columnRef: event.target.checked ? ref : "" } : item) })} />
                          {card.label} ({formatPoints(card.points)})
                        </label>
                      );
                    }) : <span>{tr("أضف أدوات المتابعة أولًا من القسم الذي تحت هذه الصفحة.")}</span>}
                  </div>
                ) : null}
              </div>
            ))}
            <Button type="button" size="sm" variant="secondary" onClick={() => patchDesign({ columns: [...design.columns, { title: "تقويم", group: "eval", max: 10, calc: "cards" }] })}>{tr("إضافة خانة تقويم")}</Button>
          </div>
        ) : null}
        {draft ? (() => {
          const parts = draft.finalColumns ?? [];
          const used = parts.reduce((sum, column) => sum + (Number(column.max) || 0), 0);
          const total = draft.finalExamMax ?? 40;
          return (
            <div className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-card p-3">
              <h3 className="text-sm font-semibold">{tr("اختبار نهاية السنة")}</h3>
              <label className="block space-y-1 text-sm">
                <span>{tr("درجة الاختبار النهائي")}</span>
                <Input inputMode="decimal" value={String(total)} onChange={(event) => setDraft({ ...draft, finalExamMax: Number(event.target.value) || 0 })} />
              </label>
              <p className={cn("text-xs", !parts.length || used === total ? "text-fg-muted" : "text-danger")}>{tr("التوزيع")}: {formatPoints(used)} / {formatPoints(total)}</p>
              {parts.map((column, index) => (
                <div key={column.id || index} className="flex items-center gap-2">
                  <Input value={column.title} onChange={(event) => setDraft({ ...draft, finalColumns: parts.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) })} />
                  <Input className="w-24" inputMode="decimal" value={String(column.max || "")} placeholder={tr("الدرجة")} onChange={(event) => setDraft({ ...draft, finalColumns: parts.map((item, itemIndex) => itemIndex === index ? { ...item, max: Number(event.target.value) || 0 } : item) })} />
                  <Button type="button" size="sm" variant="secondary" onClick={() => { if (window.confirm(tr("حذف هذا القسم؟"))) setDraft({ ...draft, finalColumns: parts.filter((_, itemIndex) => itemIndex !== index) }); }}>{tr("حذف")}</Button>
                </div>
              ))}
              <div className="flex items-end gap-2">
                <Input value={finalName} onChange={(event) => setFinalName(event.target.value)} placeholder={tr("اسم التوزيع")} />
                <Input className="w-24" inputMode="decimal" value={finalShare} onChange={(event) => setFinalShare(event.target.value)} placeholder={tr("درجته")} />
                <Button type="button" size="sm" variant="secondary" disabled={!finalName.trim() || parts.length >= 6} onClick={() => {
                  setDraft({ ...draft, finalColumns: [...parts, { id: `f${parts.length + 1}`, title: finalName.trim(), max: Number(finalShare) || 0 }] });
                  setFinalName("");
                  setFinalShare("");
                }}>{tr("إضافة")}</Button>
              </div>
            </div>
          );
        })() : null}
      </section>
      )}

      {staffCan(staff, "viewClassFollow") ? (
      <section className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-card p-3">
        <div>
          <h3 className="text-sm font-semibold">{tr("خيارات المتابعة")}</h3>
          <p className="text-xs text-fg-muted">{tr("من هنا تُضاف الأزرار التي يضغطها المعلم على الطالب، مثل حل الواجب. اكتب الاسم والدرجة ثم أضف.")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Input value={cardLabel} onChange={(event) => setCardLabel(event.target.value)} placeholder={tr("اسم الخيار")} className="max-w-xs" />
          <Input className="h-10 w-24" inputMode="decimal" value={cardPoints} onChange={(event) => setCardPoints(event.target.value)} placeholder={tr("الدرجة")} />
          <Select className="h-10 w-auto min-w-36" value={cardColumn} onChange={(event) => setCardColumn(event.target.value)}>
            <option value="">{tr("بدون عمود")}</option>
            {choices.map((column) => <option key={columnRef(column)} value={columnRef(column)}>{(column.group === "exam" ? "اختبار" : column.group === "tasks" ? "مشاركة" : "تقويم")}: {column.title}</option>)}
          </Select>
          <Button type="button" disabled={!cardLabel.trim()} onClick={addCard}>{tr("إضافة خيار")}</Button>
        </div>
        {draft.cards.map((card, index) => (
          <div key={`${card.label}-${index}`} className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
            <span className="min-w-24 flex-1 text-sm">{card.label}</span>
            <Input className="h-9 w-20" inputMode="decimal" value={String(card.points)} onChange={(event) => setDraft({ ...draft, cards: draft.cards.map((item, itemIndex) => itemIndex === index ? { ...item, points: Number(event.target.value) || 0, bucket: (Number(event.target.value) || 0) < 0 ? "quizzes" : "tasks" } : item) })} />
            <Select className="h-9 w-auto min-w-36" value={card.columnRef} onChange={(event) => setDraft({ ...draft, cards: draft.cards.map((item, itemIndex) => itemIndex === index ? { ...item, columnRef: event.target.value } : item) })}>
              <option value="">{tr("بدون عمود")}</option>
              {choices.map((column) => <option key={columnRef(column)} value={columnRef(column)}>{(column.group === "exam" ? "اختبار" : column.group === "tasks" ? "مشاركة" : "تقويم")}: {column.title}</option>)}
            </Select>
            <Button type="button" size="sm" variant="secondary" disabled={index === 0} onClick={() => {
              const cards = [...draft.cards];
              const [item] = cards.splice(index, 1);
              cards.splice(index - 1, 0, item);
              setDraft({ ...draft, cards });
            }}>{tr("أعلى")}</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setDraft({ ...draft, cards: draft.cards.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: !item.enabled } : item) })}>{card.enabled ? tr("إخفاء") : tr("إظهار")}</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => { if (window.confirm(tr("حذف هذا الخيار؟"))) setDraft({ ...draft, cards: draft.cards.filter((_, itemIndex) => itemIndex !== index) }); }}>{tr("حذف")}</Button>
          </div>
        ))}
      </section>
      ) : null}
    </section>
  );
}
