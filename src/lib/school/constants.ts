import type {
  ImprovementStatus,
  MessageKind,
  NoteTone,
  NoteType,
  School,
  SchoolGender,
  Season,
  StaffRole,
} from "./types";

export const NOTE_META: Record<
  NoteType,
  { label: string; tone: NoteTone; short: string }
> = {
  absence: { label: "غياب", tone: "danger", short: "غياب" },
  late: { label: "تأخر", tone: "warn", short: "تأخر" },
  homework: { label: "عدم حل واجب", tone: "warn", short: "واجب" },
  behavior: { label: "مخالفة سلوكية", tone: "danger", short: "سلوك" },
};

export const NOTE_TYPES = Object.keys(NOTE_META) as NoteType[];

export const ROLE_LABEL: Record<StaffRole, string> = {
  admin: "مدير التطبيق",
  counselor: "وكيل شؤون الطلاب",
  teacher: "معلم",
  pending: "بانتظار الموافقة",
};

export const ASSIGNABLE_ROLES: StaffRole[] = ["admin", "counselor", "teacher", "pending"];

export function isLeadership(role: StaffRole) {
  return role === "admin" || role === "counselor";
}

export const DEFAULT_BEHAVIOR_TYPES = [
  "الشغب داخل الفصل",
  "عدم احترام المعلم",
  "التنمر",
  "استخدام الجوال",
  "الخروج دون إذن",
  "تخريب الممتلكات",
  "عدم الالتزام بالزي المدرسي",
  "أخرى",
];

/** مخالفات المرحلة المتوسطة والثانوية — المواد 10 إلى 16 من قواعد 1447. */
export const OFFICIAL_BEHAVIOR_TYPES: { name: string; degree: number }[] = [
  { name: "التأخر الصباحي", degree: 1 },
  { name: "عدم حضور الاصطفاف الصباحي", degree: 1 },
  { name: "التأخر عن الاصطفاف الصباحي أو العبث أثناءه", degree: 1 },
  { name: "التأخر في الدخول إلى الحصص", degree: 1 },
  { name: "إعاقة سير الحصص الدراسية (حديث جانبي / مقاطعة / أكل أو شرب)", degree: 1 },
  { name: "النوم داخل الفصل", degree: 1 },
  { name: "تكرار الخروج والدخول من البوابة قبل وقت الحضور والانصراف", degree: 1 },
  { name: "التجمهر أمام بوابة المدرسة", degree: 1 },
  { name: "عدم حضور الحصة الدراسية أو الهروب منها", degree: 2 },
  { name: "الدخول أو الخروج من الفصل دون استئذان", degree: 2 },
  { name: "دخول فصل آخر دون استئذان", degree: 2 },
  { name: "إثارة الفوضى داخل الفصل أو المدرسة أو النقل المدرسي", degree: 2 },
  { name: "عدم التقيد بالزي المدرسي", degree: 3 },
  { name: "الشجار أو الاشتراك في مضاربة جماعية", degree: 3 },
  { name: "الإشارة بحركات مخلة بالأدب تجاه الطلبة", degree: 3 },
  { name: "التلفظ بكلمات نابية أو التهديد أو السخرية من الطلبة", degree: 3 },
  { name: "إلحاق الضرر المتعمد بممتلكات الطلبة", degree: 3 },
  { name: "العبث بتجهيزات المدرسة أو مبانيها", degree: 3 },
  { name: "إحضار مواد أو ألعاب خطرة دون استخدامها", degree: 3 },
  { name: "حيازة السجائر بأنواعها", degree: 3 },
  { name: "حيازة المواد الإعلامية الممنوعة", degree: 3 },
  { name: "التوقيع عن ولي الأمر من غير علمه", degree: 3 },
  { name: "امتهان الكتب الدراسية", degree: 3 },
  { name: "تعمد إصابة أحد الطلبة بالضرب", degree: 4 },
  { name: "سرقة شيء من ممتلكات الطلبة أو المدرسة", degree: 4 },
  { name: "تصوير الطلبة أو التسجيل الصوتي لهم", degree: 4 },
  { name: "إلحاق الضرر المتعمد بتجهيزات المدرسة", degree: 4 },
  { name: "التدخين بأنواعه داخل المدرسة", degree: 4 },
  { name: "الهروب من المدرسة", degree: 4 },
  { name: "إحضار أو استخدام المواد أو الألعاب الخطرة", degree: 4 },
  { name: "عرض أو توزيع المواد الإعلامية الممنوعة", degree: 4 },
  { name: "تهديد المعلمين أو الإداريين", degree: 4 },
  { name: "التلفظ بألفاظ غير لائقة تجاه المعلمين أو الإداريين", degree: 4 },
  { name: "السخرية من المعلمين أو الإداريين", degree: 4 },
  { name: "تصوير المعلمين أو التسجيل الصوتي لهم", degree: 4 },
  { name: "الإساءة أو الاستهزاء بشعائر الإسلام", degree: 5 },
  { name: "الإساءة للدولة أو رموزها", degree: 5 },
  { name: "بث أو ترويج أفكار متطرفة", degree: 5 },
  { name: "التحرش الجنسي", degree: 5 },
  { name: "إشعال النار داخل المدرسة", degree: 5 },
  { name: "حيازة أو استخدام أسلحة أو أدوات حادة", degree: 5 },
  { name: "حيازة أو تعاطي أو ترويج المخدرات أو المسكرات", degree: 5 },
  { name: "الجرائم المعلوماتية", degree: 5 },
  { name: "ابتزاز الطلبة", degree: 5 },
  { name: "التنمر بجميع أنواعه", degree: 5 },
  { name: "الاعتداء بالضرب على المعلمين أو الإداريين", degree: 5 },
  { name: "أخرى", degree: 1 },
];

