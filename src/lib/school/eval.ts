export const DEFAULT_EVAL_CARDS: { label: string; points: number; bucket: "tasks" | "quizzes" }[] = [
	{ label: "صح", points: 1, bucket: "quizzes" },
	{ label: "خطأ", points: -1, bucket: "quizzes" },
	{ label: "اتقن", points: 2, bucket: "quizzes" },
	{ label: "لم يتقن", points: -2, bucket: "quizzes" },
	{ label: "حفظ", points: 1, bucket: "quizzes" },
	{ label: "لم يحفظ", points: -1, bucket: "quizzes" },
	{ label: "حل الواجب", points: 0.5, bucket: "tasks" },
	{ label: "لم يحل", points: -0.5, bucket: "tasks" },
	{ label: "مميز", points: 2, bucket: "tasks" },
	{ label: "مشاغب", points: -2, bucket: "tasks" },
	{ label: "مؤدب", points: 1, bucket: "tasks" },
	{ label: "لا مبالاة", points: -1, bucket: "tasks" },
	{ label: "تطبيق عملي", points: 5, bucket: "tasks" },
	{ label: "النوم", points: -0.5, bucket: "tasks" },
	{ label: "إنجاز مشروع", points: 2, bucket: "tasks" },
	{ label: "التحدث", points: -1, bucket: "tasks" },
	{ label: "نسيان الكتاب", points: -0.5, bucket: "tasks" }
];

const SHORT_LABEL: Record<string, string> = {
	"لم يحل الواجب": "لم يحل",
	"النوم في الحصة": "النوم",
	"التحدث أثناء الدرس": "التحدث"
};

/** أزواج البطاقة: الموجب يمين والسالب يسار في واجهة عربية. */
export const EVAL_PAIRS: [string, string][] = [
	["صح", "خطأ"],
	["اتقن", "لم يتقن"],
	["حفظ", "لم يحفظ"],
	["حل الواجب", "لم يحل"],
	["مميز", "مشاغب"],
	["مؤدب", "لا مبالاة"],
	["تطبيق عملي", "النوم"],
	["إنجاز مشروع", "التحدث"]
];

export function shortEvalLabel(label: string) {
	return SHORT_LABEL[label] ?? label;
}

export function clampScore(value: number, max: number) {
	if (!Number.isFinite(value)) return 0;
	return Math.min(max, Math.max(0, value));
}

export function scoreBand(percent: number) {
	if (percent >= 90) return "ممتاز";
	if (percent >= 80) return "جيد جداً";
	if (percent >= 70) return "جيد";
	if (percent >= 60) return "مقبول";
	return "ضعيف";
}

export function formatPoints(value: number) {
	const n = Math.round(value * 10) / 10;
	return Number.isInteger(n) ? String(n) : String(n);
}