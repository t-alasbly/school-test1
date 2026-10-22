// @ts-nocheck
import { inflateSync } from "node:zlib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { create as createFont } from "fontkit";

const AR = /[\u0600-\u06FF]/;

/** Noor prints this report with an empty ToUnicode map. Glyph ids live in the embedded Arial. */
function preferUnicode(unis) {
	const bases = unis.map((u) => {
		const n = String.fromCodePoint(u).normalize("NFKC");
		const chars = [...n];
		return chars.length === 1 ? chars[0].codePointAt(0) : u;
	});
	const standard = bases.filter(
		(b) => (b >= 0x0621 && b <= 0x063a) || (b >= 0x0641 && b <= 0x064a) || b === 0x0671,
	);
	return standard.length ? Math.min(...standard) : Math.min(...bases);
}

function gidMap(bytes) {
	const font = createFont(Buffer.from(bytes));
	const grouped = new Map();
	for (const cp of font.characterSet) {
		const id = font.glyphForCodePoint(cp).id;
		const list = grouped.get(id);
		if (list) list.push(cp);
		else grouped.set(id, [cp]);
	}
	const out = new Map();
	for (const [id, unis] of grouped) out.set(id, preferUnicode(unis));
	return out;
}

function extractFonts(buf) {
	const latin = Buffer.from(buf).toString("latin1");
	const re = /\/FontName\s*\/([^\s/]+)[\s\S]{0,500}?\/FontFile2\s+(\d+)\s+\d+\s+R/g;
	const fonts = new Map();
	let match;
	while ((match = re.exec(latin))) {
		const id = match[2];
		const idx = latin.indexOf(`${id} 0 obj`);
		if (idx < 0) continue;
		const streamAt = latin.indexOf("stream", idx);
		if (streamAt < 0) continue;
		let start = streamAt + 6;
		if (buf[start] === 13 && buf[start + 1] === 10) start += 2;
		else if (buf[start] === 10) start += 1;
		const end = latin.indexOf("endstream", start);
		if (end < 0) continue;
		let rawEnd = end;
		if (buf[rawEnd - 1] === 10) rawEnd -= 1;
		if (buf[rawEnd - 1] === 13) rawEnd -= 1;
		const bytes = inflateSync(buf.subarray(start, rawEnd));
		const key = match[1].replace(/^.*\+/, "");
		fonts.set(key, gidMap(bytes));
	}
	return fonts;
}