/** الإجراءات التربوية الرسمية حسب الدرجة وعدد مرات التكرار. */
export const DEGREE_PROCEDURES: Record<number, string[][]> = {
  1: [
    ["تنبيه شفهي أول بأسلوب تربوي"],
    ["تنبيه شفهي ثانٍ", "ملاحظة الطالب وتعزيز السلوك الإيجابي"],
    [
      "تدوين المشكلة مع توقيع الطالب",
      "إشعار ولي الأمر هاتفياً",
      "حسم درجة واحدة من السلوك مع تمكينه من فرص التعويض",
      "تحويل إلى الموجه الطلابي",
    ],
    [
      "دعوة ولي الأمر والاتفاق على خطة تعديل السلوك",
      "حسم درجة واحدة من السلوك مع فرص التعويض",
      "تحويل إلى لجنة التوجيه الطلابي",
    ],
  ],
  2: [
    [
      "إشعار ولي الأمر هاتفياً",
      "حسم درجتين من السلوك مع فرص التعويض",
      "تعهد خطي بعدم تكرار المخالفة",
      "تحويل إلى الموجه الطلابي",
    ],
    [
      "دعوة ولي الأمر حضورياً",
      "برنامج وقائي مشترك مع الأسرة",
      "متابعة الحالة من الموجه الطلابي",
    ],
    [
      "نقل الطالب إلى فصل آخر وفق قرار اللجنة",
      "تحويل إلى لجنة التوجيه الطلابي",
    ],
  ],
  3: [
    [
      "دعوة ولي الأمر وأخذ تعهد خطي",
      "حسم ثلاث درجات من السلوك مع فرص التعويض",
      "الاعتذار إلى من أساء إليهم",
      "إصلاح ما أتلفه أو إحضار بديل",
      "مصادرة المواد الممنوعة",
      "تحويل إلى الموجه الطلابي",
    ],
    [
      "إنذار كتابي بالنقل إلى مدرسة أخرى",
      "تحويل إلى لجنة التوجيه الطلابي",
      "نقل إلى فصل آخر وفق قرار اللجنة",
    ],
    [
      "رفع محضر اللجنة إلى إدارة التعليم بصفة عاجلة",
      "طلب نقل الطالب إلى مدرسة أخرى",
    ],
  ],
  4: [
    [
      "إحالة إلى لجنة التوجيه الطلابي",
      "دعوة ولي الأمر وأخذ تعهد خطي",
      "إنذار بالنقل إلى مدرسة أخرى",
      "حسم عشر درجات من السلوك مع فرص التعويض",
      "الاعتذار وإصلاح التلف",
      "نقل إلى فصل آخر وفق قرار اللجنة",
    ],
    [
      "رفع محضر اللجنة إلى إدارة التعليم بصفة عاجلة",
      "طلب نقل الطالب إلى مدرسة أخرى",
    ],
  ],
  5: [
    [
      "تدوين محضر إثبات الواقعة",
      "دعوة ولي الأمر وتبليغه بالإجراءات",
      "حسم خمس عشرة درجة من السلوك",
      "اجتماع لجنة التوجيه الطلابي فوراً",
      "رفع المحضر إلى إدارة التعليم بصفة عاجلة",
      "طلب نقل الطالب إلى مدرسة أخرى",
    ],
  ],
};

