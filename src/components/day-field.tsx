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
  dateParts,
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
  showCalendarToggle = true,
}: {
  value: string;
  onChange: (next: string) => void;
  calendar: CalendarKind;
  onCalendar?: (next: CalendarKind) => void;
  showCalendarToggle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => dateFromIso(value), [value]);
  const hijri = calendar === "hijri";
  const hijriDate = dateParts(value, "hijri");
  const gregorianDate = dateParts(value, "gregorian");

  function pick(d: Date | undefined) {
    if (!d) return;
    onChange(isoFromDate(d));
    setOpen(false);
  }

  return (
    <div className="flex w-full items-stretch overflow-hidden rounded-[var(--radius-md)] border border-border bg-bg-elevated shadow-[var(--shadow-card)]">
      <button
        type="button"
        aria-label={tr("اليوم السابق")}
        onClick={() => onChange(shiftIso(value, -1))}
        className="grid w-10 shrink-0 place-items-center text-fg-muted transition-colors hover:bg-muted hover:text-fg"
      >
        <ChevronRight className="size-5" />
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-2 px-2 py-1.5 text-center transition-colors hover:bg-muted/60"
          >
            <span className="whitespace-nowrap text-sm font-bold leading-5 sm:text-base">{weekdayAr(value)}</span>
            <span className="truncate whitespace-nowrap text-[13px] font-semibold leading-5 sm:text-sm">
              {hijriDate.day} {hijriDate.month}
              <span className="ms-1 text-[9px] font-normal text-fg-muted">{hijriDate.year} {hijriDate.era}</span>
            </span>
            <span className="truncate whitespace-nowrap text-[13px] leading-5 text-fg-muted sm:text-sm">
              {gregorianDate.day} {gregorianDate.month}
              <span className="ms-1 text-[9px]">{gregorianDate.year} {gregorianDate.era}</span>
            </span>
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
        className="grid w-10 shrink-0 place-items-center text-fg-muted transition-colors hover:bg-muted hover:text-fg"
      >
        <ChevronLeft className="size-5" />
      </button>
      {showCalendarToggle && onCalendar ? (
        <CalendarSwitch calendar={calendar} onCalendar={onCalendar} />
      ) : null}
    </div>
  );
}

export function CalendarSwitch({
  calendar,
  onCalendar,
}: {
  calendar: CalendarKind;
  onCalendar: (next: CalendarKind) => void;
}) {
  const hijri = calendar === "hijri";
  return (
    <div className="grid shrink-0 grid-cols-2 overflow-hidden rounded-full border border-border text-xs font-semibold">
      <button
        type="button"
        onClick={() => onCalendar("hijri")}
        className={cn("h-8 px-2.5 transition-colors", hijri ? "bg-primary text-primary-fg" : "bg-bg text-fg-muted")}
        aria-label={tr("هجري")}
      >
        هـ
      </button>
      <button
        type="button"
        onClick={() => onCalendar("gregorian")}
        className={cn("h-8 px-2.5 transition-colors", !hijri ? "bg-primary text-primary-fg" : "bg-bg text-fg-muted")}
        aria-label={tr("ميلادي")}
      >
        م
      </button>
    </div>
  );
}
