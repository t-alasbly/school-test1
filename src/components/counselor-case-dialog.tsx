import { useMutation, useQueryClient } from "@tanstack/react-query";
import { tr } from "@/lib/school/i18n";
import { HeartHandshake } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { sendCounselingCase } from "@/lib/school/api";
import { CASE_KINDS } from "@/lib/school/constants";
import type { CaseKind } from "@/lib/school/constants";
import { cn } from "@/lib/utils";

export function CounselorCaseDialog({
  studentId,
  studentName,
}: {
  studentId: number;
  studentName: string;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CaseKind>("health");
  const [body, setBody] = useState("");
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => sendCounselingCase({ data: { studentId, kind, body } }),
    onSuccess: (res) => {
      toast.success(`أُرسلت مراسلة المرشد عن ${res.studentName}`);
      setBody("");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["counseling-desk"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الإرسال")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" aria-label={`مراسلة المرشد عن ${studentName}`}>
          <HeartHandshake className="size-4" />
          مراسلة المرشد
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{tr("مراسلة المرشد الطلابي")}</DialogTitle>
          <DialogDescription>{studentName} — حالة صحية أو نفسية أو صعوبات تعلم</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            {CASE_KINDS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setKind(item.key)}
                className={cn(
                  "min-h-11 rounded-[var(--radius-md)] border px-2 text-sm font-semibold",
                  kind === item.key
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-bg",
                )}
              >
                {tr(item.label)}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`case-${studentId}`}>{tr("وصف الحالة للمرشد")}</Label>
            <Textarea
              id={`case-${studentId}`}
              className="min-h-24"
              placeholder={tr("اكتب ما يحتاجه المرشد لمتابعة الطالب…")}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            disabled={body.trim().length < 2 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            إرسال إلى الإرشاد
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