export const DEFAULT_ACTION_TYPES = [
  "تنبيه شفهي أول بأسلوب تربوي",
  "تنبيه شفهي ثانٍ",
  "تدوين المشكلة مع توقيع الطالب",
  "تعهد خطي بعدم تكرار المخالفة",
  "إشعار ولي الأمر هاتفياً",
  "دعوة ولي الأمر",
  "حسم درجة واحدة من السلوك مع تمكينه من فرص التعويض",
  "حسم درجتين من السلوك مع فرص التعويض",
  "حسم ثلاث درجات من السلوك مع فرص التعويض",
  "تحويل إلى الموجه الطلابي",
  "تحويل إلى لجنة التوجيه الطلابي",
  "أخرى",
];

export const DEFAULT_HEALTH_CONDITIONS = [
  "الربو",
  "السكري",
  "حساسية غذائية",
  "حساسية دوائية",
  "الصرع",
  "أمراض القلب",
  "الأنيميا",
  "ضعف السمع",
  "ضعف البصر",
  "الثلاسيميا",
  "الهيموفيليا / سيولة الدم",
  "الفشل الكلوي",
  "فرط الحركة وتشتت الانتباه",
  "صعوبات التعلم",
];

export const CASE_KINDS = [
  { key: "health" as const, label: "حالة صحية" },
  { key: "psych" as const, label: "حالة نفسية" },
  { key: "learning" as const, label: "صعوبات تعلم" },
];
export type CaseKind = (typeof CASE_KINDS)[number]["key"];

export const FONT_SCALES = [
  { value: 0.9, label: "أصغر" },
  { value: 1, label: "عادي" },
  { value: 1.12, label: "أكبر" },
  { value: 1.25, label: "كبير" },
  { value: 1.4, label: "كبير جداً" },
] as const;

export const COMPENSATION_OPTIONS = [
  "المشاركة في الإذاعة المدرسية",
  "المحافظة على نظافة الفصل والمدرسة",
  "مساعدة الزملاء أو المعلمين",
  "الالتزام بالحضور المبكر أسبوعاً كاملاً",
  "إنجاز أعمال تطوعية داخل المدرسة",
  "المشاركة في النشاط الطلابي",
  "تقديم اعتذار وسلوك إيجابي موثّق",
  "تمثيل المدرسة في مسابقة أو نشاط",
  "أخرى",
];

export const SAUDI_REGIONS = [
  "الرياض",
  "مكة المكرمة",
  "المدينة المنورة",
  "القصيم",
  "المنطقة الشرقية",
  "عسير",
  "تبوك",
  "حائل",
  "الحدود الشمالية",
  "جازان",
  "نجران",
  "الباحة",
  "الجوف",
];

export const DEFAULT_TEACHER_PASSWORD = "1234";
export const DEFAULT_ADMIN_PHONE = "0505763155";
export const DEFAULT_ADMIN_PASSWORD = "1234";
export const DEFAULT_ADMIN_NAME = "مدير التطبيق";

