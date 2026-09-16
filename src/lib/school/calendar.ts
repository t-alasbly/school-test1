export type CalendarKind = "hijri" | "gregorian";

export function parseCalendar(value: unknown): CalendarKind {
  return value === "gregorian" ? "gregorian" : "hijri";
}

export function isoFromDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dateFromIso(day: string): Date {
  const raw = day.includes("T") ? day : `${day}T12:00:00`;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function shiftIso(day: string, delta: number): string {
  const d = dateFromIso(day);
  d.setDate(d.getDate() + delta);
  return isoFromDate(d);
}

export function weekdayAr(iso: string): string {
  const d = dateFromIso(iso);
  return new Intl.DateTimeFormat("ar-EG", { weekday: "long" }).format(d);
}

function cleanPart(value: string): string {
  return value
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[هھ]ـ?/g, "")
    .replace(/م/g, "")
    .trim();
}

function formatCalendar(d: Date, calendar: CalendarKind, compact: boolean): string {
  const locale = calendar === "hijri" ? "ar-SA-u-ca-islamic-umalqura" : "ar-EG-u-ca-gregory";
  const parts = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: compact ? "numeric" : "long",
    year: "numeric",
  }).formatToParts(d);
  const day = cleanPart(parts.find((p) => p.type === "day")?.value ?? "");
  const month = cleanPart(parts.find((p) => p.type === "month")?.value ?? "");
  const year = cleanPart(parts.find((p) => p.type === "year")?.value ?? "");
  return compact ? `${day}/${month}/${year}` : `${day} ${month} ${year}`;
}

export function formatPrimaryDate(iso: string, calendar: CalendarKind, compact = false): string {
  const d = dateFromIso(iso);
  const era = calendar === "hijri" ? "هـ" : "م";
  return `${formatCalendar(d, calendar, compact)} ${era}`;
}

export function formatAltDate(iso: string, calendar: CalendarKind): string {
  return formatPrimaryDate(iso, calendar === "hijri" ? "gregorian" : "hijri", true);
}

export function formatToday(calendar: CalendarKind): string {
  const iso = isoFromDate(new Date());
  return `${weekdayAr(iso)} ${formatPrimaryDate(iso, calendar)}`;
}

export function formatStampCalendar(iso: string, calendar: CalendarKind): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const time = new Intl.DateTimeFormat("ar-EG", {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
  return `${formatPrimaryDate(iso, calendar, true)} · ${time}`;
}
