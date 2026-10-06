import { useMutation, useQueryClient } from "@tanstack/react-query";
import { studentLabel, tr, useLocale } from "@/lib/school/i18n";
import { Sprout } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { OptionChips } from "@/components/option-chips";
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
import { IMPROVE_OPTIONS, isOtherChoice, resolveOther } from "@/lib/school/constants";
import { useWorkspace } from "@/lib/school/workspace";

export function ImproveDialog({
  studentId,
  studentName,
  classId,
}: {
  studentId: number;
  studentName: string;
  classId?: number;
}) {
  const { locale } = useLocale();
  const shownName = studentLabel(locale, studentName);
  const { improvementOptions = [] } = useWorkspace();
  const options =
    improvementOptions.length > 0 ? improvementOptions.map((o) => o.name) : IMPROVE_OPTIONS;
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const [plan, setPlan] = useState("");
  const queryClient = useQueryClient();

  function composed() {
    const names = resolveOther(picked, other);
    const extra = plan.trim();
    const focus = names.length ? `السلوك المراد تحسينه: ${names.join(" — ")}` : "";
    return [focus, extra].filter(Boolean).join("\n");
  }

  const mutation = useMutation({
    mutationFn: () => createImprovement({ data: { studentId, plan: composed() } }),
    onSuccess: (result) => {
      toast.success(`أُرسلت خطة تحسين سلوك ${result.studentName} إلى المرشد`);
      setPlan("");
      setPicked([]);
      setOther("");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["improvements"] });
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: ["student"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (classId) void queryClient.invalidateQueries({ queryKey: ["class", classId] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر حفظ الخطة")),
  });

  const ready =
    composed().trim().length >= 4 &&
    (!picked.some(isOtherChoice) || other.trim().length >= 2);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setPlan("");
          setPicked([]);
          setOther("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`تحسين سلوك ${studentName}`}>
          <Sprout className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{tr("تحسين سلوك الطالب")}</DialogTitle>
          <DialogDescription>
            {shownName} — {tr("اختر السلوك المراد تحسينه ثم أرسل الخطة إلى المرشد الطلابي.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{tr("السلوك الذي تريد تحسينه")}</Label>
            <OptionChips
              items={options}
              selected={picked}
              onToggle={(name) =>
                setPicked((prev) =>
                  prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
                )
              }
              otherValue={other}
              onOtherChange={setOther}
              otherPlaceholder={tr("صف السلوك يدوياً…")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`plan-${studentId}`}>{tr("إجراء التحسين الذي ستطبقه (اختياري)")}</Label>
            <Textarea
              id={`plan-${studentId}`}
              className="min-h-24"
              placeholder={tr("مثال: تعزيز إيجابي عند الالتزام، جلوس في المقدمة، متابعة الواجب يومياً…")}
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
            />
          </div>
          <Button className="w-full" disabled={mutation.isPending || !ready} onClick={() => mutation.mutate()}>
            {mutation.isPending ? tr("جارٍ الإرسال…") : tr("إرسال للمرشد الطلابي")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