export const WHATSAPP_TEMPLATES: Record<NoteType | "general", { title: string; body: string }> = {
  absence: {
    title: "إشعار غياب",
    body: "السلام عليكم ولي أمر الطالب {name}،\nنود إعلامكم بتغيّب ابنكم{session} يوم {weekday} بتاريخ {date} في صف {class}.\nنرجو المتابعة والتواصل مع إدارة المدرسة عند الحاجة.\n\n{school}",
  },
  late: {
    title: "إشعار تأخر",
    body: "السلام عليكم ولي أمر الطالب {name}،\nنود إعلامكم بتأخر ابنكم{session} يوم {weekday} بتاريخ {date} في صف {class}.\nنرجو الحرص على الحضور في الوقت المحدد.\n\n{school}",
  },
  homework: {
    title: "إشعار واجبات",
    body: "السلام عليكم ولي أمر الطالب {name}،\nنود إعلامكم بأن ابنكم لم يحل الواجب الدراسي{session} يوم {weekday} بتاريخ {date} في صف {class}.\nنرجو المتابعة في المنزل.\n\n{school}",
  },
  behavior: {
    title: "إشعار سلوكي",
    body: "السلام عليكم ولي أمر الطالب {name}،\nنود إعلامكم بتسجيل مخالفة سلوكية ({details}) على ابنكم{session} يوم {weekday} بتاريخ {date} في صف {class}.\nنرجو التعاون مع إدارة المدرسة لمتابعة الموقف.\n\n{school}",
  },
  general: {
    title: "رسالة عامة",
    body: "السلام عليكم ولي أمر الطالب {name}،\nتحية طيبة من {school}.\n{details}\n\nشاكرين تعاونكم.",
  },
};

export const DEFAULT_STAGES = [
  { name: "أول متوسط", shortName: "أولى", sortOrder: 1 },
  { name: "ثاني متوسط", shortName: "ثاني", sortOrder: 2 },
  { name: "ثالث متوسط", shortName: "ثالث", sortOrder: 3 },
] as const;

export const CLASSES_PER_STAGE = 5;
export const STUDENTS_PER_CLASS = 6;


export const FIRST_NAMES = [
  "أحمد",
  "محمد",
  "عبدالله",
  "سعد",
  "فهد",
  "خالد",
  "عبدالرحمن",
  "يوسف",
  "نايف",
  "ماجد",
  "تركي",
  "سلطان",
  "بندر",
  "راشد",
  "عمر",
  "حسن",
  "علي",
  "إبراهيم",
];

export const LAST_NAMES = [
  "العتيبي",
  "القحطاني",
  "الشهري",
  "الدوسري",
  "الحربي",
  "الغامدي",
  "المطيري",
  "العنزي",
  "الشمري",
  "الزهراني",
  "السهلي",
  "البقمي",
  "الجهني",
  "القرني",
  "الرشيدي",
];

export type PeriodSlot = {
  key: string;
  label: string;
  from: string;
  to: string;
  startMin: number;
  endMin: number;
};

function slot(key: string, label: string, fromH: number, fromM: number, toH: number, toM: number): PeriodSlot {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    key,
    label,
    from: `${fromH}:${pad(fromM)}`,
    to: `${toH}:${pad(toM)}`,
    startMin: fromH * 60 + fromM,
    endMin: toH * 60 + toM,
  };
}

/** الجدول الشتوي — بداية الطابور 7:00 */
export const WINTER_SCHEDULE: PeriodSlot[] = [
  slot("assembly", "الطابور", 7, 0, 7, 15),
  slot("p1", "الحصة الأولى", 7, 15, 8, 0),
  slot("p2", "الحصة الثانية", 8, 0, 8, 45),
  slot("p3", "الحصة الثالثة", 8, 45, 9, 30),
  slot("break", "الفسحة", 9, 30, 10, 0),
  slot("p4", "الحصة الرابعة", 10, 0, 10, 45),
  slot("p5", "الحصة الخامسة", 10, 45, 11, 30),
  slot("p6", "الحصة السادسة", 11, 30, 12, 15),
  slot("p7", "الحصة السابعة", 12, 15, 13, 0),
  slot("prayer", "الصلاة", 13, 0, 13, 15),
];

