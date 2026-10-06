import { createFileRoute } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
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
  pruneEmptyDivisionsFn,
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
      toast.success(tr("طُبّقت مسميات الصفوف القياسية وأقسامها"));
      onSaved(res.stages);
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر التطبيق")),
  });

  const pruneMutation = useMutation({
    mutationFn: () => pruneEmptyDivisionsFn(),
    onSuccess: (res) => {
      const n = (res.removedClasses ?? 0) + (res.removedStages ?? 0);
      toast.success(n ? `حُذف ${res.removedClasses ?? 0} قسماً فارغاً` : tr("لا توجد أقسام فارغة"));
      onSaved(res.stages);
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحذف")),
  });

  const mergeMutation = useMutation({
    mutationFn: () => repairClassStructureFn(),
    onSuccess: (res) => {
      const n = (res.stagesMerged ?? 0) + (res.classesMerged ?? 0);
      toast.success(n ? `دُمج ${n} صف أو فصل مكرر` : tr("لا توجد فصول مكررة"));
      onSaved(res.stages);
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الدمج")),
  });

  const createStageMutation = useMutation({
    mutationFn: () =>
      createStage({
        data: { name: stageName, shortName: stageShort, sections: sectionCount },
      }),
    onSuccess: (res) => {
      toast.success(tr("أُضيف الصف"));
      setStageName("");
      setStageShort("");
      onSaved(res.stages);
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الإضافة")),
  });

  const updateStageMutation = useMutation({
    mutationFn: (input: { id: number; name: string; shortName: string }) =>
      updateStage({ data: input }),
    onSuccess: (res) => {
      toast.success(tr("حُفظت تسمية الصف"));
      setEditingStage(null);
      onSaved(res.stages);
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
  });

  const deleteStageMutation = useMutation({
    mutationFn: (input: { id: number; withStudents?: boolean }) =>
      deleteStage({ data: input }),
    onSuccess: (res) => {
      toast.success(tr("حُذف الصف"));
      onSaved(res.stages);
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحذف")),
  });

  const addClassMutation = useMutation({
    mutationFn: (stageId: number) => createClassInStage({ data: { stageId } }),
    onSuccess: (res) => {
      toast.success(tr("أُضيف قسم"));
      onSaved(res.stages);
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الإضافة")),
  });

  const renameClassMutation = useMutation({
    mutationFn: (input: { id: number; name: string }) => updateClassRow({ data: input }),
    onSuccess: (res) => {
      toast.success(tr("حُفظ اسم القسم"));
      onSaved(res.stages);
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
  });

  const deleteClassMutation = useMutation({
    mutationFn: (id: number) => deleteClassRow({ data: { id } }),
    onSuccess: (res) => {
      toast.success(tr("حُذف القسم"));
      onSaved(res.stages);
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحذف")),
  });

  if (!allowed) {
    return (
      <div className="space-y-3">
        <SettingsBack />
        <p className="text-fg-muted">{tr("تنسيق الصفوف يحتاج تصريح وصول من مدير التطبيق.")}</p>
      </div>
    );
  }

  const stages: StageRow[] = query.data?.stages ?? [];

  return (
    <div className="space-y-6">
      <div>
        <SettingsBack />
        <h1 className="text-3xl font-semibold tracking-tight">{tr("تنسيق الصفوف والفصول")}</h1>
        <p className="text-sm text-fg-muted">
          التقسيم يظهر كما في ملف الطلاب: الصف ثم الفصل. الأقسام الفارغة من التقسيم القديم لا تظهر في الفصول والغياب بعد رفع الملف.
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
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            if (window.confirm(tr("حذف كل الأقسام والصفوف التي لا طلاب فيها؟ التقسيم يبقى كما في أسماء الطلاب الحالية."))) {
              pruneMutation.mutate();
            }
          }}
          disabled={pruneMutation.isPending}
        >
          حذف الأقسام الفارغة
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
                  <Label>{tr("اسم الصف")}</Label>
                  <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} />
                </div>
                <div className="w-24 space-y-1.5">
                  <Label>{tr("الرمز")}</Label>
                  <Input value={draftShort} onChange={(e) => setDraftShort(e.target.value)} />
                </div>
                <Button type="submit" size="sm" disabled={updateStageMutation.isPending}>
                  {tr("حفظ")}
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setEditingStage(null)}>
                  {tr("إلغاء")}
                </Button>
              </form>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-fg-muted">
                    <th className="py-2 pe-3 font-medium">{tr("القسم")}</th>
                    <th className="py-2 pe-3 font-medium">{tr("يظهر باسم")}</th>
                    <th className="py-2 pe-3 font-medium">{tr("الطلاب")}</th>
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
                          {tr("حذف")}
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
          <CardTitle>{tr("إضافة صف جديد")}</CardTitle>
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
              <Label htmlFor="stage-name">{tr("المسمى الرئيسي")}</Label>
              <Input
                id="stage-name"
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
                placeholder={tr("الصف الثاني متوسط")}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stage-short">{tr("الرمز (مثل 1 أو أ)")}</Label>
              <Input
                id="stage-short"
                value={stageShort}
                onChange={(e) => setStageShort(e.target.value)}
                placeholder="2"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sections">{tr("عدد الأقسام")}</Label>
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
