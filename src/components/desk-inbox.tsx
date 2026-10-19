import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listDeskInbox, sendStudyParentNotice } from "@/lib/school/api";
import { toWhatsAppNumber } from "@/lib/school/constants";
import { tr } from "@/lib/school/i18n";
import { staffCan } from "@/lib/school/permissions";
import { useWorkspace } from "@/lib/school/workspace";
import { ExitPermitBadge } from "@/components/exit-permit";
import { DayName } from "@/components/day-name";

type StudyRow = {
  id: number;
  studentId: number;
  studentName: string;
  classLabel: string;
  teacherName: string;
  details: string;
  compensation: string;
  body: string;
  parentPhone: string;
  createdAt: string;
};

export function DeskInbox() {
  const { staff } = useWorkspace();
  const queryClient = useQueryClient();
  const canSend = staffCan(staff, "sendMessages");
  const query = useQuery({
    queryKey: ["desk-inbox"],
    queryFn: () => listDeskInbox(),
  });
  const data = query.data as { visible?: boolean; canHandle?: boolean; studyMessages?: StudyRow[] } | undefined;
  const studyMessages = data?.studyMessages ?? [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["desk-inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["desk-notes"] });
    void queryClient.invalidateQueries({ queryKey: ["home-desk"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["student"] });
    void queryClient.invalidateQueries({ queryKey: ["class"] });
  };

  const notice = useMutation({
    mutationFn: (input: { noteId: number; closeWithoutSend?: boolean }) => sendStudyParentNotice({ data: input }),
    onSuccess: (result) => {
      const row = result as { closed?: boolean; whatsapp?: { phone?: string; body?: string } | null };
      const link = row?.whatsapp;
      if (link?.phone && link.body) {
        const number = toWhatsAppNumber(link.phone);
        if (number) window.open(`https://wa.me/${number}?text=${encodeURIComponent(link.body)}`, "_blank", "noopener,noreferrer");
        toast.success(tr("أُرسل الإشعار"));
      } else {
        toast.success(tr("أُغلق دون إرسال"));
      }
      refresh();
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر إرسال الإشعار")),
  });

  if (!data?.visible || studyMessages.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{tr("ملاحظات دراسية بانتظار الإرسال")}</h2>
      {studyMessages.length > 0 ? (
        <ul className="space-y-2">
          {studyMessages.map((row) => (
            <li key={row.id} className="rounded-[var(--radius-md)] border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="warn">{tr("ملاحظة دراسية بانتظار الإرسال")}</Badge>
                <span className="text-xs text-fg-muted">{row.teacherName}</span>
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-base font-semibold">
                <DayName studentId={row.studentId}>{row.studentName}</DayName>
                <ExitPermitBadge studentId={row.studentId} />
              </p>
              <p className="text-xs text-fg-muted">{row.classLabel}</p>
              <p className="mt-1 text-sm leading-6">{row.details}</p>
              {row.compensation ? <p className="mt-1 text-sm text-warn">{row.compensation}</p> : null}
              {row.body ? (
                <p className="mt-2 whitespace-pre-line rounded-[var(--radius-sm)] bg-muted px-3 py-2 text-sm leading-6">{row.body}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {canSend && row.parentPhone ? (
                  <Button type="button" size="sm" disabled={notice.isPending} onClick={() => notice.mutate({ noteId: row.id })}>
                    {tr("إرسال الإشعار لولي الأمر")}
                  </Button>
                ) : (
                  <p className="text-xs text-fg-muted">{row.parentPhone ? tr("صلاحية الرسائل غير مفعّلة") : tr("لا يوجد رقم ولي أمر")}</p>
                )}
                {data?.canHandle ? (
                  <Button type="button" size="sm" variant="secondary" disabled={notice.isPending} onClick={() => notice.mutate({ noteId: row.id, closeWithoutSend: true })}>
                    {tr("إغلاق دون إرسال")}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
