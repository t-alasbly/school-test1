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
import { Select } from "@/components/ui/select";
import {
  createBehaviorType,
  listAllBehaviorTypes,
  updateBehaviorType,
} from "@/lib/school/api";
import {
  DEGREE_DEDUCT,
  degreeLabel,
  degreeTone,
  isStaffViolation,
  procedureLadder,
  procedureStageLabel,
} from "@/lib/school/constants";
import type { CatalogItem } from "@/lib/school/types";

export const Route = createFileRoute("/settings/violations")({ component: ViolationsSettings });

function ViolationsSettings() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newDegree, setNewDegree] = useState("1");
  const [audience, setAudience] = useState<"students" | "staff">("students");
  const [degree, setDegree] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const query = useQuery({
    queryKey: ["behavior-types"],
    queryFn: () => listAllBehaviorTypes(),
  });

  const createMutation = useMutation({
    mutationFn: () => createBehaviorType({ data: { name: newName, degree: Number(newDegree) } }),
    onSuccess: () => {
      toast.success(tr("تمت إضافة المخالفة بإجراءات درجتها الرسمية"));
      setNewName("");
      void queryClient.invalidateQueries({ queryKey: ["behavior-types"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الإضافة")),
  });

  const rows = (query.data ?? []) as CatalogItem[];
  const inAudience = rows.filter((item) => isStaffViolation(item) === (audience === "staff"));
  const degrees = audience === "staff" ? [4, 5] : [1, 2, 3, 4, 5];
  const activeDegree = degrees.includes(degree) ? degree : degrees[0];
  const items = inAudience.filter((item) => (item.degree ?? 1) === activeDegree);
  const ladder = procedureLadder(activeDegree);

  return (
    <div className="space-y-5 pb-8">
      <div>
        <SettingsBack />
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{tr("المخالفات")}</h1>
        <p className="text-sm leading-6 text-fg-muted">
          {tr("مخالفات الطلبة منفصلة عن المخالفات تجاه المعلمين ومن في حكمهم. لكل درجة لونها وإجراءاتها.")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => { setAudience("students"); setDegree(1); }}
          className={`min-h-14 rounded-2xl border px-3 text-base font-bold ${audience === "students" ? "border-primary bg-primary text-primary-fg" : "border-border bg-card"}`}
        >
          {tr("مخالفات الطلبة")}
        </button>
        <button
          type="button"
          onClick={() => { setAudience("staff"); setDegree(4); }}
          className={`min-h-14 rounded-2xl border px-3 text-base font-bold ${audience === "staff" ? "border-[#7f1d1d] bg-[#7f1d1d] text-white" : "border-border bg-card"}`}
        >
          {tr("تجاه المعلمين ومن في حكمهم")}
        </button>
      </div>

      <div className={`grid gap-2 ${degrees.length === 2 ? "grid-cols-2" : "grid-cols-5"}`}>
        {degrees.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setDegree(value)}
            className={`min-h-[4.25rem] rounded-2xl border-2 px-1 text-center ${degreeTone(value)} ${activeDegree === value ? "ring-2 ring-offset-2 ring-current" : "opacity-80"}`}
          >
            <span className="block text-sm font-bold leading-5 sm:text-base">{degreeLabel(value)}</span>
            <span className="mt-0.5 block text-[11px] font-semibold leading-4">{DEGREE_DEDUCT[value]}</span>
          </button>
        ))}
      </div>

      <section className={`space-y-3 rounded-2xl border-2 p-3 sm:p-4 ${degreeTone(activeDegree)}`}>
        <h2 className="text-lg font-bold">{tr("الإجراءات")} — {degreeLabel(activeDegree)}</h2>
        <ol className="space-y-2 text-sm leading-6 text-fg">
          {ladder.map((stage, index) => (
            <li key={index} className="rounded-xl bg-white/80 px-3 py-2 text-[#111]">
              <p className="font-semibold">{procedureStageLabel(index + 1)}</p>
              <p>{stage.join(" — ")}</p>
            </li>
          ))}
        </ol>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{tr("إضافة مخالفة")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim().length >= 2) createMutation.mutate();
            }}
          >
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={tr("اسم المخالفة…")}
              className="min-h-12 min-w-48 flex-1 text-base"
            />
            <Select value={newDegree} onChange={(e) => setNewDegree(e.target.value)} className="min-h-12 w-full text-base sm:w-36">
              <option value="1">{tr("الدرجة الأولى")}</option>
              <option value="2">{tr("الدرجة الثانية")}</option>
              <option value="3">{tr("الدرجة الثالثة")}</option>
              <option value="4">{tr("الدرجة الرابعة")}</option>
              <option value="5">{tr("الدرجة الخامسة")}</option>
            </Select>
            <Button type="submit" className="min-h-12" disabled={createMutation.isPending || newName.trim().length < 2}>
              {tr("إضافة")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <ul className="space-y-3">
        {items.map((item) => (
          <ViolationCard
            key={item.id}
            item={item}
            open={openId === item.id}
            onToggle={() => setOpenId(openId === item.id ? null : item.id)}
          />
        ))}
        {items.length === 0 ? (
          <li className="rounded-2xl border border-border px-4 py-8 text-center text-sm text-fg-muted">{tr("لا مخالفات في هذه الدرجة.")}</li>
        ) : null}
      </ul>
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
      toast.success(tr("تم حفظ المخالفة وإجراءاتها"));
      void queryClient.invalidateQueries({ queryKey: ["behavior-types"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
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
          <span className="block font-medium">{tr(item.name)}</span>
          <span className="text-xs text-fg-muted">
            {(item.procedures?.length || procedureLadder(item.degree).length)} إجراءات متدرجة
          </span>
        </button>
        <Badge tone={item.active ? "ok" : "default"}>{item.active ? tr("نشط") : tr("موقوف")}</Badge>
        <Button size="sm" variant="secondary" onClick={onToggle}>
          {open ? tr("إخفاء") : tr("الإجراءات")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => toggle.mutate()}>
          {item.active ? tr("إيقاف") : tr("تفعيل")}
        </Button>
      </div>
      {open ? (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <div className="flex flex-wrap gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="min-w-48 flex-1" />
            <Select value={degree} onChange={(e) => setDegree(e.target.value)} className="w-36">
              <option value="1">{tr("الأولى")}</option>
              <option value="2">{tr("الثانية")}</option>
              <option value="3">{tr("الثالثة")}</option>
              <option value="4">{tr("الرابعة")}</option>
              <option value="5">{tr("الخامسة")}</option>
            </Select>
          </div>
          <div className="space-y-3">
            {stages.map((stage, i) => (
              <div key={i} className="rounded-[var(--radius-md)] border border-border bg-bg p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {procedureStageLabel(i + 1)}
                    {i === stages.length - 1 ? tr(" — ويستمر عند التكرار بعد ذلك") : ""}
                  </p>
                  {stages.length > 1 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setStages(stages.filter((_, idx) => idx !== i))}
                    >
                      {tr("حذف")}
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
