import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StudentSheet } from "@/components/student-sheet";
import { getDeskNotes } from "@/lib/school/api";
import { tr } from "@/lib/school/i18n";
import { staffCan } from "@/lib/school/permissions";
import type { NoteRecord } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { AdminNoteCard } from "@/routes/admin.behavior";

export function ActionQueue() {
  const { staff } = useWorkspace();
  const allowed = staffCan(staff, "takeActions");
  const [studentId, setStudentId] = useState<number | null>(null);
  const query = useQuery({
    queryKey: ["desk-notes", "actions"],
    queryFn: () => getDeskNotes({ data: { scope: "actions" } }),
    enabled: allowed,
  });
  if (!allowed) return null;
  const notes = ((query.data as { notes?: NoteRecord[] } | undefined)?.notes ?? []) as NoteRecord[];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{tr("مخالفات بانتظار الإجراء")}</h3>
      {query.isPending ? (
        <p className="text-sm text-fg-muted">{tr("جارٍ تحميل المخالفات…")}</p>
      ) : query.isError ? (
        <p className="text-sm text-danger">{tr("تعذر تحميل المخالفات.")}</p>
      ) : notes.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center text-sm text-fg-muted">
          {tr("لا توجد مخالفات بانتظار الإجراء.")}
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <AdminNoteCard key={note.id} note={note} onOpenStudent={() => setStudentId(note.studentId)} />
          ))}
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
