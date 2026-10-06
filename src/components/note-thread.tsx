import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tr } from "@/lib/school/i18n";
import { MessageSquare, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { listNoteMessages, postNoteMessage } from "@/lib/school/api";
import { formatStampCalendar } from "@/lib/school/calendar";
import { NOTE_DEST, NOTE_DEST_LABEL, ROLE_LABEL } from "@/lib/school/constants";
import { staffCan } from "@/lib/school/permissions";
import { useCalendar } from "@/lib/school/use-calendar";
import type { NoteDest, NoteMessage, NoteMessageTo, StaffRole } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

export function NoteThread({
  noteId,
  dest,
  compact = false,
}: {
  noteId: number;
  dest?: NoteDest;
  compact?: boolean;
}) {
  const { staff } = useWorkspace();
  const calendar = useCalendar();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(!compact);
  const [body, setBody] = useState("");
  const defaultTo: NoteMessageTo = staffCan(staff, "takeActions") || staffCan(staff, "counseling") ? "teacher" : (dest ?? "vp");
  const [toKind, setToKind] = useState<NoteMessageTo>(defaultTo);
  const query = useQuery({
    queryKey: ["note-thread", noteId],
    queryFn: () => listNoteMessages({ data: { noteId } }),
    enabled: open,
  });
  const messages = ((query.data as { messages?: NoteMessage[] } | undefined)?.messages ?? []) as NoteMessage[];
  const mutation = useMutation({
    mutationFn: () => postNoteMessage({ data: { noteId, body, toKind } }),
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["note-thread", noteId] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["desk-notes"] });
      void queryClient.invalidateQueries({ queryKey: ["student"] });
      void queryClient.invalidateQueries({ queryKey: ["counseling-desk"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر إرسال المراسلة")),
  });
  const teacherSide = !staffCan(staff, "takeActions") && !staffCan(staff, "counseling");

  return (
    <div
      className="mt-3 rounded-[var(--radius-md)] border border-border bg-bg-elevated p-3"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-right"
      >
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <MessageSquare className="size-4 text-primary" />
          مراسلة الملاحظة
        </span>
        <span className="text-xs text-fg-muted">
          {open ? (query.isPending ? "…" : `${messages.length} رسالة`) : tr("فتح الدردشة")}
        </span>
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          {query.isPending ? (
            <p className="text-xs text-fg-muted">{tr("جارٍ تحميل المراسلات…")}</p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-fg-muted">
              ابدأ المحادثة على هذه الملاحظة مع {NOTE_DEST_LABEL[dest ?? "vp"]} — الردود تبقى هنا ولا تُنشئ مخالفة جديدة.
            </p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {messages.map((item) => (
                <li
                  key={item.id}
                  className={cn(
                    "rounded-[var(--radius-sm)] px-3 py-2 text-sm leading-6",
                    item.mine ? "bg-primary/10" : "bg-card",
                  )}
                >
                  <p className="text-[11px] text-fg-muted">
                    {item.authorName}
                    {item.authorRole ? ` · ${tr(ROLE_LABEL[item.authorRole as StaffRole]) ?? item.authorRole}` : ""}
                    {` → ${NOTE_DEST_LABEL[item.toKind] ?? item.toKind}`}
                    {` · ${formatStampCalendar(item.createdAt, calendar)}`}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap">{item.body}</p>
                </li>
              ))}
            </ul>
          )}
          {teacherSide ? (
            <div className="flex flex-wrap gap-1">
              {NOTE_DEST.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setToKind(item.id)}
                  className={cn(
                    "h-8 rounded-full border px-2.5 text-xs font-medium",
                    toKind === item.id
                      ? "border-primary bg-primary text-primary-fg"
                      : "border-border bg-bg text-fg-muted",
                  )}
                >
                  إلى {tr(item.label)}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-fg-muted">{tr("الرد يصل إلى المعلم الذي حرّر الملاحظة.")}</p>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              className="min-h-16 flex-1"
              placeholder={teacherSide ? tr("اكتب للمختص على هذه الملاحظة…") : tr("اكتب توجيهاً أو رداً للمعلم…")}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <Button
              size="icon"
              disabled={body.trim().length < 1 || mutation.isPending}
              onClick={() => mutation.mutate()}
              aria-label={tr("إرسال المراسلة")}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
