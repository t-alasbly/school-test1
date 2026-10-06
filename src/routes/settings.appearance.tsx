import { createFileRoute } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SettingsBack } from "@/components/settings-back";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { updateAppearance } from "@/lib/school/api";
import { FONT_SCALES } from "@/lib/school/constants";
import {
  FONT_LABEL,
  FONT_LIST,
  FONT_STACKS,
  THEME_LIST,
  THEMES,
  applyAppearance,
  clampFontScale,
  mergeAppearance,
  parseAppearance,
  resolvedTokens,
  type Appearance,
  type FontId,
  type ThemeId,
  type ThemeTokens,
} from "@/lib/school/theme";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings/appearance")({ component: AppearanceSettings });

function AppearanceSettings() {
  const { school, staff } = useWorkspace();
  const queryClient = useQueryClient();
  const current = useMemo(
    () => mergeAppearance(school.appearance, staff.appearance),
    [school.appearance, staff.appearance],
  );
  const [draft, setDraft] = useState<Appearance>(current);
  const tokens = resolvedTokens(draft);
  const customized = Boolean(
    draft.custom?.primary || draft.custom?.bg || draft.custom?.fg || draft.custom?.card,
  );

  const mutation = useMutation({
    mutationFn: (input: {
      scope: "personal" | "school";
      appearance?: Appearance;
      reset?: boolean;
    }) => updateAppearance({ data: input }),
    onSuccess: (result, input) => {
      applyAppearance(result.appearance);
      setDraft(result.appearance);
      if (input.reset) toast.success(tr("عاد المظهر إلى افتراضي المدرسة"));
      else if (result.scope === "school") toast.success(tr("صار هذا المظهر افتراضي المدرسة"));
      else toast.success(tr("تم حفظ مظهر حسابك"));
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
  });

  function pickTheme(id: ThemeId) {
    const theme = THEMES[id];
    const next: Appearance = {
      themeId: id,
      font: theme?.font ?? draft.font,
      fontScale: draft.fontScale ?? 1,
      calendar: draft.calendar ?? "hijri",
      custom: undefined,
    };
    setDraft(next);
    applyAppearance(next);
  }

  function pickFont(font: FontId) {
    const next = { ...draft, font };
    setDraft(next);
    applyAppearance(next);
  }

  function pickScale(fontScale: number) {
    const next = { ...draft, fontScale: clampFontScale(fontScale) };
    setDraft(next);
    applyAppearance(next);
  }

  function setCustom(key: "primary" | "bg" | "fg" | "card", value: string) {
    const next: Appearance = {
      ...draft,
      custom: { ...draft.custom, [key]: value },
    };
    setDraft(next);
    applyAppearance(next);
  }

  return (
    <div className="space-y-6">
      <div>
        <SettingsBack />
        <h1 className="text-3xl font-semibold tracking-tight">{tr("المظهر")}</h1>
        <p className="text-sm text-fg-muted">
          قوالب جاهزة، وخطوط عربية أجمل (ال مسيري، Cairo، أميري وغيرها)، مع تكبير أو تصغير حجم الخط.
        </p>
      </div>

      <div
        className="overflow-hidden rounded-[var(--radius-lg)] border border-border shadow-[var(--shadow-card)]"
        style={{
          background: tokens.bg,
          color: tokens.fg,
          fontFamily: FONT_STACKS[draft.font],
        }}
      >
        <div
          className="flex items-center gap-2 border-b px-4 py-3"
          style={{ background: tokens.bgElevated, borderColor: tokens.border }}
        >
          <span className="grid size-8 place-items-center rounded-full text-xs font-bold" style={{ background: tokens.primary, color: tokens.primaryFg }}>
            {tr("م")}
          </span>
          <span>
            <span className="block text-sm font-semibold">{tr("متابعة الطلاب الشاملة")}</span>
            <span className="block text-[11px]" style={{ color: tokens.fgMuted }}>
              معاينة مباشرة للألوان والخط
            </span>
          </span>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="rounded-[var(--radius-md)] border p-3" style={{ background: tokens.card, borderColor: tokens.border }}>
            <p className="text-base font-semibold leading-7">{tr("عبدالرحمن القحطاني")}</p>
            <p className="mt-1 text-sm" style={{ color: tokens.fgMuted }}>
              أولى / 1 — اضغط الاسم للرسائل والطباعة
            </p>
          </div>
          <div className="flex items-center justify-between rounded-[var(--radius-md)] border p-3" style={{ background: tokens.card, borderColor: tokens.border }}>
            <span className="text-sm" style={{ color: tokens.fgMuted }}>{tr("زر أساسي")}</span>
            <span
              className="inline-flex h-10 items-center rounded-[var(--radius-sm)] px-4 text-sm font-medium"
              style={{ background: tokens.primary, color: tokens.primaryFg }}
            >
              {tr("حفظ")}
            </span>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{tr("قوالب جاهزة")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {THEME_LIST.map((theme) => {
            const selected = draft.themeId === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => pickTheme(theme.id)}
                className={cn(
                  "overflow-hidden rounded-[var(--radius-lg)] border text-right transition-[border-color,transform] duration-150 hover:-translate-y-0.5",
                  selected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40",
                )}
              >
                <ThemeMini tokens={theme.tokens} />
                <span className="block px-3 py-2">
                  <span className="block text-sm font-semibold">{theme.name}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-fg-muted">{theme.hint}</span>
                  {selected && customized ? (
                    <span className="mt-1 block text-[11px] text-primary">{tr("معدّل بألوانك")}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr("التقويم")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-fg-muted">{tr("الأساس الهجري. يمكنك إظهار التواريخ بالميلادي من هنا أو من شاشة الغياب.")}</p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["hijri", tr("هجري"), tr("أم القرى — المعتمد في الوزارة")],
                ["gregorian", tr("ميلادي"), tr("التقويم الميلادي بجانب الهجري")],
              ] as const
            ).map(([id, label, hint]) => {
              const selected = (draft.calendar ?? "hijri") === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    const next = { ...draft, calendar: id };
                    setDraft(next);
                    applyAppearance(next);
                  }}
                  className={cn(
                    "min-h-16 rounded-[var(--radius-md)] border px-3 py-2 text-right",
                    selected
                      ? "border-primary bg-primary/5 font-semibold text-primary"
                      : "border-border bg-bg-elevated",
                  )}
                >
                  <span className="block text-base">{label}</span>
                  <span className="mt-0.5 block text-xs font-normal text-fg-muted">{hint}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr("الخط")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {FONT_LIST.map((font) => (
            <button
              key={font}
              type="button"
              onClick={() => pickFont(font)}
              className={cn(
                "min-h-14 rounded-[var(--radius-md)] border px-3 py-2 text-right",
                draft.font === font
                  ? "border-primary bg-primary/5 font-semibold text-primary"
                  : "border-border bg-bg-elevated",
              )}
              style={{ fontFamily: FONT_STACKS[font] }}
            >
              <span className="block text-base">أبجد هوز — {FONT_LABEL[font].split(" — ")[0]}</span>
              <span className="mt-0.5 block text-xs font-normal text-fg-muted">{FONT_LABEL[font]}</span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr("حجم الخط")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {FONT_SCALES.map((item) => {
            const selected = clampFontScale(draft.fontScale ?? 1) === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => pickScale(item.value)}
                className={cn(
                  "min-h-14 rounded-[var(--radius-md)] border px-3 py-2",
                  selected
                    ? "border-primary bg-primary/5 font-semibold text-primary"
                    : "border-border bg-bg-elevated",
                )}
                style={{ fontSize: `${16 * item.value}px` }}
              >
                {tr(item.label)}
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr("ألوان مخصصة")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["primary", tr("اللون الأساسي"), draft.custom?.primary],
              ["bg", tr("خلفية الصفحة"), draft.custom?.bg],
              ["fg", tr("لون الخط"), draft.custom?.fg],
              ["card", tr("لون البطاقات"), draft.custom?.card],
            ] as const
          ).map(([key, label, value]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`color-${key}`}>{label}</Label>
              <div className="flex items-center gap-2">
                <input
                  id={`color-${key}`}
                  type="color"
                  value={value || fallbackColor(draft, key)}
                  onChange={(e) => setCustom(key, e.target.value)}
                  className="h-11 w-14 cursor-pointer rounded-[var(--radius-sm)] border border-border bg-bg-elevated p-1"
                />
                <span className="text-xs text-fg-muted" dir="ltr">
                  {value || fallbackColor(draft, key)}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ scope: "personal", appearance: parseAppearance(draft) })}
        >
          حفظ لمظهر حسابي
        </Button>
        {staff.role === "admin" ? (
          <Button
            variant="secondary"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ scope: "school", appearance: parseAppearance(draft) })}
          >
            تعميم على المدرسة
          </Button>
        ) : null}
        <Button
          variant="secondary"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ scope: "personal", reset: true })}
        >
          إعادة الافتراضي
        </Button>
      </div>
    </div>
  );
}

function ThemeMini({ tokens }: { tokens: ThemeTokens }) {
  return (
    <span className="block p-2" style={{ background: tokens.bg }}>
      <span
        className="flex h-7 items-center gap-1.5 rounded-t-[8px] px-2"
        style={{ background: tokens.bgElevated, color: tokens.fg }}
      >
        <span className="size-3 rounded-full" style={{ background: tokens.primary }} />
        <span className="h-1.5 w-10 rounded-full" style={{ background: tokens.fg, opacity: 0.35 }} />
      </span>
      <span
        className="mt-1.5 block h-10 rounded-[8px] border"
        style={{ background: tokens.card, borderColor: tokens.border }}
      />
    </span>
  );
}

function fallbackColor(appearance: Appearance, key: "primary" | "bg" | "fg" | "card") {
  const theme = THEMES[appearance.themeId] ?? THEMES.oasis;
  if (key === "primary") return theme.tokens.primary;
  if (key === "bg") return theme.tokens.bg;
  if (key === "fg") return theme.tokens.fg;
  return theme.tokens.card;
}
