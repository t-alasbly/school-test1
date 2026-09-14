import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsBack } from "@/components/settings-back";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  createBehaviorType,
  listAllBehaviorTypes,
  updateBehaviorType,
} from "@/lib/school/api";
import {
  degreeLabel,
  procedureLadder,
  procedureStageLabel,
} from "@/lib/school/constants";
import type { CatalogItem } from "@/lib/school/types";

export const Route = createFileRoute("/settings/violations")({ component: ViolationsSettings });

function ViolationsSettings() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newDegree, setNewDegree] = useState("1");
  const [openId, setOpenId] = useState<number | null>(null);
  const query = useQuery({
    queryKey: ["behavior-types"],
    queryFn: () => listAllBehaviorTypes(),
  });

  const createMutation = useMutation({
    mutationFn: () => createBehaviorType({ data: { name: newName, degree: Number(newDegree) } }),
    onSuccess: () => {
      toast.success("تمت إضافة المخالفة بإجراءات درجتها الرسمية");
      setNewName("");
      void queryClient.invalidateQueries({ queryKey: ["behavior-types"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الإضافة"),
  });

  const grouped = [1, 2, 3, 4, 5].map((degree) => ({
    degree,
    items: (query.data ?? []).filter((item: any) => (item.degree ?? 1) === degree),
  }));

  return (
    <div className="space-y-6">
      <div>
        <SettingsBack />
        <h1 className="text-3xl font-semibold tracking-tight">المخالفات</h1>
        <p className="text-sm text-fg-muted">
          لكل مخالفة سلم إجراءات: الأول ثم الثاني حتى الأخير، ويُعاد الأخير عند التكرار بعدها.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>إضافة مخالفة</CardTitle>
        </CardHeader>
        <CardContent>
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
              placeholder="اسم المخالفة…"
              className="min-w-48 flex-1"
            />
            <Select value={newDegree} onChange={(e) => setNewDegree(e.target.value)} className="w-36">
              <option value="1">الدرجة الأولى</option>
              <option value="2">الدرجة الثانية</option>
              <option value="3">الدرجة الثالثة</option>
              <option value="4">الدرجة الرابعة</option>
              <option value="5">الدرجة الخامسة</option>
            </Select>
            <Button type="submit" disabled={createMutation.isPending || newName.trim().length < 2}>
              إضافة
            </Button>
          </form>
        </CardContent>
      </Card>

      {grouped.map((group) =>
        group.items.length ? (
          <section key={group.degree} className="space-y-3">
            <h2 className="text-lg font-semibold">الدرجة {degreeLabel(group.degree)}</h2>
            <ul className="space-y-2">
              {group.items.map((item: any) => (
                <ViolationCard
                  key={item.id}
                  item={item}
                  open={openId === item.id}
                  onToggle={() => setOpenId(openId === item.id ? null : item.id)}
                />
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}

function ViolationCard({
  item,
  open,
  onToggle,
}: {
  item: CatalogItem;
  open: boolean;
  onToggle: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(item.name);
  const [degree, setDegree] = useState(String(item.degree ?? 1));
  const [stages, setStages] = useState<string[][]>(
    item.procedures?.length ? item.procedures.map((s) => [...s]) : procedureLadder(item.degree),
  );

  const mutation = useMutation({
    mutationFn: () =>
      updateBehaviorType({
        data: {
          id: item.id,
          name,
          degree: Number(degree),
          procedures: stages,
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ المخالفة وإجراءاتها");
      void queryClient.invalidateQueries({ queryKey: ["behavior-types"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });

  const toggle = useMutation({
    mutationFn: () => updateBehaviorType({ data: { id: item.id, active: !item.active } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["behavior-types"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  return (
    <li className="rounded-[var(--radius-lg)] border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-right">
          <span className="block font-medium">{item.name}</span>
          <span className="text-xs text-fg-muted">
            {(item.procedures?.length || procedureLadder(item.degree).length)} إجراءات متدرجة
          </span>
        </button>
        <Badge tone={item.active ? "ok" : "default"}>{item.active ? "نشط" : "موقوف"}</Badge>
        <Button size="sm" variant="secondary" onClick={onToggle}>
          {open ? "إخفاء" : "الإجراءات"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => toggle.mutate()}>
          {item.active ? "إيقاف" : "تفعيل"}
        </Button>
      </div>
      {open ? (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <div className="flex flex-wrap gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="min-w-48 flex-1" />
            <Select value={degree} onChange={(e) => setDegree(e.target.value)} className="w-36">
              <option value="1">الأولى</option>
              <option value="2">الثانية</option>
              <option value="3">الثالثة</option>
              <option value="4">الرابعة</option>
              <option value="5">الخامسة</option>
            </Select>
          </div>
          <div className="space-y-3">
            {stages.map((stage, i) => (
              <div key={i} className="rounded-[var(--radius-md)] border border-border bg-bg p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {procedureStageLabel(i + 1)}
                    {i === stages.length - 1 ? " — ويستمر عند التكرار بعد ذلك" : ""}
                  </p>
                  {stages.length > 1 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setStages(stages.filter((_, idx) => idx !== i))}
                    >
                      حذف
                    </Button>
                  ) : null}
                </div>
                <ul className="space-y-2">
                  {stage.map((line, j) => (
                    <li key={j}>
                      <Input
                        value={line}
                        onChange={(e) => {
                          const next = stages.map((s) => [...s]);
                          next[i]![j] = e.target.value;
                          setStages(next);
                        }}
                      />
                    </li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  onClick={() => {
                    const next = stages.map((s) => [...s]);
                    next[i] = [...next[i]!, ""];
                    setStages(next);
                  }}
                >
                  بند في هذا الإجراء
                </Button>
              </div>
            ))}
            {stages.length < 8 ? (
              <Button
                variant="secondary"
                onClick={() => setStages([...stages, [""]])}
              >
                إضافة إجراء تالٍ
              </Button>
            ) : null}
          </div>
          <Button
            disabled={mutation.isPending || name.trim().length < 2}
            onClick={() => mutation.mutate()}
          >
            حفظ المخالفة والإجراءات
          </Button>
        </div>
      ) : null}
    </li>
  );
}
