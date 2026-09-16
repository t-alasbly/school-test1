import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { StudentSheet } from "@/components/student-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createHealthCondition, getCounselingDesk, updateHealthNote } from "@/lib/school/api";
import type { CatalogItem } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/counseling/health")({ component: HealthPage });

function HealthPage() {
  const { healthConditions = [] } = useWorkspace();
  const [q, setQ] = useState("");
  const [healthId, setHealthId] = useState<number | "">("");
  const [healthNote, setHealthNote] = useState("");
  const [customHealth, setCustomHealth] = useState("");
  const [activeStudent, setActiveStudent] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const desk = useQuery({
    queryKey: ["counseling-desk"],
    queryFn: () => getCounselingDesk(),
  });

  const roster = desk.data?.roster ?? [];
  const filtered = useMemo(() => {
    const term = q.trim();
    if (!term) return roster;
    return roster.filter(
      (s: { name: string; classLabel: string }) => s.name.includes(term) || s.classLabel.includes(term),
    );
  }, [roster, q]);

  function applyChip(name: string) {
    setHealthNote((prev) => {
      if (!prev.trim()) return name;
      if (prev.includes(name)) return prev;
      return `${prev}، ${name}`;
    });
  }

  const healthMutation = useMutation({
    mutationFn: () =>
      updateHealthNote({
        data: { studentId: Number(healthId), healthNote },
      }),
    onSuccess: (res) => {
      toast.success(`حُفظت الملاحظة الصحية لـ ${res.studentName}`);
      setHealthNote("");
      void queryClient.invalidateQueries({ queryKey: ["counseling-desk"] });
      void queryClient.invalidateQueries({ queryKey: ["class"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });

  const addHealth = useMutation({
    mutationFn: () => createHealthCondition({ data: { name: customHealth } }),
    onSuccess: (res) => {
      applyChip(res.name);
      setCustomHealth("");
      toast.success(res.existed ? "موجود في القائمة واخترناه" : "أُضيف للقائمة واخترناه");
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
      void queryClient.invalidateQueries({ queryKey: ["health-conditions"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الإضافة"),
  });

  const selected = roster.find((s: { id: number }) => s.id === Number(healthId));

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-fg-muted">تظهر أسفل اسم الطالب في كشف الفصل</p>
        <h1 className="text-3xl font-semibold tracking-tight">الملاحظات الصحية</h1>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>تسجيل ملاحظة صحية</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-fg-muted">
            اختر من قائمة الأمراض المحفوظة أو أضف ما ليس فيها فيُحفظ تلقائياً.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="health-q">بحث عن طالب</Label>
              <Input id="health-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="الاسم أو الصف" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="health-student">الطالب</Label>
              <select
                id="health-student"
                className="h-11 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 text-sm"
                value={healthId}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : "";
                  setHealthId(id);
                  const found = roster.find((s: { id: number; healthNote?: string }) => s.id === Number(id));
                  setHealthNote(found?.healthNote ?? "");
                }}
              >
                <option value="">اختر طالباً</option>
                {filtered.slice(0, 80).map((s: { id: number; name: string; classLabel: string }) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.classLabel}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(healthConditions as CatalogItem[]).map((item) => {
              const on = healthNote.includes(item.name);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => applyChip(item.name)}
                  className={cn(
                    "min-h-10 rounded-full border px-3 text-sm",
                    on ? "border-primary bg-primary/10 text-primary" : "border-border bg-bg-elevated text-fg-muted",
                  )}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (customHealth.trim().length >= 2) addHealth.mutate();
            }}
          >
            <Input
              value={customHealth}
              onChange={(e) => setCustomHealth(e.target.value)}
              placeholder="مرض غير موجود في القائمة…"
              className="min-w-48 flex-1"
            />
            <Button type="submit" variant="secondary" disabled={addHealth.isPending || customHealth.trim().length < 2}>
              إضافة للقائمة
            </Button>
          </form>
          <div className="space-y-1.5">
            <Label htmlFor="health-note">الملاحظة الصحية</Label>
            <Textarea
              id="health-note"
              className="min-h-20"
              placeholder="مثال: يعاني من الربو — يحتاج بخاخاً عند الضيق"
              value={healthNote}
              onChange={(e) => setHealthNote(e.target.value)}
            />
          </div>
          <Button disabled={healthMutation.isPending || !healthId} onClick={() => healthMutation.mutate()}>
            حفظ الملاحظة الصحية
          </Button>
          {selected?.healthNote ? <p className="text-sm text-warn">الحالية: {selected.healthNote}</p> : null}

          {(desk.data?.health ?? []).length ? (
            <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-md)] border border-border">
              {desk.data!.health.map((s: { id: number; name: string; classLabel: string; healthNote: string }) => (
                <li key={s.id} className="px-3 py-2">
                  <button type="button" className="font-medium" onClick={() => setActiveStudent(s.id)}>
                    {s.name} <span className="text-xs text-fg-muted">{s.classLabel}</span>
                  </button>
                  <p className="text-sm text-warn">{s.healthNote}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
      <StudentSheet
        studentId={activeStudent}
        open={activeStudent != null}
        onOpenChange={(open) => {
          if (!open) setActiveStudent(null);
        }}
      />
    </div>
  );
}
