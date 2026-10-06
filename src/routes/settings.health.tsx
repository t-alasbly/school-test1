import { createFileRoute } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsBack } from "@/components/settings-back";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createHealthCondition,
  listAllHealthConditions,
  updateHealthCondition,
} from "@/lib/school/api";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/settings/health")({ component: HealthSettings });

function HealthSettings() {
  const { staff } = useWorkspace();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const query = useQuery({
    queryKey: ["health-conditions"],
    queryFn: () => listAllHealthConditions(),
    enabled: staff.role === "admin",
  });

  const createMutation = useMutation({
    mutationFn: () => createHealthCondition({ data: { name: newName } }),
    onSuccess: (res) => {
      toast.success(res.existed ? tr("هذا المرض موجود مسبقاً") : tr("تمت الإضافة إلى القائمة"));
      setNewName("");
      void queryClient.invalidateQueries({ queryKey: ["health-conditions"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الإضافة")),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: number; name?: string; active?: boolean }) =>
      updateHealthCondition({ data: input }),
    onSuccess: () => {
      toast.success(tr("تم الحفظ"));
      setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: ["health-conditions"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
  });

  if (staff.role !== "admin") {
    return (
      <div className="space-y-3">
        <SettingsBack />
        <p className="text-fg-muted">{tr("إدارة قائمة الأمراض للمدير فقط. المرشد يختار منها ويضيف ما ينقص.")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <SettingsBack />
        <h1 className="text-3xl font-semibold tracking-tight">{tr("الأمراض والحالات الصحية")}</h1>
        <p className="text-sm text-fg-muted">
          قائمة يعتمدها المرشد عند تسجيل الملاحظة الصحية. إن اختار حالة غير موجودة تُضاف هنا تلقائياً.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{tr("القائمة المحفوظة")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim().length >= 2) createMutation.mutate();
            }}
          >
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={tr("مرض أو حالة جديدة…")}
              className="min-w-48 flex-1"
            />
            <Button type="submit" disabled={createMutation.isPending || newName.trim().length < 2}>
              {tr("إضافة")}
            </Button>
          </form>
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-md)] border border-border">
            {(query.data ?? []).map((item: any) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                {editingId === item.id ? (
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="min-w-40 flex-1"
                  />
                ) : (
                  <span className="min-w-0 flex-1 font-medium">
                    {item.name}{" "}
                    {item.active ? null : <Badge tone="default">{tr("موقوف")}</Badge>}
                  </span>
                )}
                {editingId === item.id ? (
                  <Button
                    size="sm"
                    onClick={() =>
                      updateMutation.mutate({ id: item.id, name: editingName.trim() })
                    }
                  >
                    {tr("حفظ")}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditingId(item.id);
                      setEditingName(item.name);
                    }}
                  >
                    {tr("تعديل")}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    updateMutation.mutate({ id: item.id, active: !item.active })
                  }
                >
                  {item.active ? tr("إيقاف") : tr("تفعيل")}
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
