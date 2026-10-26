import { tr, uiLocale } from "./i18n-core";
import type {
  ImprovementStatus,
  MessageKind,
  NoteTone,
  NoteType,
  PeriodSlot,
  PrintMargins,
  SchoolGender,
  SchoolSchedules,
  Season,
  StaffRole,
} from "./types";

export const NOTE_META: Record<NoteType, { label: string; tone: NoteTone; short: string }> = {
	absence: {
		label: "غياب عن الحصة",
		tone: "danger",
		short: "غياب حصة"
	},
	late: {
		label: "تأخر عن الحصة",
		tone: "warn",
		short: "تأخر حصة"
	},
	homework: {
		label: "ملاحظات دراسية",
		tone: "warn",
		short: "ملاحظات دراسية"
	},
	behavior: {
		label: "مخالفة سلوكية",
		tone: "danger",
		short: "سلوك"
	}
};
export const NOTE_TYPES = Object.keys(NOTE_META) as NoteType[];

/** مواد المعلم: تُحفظ متصلة بفاصلة عربية، وتُقرأ قائمة. */
export function parseSubjects(value: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const part of String(value ?? "").split(/\n|،|,/)) {
		const name = part.trim().slice(0, 40);
		if (!name) continue;
		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(name);
		if (out.length >= 8) break;
	}
	return out;
}

