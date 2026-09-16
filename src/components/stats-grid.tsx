import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type StatBucket = {
  today: number;
  week: number;
  month: number;
  total: number;
};

export type FollowupStats = {
  dailyAbsence: StatBucket;
  dailyLate: StatBucket;
  noteAbsence: StatBucket;
  noteLate: StatBucket;
  homework: StatBucket;
  behavior: StatBucket;
};

export type StatCardDef = {
  id: string;
  label: string;
  tone: "danger" | "warn" | "ok";
  href: string;
  extra?: boolean;
};

export const BUILTIN_STAT_CARDS: (StatCardDef & { group: keyof FollowupStats; range: keyof StatBucket })[] = [
  { id: "abs-today", label: "غياب اليوم", tone: "danger", href: "/admin/absence?range=today", group: "dailyAbsence", range: "today" },
  { id: "abs-week", label: "غياب الأسبوع", tone: "danger", href: "/admin/absence?range=week", group: "dailyAbsence", range: "week" },
  { id: "abs-month", label: "غياب الشهر", tone: "danger", href: "/admin/absence?range=month", group: "dailyAbsence", range: "month" },
  { id: "abs-total", label: "مجموع الغياب", tone: "danger", href: "/admin/absence?range=all", group: "dailyAbsence", range: "total" },
  { id: "late-today", label: "تأخر اليوم", tone: "warn", href: "/admin/late?range=today", group: "dailyLate", range: "today" },
  { id: "late-week", label: "تأخر الأسبوع", tone: "warn", href: "/admin/late?range=week", group: "dailyLate", range: "week" },
  { id: "late-month", label: "تأخر الشهر", tone: "warn", href: "/admin/late?range=month", group: "dailyLate", range: "month" },
  { id: "late-total", label: "مجموع التأخر", tone: "warn", href: "/admin/late?range=all", group: "dailyLate", range: "total" },
  { id: "beh-today", label: "مخالفات اليوم", tone: "danger", href: "/admin/behavior?type=behavior&range=today", group: "behavior", range: "today" },
  { id: "beh-week", label: "مخالفات الأسبوع", tone: "danger", href: "/admin/behavior?type=behavior&range=week", group: "behavior", range: "week" },
  { id: "beh-month", label: "مخالفات الشهر", tone: "danger", href: "/admin/behavior?type=behavior&range=month", group: "behavior", range: "month" },
  { id: "beh-total", label: "مجموع المخالفات", tone: "danger", href: "/admin/behavior?type=behavior&range=all", group: "behavior", range: "total" },
  { id: "hw-today", label: "واجبات اليوم", tone: "warn", href: "/admin/behavior?type=homework&range=today", group: "homework", range: "today" },
  { id: "hw-week", label: "واجبات الأسبوع", tone: "warn", href: "/admin/behavior?type=homework&range=week", group: "homework", range: "week" },
  { id: "hw-month", label: "واجبات الشهر", tone: "warn", href: "/admin/behavior?type=homework&range=month", group: "homework", range: "month" },
  { id: "hw-total", label: "مجموع الواجبات", tone: "warn", href: "/admin/behavior?type=homework&range=all", group: "homework", range: "total" },
];

function go(navigate: ReturnType<typeof useNavigate>, href: string) {
  const [path, qs] = href.split("?");
  const search = Object.fromEntries(new URLSearchParams(qs ?? ""));
  void navigate({ to: path as never, search: search as never });
}

export function StatsGrid({
  stats,
  extra,
  hidden,
  onAdd,
  onLayout,
}: {
  stats: FollowupStats;
  extra?: { id: string; title: string; href: string; value: number; tone: "danger" | "warn" | "ok" }[];
  hidden?: string[];
  onAdd?: () => void;
  onLayout?: () => void;
}) {
  const navigate = useNavigate();
  const hiddenSet = new Set(hidden ?? []);
  const cards: { id: string; label: string; value: number; tone: "danger" | "warn" | "ok"; href: string }[] = [];
  for (const def of BUILTIN_STAT_CARDS) {
    if (hiddenSet.has(def.id)) continue;
    cards.push({
      id: def.id,
      label: def.label,
      value: stats[def.group][def.range],
      tone: def.tone,
      href: def.href,
    });
  }
  if (extra) {
    for (const item of extra) {
      if (hiddenSet.has(item.id)) continue;
      cards.push({ id: item.id, label: item.title, value: item.value, tone: item.tone, href: item.href });
    }
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {cards.map((tile) => (
        <button
          key={tile.id}
          type="button"
          onClick={() => go(navigate, tile.href)}
          className="rounded-xl border border-border bg-card px-2.5 py-2.5 text-right shadow-[var(--shadow-card)] transition-colors hover:border-primary"
        >
          <p className="text-[11px] leading-4 text-fg-muted">{tile.label}</p>
          <p
            className={cn(
              "mt-1 text-xl font-semibold tabular-nums sm:text-2xl",
              tile.tone === "danger" ? "text-danger" : tile.tone === "warn" ? "text-warn" : "text-ok",
            )}
          >
            {tile.value}
          </p>
        </button>
      ))}
      {onLayout ? (
        <button
          type="button"
          onClick={onLayout}
          className="rounded-xl border border-dashed border-border bg-card px-2.5 py-2.5 text-xs font-medium text-fg-muted hover:border-primary hover:text-fg"
        >
          تنسيق
        </button>
      ) : null}
      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="rounded-xl border border-dashed border-border bg-card px-2.5 py-2.5 text-xs font-medium text-fg-muted hover:border-primary hover:text-fg"
        >
          إضافة عداد
        </button>
      ) : null}
    </div>
  );
}
