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
  "viewLedger",
  "viewClassFollow",
  "viewYearSheet",
  "viewOfficialPrint",
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
    hint: "رؤية ملاحظات الزملاء في الفصل والتقرير وسجل الطالب، وفتح مكاتبهم والطباعة منها",
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
  {
    key: "viewLedger",
    label: "إظهار سجل المتابعة",
    short: "سجل المتابعة",
    hint: "يظهر سجل التقييمات في مكتب المعلم. الافتراضي مخفي، ويفعّله المعلم من حسابه أو المدير من الصلاحيات.",
  },
  {
    key: "viewClassFollow",
    label: "المتابعة الصفية",
    short: "متابعة صفية",
    hint: "صح وأتقن وحل الواجب داخل الحصة. مخفية حتى يفعّلها المدير لهذا المعلم.",
  },
  {
    key: "viewYearSheet",
    label: "أعمال السنة",
    short: "أعمال السنة",
    hint: "كشف أعمال السنة وتنسيق درجاته. مخفي حتى يفعّله المدير لهذا المعلم.",
  },
  {
    key: "viewOfficialPrint",
    label: "النماذج الرسمية ومراسلة ولي الأمر",
    short: "النماذج",
    hint: "التعهد وخطابات ولي الأمر والرسائل الرسمية. للمدير والوكيل، وتُمنح لمن يحتاجها.",
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
  viewLedger: true,
  viewClassFollow: true,
  viewYearSheet: true,
  viewOfficialPrint: true,
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
  viewLedger: false,
  viewClassFollow: false,
  viewYearSheet: false,
  viewOfficialPrint: false,
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
      viewLedger: true,
      viewClassFollow: false,
      viewYearSheet: false,
      viewOfficialPrint: false,
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
      viewLedger: true,
      viewClassFollow: true,
      viewYearSheet: true,
      viewOfficialPrint: true,
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
      viewLedger: true,
      viewClassFollow: true,
      viewYearSheet: true,
      viewOfficialPrint: true,
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
      viewLedger: false,
      viewClassFollow: false,
      viewYearSheet: false,
      viewOfficialPrint: false,
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
      viewLedger: false,
      viewClassFollow: false,
      viewYearSheet: false,
      viewOfficialPrint: false,
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
      viewLedger: false,
      viewClassFollow: false,
      viewYearSheet: false,
      viewOfficialPrint: false,
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
      viewLedger: false,
      viewClassFollow: false,
      viewYearSheet: false,
      viewOfficialPrint: false,
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
      viewLedger: false,
      viewClassFollow: false,
      viewYearSheet: false,
      viewOfficialPrint: false,
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
      viewPrint: true,
      viewLedger: false,
      viewClassFollow: false,
      viewYearSheet: false,
      viewOfficialPrint: false,
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
  if (role === "teacher") next.viewPrint = true;
  return next;
}

export function staffCan(
  staff: Pick<Staff, "role" | "permissions">,
  key: PermissionKey,
) {
  if (staff.role === "admin") return true;
  return Boolean(staff.permissions?.[key]);
}

export function canSeeClassMoves(staff: Pick<Staff, "role" | "permissions">) {
  if (staff.role === "admin" || staff.role === "principal" || staff.role === "counselor" || staff.role === "student_counselor") return true;
  return staffCan(staff, "takeActions") || staffCan(staff, "editStudents");
}

export function canSeeParentPhone(staff: Pick<Staff, "role" | "permissions">) {
  if (staff.role === "teacher") return false;
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
