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
import { DEFAULT_STUDY_NOTES, STUDY_ACTIONS, STUDY_NOTE_HINTS } from "@/lib/school/constants";
import { createStudyNote, listAllStudyNotes, updateStudyNote } from "@/lib/school/api";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/settings/study")({
  component: StudySettings,
});

function StudySettings() {
  const { staff } = useWorkspace();
  const queryClient = useQueryClient();
  const allowed = staff.role === "admin";
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const query = useQuery({
    queryKey: ["study-notes"],
    queryFn: () => listAllStudyNotes(),
    enabled: allowed,
  });

  const createMutation = useMutation({
    mutationFn: () => createStudyNote({ data: { name: newName } }),
    onSuccess: (res) => {
      toast.success(res.existed ? tr("هذا الخيار موجود مسبقاً") : tr("تمت الإضافة إلى القائمة"));
      setNewName("");
      void queryClient.invalidateQueries({ queryKey: ["study-notes"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الإضافة")),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: number; name?: string; active?: boolean }) => updateStudyNote({ data: input }),
    onSuccess: () => {
      toast.success(tr("تم الحفظ"));
      setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: ["study-notes"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
  });

  if (!allowed) {
    return (
      <div className="space-y-3">
        <SettingsBack />
        <p className="text-fg-muted">{tr("إدارة الملاحظات الدراسية لمدير التطبيق.")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <SettingsBack />
        <h1 className="text-3xl font-semibold tracking-tight">{tr("الملاحظات الدراسية")}</h1>
        <p className="text-sm text-fg-muted">
          {tr("سبع ملاحظات أكاديمية. الإجراء يتدرج تلقائياً مع تكرار الملاحظة نفسها على الطالب، وهو منفصل عن المخالفات السلوكية.")}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{tr("مسار الإجراءات")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {STUDY_ACTIONS.map((action, index) => (
            <div key={action.id} className="rounded-[var(--radius-md)] border border-border px-3 py-2">
              <p className="text-sm font-semibold">{index + 1}. {tr(action.label)}</p>
              <p className="text-xs text-fg-muted">{tr(action.hint)}</p>
            </div>
          ))}
        </CardContent>
      </Card>
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
              placeholder={tr("ملاحظة دراسية جديدة…")}
              className="min-w-48 flex-1"
            />
            <Button type="submit" disabled={createMutation.isPending || newName.trim().length < 2}>
              {tr("إضافة")}
            </Button>
          </form>
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-md)] border border-border">
            {(query.data ?? []).map((item: { id: number; name: string; active: boolean }) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                {editingId === item.id ? (
                  <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="min-w-40 flex-1" />
                ) : (
                  <span className="min-w-0 flex-1 font-medium">
                    {tr(item.name)} {item.active ? null : <Badge tone="default">{tr("موقوف")}</Badge>}
                    {DEFAULT_STUDY_NOTES.indexOf(item.name) >= 0 ? (
                      <span className="mt-0.5 block text-xs font-normal text-fg-muted">{tr(STUDY_NOTE_HINTS[DEFAULT_STUDY_NOTES.indexOf(item.name)] ?? "")}</span>
                    ) : null}
                  </span>
                )}
                {editingId === item.id ? (
                  <Button size="sm" onClick={() => updateMutation.mutate({ id: item.id, name: editingName.trim() })}>
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
                <Button size="sm" variant="secondary" onClick={() => updateMutation.mutate({ id: item.id, active: !item.active })}>
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
