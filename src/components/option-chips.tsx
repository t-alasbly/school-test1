import { Input } from "@/components/ui/input";
import { tr } from "@/lib/school/i18n";
import { isOtherChoice } from "@/lib/school/constants";
import { cn } from "@/lib/utils";

export function OptionChips({
  items,
  selected,
  onToggle,
  otherValue,
  onOtherChange,
  otherPlaceholder = tr("اكتب يدوياً…"),
}: {
  items: string[];
  selected: string[];
  onToggle: (name: string) => void;
  otherValue: string;
  onOtherChange: (value: string) => void;
  otherPlaceholder?: string;
}) {
  const showOther = selected.some(isOtherChoice);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const on = selected.includes(item);
          return (
            <button
              key={item}
              type="button"
              onClick={() => onToggle(item)}
              className={cn(
                "min-h-10 rounded-full border px-3 text-xs font-medium",
                on
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-bg-elevated text-fg-muted",
              )}
            >
              {tr(item)}
            </button>
          );
        })}
      </div>
      {showOther ? (
        <Input
          value={otherValue}
          onChange={(e) => onOtherChange(e.target.value)}
          placeholder={otherPlaceholder}
          autoFocus
        />
      ) : null}
    </div>
  );
}