import type { StaffPermissions } from "./permissions";
import type { Appearance } from "./theme";

export type { StaffPermissions, PermissionKey } from "./permissions";
export type { Appearance, ThemeId, FontId } from "./theme";

export type StaffRole =
  | "admin"
  | "principal"
  | "school_vp"
  | "teachers_vp"
  | "counselor"
  | "student_counselor"
  | "health_counselor"
  | "activity_leader"
  | "teacher"
  | "security"
  | "admin_assistant"
  | "admin_staff"
  | "pending";
export type NoteType = "absence" | "late" | "homework" | "behavior";
export type NoteStatus = "open" | "closed";
export type NoteTone = "danger" | "warn" | "ok";
export type Season = "summer" | "winter";
export type SchoolGender = "male" | "female";
export type MessageKind = NoteType | "general";
export type ImprovementStatus = "open" | "following" | "closed";
export type DailyKind = "absence" | "late";
export type CounselingKind = "health" | "psych" | "learning";
export type NoteDest = "vp" | "counselor" | "health";
export type NoteMessageTo = "vp" | "counselor" | "health" | "teacher";
export type MailDest = "vp" | "counselor" | "health" | "teacher";

export type Staff = {
  userId: string;
  schoolId: number;
  displayName: string;
  role: StaffRole;
  subject: string;
  phone: string;
  permissions: StaffPermissions;
  appearance?: Appearance;
};

export type MessageTemplate = {
  title: string;
  body: string;
};

export type MessageTemplates = Partial<Record<MessageKind, MessageTemplate>>;

export type CustomMessage = {
  id: string;
  title: string;
  body: string;
};

export type PrintMargins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type StatCounter = {
  id: string;
  title: string;
  source: "daily-absence" | "daily-late" | "note-absence" | "note-late" | "homework" | "behavior";
  range: "today" | "week" | "month" | "total";
};

export type PeriodSlot = {
  key: string;
  label: string;
  from: string;
  to: string;
  startMin: number;
  endMin: number;
};

export type SchoolSchedules = {
  winter: PeriodSlot[];
  summer: PeriodSlot[];
};

export type School = {
  id: number;
  name: string;
  principalName: string;
  season: Season;
  region: string;
  governorate: string;
  leadershipGender: SchoolGender;
  studentGender: SchoolGender;
  counselorName: string;
  technicalVpName: string;
  logoUrl: string;
  extraLogoUrl: string;
  tagline: string;
  printMargins: PrintMargins;
  printSchoolLogo: boolean;
  schedules: SchoolSchedules;
  statCounters: StatCounter[];
  statHidden: string[];
  messageTemplates: MessageTemplates;
  customMessages: CustomMessage[];
  teachersCanMessage: boolean;
  teachersCanViewAll: boolean;
  appearance: Appearance;
};

export type CatalogItem = {
  id: number;
  name: string;
  sortOrder: number;
  active: boolean;
  degree?: number;
  procedures?: string[][];
};

export type BehaviorType = CatalogItem & { procedures: string[][] };
export type ActionType = CatalogItem;

export type StageSummary = {
  id: number;
  name: string;
  shortName: string;
  sortOrder: number;
  classCount: number;
  studentCount: number;
  openNotes: number;
};

export type ClassSummary = {
  id: number;
  stageId: number;
  name: string;
  sortOrder: number;
  studentCount: number;
  openNotes: number;
};

export type ClassOption = {
  id: number;
  stageId: number;
  stageName: string;
  name: string;
  shortName: string;
  label: string;
  studentCount?: number;
  absenceToday?: number;
  lateToday?: number;
};

export type TodayNote = {
  id: number;
  type: NoteType;
  status: NoteStatus;
  details: string;
  behaviorTypeName: string | null;
  behaviorDegree: number | null;
  periodKey: string;
  actionTaken: string | null;
  createdAt: string;
  occurredAt: string;
  teacherId: string;
  teacherName: string;
  teacherSubject: string;
  enteredByName?: string;
  referCounselor: boolean;
};

export type StudentRow = {
  id: number;
  name: string;
  nameEn?: string;
  parentPhone: string;
  classId: number;
  healthNote: string;
  dailyKind: DailyKind | null;
  arrivedAt: string | null;
  todayNotes: TodayNote[];
  marks?: { subject: string; total: number; lesson: number }[];
  todayTaps?: { label: string; points: number; subject: string }[];
};

export type NoteRecord = {
  id: number;
  studentId: number;
  studentName: string;
  parentPhone: string;
  className: string;
  stageName: string;
  shortName: string;
  teacherId: string;
  teacherName: string;
  teacherSubject: string;
  enteredByName?: string;
  type: NoteType;
  details: string;
  behaviorTypeId: number | null;
  behaviorTypeName: string | null;
  behaviorDegree: number | null;
  periodKey: string;
  status: NoteStatus;
  actionTaken: string | null;
  createdAt: string;
  occurredAt: string;
  closedAt: string | null;
  occurrence: number;
  referCounselor: boolean;
  dest: NoteDest;
  suggestedAction: string;
  compensation: string;
};

export type NoteMessage = {
  id: number;
  noteId: number;
  authorId: string;
  authorName: string;
  authorRole: string;
  toKind: NoteMessageTo;
  body: string;
  createdAt: string;
  mine: boolean;
};

export type DailyAttendanceRow = {
  studentId: number;
  studentName: string;
  nameEn?: string;
  classId: number;
  classLabel: string;
  kind: DailyKind | null;
  excused: boolean;
  details: string;
  arrivedAt: string | null;
  hasLeave?: boolean;
  leaveDetails?: string;
};

export type CounselingCase = {
  id: number;
  studentId: number;
  studentName: string;
  classLabel: string;
  authorName: string;
  kind: CounselingKind;
  body: string;
  createdAt: string;
};

export type StaffDirectoryRow = {
  userId: string;
  displayName: string;
  role: StaffRole;
  subject: string;
};

export type StudentMail = {
  id: number;
  studentId: number;
  studentName: string;
  classLabel: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  assigneeId: string;
  assigneeName: string;
  assigneeRole: string;
  dest: MailDest;
  status: "open" | "closed";
  lastBody: string;
  parentPhone: string;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
  assignedToMe: boolean;
};

export type MailMessage = {
  id: number;
  mailId: number;
  authorId: string;
  authorName: string;
  authorRole: string;
  kind: "message" | "forward";
  body: string;
  createdAt: string;
  mine: boolean;
};

export type BehaviorImprovement = {
  id: number;
  studentId: number;
  studentName: string;
  classLabel: string;
  teacherId: string;
  teacherName: string;
  teacherSubject: string;
  enteredByName?: string;
  noteId: number | null;
  plan: string;
  teacherFollowup: string | null;
  counselorNote: string | null;
  status: ImprovementStatus;
  createdAt: string;
  updatedAt: string;
};

export type Workspace = {
  staff: Staff;
  school: School;
  stages: StageSummary[];
  classes: ClassOption[];
  behaviorTypes: BehaviorType[];
  actionTypes: ActionType[];
  healthConditions: CatalogItem[];
  compensations: CatalogItem[];
  improvementOptions: CatalogItem[];
  studyNotes: CatalogItem[];
};
