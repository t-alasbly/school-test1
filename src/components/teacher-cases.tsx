import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { NoteThread } from "@/components/note-thread";
import { NoteRecordTools } from "@/components/record-actions";
import { StudentSheet } from "@/components/student-sheet";
import { getDeskNotes } from "@/lib/school/api";
import { formatStampCalendar } from "@/lib/school/calendar";
import { NOTE_META, classLabel, occurrenceLabel, periodShort } from "@/lib/school/constants";
import { staffCan } from "@/lib/school/permissions";
import { useCalendar } from "@/lib/school/use-calendar";
import type { NoteRecord } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

type Filter = "all" | "counseling" | "health" | "vp";

function destOf(note: NoteRecord): "counseling" | "health" | "vp" {
  if (note.dest === "health") return "health";
  if (note.dest === "counselor" || note.referCounselor) return "counseling";
  return "vp";
}

function destLabel(dest: "counseling" | "health" | "vp") {
  if (dest === "counseling") return "محالة للمرشد الطلابي";
  if (dest === "health") return "محالة للمرشد الصحي";
  return "لوكيل شؤون الطلاب";
}

function destWait(dest: "counseling" | "health" | "vp") {
  if (dest === "counseling") return "بانتظار المرشد الطلابي";
  if (dest === "health") return "بانتظار المرشد الصحي";
  return "تنتظر إجراء الوكيل";
}

export function TeacherCases() {
  const { staff, school } = useWorkspace();
  const calendar = useCalendar();
  const canEdit = staffCan(staff, "editRecords");
  const [filter, setFilter] = useState<Filter>("all");
  const [studentId, setStudentId] = useState<number | null>(null);
  const query = useQuery({
    queryKey: ["desk-notes", "all", false],
    queryFn: () => getDeskNotes({ data: { status: "all" } }),
  });
  const notes = ((query.data as { notes?: NoteRecord[] } | undefined)?.notes ?? []) as NoteRecord[];

  const shown = useMemo(() => {
    if (filter === "counseling") return notes.filter((n) => destOf(n) === "counseling");
    if (filter === "health") return notes.filter((n) => destOf(n) === "health");
    if (filter === "vp") return notes.filter((n) => destOf(n) === "vp");
    return notes;
  }, [notes, filter]);

  const counts = useMemo(
    () => ({
      all: notes.length,
      counseling: notes.filter((n) => destOf(n) === "counseling").length,
      health: notes.filter((n) => destOf(n) === "health").length,
      vp: notes.filter((n) => destOf(n) === "vp").length,
    }),
    [notes],
  );

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "كل ما حرّرته" },
    { id: "counseling", label: "للمرشد الطلابي" },
    { id: "health", label: "للمرشد الصحي" },
    { id: "vp", label: "لوكيل شؤون الطلاب" },
  ];

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <p className="text-sm text-fg-muted">
          صفحة خاصة بك وبطلابك — المخالفات التي حرّرتها، وما أُحيل للإرشاد أو لوكيل شؤون الطلاب، والإجراء المتخذ عليها
        </p>
        <h2 className="font-display text-xl font-semibold tracking-tight">حالات طلابي</h2>
      </header>
      <nav className="flex flex-wrap gap-1.5">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
              filter === item.id
                ? "border-primary bg-primary text-primary-fg"
                : "border-border bg-bg-elevated text-fg-muted hover:text-fg",
            )}
          >
            {item.label}
            <span className="tabular-nums opacity-80">{counts[item.id]}</span>
          </button>
        ))}
      </nav>
      {query.isPending ? (
        <p className="text-sm text-fg-muted">جارٍ تحميل حالاتك…</p>
      ) : query.isError ? (
        <p className="text-sm text-danger">تعذر تحميل الحالات.</p>
      ) : shown.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center text-sm text-fg-muted">
          لا حالات في هذا النطاق. ما تحرّره على طلابك يظهر هنا، وكذلك ما يُحال للإرشاد أو لوكيل شؤون الطلاب والإجراء المتخذ.
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((note) => {
            const meta = NOTE_META[note.type];
            const dest = destOf(note);
            const waiting = note.status !== "closed";
            return (
              <li
                key={note.id}
                className={cn(
                  "rounded-[var(--radius-lg)] border border-border bg-card p-4 shadow-[var(--shadow-card)]",
                  dest === "counseling" ? "border-s-[3px] border-s-warn" : "border-s-[3px] border-s-primary",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button type="button" className="min-w-0 flex-1 text-right" onClick={() => setStudentId(note.studentId)}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {note.behaviorTypeName ? <Badge tone="danger">{note.behaviorTypeName}</Badge> : null}
                      <Badge tone={dest === "vp" ? "primary" : "warn"}>
                        {destLabel(dest)}
                      </Badge>
                      <Badge tone={waiting ? "warn" : "ok"}>
                        {waiting ? destWait(dest) : "رُد عليها"}
                      </Badge>
                      {note.occurrence > 1 ? <Badge tone="danger">{occurrenceLabel(note.occurrence)}</Badge> : null}
                    </div>
                    <p className="mt-2 text-lg font-semibold leading-6">{note.studentName}</p>
                    <p className="text-xs text-fg-muted">
                      {classLabel(note.shortName, note.className)}
                      {note.periodKey ? ` · ${periodShort(note.periodKey, school.season, school.schedules)}` : ""}
                      {` · ${formatStampCalendar(note.createdAt, calendar)}`}
                    </p>
                    {note.details ? <p className="mt-1 text-sm leading-6">{note.details}</p> : null}
                    {note.suggestedAction ? (
                      <p className="mt-2 text-sm text-fg-muted">الإجراء المقترح: {note.suggestedAction}</p>
                    ) : null}
                    {note.status === "closed" && note.actionTaken ? (
                      <p className="mt-2 rounded-[var(--radius-sm)] bg-ok-soft px-3 py-2 text-sm text-ok">
                        {dest === "vp" ? "إجراء الوكيل: " : "إجراء المرشد: "}
                        {note.actionTaken}
                      </p>
                    ) : (
                      <p className="mt-2 rounded-[var(--radius-sm)] bg-muted px-3 py-2 text-sm text-fg-muted">
                        {destWait(dest)}
                      </p>
                    )}
                    {note.compensation ? (
                      <p className="mt-2 rounded-[var(--radius-sm)] bg-muted px-3 py-2 text-sm">
                        تعويض الدرجات: {note.compensation}
                      </p>
                    ) : null}
                  </button>
                  {canEdit ? <NoteRecordTools note={note} /> : null}
                </div>
                <NoteThread noteId={note.id} dest={dest === "health" ? "health" : dest === "counseling" ? "counselor" : "vp"} compact />
              </li>
            );
          })}
        </ul>
      )}
      <StudentSheet
        studentId={studentId}
        open={studentId != null}
        onOpenChange={(open) => {
          if (!open) setStudentId(null);
        }}
      />
    </div>
  );
}
