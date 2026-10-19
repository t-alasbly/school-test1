import { useQuery } from "@tanstack/react-query";
import { tr } from "@/lib/school/i18n";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { NoteThread } from "@/components/note-thread";
import { NoteRecordTools } from "@/components/record-actions";
import { PrintFormsButton } from "@/components/print-forms";
import { StudentSheet } from "@/components/student-sheet";
import { ExitPermitBadge } from "@/components/exit-permit";
import { DayName } from "@/components/day-name";
import { Select } from "@/components/ui/select";
import { getDeskNotes, listStaffDirectory } from "@/lib/school/api";
import { NOTE_META, ROLE_LABEL, classLabel, formatStamp, occurrenceLabel, periodShort } from "@/lib/school/constants";
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
    return <p className="text-sm text-fg-muted">{tr("جارٍ تحميل ملاحظاتك…")}</p>;
  }
  if (query.isError) {
    return <p className="text-sm text-danger">{tr("تعذر تحميل الملاحظات.")}</p>;
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
            open: referred ? tr("بانتظار المرشد") : tr("تنتظر الرد"),
            closed: referred ? tr("اتخذ المرشد إجراءً") : tr("رُد عليها"),
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
                    {note.behaviorTypeName ? <Badge tone="danger">{tr(note.behaviorTypeName)}</Badge> : null}
                    <Badge tone={note.status === "closed" ? "ok" : "warn"}>{statusLabel[note.status]}</Badge>
                    {note.occurrence > 1 ? <Badge tone="danger">{occurrenceLabel(note.occurrence)}</Badge> : null}
                  </div>
                  <p className="mt-2 flex flex-wrap items-center gap-1.5 text-lg font-semibold leading-6">
                    <DayName studentId={note.studentId}>{note.studentName}</DayName>
                    <ExitPermitBadge studentId={note.studentId} />
                  </p>
                  <p className="text-xs text-fg-muted">
                    {classLabel(note.shortName, note.className)}
                    {note.periodKey ? ` · ${periodShort(note.periodKey, school.season, school.schedules)}` : ""}
                    {` · ${formatStamp(note.createdAt)}`}
                  </p>
                  {note.details ? <p className="mt-1 text-sm leading-6">{note.details}</p> : null}
                  <p className="mt-1 text-xs text-fg-muted">
                    {note.teacherName}
                    {note.teacherSubject ? ` · ${note.teacherSubject}` : ""}
                    {note.enteredByName && note.enteredByName !== note.teacherName ? ` · ${tr("المسجل")}: ${note.enteredByName}` : ""}
                  </p>
                  {note.suggestedAction ? (
                    <p className="mt-2 text-sm text-fg-muted">
                      {note.suggestedAction.startsWith("إشعار ولي الأمر:")
                        ? tr("بانتظار إرسال الإشعار من المرشد أو وكيل شؤون الطلاب")
                        : `${tr("الإجراء المقترح")}: ${note.suggestedAction}`}
                    </p>
                  ) : null}
                  {note.status === "closed" && note.actionTaken ? (
                    <p className="mt-2 rounded-[var(--radius-sm)] bg-ok-soft px-3 py-2 text-sm text-ok">
                      {referred ? tr("إجراء المرشد: ") : tr("الإجراء: ")}
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
                {(canEdit || note.teacherId === staff.userId) ? <NoteRecordTools note={note} teacherId={note.teacherId} /> : null}
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

export function ColleagueDesks() {
  const { staff, school } = useWorkspace();
  const allowed = staffCan(staff, "viewAllViolations");
  const [teacherId, setTeacherId] = useState("");
  const directory = useQuery({
    queryKey: ["staff-directory"],
    queryFn: () => listStaffDirectory(),
    enabled: allowed,
  });
  const notesQuery = useQuery({
    queryKey: ["desk-notes", "colleague", teacherId],
    queryFn: () => getDeskNotes({ data: { status: "all", teacherId } }),
    enabled: allowed && Boolean(teacherId),
  });
  if (!allowed) return null;
  const people = ((directory.data as { staff?: { userId: string; displayName: string; role: string; subject: string }[] } | undefined)?.staff ?? [])
    .filter((person) => person.userId !== staff.userId);
  const notes = ((notesQuery.data as { notes?: NoteRecord[] } | undefined)?.notes ?? []) as NoteRecord[];

  return (
    <section className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-card p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{tr("مكاتب الزملاء")}</h3>
        <p className="text-xs leading-5 text-fg-muted">
          {tr("لمن لديه صلاحية الاطلاع على المخالفات، زميلاً كان أو مسؤولاً. يمكن فتح مكتب الزميل والطباعة منه.")}
        </p>
      </div>
      <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} aria-label={tr("اختر مكتباً")}>
        <option value="">{tr("اختر مكتب زميل…")}</option>
        {people.map((person) => (
          <option key={person.userId} value={person.userId}>
            {person.displayName}
            {person.subject ? ` — ${person.subject}` : ""}
            {` — ${ROLE_LABEL[person.role as keyof typeof ROLE_LABEL] ?? person.role}`}
          </option>
        ))}
      </Select>
      {!teacherId ? null : notesQuery.isPending ? (
        <p className="text-sm text-fg-muted">{tr("جارٍ فتح المكتب…")}</p>
      ) : notesQuery.isError ? (
        <p className="text-sm text-danger">{tr("تعذر فتح مكتب الزميل.")}</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-fg-muted">{tr("لا توجد ملاحظات في هذا المكتب.")}</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li key={note.id} className="rounded-[var(--radius-md)] border border-border bg-bg p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                    <DayName studentId={note.studentId}>{note.studentName}</DayName>
                    <ExitPermitBadge studentId={note.studentId} />
                  </p>
                  <p className="text-xs text-fg-muted">
                    {NOTE_META[note.type].label} · {classLabel(note.shortName, note.className)}
                    {note.periodKey ? ` · ${periodShort(note.periodKey, school.season, school.schedules)}` : ""}
                    {` · ${formatStamp(note.createdAt)}`}
                  </p>
                  {note.details ? <p className="mt-1 text-sm">{note.details}</p> : null}
                  {note.enteredByName && note.enteredByName !== note.teacherName ? <p className="text-xs text-fg-muted">{tr("أضافها")} {note.enteredByName}</p> : null}
                  {note.occurrence > 1 ? <p className="text-xs text-fg-muted">{occurrenceLabel(note.occurrence)}</p> : null}
                  {note.actionTaken ? <p className="mt-1 text-sm text-ok">{tr("الإجراء: ")}{note.actionTaken}</p> : null}
                </div>
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
                      actionTaken: note.actionTaken ?? "",
                      createdAt: note.createdAt,
                      teacherName: note.teacherName,
                      teacherSubject: note.teacherSubject,
                      occurrence: note.occurrence,
                      compensation: note.compensation,
                    },
                  ]}
                  studentId={note.studentId}
                  defaultKind={note.type === "absence" ? "attendance" : "pledge"}
                  label={tr("طباعة")}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
