import { ImproveDialog } from "@/components/improve-dialog";
import { NoteActions } from "@/components/note-actions";

export function StudentQuickActions({
  studentId,
  studentName,
  classId,
}: {
  studentId: number;
  studentName: string;
  classId: number;
  parentPhone?: string;
  className?: string;
  shortName?: string;
}) {
  return (
    <div className="flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
      <ImproveDialog studentId={studentId} studentName={studentName} classId={classId} />
      <NoteActions studentId={studentId} studentName={studentName} classId={classId} />
    </div>
  );
}
