import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { EN_UI } from "./en-dict";
import { setActiveLocale, tr, type Locale } from "./i18n-core";
import { transliterateArabicName } from "./transliterate";

export type { Locale };
export { tr, placeLabel } from "./i18n-core";

const KEY = "school-locale";

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
  const [locale, setLocaleState] = useState<Locale>("ar");
  setActiveLocale(locale);

  useEffect(() => {
    const saved = window.localStorage.getItem(KEY);
    if (saved === "en" || saved === "ar") setLocaleState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "en" ? "ltr" : "rtl";
    document.title = locale === "en" ? "Student records" : tr("متابعة الطلاب الشاملة");
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale: (next: Locale) => {
        setActiveLocale(next);
        setLocaleState(next);
        window.localStorage.setItem(KEY, next);
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
