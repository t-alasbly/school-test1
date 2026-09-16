import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { forwardStudentMail, listMailMessages, listStaffDirectory, postMailMessage } from "@/lib/school/api";
import { formatStampCalendar } from "@/lib/school/calendar";
import { MAIL_DEST, NOTE_DEST_LABEL, ROLE_LABEL } from "@/lib/school/constants";
import { staffCan } from "@/lib/school/permissions";
import { useCalendar } from "@/lib/school/use-calendar";
import type { MailDest, MailMessage, StaffDirectoryRow, StaffRole, StudentMail } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

export function StaffMailThread({ mail }: { mail: StudentMail }) {
  const { staff } = useWorkspace();
  const calendar = useCalendar();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [fwdDest, setFwdDest] = useState<MailDest>(mail.dest === "teacher" ? "vp" : mail.dest);
  const [fwdTeacher, setFwdTeacher] = useState("");
  const query = useQuery({
    queryKey: ["mail-thread", mail.id],
    queryFn: () => listMailMessages({ data: { mailId: mail.id } }),
  });
  const directory = useQuery({
    queryKey: ["staff-directory"],
    queryFn: () => listStaffDirectory(),
  });
  const messages = ((query.data as { messages?: MailMessage[] } | undefined)?.messages ?? []) as MailMessage[];
  const peers = ((directory.data as { staff?: StaffDirectoryRow[] } | undefined)?.staff ?? []).filter(
    (row) => row.userId !== staff.userId,
  );
  const canForward =
    staff.userId === mail.authorId ||
    staff.userId === mail.assigneeId ||
    staffCan(staff, "takeActions") ||
    staffCan(staff, "counseling") ||
    staff.role === "admin";

  const reply = useMutation({
    mutationFn: () => postMailMessage({ data: { mailId: mail.id, body } }),
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["mail-thread", mail.id] });
      void queryClient.invalidateQueries({ queryKey: ["student-mail"] });
      void queryClient.invalidateQueries({ queryKey: ["my-mail"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر إرسال الرد"),
  });

  const forward = useMutation({
    mutationFn: () =>
      forwardStudentMail({
        data: {
          mailId: mail.id,
          dest: fwdDest,
          assigneeId: fwdDest === "teacher" ? fwdTeacher || undefined : undefined,
        },
      }),
    onSuccess: (res) => {
      toast.success(`حُوّلت المراسلة إلى ${res.assigneeName}`);
      void queryClient.invalidateQueries({ queryKey: ["mail-thread", mail.id] });
      void queryClient.invalidateQueries({ queryKey: ["student-mail"] });
      void queryClient.invalidateQueries({ queryKey: ["my-mail"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر التحويل"),
  });

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-bg-elevated p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
        <span className="font-semibold text-fg">
          {NOTE_DEST_LABEL[mail.dest] ?? mail.dest}
        </span>
        <span>من {mail.authorName}</span>
        <span>إلى {mail.assigneeName}</span>
        <span>{formatStampCalendar(mail.updatedAt || mail.createdAt, calendar)}</span>
      </div>
      {query.isPending ? (
        <p className="text-xs text-fg-muted">جارٍ تحميل المراسلات…</p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {messages.map((item) => (
            <li
              key={item.id}
              className={cn(
                "rounded-[var(--radius-sm)] px-3 py-2 text-sm leading-6",
                item.kind === "forward" ? "bg-muted text-fg-muted" : item.mine ? "bg-primary/10" : "bg-card",
              )}
            >
              <p className="text-[11px] text-fg-muted">
                {item.authorName}
                {item.authorRole ? ` · ${ROLE_LABEL[item.authorRole as StaffRole] ?? item.authorRole}` : ""}
                {item.kind === "forward" ? " · تحويل" : ""}
                {` · ${formatStampCalendar(item.createdAt, calendar)}`}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap">{item.body}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-end gap-2">
        <Textarea
          className="min-h-16 flex-1"
          placeholder="اكتب رداً على هذه المراسلة…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button
          size="icon"
          disabled={body.trim().length < 1 || reply.isPending}
          onClick={() => reply.mutate()}
          aria-label="إرسال الرد"
        >
          <Send className="size-4" />
        </Button>
      </div>
      {canForward ? (
        <div className="mt-3 space-y-2 rounded-[var(--radius-sm)] border border-border bg-bg p-2">
          <p className="text-xs font-medium text-fg-muted">تحويل إلى شخص آخر</p>
          <div className="flex flex-wrap gap-1">
            {MAIL_DEST.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFwdDest(item.id)}
                className={cn(
                  "h-8 rounded-full border px-2.5 text-xs font-medium",
                  fwdDest === item.id
                    ? "border-primary bg-primary text-primary-fg"
                    : "border-border bg-bg text-fg-muted",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          {fwdDest === "teacher" ? (
            <Select value={fwdTeacher} onChange={(e) => setFwdTeacher(e.target.value)}>
              <option value="">اختر المعلم…</option>
              {peers.map((row) => (
                <option key={row.userId} value={row.userId}>
                  {row.displayName}
                  {row.subject ? ` — ${row.subject}` : ""}
                </option>
              ))}
            </Select>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            disabled={forward.isPending || (fwdDest === "teacher" && !fwdTeacher)}
            onClick={() => forward.mutate()}
          >
            {forward.isPending ? "جارٍ التحويل…" : "تحويل المراسلة"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
