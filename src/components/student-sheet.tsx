import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { ImproveDialog } from "@/components/improve-dialog";
import { NoteSession } from "@/components/note-session";
import { NoteActions } from "@/components/note-actions";
import { StaffMailDialog } from "@/components/staff-mail-dialog";
import { StaffMailInbox } from "@/components/staff-mail-inbox";
import { PrintFormsButton } from "@/components/print-forms";
import { NoteRecordTools, ImprovementRecordTools, MessageRecordTools } from "@/components/record-actions";
import { EditStudentButton } from "@/components/student-editor";
import { WhatsAppDialog } from "@/components/whatsapp-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { followImprovement, getStudentNotes, listImprovements, listParentMessages } from "@/lib/school/api";
import {
  IMPROVEMENT_STATUS,
  NOTE_META,
  degreeLabel,
  formatStamp,
  messageKindLabel,
  noteTone,
  occurrenceLabel,
} from "@/lib/school/constants";
import { NoteThread } from "@/components/note-thread";
import { staffCan } from "@/lib/school/permissions";
import type { BehaviorImprovement, ImprovementStatus, MessageKind, NoteDest } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";

export function StudentSheet({
  studentId,
  open,
  onOpenChange,
}: {
  studentId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { school, staff } = useWorkspace();
  const query = useQuery({
    queryKey: ["student", studentId],
    queryFn: () => getStudentNotes({ data: { studentId: studentId! } }),
    enabled: open && studentId != null,
  });
  const improvements = useQuery({
    queryKey: ["improvements", studentId],
    queryFn: () => listImprovements({ data: { studentId: studentId! } }),
    enabled: open && studentId != null,
  });
  const messages = useQuery({
    queryKey: ["parent-messages", studentId],
    queryFn: () => listParentMessages({ data: { studentId: studentId! } }),
    enabled: open && studentId != null,
  });

  const student = query.data?.student;
  const notes = query.data?.notes ?? [];
  const scoped = query.data?.scopedToTeacher;
  const canEditRecords = staffCan(staff, "editRecords");
  const canMessage = staffCan(staff, "sendMessages");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="max-w-4xl overflow-hidden">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            <span className="min-w-0">{student?.name ?? "سجل الطالب"}</span>
            {student ? (
              <StaffMailDialog studentId={student.id} studentName={student.name} compact />
            ) : null}
          </SheetTitle>
          <p className="text-sm text-fg-muted">
            {student?.classLabel}
            {canMessage && student?.parentPhone ? ` · ${student.parentPhone}` : ""}
          </p>
          {student ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {canMessage ? (
              <WhatsAppDialog
                studentId={student.id}
                studentName={student.name}
                parentPhone={student.parentPhone}
                className={student.className}
                shortName={student.shortName}
                defaultType={notes[0]?.type ?? "general"}
                details={notes[0]?.behaviorTypeName || notes[0]?.details || ""}
                sharedText={notes[0]?.details ?? ""}
                subject={notes[0]?.teacherSubject}
                createdAt={notes[0]?.createdAt}
                periodKey={notes[0]?.periodKey}
              />
              ) : null}
              <PrintFormsButton
                student={{
                  name: student.name,
                  classLabel: student.classLabel,
                  className: student.className,
                  stageName: student.stageName,
                  parentPhone: canMessage ? student.parentPhone : "",
                }}
                notes={notes}
                studentId={student.id}
                defaultKind={
                  notes.some((n) => n.type === "behavior")
                    ? "pledge"
                    : notes.some((n) => n.type === "absence")
                      ? "attendance"
                      : "record"
                }
              />
              <EditStudentButton
                student={{
                  id: student.id,
                  name: student.name,
                  parentPhone: student.parentPhone,
                  classId: student.classId,
                }}
              />
              <span className="flex-1" />
              <ImproveDialog
                studentId={student.id}
                studentName={student.name}
                classId={student.classId}
              />
              <NoteActions
                studentId={student.id}
                studentName={student.name}
                classId={student.classId}
              />
            </div>
          ) : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-auto p-5">
          {query.isPending ? (
            <p className="text-sm text-fg-muted">جارٍ التحميل…</p>
          ) : (
            <div className="space-y-6">
              {scoped ? (
                <p className="rounded-[var(--radius-md)] border border-border bg-muted px-3 py-2 text-xs text-fg-muted">
                  يظهر سجل ملاحظاتك فقط. مخالفات المعلمين الآخرين تظهر لمن مُنح صلاحية الاطلاع على جميع المخالفات.
                </p>
              ) : null}
              {notes.length === 0 ? (
                <p className="text-sm text-fg-muted">لا توجد ملاحظات مسجّلة بعد.</p>
              ) : (
            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border">
              <table className="w-full min-w-[60rem] border-collapse text-sm">
                <thead>
                  <tr className="bg-muted text-right">
                    <th className="border-b border-border px-3 py-2 font-medium">التاريخ</th>
                    <th className="border-b border-border px-3 py-2 font-medium">الحصة / المادة</th>
                    <th className="border-b border-border px-3 py-2 font-medium">النوع</th>
                    <th className="border-b border-border px-3 py-2 font-medium">نوع المخالفة</th>
                    <th className="border-b border-border px-3 py-2 font-medium">الدرجة</th>
                    <th className="border-b border-border px-3 py-2 font-medium">التكرار</th>
                    <th className="border-b border-border px-3 py-2 font-medium">المعلم</th>
                    <th className="border-b border-border px-3 py-2 font-medium">التفاصيل</th>
                    <th className="border-b border-border px-3 py-2 font-medium">الحالة</th>
                    <th className="border-b border-border px-3 py-2 font-medium">الإجراء</th>
                    {canEditRecords ? (
                      <th className="no-print w-40 whitespace-nowrap border-b border-border px-3 py-2 font-medium">
                        تصحيح
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {notes.map((note) => {
                    const tone = noteTone(note.type, note.status);
                    return (
                      <Fragment key={note.id}>
                      <tr className="align-top">
                        <td className="border-b border-border px-3 py-2 whitespace-nowrap text-xs text-fg-muted">
                          {formatStamp(note.createdAt)}
                        </td>
                        <td className="border-b border-border px-3 py-2">
                          <NoteSession
                            periodKey={note.periodKey}
                            subject={note.teacherSubject}
                            season={school.season}
                          />
                        </td>
                        <td className="border-b border-border px-3 py-2">
                          <Badge tone={tone}>{NOTE_META[note.type].label}</Badge>
                        </td>
                        <td className="border-b border-border px-3 py-2">
                          {note.behaviorTypeName ?? "—"}
                        </td>
                        <td className="border-b border-border px-3 py-2 whitespace-nowrap">
                          {note.behaviorDegree ? degreeLabel(note.behaviorDegree) : "—"}
                        </td>
                        <td className="border-b border-border px-3 py-2 whitespace-nowrap">
                          {note.type === "behavior" ? (
                            <Badge tone={note.occurrence > 1 ? "danger" : "default"}>
                              {occurrenceLabel(note.occurrence)}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="border-b border-border px-3 py-2 whitespace-nowrap">
                          {note.teacherName}
                          {note.teacherSubject ? (
                            <span className="block text-xs text-fg-subtle">{note.teacherSubject}</span>
                          ) : null}
                        </td>
                        <td className="border-b border-border px-3 py-2 text-fg-muted">
                          {note.details || "—"}
                        </td>
                        <td className="border-b border-border px-3 py-2 whitespace-nowrap">
                          {note.status === "closed" ? (
                            <span className="text-ok">أُغلقت</span>
                          ) : (
                            <span className="text-warn">مفتوحة</span>
                          )}
                        </td>
                        <td className="border-b border-border px-3 py-2">
                          {note.status === "closed" ? note.actionTaken || "—" : "—"}
                        </td>
                        {canEditRecords ? (
                          <td className="no-print w-40 whitespace-nowrap border-b border-border px-2 py-2">
                            <NoteRecordTools note={note} />
                          </td>
                        ) : null}
                      </tr>
                      <tr>
                        <td colSpan={canEditRecords ? 11 : 10} className="border-b border-border px-3 pb-3">
                          <NoteThread noteId={note.id} dest={(note.dest as NoteDest | undefined) ?? (note.referCounselor ? "counselor" : "vp")} compact />
                        </td>
                      </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
              )}
              <ImprovementsBlock
                items={improvements.data ?? []}
                studentId={studentId}
                lead={staffCan(staff, "acceptImprovements")}
                teacherId={staff.userId}
              />
              {studentId ? (
                <StaffMailInbox
                  studentId={studentId}
                  title="المراسلات"
                  hint="بينك وبين الوكيل أو المرشد أو المرشد الصحي أو معلم آخر — يمكن تتبعها وتحويلها"
                />
              ) : null}
              <MessagesBlock items={messages.data?.messages ?? []} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ImprovementsBlock({
  items,
  studentId,
  lead,
  teacherId,
}: {
  items: BehaviorImprovement[];
  studentId: number | null;
  lead: boolean;
  teacherId: string;
}) {
  if (!studentId) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">تحسين السلوك — متابعة المرشد</h3>
      {items.length === 0 ? (
        <p className="text-sm text-fg-muted">لا توجد خطط تحسين بعد. أرسل خطة من زر النبتة.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <ImprovementCard key={item.id} item={item} lead={lead} mine={item.teacherId === teacherId} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ImprovementCard({
  item,
  lead,
  mine,
}: {
  item: BehaviorImprovement;
  lead: boolean;
  mine: boolean;
}) {
  const queryClient = useQueryClient();
  const [followup, setFollowup] = useState(item.teacherFollowup);
  const [counselorNote, setCounselorNote] = useState(item.counselorNote);
  const mutation = useMutation({
    mutationFn: (input: {
      teacherFollowup?: string;
      counselorNote?: string;
      status?: ImprovementStatus;
    }) => followImprovement({ data: { id: item.id, ...input } }),
    onSuccess: () => {
      toast.success("تم حفظ متابعة التحسين");
      void queryClient.invalidateQueries({ queryKey: ["improvements"] });
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });
  const tone =
    item.status === "closed" ? "ok" : item.status === "following" ? "primary" : "warn";

  return (
    <li className="rounded-[var(--radius-md)] border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{IMPROVEMENT_STATUS[item.status]}</Badge>
        <span className="text-xs text-fg-subtle">{formatStamp(item.createdAt)}</span>
        <span className="text-xs text-fg-muted">
          {item.teacherName}
          {item.teacherSubject ? ` · ${item.teacherSubject}` : ""}
        </span>
        <span className="ms-auto">
          <ImprovementRecordTools id={item.id} plan={item.plan} />
        </span>
      </div>
      <p className="mt-2 font-medium">{item.plan}</p>
      {item.teacherFollowup ? (
        <p className="mt-1 text-xs text-fg-muted">متابعة المعلم: {item.teacherFollowup}</p>
      ) : null}
      {item.counselorNote ? (
        <p className="mt-1 text-xs text-ok">المرشد: {item.counselorNote}</p>
      ) : null}
      {mine && item.status !== "closed" ? (
        <div className="mt-2 space-y-2">
          <Textarea
            className="min-h-16"
            placeholder="متابعة المعلم…"
            value={followup}
            onChange={(e) => setFollowup(e.target.value)}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={mutation.isPending || followup.trim().length < 2}
            onClick={() => mutation.mutate({ teacherFollowup: followup })}
          >
            حفظ متابعة المعلم
          </Button>
        </div>
      ) : null}
      {lead && item.status !== "closed" ? (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <Textarea
            className="min-h-16"
            placeholder="ملاحظة المرشد الطلابي…"
            value={counselorNote}
            onChange={(e) => setCounselorNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({ counselorNote, status: "following" })
              }
            >
              متابعة
            </Button>
            <Button
              size="sm"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ counselorNote, status: "closed" })}
            >
              إغلاق الخطة
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function MessagesBlock({
  items,
}: {
  items: { id: number; body: string; kind: string; staffName: string; createdAt: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">رسائل ولي الأمر</h3>
      <ul className="space-y-2">
        {items.map((msg) => (
          <li key={msg.id} className="rounded-[var(--radius-md)] border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{messageKindLabel(msg.kind as MessageKind)}</Badge>
              <span className="text-xs text-fg-subtle">
                {msg.staffName} · {formatStamp(msg.createdAt)}
              </span>
              <span className="ms-auto">
                <MessageRecordTools id={msg.id} body={msg.body} />
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap">{msg.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
