import { createFileRoute } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  FORM_META,
  FORM_ORDER,
  OfficialForm,
  notesToPrintable,
  type FormKind,
  type FormOverrides,
} from "@/components/print-forms";
import { Button } from "@/components/ui/button";
import { PageHelp } from "@/components/page-help";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getReport, getStudentNotes } from "@/lib/school/api";
import { NOTE_META, formatDay, weekdayName } from "@/lib/school/constants";
import { printElement } from "@/lib/school/print";
import { staffCan } from "@/lib/school/permissions";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/print/forms")({ component: FormsBody });

function FormsBody() {
  const { school, staff } = useWorkspace();
  const sheetRef = useRef<HTMLElement>(null);
  const [stageId, setStageId] = useState("");
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [kind, setKind] = useState<FormKind>("pledge");
  const [noteIdx, setNoteIdx] = useState(0);
  const [manual, setManual] = useState(false);
  const [overrides, setOverrides] = useState<FormOverrides>({});
  const [showCompensation, setShowCompensation] = useState(true);
  const official = staffCan(staff, "viewOfficialPrint");

  const report = useQuery({
    queryKey: ["report", "forms"],
    queryFn: () => getReport({ data: {} }),
  });

  const stages = report.data?.stages ?? [];
  const classes = (report.data?.classes ?? []).filter((c) =>
    stageId ? c.stageId === Number(stageId) : true,
  );
  const students = (report.data?.students ?? []).filter((s) => {
    if (classId) return s.classId === Number(classId);
    if (stageId) return s.stageId === Number(stageId);
    return true;
  });

  const studentQuery = useQuery({
    queryKey: ["student", studentId, "forms"],
    queryFn: () => getStudentNotes({ data: { studentId: Number(studentId) } }),
    enabled: Boolean(studentId),
  });

  const selectedStudent = studentQuery.data?.student;
  const notes = useMemo(
    () => notesToPrintable(studentQuery.data?.notes ?? []),
    [studentQuery.data],
  );

  const selectedNote = notes[noteIdx] ?? notes[0] ?? null;
  if (!official) {
    return <p className="text-fg-muted">{tr("التعهد وخطابات ولي الأمر لمن مُنحت له هذه الصلاحية.")}</p>;
  }
  const fields: [keyof FormOverrides, string, string][] = [
    ["name", tr("اسم الطالب"), selectedStudent?.name ?? ""],
    ["classLine", tr("الصف / الفصل"), selectedStudent?.classLabel ?? ""],
    ["violation", tr("المخالفة / الموضوع"), selectedNote?.behaviorTypeName || selectedNote?.details || ""],
    ["degree", tr("الدرجة"), selectedNote?.behaviorDegree ? String(selectedNote.behaviorDegree) : ""],
    ["day", tr("التاريخ"), selectedNote ? formatDay(selectedNote.occurredAt || selectedNote.createdAt) : ""],
    ["weekday", tr("اليوم"), selectedNote ? weekdayName(selectedNote.occurredAt || selectedNote.createdAt) : ""],
    ["period", tr("الحصة"), ""],
    ["subject", tr("المادة"), selectedNote?.teacherSubject || ""],
  ];

  return (
    <div className="space-y-6">
      <header className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            {tr("النماذج")}
            <PageHelp text={tr("نماذج الوزارة — قواعد السلوك والمواظبة 1447هـ")} />
          </h1>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={manual ? "default" : "secondary"}
            disabled={!selectedStudent}
            onClick={() => setManual((v) => !v)}
          >
            تعبئة يدوية
          </Button>
          <Button
            disabled={!selectedStudent}
            onClick={() => {
              if (sheetRef.current) printElement(sheetRef.current);
            }}
          >
            <Printer className="size-4" />
            طباعة النموذج
          </Button>
        </div>
      </header>
      <form className="no-print grid gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="f-stage">{tr("المرحلة")}</Label>
          <Select
            id="f-stage"
            value={stageId}
            onChange={(e) => {
              setStageId(e.target.value);
              setClassId("");
              setStudentId("");
            }}
          >
            <option value="">{tr("الكل")}</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-class">{tr("الفصل")}</Label>
          <Select
            id="f-class"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setStudentId("");
            }}
          >
            <option value="">{tr("الكل")}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-student">{tr("اسم الطالب")}</Label>
          <Select
            id="f-student"
            value={studentId}
            onChange={(e) => {
              setStudentId(e.target.value);
              setNoteIdx(0);
            }}
          >
            <option value="">{tr("اختر طالبًا…")}</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-kind">{tr("النموذج")}</Label>
          <Select id="f-kind" value={kind} onChange={(e) => setKind(e.target.value as FormKind)}>
            {FORM_ORDER.map((k) => (
              <option key={k} value={k}>{FORM_META[k].title}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="f-note">{tr("المخالفة أو الملاحظة")}</Label>
          <Select
            id="f-note"
            value={String(noteIdx)}
            onChange={(e) => setNoteIdx(Number(e.target.value))}
            disabled={notes.length === 0}
          >
            {notes.length === 0 ? (
              <option value="0">{tr("بدون ملاحظة مسجّلة — النموذج للتعبئة اليدوية")}</option>
            ) : notes.map((n, i) => (
              <option key={`${n.createdAt}-${i}`} value={i}>
                {(n.type === "absence" || n.type === "late" ? tr(NOTE_META[n.type].label) : n.behaviorTypeName || n.details || tr("ملاحظة")) + (n.createdAt ? ` — ${n.createdAt.slice(0, 10)}` : "")}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex min-h-11 items-center gap-2 self-end rounded-[var(--radius-sm)] border border-border bg-bg-elevated px-3 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={showCompensation && Boolean(selectedNote?.compensation)}
            disabled={!selectedNote?.compensation}
            onChange={(e) => setShowCompensation(e.target.checked)}
          />
          إظهار فرص التعويض في التعهد والخطاب
        </label>
      </form>
      {selectedStudent && manual ? (
        <div className="no-print grid gap-3 rounded-[var(--radius-md)] border border-border bg-card p-3 sm:grid-cols-2">
          {fields.map(([key, label, fallback]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`f-ov-${key}`}>{label}</Label>
              <input
                id={`f-ov-${key}`}
                className="h-11 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 text-sm"
                value={overrides[key] ?? fallback}
                onChange={(e) => setOverrides((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="f-ov-action">{tr("الإجراءات (سطر لكل إجراء)")}</Label>
            <textarea
              id="f-ov-action"
              className="min-h-20 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 py-2 text-sm"
              value={overrides.actionText ?? ""}
              onChange={(e) => setOverrides((prev) => ({ ...prev, actionText: e.target.value }))}
              placeholder={tr("اتركه فارغاً لاستخدام الإجراء الرسمي تلقائياً")}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="f-ov-extra">{tr("بيانات إضافية / ملاحظات يدوية")}</Label>
            <textarea
              id="f-ov-extra"
              className="min-h-16 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 py-2 text-sm"
              value={overrides.extra ?? ""}
              onChange={(e) => setOverrides((prev) => ({ ...prev, extra: e.target.value }))}
            />
          </div>
        </div>
      ) : null}
      {selectedStudent ? (
        <OfficialForm
          ref={sheetRef}
          kind={kind}
          student={{
            name: selectedStudent.name,
            classLabel: selectedStudent.classLabel,
            className: selectedStudent.className,
            stageName: selectedStudent.stageName,
            parentPhone: selectedStudent.parentPhone,
          }}
          notes={notes}
          selectedNote={selectedNote}
          school={school}
          overrides={manual ? overrides : undefined}
          showCompensation={showCompensation && Boolean(selectedNote?.compensation)}
        />
      ) : (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-border p-10 text-center text-sm text-fg-muted">
          اختر اسم الطالب ثم النموذج المراد طباعته.
        </p>
      )}
    </div>
  );
}
