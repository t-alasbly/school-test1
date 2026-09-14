import type { School, Staff, StaffRole } from "./types";

export const PERMISSION_KEYS = [
  "editStudents",
  "sendMessages",
  "viewAllViolations",
  "editStaff",
  "takeActions",
  "acceptImprovements",
  "dailyAttendance",
  "counseling",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type StaffPermissions = Record<PermissionKey, boolean>;

export const PERMISSION_META: {
  key: PermissionKey;
  label: string;
  short: string;
  hint: string;
}[] = [
  {
    key: "editStudents",
    label: "تعديل بيانات الطلاب",
    short: "الطلاب",
    hint: "إضافة طالب أو تعديل اسمه وجوال ولي الأمر",
  },
  {
    key: "sendMessages",
    label: "إرسال الرسائل",
    short: "الرسائل",
    hint: "مراسلة ولي الأمر عبر واتساب وحفظها في السجل",
  },
  {
    key: "viewAllViolations",
    label: "الاطلاع على جميع المخالفات المدخلة من المعلمين",
    short: "كل المخالفات",
    hint: "رؤية ملاحظات الزملاء في الفصل والتقرير وسجل الطالب",
  },
  {
    key: "editStaff",
    label: "تعديل بيانات الموظفين",
    short: "الموظفون",
    hint: "إضافة المعلمين وتغيير صلاحيات كل موظف",
  },
  {
    key: "takeActions",
    label: "تنفيذ إجراءات المخالفات للطلاب",
    short: "الإجراءات",
    hint: "اتخاذ الإجراء وإغلاق المخالفة من شؤون الطلاب",
  },
  {
    key: "acceptImprovements",
    label: "قبول التحسين السلوكي",
    short: "التحسين",
    hint: "متابعة خطط تحسين السلوك أو إغلاقها",
  },
  {
    key: "dailyAttendance",
    label: "الغياب اليومي والتأخر",
    short: "الغياب اليومي",
    hint: "تسجيل غياب أو تأخر اليوم الكامل وطباعة كشف الغائبين — غير غياب الحصة",
  },
  {
    key: "counseling",
    label: "الإرشاد الطلابي",
    short: "الإرشاد",
    hint: "لوحة المرشد الطلابي: الإحالات ومراسلات المعلمين والحالات الصحية — التحويل من وكيل الشؤون فقط",
  },
];

const ALL_ON: StaffPermissions = {
  editStudents: true,
  sendMessages: true,
  viewAllViolations: true,
  editStaff: true,
  takeActions: true,
  acceptImprovements: true,
  dailyAttendance: true,
  counseling: true,
};

const ALL_OFF: StaffPermissions = {
  editStudents: false,
  sendMessages: false,
  viewAllViolations: false,
  editStaff: false,
  takeActions: false,
  acceptImprovements: false,
  dailyAttendance: false,
  counseling: false,
};

export function defaultPermissions(
  role: StaffRole,
  school?: Pick<School, "teachersCanMessage" | "teachersCanViewAll">,
): StaffPermissions {
  if (role === "admin") return { ...ALL_ON };
  if (role === "counselor") {
    return {
      editStudents: false,
      sendMessages: true,
      viewAllViolations: true,
      editStaff: false,
      takeActions: true,
      acceptImprovements: true,
      dailyAttendance: false,
      counseling: false,
    };
  }
  if (role === "teacher") {
    return {
      editStudents: false,
      sendMessages: school ? school.teachersCanMessage !== false : true,
      viewAllViolations: Boolean(school?.teachersCanViewAll),
      editStaff: false,
      takeActions: false,
      acceptImprovements: false,
      dailyAttendance: false,
      counseling: false,
    };
  }
  return { ...ALL_OFF };
}

export function parsePermissions(
  raw: unknown,
  role: StaffRole,
  school?: Pick<School, "teachersCanMessage" | "teachersCanViewAll">,
): StaffPermissions {
  const base = defaultPermissions(role, school);
  if (role === "admin") return { ...ALL_ON };
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return base;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return base;
  const rec = value as Record<string, unknown>;
  const next = { ...base };
  for (const key of PERMISSION_KEYS) {
    if (typeof rec[key] === "boolean") next[key] = rec[key];
  }
  return next;
}

export function staffCan(
  staff: Pick<Staff, "role" | "permissions">,
  key: PermissionKey,
) {
  if (staff.role === "admin") return true;
  return Boolean(staff.permissions?.[key]);
}
