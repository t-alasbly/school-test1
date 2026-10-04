import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BUILTIN_STAT_CARDS, StatsGrid, type FollowupStats } from "@/components/stats-grid";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFollowupStats, saveStatCounters } from "@/lib/school/api";
import { cn } from "@/lib/utils";

const SOURCES = [
  { key: "daily-absence", label: "الغياب اليومي" },
  { key: "daily-late", label: "التأخر الصباحي" },
  { key: "note-absence", label: "الغياب عن الحصة" },
  { key: "note-late", label: "التأخر عن الحصة" },
  { key: "homework", label: "الواجبات" },
  { key: "behavior", label: "المخالفات" },
] as const;

const RANGES = [
  { key: "today", label: "اليوم" },
  { key: "week", label: "أسبوع" },
  { key: "month", label: "شهر" },
  { key: "total", label: "المجموع" },
] as const;

const EMPTY: FollowupStats = {
  dailyAbsence: { today: 0, week: 0, month: 0, total: 0 },
  dailyLate: { today: 0, week: 0, month: 0, total: 0 },
  noteAbsence: { today: 0, week: 0, month: 0, total: 0 },
  noteLate: { today: 0, week: 0, month: 0, total: 0 },
  homework: { today: 0, week: 0, month: 0, total: 0 },
  behavior: { today: 0, week: 0, month: 0, total: 0 },
};

type Counter = { id: string; title: string; source: string; range: string };

export function FollowupStatsPanel({ allowAdd = false }: { allowAdd?: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["followup-stats"],
    queryFn: () => getFollowupStats(),
    refetchInterval: 8000,
  });
  const [addOpen, setAddOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [source, setSource] = useState<(typeof SOURCES)[number]["key"]>("homework");
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("today");

  const counters: Counter[] = (query.data?.counters ?? []) as Counter[];
  const hidden: string[] = (query.data?.hidden ?? []) as string[];

  const persist = useMutation({
    mutationFn: (input: { counters?: Counter[]; hidden?: string[] }) =>
      saveStatCounters({
        data: {
          counters: (input.counters ?? counters).map((c) => ({
            id: c.id,
            title: c.title,
            source: c.source as (typeof SOURCES)[number]["key"],
            range: (c.range as (typeof RANGES)[number]["key"]) || "today",
          })),
          hidden: input.hidden ?? hidden,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["followup-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });

  function toggleHidden(id: string) {
    const next = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id];
    persist.mutate({ hidden: next });
  }

  function removeExtra(id: string) {
    persist.mutate({
      counters: counters.filter((c) => c.id !== id),
      hidden: hidden.filter((x) => x !== id),
    });
    toast.success("أُزيل العداد");
  }

  const add = useMutation({
    mutationFn: async () => {
      const id = `c-${Date.now().toString(36)}`;
      return saveStatCounters({
        data: {
          counters: [...counters, { id, title: title.trim(), source, range }],
          hidden,
        },
      });
    },
    onSuccess: () => {
      toast.success("أُضيف العداد");
      setTitle("");
      setAddOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["followup-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الإضافة"),
  });

  const stats = query.data?.stats ?? EMPTY;
  const extra = (query.data?.extra ?? []) as {
    id: string;
    title: string;
    href: string;
    value: number;
    tone: "danger" | "warn" | "ok";
  }[];

  return (
    <>
      <StatsGrid
        stats={stats}
        extra={extra}
        hidden={hidden}
        onAdd={allowAdd ? () => setAddOpen(true) : undefined}
        onLayout={allowAdd ? () => setLayoutOpen(true) : undefined}
      />
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة عداد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">
              مثال: الواجبات أو التأخر عن دخول الحصة. عند الضغط على العداد تنتقل لصفحة الإحصاء.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="counter-title">اسم العداد</Label>
              <Input
                id="counter-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="الواجبات"
              />
            </div>
            <div className="space-y-1.5">
              <Label>المصدر</Label>
              <div className="flex flex-wrap gap-1.5">
                {SOURCES.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSource(item.key)}
                    className={`h-10 rounded-full border px-3 text-sm ${
                      source === item.key
                        ? "border-primary bg-primary text-primary-fg"
                        : "border-border bg-bg-elevated text-fg-muted"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>الفترة</Label>
              <div className="flex flex-wrap gap-1.5">
                {RANGES.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setRange(item.key)}
                    className={`h-10 rounded-full border px-3 text-sm ${
                      range === item.key
                        ? "border-primary bg-primary text-primary-fg"
                        : "border-border bg-bg-elevated text-fg-muted"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <Button
              className="w-full"
              disabled={add.isPending || title.trim().length < 2}
              onClick={() => add.mutate()}
            >
              حفظ العداد
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={layoutOpen} onOpenChange={setLayoutOpen}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تنسيق العدادات</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-fg-muted">أخفِ ما لا تحتاجه أو أزل عدّاداً مضافاً. العدادات المخفية تبقى في القائمة حتى تعيدها.</p>
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-md)] border border-border">
            {BUILTIN_STAT_CARDS.map((item) => {
              const off = hidden.includes(item.id);
              return (
                <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                  <span className={cn("flex-1 text-sm", off && "text-fg-muted")}>{item.label}</span>
                  <button
                    type="button"
                    onClick={() => toggleHidden(item.id)}
                    className="inline-flex h-9 items-center gap-1 rounded-full px-2 text-xs text-fg-muted hover:bg-muted hover:text-fg"
                  >
                    {off ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    {off ? "مخفي" : "ظاهر"}
                  </button>
                </li>
              );
            })}
            {extra.map((item) => {
              const off = hidden.includes(item.id);
              return (
                <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                  <span className={cn("flex-1 text-sm", off && "text-fg-muted")}>{item.title}</span>
                  <button
                    type="button"
                    onClick={() => toggleHidden(item.id)}
                    className="inline-flex h-9 items-center gap-1 rounded-full px-2 text-xs text-fg-muted hover:bg-muted hover:text-fg"
                  >
                    {off ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    {off ? "مخفي" : "ظاهر"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeExtra(item.id)}
                    className="grid size-9 place-items-center rounded-[var(--radius-sm)] text-danger hover:bg-danger-soft"
                    aria-label="حذف العداد"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