function logical(text) {
	const clean = text
		.normalize("NFKC")
		.replace(/[\u0000-\u001f\u00a0]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (!clean) return "";
	const words = clean
		.split(" ")
		.filter(Boolean)
		.map((part) => (AR.test(part) ? [...part].reverse().join("") : part));
	words.reverse();
	return words
		.join(" ")
		.replaceAll("هللا", "الله")
		.replaceAll("األ", "الأ")
		.replaceAll("اإل", "الإ")
		.replaceAll("اآل", "الآ");
}

function tidyName(name) {
	const parts = String(name ?? "")
		.replace(/\s+/g, " ")
		.trim()
		.split(" ")
		.filter(Boolean);
	const out = [];
	for (const part of parts) {
		if (out.length && [...part].length === 1 && AR.test(part)) out[out.length - 1] += part;
		else out.push(part);
	}
	return out.join(" ").replaceAll("هللا", "الله").replaceAll("عبداالله", "عبدالله").trim();
}

function decodeString(str, map) {
	let raw = "";
	for (const ch of str) {
		const code = ch.codePointAt(0);
		if (code < 32) {
			raw += " ";
			continue;
		}
		if (code < 128 || !map) {
			raw += ch;
			continue;
		}
		const uni = map.get(code);
		if (uni) raw += String.fromCodePoint(uni);
	}
	return logical(raw);
}

const FALLBACK_COLS = [
	["n", 725],
	["name", 684],
	["status", 635],
	["birthPlace", 586],
	["birthDate", 528],
	["nationality", 476],
	["nationalId", 427],
	["idDate", 372],
	["className", 326],
	["parent", 278],
	["home", 224],
	["work", 176],
	["relative", 127],
	["address", 77],
	["mobile", 0],
];

function columnsFromHeader(items, headerY) {
	const band = items.filter((it) => Math.abs(it.y - headerY) < 16 || (it.y < headerY && it.y > headerY - 18));
	const pick = (test) => band.find(test);
	const found = [
		["n", pick((it) => it.t === "م" && it.r > 700)],
		["name", pick((it) => it.t.includes("اسم الطالب"))],
		["status", pick((it) => it.t.includes("حالة"))],
		["birthPlace", pick((it) => it.t.includes("مكان"))],
		["birthDate", pick((it) => it.t.includes("تاريخ") && (it.t.includes("ميلاد") || it.t.includes("الميالد")) && !it.t.includes("رخص"))],
		["nationality", pick((it) => it.t.includes("جنسي"))],
		["nationalId", pick((it) => it.t.includes("رقم رخص"))],
		["idDate", pick((it) => it.t.includes("تاريخ رخص"))],
		["className", pick((it) => it.t === "الفصل" && it.r < 400 && it.r > 250)],
		["parent", pick((it) => it.t.includes("ولي"))],
		["home", pick((it) => it.t.includes("المنزل"))],
		["work", pick((it) => it.t.includes("العمل"))],
		["relative", pick((it) => it.t.includes("قريب"))],
		["address", pick((it) => it.t.includes("عنوان"))],
		["mobile", pick((it) => it.t.includes("جوال"))],
	].filter((entry) => entry[1]);
	if (found.length < 8) return FALLBACK_COLS.map(([key, floor]) => ({ key, floor }));
	found.sort((a, b) => b[1].r - a[1].r);
	return found.map((entry, index) => {
		const next = found[index + 1];
		const floor = next ? (entry[1].r + next[1].r) / 2 : 0;
		return { key: entry[0], floor };
	});
}

function colOf(r, cols) {
	for (const col of cols) if (r >= col.floor) return col.key;
	return "mobile";
}

function phoneOf(text) {
	let digits = String(text ?? "").replace(/\D/g, "");
	if (!digits) return "";
	if (digits.startsWith("00966")) digits = digits.slice(5);
	else if (digits.startsWith("966")) digits = digits.slice(3);
	if (digits.startsWith("5") && digits.length === 9) digits = `0${digits}`;
	if (digits.length > 10 && digits.startsWith("0")) return digits.slice(0, 10);
	return digits;
}

function readForm(items, headerY) {
	const top = items.filter((it) => it.y > headerY + 30 && it.x < 240);
	const stage = top.find((it) => it.t.includes("متوسط") && !it.t.includes("المتوسطة"))?.t ?? "";
	const label = top.find((it) => it.t === "الفصل");
	let className = "";
	if (label) {
		const near = top
			.filter((it) => Math.abs(it.y - label.y) < 4 && it.r <= label.x + 2 && /^\d+$/.test(it.t))
			.sort((a, b) => b.r - a.r);
		className = near[0]?.t ?? "";
	}
	return { stage, className };
}

/**
 * Read Noor «كشف الطلاب» (EL_StudentInfoReport).
 * Returns one row per student who is still enrolled (مستمر). Does not touch the database.
 */
export async function parseNoorStudentPdf(bytes) {
	const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
	const fonts = extractFonts(buf);
	if (!fonts.size) throw new Error("هذا الملف ليس كشف طلاب من نور، أو الخط الداخلي غير موجود");
	const doc = await getDocument({
		data: new Uint8Array(buf),
		disableWorker: true,
		isEvalSupported: false,
		verbosity: 0,
	}).promise;
	const students = [];
	let carry = { stage: "", className: "" };
	let cols = FALLBACK_COLS.map(([key, floor]) => ({ key, floor }));
	try {
		for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
			const page = await doc.getPage(pageNo);
			await page.getOperatorList();
			const content = await page.getTextContent();
			const fontOf = new Map();
			for (const item of content.items) {
				if (!item.fontName || fontOf.has(item.fontName)) continue;
				const font = page.commonObjs.has(item.fontName) ? page.commonObjs.get(item.fontName) : null;
				const key = String(font?.name ?? "").replace(/^.*\+/, "");
				fontOf.set(item.fontName, fonts.get(key) ?? null);
			}
			const items = [];
			for (const item of content.items) {
				if (!item.str) continue;
				const text = decodeString(item.str, fontOf.get(item.fontName));
				if (!text) continue;
				const x = item.transform[4];
				const y = item.transform[5];
				items.push({ t: text, x, y, r: x + (item.width || 0) });
			}
			const header = items.find((it) => it.t.includes("اسم الطالب") && it.r > 650);
			if (header) {
				cols = columnsFromHeader(items, header.y);
				const form = readForm(items, header.y);
				if (form.stage) carry.stage = form.stage;
				if (form.className) carry.className = form.className;
			}
			const body = header ? items.filter((it) => it.y < header.y - 8) : items.filter((it) => it.y > 24);
			const anchors = body
				.filter((it) => colOf(it.r, cols) === "n" && /^\d+$/.test(it.t))
				.sort((a, b) => b.y - a.y);
			for (let i = 0; i < anchors.length; i += 1) {
				const yTop = anchors[i].y + 10;
				const yBot = i + 1 < anchors.length ? (anchors[i].y + anchors[i + 1].y) / 2 : anchors[i].y - 18;
				const spans = body.filter((it) => it.y <= yTop && it.y > yBot).sort((a, b) => b.y - a.y);
				const bucket = {};
				for (const span of spans) {
					const key = colOf(span.r, cols);
					bucket[key] = bucket[key] ? `${bucket[key]} ${span.t}` : span.t;
				}
				const status = (bucket.status ?? "").replace(/\s+/g, " ").trim();
				if (!status.includes("مستمر")) continue;
				const name = tidyName(bucket.name ?? "");
				if ([...name.replace(/\s/g, "")].length < 4) continue;
				const nationalId = String(bucket.nationalId ?? "").replace(/\D/g, "");
				const mobile = phoneOf(bucket.mobile);
				const home = phoneOf(bucket.home);
				const work = phoneOf(bucket.work);
				const parentPhone = mobile;
				const parentPhone2 = home;
				const workPhone = work;
				if (!carry.stage || !carry.className) continue;
				students.push({
					name,
					parentPhone,
					parentPhone2,
					workPhone,
					nationalId: nationalId.length >= 8 ? nationalId.slice(0, 10) : "",
					nationality: tidyName(bucket.nationality ?? "").slice(0, 40),
					stageName: carry.stage,
					className: carry.className,
				});
			}
		}
	} finally {
		await doc.destroy();
	}
	return students;
}
