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
  "viewClassesPage",
  "viewStudentAffairsPage",
  "viewAttendancePage",
  "viewCounselingPage",
  "viewReportsPage",
  "viewMessagesPage",
  "viewFormsPage",
  "viewArchivePage",
  "viewStaffPage",
  "viewImportPage",
  "viewSettingsPage",
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
  {
    key: "editRecords",
    label: "تعديل وحذف السجلات",
    short: "الأرشيف",
    hint: "تصحيح أو حذف ملاحظة أو رسالة أو خطة تحسين سُجّلت بالخطأ — يظهر في الأرشيف وشاشات المخالفات والرسائل",
  },
  {
    key: "editClasses",
    label: "تنسيق الصفوف والفصول",
    short: "الفصول",
    hint: "تسمية المراحل (الصف الأول/الثاني/الثالث متوسط) وعدد الأقسام داخل كل صف وإعادة ترتيبها",
  },
];

export const PAGE_PERMISSION_META: {
  key: PermissionKey;
  label: string;
  short: string;
  hint: string;
}[] = [
  { key: "viewClassesPage", label: "الفصول", short: "الفصول", hint: "صفحة المراحل والفصول وملفات الطلاب" },
  { key: "viewStudentAffairsPage", label: "شؤون الطلاب", short: "شؤون الطلاب", hint: "لوحة الإجراءات والمخالفات وشؤون الطلاب" },
  { key: "viewAttendancePage", label: "الغياب اليومي", short: "الغياب", hint: "تسجيل ومتابعة الغياب والتأخر اليومي" },
  { key: "viewCounselingPage", label: "الإرشاد الطلابي", short: "الإرشاد", hint: "الإحالات والحالات ومتابعة الإرشاد" },
  { key: "viewReportsPage", label: "التقارير", short: "التقارير", hint: "التقارير والكشوف والإحصاءات" },
  { key: "viewMessagesPage", label: "الرسائل الجماعية", short: "الرسائل", hint: "إعداد وإرسال الرسائل الجماعية" },
  { key: "viewFormsPage", label: "طباعة النماذج", short: "النماذج", hint: "نماذج الطباعة والتعبئة" },
  { key: "viewArchivePage", label: "الأرشيف", short: "الأرشيف", hint: "السجلات المؤرشفة والتعديلات" },
  { key: "viewStaffPage", label: "الموظفون", short: "الموظفون", hint: "إدارة المستخدمين والموظفين وصلاحياتهم" },
  { key: "viewImportPage", label: "الاستيراد", short: "الاستيراد", hint: "استيراد بيانات الطلاب والملفات" },
  { key: "viewSettingsPage", label: "الإعدادات", short: "الإعدادات", hint: "إعدادات المدرسة والتطبيق والصلاحيات" },
];

export const PAGE_PERMISSION_BY_PATH: Record<string, PermissionKey> = {
  "/": "viewClassesPage",
  "/admin": "viewStudentAffairsPage",
  "/attendance": "viewAttendancePage",
  "/counseling": "viewCounselingPage",
  "/reports": "viewReportsPage",
  "/messages": "viewMessagesPage",
  "/forms": "viewFormsPage",
  "/archive": "viewArchivePage",
  "/staff": "viewStaffPage",
  "/import": "viewImportPage",
  "/settings": "viewSettingsPage",
};

export function pagePermissionForPath(pathname: string): PermissionKey | null {
  if (pathname.startsWith("/stage/") || pathname.startsWith("/class/")) return "viewClassesPage";
  if (pathname.startsWith("/settings")) return "viewSettingsPage";
  for (const [path, key] of Object.entries(PAGE_PERMISSION_BY_PATH)) {
    if (pathname === path || pathname.startsWith(`${path}/`)) return key;
  }
  return null;
}

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
  viewClassesPage: true,
  viewStudentAffairsPage: true,
  viewAttendancePage: true,
  viewCounselingPage: true,
  viewReportsPage: true,
  viewMessagesPage: true,
  viewFormsPage: true,
  viewArchivePage: true,
  viewStaffPage: true,
  viewImportPage: true,
  viewSettingsPage: true,
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
  viewClassesPage: true,
  viewStudentAffairsPage: false,
  viewAttendancePage: false,
  viewCounselingPage: false,
  viewReportsPage: true,
  viewMessagesPage: false,
  viewFormsPage: true,
  viewArchivePage: false,
  viewStaffPage: false,
  viewImportPage: false,
  viewSettingsPage: true,
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
      viewClassesPage: true,
      viewStudentAffairsPage: true,
      viewAttendancePage: false,
      viewCounselingPage: true,
      viewReportsPage: true,
      viewMessagesPage: true,
      viewFormsPage: true,
      viewArchivePage: true,
      viewStaffPage: false,
      viewImportPage: false,
      viewSettingsPage: true,
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
      viewClassesPage: true,
      viewStudentAffairsPage: true,
      viewAttendancePage: true,
      viewCounselingPage: false,
      viewReportsPage: true,
      viewMessagesPage: true,
      viewFormsPage: true,
      viewArchivePage: true,
      viewStaffPage: false,
      viewImportPage: false,
      viewSettingsPage: true,
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
      viewClassesPage: true,
      viewStudentAffairsPage: true,
      viewAttendancePage: false,
      viewCounselingPage: false,
      viewReportsPage: true,
      viewMessagesPage: true,
      viewFormsPage: true,
      viewArchivePage: false,
      viewStaffPage: true,
      viewImportPage: false,
      viewSettingsPage: true,
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
      viewClassesPage: true,
      viewStudentAffairsPage: false,
      viewAttendancePage: false,
      viewCounselingPage: true,
      viewReportsPage: true,
      viewMessagesPage: true,
      viewFormsPage: true,
      viewArchivePage: false,
      viewStaffPage: false,
      viewImportPage: false,
      viewSettingsPage: true,
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
      viewClassesPage: true,
      viewStudentAffairsPage: false,
      viewAttendancePage: true,
      viewCounselingPage: true,
      viewReportsPage: true,
      viewMessagesPage: true,
      viewFormsPage: true,
      viewArchivePage: false,
      viewStaffPage: false,
      viewImportPage: false,
      viewSettingsPage: true,
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
      viewClassesPage: true,
      viewStudentAffairsPage: false,
      viewAttendancePage: true,
      viewCounselingPage: false,
      viewReportsPage: true,
      viewMessagesPage: true,
      viewFormsPage: true,
      viewArchivePage: false,
      viewStaffPage: false,
      viewImportPage: false,
      viewSettingsPage: true,
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
      viewClassesPage: true,
      viewStudentAffairsPage: false,
      viewAttendancePage: true,
      viewCounselingPage: false,
      viewReportsPage: true,
      viewMessagesPage: true,
      viewFormsPage: true,
      viewArchivePage: false,
      viewStaffPage: false,
      viewImportPage: false,
      viewSettingsPage: true,
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
      viewClassesPage: true,
      viewStudentAffairsPage: false,
      viewAttendancePage: true,
      viewCounselingPage: false,
      viewReportsPage: true,
      viewMessagesPage: true,
      viewFormsPage: true,
      viewArchivePage: false,
      viewStaffPage: false,
      viewImportPage: false,
      viewSettingsPage: true,
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
      viewClassesPage: true,
      viewStudentAffairsPage: false,
      viewAttendancePage: false,
      viewCounselingPage: false,
      viewReportsPage: true,
      viewMessagesPage: true,
      viewFormsPage: true,
      viewArchivePage: false,
      viewStaffPage: false,
      viewImportPage: false,
      viewSettingsPage: true,
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
