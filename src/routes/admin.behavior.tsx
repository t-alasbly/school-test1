import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { NoteSession } from "@/components/note-session";
import { PageHelp } from "@/components/page-help";
import { PrintFormsButton } from "@/components/print-forms";
import { ImprovementRecordTools, NoteRecordTools } from "@/components/record-actions";
import { StudentSheet } from "@/components/student-sheet";
import { ExitPermitBadge } from "@/components/exit-permit";
import { DayName } from "@/components/day-name";
import { WhatsAppDialog } from "@/components/whatsapp-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OptionChips } from "@/components/option-chips";
import { MonthDays, rangeFromPreset } from "@/components/attendance-roster";
import { closeNote, createCompensationOption, followImprovement, getAdminDashboard, getStudentNotes, listFollowupNotes, referToCounselor } from "@/lib/school/api";
import {
  COMPENSATION_OPTIONS,
  IMPROVEMENT_STATUS,
  NOTE_META,
  classLabel,
  degreeLabel,
  formatStamp,
  isOtherChoice,
  noteTone,
  occurrenceLabel,
  periodShort,
  procedureLadder,
  procedureStageLabel,
  proceduresFor,
  resolveOther,
  stageIndexFor,
  deductionPhrase,
  deductionMessageLine,
  formatDay,
  isWeekendDate,
  nextSchoolDateInput,
  shiftToSchoolDay,
  weekdayName,
} from "@/lib/school/constants";
import { staffCan } from "@/lib/school/permissions";
import type { BehaviorImprovement, ImprovementStatus, NoteRecord } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";