export function formatSubjects(list: string[]): string {
	return parseSubjects(list.join("\n")).join("، ");
}
/** اختصارات زر الإضافة في الفصل: تُسجَّل كمخالفة سلوكية من الدليل، لا كملاحظة مستقلة. */
export const SHORTCUT_VIOLATIONS: Partial<Record<NoteType, string>> = {
	late: "التأخر في الدخول إلى الحصص",
	absence: "عدم حضور الحصة الدراسية أو الهروب منها",
};
/** ملاحظات دراسية. كلها أكاديمية، وليست مخالفات سلوكية. */
export const DEFAULT_STUDY_NOTES = [
	"عدم إحضار المتطلبات",
	"إهمال الواجبات",
	"عدم الحفظ",
	"عدم الاستذكار",
	"إهمال المهام الأدائية",
	"ضعف التفاعل",
	"تشتت الانتباه",
];
export const STUDY_NOTE_HINTS = [
	"عدم إحضار الكتاب المدرسي أو الدفتر أو أدوات المادة.",
	"عدم إنجاز الواجبات المنزلية أو التأخر في تسليمها.",
	"عدم حفظ المقررات الشفهية مثل القرآن أو النصوص.",
	"عدم الاستعداد للدرس أو تدني المستوى في التقويم المستمر.",
	"عدم تسليم البحوث أو المشاريع أو المطويات أو أوراق العمل.",
	"عدم المشاركة الصفية والاعتماد على السلبية داخل الفصل.",
	"الانشغال أو كثرة السرحان أثناء شرح الدرس.",
];
export const STUDY_ACTIONS = [
	{ id: "warn", label: "تم التنبيه الفردي", hint: "تنبيه الطالب شفهياً لمعرفة الأسباب وتحفيزه." },
	{ id: "family", label: "إرسال إشعار لولي الأمر", hint: "يُحوَّل إلى المرشد الطلابي أو وكيل شؤون الطلاب ليرسله. المعلم يرسل فقط إذا مُنح صلاحية الرسائل." },
	{ id: "deduct", label: "حسم من درجات المادة", hint: "خصم من درجات أعمال السنة للمادة، وليس من السلوك. إشعار الحسم يرسله المرشد أو الوكيل ما لم يملك المعلم صلاحية الرسائل." },
	{ id: "refer", label: "إحالة للموجه الطلابي", hint: "تحويل الحالة لدراسة الأسباب ووضع خطة علاجية." },
];
export function studyStageFor(occurrence: number) {
	if (!Number.isFinite(occurrence) || occurrence < 1) return 1;
	return Math.min(4, Math.floor(occurrence));
}
export function studyActionFor(occurrence: number) {
	return STUDY_ACTIONS[studyStageFor(occurrence) - 1]!;
}
export const STUDY_NOTES: { id: string; label: string }[] = [
	...DEFAULT_STUDY_NOTES.map((label, index) => ({ id: `study-${index + 1}`, label })),
	{ id: "other", label: "ملاحظة أخرى" },
];
export const LEGACY_STUDY_NOTES = ["عدم حل واجب", "عدم احضار الكتاب", "عدم دخول المنصة", "عدم إحضار الكتاب"];
export const NOTE_DEST = [
  { id: "vp" as const, label: "وكيل شؤون الطلاب" },
  { id: "counselor" as const, label: "المرشد الطلابي" },
  { id: "health" as const, label: "المرشد الصحي" },
];
export const MAIL_DEST = [
  { id: "vp" as const, label: "وكيل شؤون الطلاب" },
  { id: "counselor" as const, label: "المرشد الطلابي" },
  { id: "health" as const, label: "المرشد الصحي" },
  { id: "teacher" as const, label: "معلم آخر" },
];
export const NOTE_DEST_LABEL: Record<"vp" | "counselor" | "health" | "teacher", string> = {
  vp: "وكيل شؤون الطلاب",
  counselor: "المرشد الطلابي",
  health: "المرشد الصحي",
  teacher: "المعلم",
};
export const ROLE_LABEL: Record<StaffRole, string> = {
	admin: "مدير التطبيق",
	principal: "مدير مدرسة",
	school_vp: "وكيل الشؤون المدرسية",
	teachers_vp: "وكيل شؤون المعلمين",
	counselor: "وكيل شؤون الطلاب",
	student_counselor: "مرشد طلابي",
	health_counselor: "مرشد صحي",
	activity_leader: "رائد نشاط",
	teacher: "معلم",
	security: "رجل أمن",
	admin_assistant: "مساعد إداري",
	admin_staff: "موظف إداري",
	pending: "بانتظار الموافقة"
};
export const ASSIGNABLE_ROLES: StaffRole[] = [
	"teacher",
	"security",
	"admin_assistant",
	"admin_staff",
	"activity_leader",
	"health_counselor",
	"student_counselor",
	"counselor",
	"teachers_vp",
	"school_vp",
	"principal",
	"admin",
	"pending"
];
export const CREATE_ROLES: Exclude<StaffRole, "pending">[] = [
	"teacher",
	"security",
	"admin_assistant",
	"admin_staff",
	"activity_leader",
	"health_counselor",
	"student_counselor",
	"counselor",
	"teachers_vp",
	"school_vp",
	"principal",
	"admin"
];
export const APP_NAME = "متابعة الطلاب الشاملة";
export const DEFAULT_APP_PHRASE = "نظام متابعة شؤون الطلاب — بين المعلم والإدارة وولي الأمر";
export const DEFAULT_SCHOOL_NAME = "اسم المدرسة";
export const DEFAULT_PRINT_MARGINS: PrintMargins = {
	top: 10,
	right: 10,
	bottom: 12,
	left: 8
};
export function clampPrintMargin(value: unknown): number {
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(n)) return 10;
	return Math.min(40, Math.max(0, Math.round(n)));
}
export function parsePrintMargins(raw: unknown): PrintMargins {
	let value = raw;
	if (typeof raw === "string") try {
		value = JSON.parse(raw);
	} catch {
		return { ...DEFAULT_PRINT_MARGINS };
	}
	if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_PRINT_MARGINS };
	const rec = value as Record<string, unknown>;
	return {
		top: clampPrintMargin(rec.top ?? DEFAULT_PRINT_MARGINS.top),
		right: clampPrintMargin(rec.right ?? DEFAULT_PRINT_MARGINS.right),
		bottom: clampPrintMargin(rec.bottom ?? DEFAULT_PRINT_MARGINS.bottom),
		left: clampPrintMargin(rec.left ?? DEFAULT_PRINT_MARGINS.left)
	};
}
export function applyPrintMargins(margins: PrintMargins) {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	root.style.setProperty("--print-margin-top", `${margins.top}mm`);
	root.style.setProperty("--print-margin-right", `${margins.right}mm`);
	root.style.setProperty("--print-margin-bottom", `${margins.bottom}mm`);
	root.style.setProperty("--print-margin-left", `${margins.left}mm`);
}
/** مخالفات المرحلة المتوسطة والثانوية — الإصدار الخامس 1447هـ كاملة. */
export const OFFICIAL_BEHAVIOR_TYPES: { name: string; degree: number; aliases?: string[]; audience?: "staff" }[] = [
	{ name: "التأخر الصباحي", degree: 1 },
	{
		name: "عدم حضور الاصطفاف الصباحي في حال كان الطالب متواجداً داخل المدرسة",
		degree: 1,
		aliases: ["عدم حضور الاصطفاف الصباحي"],
	},
	{
		name: "التأخر عن الاصطفاف الصباحي في حال كان الطالب متواجداً داخل المدرسة، أو العبث أثناءه",
		degree: 1,
		aliases: ["التأخر عن الاصطفاف الصباحي أو العبث أثناءه"],
	},
	{ name: "التأخر في الدخول إلى الحصص", degree: 1 },
	{
		name: "إعاقة سير الحصص الدراسية مثل: الحديث الجانبي، أو المقاطعة المستمرة غير الهادفة لشرح المعلم، أو تناول الأطعمة أو المشروبات أثناء الدرس",
		degree: 1,
		aliases: ["إعاقة سير الحصص الدراسية (حديث جانبي / مقاطعة / أكل أو شرب)"],
	},
	{ name: "النوم داخل الفصل", degree: 1 },
	{
		name: "تكرار خروج ودخول الطلاب من البوابة قبل وقت الحضور والانصراف",
		degree: 1,
		aliases: ["تكرار الخروج والدخول من البوابة قبل وقت الحضور والانصراف"],
	},
	{ name: "التجمهر أمام بوابة المدرسة", degree: 1 },
	{ name: "عدم حل الواجب", degree: 1 },
	{ name: "عدم حضور الحصة الدراسية أو الهروب منها", degree: 2 },
	{ name: "الدخول أو الخروج من الفصل دون استئذان", degree: 2 },
	{ name: "دخول فصل آخر دون استئذان", degree: 2 },
	{
		name: "إثارة الفوضى داخل الفصل أو المدرسة أو في وسائل النقل المدرسي",
		degree: 2,
		aliases: ["إثارة الفوضى داخل الفصل أو المدرسة أو النقل المدرسي"],
	},
	{ name: "عدم التقيد بالزي المدرسي", degree: 3 },
	{ name: "الشجار أو الاشتراك في مضاربة جماعية", degree: 3 },
	{ name: "الإشارة بحركات مخلة بالأدب تجاه الطلبة", degree: 3 },
	{
		name: "التلفظ بكلمات نابية على الطلبة، أو تهديدهم، أو السخرية منهم",
		degree: 3,
		aliases: ["التلفظ بكلمات نابية أو التهديد أو السخرية من الطلبة"],
	},
	{ name: "إلحاق الضرر المتعمد بممتلكات الطلبة", degree: 3 },
	{
		name: "العبث بتجهيزات المدرسة أو مبانيها، مثل أجهزة الحاسوب وأدوات الأمن والسلامة والكهرباء والمعامل وحافلة المدرسة والكتابة على الجدران",
		degree: 3,
		aliases: ["العبث بتجهيزات المدرسة أو مبانيها"],
	},
	{
		name: "إحضار المواد أو الألعاب الخطرة إلى المدرسة دون استخدامها، مثل الألعاب النارية والبخاخات الغازية الملونة والمواد الكيماوية",
		degree: 3,
		aliases: ["إحضار مواد أو ألعاب خطرة دون استخدامها"],
	},
	{ name: "حيازة السجائر بأنواعها", degree: 3 },
	{
		name: "حيازة المواد الإعلامية الممنوعة المقروءة أو المسموعة أو المرئية",
		degree: 3,
		aliases: ["حيازة المواد الإعلامية الممنوعة"],
	},
	{
		name: "التوقيع عن ولي الأمر من غير علمه على المكاتبات المتبادلة بين المدرسة وولي الأمر",
		degree: 3,
		aliases: ["التوقيع عن ولي الأمر من غير علمه"],
	},
	{ name: "امتهان الكتب الدراسية", degree: 3 },
	{
		name: "تعمد إصابة أحد الطلبة بالضرب باليد أو باستخدام أدوات غير حادة تحدث إصابة",
		degree: 4,
		aliases: ["تعمد إصابة أحد الطلبة بالضرب"],
	},
	{ name: "سرقة شيء من ممتلكات الطلبة أو المدرسة", degree: 4 },
	{ name: "التصوير أو التسجيل الصوتي للطلبة", degree: 4 },
	{
		name: "إلحاق الضرر المتعمد بتجهيزات المدرسة أو مبانيها، مثل أجهزة الحاسوب وأدوات الأمن والسلامة والكهرباء والمعامل والحافلة المدرسية",
		degree: 4,
		aliases: ["إلحاق الضرر المتعمد بتجهيزات المدرسة"],
	},
	{ name: "التدخين بأنواعه داخل المدرسة", degree: 4 },
	{ name: "الهروب من المدرسة", degree: 4 },
	{
		name: "إحضار أو استخدام المواد أو الألعاب الخطرة داخل المدرسة، مثل الألعاب النارية والبخاخات الغازية الملونة والمواد الكيميائية",
		degree: 4,
		aliases: ["إحضار أو استخدام المواد أو الألعاب الخطرة"],
	},
	{
		name: "عرض أو توزيع المواد الإعلامية الممنوعة المقروءة أو المسموعة أو المرئية",
		degree: 4,
		aliases: ["عرض أو توزيع المواد الإعلامية الممنوعة"],
	},
	{
		name: "تهديد المعلمين أو الإداريين أو من في حكمهم من منسوبي المدرسة",
		degree: 4,
		audience: "staff",
		aliases: ["تهديد المعلمين أو الإداريين"],
	},
	{
		name: "التلفظ بألفاظ غير لائقة تجاه المعلمين أو الإداريين أو من في حكمهم من منسوبي المدرسة",
		degree: 4,
		audience: "staff",
		aliases: ["التلفظ بألفاظ غير لائقة تجاه المعلمين أو الإداريين"],
	},
	{
		name: "السخرية بالقول أو الفعل من المعلمين أو الإداريين أو من في حكمهم من منسوبي المدرسة",
		degree: 4,
		audience: "staff",
		aliases: ["السخرية من المعلمين أو الإداريين"],
	},
	{ name: "التوقيع عن أحد منسوبي المدرسة على المكاتبات المتبادلة بين المدرسة وأولياء الأمور", degree: 4, audience: "staff" },
	{
		name: "تصوير المعلمين أو الإداريين أو التسجيل الصوتي لهم دون موافقة خطية",
		degree: 4,
		audience: "staff",
		aliases: ["تصوير المعلمين أو التسجيل الصوتي لهم"],
	},
	{
		name: "الإساءة أو الاستهزاء بشيء من شعائر الإسلام",
		degree: 5,
		aliases: ["الإساءة أو الاستهزاء بشعائر الإسلام"],
	},
	{ name: "الإساءة للدولة أو رموزها", degree: 5 },
	{
		name: "بث أو ترويج أفكار أو معتقدات متطرفة أو تكفيرية أو إلحادية أو مسيئة لنظم المجتمع",
		degree: 5,
		aliases: ["بث أو ترويج أفكار متطرفة"],
	},
	{ name: "الإساءة إلى الأديان السماوية أو إثارة النعرات العنصرية أو الفتن القبلية أو الطائفية أو المذهبية", degree: 5 },
	{ name: "التزوير أو استخدام الوثائق أو الأختام الرسمية أو الاستفادة منها بطريقة غير مشروعة", degree: 5 },
	{ name: "التحرش الجنسي", degree: 5 },
	{ name: "إظهار أو ترويج مظاهر أو صور أو شعارات تدل على الشذوذ الجنسي", degree: 5 },
	{ name: "إشعال النار داخل المدرسة", degree: 5 },
	{
		name: "حيازة أو استخدام أو تهديد الطلبة بالأسلحة النارية أو ما في حكمها، كالسكاكين والأدوات الحادة",
		degree: 5,
		aliases: ["حيازة أو استخدام أسلحة أو أدوات حادة"],
	},
	{
		name: "حيازة أو تعاطي أو ترويج المخدرات أو المسكرات",
		degree: 5,
		aliases: ["حيازة أو تعاطي أو ترويج المخدرات أو المسكرات"],
	},
	{
		name: "الجرائم المعلوماتية بكافة أنواعها",
		degree: 5,
		aliases: ["الجرائم المعلوماتية"],
	},
	{ name: "ابتزاز الطلبة", degree: 5 },
	{
		name: "التنمر بجميع أنواعه وأشكاله",
		degree: 5,
		aliases: ["التنمر بجميع أنواعه"],
	},
	{ name: "إلحاق الضرر بممتلكات المعلمين أو الإداريين أو من في حكمهم أو سرقتها", degree: 5, audience: "staff" },
	{ name: "الإشارة بحركات مخلة بالأدب تجاه المعلمين أو الإداريين أو من في حكمهم من منسوبي المدرسة", degree: 5, audience: "staff" },
	{
		name: "الاعتداء بالضرب على المعلمين أو الإداريين أو من في حكمهم من منسوبي المدرسة",
		degree: 5,
		audience: "staff",
		aliases: ["الاعتداء بالضرب على المعلمين أو الإداريين"],
	},
	{ name: "ابتزاز المعلمين أو الإداريين أو من في حكمهم من منسوبي المدرسة", degree: 5, audience: "staff" },
	{ name: "الجرائم المعلوماتية تجاه المعلمين أو الإداريين أو من في حكمهم من منسوبي المدرسة", degree: 5, audience: "staff" },
	{ name: "أخرى", degree: 1 },
];
/** سلم مختصر سابق؛ يُستبدل بالسلم الكامل إن لم يعدّله مدير التطبيق. */
export const SHORT_DEGREE_PROCEDURES: Record<number, string[][]> = {
	1: [
		["تنبيه شفهي من المعلم أو إدارة المدرسة"],
		["تنبيه شفهي ثانٍ", "ملاحظة السلوك الإيجابي وتعزيزه"],
		[
			"تدوين المشكلة السلوكية وتوقيع الطالب عليها",
			"إشعار ولي الأمر هاتفياً",
			"حسم درجة واحدة من درجات السلوك مع تمكينه من فرص التعويض",
			"تحويل إلى الموجه الطلابي لدراسة الحالة"
		],
		[
			"دعوة ولي الأمر",
			"تعهد خطي بعدم التكرار",
			"حسم درجة واحدة من درجات السلوك مع تمكينه من فرص التعويض",
			"تحويل إلى لجنة التوجيه الطلابي"
		]
	],
	2: [
		[
			"تحويل الطالب إلى إدارة المدرسة",
			"إشعار ولي الأمر هاتفياً",
			"حسم درجتين من درجات السلوك مع تمكينه من فرص التعويض",
			"تعهد خطي بعدم تكرار المخالفة",
			"تحويل إلى الموجه الطلابي لدراسة الحالة"
		],
		[
			"دعوة ولي الأمر حضورياً",
			"وضع برنامج وقائي مشترك مع الأسرة",
			"متابعة الحالة من الموجه الطلابي"
		],
		["تحويل إلى لجنة التوجيه الطلابي", "نقل الطالب إلى فصل آخر وفق قرار اللجنة"]
	],
	3: [
		[
			"إشعار ولي الأمر",
			"حسم ثلاث درجات من درجات السلوك مع تمكينه من فرص التعويض",
			"الاعتذار إلى من أساء إليهم",
			"إصلاح ما أتلفه أو إحضار بديل عنه",
			"مصادرة المواد الممنوعة إن وُجدت",
			"تحويل إلى الموجه الطلابي"
		],
		[
			"دعوة ولي الأمر وأخذ تعهد خطي",
			"تحويل إلى لجنة التوجيه الطلابي",
			"نقل إلى فصل آخر وفق قرار اللجنة"
		],
		["إنذار كتابي بعدم التكرار", "متابعة الحالة من لجنة التوجيه الطلابي"]
	],
	4: [[
		"إحالة إلى لجنة التوجيه الطلابي لدراسة المشكلة",
		"دعوة ولي الأمر وتوضيح ما يترتب على التكرار وتوقيعه بالعلم",
		"حسم عشر درجات من السلوك مع تمكينه من فرص التعويض وإشعار ولي الأمر",
		"تعهد خطي بعدم التكرار",
		"الاعتذار لمن أسيء إليهم وإصلاح ما أتلفه أو إحضار بديل",
		"مصادرة المواد الممنوعة وإعداد محضر بذلك",
		"نقل إلى فصل آخر وفق قرار اللجنة"
	], [
		"إنذار بالنقل إلى مدرسة أخرى عند إعادة التكرار",
		"رفع محضر اللجنة إلى إدارة التعليم"
	]],
	5: [[
		"تدوين محضر إثبات الواقعة",
		"دعوة ولي الأمر وتبليغه بالإجراءات",
		"حسم خمس عشرة درجة من السلوك مع تمكينه من فرص التعويض",
		"اجتماع لجنة التوجيه الطلابي",
		"رفع المحضر إلى إدارة التعليم بصفة عاجلة",
		"نقل الطالب إلى مدرسة أخرى بقرار من مدير التعليم، مع متابعة الموجه الطلابي في المدرسة المنقول إليها"
	]]
};
const D2_FIRST = [
	"تحويل الطالب إلى إدارة المدرسة",
	"إشعار ولي الأمر هاتفياً بالمشكلة والإجراءات المتخذة",
	"حسم درجتين من درجات السلوك مع تمكينه من فرص التعويض وإشعار ولي الأمر",
	"تعهد خطي بعدم تكرار المخالفة",
	"تحويل إلى الموجه الطلابي لدراسة الحالة"
];
const D2_SECOND = [
	...D2_FIRST,
	"دعوة ولي الأمر حضورياً ومناقشته في خطة تعديل السلوك",
	"وضع برنامج وقائي مشترك مع الأسرة وتوقيع ولي الأمر بالعلم",
	"متابعة الحالة من الموجه الطلابي"
];
const D3_FIRST = [
	"تحويل الطالب إلى إدارة المدرسة",
	"دعوة ولي الأمر وتوضيح الإجراءات المترتبة على التكرار",
	"مناقشة خطة تعديل السلوك ووضع برنامج وقائي مشترك مع الأسرة",
	"تعهد خطي بعدم التكرار وتوقيع ولي الأمر بالعلم",
	"حسم ثلاث درجات من درجات السلوك مع تمكينه من فرص التعويض وإشعار ولي الأمر",
	"الاعتذار إلى من أساء إليهم",
	"إصلاح ما أتلفه أو إحضار بديل عنه",
	"مصادرة المواد الممنوعة وإتلافها بمحضر من لجنة التوجيه فيما لم يرد فيه نص نظامي",
	"تحويل إلى الموجه الطلابي لدراسة الحالة",
	"استدعاء الهلال الأحمر لنقل المصاب إن تطلب الأمر",
	"إحالة الواقعة للجهات الأمنية بعد إشعار ولي الأمر وتوثيق الإجراء إن تطلب الأمر"
];
const D4_CLASS_MOVE = "نقل الطالب إلى فصل آخر وفق قرار اللجنة";
const D4_FIRST = [
	"إحالة فورية إلى لجنة التوجيه الطلابي لدراسة المشكلة",
	"دعوة ولي الأمر وتوضيح الإجراءات المترتبة على التكرار",
	"مناقشة خطة تعديل السلوك ووضع برنامج وقائي مشترك مع الأسرة",
	"تعهد خطي بعدم التكرار وإنذار بالنقل إلى مدرسة أخرى عند إعادة التكرار وتوقيع ولي الأمر بالعلم",
	"حسم عشر درجات من السلوك مع تمكينه من فرص التعويض وإشعار ولي الأمر",
	"الاعتذار لمن أسيء إليهم",
	"إصلاح ما أتلفه أو إحضار بديل عنه وإشعار ولي الأمر",
	"مصادرة المواد الممنوعة وإتلافها بمحضر من لجنة التوجيه فيما لم يرد فيه نص نظامي",
	D4_CLASS_MOVE,
	"متابعة الحالة من الموجه الطلابي"
];
const D4_SECOND_EXTRA = [
	"رفع محضر لجنة التوجيه إلى إدارة التعليم رسمياً وبصفة عاجلة",
	"نقل الطالب إلى مدرسة أخرى بقرار مدير التعليم مع استمراره بالدراسة حتى النقل وأخذ رأي ولي الأمر، وإلا فأقرب مدرسة لمسكنه",
	"تمكينه من فرص التعويض في المدرسة المنقول إليها وإشعار ولي الأمر",
	"متابعة الحالة من الموجه الطلابي في المدرسة المنقول إليها"
];
const D5_MOVE = "نقل الطالب إلى مدرسة أخرى بقرار مدير التعليم مع استمراره بالدراسة حتى النقل وأخذ رأي ولي الأمر، وإلا فأقرب مدرسة لمسكنه";
const D5_BEFORE = [
	"تدوين محضر بالوقائع من إدارة المدرسة",
	"دعوة ولي الأمر وتبليغه بالمشكلة والإجراءات المترتبة",
	"حسم خمس عشرة درجة من السلوك مع تمكينه من فرص التعويض في المدرسة المنقول إليها وإشعار ولي الأمر",
	"اجتماع لجنة التوجيه الطلابي فور وقوع القضية لدراسة ظروفها",
	"إصلاح ما أتلفه أو إحضار بديل عنه وإشعار ولي الأمر",
	"الاعتذار لمن أسيء إليه",
	"رفع محضر اللجنة إلى إدارة التعليم رسمياً وبصفة عاجلة",
	D5_MOVE,
	"متابعة الحالة من الموجه الطلابي في المدرسة المنقول إليها"
];
/** نسخة وسيطة سابقة للدرجتين الرابعة والخامسة، تُستبدل بالنص الرسمي. */
export const INTERIM_DEGREE_PROCEDURES: Record<number, string[][]> = {
	4: [[...D4_FIRST], [...D4_FIRST.filter((item) => item !== D4_CLASS_MOVE), ...D4_SECOND_EXTRA]],
	5: [[...D5_BEFORE]]
};
const ALL_SERIOUS = [
	"استدعاء الهلال الأحمر لنقل المصاب إلى أقرب مركز صحي إن تطلب الأمر",
	"تبليغ الجهات الأمنية فور وقوع المشكلة بعد إشعار ولي الأمر وتوثيق الإجراءات",
	"إن صُنفت الحالة إيذاءً أو إهمالاً يُبلَّغ مركز البلاغات 1919 بعد استكمال الإجراءات"
];
const SECURITY_NOTICE = ["تبليغ الجهات الأمنية فور وقوع المشكلة بعد إشعار ولي الأمر وتوثيق الإجراءات"];
D4_FIRST.push(...ALL_SERIOUS);
const D4_STAFF_FIRST = [
	"إحالة فورية إلى لجنة التوجيه الطلابي لدراسة المشكلة",
	"دعوة ولي الأمر وتوضيح الإجراءات المترتبة على التكرار",
	"مناقشة خطة تعديل السلوك ووضع برنامج وقائي مشترك مع الأسرة",
	"تعهد خطي بعدم التكرار وإنذار بالنقل إلى مدرسة أخرى عند إعادة التكرار وتوقيع ولي الأمر بالعلم",
	"حسم عشر درجات من السلوك مع تمكينه من فرص التعويض وإشعار ولي الأمر",
	"مصادرة المواد وإتلافها بمحضر من لجنة التوجيه فيما لم يرد فيه نص نظامي",
	"الاعتذار لمن أسيء إليهم",
	D4_CLASS_MOVE,
	"تحويل إلى الموجه الطلابي لدراسة الحالة",
	...SECURITY_NOTICE
];
/** إجراءات المخالفة تجاه الهيئة التعليمية والإدارية، المادتان 15 و16. */
export const STAFF_DEGREE_PROCEDURES: Record<number, string[][]> = {
	4: [
		D4_STAFF_FIRST,
		[
			...D4_STAFF_FIRST.filter((item) => item !== D4_CLASS_MOVE),
			...D4_SECOND_EXTRA
		]
	],
	5: [[
		"تدوين محضر بالوقائع من إدارة المدرسة",
		"دعوة ولي الأمر وتبليغه بالمشكلة والإجراءات المترتبة",
		"حسم خمس عشرة درجة من السلوك مع تمكينه من فرص التعويض في المدرسة المنقول إليها وإشعار ولي الأمر",
		"اجتماع لجنة التوجيه الطلابي فور وقوع القضية لدراسة ظروفها",
		"إصلاح ما أتلفه أو إحضار بديل عنه وإشعار ولي الأمر",
		"الاعتذار لمن أسيء إليهم",
		"رفع محضر اللجنة إلى إدارة التعليم رسمياً وبصفة عاجلة",
		D5_MOVE,
		"متابعة الحالة من الموجه الطلابي في المدرسة المنقول إليها",
		...SECURITY_NOTICE
	]]
};
/** الإجراءات التربوية الرسمية حسب الدرجة. المرحلة اللاحقة تضم ما قبلها حين تنص القواعد على ذلك. قواعد 1447. */
export const DEGREE_PROCEDURES: Record<number, string[][]> = {
	1: [
		["تنبيه شفهي من المعلم أو إدارة المدرسة عن السلوك وأضراره بأسلوب تربوي"],
		[
			"تنبيه شفهي ثانٍ من المعلم أو إدارة المدرسة بأسلوب تربوي",
			"ملاحظة الطالب وحصر السلوكيات السلبية والإيجابية ومسبباتها",
			"الحد من مسببات السلوك السلبي وتعزيز السلوك الإيجابي"
		],
		[
			"تدوين المشكلة السلوكية من المعلم المباشر وتوقيع الطالب عليها",
			"إشعار ولي الأمر هاتفياً والتنسيق معه لتعديل السلوك",
			"حسم درجة واحدة من درجات السلوك من قبل إدارة المدرسة مع تمكينه من فرص التعويض وإشعار ولي الأمر",
			"تحويل إلى الموجه الطلابي لدراسة الحالة"
		],
		[
			"دعوة ولي الأمر وإخطاره بالسلوك غير المرغوب",
			"الاتفاق على خطة تعديل سلوك بين الأسرة والمدرسة ينفذها الموجه الطلابي",
			"حسم درجة واحدة من درجات السلوك مع تمكينه من فرص التعويض وإشعار ولي الأمر",
			"تحويل إلى لجنة التوجيه الطلابي لبحث أسباب عدم الاستجابة",
			"متابعة الحالة من الموجه الطلابي"
		]
	],
	2: [
		D2_FIRST,
		D2_SECOND,
		[
			...D2_SECOND,
			"تحويل إلى لجنة التوجيه الطلابي لوضع الحلول وفق تقرير الموجه",
			"نقل الطالب إلى فصل آخر وفق قرار اللجنة"
		]
	],
	3: [
		D3_FIRST,
		[
			...D3_FIRST,
			"إنذار كتابي بالنقل إلى مدرسة أخرى عند التكرار وتوقيع ولي الأمر بالعلم",
			"تحويل إلى لجنة التوجيه الطلابي وفق تقرير الموجه",
			"نقل الطالب إلى فصل آخر وفق قرار اللجنة",
			"متابعة الحالة من الموجه الطلابي"
		],
		[
			...D3_FIRST,
			"رفع محضر لجنة التوجيه إلى إدارة التعليم رسمياً وبصفة عاجلة",
			"نقل الطالب إلى مدرسة أخرى بقرار مدير التعليم مع استمراره بالدراسة حتى النقل وأخذ رأي ولي الأمر، وإلا فأقرب مدرسة لمسكنه",
			"متابعة الحالة من الموجه الطلابي في المدرسة المنقول إليها"
		]
	],
	4: [
		D4_FIRST,
		[...D4_FIRST.filter((item) => item !== D4_CLASS_MOVE), ...D4_SECOND_EXTRA]
	],
	5: [[
		"تدوين محضر بالوقائع من إدارة المدرسة",
		"دعوة ولي الأمر وتبليغه بالمشكلة والإجراءات المترتبة",
		"حسم خمس عشرة درجة من السلوك مع تمكينه من فرص التعويض في المدرسة المنقول إليها وإشعار ولي الأمر",
		"اجتماع لجنة التوجيه الطلابي فور وقوع القضية لدراسة ظروفها",
		"متابعة الحالة من الموجه الطلابي وتقديم الخدمات التربوية",
		"رفع محضر اللجنة إلى إدارة التعليم رسمياً وبصفة عاجلة",
		D5_MOVE,
		"متابعة الحالة من الموجه الطلابي في المدرسة المنقول إليها",
		...ALL_SERIOUS
	]]
};
/** النسخة السابقة من الإجراءات؛ تُستبدل بالرسمية إن لم يخصصها مدير التطبيق. */
export const LEGACY_DEGREE_PROCEDURES: Record<number, string[][]> = {
	1: [
		["تنبيه شفهي أول بأسلوب تربوي"],
		["تنبيه شفهي ثانٍ", "ملاحظة الطالب وتعزيز السلوك الإيجابي"],
		[
			"تدوين المشكلة مع توقيع الطالب",
			"إشعار ولي الأمر هاتفياً",
			"حسم درجة واحدة من السلوك مع تمكينه من فرص التعويض",
			"تحويل إلى الموجه الطلابي"
		],
		[
			"دعوة ولي الأمر والاتفاق على خطة تعديل السلوك",
			"حسم درجة واحدة من السلوك مع فرص التعويض",
			"تحويل إلى لجنة التوجيه الطلابي"
		]
	],
	2: [
		[
			"إشعار ولي الأمر هاتفياً",
			"حسم درجتين من السلوك مع فرص التعويض",
			"تعهد خطي بعدم تكرار المخالفة",
			"تحويل إلى الموجه الطلابي"
		],
		[
			"دعوة ولي الأمر حضورياً",
			"برنامج وقائي مشترك مع الأسرة",
			"متابعة الحالة من الموجه الطلابي"
		],
		["نقل الطالب إلى فصل آخر وفق قرار اللجنة", "تحويل إلى لجنة التوجيه الطلابي"]
	],
	3: [
		[
			"دعوة ولي الأمر وأخذ تعهد خطي",
			"حسم ثلاث درجات من السلوك مع فرص التعويض",
			"الاعتذار إلى من أساء إليهم",
			"إصلاح ما أتلفه أو إحضار بديل",
			"مصادرة المواد الممنوعة",
			"تحويل إلى الموجه الطلابي"
		],
		[
			"إنذار كتابي بالنقل إلى مدرسة أخرى",
			"تحويل إلى لجنة التوجيه الطلابي",
			"نقل إلى فصل آخر وفق قرار اللجنة"
		],
		["رفع محضر اللجنة إلى إدارة التعليم بصفة عاجلة", "طلب نقل الطالب إلى مدرسة أخرى"]
	],
	4: [[
		"إحالة إلى لجنة التوجيه الطلابي",
		"دعوة ولي الأمر وأخذ تعهد خطي",
		"إنذار بالنقل إلى مدرسة أخرى",
		"حسم عشر درجات من السلوك مع فرص التعويض",
		"الاعتذار وإصلاح التلف",
		"نقل إلى فصل آخر وفق قرار اللجنة"
	], ["رفع محضر اللجنة إلى إدارة التعليم بصفة عاجلة", "طلب نقل الطالب إلى مدرسة أخرى"]],
	5: [[
		"تدوين محضر إثبات الواقعة",
		"دعوة ولي الأمر وتبليغه بالإجراءات",
		"حسم خمس عشرة درجة من السلوك",
		"اجتماع لجنة التوجيه الطلابي فوراً",
		"رفع المحضر إلى إدارة التعليم بصفة عاجلة",
		"طلب نقل الطالب إلى مدرسة أخرى"
	]]
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
	"أخرى"
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
	"صعوبات التعلم"
];
export const CASE_KINDS = [
	{ key: "health" as const, label: "حالة صحية" },
	{ key: "psych" as const, label: "حالة نفسية" },
	{ key: "learning" as const, label: "صعوبات تعلم" },
];
export type CaseKind = (typeof CASE_KINDS)[number]["key"];
export const FONT_SCALES = [
	{
		value: .9,
		label: "أصغر"
	},
	{
		value: 1,
		label: "عادي"
	},
	{
		value: 1.12,
		label: "أكبر"
	},
	{
		value: 1.25,
		label: "كبير"
	},
	{
		value: 1.4,
		label: "كبير جداً"
	}
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
	"أخرى"
];
export const IMPROVE_OPTIONS = [
	"الالتزام بالحضور في الوقت",
	"احترام المعلم",
	"احترام الزملاء",
	"إنجاز الواجبات",
	"الهدوء داخل الفصل",
	"الالتزام بالزي المدرسي",
	"عدم استخدام الجوال",
	"المشاركة الإيجابية في الحصة",
	"أخرى"
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
	"الجوف"
];
export const DEFAULT_TEACHER_PASSWORD = "1234";
export const DEFAULT_ADMIN_PHONE = "0505763155";
export const DEFAULT_ADMIN_PASSWORD = "1234";
export const DEFAULT_ADMIN_NAME = "مدير التطبيق";
export const WHATSAPP_TEMPLATES: Record<MessageKind, { title: string; body: string }> = {
	absence: {
		title: "إشعار غياب",
		body: "السلام عليكم ولي أمر الطالب {name}،\nنود إعلامكم بتغيّب ابنكم{session} يوم {weekday} بتاريخ {date} في صف {class}.\nنرجو المتابعة والتواصل مع إدارة المدرسة عند الحاجة.\n\n{school}"
	},
	late: {
		title: "إشعار تأخر",
		body: "السلام عليكم ولي أمر الطالب {name}،\nنود إعلامكم بتأخر ابنكم{session} يوم {weekday} بتاريخ {date} في صف {class}.\nنرجو الحرص على الحضور في الوقت المحدد.\n\n{school}"
	},
	homework: {
		title: "إشعار واجبات",
		body: "السلام عليكم ولي أمر الطالب {name}،\nنود إعلامكم بأن ابنكم لم يحل الواجب الدراسي{session} يوم {weekday} بتاريخ {date} في صف {class}.\nنرجو المتابعة في المنزل.\n\n{school}"
	},
	behavior: {
		title: "إشعار سلوكي",
		body: "السلام عليكم ولي أمر الطالب {name}،\nنود إعلامكم بتسجيل مخالفة سلوكية ({details}) على ابنكم{session} يوم {weekday} بتاريخ {date} في صف {class}.\nتكرار المخالفة: {repeat}.\n{deductionLine}\nنرجو التعاون مع إدارة المدرسة لمتابعة الموقف.\n\n{school}"
	},
	general: {
		title: "رسالة عامة",
		body: "السلام عليكم ولي أمر الطالب {name}،\nتحية طيبة من {school}.\n{details}\n\nشاكرين تعاونكم."
	}
};
export const DEFAULT_STAGES = [
	{
		name: "الصف الأول متوسط",
		shortName: "أولى",
		sortOrder: 1
	},
	{
		name: "الصف الثاني متوسط",
		shortName: "ثاني",
		sortOrder: 2
	},
	{
		name: "الصف الثالث متوسط",
		shortName: "ثالث",
		sortOrder: 3
	}
];
export const PROGRAM_ICON = "/app-logo.jpg";
const PROGRAM_ICON_PATHS = new Set(["/app-logo.jpg", "/brand-cap.png", "/brand-student.png"]);
export function schoolLogoSrc(url: string | undefined | null) {
	const value = String(url ?? "").trim();
	if (!value || PROGRAM_ICON_PATHS.has(value)) return "";
	return value;
}
function slot(key: string, label: string, fromH: number, fromM: number, toH: number, toM: number): PeriodSlot {
	const pad = (n: number) => String(n).padStart(2, "0");
	return {
		key,
		label,
		from: `${pad(fromH)}:${pad(fromM)}`,
		to: `${pad(toH)}:${pad(toM)}`,
		startMin: fromH * 60 + fromM,
		endMin: toH * 60 + toM
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
	slot("prayer", "الصلاة", 13, 0, 13, 15)
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
	slot("p7", "الحصة السابعة", 11, 50, 12, 35)
];
export const SEASON_LABEL: Record<Season, string> = {
	winter: "شتوي",
	summer: "صيفي"
};
export function scheduleFor(season: Season, custom?: SchoolSchedules | null): PeriodSlot[] {
	const fromSchool = custom?.[season];
	if (Array.isArray(fromSchool) && fromSchool.length > 0) return fromSchool;
	return season === "summer" ? SUMMER_SCHEDULE : WINTER_SCHEDULE;
}
export function currentPeriod(season: Season, date = new Date(), custom?: SchoolSchedules | null): PeriodSlot | null {
	const mins = date.getHours() * 60 + date.getMinutes();
	return scheduleFor(season, custom).find((s) => mins >= s.startMin && mins < s.endMin) ?? null;
}
export function periodLabel(key: string, season: Season, custom?: SchoolSchedules | null): string {
	if (!key) return "";
	const found = scheduleFor(season, custom).find((s) => s.key === key);
	if (!found) return key;
	return `${found.label} (${found.from}–${found.to})`;
}
export function periodShort(key: string, season: Season, custom?: SchoolSchedules | null): string {
	if (!key) return "—";
	return scheduleFor(season, custom).find((s) => s.key === key)?.label ?? key;
}
export function parseTimeToMin(value: string): number {
	const m = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
	if (!m) return 0;
	const h = Math.min(23, Math.max(0, Number(m[1])));
	const min = Math.min(59, Math.max(0, Number(m[2])));
	return h * 60 + min;
}
export function formatHm(min: number): string {
	const h = Math.floor(((min % (24 * 60)) + 24 * 60) % (24 * 60) / 60);
	const m = ((min % 60) + 60) % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
export function rebuildSlot(partial: { key: string; label: string; from: string; to: string }): PeriodSlot {
	const startMin = parseTimeToMin(partial.from);
	const endMin = parseTimeToMin(partial.to);
	return {
		key: String(partial.key || "").slice(0, 40) || "p",
		label: String(partial.label || "").slice(0, 40) || "حصة",
		from: formatHm(startMin),
		to: formatHm(endMin),
		startMin,
		endMin,
	};
}
export function parseSchedules(raw: unknown): SchoolSchedules {
	const fallback: SchoolSchedules = { winter: WINTER_SCHEDULE, summer: SUMMER_SCHEDULE };
	let value: unknown = raw;
	if (typeof raw === "string") {
		try { value = JSON.parse(raw); } catch { return fallback; }
	}
	if (!value || typeof value !== "object") return fallback;
	const obj = value as Record<string, unknown>;
	const parseList = (list: unknown, def: PeriodSlot[]): PeriodSlot[] => {
		if (!Array.isArray(list) || list.length === 0) return def;
		const out: PeriodSlot[] = [];
		for (const item of list) {
			if (!item || typeof item !== "object") continue;
			const it = item as Record<string, unknown>;
			const key = String(it.key ?? "").trim();
			const label = String(it.label ?? "").trim();
			if (!key || !label) continue;
			out.push(rebuildSlot({ key, label, from: String(it.from ?? ""), to: String(it.to ?? "") }));
		}
		return out.length ? out : def;
	};
	return { winter: parseList(obj.winter, WINTER_SCHEDULE), summer: parseList(obj.summer, SUMMER_SCHEDULE) };
}
export function degreeLabel(degree: number | null | undefined): string {
	if (!degree) return "";
	const map: Record<number, string> = {
		1: "الدرجة الأولى",
		2: "الدرجة الثانية",
		3: "الدرجة الثالثة",
		4: "الدرجة الرابعة",
		5: "الدرجة الخامسة"
	};
	return tr(map[degree] ?? String(degree));
}
/** يقسم المخالفة التي فيها «أو» إلى أصل ثابت وخيارات يُختار أحدها. */
export function behaviorOrParts(name: string): { base: string; options: string[] } | null {
	const raw = name.trim();
	if (!raw.includes("أو")) return null;
	const head = raw.split(/\s*،?\s*مثل:?\s*/)[0]?.trim() ?? raw;
	const chunks = head.split(/\s+أو\s+/);
	const parts = chunks.map((part) => part.replace(/^[،\s]+|[،\s]+$/g, "").trim()).filter(Boolean);
	if (parts.length < 2) return null;
	const first = parts[0] ?? "";
	const rest = parts.slice(1);
	const words = first.split(/\s+/).filter(Boolean);
	const commaEnded = /،\s*$/.test(chunks[0] ?? "");
	const prepAt = words.findIndex((word, index) => index > 0 && /^(داخل|في|أثناء|باستخدام)/.test(word));
	if (!commaEnded && prepAt > 0) {
		return {
			base: words.slice(0, prepAt).join(" "),
			options: [words.slice(prepAt).join(" "), ...rest],
		};
	}
	if (!commaEnded && rest.every((part) => part.split(/\s+/).length === 1) && words.length >= 2) {
		return {
			base: words.slice(0, -1).join(" "),
			options: [words[words.length - 1] ?? "", ...rest].filter(Boolean),
		};
	}
	if (words.length <= 2) {
		const long = rest.find((part) => part.split(/\s+/).length > words.length);
		const longWords = long?.split(/\s+/) ?? [];
		const suffixAt = longWords.findIndex((word, index) => index > 0 && /^(من|لل|دون)/.test(word));
		if (suffixAt > 0) {
			const suffix = longWords.slice(suffixAt).join(" ");
			return {
				base: "",
				options: parts.map((part) => (part.endsWith(suffix) ? part : `${part} ${suffix}`)),
			};
		}
	}
	return { base: "", options: parts };
}
export function behaviorChoiceText(base: string, option: string) {
	return [base.trim(), option.trim()].filter(Boolean).join(" ").replace(/\s+/g, " ");
}
export const DEGREE_DEDUCT: Record<number, string> = {
	1: "حسم درجة",
	2: "حسم درجتين",
	3: "حسم 3 درجات",
	4: "حسم 10 درجات",
	5: "حسم 15 درجة"
};
export function degreeTone(degree: number) {
	const tones: Record<number, string> = {
		1: "border-[#1b5c57] bg-[#e7f4f2] text-[#1b5c57]",
		2: "border-[#9a6700] bg-[#f7edd4] text-[#9a6700]",
		3: "border-[#c2410c] bg-[#ffedd5] text-[#c2410c]",
		4: "border-[#b42318] bg-[#f8e4e1] text-[#b42318]",
		5: "border-[#7f1d1d] bg-[#fee2e2] text-[#7f1d1d]"
	};
	return tones[degree] ?? tones[1];
}
/** مخالفات موجَّهة للمعلمين والإداريين ومن في حكمهم. */
export function isStaffViolation(item: { name?: string | null }) {
	return /المعلمين|الإداريين|منسوبي المدرسة|أحد منسوبي/.test(String(item.name ?? ""));
}
export function occurrenceLabel(n: number): string {
	if (n <= 1) return tr("المرة الأولى");
	if (n === 2) return tr("المرة الثانية");
	if (n === 3) return tr("المرة الثالثة");
	if (n === 4) return tr("المرة الرابعة");
	return `${tr("المرة")} ${n}`;
}
export function procedureStageLabel(n: number): string {
	const map = [
		"",
		"الإجراء الأول",
		"الإجراء الثاني",
		"الإجراء الثالث",
		"الإجراء الرابع",
		"الإجراء الخامس",
		"الإجراء السادس",
		"الإجراء السابع",
		"الإجراء الثامن"
	];
	if (n >= 1 && n < map.length) return tr(map[n]);
	return `${tr("الإجراء")} ${n}`;
}
export function parseProcedures(raw: unknown, degree?: number): string[][] {
	let value = raw;
	if (typeof raw === "string") try {
		value = JSON.parse(raw);
	} catch {
		value = [];
	}
	if (Array.isArray(value) && value.length) {
		const stages = value.map((stage) => Array.isArray(stage) ? stage.map((item) => String(item).trim()).filter(Boolean) : String(stage).trim() ? [String(stage).trim()] : []).filter((stage) => stage.length);
		if (stages.length) return stages;
	}
	const fallback = DEGREE_PROCEDURES[degree || 1] ?? DEGREE_PROCEDURES[1] ?? [];
	return fallback.map((stage: string[]) => [...stage]);
}
export function officialProcedures(degree?: number, audience?: string): string[][] {
	const table = audience === "staff" && STAFF_DEGREE_PROCEDURES[degree || 0]
		? STAFF_DEGREE_PROCEDURES[degree || 0]
		: DEGREE_PROCEDURES[degree || 1] ?? DEGREE_PROCEDURES[1] ?? [];
	return table.map((stage) => [...stage]);
}
export function procedureLadder(degree?: number, custom?: string[][]): string[][] {
	if (custom && custom.length) return custom.filter((stage) => stage.length);
	return parseProcedures([], degree);
}
export function stageIndexFor(occurrence: number, length: number): number {
	return Math.min(Math.max(occurrence, 1), Math.max(length, 1)) - 1;
}
export function proceduresFor(degree: number | null | undefined, occurrence: number, custom?: string[][]): string[] {
	const table = procedureLadder(degree ?? undefined, custom);
	return table[stageIndexFor(occurrence, table.length)] ?? table[table.length - 1] ?? [];
}
/** الدرجة الأولى: المرة الأولى والثانية تنبيه شفهي يغلقه المعلم، ومن الثالثة تُحال للوكيل. */
export function isTeacherVerbal(degree: number | null | undefined, occurrence: number) {
	return degree === 1 && occurrence >= 1 && occurrence <= 2;
}
export function studentNoun(gender: SchoolGender, plural = false): string {
	if (gender === "female") return plural ? "طالبات" : "طالبة";
	return plural ? "طلاب" : "طالب";
}
export function principalTitle(gender: SchoolGender): string {
	return gender === "female" ? "مديرة المدرسة" : "مدير المدرسة";
}
export function counselorTitle(gender: SchoolGender): string {
	return gender === "female" ? "وكيلة شؤون الطالبات" : "وكيل شؤون الطلاب";
}
export function withOccurrence<T extends { id?: number; type: string; createdAt: string; behaviorTypeId?: number | null; behaviorTypeName?: string | null }>(notes: T[]): (T & { occurrence: number })[] {
	const chrono = [...notes].sort((a, b) => {
		const t = a.createdAt.localeCompare(b.createdAt);
		return t !== 0 ? t : (a.id ?? 0) - (b.id ?? 0);
	});
	const counts = new Map();
	const occ = new Map();
	for (const n of chrono) {
		if (n.type !== "behavior") {
			occ.set(n, 1);
			continue;
		}
		const key = n.behaviorTypeId != null ? `id:${n.behaviorTypeId}` : `name:${n.behaviorTypeName ?? ""}`;
		const next = (counts.get(key) ?? 0) + 1;
		counts.set(key, next);
		occ.set(n, next);
	}
	return notes.map((n) => ({
		...n,
		occurrence: occ.get(n) ?? 1
	}));
}
export function hijriDate(iso?: string): string {
	const d = iso ? new Date(iso) : new Date();
	if (Number.isNaN(d.getTime())) return "";
	return new Intl.DateTimeFormat(uiLocale() === "en-GB" ? "en-GB-u-ca-islamic-umalqura" : "ar-SA-u-ca-islamic-umalqura", {
		day: "numeric",
		month: "long",
		year: "numeric"
	}).format(d);
}
export function classLabel(shortName: string, className: string): string {
	const left = String(shortName ?? "").trim();
	const right = String(className ?? "").trim();
	if (!left) return right;
	if (!right) return left;
	return `${left}/${right}`;
}
export function formatStamp(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return new Intl.DateTimeFormat(uiLocale(), {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit"
	}).format(d);
}
export function formatDay(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return new Intl.DateTimeFormat(uiLocale(), {
		day: "numeric",
		month: "long",
		year: "numeric"
	}).format(d);
}
export function toDatetimeLocalValue(iso?: string): string {
	const d = iso ? new Date(iso) : new Date();
	if (Number.isNaN(d.getTime())) return "";
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromDatetimeLocalValue(value: string): string {
	if (!value.trim()) return (new Date()).toISOString();
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? (new Date()).toISOString() : d.toISOString();
}
export function formatTime(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	return new Intl.DateTimeFormat(uiLocale(), {
		hour: "numeric",
		minute: "2-digit"
	}).format(d);
}
export function weekdayName(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	return new Intl.DateTimeFormat(uiLocale(), { weekday: "long" }).format(d);
}
export function todayLabel() {
	return new Intl.DateTimeFormat(uiLocale(), {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric"
	}).format(new Date());
}
export function fillTemplate(template: string, vars: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}
export function degreeDeductionLabel(degree?: number | null): string {
	const map: Record<number, string> = {
		1: "درجة واحدة",
		2: "درجتان",
		3: "3 درجات",
		4: "10 درجات",
		5: "15 درجة"
	};
	return degree && map[degree] ? map[degree] : "";
}
/** عبارة الخصم الظاهرة في رسالة ولي الأمر، بالرقم الواضح. */
export function deductionPhrase(lines: string[], degree?: number | null): string {
	const blob = lines.filter(Boolean).join("\n");
	const named: [RegExp, string][] = [
		[/خمس عشرة درجة|15 درجة/, "15 درجة"],
		[/عشر درجات|10 درجات/, "10 درجات"],
		[/ثلاث درجات|3 درجات/, "3 درجات"],
		[/درجتين|درجتان/, "درجتان"],
		[/درجة واحدة/, "درجة واحدة"]
	];
	if (/خصم|حسم/.test(blob)) {
		for (const [pattern, label] of named) {
			if (pattern.test(blob)) return label;
		}
		const numbered = blob.match(/حسم\s+(\d+)\s*درجات?/);
		if (numbered) {
			const n = Number(numbered[1]);
			if (n === 1) return "درجة واحدة";
			if (n === 2) return "درجتان";
			return `${n} درجات`;
		}
	}
	return degreeDeductionLabel(degree);
}
export function deductionMessageLine(lines: string[], degree?: number | null): string {
	const phrase = deductionPhrase(lines, degree);
	return phrase ? `الدرجات المخصومة من السلوك: ${phrase}.` : "";
}
/** أقرب يوم دراسي (الأحد–الخميس) بصيغة حقل التاريخ. */
export function nextSchoolDateInput(from = new Date()): string {
	const d = new Date(from);
	d.setHours(12, 0, 0, 0);
	d.setDate(d.getDate() + 1);
	while (d.getDay() === 5 || d.getDay() === 6) d.setDate(d.getDate() + 1);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function isWeekendDate(value: string): boolean {
	const d = new Date(`${value}T12:00:00`);
	return !Number.isNaN(d.getTime()) && (d.getDay() === 5 || d.getDay() === 6);
}
export function shiftToSchoolDay(value: string): string {
	const d = new Date(`${value}T12:00:00`);
	if (Number.isNaN(d.getTime())) return nextSchoolDateInput();
	while (d.getDay() === 5 || d.getDay() === 6) d.setDate(d.getDate() + 1);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Names stored by a shared group violation: `مخالفة مشتركة — المشتركون: …` */
export function sharedParticipantNames(details?: string | null): string[] {
	const text = String(details ?? "");
	const match = text.match(/المشتركون:\s*([^.]+)/);
	if (!match?.[1]) return [];
	return match[1]
		.split("،")
		.map((name) => name.trim())
		.filter(Boolean);
}

export function detailsWithoutSharedRoster(details?: string | null): string {
	const text = String(details ?? "");
	const kept = text
		.split(/(?:\s*[—\-]\s*)?مخالفة مشتركة\s*[—\-]\s*المشتركون:\s*[^.]+\.?\s*/)
		.map((part) => part.trim())
		.filter(Boolean);
	return kept.join(" — ").replace(/^[\s.،—\-]+|[\s.،—\-]+$/g, "").trim();
}

export function violationTextForMessage(details: string, sharedText?: string | null): string {
	const cleaned = detailsWithoutSharedRoster(details);
	const people = sharedParticipantNames(sharedText || details);
	if (cleaned) return cleaned;
	if (people.length) return "مخالفة مشتركة";
	return "";
}

const PARTICIPANT_LINE = /(?:\r?\n)+والمشاركون في هذه المخالفة المشتركة:[^\n]*/g;

export function withoutParticipantLine(text: string): string {
	return text.replace(PARTICIPANT_LINE, "").replace(/\n{3,}/g, "\n\n").trim();
}

export function withParticipantLine(text: string, names: string[]): string {
	const base = withoutParticipantLine(text);
	if (!names.length) return base;
	return `${base}\nوالمشاركون في هذه المخالفة المشتركة: ${names.join("، ")}`;
}
export function toWhatsAppNumber(phone: string): string {
	const digits = phone.replace(/\D/g, "");
	if (!digits) return "";
	if (digits.startsWith("966")) return digits;
	if (digits.startsWith("00")) return digits.slice(2);
	if (digits.startsWith("0")) return `966${digits.slice(1)}`;
	if (digits.startsWith("5") && digits.length === 9) return `966${digits}`;
	return digits;
}
export function normalizeSaudiPhone(phone: string): string {
	let digits = phone.replace(/\D/g, "");
	if (!digits) return "";
	if (digits.startsWith("00966")) digits = digits.slice(5);
	else if (digits.startsWith("966")) digits = digits.slice(3);
	if (digits.startsWith("5") && digits.length === 9) digits = `0${digits}`;
	return digits;
}
export function phoneToLoginEmail(input: string): string {
	const trimmed = input.trim().toLowerCase();
	if (!trimmed) return "";
	if (trimmed.includes("@")) return trimmed;
	const digits = normalizeSaudiPhone(trimmed);
	return digits ? `${digits}@mobile.school` : trimmed;
}
export function foldArabic(value: string): string {
	return value.replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, "").replace(/[^\u0600-\u06FFa-z0-9]/gi, "").toLowerCase();
}
export function toWesternDigits(value: unknown): string {
	return String(value ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}
/** Last number after a slash: "1/2" → "2", "أ/3" → "3", "الفصل 4" → "4". */
export function parseSectionName(raw: unknown): string {
	const western = toWesternDigits(String(raw ?? "").trim());
	if (!western) return "";
	const parts = western.split(/[/\\|:：\-–—]/);
	const last = (parts.length > 1 ? parts[parts.length - 1] : western).trim();
	const lastNums = last.match(/\d+/g);
	if (lastNums?.length) return String(Number(lastNums[lastNums.length - 1]));
	const allNums = western.match(/\d+/g);
	if (allNums?.length) return String(Number(allNums[allNums.length - 1]));
	return foldArabic(last || western);
}
/** 1/2/3 for أول/ثاني/ثالث متوسط. Bare "متوسط" is not a match. */
export function stageOrdinal(raw: unknown): number | null {
	const folded = foldArabic(toWesternDigits(String(raw ?? "")));
	if (!folded) return null;
	if (folded === "متوسط" || folded === "المتوست" || folded === "مرحله" || folded === "المرحله") return null;
	if (folded.includes("ثالث")) return 3;
	if (folded.includes("ثاني")) return 2;
	if (folded.includes("اول") || folded.includes("اولي")) return 1;
	const m = folded.match(/(?:صف|الصف)?(\d)(?:متوسط)?$/);
	if (m) {
		const n = Number(m[1]);
		if (n >= 1 && n <= 9) return n;
	}
	if (/^\d+$/.test(folded)) {
		const n = Number(folded);
		if (n >= 1 && n <= 9) return n;
	}
	return null;
}
export function canonicalStage(raw: string) {
	const ord = stageOrdinal(raw);
	if (ord == null) return null;
	return DEFAULT_STAGES.find((s) => s.sortOrder === ord) ?? null;
}
export function isOtherChoice(name: string): boolean {
	return foldArabic(name) === "اخري";
}
export function resolveOther(selected: string[], otherText: string): string[] {
	const extra = otherText.trim();
	return selected.map((s) => isOtherChoice(s) ? extra : s).filter((s) => s.length > 0 && !isOtherChoice(s));
}
export function noteTone(type: NoteType, status?: string): NoteTone {
	if (status === "closed") return "ok";
	return NOTE_META[type].tone;
}
export const IMPROVEMENT_STATUS: Record<ImprovementStatus, string> = {
	open: "بانتظار متابعة المرشد",
	following: "قيد المتابعة",
	closed: "أُنجزت"
};
export function messageKindLabel(kind: MessageKind): string {
	if (kind === "general") return "رسالة عامة";
	if (kind === "absence") return "غياب";
	if (kind === "late") return "تأخر";
	return NOTE_META[kind].label;
}
