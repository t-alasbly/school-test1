import { useMemo, useState } from "react";
import { tr } from "@/lib/school/i18n";
import { arSA } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker as GregorianPicker } from "react-day-picker";
import { DayPicker as HijriPicker } from "react-day-picker/hijri";
import "react-day-picker/style.css";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  dateFromIso,
  formatAltDate,
  formatPrimaryDate,
  isoFromDate,
  shiftIso,
  weekdayAr,
  type CalendarKind,
} from "@/lib/school/calendar";
import { cn } from "@/lib/utils";

export function DayField({
  value,
  onChange,
  calendar,
  onCalendar,
}: {
  value: string;
  onChange: (next: string) => void;
  calendar: CalendarKind;
  onCalendar?: (next: CalendarKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => dateFromIso(value), [value]);
  const hijri = calendar === "hijri";

  function pick(d: Date | undefined) {
    if (!d) return;
    onChange(isoFromDate(d));
    setOpen(false);
  }

  return (
    <div className="inline-flex max-w-full items-center gap-0.5">
      <button
        type="button"
        aria-label={tr("اليوم السابق")}
        onClick={() => onChange(shiftIso(value, -1))}
        className="grid size-8 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-muted hover:text-fg"
      >
        <ChevronRight className="size-4" />
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="min-w-0 rounded-full border border-border bg-bg-elevated px-3 py-1 text-right shadow-[var(--shadow-card)] transition-colors hover:border-primary"
          >
            <span className="block truncate text-[10px] leading-4 text-fg-muted">{weekdayAr(value)}</span>
            <span className="block truncate text-[13px] font-semibold leading-5">{formatPrimaryDate(value, calendar, true)}</span>
            <span className="block truncate text-[10px] leading-4 text-fg-subtle">{formatAltDate(value, calendar)}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-auto p-2" dir="rtl">
          {hijri ? (
            <HijriPicker
              mode="single"
              selected={selected}
              defaultMonth={selected}
              onSelect={pick}
              dir="rtl"
              numerals="arab"
            />
          ) : (
            <GregorianPicker
              mode="single"
              selected={selected}
              defaultMonth={selected}
              onSelect={pick}
              dir="rtl"
              locale={arSA}
            />
          )}
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label={tr("اليوم التالي")}
        onClick={() => onChange(shiftIso(value, 1))}
        className="grid size-8 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-muted hover:text-fg"
      >
        <ChevronLeft className="size-4" />
      </button>
      {onCalendar ? (
        <div className="ms-1 grid shrink-0 grid-cols-2 overflow-hidden rounded-full border border-border text-[10px] font-semibold">
          <button
            type="button"
            onClick={() => onCalendar("hijri")}
            className={cn("h-7 px-2.5 transition-colors", hijri ? "bg-primary text-primary-fg" : "bg-bg text-fg-muted")}
          >
            هـ
          </button>
          <button
            type="button"
            onClick={() => onCalendar("gregorian")}
            className={cn("h-7 px-2.5 transition-colors", !hijri ? "bg-primary text-primary-fg" : "bg-bg text-fg-muted")}
          >
            {tr("م")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
