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
  "editRecords",
  "editClasses",
  "viewClasses",
  "viewPrint",
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
    hint: "إظهار صفحة الغياب اليومي وتسجيل غياب أو تأخر اليوم الكامل",
  },
  {
    key: "counseling",
    label: "الإرشاد الطلابي",
    short: "الإرشاد",
    hint: "إظهار لوحة المرشد: الإحالات ومراسلات المعلمين والحالات الصحية",
  },
  {
    key: "editRecords",
    label: "تعديل وحذف السجلات",
    short: "الأرشيف",
    hint: "تصحيح أو حذف ملاحظة أو رسالة أو خطة تحسين سُجّلت بالخطأ",
  },
  {
    key: "editClasses",
    label: "تنسيق الصفوف والفصول",
    short: "تنسيق الفصول",
    hint: "تسمية المراحل وعدد الأقسام داخل كل صف وإعادة ترتيبها",
  },
  {
    key: "viewClasses",
    label: "إظهار صفحة الفصول",
    short: "الفصول",
    hint: "إظهار أو إخفاء صفحة الفصول في الشريط — للمعلمين الذين يباشرون الطلاب",
  },
  {
    key: "viewPrint",
    label: "إظهار صفحة الطباعة",
    short: "الطباعة",
    hint: "إظهار أو إخفاء صفحة التقارير والنماذج الرسمية",
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
  editRecords: true,
  editClasses: true,
  viewClasses: true,
  viewPrint: true,
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
  editRecords: false,
  editClasses: false,
  viewClasses: false,
  viewPrint: false,
};

export function defaultPermissions(
  role: StaffRole,
  school?: Pick<School, "teachersCanMessage" | "teachersCanViewAll">,
): StaffPermissions {
  if (role === "admin" || role === "principal") return { ...ALL_ON };
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
      editRecords: true,
      editClasses: false,
      viewClasses: true,
      viewPrint: true,
    };
  }
  if (role === "school_vp") {
    return {
      editStudents: true,
      sendMessages: true,
      viewAllViolations: true,
      editStaff: false,
      takeActions: true,
      acceptImprovements: true,
      dailyAttendance: true,
      counseling: false,
      editRecords: true,
      editClasses: true,
      viewClasses: true,
      viewPrint: true,
    };
  }
  if (role === "teachers_vp") {
    return {
      editStudents: true,
      sendMessages: true,
      viewAllViolations: true,
      editStaff: true,
      takeActions: false,
      acceptImprovements: false,
      dailyAttendance: false,
      counseling: false,
      editRecords: false,
      editClasses: true,
      viewClasses: true,
      viewPrint: true,
    };
  }
  if (role === "student_counselor") {
    return {
      editStudents: false,
      sendMessages: true,
      viewAllViolations: true,
      editStaff: false,
      takeActions: false,
      acceptImprovements: true,
      dailyAttendance: false,
      counseling: true,
      editRecords: false,
      editClasses: false,
      viewClasses: true,
      viewPrint: false,
    };
  }
  if (role === "health_counselor") {
    return {
      editStudents: false,
      sendMessages: true,
      viewAllViolations: true,
      editStaff: false,
      takeActions: false,
      acceptImprovements: false,
      dailyAttendance: true,
      counseling: true,
      editRecords: false,
      editClasses: false,
      viewClasses: true,
      viewPrint: false,
    };
  }
  if (role === "activity_leader") {
    return {
      editStudents: false,
      sendMessages: true,
      viewAllViolations: true,
      editStaff: false,
      takeActions: false,
      acceptImprovements: false,
      dailyAttendance: true,
      counseling: false,
      editRecords: false,
      editClasses: false,
      viewClasses: true,
      viewPrint: false,
    };
  }
  if (role === "security") {
    return {
      editStudents: false,
      sendMessages: true,
      viewAllViolations: false,
      editStaff: false,
      takeActions: false,
      acceptImprovements: false,
      dailyAttendance: true,
      counseling: false,
      editRecords: false,
      editClasses: false,
      viewClasses: false,
      viewPrint: false,
    };
  }
  if (role === "admin_assistant" || role === "admin_staff") {
    return {
      editStudents: true,
      sendMessages: true,
      viewAllViolations: false,
      editStaff: false,
      takeActions: false,
      acceptImprovements: false,
      dailyAttendance: true,
      counseling: false,
      editRecords: false,
      editClasses: false,
      viewClasses: true,
      viewPrint: false,
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
      editRecords: false,
      editClasses: false,
      viewClasses: true,
      viewPrint: false,
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

export function canSeeParentPhone(staff: Pick<Staff, "role" | "permissions">) {
  return staffCan(staff, "sendMessages") || staffCan(staff, "editStudents");
}

export function canFollowup(staff: Pick<Staff, "role" | "permissions">) {
  return (
    staffCan(staff, "takeActions") ||
    staffCan(staff, "acceptImprovements") ||
    staffCan(staff, "dailyAttendance") ||
    staffCan(staff, "counseling")
  );
}
