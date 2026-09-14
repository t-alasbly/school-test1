import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { AppGate } from "@/components/app-gate";
import {
  FORM_META,
  FORM_ORDER,
  OfficialForm,
  notesToPrintable,
  type FormKind,
  type FormOverrides,
} from "@/components/print-forms";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getReport, getStudentNotes } from "@/lib/school/api";
import { formatDay, weekdayName } from "@/lib/school/constants";
import { printElement } from "@/lib/school/print";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/forms")({ component: FormsPage });

function FormsPage() {
  return (
    <AppGate>
      <FormsBody />
    </AppGate>
  );
}

function FormsBody() {
  const { school } = useWorkspace();
  const sheetRef = useRef<HTMLElement>(null);
  const [stageId, setStageId] = useState("");
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [kind, setKind] = useState<FormKind>("pledge");
  const [noteIdx, setNoteIdx] = useState(0);
  const [manual, setManual] = useState(false);
  const [overrides, setOverrides] = useState<FormOverrides>({});
  const [showCompensation, setShowCompensation] = useState(true);

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

  return (
    <div className="space-y-6">
      <header className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-fg-muted">نماذج الوزارة — قواعد السلوك والمواظبة 1447هـ</p>
          <h1 className="text-3xl font-semibold tracking-tight">طباعة نماذج</h1>
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
          <Label htmlFor="f-stage">المرحلة</Label>
          <Select
            id="f-stage"
            value={stageId}
            onChange={(e) => {
              setStageId(e.target.value);
              setClassId("");
              setStudentId("");
            }}
          >
            <option value="">الكل</option>
            {stages.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-class">الفصل</Label>
          <Select
            id="f-class"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setStudentId("");
            }}
          >
            <option value="">الكل</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-student">اسم الطالب</Label>
          <Select
            id="f-student"
            value={studentId}
            onChange={(e) => {
              setStudentId(e.target.value);
              setNoteIdx(0);
            }}
          >
            <option value="">اختر طالبًا…</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-kind">النموذج</Label>
          <Select id="f-kind" value={kind} onChange={(e) => setKind(e.target.value as FormKind)}>
            {FORM_ORDER.map((k) => (
              <option key={k} value={k}>
                {FORM_META[k].title}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="f-note">المخالفة أو الملاحظة</Label>
          <Select
            id="f-note"
            value={String(noteIdx)}
            onChange={(e) => setNoteIdx(Number(e.target.value))}
            disabled={notes.length === 0}
          >
            {notes.length === 0 ? (
              <option value="0">بدون ملاحظة مسجّلة — النموذج للتعبئة اليدوية</option>
            ) : (
              notes.map((n, i) => (
                <option key={`${n.createdAt}-${i}`} value={i}>
                  {(n.behaviorTypeName || n.details || "ملاحظة") +
                    (n.createdAt ? ` — ${n.createdAt.slice(0, 10)}` : "")}
                </option>
              ))
            )}
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
          {(
            [
              ["name", "اسم الطالب", selectedStudent.name],
              ["classLine", "الصف / الفصل", selectedStudent.classLabel],
              ["violation", "المخالفة / الموضوع", selectedNote?.behaviorTypeName || selectedNote?.details || ""],
              ["degree", "الدرجة", selectedNote?.behaviorDegree ? String(selectedNote.behaviorDegree) : ""],
              ["day", "التاريخ", selectedNote ? formatDay(selectedNote.occurredAt || selectedNote.createdAt) : ""],
              ["weekday", "اليوم", selectedNote ? weekdayName(selectedNote.occurredAt || selectedNote.createdAt) : ""],
              ["period", "الحصة", ""],
              ["subject", "المادة", selectedNote?.teacherSubject || ""],
            ] as const
          ).map(([key, label, fallback]) => (
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
            <Label htmlFor="f-ov-action">الإجراءات (سطر لكل إجراء)</Label>
            <textarea
              id="f-ov-action"
              className="min-h-20 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 py-2 text-sm"
              value={overrides.actionText ?? ""}
              onChange={(e) => setOverrides((prev) => ({ ...prev, actionText: e.target.value }))}
              placeholder="اتركه فارغاً لاستخدام الإجراء الرسمي تلقائياً"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="f-ov-extra">بيانات إضافية / ملاحظات يدوية</Label>
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
