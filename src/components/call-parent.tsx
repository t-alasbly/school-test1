import { useState } from "react";
import { Phone } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { tr } from "@/lib/school/i18n";
import { canCallParent } from "@/lib/school/permissions";
import { useWorkspace } from "@/lib/school/workspace";

const LABELS = ["جوال ولي الأمر", "رقم المنزل", "رقم العمل"];

function dialable(phone?: string) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 9 ? digits : "";
}

export function CallParent({ phones }: { phones: Array<string | null | undefined> }) {
  const { staff } = useWorkspace();
  const [open, setOpen] = useState(false);
  if (!canCallParent(staff)) return null;
  const options = phones
    .map((phone, index) => ({ label: LABELS[index] || "رقم", number: dialable(phone || "") }))
    .filter((item, index, all) => item.number && all.findIndex((other) => other.number === item.number) === index);
  if (!options.length) return null;
  const icon = <Phone className="size-4" />;
  const circle = "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white";
  if (options.length === 1) {
    return (
      <a href={`tel:${options[0].number}`} aria-label={tr("اتصال بولي الأمر")} title={tr("اتصال بولي الأمر")} className={circle} onClick={(event) => event.stopPropagation()}>
        {icon}
      </a>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={tr("اختيار رقم للاتصال")} title={tr("اختيار رقم للاتصال")} className={circle} onClick={(event) => event.stopPropagation()}>
          {icon}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" onClick={(event) => event.stopPropagation()}>
        {options.map((item) => (
          <a key={item.number} href={`tel:${item.number}`} className="flex items-center justify-between gap-3 rounded px-2 py-2 text-sm hover:bg-bg">
            <span>{tr(item.label)}</span>
            <span dir="ltr">{item.number}</span>
          </a>
        ))}
      </PopoverContent>
    </Popover>
  );
}