/** الجدول الصيفي — بداية الطابور 6:45 */
export const SUMMER_SCHEDULE: PeriodSlot[] = [
  slot("assembly", "الطابور", 6, 45, 7, 0),
  slot("p1", "الحصة الأولى", 7, 0, 7, 45),
  slot("p2", "الحصة الثانية", 7, 45, 8, 30),
  slot("p3", "الحصة الثالثة", 8, 30, 9, 15),
  slot("break", "الفسحة", 9, 15, 9, 35),
  slot("p4", "الحصة الرابعة", 9, 35, 10, 20),
  slot("p5", "الحصة الخامسة", 10, 20, 11, 5),
  slot("p6", "الحصة السادسة", 11, 5, 11, 50),
  slot("p7", "الحصة السابعة", 11, 50, 12, 35),
];

export const SEASON_LABEL: Record<Season, string> = {
  winter: "شتوي",
  summer: "صيفي",
};

export function scheduleFor(season: Season): PeriodSlot[] {
  return season === "summer" ? SUMMER_SCHEDULE : WINTER_SCHEDULE;
}

export function currentPeriod(season: Season, date = new Date()): PeriodSlot | null {
  const mins = date.getHours() * 60 + date.getMinutes();
  return scheduleFor(season).find((s) => mins >= s.startMin && mins < s.endMin) ?? null;
}

export function periodLabel(key: string, season: Season): string {
  if (!key) return "";
  const found = scheduleFor(season).find((s) => s.key === key);
  if (!found) return key;
  return `${found.label} (${found.from}–${found.to})`;
}

export function periodShort(key: string, season: Season): string {
  if (!key) return "—";
  return scheduleFor(season).find((s) => s.key === key)?.label ?? key;
}

export function degreeLabel(degree: number | null | undefined): string {
  if (!degree) return "";
  const map: Record<number, string> = {
    1: "الأولى",
    2: "الثانية",
    3: "الثالثة",
    4: "الرابعة",
    5: "الخامسة",
  };
  return map[degree] ?? String(degree);
}

export function occurrenceLabel(n: number) {
  if (n <= 1) return "المرة الأولى";
  if (n === 2) return "المرة الثانية";
  if (n === 3) return "المرة الثالثة";
  if (n === 4) return "المرة الرابعة";
  return `المرة ${n}`;
}

export function procedureStageLabel(n: number) {
  const map = ["", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن"];
  if (n >= 1 && n < map.length) return `الإجراء ${map[n]}`;
  return `الإجراء ${n}`;
}

export function parseProcedures(raw: unknown, degree?: number | null): string[][] {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      value = [];
    }
  }
  if (Array.isArray(value) && value.length) {
    const stages = value
      .map((stage) =>
        Array.isArray(stage)
          ? stage.map((item) => String(item).trim()).filter(Boolean)
          : String(stage).trim()
            ? [String(stage).trim()]
            : [],
      )
      .filter((stage) => stage.length);
    if (stages.length) return stages;
  }
  return (DEGREE_PROCEDURES[degree || 1] ?? DEGREE_PROCEDURES[1]!).map((stage) => [...stage]);
}

export function procedureLadder(degree?: number | null, custom?: string[][] | null): string[][] {
  if (custom && custom.length) return custom.filter((stage) => stage.length);
  return parseProcedures([], degree);
}

export function stageIndexFor(occurrence: number, length: number) {
  const len = Math.max(length, 1);
  return Math.min(Math.max(occurrence, 1), len) - 1;
}

export function proceduresFor(
  degree: number | null | undefined,
  occurrence: number,
  custom?: string[][] | null,
) {
  const table = procedureLadder(degree, custom);
  const idx = stageIndexFor(occurrence, table.length);
  return table[idx] ?? table[table.length - 1] ?? [];
}

export function deductionLabel(degree: number | null | undefined) {
  if (degree === 2) return "درجتان";
  if (degree === 3) return "ثلاث درجات";
  if (degree === 4) return "عشر درجات";
  if (degree === 5) return "خمس عشرة درجة";
  if (degree === 1) return "درجة واحدة";
  return "";
}


