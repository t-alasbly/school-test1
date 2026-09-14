import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsBack } from "@/components/settings-back";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createActionType, listAllActionTypes, updateActionType } from "@/lib/school/api";

export const Route = createFileRoute("/settings/actions")({ component: ActionsSettings });

function ActionsSettings() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const query = useQuery({
    queryKey: ["action-types"],
    queryFn: () => listAllActionTypes(),
  });

  const createMutation = useMutation({
    mutationFn: () => createActionType({ data: { name: newName } }),
    onSuccess: () => {
      toast.success("تمت الإضافة");
      setNewName("");
      void queryClient.invalidateQueries({ queryKey: ["action-types"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الإضافة"),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: number; name?: string; active?: boolean }) =>
      updateActionType({ data: input }),
    onSuccess: () => {
      toast.success("تم الحفظ");
      setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: ["action-types"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });

  return (
    <div className="space-y-6">
      <div>
        <SettingsBack />
        <h1 className="text-3xl font-semibold tracking-tight">الإجراءات</h1>
        <p className="text-sm text-fg-muted">خيارات إضافية تظهر عند اتخاذ الإجراء إلى جانب السلم الرسمي لكل مخالفة.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>خيارات اتخاذ الإجراء</CardTitle>
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
              placeholder="خيار جديد…"
              className="min-w-48 flex-1"
            />
            <Button type="submit" disabled={createMutation.isPending || newName.trim().length < 2}>
              إضافة
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
                    autoFocus
                  />
                ) : (
                  <span className={`min-w-0 flex-1 ${item.active ? "" : "text-fg-subtle line-through"}`}>
                    {item.name}
                  </span>
                )}
                <Badge tone={item.active ? "ok" : "default"}>{item.active ? "نشط" : "موقوف"}</Badge>
                {editingId === item.id ? (
                  <>
                    <Button
                      size="sm"
                      disabled={updateMutation.isPending || editingName.trim().length < 2}
                      onClick={() => updateMutation.mutate({ id: item.id, name: editingName })}
                    >
                      حفظ
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      إلغاء
                    </Button>
                  </>
                ) : (
                  <>
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
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ id: item.id, active: !item.active })}
                    >
                      {item.active ? "إيقاف" : "تفعيل"}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
