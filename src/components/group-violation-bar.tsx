import { Check, ListChecks } from "lucide-react";
import { tr } from "@/lib/school/i18n";
import { PageHelp } from "@/components/page-help";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function GroupViolationBar({
  picking,
  selected,
  shownCount,
  elsewhere,
  onTogglePicking,
  onSelectShown,
  onClear,
  onApply,
}: {
  picking: boolean;
  selected: number;
  shownCount: number;
  elsewhere?: string;
  onTogglePicking: () => void;
  onSelectShown: () => void;
  onClear: () => void;
  onApply: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
      <div className="flex min-w-0 items-center gap-0.5">
        <Button
          type="button"
          size="sm"
          variant={picking ? "default" : "secondary"}
          className="h-8 px-2 text-xs sm:h-9 sm:px-3 sm:text-sm"
          onClick={onTogglePicking}
        >
          <ListChecks className="size-3.5 sm:size-4" />
          {tr("مخالفات جماعية")}
        </Button>
        <PageHelp
          text={`${tr("حدد طلاباً من أكثر من مرحلة أو فصل، ثم سجّل عليهم مخالفة واحدة.")} ${tr("التحديد يبقى عند الانتقال بين المراحل والفصول حتى التسجيل أو المسح.")}`}
        />
      </div>
      {picking ? (
        <div className="flex w-full min-w-0 gap-1.5 overflow-x-auto">
          <Button type="button" size="sm" variant="secondary" className="h-8 shrink-0 px-2 text-xs" onClick={onSelectShown} disabled={shownCount === 0}>
            {tr("تحديد الظاهر")} ({shownCount})
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 shrink-0 px-2 text-xs" onClick={onClear} disabled={selected === 0}>
            {tr("مسح")}
          </Button>
          <Button type="button" size="sm" className="h-8 shrink-0 px-2 text-xs" onClick={onApply} disabled={selected === 0}>
            {tr("تسجيل على")} {selected}
          </Button>
          {elsewhere ? <p className="self-center text-xs text-fg-muted">{elsewhere}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function PickMark({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={checked ? `إلغاء تحديد ${label}` : `تحديد ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "mt-0.5 grid size-9 shrink-0 place-items-center rounded-md border",
        checked ? "border-primary bg-primary text-primary-fg" : "border-border bg-bg text-transparent",
      )}
    >
      <Check className="size-4" />
    </button>
  );
}