export function studentNoun(gender: SchoolGender, plural = false) {
  if (gender === "female") return plural ? "طالبات" : "طالبة";
  return plural ? "طلاب" : "طالب";
}

export function principalTitle(gender: SchoolGender) {
  return gender === "female" ? "مديرة المدرسة" : "مدير المدرسة";
}

export function counselorTitle(gender: SchoolGender) {
  return gender === "female" ? "وكيلة شؤون الطالبات" : "وكيل شؤون الطلاب";
}

export function withOccurrence<
  T extends {
    type: NoteType;
    behaviorTypeId?: number | null;
    behaviorTypeName?: string | null;
    createdAt: string;
    id?: number;
  },
>(notes: T[]): (T & { occurrence: number })[] {
  const chrono = [...notes].sort((a, b) => {
    const t = a.createdAt.localeCompare(b.createdAt);
    return t !== 0 ? t : (a.id ?? 0) - (b.id ?? 0);
  });
  const counts = new Map<string, number>();
  const occ = new Map<T, number>();
  for (const n of chrono) {
    if (n.type !== "behavior") {
      occ.set(n, 1);
      continue;
    }
    const key =
      n.behaviorTypeId != null ? `id:${n.behaviorTypeId}` : `name:${n.behaviorTypeName ?? ""}`;
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    occ.set(n, next);
  }
  return notes.map((n) => ({ ...n, occurrence: occ.get(n) ?? 1 }));
}

export function hijriDate(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function classLabel(shortName: string, className: string) {
  return `${shortName} / ${className}`;
}

export function formatStamp(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function formatDay(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function toDatetimeLocalValue(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string) {
  if (!value.trim()) return new Date().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ar-EG", { hour: "numeric", minute: "2-digit" }).format(d);
}


export function weekdayName(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ar-EG", { weekday: "long" }).format(d);
}

export function todayLabel() {
  return new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export function fillTemplate(
  template: string,
  vars: Record<string, string>,
) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

export function toWhatsAppNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("966")) return digits;
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `966${digits.slice(1)}`;
  if (digits.startsWith("5") && digits.length === 9) return `966${digits}`;
  return digits;
}

export function normalizeSaudiPhone(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00966")) digits = digits.slice(5);
  else if (digits.startsWith("966")) digits = digits.slice(3);
  if (digits.startsWith("5") && digits.length === 9) digits = `0${digits}`;
  return digits;
}

export function phoneToLoginEmail(input: string) {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed.includes("@")) return trimmed;
  const digits = normalizeSaudiPhone(trimmed);
  return digits ? `${digits}@mobile.school` : trimmed;
}

export function foldArabic(value: string) {
  return value
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, "")
    .replace(/[^\u0600-\u06FFa-z0-9]/gi, "")
    .toLowerCase();
}

export function isOtherChoice(name: string) {
  return foldArabic(name) === "اخري";
}

export function resolveOther(selected: string[], otherText: string) {
  const extra = otherText.trim();
  return selected
    .map((s) => (isOtherChoice(s) ? extra : s))
    .filter((s) => s.length > 0 && !isOtherChoice(s));
}

export function noteTone(type: NoteType, status: "open" | "closed"): NoteTone {
  if (status === "closed") return "ok";
  return NOTE_META[type].tone;
}

export function canTeacherMessage(role: StaffRole, school: Pick<School, "teachersCanMessage">) {
  return role !== "teacher" || school.teachersCanMessage;
}

export function canTeacherViewAll(role: StaffRole, school: Pick<School, "teachersCanViewAll">) {
  return role !== "teacher" || school.teachersCanViewAll;
}

export { staffCan } from "./permissions";

export const IMPROVEMENT_STATUS: Record<ImprovementStatus, string> = {
  open: "بانتظار متابعة المرشد",
  following: "قيد المتابعة",
  closed: "أُنجزت",
};

export function messageKindLabel(kind: MessageKind) {
  return kind === "general" ? "رسالة عامة" : NOTE_META[kind].label;
}