function noteDay(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function procedureFollowUp(lines: string[]) {
  const papers: { kind: "pledge" | "invite" | "deduction" | "notice" | "incident" | "committee" | "plan" | "violence"; label: string }[] = [];
  const messages: { id: "notice" | "deduction" | "invite"; title: string }[] = [];
  if (lines.some((line) => line.includes("تعهد"))) {
    papers.push({ kind: "pledge", label: "طباعة التعهد" });
  }
  if (lines.some((line) => /استدعاء|دعوة/.test(line))) {
    papers.push({ kind: "invite", label: "طباعة الاستدعاء" });
    messages.push({ id: "invite", title: "رسالة الاستدعاء" });
  }
  if (lines.some((line) => /إشعار خصم|خصم|حسم/.test(line))) {
    papers.push({ kind: "deduction", label: "طباعة إشعار الخصم" });
    messages.push({ id: "deduction", title: "رسالة إشعار الخصم" });
  }
  if (lines.some((line) => /إشعار ولي الأمر/.test(line) && !/خصم|حسم/.test(line))) {
    messages.push({ id: "notice", title: "إشعار ولي الأمر" });
    const phoneOnly = lines
      .filter((line) => /إشعار ولي الأمر/.test(line) && !/خصم|حسم/.test(line))
      .every((line) => /هاتف/.test(line));
    if (!phoneOnly) papers.push({ kind: "notice", label: "طباعة إشعار ولي الأمر" });
  }
  if (lines.some((line) => /خطة تعديل/.test(line))) {
    papers.push({ kind: "plan", label: "طباعة خطة تعديل السلوك" });
  }
  if (lines.some((line) => /محضر/.test(line))) {
    papers.push({ kind: "incident", label: "طباعة محضر الواقعة" });
  }
  if (lines.some((line) => /لجنة التوجيه/.test(line))) {
    papers.push({ kind: "committee", label: "طباعة محضر اللجنة" });
  }
  if (lines.some((line) => /1919|إيذاء/.test(line))) {
    papers.push({ kind: "violence", label: "طباعة بلاغ الإيذاء" });
  }
  return { papers, messages, wantsMessage: messages.length > 0 };
}

function dayCountLabel(n: number) {
  if (n === 1) return tr("1 يوم");
  if (n === 2) return tr("2 يومين");
  if (n >= 3 && n <= 10) return `${n} أيام`;
  return `${n} يوماً`;
}

export const Route = createFileRoute("/admin/behavior")({
  validateSearch: (search: Record<string, unknown>): { student?: number; type?: string; range?: string } => ({
    student: Number(search.student) > 0 ? Number(search.student) : undefined,
    type: typeof search.type === "string" ? search.type : undefined,
    range: typeof search.range === "string" ? search.range : undefined,
  }),
  component: AdminBody,
});

function AdminBody() {
  const { student: studentParam, type: typeParam, range: rangeParam } = Route.useSearch();
  const navigate = useNavigate();
  const { staff, school } = useWorkspace();
  const canAct = staffCan(staff, "takeActions");
  const canImprove = staffCan(staff, "acceptImprovements");
  const allowed = canAct || canImprove;
  const [activeStudent, setActiveStudent] = useState<number | null>(studentParam ?? null);
  const [nameQuery, setNameQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("all");
  const [degreeFilter, setDegreeFilter] = useState<number | 0>(0);
  const [sortBy, setSortBy] = useState<"newest" | "most" | "name">("newest");
  const [minCount, setMinCount] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const bounds = rangeFromPreset(rangeParam);
  const query = useQuery({
    queryKey: ["admin"],
    queryFn: () => getAdminDashboard(),
    refetchInterval: 5000,
    enabled: allowed && !typeParam,
  });
  const dated = typeParam === "absence" || typeParam === "late";
  const filtered = useQuery({
    queryKey: ["followup-notes", typeParam, dated ? rangeParam : "all"],
    queryFn: () =>
      listFollowupNotes({
        data: {
          type: typeParam as "absence" | "late" | "homework" | "behavior",
          ...(dated ? { from: bounds.from, to: bounds.to } : {}),
        },
      }),
    enabled: Boolean(typeParam),
  });

  useEffect(() => {
    if (studentParam) setActiveStudent(studentParam);
  }, [studentParam]);

  const feed = typeParam ? (filtered.data ?? []) : (query.data?.feed ?? []);
  const improvements = typeParam ? [] : (query.data?.improvements ?? []);
  const typeLabel =
    typeParam === "behavior"
      ? tr("المخالفات")
      : typeParam === "homework"
        ? tr("الواجبات")
        : typeParam === "absence"
          ? tr("الغياب عن الحصة")
          : typeParam === "late"
            ? tr("التأخر عن الحصة")
            : null;
  const periodMode = typeParam === "absence" || typeParam === "late";
  const periodGroups = useMemo(() => {
    if (!periodMode) return [];
    const map = new Map<number, { studentId: number; studentName: string; classLabel: string; days: Map<string, string[]> }>();
    for (const note of feed as NoteRecord[]) {
      const day = noteDay(note.occurredAt || note.createdAt);
      const current = map.get(note.studentId) ?? {
        studentId: note.studentId,
        studentName: note.studentName,
        classLabel: classLabel(note.shortName, note.className),
        days: new Map<string, string[]>(),
      };
      const bits = current.days.get(day) ?? [];
      const period = note.periodKey ? periodShort(note.periodKey, school.season, school.schedules) : "";
      const bit = [period && period !== "—" ? period : "", note.teacherSubject || ""].filter(Boolean).join(" · ");
      if (bit && !bits.includes(bit)) bits.push(bit);
      current.days.set(day, bits);
      map.set(note.studentId, current);
    }
    return [...map.values()]
      .map((group) => {
        const days = [...group.days.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([day, bits]) => ({ day, extra: bits.join(tr("، ")) }));
        return { ...group, days, count: group.days.size };
      })
      .sort((a, b) => a.classLabel.localeCompare(b.classLabel, "ar") || a.studentName.localeCompare(b.studentName, "ar"));
  }, [feed, periodMode, school.season, school.schedules]);

  const visibleFeed = useMemo(() => {
    const q = nameQuery.trim();
    let rows = (feed as NoteRecord[]).filter((note) => {
      if (q && !note.studentName.includes(q) && !classLabel(note.shortName, note.className).includes(q)) return false;
      if (statusFilter === "open" && note.status !== "open") return false;
      if (statusFilter === "closed" && note.status !== "closed") return false;
      if (degreeFilter && Number(note.behaviorDegree) !== degreeFilter) return false;
      return true;
    });
    const counts = new Map<number, number>();
    for (const note of rows) counts.set(note.studentId, (counts.get(note.studentId) ?? 0) + 1);
    if (minCount > 0) rows = rows.filter((note) => (counts.get(note.studentId) ?? 0) >= minCount);
    if (sortBy === "most") {
      rows = [...rows].sort((a, b) => (counts.get(b.studentId) ?? 0) - (counts.get(a.studentId) ?? 0) || b.createdAt.localeCompare(a.createdAt));
    } else if (sortBy === "name") {
      rows = [...rows].sort((a, b) => a.studentName.localeCompare(b.studentName, "ar") || b.createdAt.localeCompare(a.createdAt));
    }
    return rows;
  }, [feed, nameQuery, statusFilter, degreeFilter, sortBy, minCount]);

  if (typeParam && filtered.isPending) return <p className="text-fg-muted">{tr("جارٍ تحميل الكشف…")}</p>;
  if (!typeParam && allowed && query.isPending) return <p className="text-fg-muted">{tr("جارٍ تحميل اللوحة…")}</p>;
  if (!typeParam && allowed && (query.isError || !query.data)) return <p className="text-danger">{tr("تعذر تحميل البيانات.")}</p>;

  return (
    <div className="space-y-6">
      {canAct || typeParam ? (
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              {typeLabel ?? tr("المخالفات الواردة من المعلمين")}
              <PageHelp
                text={
                  periodMode
                    ? `${tr("غياب الحصة وتأخرها هنا مع المخالفات السلوكية، وليس في الغياب اليومي.")} ${bounds.label}: ${tr("كل طالب مرة واحدة مع عدد أيام")} ${typeParam === "absence" ? tr("غيابه عن الحصة") : tr("تأخره عن الحصة")}.`
                    : tr("غياب الحصة وتأخرها هنا مع المخالفات السلوكية، وليس في الغياب اليومي.")
                }
              />
            </h2>
          </div>
        </div>
        <div className="no-print flex flex-wrap gap-1.5">
          {(
            [
              ["", tr("الكل")],
              ["behavior", tr("مخالفات سلوكية")],
              ["absence", tr("غياب عن الحصة")],
              ["late", tr("تأخر عن الحصة")],
              ["homework", tr("واجبات")],
            ] as const
          ).map(([key, label]) => {
            const active = (typeParam ?? "") === key;
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  void navigate({
                    to: "/admin/behavior",
                    search: {
                      student: studentParam,
                      type: key || undefined,
                      range: key === "absence" || key === "late" ? rangeParam || "today" : undefined,
                    },
                  });
                }}
                className={
                  active
                    ? "h-9 rounded-full border border-primary bg-primary px-3 text-sm font-medium text-primary-fg"
                    : "h-9 rounded-full border border-border bg-bg-elevated px-3 text-sm font-medium text-fg-muted"
                }
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="no-print space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              placeholder={tr("اسم الطالب أو الفصل")}
              className="flex-1"
            />
            <Button
              type="button"
              variant={showFilters ? "default" : "secondary"}
              onClick={() => setShowFilters((v) => !v)}
              aria-label={tr("فلتر")}
            >
              {tr("فلتر")}
            </Button>
          </div>
          {showFilters ? (
            <div className="grid gap-2 rounded-[var(--radius-md)] border border-border bg-bg-elevated p-3 sm:grid-cols-2 lg:grid-cols-4">
              <select
                className="h-11 rounded-[var(--radius-sm)] border border-border bg-bg px-3 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "all" | "open" | "closed")}
              >
                <option value="all">{tr("كل الحالات")}</option>
                <option value="open">{tr("لم تُغلق")}</option>
                <option value="closed">{tr("أُغلقت")}</option>
              </select>
              <select
                className="h-11 rounded-[var(--radius-sm)] border border-border bg-bg px-3 text-sm"
                value={degreeFilter}
                onChange={(e) => setDegreeFilter(Number(e.target.value))}
              >
                <option value={0}>{tr("كل الدرجات")}</option>
                {[1, 2, 3, 4, 5].map((degree) => (
                  <option key={degree} value={degree}>{degreeLabel(degree)}</option>
                ))}
              </select>
              <select
                className="h-11 rounded-[var(--radius-sm)] border border-border bg-bg px-3 text-sm"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "newest" | "most" | "name")}
              >
                <option value="newest">{tr("الأحدث")}</option>
                <option value="most">{tr("الأكثر مخالفات")}</option>
                <option value="name">{tr("حسب اسم الطالب")}</option>
              </select>
              <label className="flex h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-bg px-3 text-sm">
                <span className="shrink-0 text-fg-muted">{tr("أكثر من")}</span>
                <input
                  type="number"
                  min={0}
                  value={minCount || ""}
                  onChange={(e) => setMinCount(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0"
                  className="w-full bg-transparent outline-none"
                />
              </label>
              <p className="sm:col-span-2 lg:col-span-4 text-xs text-fg-muted">
                {tr("عدد المخالفات")}: {visibleFeed.length}
              </p>
            </div>
          ) : null}
        </div>
        {periodMode ? (
          <div className="no-print flex flex-wrap gap-1.5">
            {(
              [
                ["today", tr("اليوم")],
                ["week", tr("أسبوع")],
                ["month", tr("شهر")],
                ["all", tr("الكل")],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  void navigate({
                    to: "/admin/behavior",
                    search: { student: studentParam, type: typeParam, range: key },
                  });
                }}
                className={
                  (rangeParam || "today") === key
                    ? "h-8 rounded-full border border-primary bg-primary/5 px-3 text-xs font-medium text-primary"
                    : "h-8 rounded-full border border-border bg-bg px-3 text-xs font-medium text-fg-muted"
                }
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {periodMode ? (
          <ul className="no-print divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
            {periodGroups.map((group) => (
              <li key={group.studentId} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => setActiveStudent(group.studentId)} className="min-w-0 text-right">
                    <p className="font-semibold hover:text-primary hover:underline">
                      <DayName studentId={group.studentId}>{group.studentName}</DayName>
                      <ExitPermitBadge studentId={group.studentId} className="ms-1.5" />
                    </p>
                    <p className="text-xs text-fg-muted">{group.classLabel}</p>
                  </button>
                  <span
                    className={
                      typeParam === "late"
                        ? "shrink-0 rounded-full bg-warn-soft px-2.5 py-1 text-xs font-semibold text-warn"
                        : "shrink-0 rounded-full bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger"
                    }
                  >
                    {dayCountLabel(group.count)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-fg-muted">
                  <MonthDays days={group.days} />
                </div>
              </li>
            ))}
            {periodGroups.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-fg-muted">{tr("لا توجد سجلات في هذا النطاق.")}</li>
            ) : null}
          </ul>
        ) : null}
        {visibleFeed.length === 0 && !periodMode ? (
          <p className="rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center text-sm text-fg-muted">
            {typeParam ? tr("لا توجد سجلات في هذا النطاق.") : tr("لا توجد ملاحظات بعد. سيظهر هنا كل ما يسجّله المعلمون فورًا.")}
          </p>
        ) : visibleFeed.length > 0 ? (
          <>
            {periodMode ? <h3 className="pt-2 text-sm font-semibold text-fg-muted">{tr("تفاصيل كل حصة")}</h3> : null}
            <ul className="space-y-2">
              {visibleFeed.map((note: any) => (
                <AdminNoteCard
                  key={note.id}
                  note={note}
                  onOpenStudent={() => setActiveStudent(note.studentId)}
                />
              ))}
            </ul>
          </>
        ) : null}
      </section>
      ) : null}
      {canImprove && !typeParam ? (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{tr("متابعة تحسين السلوك")}</h2>
        {improvements.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center text-sm text-fg-muted">
            لا توجد خطط تحسين مفتوحة. يرسلها المعلمون من قائمة الفصل.
          </p>
        ) : (
          <ul className="space-y-2">
            {improvements.map((item: any) => (
              <CounselorImproveCard
                key={item.id}
                item={item}
                onOpenStudent={() => setActiveStudent(item.studentId)}
              />
            ))}
          </ul>
        )}
      </section>
      ) : null}
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

export function AdminNoteCard({
  note,
  onOpenStudent,
}: {
  note: NoteRecord;
  onOpenStudent: () => void;
}) {
  const { actionTypes, school, behaviorTypes, compensations = [] } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [held, setHeld] = useState(false);
  const [savedKey, setSavedKey] = useState("");
  const [meetDate, setMeetDate] = useState(nextSchoolDateInput);
  const [meetTime, setMeetTime] = useState("09:00");
  const [picked, setPicked] = useState<string[]>([]);
  const [stageIdx, setStageIdx] = useState(0);
  const [actionNote, setActionNote] = useState("");
  const [actionOther, setActionOther] = useState("");
  const [pickedComp, setPickedComp] = useState<string[]>([]);
  const [compOther, setCompOther] = useState("");
  const queryClient = useQueryClient();
  const compOptions =
    compensations.length > 0 ? compensations.map((c) => c.name) : COMPENSATION_OPTIONS;

  const history = useQuery({
    queryKey: ["student", note.studentId, "action"],
    queryFn: () => getStudentNotes({ data: { studentId: note.studentId } }),
    enabled: open,
  });

  const sameNotes = (history.data?.notes ?? []).filter(
    (n) =>
      n.type === "behavior" &&
      (note.behaviorTypeId
        ? n.behaviorTypeId === note.behaviorTypeId
        : n.behaviorTypeName === note.behaviorTypeName),
  );
  const occurrence = note.occurrence || sameNotes.length || 1;
  const bt = behaviorTypes.find((b) =>
    note.behaviorTypeId ? b.id === note.behaviorTypeId : b.name === note.behaviorTypeName,
  );
  const ladder = procedureLadder(note.behaviorDegree, bt?.procedures);
  const recommended = stageIndexFor(occurrence, ladder.length);
  const official = ladder[stageIdx] ?? proceduresFor(note.behaviorDegree, occurrence, bt?.procedures);
  const stacked = (() => {
    const list = sameNotes.length > 0 ? sameNotes : [note];
    const ids = new Set(list.map((n) => n.id));
    const merged = ids.has(note.id) ? list : [...list, note];
    return [...merged].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  })();

  function composedAction() {
    const fromOfficial = resolveOther(picked, actionOther).join(" — ");
    const extra = actionNote.trim();
    if (fromOfficial && extra) return `${fromOfficial} — ملاحظة: ${extra}`;
    return fromOfficial || extra;
  }

  const compensationText = resolveOther(pickedComp, compOther).join(" — ");

  function refreshAfterAction() {
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
    void queryClient.invalidateQueries({ queryKey: ["home-desk"] });
    void queryClient.invalidateQueries({ queryKey: ["desk-notes"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    void queryClient.invalidateQueries({ queryKey: ["student"] });
  }

  function resetActionDraft() {
    setStep(1);
    setActionNote("");
    setActionOther("");
    setPicked([]);
    setPickedComp([]);
    setCompOther("");
  }

  const mutation = useMutation({
    mutationFn: async (mode: "close" | "continue") => {
      const custom = resolveOther(pickedComp, compOther).filter(
        (name) => !compOptions.some((o) => o === name),
      );
      for (const name of custom) {
        try {
          await createCompensationOption({ data: { name } });
        } catch {
          /* already in list or not permitted */
        }
      }
      await closeNote({
        data: {
          noteId: note.id,
          actionTaken: composedAction(),
          compensation: compensationText || undefined,
        },
      });
      return mode;
    },
    onSuccess: (mode) => {
      if (mode === "continue") {
        toast.success(tr("تم حفظ الإجراء. أكمل الطباعة والإرسال."));
        setHeld(true);
        setSavedKey(`${composedAction()}||${compensationText}`);
        setStep(3);
        return;
      }
      toast.success(tr("تم حفظ الإجراء وإشعار المعلم"));
      setHeld(false);
      setOpen(false);
      resetActionDraft();
      refreshAfterAction();
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
  });
  const referMutation = useMutation({
    mutationFn: () => referToCounselor({ data: { noteId: note.id } }),
    onSuccess: (res) => {
      toast.success(`أُحيل ${res.studentName} إلى الإرشاد الطلابي`);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: ["home-desk"] });
      void queryClient.invalidateQueries({ queryKey: ["desk-notes"] });
      void queryClient.invalidateQueries({ queryKey: ["counseling-desk"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["student"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر التحويل")),
  });
  const tone = noteTone(note.type, note.status);
  const details =
    note.behaviorTypeName && note.details
      ? `${tr(note.behaviorTypeName || "")} — ${note.details}`
      : note.behaviorTypeName || note.details;
  const actionText = composedAction();
  const chosenLines = resolveOther(picked, actionOther);
  const followUp = procedureFollowUp(chosenLines);
  const needsFollowUp = followUp.wantsMessage || followUp.papers.length > 0;
  const actionKey = `${actionText}||${compensationText}`;
  const cutPhrase = deductionPhrase(chosenLines, note.behaviorDegree);
  const cutLine = deductionMessageLine(chosenLines, note.behaviorDegree);
  const meetIso = meetDate ? `${meetDate}T${meetTime || "09:00"}` : "";
  const meetWhen = meetIso ? `يوم ${weekdayName(meetIso)} الموافق ${formatDay(meetIso)} الساعة ${meetTime}` : "";
  const meetWeekend = isWeekendDate(meetDate);
  const needsInvite = followUp.papers.some((paper) => paper.kind === "invite") || followUp.messages.some((item) => item.id === "invite");

  function parentMessage(kind: "notice" | "deduction" | "invite") {
    const who = note.studentName;
    const violation = note.behaviorTypeName || note.details || "مخالفة سلوكية";
    const place = classLabel(note.shortName, note.className);
    const facts = [
      note.behaviorDegree ? `درجة المخالفة: ${degreeLabel(note.behaviorDegree)}.` : "",
      `تكرار المخالفة: ${occurrenceLabel(occurrence)}.`,
      cutLine,
    ].filter(Boolean).join("\n");
    if (kind === "invite") {
      return `السلام عليكم ولي أمر الطالب ${who}،\nنأمل حضوركم ${meetWhen || "في يوم دراسي من الأحد إلى الخميس"} لمقابلة إدارة المدرسة بخصوص المخالفة (${violation}) في صف ${place}.\n${facts}\n${school.name}`;
    }
    if (kind === "deduction") {
      return `السلام عليكم ولي أمر الطالب ${who}،\nنشعركم بأنه خُصم ${cutPhrase} من درجات السلوك بسبب المخالفة (${violation}) في صف ${place}.\n${facts}\n${school.name}`;
    }
    return `السلام عليكم ولي أمر الطالب ${who}،\nنود إعلامكم بتسجيل مخالفة سلوكية (${violation}) على ابنكم في صف ${place}.\n${facts}\n${school.name}`;
  }

  const printStudent = {
    name: note.studentName,
    classLabel: classLabel(note.shortName, note.className),
    className: note.className,
    stageName: note.stageName,
    parentPhone: note.parentPhone,
  };
  const printNotes = [
    {
      type: note.type,
      details: note.details,
      behaviorTypeName: note.behaviorTypeName,
      behaviorDegree: note.behaviorDegree,
      periodKey: note.periodKey,
      actionTaken: actionText,
      createdAt: note.createdAt,
      teacherName: note.teacherName,
      teacherSubject: note.teacherSubject,
      occurrence: note.occurrence,
      compensation: compensationText,
    },
  ];
  const appointment = meetIso
    ? { day: formatDay(meetIso), weekday: weekdayName(meetIso), time: meetTime }
    : undefined;

  function finishDialog() {
    const shouldRefresh = held;
    setOpen(false);
    setHeld(false);
    setSavedKey("");
    resetActionDraft();
    if (shouldRefresh) refreshAfterAction();
  }

  function toggle(item: string) {
    setPicked((prev) => (prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]));
  }

  return (
    <li className="rounded-[var(--radius-md)] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={tone}>{tr(NOTE_META[note.type].label)}</Badge>
            {note.behaviorTypeName ? (
              <Badge tone="danger">{tr(note.behaviorTypeName || "")}</Badge>
            ) : null}
            {note.type === "behavior" ? (
              <Badge tone={note.occurrence > 1 ? "danger" : "default"}>
                {occurrenceLabel(note.occurrence)}
              </Badge>
            ) : null}
            {note.status === "closed" ? <Badge tone="ok">{tr("أُغلقت")}</Badge> : null}
            {note.referCounselor ? <Badge tone="warn">{tr("محال للإرشاد")}</Badge> : null}
            {note.periodKey ? (
              <Badge tone="default">{periodShort(note.periodKey, school.season, school.schedules)}</Badge>
            ) : null}
            {note.teacherSubject ? <Badge tone="primary">{note.teacherSubject}</Badge> : null}
            <span className="text-xs text-fg-subtle">{formatStamp(note.createdAt)}</span>
          </div>
          <button
            type="button"
            onClick={onOpenStudent}
            className="text-right text-base font-semibold hover:text-primary hover:underline"
          >
            <DayName studentId={note.studentId}>{note.studentName}</DayName>
            <ExitPermitBadge studentId={note.studentId} className="ms-1.5" />
          </button>
          <p className="text-sm text-fg-muted">
            {classLabel(note.shortName, note.className)} · المعلم {note.teacherName}
          </p>
          <NoteSession
            periodKey={note.periodKey}
            subject={note.teacherSubject}
            season={school.season}
          />
          {note.details ? <p className="text-sm">{note.details}</p> : null}
          {note.actionTaken ? (
            <p className="text-sm text-ok">الإجراء: {note.actionTaken}</p>
          ) : null}
          {note.compensation ? (
            <p className="text-sm text-ok">تعويض السلوك: {note.compensation}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <NoteRecordTools note={note} />
          {note.type === "behavior" || note.type === "absence" ? (
            <PrintFormsButton
              student={{
                name: note.studentName,
                classLabel: classLabel(note.shortName, note.className),
                className: note.className,
                stageName: note.stageName,
                parentPhone: note.parentPhone,
              }}
              notes={[
                {
                  type: note.type,
                  details: note.details,
                  behaviorTypeName: note.behaviorTypeName,
                  behaviorDegree: note.behaviorDegree,
                  periodKey: note.periodKey,
                  actionTaken: note.actionTaken,
                  createdAt: note.createdAt,
                  teacherName: note.teacherName,
                  teacherSubject: note.teacherSubject,
                  occurrence: note.occurrence,
                  compensation: note.compensation,
                },
              ]}
              studentId={note.studentId}
              defaultKind={note.type === "absence" ? "attendance" : "pledge"}
              label={tr("طباعة تعهد")}
            />
          ) : (
            <PrintFormsButton
              student={{
                name: note.studentName,
                classLabel: classLabel(note.shortName, note.className),
                className: note.className,
                stageName: note.stageName,
                parentPhone: note.parentPhone,
              }}
              notes={[
                {
                  type: note.type,
                  details: note.details,
                  behaviorTypeName: note.behaviorTypeName,
                  behaviorDegree: note.behaviorDegree,
                  periodKey: note.periodKey,
                  actionTaken: note.actionTaken,
                  createdAt: note.createdAt,
                  teacherName: note.teacherName,
                  teacherSubject: note.teacherSubject,
                  occurrence: note.occurrence,
                  compensation: note.compensation,
                },
              ]}
              studentId={note.studentId}
              defaultKind="pledge"
              label={tr("طباعة نموذج")}
            />
          )}
          <WhatsAppDialog
            studentId={note.studentId}
            studentName={note.studentName}
            parentPhone={note.parentPhone}
            className={note.className}
            shortName={note.shortName}
            defaultType={note.type}
            details={details}
            sharedText={note.details}
            subject={note.teacherSubject}
            createdAt={note.createdAt}
            periodKey={note.periodKey}
            noteId={note.id}
            occurrenceText={occurrenceLabel(note.occurrence || 1)}
            behaviorDegree={note.type === "behavior" ? note.behaviorDegree : null}
            deductionText={note.type === "behavior" ? deductionPhrase([note.actionTaken || ""], note.behaviorDegree) : ""}
          />
          {note.status === "open" ? (
            <Button
              size="sm"
              onClick={() => {
                const idx = stageIndexFor(note.occurrence || 1, ladder.length);
                setStep(1);
                setStageIdx(idx);
                setPicked(ladder[idx] ?? []);
                setOpen(true);
              }}
            >
              اتخاذ إجراء
            </Button>
          ) : null}
          {!note.referCounselor ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={referMutation.isPending}
              onClick={() => referMutation.mutate()}
            >
              تحويل للإرشاد
            </Button>
          ) : null}
        </div>
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) setOpen(true);
          else finishDialog();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {step === 1
                ? tr("سجل المخالفة — المرحلة الأولى")
                : step === 2
                  ? tr("اختيار الإجراء — المرحلة الثانية")
                  : tr("الإرسال والطباعة")}
            </DialogTitle>
          </DialogHeader>
          {step === 1 ? (
            <div className="space-y-4">
              <p className="text-sm text-fg-muted">
                {note.studentName}
                {note.behaviorTypeName ? ` · ${tr(note.behaviorTypeName)}` : ""} ·{" "}
                {occurrenceLabel(occurrence)}
                {note.behaviorDegree ? ` · الدرجة ${note.behaviorDegree}` : ""}
              </p>
              {history.isPending ? (
                <p className="text-sm text-fg-muted">{tr("جارٍ تحميل سجل الطالب…")}</p>
              ) : (
                <ul className="space-y-2">
                  {stacked.map((item) => (
                      <li
                        key={item.id}
                        className={`rounded-[var(--radius-md)] border p-3 text-sm ${
                          item.id === note.id
                            ? "border-primary bg-primary/5"
                            : "border-border bg-bg"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={item.occurrence > 1 ? "danger" : "default"}>
                            {occurrenceLabel(item.occurrence)}
                          </Badge>
                          {item.status === "closed" ? <Badge tone="ok">{tr("أُغلقت")}</Badge> : null}
                          <span className="text-xs text-fg-subtle">{formatStamp(item.createdAt)}</span>
                        </div>
                        <p className="mt-1 font-medium">
                          {tr(item.behaviorTypeName || item.details || "مخالفة سلوكية")}
                        </p>
                        <p className="text-xs text-fg-muted">
                          {tr("المعلم")} {item.teacherName}
                        </p>
                        <NoteSession
                          periodKey={item.periodKey}
                          subject={item.teacherSubject}
                          season={school.season}
                        />
                        {item.actionTaken ? (
                          <p className="mt-1 text-xs text-ok">الإجراء السابق: {item.actionTaken}</p>
                        ) : null}
                      </li>
                    ))}
                </ul>
              )}
              {occurrence > 1 ? (
                <p className="rounded-[var(--radius-md)] border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
                  تكررت هذه المخالفة {occurrenceLabel(occurrence)}. يُرجى اتخاذ إجراء المرحلة المناسبة
                  {school.technicalVpName ? ` وإشعار وكيل الشؤون الفنية (${school.technicalVpName})` : tr(" وإشعار وكيل الشؤون الفنية")}.
                </p>
              ) : null}
              <Button
                className="w-full"
                onClick={() => {
                  setStageIdx(recommended);
                  setPicked(ladder[recommended] ?? []);
                  setStep(2);
                }}
              >
                التالي — اختيار الإجراء
              </Button>
            </div>
          ) : step === 2 ? (
            <div className="space-y-4">
              <p className="text-sm text-fg-muted">
                اختر الإجراء المناسب لهذه المرة ({occurrenceLabel(occurrence)}
                {note.behaviorDegree ? ` — ${degreeLabel(note.behaviorDegree)}` : ""}). بعد آخر إجراء يُعاد الأخير.
              </p>
              <div className="space-y-2">
                {ladder.map((items, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setStageIdx(i);
                      setPicked(items);
                    }}
                    className={`w-full rounded-[var(--radius-md)] border p-3 text-right transition-colors ${
                      stageIdx === i
                        ? "border-primary bg-primary/5"
                        : "border-border bg-bg hover:border-primary/40"
                    }`}
                  >
                    <p className="text-sm font-semibold">
                      {procedureStageLabel(i + 1)}
                      {i === recommended ? tr(" — المناسب لهذه المرة") : ""}
                      {i === ladder.length - 1 && ladder.length > 1
                        ? tr(" — ويستمر عند التكرار")
                        : ""}
                    </p>
                    <ul className="mt-1 list-disc pr-5 text-xs text-fg-muted">
                      {items.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label>بنود {procedureStageLabel(stageIdx + 1)} — ألغِ ما لا تريد تطبيقه</Label>
                <div className="space-y-1">
                  {official.map((item) => (
                    <label
                      key={item}
                      className={`flex cursor-pointer items-start gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-sm ${
                        picked.includes(item)
                          ? "border-primary bg-primary/5"
                          : "border-border bg-bg"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={picked.includes(item)}
                        onChange={() => toggle(item)}
                      />
                      <span>{item}</span>
                    </label>
                  ))}
                </div>
              </div>
              {actionTypes.filter((a) => a.active && !official.includes(a.name)).length > 0 ? (
                <div className="space-y-1.5">
                  <Label>{tr("خيارات إضافية")}</Label>
                  <div className="space-y-1">
                    {actionTypes
                      .filter((a) => a.active && !official.includes(a.name))
                      .map((item) => (
                        <label
                          key={item.id}
                          className={`flex cursor-pointer items-start gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-sm ${
                            picked.includes(item.name)
                              ? "border-primary bg-primary/5"
                              : "border-border bg-bg"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={picked.includes(item.name)}
                            onChange={() => toggle(item.name)}
                          />
                          <span>{tr(item.name)}</span>
                        </label>
                      ))}
                  </div>
                </div>
              ) : null}
              {picked.some(isOtherChoice) ? (
                <div className="space-y-1.5">
                  <Label htmlFor={`action-other-${note.id}`}>{tr("اكتب الإجراء يدوياً")}</Label>
                  <Input
                    id={`action-other-${note.id}`}
                    value={actionOther}
                    onChange={(e) => setActionOther(e.target.value)}
                    placeholder={tr("صف الإجراء الآخر…")}
                  />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label>{tr("فرص تعويض درجات السلوك")}</Label>
                <OptionChips
                  items={compOptions}
                  selected={pickedComp}
                  onToggle={(name) =>
                    setPickedComp((prev) =>
                      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
                    )
                  }
                  otherValue={compOther}
                  onOtherChange={setCompOther}
                  otherPlaceholder={tr("اكتب فرصة التعويض يدوياً…")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`note-${note.id}`}>{tr("ملاحظة على الإجراء (اختياري)")}</Label>
                <Textarea
                  id={`note-${note.id}`}
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder={tr("تُحفظ مع الإجراء وتظهر في الورقة المطبوعة وفي تنبيه المعلم…")}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setStep(1)}>
                  {tr("رجوع")}
                </Button>
                <Button
                  className="flex-1"
                  disabled={
                    mutation.isPending ||
                    actionText.trim().length < 2 ||
                    (picked.some(isOtherChoice) && actionOther.trim().length < 2) ||
                    (pickedComp.some(isOtherChoice) && compOther.trim().length < 2)
                  }
                  onClick={() => {
                    if (!needsFollowUp) {
                      mutation.mutate("close");
                      return;
                    }
                    if (held && savedKey === actionKey) {
                      setStep(3);
                      return;
                    }
                    mutation.mutate("continue");
                  }}
                >
                  {needsFollowUp ? tr("حفظ والانتقال للطباعة والإرسال") : tr("حفظ وإغلاق الحالة")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-fg-muted">
                {tr("تم حفظ الإجراء. قائمة الرسائل المطلوبة، ثم قائمة الطباعة، حسب الإجراء.")}
              </p>
              <ul className="list-disc space-y-1 pr-5 text-sm">
                {chosenLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {needsInvite ? (
                <div className="space-y-2 rounded-[var(--radius-md)] border border-border bg-bg p-3">
                  <p className="text-sm font-semibold">{tr("موعد الاستدعاء")}</p>
                  <p className="text-xs leading-5 text-fg-muted">
                    {tr("الاستدعاء في يوم دراسي من الأحد إلى الخميس. يمكن تغيير اليوم والتاريخ والوقت.")}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`meet-date-${note.id}`}>{tr("التاريخ")}</Label>
                      <Input
                        id={`meet-date-${note.id}`}
                        type="date"
                        value={meetDate}
                        onChange={(e) => setMeetDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`meet-time-${note.id}`}>{tr("الوقت")}</Label>
                      <Input
                        id={`meet-time-${note.id}`}
                        type="time"
                        value={meetTime}
                        onChange={(e) => setMeetTime(e.target.value)}
                      />
                    </div>
                  </div>
                  {meetWhen ? <p className="text-sm">{meetWhen}</p> : null}
                  {meetWeekend ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm text-danger">{tr("الجمعة والسبت ليسا من أيام الدراسة.")}</p>
                      <Button type="button" size="sm" variant="secondary" onClick={() => setMeetDate(shiftToSchoolDay(meetDate))}>
                        {tr("انقل إلى أقرب يوم دراسي")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{tr("الرسائل المطلوب إرسالها")}</h3>
                {followUp.messages.length === 0 ? (
                  <p className="text-sm text-fg-muted">{tr("هذا الإجراء لا يطلب رسالة لولي الأمر.")}</p>
                ) : (
                  followUp.messages.map((item) => (
                    <div key={item.id} className="space-y-2 rounded-[var(--radius-md)] border border-border bg-bg p-3">
                      <p className="text-sm font-semibold">{tr(item.title)}</p>
                      <WhatsAppDialog
                        embedded
                        studentId={note.studentId}
                        studentName={note.studentName}
                        parentPhone={note.parentPhone}
                        className={note.className}
                        shortName={note.shortName}
                        defaultType="behavior"
                        details={details}
                        sharedText={note.details}
                        subject={note.teacherSubject}
                        createdAt={note.createdAt}
                        periodKey={note.periodKey}
                        noteId={note.id}
                        occurrenceText={occurrenceLabel(occurrence)}
                        behaviorDegree={note.behaviorDegree}
                        deductionText={cutPhrase}
                        initialDraft={parentMessage(item.id)}
                      />
                    </div>
                  ))
                )}
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{tr("الطباعة المطلوبة")}</h3>
                {followUp.papers.length === 0 ? (
                  <p className="text-sm text-fg-muted">{tr("هذا الإجراء لا يطلب ورقة للطباعة.")}</p>
                ) : (
                  followUp.papers.map((paper) => (
                    <div key={paper.kind} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border bg-bg p-3">
                      <div>
                        <p className="text-sm font-semibold">{tr(paper.label)}</p>
                        <p className="text-xs text-fg-muted">
                          {paper.kind === "invite"
                            ? tr("ورقة الاستدعاء بالموعد المختار.")
                            : paper.kind === "deduction"
                              ? tr("ورقة إشعار الخصم بالإجراء المحفوظ.")
                              : paper.kind === "notice"
                                ? tr("ورقة إشعار ولي الأمر بالإجراء المحفوظ.")
                                : tr("ورقة التعهد بالإجراء المحفوظ.")}
                        </p>
                      </div>
                      <PrintFormsButton
                        student={printStudent}
                        notes={printNotes}
                        studentId={note.studentId}
                        defaultKind={paper.kind}
                        label={tr(paper.label)}
                        appointment={paper.kind === "invite" ? appointment : undefined}
                      />
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setStep(2)}>
                  {tr("رجوع")}
                </Button>
                <Button className="flex-1" onClick={finishDialog}>
                  {tr("تم")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </li>
  );
}

function CounselorImproveCard({
  item,
  onOpenStudent,
}: {
  item: BehaviorImprovement;
  onOpenStudent: () => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState(item.counselorNote);
  const mutation = useMutation({
    mutationFn: (status: ImprovementStatus) =>
      followImprovement({ data: { id: item.id, counselorNote: note, status } }),
    onSuccess: () => {
      toast.success(tr("تم حفظ متابعة المرشد"));
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: ["improvements"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
  });
  const tone =
    item.status === "closed" ? "ok" : item.status === "following" ? "primary" : "warn";

  return (
    <li className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="font-semibold hover:underline" onClick={onOpenStudent}>
          <DayName studentId={item.studentId}>{item.studentName}</DayName>
          <ExitPermitBadge studentId={item.studentId} className="ms-1.5" />
        </button>
        <span className="text-xs text-fg-muted">{item.classLabel}</span>
        <Badge tone={tone}>{IMPROVEMENT_STATUS[item.status]}</Badge>
        <span className="ms-auto">
          <ImprovementRecordTools id={item.id} plan={item.plan} />
        </span>
      </div>
      <p className="mt-2 text-sm">{item.plan}</p>
      <p className="mt-1 text-xs text-fg-muted">
        المعلم {item.teacherName}
        {item.teacherSubject ? ` · ${item.teacherSubject}` : ""} · {formatStamp(item.createdAt)}
      </p>
      {item.teacherFollowup ? (
        <p className="mt-1 text-xs text-fg-muted">متابعة المعلم: {item.teacherFollowup}</p>
      ) : null}
      <Textarea
        className="mt-3 min-h-16"
        placeholder={tr("ملاحظة المرشد الطلابي…")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate("following")}
        >
          متابعة
        </Button>
        <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate("closed")}>
          إغلاق الخطة
        </Button>
      </div>
    </li>
  );
}
