import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsBack } from "@/components/settings-back";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createImprovementOption,
  listAllImprovementOptions,
  updateImprovementOption,
} from "@/lib/school/api";
import { staffCan } from "@/lib/school/permissions";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/settings/improve")({
  component: ImproveSettings,
});

function ImproveSettings() {
  const { staff } = useWorkspace();
  const queryClient = useQueryClient();
  const allowed =
    staff.role === "admin" || staffCan(staff, "counseling") || staffCan(staff, "acceptImprovements");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const query = useQuery({
    queryKey: ["improvement-options"],
    queryFn: () => listAllImprovementOptions(),
    enabled: allowed,
  });

  const createMutation = useMutation({
    mutationFn: () => createImprovementOption({ data: { name: newName } }),
    onSuccess: (res) => {
      toast.success(res.existed ? "هذا الخيار موجود مسبقاً" : "تمت الإضافة إلى القائمة");
      setNewName("");
      void queryClient.invalidateQueries({ queryKey: ["improvement-options"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الإضافة"),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: number; name?: string; active?: boolean }) =>
      updateImprovementOption({ data: input }),
    onSuccess: () => {
      toast.success("تم الحفظ");
      setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: ["improvement-options"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });

  if (!allowed) {
    return (
      <div className="space-y-3">
        <SettingsBack />
        <p className="text-fg-muted">إدارة خيارات تحسين السلوك لمدير التطبيق والمرشد الطلابي ووكيل شؤون الطلاب.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <SettingsBack />
        <h1 className="text-3xl font-semibold tracking-tight">خيارات تحسين السلوك</h1>
        <p className="text-sm text-fg-muted">
          تظهر للمعلم عند الضغط على تحسين سلوك الطالب. أضف السلوكيات المتكررة هنا — المرشد الطلابي يمكنه الإضافة أيضاً.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>القائمة المحفوظة</CardTitle>
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
              placeholder="سلوك تريد تحسينه…"
              className="min-w-48 flex-1"
            />
            <Button type="submit" disabled={createMutation.isPending || newName.trim().length < 2}>
              إضافة
            </Button>
          </form>
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-md)] border border-border">
            {(query.data ?? []).map((item: { id: number; name: string; active: boolean }) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                {editingId === item.id ? (
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="min-w-40 flex-1"
                  />
                ) : (
                  <span className="min-w-0 flex-1 font-medium">
                    {item.name} {item.active ? null : <Badge tone="default">موقوف</Badge>}
                  </span>
                )}
                {editingId === item.id ? (
                  <Button size="sm" onClick={() => updateMutation.mutate({ id: item.id, name: editingName.trim() })}>
                    حفظ
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
                    تعديل
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => updateMutation.mutate({ id: item.id, active: !item.active })}
                >
                  {item.active ? "إيقاف" : "تفعيل"}
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
