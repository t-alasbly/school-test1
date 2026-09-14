import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sprout } from "lucide-react";
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
import { createImprovement } from "@/lib/school/api";

export function ImproveDialog({
  studentId,
  studentName,
  classId,
}: {
  studentId: number;
  studentName: string;
  classId?: number;
}) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState("");
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => createImprovement({ data: { studentId, plan } }),
    onSuccess: (result) => {
      toast.success(`أُرسلت خطة تحسين سلوك ${result.studentName} إلى المرشد`);
      setPlan("");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["improvements"] });
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: ["student"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (classId) void queryClient.invalidateQueries({ queryKey: ["class", classId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر حفظ الخطة"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPlan("");
      }}
    >
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`تحسين سلوك ${studentName}`}>
          <Sprout className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>تحسين سلوك الطالب</DialogTitle>
          <DialogDescription>
            {studentName} — تُرسل الخطة إلى المرشد الطلابي للمتابعة.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`plan-${studentId}`}>إجراء التحسين الذي ستطبقه</Label>
            <Textarea
              id={`plan-${studentId}`}
              className="min-h-32"
              placeholder="مثال: تعزيز إيجابي عند الالتزام، جلوس في المقدمة، متابعة الواجب يومياً، تواصل مع ولي الأمر…"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            disabled={mutation.isPending || plan.trim().length < 4}
            onClick={() => mutation.mutate()}
          >
            إرسال للمرشد الطلابي
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
