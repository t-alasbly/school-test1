import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsBack } from "@/components/settings-back";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  applyStandardStages,
  createClassInStage,
  createStage,
  deleteClassRow,
  deleteStage,
  listClassStructure,
  repairClassStructureFn,
  updateClassRow,
  updateStage,
} from "@/lib/school/api";
import { classLabel } from "@/lib/school/constants";
import { staffCan } from "@/lib/school/permissions";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/settings/classes")({ component: ClassesSettings });

type ClassRow = {
  id: number;
  name: string;
  sortOrder: number;
  studentCount: number;
  label: string;
};

type StageRow = {
  id: number;
  name: string;
  shortName: string;
  sortOrder: number;
  classes: ClassRow[];
};

function ClassesSettings() {
  const { staff } = useWorkspace();
  const queryClient = useQueryClient();
  const allowed = staffCan(staff, "editClasses");
  const [stageName, setStageName] = useState("");
  const [stageShort, setStageShort] = useState("");
  const [sectionCount, setSectionCount] = useState(5);
  const [editingStage, setEditingStage] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftShort, setDraftShort] = useState("");

  const query = useQuery({
    queryKey: ["class-structure"],
    queryFn: () => listClassStructure(),
    enabled: allowed,
  });

  function onSaved(stages?: StageRow[]) {
    if (stages) queryClient.setQueryData(["class-structure"], { stages });
    void queryClient.invalidateQueries({ queryKey: ["class-structure"] });
    void queryClient.invalidateQueries({ queryKey: ["workspace"] });
  }

  const standardMutation = useMutation({
    mutationFn: () => applyStandardStages(),
    onSuccess: (res) => {
      toast.success("طُبّقت مسميات الصفوف القياسية وأقسامها");
      onSaved(res.stages);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر التطبيق"),
  });

  const mergeMutation = useMutation({
    mutationFn: () => repairClassStructureFn(),
    onSuccess: (res) => {
      const n = (res.stagesMerged ?? 0) + (res.classesMerged ?? 0);
      toast.success(n ? `دُمج ${n} صف أو فصل مكرر` : "لا توجد فصول مكررة");
      onSaved(res.stages);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الدمج"),
  });

  const createStageMutation = useMutation({
    mutationFn: () =>
      createStage({
        data: { name: stageName, shortName: stageShort, sections: sectionCount },
      }),
    onSuccess: (res) => {
      toast.success("أُضيف الصف");
      setStageName("");
      setStageShort("");
      onSaved(res.stages);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الإضافة"),
  });

  const updateStageMutation = useMutation({
    mutationFn: (input: { id: number; name: string; shortName: string }) =>
      updateStage({ data: input }),
    onSuccess: (res) => {
      toast.success("حُفظت تسمية الصف");
      setEditingStage(null);
      onSaved(res.stages);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });

  const deleteStageMutation = useMutation({
    mutationFn: (input: { id: number; withStudents?: boolean }) =>
      deleteStage({ data: input }),
    onSuccess: (res) => {
      toast.success("حُذف الصف");
      onSaved(res.stages);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحذف"),
  });

  const addClassMutation = useMutation({
    mutationFn: (stageId: number) => createClassInStage({ data: { stageId } }),
    onSuccess: (res) => {
      toast.success("أُضيف قسم");
      onSaved(res.stages);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الإضافة"),
  });

  const renameClassMutation = useMutation({
    mutationFn: (input: { id: number; name: string }) => updateClassRow({ data: input }),
    onSuccess: (res) => {
      toast.success("حُفظ اسم القسم");
      onSaved(res.stages);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });

  const deleteClassMutation = useMutation({
    mutationFn: (id: number) => deleteClassRow({ data: { id } }),
    onSuccess: (res) => {
      toast.success("حُذف القسم");
      onSaved(res.stages);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحذف"),
  });

  if (!allowed) {
    return (
      <div className="space-y-3">
        <SettingsBack />
        <p className="text-fg-muted">تنسيق الصفوف يحتاج تصريح وصول من مدير التطبيق.</p>
      </div>
    );
  }

  const stages: StageRow[] = query.data?.stages ?? [];

  return (
    <div className="space-y-6">
      <div>
        <SettingsBack />
        <h1 className="text-3xl font-semibold tracking-tight">تنسيق الصفوف والفصول</h1>
        <p className="text-sm text-fg-muted">
          المسميات الرئيسية مثل الصف الأول متوسط، وداخل كل صف الأقسام ١ و٢ و٣ و٤ و٥ فتظهر بالشكل أولى/1.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => standardMutation.mutate()}
          disabled={standardMutation.isPending}
        >
          تطبيق الصفوف القياسية (أول / ثاني / ثالث متوسط)
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => mergeMutation.mutate()}
          disabled={mergeMutation.isPending}
        >
          دمج الفصول المكررة
        </Button>
      </div>

      {stages.map((stage) => (
        <Card key={stage.id}>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>{stage.name}</CardTitle>
              <p className="mt-1 text-sm text-fg-muted">
                الرمز المختصر {stage.shortName} · {stage.classes.length} أقسام
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setEditingStage(stage.id);
                  setDraftName(stage.name);
                  setDraftShort(stage.shortName);
                }}
              >
                تعديل التسمية
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => {
                  const n = stage.classes.reduce((sum, cls) => sum + cls.studentCount, 0);
                  if (n > 0) {
                    if (window.confirm(`حذف صف «${stage.name}» مع ${n} طالب؟ لا يمكن التراجع.`)) {
                      deleteStageMutation.mutate({ id: stage.id, withStudents: true });
                    }
                  } else if (window.confirm(`حذف صف «${stage.name}» وكل أقسامه؟`)) {
                    deleteStageMutation.mutate({ id: stage.id });
                  }
                }}
              >
                <Trash2 className="size-4" />
                حذف الصف
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {editingStage === stage.id ? (
              <form
                className="flex flex-wrap items-end gap-2 rounded-[var(--radius-md)] border border-border bg-bg-elevated p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  updateStageMutation.mutate({
                    id: stage.id,
                    name: draftName,
                    shortName: draftShort,
                  });
                }}
              >
                <div className="min-w-40 flex-1 space-y-1.5">
                  <Label>اسم الصف</Label>
                  <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} />
                </div>
                <div className="w-24 space-y-1.5">
                  <Label>الرمز</Label>
                  <Input value={draftShort} onChange={(e) => setDraftShort(e.target.value)} />
                </div>
                <Button type="submit" size="sm" disabled={updateStageMutation.isPending}>
                  حفظ
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setEditingStage(null)}>
                  إلغاء
                </Button>
              </form>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-fg-muted">
                    <th className="py-2 pe-3 font-medium">القسم</th>
                    <th className="py-2 pe-3 font-medium">يظهر باسم</th>
                    <th className="py-2 pe-3 font-medium">الطلاب</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {stage.classes.map((cls) => (
                    <tr key={cls.id} className="border-t border-border">
                      <td className="py-2 pe-3">
                        <Input
                          defaultValue={cls.name}
                          className="h-10 w-20"
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            if (next && next !== cls.name) {
                              renameClassMutation.mutate({ id: cls.id, name: next });
                            }
                          }}
                        />
                      </td>
                      <td className="py-2 pe-3 font-medium">{classLabel(stage.shortName, cls.name)}</td>
                      <td className="py-2 pe-3 tabular-nums">{cls.studentCount}</td>
                      <td className="py-2 text-left">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={cls.studentCount > 0}
                          onClick={() => deleteClassMutation.mutate(cls.id)}
                        >
                          حذف
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => addClassMutation.mutate(stage.id)}
              disabled={addClassMutation.isPending}
            >
              <Plus className="size-4" />
              إضافة قسم
            </Button>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>إضافة صف جديد</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              createStageMutation.mutate();
            }}
          >
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="stage-name">المسمى الرئيسي</Label>
              <Input
                id="stage-name"
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
                placeholder="الصف الثاني متوسط"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stage-short">الرمز (مثل 1 أو أ)</Label>
              <Input
                id="stage-short"
                value={stageShort}
                onChange={(e) => setStageShort(e.target.value)}
                placeholder="2"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sections">عدد الأقسام</Label>
              <Input
                id="sections"
                type="number"
                min={0}
                max={20}
                value={sectionCount}
                onChange={(e) => setSectionCount(Number(e.target.value) || 0)}
              />
            </div>
            <div className="sm:col-span-4">
              <Button type="submit" disabled={createStageMutation.isPending}>
                إضافة الصف وأقسامه
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
