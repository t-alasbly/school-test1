import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { NoteSession } from "@/components/note-session";
import { PrintFormsButton } from "@/components/print-forms";
import { ImprovementRecordTools, NoteRecordTools } from "@/components/record-actions";
import { StudentSheet } from "@/components/student-sheet";
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
import { rangeFromPreset } from "@/components/attendance-roster";
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
} from "@/lib/school/constants";
import { staffCan } from "@/lib/school/permissions";
import type { BehaviorImprovement, ImprovementStatus, NoteRecord } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";

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
  const { staff } = useWorkspace();
  const canAct = staffCan(staff, "takeActions");
  const canImprove = staffCan(staff, "acceptImprovements");
  const allowed = canAct || canImprove;
  const [activeStudent, setActiveStudent] = useState<number | null>(studentParam ?? null);
  const bounds = rangeFromPreset(rangeParam);
  const query = useQuery({
    queryKey: ["admin"],
    queryFn: () => getAdminDashboard(),
    refetchInterval: 5000,
    enabled: allowed && !typeParam,
  });
  const filtered = useQuery({
    queryKey: ["followup-notes", typeParam, rangeParam],
    queryFn: () =>
      listFollowupNotes({
        data: {
          type: typeParam as "absence" | "late" | "homework" | "behavior",
          from: bounds.from,
          to: bounds.to,
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
      ? "المخالفات"
      : typeParam === "homework"
        ? "الواجبات"
        : typeParam === "absence"
          ? "غياب الحصة"
          : typeParam === "late"
            ? "تأخر الحصة"
            : null;

  if (typeParam && filtered.isPending) return <p className="text-fg-muted">جارٍ تحميل الكشف…</p>;
  if (!typeParam && allowed && query.isPending) return <p className="text-fg-muted">جارٍ تحميل اللوحة…</p>;
  if (!typeParam && allowed && (query.isError || !query.data)) return <p className="text-danger">تعذر تحميل البيانات.</p>;

  return (
    <div className="space-y-6">
      {canAct || typeParam ? (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{typeLabel ?? "المخالفات الواردة من المعلمين"}</h2>
        {feed.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center text-sm text-fg-muted">
            {typeParam ? "لا توجد سجلات في هذا النطاق." : "لا توجد ملاحظات بعد. سيظهر هنا كل ما يسجّله المعلمون فورًا."}
          </p>
        ) : (
          <ul className="space-y-2">
            {feed.map((note: any) => (
              <AdminNoteCard
                key={note.id}
                note={note}
                onOpenStudent={() => setActiveStudent(note.studentId)}
              />
            ))}
          </ul>
        )}
      </section>
      ) : null}
      {canImprove && !typeParam ? (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">متابعة تحسين السلوك</h2>
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

function AdminNoteCard({
  note,
  onOpenStudent,
}: {
  note: NoteRecord;
  onOpenStudent: () => void;
}) {
  const { actionTypes, school, behaviorTypes, compensations = [] } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
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

  const mutation = useMutation({
    mutationFn: async () => {
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
      return closeNote({
        data: {
          noteId: note.id,
          actionTaken: composedAction(),
          compensation: compensationText || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("تم حفظ الإجراء وإشعار المعلم");
      setOpen(false);
      setStep(1);
      setActionNote("");
      setActionOther("");
      setPicked([]);
      setPickedComp([]);
      setCompOther("");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
      void queryClient.invalidateQueries({ queryKey: ["student"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });
  const referMutation = useMutation({
    mutationFn: () => referToCounselor({ data: { noteId: note.id } }),
    onSuccess: (res) => {
      toast.success(`أُحيل ${res.studentName} إلى الإرشاد الطلابي`);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: ["counseling-desk"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["student"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر التحويل"),
  });
  const tone = noteTone(note.type, note.status);
  const details =
    note.behaviorTypeName && note.details
      ? `${note.behaviorTypeName} — ${note.details}`
      : note.behaviorTypeName || note.details;
  const actionText = composedAction();

  function toggle(item: string) {
    setPicked((prev) => (prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]));
  }

  return (
    <li className="rounded-[var(--radius-md)] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={tone}>{NOTE_META[note.type].label}</Badge>
            {note.behaviorTypeName ? (
              <Badge tone="danger">{note.behaviorTypeName}</Badge>
            ) : null}
            {note.type === "behavior" ? (
              <Badge tone={note.occurrence > 1 ? "danger" : "default"}>
                {occurrenceLabel(note.occurrence)}
              </Badge>
            ) : null}
            {note.status === "closed" ? <Badge tone="ok">أُغلقت</Badge> : null}
            {note.referCounselor ? <Badge tone="warn">محال للإرشاد</Badge> : null}
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
            {note.studentName}
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
              label="طباعة تعهد"
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
              label="طباعة نموذج"
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
          setOpen(next);
          if (!next) {
            setStep(1);
            setActionNote("");
            setActionOther("");
            setPickedComp([]);
            setCompOther("");
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {step === 1 ? "سجل المخالفة — المرحلة الأولى" : "اختيار الإجراء — المرحلة الثانية"}
            </DialogTitle>
          </DialogHeader>
          {step === 1 ? (
            <div className="space-y-4">
              <p className="text-sm text-fg-muted">
                {note.studentName}
                {note.behaviorTypeName ? ` · ${note.behaviorTypeName}` : ""} ·{" "}
                {occurrenceLabel(occurrence)}
                {note.behaviorDegree ? ` · الدرجة ${note.behaviorDegree}` : ""}
              </p>
              {history.isPending ? (
                <p className="text-sm text-fg-muted">جارٍ تحميل سجل الطالب…</p>
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
                          {item.status === "closed" ? <Badge tone="ok">أُغلقت</Badge> : null}
                          <span className="text-xs text-fg-subtle">{formatStamp(item.createdAt)}</span>
                        </div>
                        <p className="mt-1 font-medium">
                          {item.behaviorTypeName || item.details || "مخالفة سلوكية"}
                        </p>
                        <p className="text-xs text-fg-muted">
                          المعلم {item.teacherName}
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
                  {school.technicalVpName ? ` وإشعار وكيل الشؤون الفنية (${school.technicalVpName})` : " وإشعار وكيل الشؤون الفنية"}.
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
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-fg-muted">
                اختر الإجراء المناسب لهذه المرة ({occurrenceLabel(occurrence)}
                {note.behaviorDegree ? ` — الدرجة ${degreeLabel(note.behaviorDegree)}` : ""}). بعد آخر إجراء يُعاد الأخير.
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
                      {i === recommended ? " — المناسب لهذه المرة" : ""}
                      {i === ladder.length - 1 && ladder.length > 1
                        ? " — ويستمر عند التكرار"
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
                  <Label>خيارات إضافية</Label>
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
                          <span>{item.name}</span>
                        </label>
                      ))}
                  </div>
                </div>
              ) : null}
              {picked.some(isOtherChoice) ? (
                <div className="space-y-1.5">
                  <Label htmlFor={`action-other-${note.id}`}>اكتب الإجراء يدوياً</Label>
                  <Input
                    id={`action-other-${note.id}`}
                    value={actionOther}
                    onChange={(e) => setActionOther(e.target.value)}
                    placeholder="صف الإجراء الآخر…"
                  />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label>فرص تعويض درجات السلوك</Label>
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
                  otherPlaceholder="اكتب فرصة التعويض يدوياً…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`note-${note.id}`}>ملاحظة على الإجراء (اختياري)</Label>
                <Textarea
                  id={`note-${note.id}`}
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder="تُحفظ مع الإجراء وتظهر في الورقة المطبوعة وفي تنبيه المعلم…"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setStep(1)}>
                  رجوع
                </Button>
                <Button
                  className="flex-1"
                  disabled={
                    mutation.isPending ||
                    actionText.trim().length < 2 ||
                    (picked.some(isOtherChoice) && actionOther.trim().length < 2) ||
                    (pickedComp.some(isOtherChoice) && compOther.trim().length < 2)
                  }
                  onClick={() => mutation.mutate()}
                >
                  حفظ وإغلاق الحالة
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
      toast.success("تم حفظ متابعة المرشد");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: ["improvements"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });
  const tone =
    item.status === "closed" ? "ok" : item.status === "following" ? "primary" : "warn";

  return (
    <li className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="font-semibold hover:underline" onClick={onOpenStudent}>
          {item.studentName}
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
        placeholder="ملاحظة المرشد الطلابي…"
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
