import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { NoteThread } from "@/components/note-thread";
import { NoteRecordTools } from "@/components/record-actions";
import { StudentSheet } from "@/components/student-sheet";
import { getDeskNotes } from "@/lib/school/api";
import { NOTE_META, classLabel, formatStamp, occurrenceLabel, periodShort } from "@/lib/school/constants";
import { staffCan } from "@/lib/school/permissions";
import type { NoteRecord, NoteStatus } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";

export function DeskNotesList({
  status,
  empty,
  referred,
}: {
  status: "all" | "open" | "closed";
  empty: string;
  referred?: boolean;
}) {
  const { staff, school } = useWorkspace();
  const canEdit = staffCan(staff, "editRecords");
  const [studentId, setStudentId] = useState<number | null>(null);
  const query = useQuery({
    queryKey: ["desk-notes", status, referred ?? false],
    queryFn: () => getDeskNotes({ data: { status, referred: referred || undefined } }),
  });
  const notes = ((query.data as { notes?: NoteRecord[] } | undefined)?.notes ?? []) as NoteRecord[];

  if (query.isPending) {
    return <p className="text-sm text-fg-muted">جارٍ تحميل ملاحظاتك…</p>;
  }
  if (query.isError) {
    return <p className="text-sm text-danger">تعذر تحميل الملاحظات.</p>;
  }
  if (notes.length === 0) {
    return (
      <p className="rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center text-sm text-fg-muted">
        {empty}
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {notes.map((note) => {
          const meta = NOTE_META[note.type];
          const statusLabel: Record<NoteStatus, string> = {
            open: referred ? "بانتظار المرشد" : "تنتظر الرد",
            closed: referred ? "اتخذ المرشد إجراءً" : "رُد عليها",
          };
          return (
            <li
              key={note.id}
              className="rounded-[var(--radius-md)] border border-border bg-card p-4 shadow-[var(--shadow-card)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button type="button" className="min-w-0 flex-1 text-right" onClick={() => setStudentId(note.studentId)}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    {note.behaviorTypeName ? <Badge tone="danger">{note.behaviorTypeName}</Badge> : null}
                    <Badge tone={note.status === "closed" ? "ok" : "warn"}>{statusLabel[note.status]}</Badge>
                    {note.occurrence > 1 ? <Badge tone="danger">{occurrenceLabel(note.occurrence)}</Badge> : null}
                  </div>
                  <p className="mt-2 text-lg font-semibold leading-6">{note.studentName}</p>
                  <p className="text-xs text-fg-muted">
                    {classLabel(note.shortName, note.className)}
                    {note.periodKey ? ` · ${periodShort(note.periodKey, school.season, school.schedules)}` : ""}
                    {` · ${formatStamp(note.createdAt)}`}
                  </p>
                  {note.details ? <p className="mt-1 text-sm leading-6">{note.details}</p> : null}
                  {note.suggestedAction ? (
                    <p className="mt-2 text-sm text-fg-muted">الإجراء المقترح: {note.suggestedAction}</p>
                  ) : null}
                  {note.status === "closed" && note.actionTaken ? (
                    <p className="mt-2 rounded-[var(--radius-sm)] bg-ok-soft px-3 py-2 text-sm text-ok">
                      {referred ? "إجراء المرشد: " : "الإجراء: "}
                      {note.actionTaken}
                    </p>
                  ) : referred && note.status === "open" ? (
                    <p className="mt-2 rounded-[var(--radius-sm)] bg-warn-soft px-3 py-2 text-sm text-warn">
                      أُحيلت للمرشد ولم يُسجَّل إجراء بعد
                    </p>
                  ) : null}
                  {note.compensation ? (
                    <p className="mt-2 rounded-[var(--radius-sm)] bg-muted px-3 py-2 text-sm">
                      تعويض الدرجات: {note.compensation}
                    </p>
                  ) : null}
                </button>
                {canEdit ? <NoteRecordTools note={note} /> : null}
              </div>
              <NoteThread
                noteId={note.id}
                dest={note.dest ?? (note.referCounselor ? "counselor" : "vp")}
                compact
              />
            </li>
          );
        })}
      </ul>
      <StudentSheet
        studentId={studentId}
        open={studentId != null}
        onOpenChange={(open) => {
          if (!open) setStudentId(null);
        }}
      />
    </>
  );
}
