import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setPreferredLocale } from "@/lib/school/api";
import { EN_UI } from "./en-dict";
import { setActiveLocale, tr, type Locale } from "./i18n-core";
import { transliterateArabicName } from "./transliterate";

export type { Locale };
export { tr, placeLabel } from "./i18n-core";

const KEY = "school-locale";

export function readLocale(): Locale {
  if (typeof window === "undefined") return "ar";
  const saved = window.localStorage.getItem(KEY);
  return saved === "en" || saved === "ar" ? saved : "ar";
}

export function rememberLocale(next: Locale) {
  setActiveLocale(next);
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, next);
}

const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (text: string) => string;
}>({
  locale: "ar",
  setLocale: () => {},
  t: (text) => text,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readLocale);
  setActiveLocale(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "en" ? "ltr" : "rtl";
    document.title = locale === "en" ? "Student records" : "متابعة الطلاب الشاملة";
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale: (next: Locale) => {
        if (next === locale) return;
        rememberLocale(next);
        setLocaleState(next);
        void setPreferredLocale({ data: { locale: next } }).finally(() => window.location.reload());
      },
      t: (text: string) => (locale === "en" ? (EN_UI[text] ?? text) : text),
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function studentLabel(locale: Locale, name: string, nameEn?: string | null) {
  if (locale !== "en") return name;
  const stored = nameEn?.trim();
  if (stored) return stored;
  return transliterateArabicName(name) || name;
}

export function useStudentLabel(name: string, nameEn?: string | null) {
  const { locale } = useLocale();
  return studentLabel(locale, name, nameEn);
}
