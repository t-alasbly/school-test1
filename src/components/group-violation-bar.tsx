import { Check, ListChecks } from "lucide-react";
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
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant={picking ? "default" : "secondary"} onClick={onTogglePicking}>
        <ListChecks className="size-4" />
        مخالفة جماعية
      </Button>
      {picking ? (
        <>
          <Button type="button" size="sm" variant="secondary" onClick={onSelectShown} disabled={shownCount === 0}>
            تحديد الظاهر ({shownCount})
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClear} disabled={selected === 0}>
            مسح
          </Button>
          <Button type="button" size="sm" onClick={onApply} disabled={selected === 0}>
            تسجيل على {selected}
          </Button>
          <p className="w-full text-xs text-fg-muted">
            التحديد يبقى عند الانتقال بين المراحل والفصول حتى التسجيل أو المسح.
            {elsewhere ? ` ${elsewhere}` : ""}
          </p>
        </>
      ) : (
        <p className="text-xs text-fg-muted">حدد طلاباً من أكثر من مرحلة أو فصل، ثم سجّل عليهم مخالفة واحدة.</p>
      )}
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
