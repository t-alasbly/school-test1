import { EN_UI } from "./en-dict";

export type Locale = "ar" | "en";

export let activeLocale: Locale = "ar";

export function setActiveLocale(next: Locale) {
  activeLocale = next;
}

/** Translates interface text while English is selected. Safe to call during render. */
export function tr(text: string) {
  if (text == null || text === "") return text;
  if (activeLocale !== "en") return text;
  return EN_UI[text] ?? text;
}

const GRADE_PHRASES: [string, string][] = [
  ["الصف الأول المتوسط", "Grade 7"],
  ["الصف الاول المتوسط", "Grade 7"],
  ["الصف الأول متوسط", "Grade 7"],
  ["الصف الثاني المتوسط", "Grade 8"],
  ["الصف الثاني متوسط", "Grade 8"],
  ["الصف الثالث المتوسط", "Grade 9"],
  ["الصف الثالث متوسط", "Grade 9"],
  ["الصف الأول الثانوي", "Grade 10"],
  ["الصف الأول ثانوي", "Grade 10"],
  ["الصف الثاني الثانوي", "Grade 11"],
  ["الصف الثاني ثانوي", "Grade 11"],
  ["الصف الثالث الثانوي", "Grade 12"],
  ["الصف الثالث ثانوي", "Grade 12"],
  ["الصف الأول ابتدائي", "Grade 1"],
  ["الصف الثاني ابتدائي", "Grade 2"],
  ["الصف الثالث ابتدائي", "Grade 3"],
  ["الصف الرابع ابتدائي", "Grade 4"],
  ["الصف الخامس ابتدائي", "Grade 5"],
  ["الصف السادس ابتدائي", "Grade 6"],
  ["أولى متوسط", "Grade 7"],
  ["أول متوسط", "Grade 7"],
  ["ثاني متوسط", "Grade 8"],
  ["ثالث متوسط", "Grade 9"],
  ["أولى ثانوي", "Grade 10"],
  ["أول ثانوي", "Grade 10"],
  ["ثاني ثانوي", "Grade 11"],
  ["ثالث ثانوي", "Grade 12"],
  ["أول ابتدائي", "Grade 1"],
  ["أولى ابتدائي", "Grade 1"],
  ["ثاني ابتدائي", "Grade 2"],
  ["ثالث ابتدائي", "Grade 3"],
  ["رابع ابتدائي", "Grade 4"],
  ["خامس ابتدائي", "Grade 5"],
  ["سادس ابتدائي", "Grade 6"],
];

const SHORT_GRADE: Record<string, string> = {
  أولى: "First",
  اولى: "First",
  الأولى: "First",
  أول: "First",
  ثاني: "Second",
  الثاني: "Second",
  ثالث: "Third",
  الثالث: "Third",
};

/** Grade and class labels stored in Arabic, shown in English when that language is on. */
export function placeLabel(text: string) {
  if (!text) return text;
  if (activeLocale !== "en") return text;
  const exact = EN_UI[text];
  if (exact) return exact;
  if (SHORT_GRADE[text]) return SHORT_GRADE[text];
  let out = text;
  const ordered = [...GRADE_PHRASES].sort((a, b) => b[0].length - a[0].length);
  for (const [ar, en] of ordered) {
    if (out.includes(ar)) out = out.split(ar).join(en);
  }
  out = out
    .replace(/الأولى|الاولى|أولى|اولى/g, "First")
    .replace(/الثاني|ثاني/g, "Second")
    .replace(/الثالث|ثالث/g, "Third");
  return out;
}

export function uiLocale() {
  return activeLocale === "en" ? "en-GB" : "ar-EG";
}
