import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SettingsBack } from "@/components/settings-back";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSubjectPlan, saveSubjectPlan } from "@/lib/school/api";
import { tr } from "@/lib/school/i18n";

export const Route = createFileRoute("/settings/subject")({
  component: SubjectSettings,
});

type DraftPeriod = { title: string; tasksMax: string; examMax: string; closed: boolean };

const TITLES = ["الفترة الأولى", "الفترة الثانية", "الفترة الثالثة"];

type SubjectDraft = {
  name: string;
  combine: "sum" | "avg";
  periods: DraftPeriod[];
};

function SubjectSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["subject-plan"], queryFn: () => getSubjectPlan() });
  const [subjects, setSubjects] = useState<SubjectDraft[]>([]);
  useEffect(() => {
    const rows = (query.data as { subjects?: { name: string; combine: "sum" | "avg"; periods: { title: string; tasksMax: number; examMax: number; closed: boolean }[] }[] } | undefined)?.subjects;
    if (!rows) return;
    setSubjects(rows.map((subject) => ({
      name: subject.name,
      combine: subject.combine === "avg" ? "avg" : "sum",
      periods: subject.periods.map((period) => ({
        title: period.title,
        tasksMax: String(period.tasksMax),
        examMax: String(period.examMax),
        closed: period.closed,
      })),
    })));
  }, [query.data]);
  const save = useMutation({
    mutationFn: (subject: SubjectDraft) => saveSubjectPlan({
      data: {
        subject: subject.name,
        combine: subject.combine,
        periods: subject.periods.map((period) => ({
          title: period.title.trim() || "فترة",
          tasksMax: Number(period.tasksMax) || 0,
          examMax: Number(period.examMax) || 0,
          closed: period.closed,
        })),
      },
    }),
    onSuccess: () => {
      toast.success(tr("حُفظت إعدادات المادة"));
      void queryClient.invalidateQueries({ queryKey: ["subject-plan"] });
      void queryClient.invalidateQueries({ queryKey: ["class-eval"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
  });
  return (
    <div className="space-y-4">
      <SettingsBack />
      {subjects.map((subject, subjectIndex) => {
        const tasks = subject.periods.reduce((sum, period) => sum + (Number(period.tasksMax) || 0), 0);
        const exams = subject.periods.reduce((sum, period) => sum + (Number(period.examMax) || 0), 0);
        return (
          <Card key={subject.name}>
            <CardHeader>
              <CardTitle>{subject.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["sum", "جمع الفترات"],
                    ["avg", "متوسط الفترات"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSubjects((rows) => rows.map((row, index) => index === subjectIndex ? { ...row, combine: mode } : row))}
                    className={`min-h-10 rounded-full border px-3 text-sm ${subject.combine === mode ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
                  >
                    {tr(label)}
                  </button>
                ))}
              </div>
              <p className="text-sm text-fg-muted">
                {subject.combine === "avg"
                  ? tr("تُجمع درجات الفترات ثم تُقسم على عددها، فتكون الدرجة المتوسطة.")
                  : tr("تُضاف درجات الفترات إلى بعضها حتى نهاية أعمال السنة.")}
              </p>
              <p className="text-sm font-semibold">
                {tr("أعمال السنة")}: {tasks} · {tr("الاختبارات")}: {exams}
              </p>
              {subject.periods.map((period, index) => (
                <div key={index} className="grid gap-2 rounded-[var(--radius-md)] border border-border p-3 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-3">
                    <Label>{tr("اسم الفترة")}</Label>
                    <Input
                      value={period.title}
                      onChange={(event) => setSubjects((rows) => rows.map((row, i) => i === subjectIndex ? {
                        ...row,
                        periods: row.periods.map((item, pi) => pi === index ? { ...item, title: event.target.value } : item),
                      } : row))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{tr("أعمال السنة")}</Label>
                    <Input
                      inputMode="decimal"
                      value={period.tasksMax}
                      onChange={(event) => setSubjects((rows) => rows.map((row, i) => i === subjectIndex ? {
                        ...row,
                        periods: row.periods.map((item, pi) => pi === index ? { ...item, tasksMax: event.target.value } : item),
                      } : row))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{tr("الاختبار الشهري")}</Label>
                    <Input
                      inputMode="decimal"
                      value={period.examMax}
                      onChange={(event) => setSubjects((rows) => rows.map((row, i) => i === subjectIndex ? {
                        ...row,
                        periods: row.periods.map((item, pi) => pi === index ? { ...item, examMax: event.target.value } : item),
                      } : row))}
                    />
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={subject.periods.length >= 3}
                  onClick={() => setSubjects((rows) => rows.map((row, i) => i === subjectIndex ? {
                    ...row,
                    periods: [...row.periods, { title: TITLES[row.periods.length] ?? "فترة", tasksMax: "10", examMax: "5", closed: false }],
                  } : row))}
                >
                  {tr("إضافة فترة")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={subject.periods.length <= 1}
                  onClick={() => setSubjects((rows) => rows.map((row, i) => i === subjectIndex ? { ...row, periods: row.periods.slice(0, -1) } : row))}
                >
                  {tr("حذف آخر فترة")}
                </Button>
                <Button type="button" disabled={save.isPending} onClick={() => save.mutate(subject)}>
                  {tr("حفظ هذه المادة")}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
