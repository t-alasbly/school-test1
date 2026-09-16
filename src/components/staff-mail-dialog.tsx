import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createStudentMail, listStaffDirectory } from "@/lib/school/api";
import { MAIL_DEST, ROLE_LABEL } from "@/lib/school/constants";
import type { MailDest, StaffDirectoryRow, StaffRole } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

export function StaffMailDialog({
  studentId,
  studentName,
  compact = false,
}: {
  studentId: number;
  studentName: string;
  compact?: boolean;
}) {
  const { staff } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [dest, setDest] = useState<MailDest>("counselor");
  const [assigneeId, setAssigneeId] = useState("");
  const [body, setBody] = useState("");
  const queryClient = useQueryClient();
  const directory = useQuery({
    queryKey: ["staff-directory"],
    queryFn: () => listStaffDirectory(),
    enabled: open,
  });
  const peers = ((directory.data as { staff?: StaffDirectoryRow[] } | undefined)?.staff ?? []).filter(
    (row) => row.userId !== staff.userId,
  );
  const mutation = useMutation({
    mutationFn: () =>
      createStudentMail({
        data: {
          studentId,
          dest,
          assigneeId: dest === "teacher" ? assigneeId || undefined : undefined,
          body,
        },
      }),
    onSuccess: (res) => {
      toast.success(`أُرسلت المراسلة عن ${res.studentName}`);
      setBody("");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["student-mail"] });
      void queryClient.invalidateQueries({ queryKey: ["my-mail"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر إرسال المراسلة"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size={compact ? "sm" : "sm"}
          variant="secondary"
          aria-label={`مراسلة عن ${studentName}`}
        >
          <Mail className="size-4" />
          مراسلة
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>مراسلة داخلية</DialogTitle>
          <DialogDescription>
            {studentName} — أرسل ملاحظة للمرشد أو الوكيل أو المرشد الصحي أو معلم آخر، ثم تابع الردود وحوّلها عند الحاجة
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>إرسال إلى</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {MAIL_DEST.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDest(item.id)}
                  className={cn(
                    "min-h-11 rounded-[var(--radius-md)] border px-2 text-sm font-semibold",
                    dest === item.id
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-bg",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {dest === "teacher" ? (
            <div className="space-y-1.5">
              <Label htmlFor={`mail-teacher-${studentId}`}>اختر المعلم</Label>
              <Select
                id={`mail-teacher-${studentId}`}
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
              >
                <option value="">اختر زميلاً…</option>
                {peers.map((row) => (
                  <option key={row.userId} value={row.userId}>
                    {row.displayName}
                    {row.subject ? ` — ${row.subject}` : ""}
                    {` · ${ROLE_LABEL[row.role as StaffRole] ?? row.role}`}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor={`mail-body-${studentId}`}>نص المراسلة</Label>
            <Textarea
              id={`mail-body-${studentId}`}
              className="min-h-28"
              placeholder="اكتب الرسالة أو الملاحظة…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            disabled={
              body.trim().length < 2 ||
              mutation.isPending ||
              (dest === "teacher" && !assigneeId)
            }
            onClick={() => mutation.mutate()}
          >
            <Send className="size-4" />
            {mutation.isPending ? "جارٍ الإرسال…" : "إرسال المراسلة"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
