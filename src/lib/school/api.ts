// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import {
  DEFAULT_ACTION_TYPES,
  DEFAULT_HEALTH_CONDITIONS,
  COMPENSATION_OPTIONS,
  IMPROVE_OPTIONS,
  DEFAULT_STUDY_NOTES,
  LEGACY_STUDY_NOTES,
  ROLE_LABEL,
  DEFAULT_ADMIN_NAME,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_PHONE,
  DEFAULT_PRINT_MARGINS,
  DEFAULT_SCHOOL_NAME,
  DEFAULT_STAGES,
  DEFAULT_TEACHER_PASSWORD,
  parsePrintMargins,
  parseSchedules,
  NOTE_META,
  formatSubjects,
  parseSubjects,
  OFFICIAL_BEHAVIOR_TYPES,
  LEGACY_DEGREE_PROCEDURES,
  SHORT_DEGREE_PROCEDURES,
  INTERIM_DEGREE_PROCEDURES,
  STAFF_DEGREE_PROCEDURES,
  DEGREE_PROCEDURES,
  officialProcedures,
  classLabel,
  foldArabic,
  canonicalStage,
  parseSectionName,
  stageOrdinal,
  normalizeSaudiPhone,
  occurrenceLabel,
  parseProcedures,
  phoneToLoginEmail,
  procedureLadder,
  proceduresFor,
  isTeacherVerbal,
  withOccurrence,
} from "./constants";
import { DEFAULT_EVAL_CARDS, clampScore } from "./eval";
import * as transliterateModule from "./transliterate";
import { parsePermissions, defaultPermissions } from "./permissions";
import { parseAppearance, parseOptionalAppearance } from "./theme";
import type {
  NoteType,
  School,
  SchoolGender,
  Season,
  StaffRole,
} from "./types";

function mapGender(value) {
	return value === "female" ? "female" : "male";
}
function mapSchool(school) {
	return {
		id: school.id,
		name: school.name,
		principalName: school.principal_name,
		season: school.season === "summer" ? "summer" : "winter",
		region: school.region ?? "",
		governorate: school.governorate ?? "",
		leadershipGender: mapGender(school.leadership_gender),
		studentGender: mapGender(school.student_gender),
		counselorName: school.counselor_name ?? "",
		technicalVpName: school.technical_vp_name ?? "",
		logoUrl: school.logo_url ?? "",
		extraLogoUrl: school.extra_logo_url ?? "",
		tagline: school.tagline ?? "",
		printMargins: parsePrintMargins(school.print_margins ?? school.printMargins),
		printSchoolLogo: Boolean(school.print_school_logo),
		schedules: parseSchedules(school.schedules),
		messageTemplates: parseMessageTemplates(school.message_templates),
		customMessages: parseCustomMessages(school.custom_messages),
		teachersCanMessage: school.teachers_can_message !== false,
		teachersCanViewAll: Boolean(school.teachers_can_view_all),
		appearance: parseAppearance(school.appearance),
		statCounters: parseStatCounters(school.stat_counters ?? school.statCounters),
		statHidden: parseStatHidden(school.stat_hidden ?? school.statHidden)
	};
}
function parseMessageTemplates(raw) {
	let value = raw;
	if (typeof raw === "string") try {
		value = JSON.parse(raw);
	} catch {
		return {};
	}
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value;
}
function parseCustomMessages(raw) {
	let value = raw;
	if (typeof raw === "string") try {
		value = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(value)) return [];
	return value.filter((item) => item && typeof item.title === "string" && typeof item.body === "string").map((item) => ({
		id: String(item.id || "").slice(0, 40),
		title: String(item.title).trim().slice(0, 80),
		body: String(item.body).trim().slice(0, 2e3)
	})).filter((item) => item.id && item.title.length >= 2 && item.body.length >= 4);
}
function parseStatCounters(raw) {
	let value = raw;
	if (typeof raw === "string") try {
		value = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(value)) return [];
	const sources = new Set(["daily-absence","daily-late","note-absence","note-late","homework","behavior"]);
	const ranges = new Set(["today","week","month","total"]);
	return value.filter((item) => item && typeof item.title === "string" && sources.has(item.source)).map((item) => ({
		id: String(item.id || "").slice(0, 40),
		title: String(item.title).trim().slice(0, 40),
		source: item.source,
		range: ranges.has(item.range) ? item.range : "today"
	})).filter((item) => item.id && item.title.length >= 2).slice(0, 12);
}
function parseStatHidden(raw) {
	let value = raw;
	if (typeof raw === "string") try {
		value = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(value)) return [];
	return value.filter((item) => typeof item === "string" && item.trim()).map((item) => String(item).slice(0, 40)).slice(0, 40);
}
async function loadSchool(sql, schoolId) {
	const row = (await sql`
    select id, name, coalesce(principal_name, '') as principal_name,
           coalesce(season, 'winter') as season,
           coalesce(region, '') as region,
           coalesce(governorate, '') as governorate,
           coalesce(leadership_gender, 'male') as leadership_gender,
           coalesce(student_gender, 'male') as student_gender,
           coalesce(counselor_name, '') as counselor_name,
           coalesce(technical_vp_name, '') as technical_vp_name,
           coalesce(logo_url, '') as logo_url,
           coalesce(message_templates::text, '{}') as message_templates,
           coalesce(teachers_can_message, true) as teachers_can_message,
           coalesce(teachers_can_view_all, false) as teachers_can_view_all,
           coalesce(appearance::text, '{}') as appearance
    from schools where id = ${schoolId}
  `)[0] ?? null;
	if (!row) return null;
	let tagline = "";
	let print_margins = DEFAULT_PRINT_MARGINS;
	let extra_logo_url = "";
	let custom_messages = "[]";
	let print_school_logo = false;
	let schedules = "{}";
	try {
		await sql`alter table schools add column if not exists print_school_logo boolean not null default false`;
	} catch {}
	try {
		await sql`alter table schools add column if not exists schedules jsonb not null default '{}'::jsonb`;
	} catch {}
	try {
		const extra = (await sql`
      select coalesce(tagline, '') as tagline, coalesce(print_margins::text, '{}') as print_margins,
             coalesce(extra_logo_url, '') as extra_logo_url,
             coalesce(custom_messages::text, '[]') as custom_messages,
             coalesce(print_school_logo, false) as print_school_logo,
             coalesce(schedules::text, '{}') as schedules
      from schools where id = ${schoolId}
    `)[0];
		tagline = extra?.tagline ?? "";
		print_margins = extra?.print_margins ?? DEFAULT_PRINT_MARGINS;
		extra_logo_url = extra?.extra_logo_url ?? "";
		custom_messages = extra?.custom_messages ?? "[]";
		print_school_logo = Boolean(extra?.print_school_logo);
		schedules = extra?.schedules ?? "{}";
	} catch {
		try {
			const extra = (await sql`
        select coalesce(tagline, '') as tagline, coalesce(print_margins::text, '{}') as print_margins
        from schools where id = ${schoolId}
      `)[0];
			tagline = extra?.tagline ?? "";
			print_margins = extra?.print_margins ?? DEFAULT_PRINT_MARGINS;
		} catch {
			try {
				tagline = (await sql`
          select coalesce(tagline, '') as tagline from schools where id = ${schoolId}
        `)[0]?.tagline ?? "";
			} catch {
				tagline = "";
			}
		}
	}
	let stat_counters = "[]";
	let stat_hidden = "[]";
	try {
		await sql`alter table schools add column if not exists stat_counters jsonb not null default '[]'::jsonb`;
		stat_counters = (await sql`select coalesce(stat_counters::text, '[]') as stat_counters from schools where id = ${schoolId}`)[0]?.stat_counters ?? "[]";
	} catch {}
	try {
		await sql`alter table schools add column if not exists stat_hidden jsonb not null default '[]'::jsonb`;
		stat_hidden = (await sql`select coalesce(stat_hidden::text, '[]') as stat_hidden from schools where id = ${schoolId}`)[0]?.stat_hidden ?? "[]";
	} catch {}
	return {
		...row,
		tagline,
		print_margins,
		extra_logo_url,
		custom_messages,
		print_school_logo,
		schedules,
		stat_counters,
		stat_hidden
	};
}
async function getStaff(sql, userId) {
	try {
		return (await sql`
    select user_id, school_id, display_name, role,
           coalesce(subject, '') as subject, coalesce(phone, '') as phone,
           coalesce(permissions::text, '{}') as permissions,
           coalesce(appearance::text, '{}') as appearance,
           coalesce(active, true) as active
    from staff
    where user_id = ${userId}
  `)[0] ?? null;
	} catch {
		const row = (await sql`
    select user_id, school_id, display_name, role,
           coalesce(subject, '') as subject, coalesce(phone, '') as phone,
           coalesce(permissions::text, '{}') as permissions,
           coalesce(appearance::text, '{}') as appearance
    from staff
    where user_id = ${userId}
  `)[0] ?? null;
		return row ? {
			...row,
			active: true
		} : null;
	}
}
function mappedPerms(staff, school) {
	return parsePermissions(staff.permissions, staff.role, mapSchool(school));
}
function revealPhone(staff, school, phone) {
	const perms = mappedPerms(staff, school);
	return perms.sendMessages || perms.editStudents ? phone ?? "" : "";
}
async function ensureNoteThread(sql) {
	try {
		await sql.query(`alter table notes add column if not exists dest text not null default 'vp'`);
	} catch {}
	try {
		await sql.query(`alter table notes add column if not exists subject text not null default ''`);
	} catch {}
	try {
		await sql.query(`create table if not exists note_messages (
      id serial primary key,
      school_id integer not null,
      note_id integer not null,
      author_id text not null,
      to_kind text not null default 'vp',
      body text not null,
      created_at timestamptz not null default now()
    )`);
	} catch {}
	try {
		await sql.query(`create index if not exists note_messages_note_idx on note_messages (note_id, created_at)`);
	} catch {}
}
async function ensureStaffMail(sql) {
	try {
		await sql.query(`create table if not exists student_mail (
      id serial primary key,
      school_id integer not null,
      student_id integer not null,
      author_id text not null,
      assignee_id text not null,
      dest text not null default 'vp',
      status text not null default 'open',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);
	} catch {}
	try {
		await sql.query(`create table if not exists student_mail_msg (
      id serial primary key,
      school_id integer not null,
      mail_id integer not null,
      author_id text not null,
      kind text not null default 'message',
      body text not null,
      created_at timestamptz not null default now()
    )`);
	} catch {}
	try {
		await sql.query(`create index if not exists student_mail_school_idx on student_mail (school_id, updated_at desc)`);
	} catch {}
	try {
		await sql.query(`create index if not exists student_mail_student_idx on student_mail (student_id, updated_at desc)`);
	} catch {}
	try {
		await sql.query(`create index if not exists student_mail_msg_mail_idx on student_mail_msg (mail_id, created_at)`);
	} catch {}
}
function cannotViewAll(staff, school) {
	return !mappedPerms(staff, school).viewAllViolations;
}
function mapStaffPublic(staff, school) {
	return {
		userId: staff.user_id,
		schoolId: staff.school_id,
		displayName: staff.display_name,
		role: staff.role,
		subject: staff.subject,
		phone: staff.phone,
		permissions: mappedPerms(staff, school),
		appearance: parseOptionalAppearance(staff.appearance)
	};
}
async function requirePerm(userId, perm) {
	const ctx = await requireApproved(userId);
	const permissions = mappedPerms(ctx.staff, ctx.school);
	if (ctx.staff.role !== "admin" && !permissions[perm]) throw new Error("ليست لديك هذه الصلاحية");
	return {
		...ctx,
		permissions
	};
}
async function requireApproved(userId) {
	const sql = await getSql();
	await ensureStudentEnglish(sql);
	const staff = await getStaff(sql, userId);
	if (!staff || staff.role === "pending") throw new Error("لا تملك صلاحية الوصول بعد");
	if (staff.active === false) throw new Error("تم إلغاء هذا الحساب. راجع مدير التطبيق.");
	const school = await loadSchool(sql, staff.school_id);
	if (!school) throw new Error("المدرسة غير موجودة");
	try {
		await sql.query(`alter table notes add column if not exists entered_by text not null default ''`);
		await sql.query(`alter table student_evals add column if not exists entered_by text not null default ''`);
	} catch {}
	return {
		sql,
		staff,
		school
	};
}
function canOpenDesk(staff, school) {
	return staff.role === "admin" || mappedPerms(staff, school).viewAllViolations;
}
async function requireDesk(userId) {
	const ctx = await requireApproved(userId);
	const actor = ctx.staff;
	let id = "";
	try {
		const { getCookie } = await import("@tanstack/react-start/server");
		id = String(getCookie("desk_as") || "").trim();
	} catch {}
	if (!id || id === actor.user_id || !canOpenDesk(actor, ctx.school)) return { ...ctx, actor };
	const row = (await ctx.sql`select * from staff where user_id = ${id} and school_id = ${actor.school_id}`)[0];
	if (!row || row.role === "pending" || row.active === false) return { ...ctx, actor };
	return { sql: ctx.sql, staff: row, school: ctx.school, actor };
}
export const setDeskTarget = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	staffId: z.string().max(80)
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	if (!canOpenDesk(staff, school)) throw new Error("ليست لديك صلاحية فتح المكاتب");
	const id = data.staffId.trim();
	if (id) {
		const row = (await sql`select user_id from staff where user_id = ${id} and school_id = ${staff.school_id}`)[0];
		if (!row) throw new Error("المستخدم غير موجود");
	}
	const { setCookie } = await import("@tanstack/react-start/server");
	setCookie("desk_as", id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: id ? 60 * 60 * 12 : 0 });
	return { ok: true };
});
let studentEnglishReady = false;
function toEnglishName(name) {
	const fn = transliterateModule.transliterateArabicName;
	if (typeof fn !== "function") return "";
	try {
		return fn(String(name ?? "")) || "";
	} catch {
		return "";
	}
}
async function ensureStudentEnglish(sql) {
	if (studentEnglishReady) return;
	await sql.query(`alter table students add column if not exists name_en text not null default ''`);
	const missing = await sql`select id, name from students where coalesce(name_en, '') = '' limit 800`;
	for (const row of missing) {
		const english = toEnglishName(row.name);
		if (!english) continue;
		await sql`update students set name_en = ${english} where id = ${row.id} and coalesce(name_en, '') = ''`;
	}
	studentEnglishReady = true;
}
function englishName(name, given) {
	const typed = typeof given === "string" ? given.trim() : "";
	if (typed) return typed.slice(0, 120);
	return toEnglishName(name).slice(0, 120);
}
async function requireAdmin(userId) {
	const ctx = await requireApproved(userId);
	if (ctx.staff.role !== "admin") throw new Error("هذه الصفحة مخصصة لمدير التطبيق");
	return ctx;
}
async function ensureCatalog(sql, schoolId, table, defaults) {
	if (((await sql.query(`select count(*)::int as count from ${table} where school_id = $1`, [schoolId]))[0]?.count ?? 0) > 0) return;
	for (let i = 0; i < defaults.length; i += 1) await sql.query(`insert into ${table} (school_id, name, sort_order, active) values ($1, $2, $3, true)`, [
		schoolId,
		defaults[i],
		i + 1
	]);
}
async function ensureBehaviorTypes(sql, schoolId) {
	const existing = await sql.query(`select id, name, coalesce(degree, 1)::int as degree, procedures
     from behavior_types where school_id = $1`, [schoolId]);
	const byName = new Map(existing.map((row) => [row.name, row]));
	const used = new Set();
	let order = 0;
	for (const item of OFFICIAL_BEHAVIOR_TYPES) {
		order += 1;
		let row = byName.get(item.name);
		if (!row) {
			for (const alias of item.aliases ?? []) {
				const candidate = byName.get(alias);
				if (candidate && !used.has(candidate.id)) {
					row = candidate;
					break;
				}
			}
		}
		const ladder = officialProcedures(item.degree, item.audience);
		if (row) {
			used.add(row.id);
			await sql.query(`update behavior_types set name = $1, degree = $2, sort_order = $3 where id = $4`, [
				item.name,
				item.degree,
				order,
				row.id,
			]);
			const raw = row.procedures;
			const parsed = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return []; } })() : raw;
			const stages = Array.isArray(parsed) ? parsed : [];
			const stocks = [
				LEGACY_DEGREE_PROCEDURES[item.degree],
				SHORT_DEGREE_PROCEDURES[item.degree],
				INTERIM_DEGREE_PROCEDURES[item.degree],
				DEGREE_PROCEDURES[item.degree],
				STAFF_DEGREE_PROCEDURES[item.degree]
			].filter(Boolean);
			const stored = JSON.stringify(stages);
			const empty = stages.length === 0;
			const stock = stocks.some((entry) => JSON.stringify(entry) === stored);
			if ((empty || stock) && stored !== JSON.stringify(ladder)) {
				await sql.query(`update behavior_types set procedures = $1::jsonb where id = $2`, [JSON.stringify(ladder), row.id]);
			}
		} else {
			const inserted = await sql.query(`insert into behavior_types (school_id, name, sort_order, active, degree, procedures)
       values ($1, $2, $3, true, $4, $5::jsonb) returning id`, [
				schoolId,
				item.name,
				order,
				item.degree,
				JSON.stringify(ladder),
			]);
			if (inserted[0]?.id) used.add(inserted[0].id);
		}
	}
	let extra = order;
	const officialNames = new Set(OFFICIAL_BEHAVIOR_TYPES.map((item) => item.name));
	const aliasNames = new Set(OFFICIAL_BEHAVIOR_TYPES.flatMap((item) => item.aliases ?? []));
	for (const row of existing) {
		if (used.has(row.id)) continue;
		if (officialNames.has(row.name) || aliasNames.has(row.name)) {
			await sql.query(`update behavior_types set active = false where id = $1`, [row.id]);
			continue;
		}
		extra += 1;
		await sql.query(`update behavior_types set sort_order = $1 where id = $2`, [extra, row.id]);
	}
}
async function ensureActionTypes(sql, schoolId) {
	await ensureCatalog(sql, schoolId, "action_types", DEFAULT_ACTION_TYPES);
}
async function ensureHealthConditions(sql, schoolId) {
	try {
		await ensureCatalog(sql, schoolId, "health_conditions", DEFAULT_HEALTH_CONDITIONS);
	} catch {}
}
async function ensureCompensations(sql, schoolId) {
	try {
		await ensureCatalog(sql, schoolId, "compensation_options", COMPENSATION_OPTIONS);
	} catch {}
}
async function ensureImproveOptions(sql, schoolId) {
	try {
		await ensureCatalog(sql, schoolId, "improvement_options", IMPROVE_OPTIONS);
	} catch {}
}
async function ensureStudyNotes(sql, schoolId) {
	try {
		await sql.query(`create table if not exists study_notes (
      id serial primary key,
      school_id integer not null,
      name text not null,
      sort_order integer not null default 0,
      active boolean not null default true,
      unique (school_id, name)
    )`);
		await sql.query(`alter table notes add column if not exists study_note_id integer`);
		await ensureCatalog(sql, schoolId, "study_notes", DEFAULT_STUDY_NOTES);
		for (const name of LEGACY_STUDY_NOTES) {
			await sql.query(`update study_notes set active = false where school_id = $1 and name = $2`, [schoolId, name]);
		}
		for (let i = 0; i < DEFAULT_STUDY_NOTES.length; i += 1) {
			const name = DEFAULT_STUDY_NOTES[i];
			const found = (await sql.query(`select id from study_notes where school_id = $1 and name = $2 limit 1`, [schoolId, name]))[0];
			if (found) {
				await sql.query(`update study_notes set sort_order = $1, active = true where id = $2`, [i + 1, found.id]);
			} else {
				await sql.query(`insert into study_notes (school_id, name, sort_order, active) values ($1, $2, $3, true)`, [schoolId, name, i + 1]);
			}
		}
	} catch {}
}
function canManageImproveCatalog(staff, school) {
	if (staff.role === "admin") return true;
	const perms = mappedPerms(staff, school);
	return Boolean(perms.counseling || perms.acceptImprovements);
}
function mapCatalog(rows) {
	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		sortOrder: r.sort_order,
		active: r.active,
		degree: r.degree
	}));
}
function mapBehaviorTypes(rows) {
	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		sortOrder: r.sort_order,
		active: r.active,
		degree: r.degree,
		procedures: parseProcedures(r.procedures, r.degree)
	}));
}
async function listCatalogRows(sql, schoolId, table, activeOnly = false) {
	const sqlText = activeOnly ? `select id, name, sort_order, active from ${table}
         where school_id = $1 and active = true order by sort_order, id` : `select id, name, sort_order, active from ${table}
         where school_id = $1 order by sort_order, id`;
	return mapCatalog(await sql.query(sqlText, [schoolId]));
}
async function listBehaviorTypeRows(sql, schoolId, activeOnly = false) {
	const sqlText = activeOnly ? `select id, name, sort_order, active, coalesce(degree, 1)::int as degree,
              procedures
         from behavior_types
         where school_id = $1 and active = true order by sort_order, id` : `select id, name, sort_order, active, coalesce(degree, 1)::int as degree,
              procedures
         from behavior_types
         where school_id = $1 order by sort_order, id`;
	return mapBehaviorTypes(await sql.query(sqlText, [schoolId]));
}
async function listActionTypeRows(sql, schoolId, activeOnly = false) {
	return listCatalogRows(sql, schoolId, "action_types", activeOnly);
}
async function listClassOptions(sql, schoolId) {
	return (await sql`
    select c.id, c.stage_id, st.name as stage_name, c.name, st.short_name,
      (select count(*)::int from students s where s.class_id = c.id) as student_count,
      (select count(*)::int from daily_attendance a
         join students s on s.id = a.student_id
         where s.class_id = c.id and a.school_id = c.school_id
           and a.day = current_date and a.kind = 'absence') as absence_today,
      (select count(*)::int from daily_attendance a
         join students s on s.id = a.student_id
         where s.class_id = c.id and a.school_id = c.school_id
           and a.day = current_date and a.kind = 'late') as late_today
    from classes c
    join stages st on st.id = c.stage_id
    where c.school_id = ${schoolId}
      and exists (select 1 from students s where s.class_id = c.id)
    order by st.sort_order, c.sort_order
  `).map((r) => ({
		id: r.id,
		stageId: r.stage_id,
		stageName: r.stage_name,
		name: r.name,
		shortName: r.short_name,
		label: classLabel(r.short_name, r.name),
		studentCount: r.student_count ?? 0,
		absenceToday: r.absence_today ?? 0,
		lateToday: r.late_today ?? 0
	}));
}
async function seedSchool(sql, schoolId) {
	await ensureBehaviorTypes(sql, schoolId);
	await ensureActionTypes(sql, schoolId);
}
async function ensureSchoolAndAdmin(sql) {
	const phone = normalizeSaudiPhone(DEFAULT_ADMIN_PHONE);
	const email = phoneToLoginEmail(phone);
	const name = DEFAULT_ADMIN_NAME;
	const schools = await sql`select id from schools order by id limit 1`;
	let user = (await sql`select id from "user" where email = ${email}`)[0];
	if (!user) {
		const id = randomBytes(16).toString("hex");
		const hashed = await hashPassword(DEFAULT_ADMIN_PASSWORD);
		await sql`
      insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
      values (${id}, ${name}, ${email}, true, now(), now())
    `;
		await sql`
      insert into "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
      values (${id}, ${id}, ${"credential"}, ${id}, ${hashed}, now(), now())
    `;
		user = { id };
	} else if (!(await sql`
      select id from "account" where "userId" = ${user.id} and "providerId" = 'credential'
    `)[0]) {
		const hashed = await hashPassword(DEFAULT_ADMIN_PASSWORD);
		await sql`
      insert into "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
      values (${user.id}, ${user.id}, ${"credential"}, ${user.id}, ${hashed}, now(), now())
    `;
	}
	let schoolId = schools[0]?.id;
	if (!schoolId) {
		schoolId = (await sql`
      insert into schools (name, created_by)
      values (${DEFAULT_SCHOOL_NAME}, ${user.id})
      returning id
    `)[0].id;
		await seedSchool(sql, schoolId);
	}
	if (!(await sql`
    select user_id from staff where user_id = ${user.id} and school_id = ${schoolId}
  `)[0]) await sql`
      insert into staff (user_id, school_id, display_name, role, subject, phone)
      values (${user.id}, ${schoolId}, ${name}, 'admin', '', ${phone})
    `;
	else await sql`
      update staff
      set role = 'admin', phone = ${phone}
      where user_id = ${user.id} and school_id = ${schoolId}
    `;
}
async function ensureStaffRoleConstraint(sql) {
	if (ensureStaffRoleConstraint.done) return;
	try {
		await sql`alter table staff drop constraint if exists staff_role_check`;
		await sql`alter table staff add constraint staff_role_check
      check (role in (
        'admin','principal','school_vp','teachers_vp','counselor',
        'student_counselor','health_counselor','activity_leader','teacher',
        'security','admin_assistant','admin_staff','pending'
      ))`;
		ensureStaffRoleConstraint.done = true;
	} catch {}
}
export const ensureAppReady = createServerFn({ method: "GET" }).handler(async () => {
	const sql = await getSql();
	await ensureStaffRoleConstraint(sql);
	await ensureSchoolAndAdmin(sql);
	let name = "";
	let logoUrl = "";
	let tagline = "";
	try {
		const row = (await sql`
      select name, coalesce(logo_url, '') as logo_url, coalesce(tagline, '') as tagline
      from schools order by id limit 1
    `)[0];
		name = row?.name ?? "";
		logoUrl = row?.logo_url ?? "";
		tagline = row?.tagline ?? "";
	} catch {}
	return {
		ok: true,
		name,
		logoUrl,
		tagline
	};
});
export const reportLoginHelp = createServerFn({ method: "POST" }).validator(z.object({
	name: z.string().min(2).max(80),
	phone: z.string().min(5).max(40)
})).handler(async ({ data }) => {
	const sql = await getSql();
	await ensureSchoolAndAdmin(sql);
	const school = (await sql`select id from schools order by id limit 1`)[0];
	if (!school) throw new Error("تعذر الإرسال");
	const name = data.name.trim();
	const raw = data.phone.trim();
	const phone = normalizeSaudiPhone(raw) || raw;
	const email = phoneToLoginEmail(raw);
	const recent = (await sql`
    select id from notifications
    where school_id = ${school.id} and kind = 'login-help'
      and body like ${`%${phone.replace(/[%_]/g, "")}%`}
      and created_at > now() - interval '15 minutes'
    limit 1
  `)[0];
	if (recent) return { ok: true };
	const found = (await sql`
    select st.display_name, coalesce(st.active, true) as active
    from staff st
    left join "user" u on u.id = st.user_id
    where st.school_id = ${school.id}
      and (st.phone = ${phone} or u.email = ${email})
    limit 1
  `)[0];
	const status = !found
		? "غير مسجّل في النظام"
		: found.active === false
			? `مسجّل باسم ${found.display_name} والحساب موقوف`
			: `مسجّل باسم ${found.display_name} وتعذر دخوله`;
	const title = "تعذر دخول مستخدم";
	const body = `الاسم: ${name}\nالجوال: ${phone}\n${status}`;
	const admins = await sql`
    select user_id from staff
    where school_id = ${school.id} and role = 'admin' and coalesce(active, true) = true
  `;
	for (const admin of admins) {
		await sql`
      insert into notifications (school_id, user_id, kind, title, body, tone)
      values (${school.id}, ${admin.user_id}, ${"login-help"}, ${title}, ${body}, ${"warn"})
    `;
	}
	return { ok: true };
});
async function listStageSummaries(sql, schoolId, teacherId) {
	return (teacherId ? await sql`
        select
          s.id,
          s.name,
          s.short_name,
          s.sort_order,
          (select count(*)::int from classes c where c.stage_id = s.id) as class_count,
          (select count(*)::int from students st
             join classes c on c.id = st.class_id
             where c.stage_id = s.id) as student_count,
          (select count(*)::int from notes n
             join students st on st.id = n.student_id
             join classes c on c.id = st.class_id
             where c.stage_id = s.id and n.status = 'open' and n.teacher_id = ${teacherId}) as open_notes
        from stages s
        where s.school_id = ${schoolId}
        order by s.sort_order
      ` : await sql`
        select
          s.id,
          s.name,
          s.short_name,
          s.sort_order,
          (select count(*)::int from classes c where c.stage_id = s.id) as class_count,
          (select count(*)::int from students st
             join classes c on c.id = st.class_id
             where c.stage_id = s.id) as student_count,
          (select count(*)::int from notes n
             join students st on st.id = n.student_id
             join classes c on c.id = st.class_id
             where c.stage_id = s.id and n.status = 'open') as open_notes
        from stages s
        where s.school_id = ${schoolId}
        order by s.sort_order
      `).map((r) => ({
		id: r.id,
		name: r.name,
		shortName: r.short_name,
		sortOrder: r.sort_order,
		classCount: r.class_count,
		studentCount: r.student_count,
		openNotes: r.open_notes
	}));
}
export const getWorkspace = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const sql = await getSql();
	await ensureStaffRoleConstraint(sql);
	await ensureSchoolAndAdmin(sql);
	const userId = context.userId;
	const users = await sql`
      select name, email from "user" where id = ${userId}
    `;
	const displayName = users[0]?.name?.trim() || users[0]?.email || "عضو هيئة التعليم";
	let staff = await getStaff(sql, userId);
	if (!staff) {
		const existing = await sql`select id, name from schools order by id limit 1`;
		if (existing[0]) await sql`
          insert into staff (user_id, school_id, display_name, role)
          values (${userId}, ${existing[0].id}, ${displayName}, 'pending')
        `;
		staff = await getStaff(sql, userId);
	}
	if (!staff) throw new Error("تعذر تجهيز الحساب");
	if (staff.active === false) throw new Error("تم إلغاء هذا الحساب. راجع مدير التطبيق.");
	try {
		const stages = await sql`select id, name, short_name from stages where school_id = ${staff.school_id}`;
		const byOrd = { 1: "أولى", 2: "ثاني", 3: "ثالث" };
		for (const s of stages) {
			const ord = stageOrdinal(s.name) ?? stageOrdinal(s.short_name);
			if (!ord || !byOrd[ord]) continue;
			const western = String(s.short_name ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
			if (western === String(ord) && s.short_name !== byOrd[ord]) {
				await sql`update stages set short_name = ${byOrd[ord]} where id = ${s.id} and school_id = ${staff.school_id}`;
			}
		}
	} catch {}
	const school = await loadSchool(sql, staff.school_id);
	if (!school) throw new Error("المدرسة غير موجودة");
	const pending = staff.role === "pending";
	const hideOthers = cannotViewAll(staff, school) && !mappedPerms(staff, school).editRecords;
	const stages = pending ? [] : (await listStageSummaries(sql, school.id, hideOthers ? staff.user_id : void 0)).filter((s) => s.studentCount > 0);
	const classes = pending ? [] : await listClassOptions(sql, school.id);
	if (!pending) {
		await ensureBehaviorTypes(sql, school.id);
		await ensureActionTypes(sql, school.id);
		await ensureHealthConditions(sql, school.id);
		await ensureCompensations(sql, school.id);
		await ensureImproveOptions(sql, school.id);
		await ensureStudyNotes(sql, school.id);
		await ensureStaffMail(sql);
	}
	const behaviorTypes = pending ? [] : await listBehaviorTypeRows(sql, school.id, true);
	const actionTypes = pending ? [] : await listActionTypeRows(sql, school.id, true);
	let healthConditions = [];
	let compensations = [];
	let improvementOptions = [];
	let studyNotes = [];
	if (!pending) {
		try {
			healthConditions = await listCatalogRows(sql, school.id, "health_conditions", true);
		} catch {
			healthConditions = [];
		}
		try {
			compensations = await listCatalogRows(sql, school.id, "compensation_options", true);
		} catch {
			compensations = [];
		}
		try {
			improvementOptions = await listCatalogRows(sql, school.id, "improvement_options", true);
		} catch {
			improvementOptions = [];
		}
		try {
			studyNotes = await listCatalogRows(sql, school.id, "study_notes", true);
		} catch {
			studyNotes = [];
		}
	}
	return {
		staff: mapStaffPublic(staff, school),
		school: mapSchool(school),
		stages,
		classes,
		behaviorTypes,
		actionTypes,
		healthConditions,
		compensations,
		improvementOptions,
		studyNotes
	};
});
export const getStagePage = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ stageId: z.number() })).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	const hideOthers = cannotViewAll(staff, school) && !mappedPerms(staff, school).editRecords;
	const stage = (await sql`
      select id, name, short_name from stages
      where id = ${data.stageId} and school_id = ${staff.school_id}
    `)[0];
	if (!stage) throw new Error("المرحلة غير موجودة");
	const list = (hideOthers ? await sql`
          select
            c.id, c.stage_id, c.name, c.sort_order,
            (select count(*)::int from students s where s.class_id = c.id) as student_count,
            (select count(*)::int from notes n
               join students s on s.id = n.student_id
               where s.class_id = c.id and n.status = 'open' and n.teacher_id = ${staff.user_id}) as open_notes
          from classes c
          where c.stage_id = ${stage.id} and c.school_id = ${staff.school_id}
          order by c.sort_order
        ` : await sql`
          select
            c.id, c.stage_id, c.name, c.sort_order,
            (select count(*)::int from students s where s.class_id = c.id) as student_count,
            (select count(*)::int from notes n
               join students s on s.id = n.student_id
               where s.class_id = c.id and n.status = 'open') as open_notes
          from classes c
          where c.stage_id = ${stage.id} and c.school_id = ${staff.school_id}
          order by c.sort_order
        `).map((c) => ({
		id: c.id,
		stageId: c.stage_id,
		name: c.name,
		sortOrder: c.sort_order,
		studentCount: c.student_count,
		openNotes: c.open_notes
	}));
	return {
		stage: {
			id: stage.id,
			name: stage.name,
			shortName: stage.short_name
		},
		classes: list
	};
});
function subjectMatches(noteSubject, teacherSubject, wanted) {
	const direct = String(noteSubject ?? "").trim();
	if (direct) return direct === wanted;
	return parseSubjects(teacherSubject).includes(wanted);
}
async function subjectHandoffForClass(sql, staff, classId) {
	try {
		await sql`alter table staff_timetable add column if not exists subject text not null default ''`;
	} catch {}
	const listed = parseSubjects(staff.subject);
	const cells = await sql`
    select coalesce(subject, '') as subject from staff_timetable
    where staff_id = ${staff.user_id} and school_id = ${staff.school_id} and class_id = ${classId}
  `;
	const taught = new Set();
	for (const cell of cells) {
		const name = String(cell.subject ?? "").trim();
		if (name) taught.add(name);
		else if (listed.length === 1) taught.add(listed[0]);
	}
	if (!taught.size) return [];
	const rows = await sql`
    select coalesce(n.subject, '') as subject, coalesce(sf.subject, '') as teacher_subject
    from notes n
    join students s on s.id = n.student_id
    left join staff sf on sf.user_id = n.teacher_id and sf.school_id = n.school_id
    where s.class_id = ${classId} and n.school_id = ${staff.school_id} and n.teacher_id <> ${staff.user_id}
  `;
	const counts = new Map();
	for (const row of rows) {
		for (const name of taught) {
			if (!subjectMatches(row.subject, row.teacher_subject, name)) continue;
			counts.set(name, (counts.get(name) ?? 0) + 1);
		}
	}
	return [...counts.entries()].filter(([, count]) => count > 0).map(([subject, count]) => ({ subject, count }));
}
export const claimClassSubjectNotes = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	classId: z.number(),
	subject: z.string().min(1).max(40)
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireApproved(context.userId);
	await ensureNoteThread(sql);
	const subject = data.subject.trim();
	const listed = parseSubjects(staff.subject);
	if (listed.length && !listed.includes(subject)) throw new Error("هذه المادة ليست من موادك");
	const rows = await sql`
    select n.id, coalesce(n.subject, '') as subject, coalesce(sf.subject, '') as teacher_subject
    from notes n
    join students s on s.id = n.student_id
    left join staff sf on sf.user_id = n.teacher_id and sf.school_id = n.school_id
    where s.class_id = ${data.classId} and s.school_id = ${staff.school_id}
      and n.school_id = ${staff.school_id} and n.teacher_id <> ${staff.user_id}
  `;
	const ids = rows.filter((row) => subjectMatches(row.subject, row.teacher_subject, subject)).map((row) => row.id);
	if (!ids.length) return { ok: true, count: 0 };
	await sql.query(
		`update notes set teacher_id = $1, subject = $2 where school_id = $3 and id = any($4::int[])`,
		[staff.user_id, subject, staff.school_id, ids],
	);
	return { ok: true, count: ids.length };
});
export const getClassPage = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	classId: z.number(),
	period: z.string().max(20).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	const desk = await requireDesk(context.userId);
	const teacherId = desk.staff.user_id;
	await ensureNoteThread(sql);
	await ensureStudentProfile(sql);
	const row = (await sql`
      select c.id, c.name, c.stage_id, st.name as stage_name, st.short_name
      from classes c
      join stages st on st.id = c.stage_id
      where c.id = ${data.classId} and c.school_id = ${staff.school_id}
    `)[0];
	if (!row) throw new Error("الفصل غير موجود");
	const students = await sql`
      select s.id, s.name, coalesce(s.name_en, '') as name_en,
             coalesce(nullif(s.parent_phone, ''), nullif(s.parent_phone_2, ''), '') as parent_phone,
             coalesce(s.health_note, '') as health_note,
             a.kind as daily_kind, a.arrived_at::text as arrived_at
      from students s
      left join lateral (
        select kind, arrived_at
        from daily_attendance
        where student_id = s.id and school_id = s.school_id and day = current_date and kind in ('absence', 'late')
        order by case kind when 'absence' then 0 else 1 end
        limit 1
      ) a on true
      where s.class_id = ${row.id} and s.school_id = ${staff.school_id}
      order by s.roster_order nulls last, s.id
    `;
	const notes = await sql`
      select n.id, n.student_id, n.teacher_id, n.type, n.status, n.details,
             bt.name as behavior_type_name,
             bt.degree as behavior_degree,
             coalesce(n.period_key, '') as period_key,
             n.action_taken,
             n.created_at::text as created_at,
             coalesce(n.occurred_at, n.created_at)::text as occurred_at,
             coalesce(n.refer_counselor, false) as refer_counselor,
             coalesce(sf.display_name, '') as teacher_name,
             coalesce(nullif(n.subject, ''), sf.subject, '') as teacher_subject,
             coalesce(actor.display_name, '') as entered_by_name
      from notes n
      join students s on s.id = n.student_id
      left join behavior_types bt on bt.id = n.behavior_type_id
      left join staff sf on sf.user_id = n.teacher_id
      left join staff actor on actor.user_id = n.entered_by
      where s.class_id = ${row.id}
        and n.school_id = ${staff.school_id}
        and n.created_at >= current_date
    `;
	const byStudent = new Map();
	for (const n of notes) {
		const list = byStudent.get(n.student_id) ?? [];
		list.push({
			id: n.id,
			type: n.type,
			status: n.status,
			details: n.details,
			behaviorTypeName: n.behavior_type_name,
			behaviorDegree: n.behavior_degree,
			periodKey: n.period_key,
			actionTaken: n.action_taken,
			createdAt: n.created_at,
			occurredAt: n.occurred_at || n.created_at,
			teacherId: n.teacher_id,
			teacherName: n.teacher_name,
			teacherSubject: n.teacher_subject,
			enteredByName: n.entered_by_name || "",
			referCounselor: Boolean(n.refer_counselor)
		});
		byStudent.set(n.student_id, list);
	}
	for (const list of byStudent.values()) list.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
	const period = data.period || "";
	await ensureTeacherEval(sql);
	const markRows = await sql`
    select e.student_id, coalesce(nullif(e.subject, ''), '') as subject,
           coalesce(sum(e.points), 0) as total,
           coalesce(sum(e.points) filter (where (e.created_at at time zone 'Asia/Riyadh')::date = (now() at time zone 'Asia/Riyadh')::date), 0) as lesson
    from student_evals e
    join students s on s.id = e.student_id
    where e.school_id = ${staff.school_id} and e.staff_id = ${teacherId} and s.class_id = ${row.id}
    group by e.student_id, coalesce(nullif(e.subject, ''), '')
  `;
	const tapRows = await sql`
    select e.student_id, e.label, e.points, coalesce(nullif(e.subject, ''), '') as subject
    from student_evals e
    join students s on s.id = e.student_id
    where e.school_id = ${staff.school_id} and e.staff_id = ${teacherId} and s.class_id = ${row.id}
      and (e.created_at at time zone 'Asia/Riyadh')::date = (now() at time zone 'Asia/Riyadh')::date
      and (${period} = '' or e.lesson_key = ${period} or e.lesson_key = '')
    order by e.id desc
  `;
	const marksOf = new Map();
	for (const mark of markRows) {
		const list = marksOf.get(Number(mark.student_id)) ?? [];
		list.push({ subject: mark.subject || "", total: Number(mark.total) || 0, lesson: Number(mark.lesson) || 0 });
		marksOf.set(Number(mark.student_id), list);
	}
	const tapsOf = new Map();
	for (const tap of tapRows) {
		const list = tapsOf.get(Number(tap.student_id)) ?? [];
		list.push({ label: tap.label, points: Number(tap.points) || 0, subject: tap.subject || "" });
		tapsOf.set(Number(tap.student_id), list);
	}
	const studentRows = students.map((s) => ({
		id: s.id,
		name: s.name,
		nameEn: s.name_en ?? "",
		parentPhone: revealPhone(staff, school, s.parent_phone),
		classId: row.id,
		healthNote: s.health_note ?? "",
		dailyKind: s.daily_kind ?? null,
		arrivedAt: s.arrived_at || null,
		todayNotes: byStudent.get(s.id) ?? [],
		marks: marksOf.get(Number(s.id)) ?? [],
		todayTaps: tapsOf.get(Number(s.id)) ?? []
	}));
	return {
		classInfo: {
			id: row.id,
			name: row.name,
			stageId: row.stage_id,
			stageName: row.stage_name,
			shortName: row.short_name,
			label: classLabel(row.short_name, row.name)
		},
		students: studentRows,
		subjectHandoff: await subjectHandoffForClass(sql, staff, row.id).catch(() => [])
	};
});
var noteTypeSchema = z.enum([
	"absence",
	"late",
	"homework",
	"behavior"
]);
export const previewBehaviorOccurrence = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	studentId: z.number(),
	behaviorTypeId: z.number()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireApproved(context.userId);
	const count = (await sql`
      select count(*)::int as count from notes
      where school_id = ${staff.school_id}
        and student_id = ${data.studentId}
        and type = 'behavior'
        and behavior_type_id = ${data.behaviorTypeId}
    `)[0]?.count ?? 0;
	return { next: count + 1 };
});
export const previewStudyOccurrence = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	studentIds: z.array(z.number()).min(1).max(80),
	studyNoteId: z.number().optional(),
	details: z.string().max(200).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireApproved(context.userId);
	await ensureStudyNotes(sql, staff.school_id);
	let studyName = "";
	if (data.studyNoteId) {
		const row = (await sql`
      select name from study_notes
      where id = ${data.studyNoteId} and school_id = ${staff.school_id} and active = true
    `)[0];
		if (!row) throw new Error("الملاحظة الدراسية غير موجودة");
		studyName = row.name;
	}
	const text = (data.details ?? "").trim();
	const students = [];
	for (const studentId of data.studentIds) {
		const prior = data.studyNoteId
			? (await sql`
          select count(*)::int as count from notes
          where school_id = ${staff.school_id} and student_id = ${studentId}
            and type = 'homework' and study_note_id = ${data.studyNoteId}
        `)[0]?.count ?? 0
			: (await sql`
          select count(*)::int as count from notes
          where school_id = ${staff.school_id} and student_id = ${studentId}
            and type = 'homework' and study_note_id is null and details = ${text}
        `)[0]?.count ?? 0;
		const next = Number(prior) + 1;
		students.push({ studentId, next, stage: Math.min(next, 4) });
	}
	const stage = students.reduce((max, row) => Math.max(max, row.stage), 1);
	return { students, stage, name: studyName || text };
});
const exitKindSchema = z.enum(["bathroom", "cafeteria", "counselor", "vice"]);
async function ensureExitPermits(sql) {
	await sql.query(`create table if not exists exit_permits (
    id serial primary key,
    school_id integer not null,
    student_id integer not null,
    class_id integer,
    staff_id text not null,
    kind text not null,
    created_at timestamptz not null default now()
  )`);
}
export const grantExitPermit = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	studentId: z.number(),
	kind: exitKindSchema
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireApproved(context.userId);
	await ensureExitPermits(sql);
	const student = (await sql`
    select id, class_id from students
    where id = ${data.studentId} and school_id = ${staff.school_id}
  `)[0];
	if (!student) throw new Error("الطالب غير موجود");
	const row = (await sql`
    insert into exit_permits (school_id, student_id, class_id, staff_id, kind)
    values (${staff.school_id}, ${student.id}, ${student.class_id}, ${staff.user_id}, ${data.kind})
    returning id, kind, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
  `)[0];
	return { id: row.id, studentId: student.id, kind: row.kind, createdAt: row.created_at };
});
export const listActiveExitPermits = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requireApproved(context.userId);
	await ensureExitPermits(sql);
	const rows = await sql`
    select distinct on (p.student_id) p.student_id, p.kind, s.name as student_name,
           to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
    from exit_permits p
    join students s on s.id = p.student_id
    where p.school_id = ${staff.school_id}
      and p.created_at > now() - interval '15 minutes'
    order by p.student_id, p.created_at desc
  `;
	return rows.map((row) => ({
		studentId: row.student_id,
		studentName: row.student_name,
		kind: row.kind,
		createdAt: row.created_at
	}));
});
export const listTodayMarks = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requireApproved(context.userId);
	const rows = await sql`
    select student_id,
           case
             when bool_or(kind = 'absence') then 'absence'
             when bool_or(kind = 'late') then 'late'
             else 'leave'
           end as kind
    from (
      select student_id, kind
      from daily_attendance
      where school_id = ${staff.school_id}
        and day = current_date
        and kind in ('absence', 'late', 'leave')
      union all
      select student_id, type as kind
      from notes
      where school_id = ${staff.school_id}
        and type in ('absence', 'late')
        and coalesce(occurred_at, created_at)::date = current_date
    ) marks
    group by student_id
  `;
	return rows.map((row) => ({ studentId: row.student_id, kind: row.kind }));
});
export const createNote = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	studentId: z.number(),
	type: noteTypeSchema,
	details: z.string().max(500).optional(),
	behaviorTypeId: z.number().optional(),
	periodKey: z.string().max(40).optional(),
	occurredAt: z.string().max(40).optional(),
	referCounselor: z.boolean().optional(),
	dest: z.enum(["vp", "counselor", "health"]).optional(),
	suggestedAction: z.string().max(800).optional(),
	compensation: z.string().max(400).optional(),
	studyNoteId: z.number().optional(),
	deduction: z.number().min(0).max(30).optional(),
	subject: z.string().max(40).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school, actor: recorder } = await requireDesk(context.userId);
	const actorId = recorder?.user_id || staff.user_id;
	const recorderName = recorder?.display_name || staff.display_name;
	const recordedByOther = actorId !== staff.user_id;
	await ensureNoteThread(sql);
	const student = (await sql`
      select s.id, s.name, s.class_id, coalesce(nullif(s.parent_phone, ''), nullif(s.parent_phone_2, ''), '') as parent_phone,
             c.name as class_name, st.short_name, st.name as stage_name
      from students s
      join classes c on c.id = s.class_id
      join stages st on st.id = c.stage_id
      where s.id = ${data.studentId} and s.school_id = ${staff.school_id}
    `)[0];
	if (!student) throw new Error("الطالب غير موجود");
	let behaviorTypeId = null;
	let behaviorName = null;
	let behaviorDegree = null;
	if (data.type === "behavior") {
		if (!data.behaviorTypeId) throw new Error("اختر نوع المخالفة السلوكية");
		const types = await sql`
        select id, name, coalesce(degree, 1)::int as degree from behavior_types
        where id = ${data.behaviorTypeId} and school_id = ${staff.school_id} and active = true
      `;
		if (!types[0]) throw new Error("نوع المخالفة غير صالح");
		behaviorTypeId = types[0].id;
		behaviorName = types[0].name;
		behaviorDegree = types[0].degree;
	}
	const periodKey = data.periodKey?.trim() ?? "";
	const occurredAt = data.occurredAt?.trim() ? new Date(data.occurredAt).toISOString() : (/* @__PURE__ */ new Date()).toISOString();
	if (Number.isNaN(Date.parse(occurredAt))) throw new Error("وقت المخالفة غير صالح");
	const listed = parseSubjects(staff.subject);
	let lessonSubject = (data.subject ?? "").trim().slice(0, 40);
	if (listed.length === 1) lessonSubject = listed[0];
	if (!lessonSubject && periodKey) {
		const day = new Date(occurredAt).getDay();
		if (day >= 0 && day <= 4) {
			try {
				await sql`alter table staff_timetable add column if not exists subject text not null default ''`;
				const cell = (await sql`
        select coalesce(subject, '') as subject from staff_timetable
        where staff_id = ${staff.user_id} and school_id = ${staff.school_id}
          and day = ${day} and period_key = ${periodKey}
      `)[0];
				if (cell?.subject) lessonSubject = String(cell.subject).trim();
			} catch {}
		}
	}
	if (listed.length > 1 && !listed.includes(lessonSubject)) throw new Error("اختر المادة");
	if (listed.length === 0) lessonSubject = lessonSubject || "";
	const suggested = data.suggestedAction?.trim() ?? "";
	const compensation = data.compensation?.trim() ?? "";
	let studyPlan = null;
	if (data.type === "homework") {
		await ensureStudyNotes(sql, staff.school_id);
		let studyNoteId = null;
		let studyName = "";
		if (data.studyNoteId) {
			const row = (await sql`
        select id, name from study_notes
        where id = ${data.studyNoteId} and school_id = ${staff.school_id} and active = true
      `)[0];
			if (!row) throw new Error("الملاحظة الدراسية غير موجودة");
			studyNoteId = row.id;
			studyName = row.name;
		}
		const extra = (data.details ?? "").trim();
		const storedDetails = studyName ? extra && extra !== studyName ? `${studyName} — ${extra}` : studyName : extra;
		if (storedDetails.length < 2) throw new Error("اختر الملاحظة الدراسية");
		const prior = studyNoteId ? (await sql`
        select count(*)::int as count from notes
        where school_id = ${staff.school_id} and student_id = ${student.id}
          and type = 'homework' and study_note_id = ${studyNoteId}
      `)[0]?.count ?? 0 : (await sql`
        select count(*)::int as count from notes
        where school_id = ${staff.school_id} and student_id = ${student.id}
          and type = 'homework' and study_note_id is null and details = ${storedDetails}
      `)[0]?.count ?? 0;
		const next = Number(prior) + 1;
		const stage = Math.min(next, 4);
		const actions = ["تم التنبيه الفردي", "إرسال إشعار لولي الأمر", "حسم من درجات المادة", "إحالة للموجه الطلابي"];
		let deduction = null;
		if (stage === 3) {
			deduction = Number(data.deduction);
			if (!(deduction > 0) || deduction > 30) throw new Error("حدد الدرجة المخصومة من أعمال السنة");
		}
		studyPlan = { studyNoteId, studyName, storedDetails, next, stage, action: actions[stage - 1], deduction };
	}
	const dest = studyPlan?.stage === 4 ? "counselor" : "vp";
	const refer = studyPlan?.stage === 4;
	const noteDetails = studyPlan?.storedDetails ?? (data.details?.trim() ?? "");
	const noteId = (await sql`
      insert into notes (school_id, student_id, teacher_id, type, details, behavior_type_id, period_key, occurred_at, refer_counselor, suggested_action, compensation, dest, subject, entered_by)
      values (${staff.school_id}, ${student.id}, ${staff.user_id}, ${data.type}, ${noteDetails}, ${behaviorTypeId}, ${periodKey}, ${occurredAt}, ${refer}, ${suggested}, ${compensation}, ${dest}, ${lessonSubject}, ${actorId})
      returning id
    `)[0]?.id ?? null;
	const meta = NOTE_META[data.type];
	let label = behaviorName ? `${meta.label} (${behaviorName})` : studyPlan ? `${meta.label} (${studyPlan.studyName || studyPlan.storedDetails})` : meta.label;
	let occurrence = 1;
	if (data.type === "behavior" && behaviorTypeId) occurrence = (await sql`
        select count(*)::int as count from notes
        where school_id = ${staff.school_id}
          and student_id = ${student.id}
          and type = 'behavior'
          and behavior_type_id = ${behaviorTypeId}
      `)[0]?.count ?? 1;
	if (studyPlan) occurrence = studyPlan.next;
	let handled = "vp";
	let whatsapp = null;
	let transferred = false;
	if (studyPlan && noteId) {
		const actionTaken = studyPlan.stage === 3 ? `${studyPlan.action}: ${studyPlan.deduction}` : studyPlan.action;
		const needsMessage = studyPlan.stage === 2 || studyPlan.stage === 3;
		const canSendNow = Boolean(mappedPerms(staff, school).sendMessages);
		const subject = lessonSubject || "المادة";
		const place = classLabel(student.short_name, student.class_name);
		const noteName = studyPlan.studyName || studyPlan.storedDetails;
		const message = !needsMessage ? "" : studyPlan.stage === 2
			? `السلام عليكم ولي أمر الطالب ${student.name}،\nنود إعلامكم بتكرار ملاحظة دراسية (${noteName}) في ${subject}، صف ${place}.\nنرجو المتابعة مع ابنكم.\n${school.name}`
			: `السلام عليكم ولي أمر الطالب ${student.name}،\nبسبب تكرار (${noteName}) في ${subject} تم حسم من درجات أعمال السنة، وليس من درجة السلوك.\nالدرجات المخصومة من أعمال السنة: ${studyPlan.deduction}.\nصف ${place}.\n${school.name}`;
		const phone = student.parent_phone || "";
		if (needsMessage && !canSendNow) {
			transferred = true;
			const deductionNote = studyPlan.stage === 3 ? `حسم ${studyPlan.deduction} من أعمال السنة` : "";
			await sql`
        update notes
        set study_note_id = ${studyPlan.studyNoteId},
            status = 'open',
            refer_counselor = false,
            dest = 'counselor',
            suggested_action = ${studyParentDraft(message)},
            compensation = ${deductionNote}
        where id = ${noteId} and school_id = ${staff.school_id}
      `;
			handled = "study";
			label = `${label} — ${studyPlan.action}`;
			await notifyDeskInbox(sql, school, staff, {
				noteId,
				studentId: student.id,
				kind: "study-message",
				title: "ملاحظة دراسية بانتظار الإرسال",
				body: `ملاحظة على الطالب ${student.name}: ${studyPlan.storedDetails}. بانتظار إرسال إشعار ولي الأمر من المرشد الطلابي أو وكيل شؤون الطلاب.`,
				tone: "warn"
			});
		} else if (recordedByOther) {
			await sql`
        update notes
        set study_note_id = ${studyPlan.studyNoteId},
            status = 'open',
            dest = 'vp',
            suggested_action = ${studyPlan.action}
        where id = ${noteId} and school_id = ${staff.school_id}
      `;
			handled = "study";
			label = `${label} — بانتظار المختص`;
			await notifyDeskInbox(sql, school, staff, {
				noteId,
				studentId: student.id,
				kind: "study-message",
				title: "ملاحظة بانتظار إجراء المختص",
				body: `ملاحظة على الطالب ${student.name}: ${studyPlan.storedDetails}. الإجراء يتم من حساب المختص أو صاحب الصلاحية.`,
				tone: "warn"
			});
		} else {
			await sql`
        update notes
        set study_note_id = ${studyPlan.studyNoteId},
            status = 'closed',
            action_taken = ${actionTaken},
            closed_at = now(),
            closed_by = ${staff.user_id}
        where id = ${noteId} and school_id = ${staff.school_id}
      `;
			handled = "study";
			label = `${label} — ${studyPlan.action}`;
			if (needsMessage && phone) {
				try {
					await sql.query(`alter table parent_messages add column if not exists note_id integer`);
					await sql`
            insert into parent_messages (school_id, student_id, staff_id, kind, body, parent_phone, note_id)
            values (${staff.school_id}, ${student.id}, ${staff.user_id}, ${"homework"}, ${message}, ${phone}, ${noteId})
          `;
					whatsapp = { phone, body: message };
				} catch {}
			}
			if (studyPlan.stage === 4) {
				try {
					await sql`
            insert into counseling_cases (school_id, student_id, author_id, kind, body)
            values (${staff.school_id}, ${student.id}, ${actorId}, ${"learning"}, ${`إحالة دراسية — ${studyPlan.storedDetails}. سجّلها ${recorderName}.`})
          `;
				} catch {}
			}
			const sentNote = needsMessage && whatsapp ? " — وأُرسل إشعار ولي الأمر" : needsMessage ? " — دون رقم ولي أمر" : "";
			await notifyActionSplit(sql, school, staff, {
				authorId: staff.user_id,
				noteId,
				studentId: student.id,
				observation: `الملاحظة على الطالب ${student.name}: ${studyPlan.storedDetails}`,
				actionText: `${actionTaken}${sentNote}`,
				kind: "study-message"
			});
		}
	}
	if (isTeacherVerbal(behaviorDegree, occurrence)) {
		const stored = behaviorTypeId ? (await sql`
        select procedures from behavior_types where id = ${behaviorTypeId} and school_id = ${staff.school_id}
      `)[0]?.procedures : null;
		const actionTaken = proceduresFor(behaviorDegree, occurrence, parseProcedures(stored, behaviorDegree)).join(" — ");
		if (actionTaken.trim().length >= 2) {
			await sql`
          update notes
          set status = 'closed',
              action_taken = ${actionTaken.trim()},
              closed_at = now(),
              closed_by = ${staff.user_id}
          where id = ${noteId} and school_id = ${staff.school_id}
        `;
			handled = "verbal";
		}
	}
	const title = occurrence > 1 ? `تكرار مخالفة — ${occurrenceLabel(occurrence)}` : `تم تسجيل ${meta.label}`;
	const actor = ROLE_LABEL[staff.role] || "المعلم";
	const subjectBit = lessonSubject ? ` — ${lessonSubject}` : "";
	const recorderBit = recordedByOther ? ` المسجل: ${recorderName}.` : "";
	const body = behaviorDegree === 1 && occurrence >= 3
		? `تكررت مخالفة الدرجة الأولى (${behaviorName}) على الطالب ${student.name} ${occurrenceLabel(occurrence)}. باسم ${actor} ${staff.display_name}${subjectBit}.${recorderBit} تُحال إلى وكيل شؤون الطلاب لاتخاذ إجراء هذه المرحلة.`
		: occurrence > 1
			? `تكررت مخالفة (${behaviorName}) على الطالب ${student.name} ${occurrenceLabel(occurrence)}. باسم ${actor} ${staff.display_name}${subjectBit}.${recorderBit} يُرجى إشعار وكيل الشؤون الفنية${school.technical_vp_name ? ` (${school.technical_vp_name})` : ""} واتخاذ إجراء المرحلة المناسبة.`
			: `تم تسجيل ${label} للطالب ${student.name} باسم ${actor} ${staff.display_name}${subjectBit}.${recorderBit}`;
	const tone = occurrence > 1 ? "danger" : meta.tone;
	if (data.type === "absence" || data.type === "late") {
		await upsertAttendanceDigest(sql, staff, school);
	} else if (handled !== "verbal" && handled !== "study") {
		const recipients = await sql`
      select user_id, role, coalesce(permissions::text, '{}') as permissions from staff
      where school_id = ${staff.school_id}
        and user_id <> ${staff.user_id}
    `;
		for (const rec of recipients) {
			const perms = parsePermissions(rec.permissions, rec.role, mapSchool(school));
			if (!(rec.role === "admin" || rec.role === "counselor" || perms.takeActions)) continue;
			await sql`
        insert into notifications (school_id, user_id, note_id, kind, title, body, tone)
        values (${staff.school_id}, ${rec.user_id}, ${noteId}, ${occurrence > 1 ? "repeat" : "note"}, ${title}, ${body}, ${tone})
      `;
		}
	}
	if (refer && handled !== "study") await notifyCounselingStaff(sql, school, staff, "إحالة إلى الإرشاد الطلابي", `أُحيل الطالب ${student.name} إلى الإرشاد الطلابي — ${label}.`, noteId);
	return {
		id: noteId,
		studentId: student.id,
		studentName: student.name,
		parentPhone: revealPhone(staff, school, student.parent_phone),
		className: student.class_name,
		shortName: student.short_name,
		stageName: student.stage_name,
		behaviorName,
		behaviorDegree,
		type: data.type,
		label,
		occurrence,
		referCounselor: refer,
		handled,
		studyStage: studyPlan?.stage ?? null,
		studyAction: studyPlan?.action ?? "",
		deduction: studyPlan?.deduction ?? null,
		whatsapp,
		transferred
	};
});
export const getStudentNotes = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ studentId: z.number() })).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	await ensureNoteThread(sql);
	const student = (await sql`
      select s.id, s.name, coalesce(s.name_en, '') as name_en, s.parent_phone, s.class_id, c.name as class_name,
             st.short_name, st.name as stage_name,
             coalesce(s.health_note, '') as health_note
      from students s
      join classes c on c.id = s.class_id
      join stages st on st.id = c.stage_id
      where s.id = ${data.studentId} and s.school_id = ${staff.school_id}
    `)[0];
	if (!student) throw new Error("الطالب غير موجود");
	const notes = await sql`
      select n.id, n.teacher_id, n.type, n.details, n.status, n.action_taken,
             n.created_at::text as created_at,
             coalesce(n.occurred_at, n.created_at)::text as occurred_at,
             coalesce(n.refer_counselor, false) as refer_counselor,
             coalesce(n.dest, 'vp') as dest,
             coalesce(n.suggested_action, '') as suggested_action,
             coalesce(n.compensation, '') as compensation,
             coalesce(sf.display_name, 'معلم') as teacher_name,
             coalesce(nullif(n.subject, ''), sf.subject, '') as teacher_subject,
             coalesce(actor.display_name, '') as entered_by_name,
             n.behavior_type_id,
             bt.name as behavior_type_name,
             bt.degree as behavior_degree,
             coalesce(n.period_key, '') as period_key
      from notes n
      left join staff sf on sf.user_id = n.teacher_id
      left join staff actor on actor.user_id = n.entered_by
      left join behavior_types bt on bt.id = n.behavior_type_id
      where n.student_id = ${student.id} and n.school_id = ${staff.school_id}
      order by n.created_at desc
    `;
	return {
		student: {
			id: student.id,
			name: student.name,
			nameEn: student.name_en ?? "",
			parentPhone: revealPhone(staff, school, student.parent_phone),
			classId: student.class_id,
			className: student.class_name,
			shortName: student.short_name,
			stageName: student.stage_name,
			classLabel: classLabel(student.short_name, student.class_name),
			healthNote: student.health_note ?? ""
		},
		notes: withOccurrence(notes.map((n) => ({
			id: n.id,
			type: n.type,
			details: n.details,
			status: n.status,
			actionTaken: n.action_taken,
			createdAt: n.created_at,
			occurredAt: n.occurred_at || n.created_at,
			teacherId: n.teacher_id,
			teacherName: n.teacher_name,
			teacherSubject: n.teacher_subject,
			enteredByName: n.entered_by_name || "",
			behaviorTypeId: n.behavior_type_id,
			behaviorTypeName: n.behavior_type_name,
			behaviorDegree: n.behavior_degree,
			periodKey: n.period_key,
			referCounselor: Boolean(n.refer_counselor),
			dest: n.dest === "health" || n.dest === "counselor" ? n.dest : (n.refer_counselor ? "counselor" : "vp"),
			suggestedAction: n.suggested_action ?? "",
			compensation: n.compensation ?? ""
		}))),
		scopedToTeacher: false
	};
});
export const getAdminDashboard = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	const perms = mappedPerms(staff, school);
	if (!perms.takeActions && !perms.acceptImprovements) throw new Error("هذه الصفحة مخصصة لمتابعة الإجراءات وتحسين السلوك");
	const counts = await sql`
      select type, count(*)::int as count
      from notes
      where school_id = ${staff.school_id} and created_at >= current_date
      group by type
    `;
	const openRows = await sql`
      select count(*)::int as count from notes
      where school_id = ${staff.school_id} and status = 'open'
    `;
	const studentRows = await sql`
      select count(*)::int as count from students where school_id = ${staff.school_id}
    `;
	const improveRows = await sql`
      select count(*)::int as count from behavior_improvements
      where school_id = ${staff.school_id} and status <> 'closed'
    `;
	const byType = Object.fromEntries(counts.map((c) => [c.type, c.count]));
	return {
		stats: {
			absenceToday: byType.absence ?? 0,
			lateToday: byType.late ?? 0,
			homeworkToday: byType.homework ?? 0,
			behaviorToday: byType.behavior ?? 0,
			openTotal: openRows[0]?.count ?? 0,
			studentsTotal: studentRows[0]?.count ?? 0,
			improvementsOpen: improveRows[0]?.count ?? 0
		},
		feed: await fetchNotes(sql, staff.school_id, { limit: 60, staff, school }),
		improvements: await listImprovementRows(sql, staff.school_id, { openOnly: true })
	};
});
async function fetchNotes(sql, schoolId, opts) {
	await ensureNoteThread(sql);
	const params = [schoolId];
	let where = "n.school_id = $1";
	if (opts.stageId) {
		params.push(opts.stageId);
		where += ` and stg.id = $${params.length}`;
	}
	if (opts.classId) {
		params.push(opts.classId);
		where += ` and c.id = $${params.length}`;
	}
	if (opts.studentId) {
		params.push(opts.studentId);
		where += ` and s.id = $${params.length}`;
	}
	if (opts.studentQuery && opts.studentQuery.trim()) {
		params.push(`%${opts.studentQuery.trim()}%`);
		where += ` and s.name ilike $${params.length}`;
	}
	if (opts.type && opts.type !== "all") {
		params.push(opts.type);
		where += ` and n.type = $${params.length}`;
	}
	if (opts.status && opts.status !== "all") {
		params.push(opts.status);
		where += ` and n.status = $${params.length}`;
	}
	if (opts.from) {
		params.push(opts.from);
		where += ` and n.created_at >= $${params.length}::date`;
	}
	if (opts.to) {
		params.push(opts.to);
		where += ` and n.created_at < ($${params.length}::date + interval '1 day')`;
	}
	if (opts.teacherId) {
		params.push(opts.teacherId);
		where += ` and n.teacher_id = $${params.length}`;
	}
	const limit = opts.limit ?? 400;
	params.push(limit);
	return (await sql.query(`select n.id, n.student_id, s.name as student_name, s.parent_phone,
            c.name as class_name, stg.name as stage_name, stg.short_name,
            n.teacher_id, coalesce(sf.display_name, 'معلم') as teacher_name,
            coalesce(actor.display_name, '') as entered_by_name,
            coalesce(nullif(n.subject, ''), sf.subject, '') as teacher_subject,
            n.type, n.details, n.status, n.action_taken,
            n.created_at::text as created_at, n.closed_at::text as closed_at,
            coalesce(n.occurred_at, n.created_at)::text as occurred_at,
            coalesce(n.refer_counselor, false) as refer_counselor,
            coalesce(n.dest, 'vp') as dest,
            coalesce(n.suggested_action, '') as suggested_action,
            coalesce(n.compensation, '') as compensation,
            n.behavior_type_id, bt.name as behavior_type_name,
            bt.degree as behavior_degree,
            coalesce(n.period_key, '') as period_key,
            case
              when n.type = 'behavior' then (
                select count(*)::int from notes n2
                where n2.school_id = n.school_id
                  and n2.student_id = n.student_id
                  and n2.type = 'behavior'
                  and n2.behavior_type_id is not distinct from n.behavior_type_id
                  and (n2.created_at < n.created_at
                    or (n2.created_at = n.created_at and n2.id <= n.id))
              )
              else 1
            end as occurrence
     from notes n
     join students s on s.id = n.student_id
     join classes c on c.id = s.class_id
     join stages stg on stg.id = c.stage_id
     left join staff sf on sf.user_id = n.teacher_id
     left join staff actor on actor.user_id = n.entered_by
     left join behavior_types bt on bt.id = n.behavior_type_id
     where ${where}
     order by n.created_at desc
     limit $${params.length}`, params)).map((n) => ({
		id: n.id,
		studentId: n.student_id,
		studentName: n.student_name,
		parentPhone: opts.staff && opts.school ? revealPhone(opts.staff, opts.school, n.parent_phone) : "",
		className: n.class_name,
		stageName: n.stage_name,
		shortName: n.short_name,
		teacherId: n.teacher_id,
		teacherName: n.teacher_name,
		enteredByName: n.entered_by_name || "",
		teacherSubject: n.teacher_subject,
		type: n.type,
		details: n.details,
		behaviorTypeId: n.behavior_type_id,
		behaviorTypeName: n.behavior_type_name,
		behaviorDegree: n.behavior_degree,
		periodKey: n.period_key,
		status: n.status,
		actionTaken: n.action_taken,
		createdAt: n.created_at,
		occurredAt: n.occurred_at || n.created_at,
		closedAt: n.closed_at,
		occurrence: n.occurrence || 1,
		referCounselor: Boolean(n.refer_counselor),
		dest: n.dest === "health" || n.dest === "counselor" ? n.dest : (n.refer_counselor ? "counselor" : "vp"),
		suggestedAction: n.suggested_action ?? "",
		compensation: n.compensation ?? ""
	}));
}
var reportSchema = z.object({
	stageId: z.number().optional(),
	classId: z.number().optional(),
	studentId: z.number().optional(),
	studentQuery: z.string().optional(),
	type: z.union([noteTypeSchema, z.literal("all")]).optional(),
	from: z.string().optional(),
	to: z.string().optional(),
	status: z.enum([
		"open",
		"closed",
		"all"
	]).optional()
});
export const getReport = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(reportSchema).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	const mapped = mapSchool(school);
	const teacherOnly = cannotViewAll(staff, school) && !mappedPerms(staff, school).editRecords;
	const notes = await fetchNotes(sql, staff.school_id, {
		...data,
		teacherId: teacherOnly ? staff.user_id : void 0,
		staff,
		school
	});
	const stages = await listStageSummaries(sql, staff.school_id);
	const classes = await sql`
      select c.id, c.stage_id, c.name, st.short_name
      from classes c
      join stages st on st.id = c.stage_id
      where c.school_id = ${staff.school_id}
        and exists (select 1 from students s where s.class_id = c.id)
      order by st.sort_order, c.sort_order
    `;
	const studentList = (await sql`
      select s.id, s.name, s.class_id, c.stage_id,
             coalesce(s.parent_phone, '') as parent_phone,
             c.name as class_name, st.name as stage_name, st.short_name
      from students s
      join classes c on c.id = s.class_id
      join stages st on st.id = c.stage_id
      where s.school_id = ${staff.school_id}
      order by st.sort_order, c.sort_order, s.name
    `).map((s) => ({
		id: s.id,
		name: s.name,
		classId: s.class_id,
		stageId: s.stage_id,
		parentPhone: s.parent_phone ?? "",
		className: s.class_name,
		stageName: s.stage_name,
		shortName: s.short_name,
		label: classLabel(s.short_name, s.class_name)
	}));
	return {
		school: mapped,
		teacherName: staff.display_name,
		notes,
		stages,
		students: studentList,
		scopedToTeacher: teacherOnly,
		classes: classes.map((c) => ({
			id: c.id,
			stageId: c.stage_id,
			name: c.name,
			shortName: c.short_name,
			label: classLabel(c.short_name, c.name)
		}))
	};
});
export const closeNote = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	noteId: z.number(),
	actionTaken: z.string().min(2).max(1200),
	compensation: z.string().max(400).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requirePerm(context.userId, "takeActions");
	const note = (await sql`
      select n.id, n.teacher_id, n.type, n.details, s.id as student_id, s.name as student_name
      from notes n
      join students s on s.id = n.student_id
      where n.id = ${data.noteId} and n.school_id = ${staff.school_id}
    `)[0];
	if (!note) throw new Error("الملاحظة غير موجودة");
	const compensation = data.compensation?.trim() ?? "";
	await sql`
      update notes
      set status = 'closed',
          action_taken = ${data.actionTaken.trim()},
          compensation = case when ${compensation} = '' then notes.compensation else ${compensation} end,
          closed_at = now(),
          closed_by = ${staff.user_id}
      where id = ${note.id} and school_id = ${staff.school_id}
    `;
	const meta = NOTE_META[note.type] || { label: "ملاحظة" };
	const observation = `الملاحظة على الطالب ${note.student_name}: ${(note.details || meta.label || "").trim()}`;
	await notifyActionSplit(sql, school, staff, {
		authorId: note.teacher_id,
		noteId: note.id,
		studentId: note.student_id,
		observation,
		actionText: `إغلاق (${meta.label}) — ${data.actionTaken.trim()}`
	});
	return { ok: true };
});
export const getNotifications = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requireApproved(context.userId);
	await sql.query(`alter table notifications add column if not exists student_id integer`);
	const rows = await sql`
      select ntf.id, ntf.note_id, ntf.kind, ntf.title, ntf.body, ntf.tone, ntf.read,
             ntf.created_at::text as created_at,
             coalesce(notes.student_id, ntf.student_id) as student_id,
             coalesce(s.class_id, s2.class_id) as class_id
      from notifications ntf
      left join notes on notes.id = ntf.note_id
      left join students s on s.id = notes.student_id
      left join students s2 on s2.id = ntf.student_id
      where ntf.user_id = ${staff.user_id} and ntf.school_id = ${staff.school_id}
      order by ntf.created_at desc
      limit 40
    `;
	const unread = rows.filter((r) => !r.read).length;
	return {
		items: rows.map((r) => ({
			id: r.id,
			noteId: r.note_id,
			kind: r.kind,
			title: r.title,
			body: r.body,
			tone: r.tone,
			read: r.read,
			createdAt: r.created_at,
			studentId: r.student_id ?? null,
			classId: r.class_id ?? null
		})),
		unread
	};
});
export const markNotificationsRead = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requireApproved(context.userId);
	await sql`
      update notifications
      set read = true
      where user_id = ${staff.user_id} and school_id = ${staff.school_id} and read = false
    `;
	return { ok: true };
});
function matchStage(raw, stages) {
	const folded = foldArabic(raw);
	if (!folded) return null;
	for (const s of stages) {
		if (foldArabic(s.name) === folded || foldArabic(s.shortName) === folded) return s;
	}
	const ord = stageOrdinal(raw);
	if (ord == null) return null;
	return stages.find((s) => s.sortOrder === ord || stageOrdinal(s.name) === ord || stageOrdinal(s.shortName) === ord) ?? null;
}
function matchClass(raw, classes, stageId) {
	const wanted = parseSectionName(raw);
	if (!wanted) return null;
	return classes.filter((c) => c.stageId === stageId).find((c) => parseSectionName(c.name) === wanted || foldArabic(c.name) === foldArabic(raw.trim())) ?? null;
}
async function reassignStudent(sql, fromId, toId) {
	if (fromId === toId) return;
	try {
		await sql`update notes set student_id = ${toId} where student_id = ${fromId}`;
	} catch {}
	try {
		await sql`update parent_messages set student_id = ${toId} where student_id = ${fromId}`;
	} catch {}
	try {
		await sql`update behavior_improvements set student_id = ${toId} where student_id = ${fromId}`;
	} catch {}
	try {
		await sql`update counseling_cases set student_id = ${toId} where student_id = ${fromId}`;
	} catch {}
	try {
		await sql`delete from daily_attendance d
      where d.student_id = ${fromId}
      and exists (
        select 1 from daily_attendance k
        where k.student_id = ${toId} and k.day = d.day and k.school_id = d.school_id
      )`;
		await sql`update daily_attendance set student_id = ${toId} where student_id = ${fromId}`;
	} catch {}
	await sql`delete from students where id = ${fromId}`;
}
async function mergeDuplicateClasses(sql, schoolId) {
	const classes = await sql`
      select id, stage_id, name from classes where school_id = ${schoolId} order by id
    `;
	const groups = new Map();
	for (const c of classes) {
		const key = `${c.stage_id}::${parseSectionName(c.name) || foldArabic(c.name)}`;
		const list = groups.get(key) ?? [];
		list.push(c);
		groups.set(key, list);
	}
	let merged = 0;
	for (const list of groups.values()) {
		if (list.length < 2) continue;
		let keeper = list[0];
		let maxCount = -1;
		for (const c of list) {
			const count = (await sql`select count(*)::int as n from students where class_id = ${c.id}`)[0]?.n ?? 0;
			if (count > maxCount) {
				maxCount = count;
				keeper = c;
			}
		}
		const canonName = parseSectionName(keeper.name) || keeper.name;
		await sql`update classes set name = ${canonName} where id = ${keeper.id}`;
		for (const c of list) {
			if (c.id === keeper.id) continue;
			const students = await sql`select id, name, parent_phone from students where class_id = ${c.id}`;
			for (const s of students) {
				const existing = (await sql`
          select id from students where class_id = ${keeper.id} and name = ${s.name} limit 1
        `)[0];
				if (existing) {
					await sql`update students set parent_phone = case when parent_phone = '' then ${s.parent_phone} else parent_phone end where id = ${existing.id}`;
					await reassignStudent(sql, s.id, existing.id);
				} else {
					await sql`update students set class_id = ${keeper.id} where id = ${s.id}`;
				}
			}
			await sql`delete from classes where id = ${c.id}`;
			merged += 1;
		}
	}
	return merged;
}
async function mergeDuplicateStages(sql, schoolId) {
	const stages = await sql`
      select id, name, short_name, sort_order from stages where school_id = ${schoolId} order by id
    `;
	const groups = new Map();
	for (const s of stages) {
		const ord = stageOrdinal(s.name) ?? stageOrdinal(s.short_name);
		const key = ord != null ? `ord:${ord}` : `id:${s.id}`;
		const list = groups.get(key) ?? [];
		list.push(s);
		groups.set(key, list);
	}
	let merged = 0;
	for (const [key, list] of groups) {
		if (list.length < 2 || String(key).startsWith("id:")) continue;
		const counts = [];
		for (const s of list) {
			const n = (await sql`
        select count(*)::int as n from students st
        join classes c on c.id = st.class_id
        where c.stage_id = ${s.id}
      `)[0]?.n ?? 0;
			counts.push({ s, n });
		}
		counts.sort((a, b) => b.n - a.n);
		const keeper = counts[0].s;
		for (const item of counts.slice(1)) {
			if (item.n > 0) continue;
			await sql`update classes set stage_id = ${keeper.id} where stage_id = ${item.s.id} and school_id = ${schoolId}`;
			await sql`delete from stages where id = ${item.s.id} and school_id = ${schoolId}`;
			merged += 1;
		}
	}
	if (merged) await mergeDuplicateClasses(sql, schoolId);
	return merged;
}
async function pruneEmptyDivisions(sql, schoolId, keepClassIds) {
	const keep = keepClassIds instanceof Set ? keepClassIds : null;
	const classes = await sql`select id from classes where school_id = ${schoolId}`;
	let removedClasses = 0;
	for (const c of classes) {
		if (keep && keep.has(c.id)) continue;
		const n = (await sql`select count(*)::int as n from students where class_id = ${c.id}`)[0]?.n ?? 0;
		if (n > 0) continue;
		await sql`delete from classes where id = ${c.id} and school_id = ${schoolId}`;
		removedClasses += 1;
	}
	const stages = await sql`select id from stages where school_id = ${schoolId}`;
	let removedStages = 0;
	for (const s of stages) {
		const n = (await sql`select count(*)::int as n from classes where stage_id = ${s.id}`)[0]?.n ?? 0;
		if (n > 0) continue;
		await sql`delete from stages where id = ${s.id} and school_id = ${schoolId}`;
		removedStages += 1;
	}
	return { removedClasses, removedStages };
}
async function repairClassStructure(sql, schoolId) {
	const stagesMerged = await mergeDuplicateStages(sql, schoolId);
	const classesMerged = await mergeDuplicateClasses(sql, schoolId);
	let emptied = 0;
	const leftovers = await sql`
      select id, name, short_name from stages where school_id = ${schoolId}
    `;
	for (const s of leftovers) {
		const ord = stageOrdinal(s.name) ?? stageOrdinal(s.short_name);
		const students = (await sql`
        select count(*)::int as n from students st
        join classes c on c.id = st.class_id
        where c.stage_id = ${s.id}
      `)[0]?.n ?? 0;
		if (students > 0) continue;
		if (ord != null) continue;
		await sql`delete from classes where stage_id = ${s.id} and school_id = ${schoolId}`;
		await sql`delete from stages where id = ${s.id} and school_id = ${schoolId}`;
		emptied += 1;
	}
	return {
		stagesMerged,
		classesMerged,
		emptied
	};
}
export const importStudents = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ rows: z.array(z.object({
	name: z.string(),
	parentPhone: z.string(),
	parentPhone2: z.string().max(20).optional(),
	nationalId: z.string().max(20).optional(),
	nationality: z.string().max(40).optional(),
	stageName: z.string(),
	className: z.string()
})).max(2000), replaceEmpty: z.boolean().optional(), preserveRecords: z.boolean().optional() })).handler(async ({ context, data }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	await ensureStudentProfile(sql);
	const preserve = data.preserveRecords === true;
	if (!preserve) await repairClassStructure(sql, staff.school_id);
	const roster = preserve ? await sql`
      select id, name, coalesce(national_id, '') as national_id
      from students where school_id = ${staff.school_id}
    ` : null;
	const usedClassIds = new Set();
	const stageList = (await sql`
      select id, name, short_name, sort_order from stages
      where school_id = ${staff.school_id}
    `).map((s) => ({
		id: s.id,
		name: s.name,
		shortName: s.short_name,
		sortOrder: s.sort_order
	}));
	const classList = (await sql`
      select id, stage_id, name from classes where school_id = ${staff.school_id}
    `).map((c) => ({
		id: c.id,
		stageId: c.stage_id,
		name: c.name
	}));
	let inserted = 0;
	let updated = 0;
	let skipped = 0;
	let ambiguous = 0;
	const classSeq = new Map();
	for (const row of data.rows) {
		const name = row.name.trim();
		if (!name) {
			skipped += 1;
			continue;
		}
		let stage = matchStage(row.stageName, stageList);
		if (!stage) {
			const stageName = row.stageName.trim();
			if (!stageName) {
				skipped += 1;
				continue;
			}
			const known = canonicalStage(stageName) ?? DEFAULT_STAGES.find((st) => foldArabic(st.name) === foldArabic(stageName) || foldArabic(st.shortName) === foldArabic(stageName));
			const shortName = known?.shortName ?? (stageName.length <= 8 ? stageName : stageName.slice(0, 8));
			const sortOrder = known?.sortOrder ?? stageList.length + 1;
			const created = (await sql`
        insert into stages (school_id, name, short_name, sort_order)
        values (${staff.school_id}, ${known?.name ?? stageName}, ${shortName}, ${sortOrder})
        returning id, name, short_name, sort_order
      `)[0];
			stage = {
				id: created.id,
				name: created.name,
				shortName: created.short_name,
				sortOrder: created.sort_order
			};
			stageList.push(stage);
		}
		let cls = matchClass(row.className, classList, stage.id);
		if (!cls) {
			const rawClass = row.className.trim();
			if (!rawClass) {
				skipped += 1;
				continue;
			}
			const className = parseSectionName(rawClass) || rawClass;
			const sortOrder = Number(className) || classList.filter((c) => c.stageId === stage.id).length + 1;
			const created = (await sql`
        insert into classes (school_id, stage_id, name, sort_order)
        values (${staff.school_id}, ${stage.id}, ${className}, ${sortOrder})
        returning id, stage_id, name
      `)[0];
			cls = {
				id: created.id,
				stageId: created.stage_id,
				name: created.name
			};
			classList.push(cls);
		}
		usedClassIds.add(cls.id);
		const fileOrder = (classSeq.get(cls.id) ?? 0) + 1;
		classSeq.set(cls.id, fileOrder);
		const nationalId = String(row.nationalId ?? "").replace(/\D/g, "").slice(0, 10);
		const phone = row.parentPhone.trim() ? normalizeSaudiPhone(row.parentPhone) : "";
		const phone2 = String(row.parentPhone2 ?? "").trim() ? normalizeSaudiPhone(row.parentPhone2) : "";
		const nationality = String(row.nationality ?? "").trim().slice(0, 40);
		let existing = null;
		if (preserve) {
			if (nationalId) existing = roster.find((student) => student.national_id === nationalId) ?? null;
			if (!existing) {
				const folded = foldArabic(name);
				const hits = roster.filter((student) => foldArabic(student.name) === folded);
				const usable = hits.filter((student) => !student.national_id || !nationalId || student.national_id === nationalId);
				if (usable.length === 1) existing = usable[0];
				else if (hits.length > 0) {
					skipped += 1;
					ambiguous += 1;
					continue;
				}
			}
		} else {
			existing = nationalId ? (await sql`
        select id from students
        where school_id = ${staff.school_id} and national_id = ${nationalId}
        limit 1
      `)[0] : null;
			if (!existing) existing = (await sql`
        select id from students
        where school_id = ${staff.school_id} and class_id = ${cls.id} and name = ${name}
        limit 1
      `)[0];
			if (!existing) {
				const sameStage = await sql`
        select s.id from students s
        join classes c on c.id = s.class_id
        where s.school_id = ${staff.school_id} and c.stage_id = ${stage.id} and s.name = ${name}
      `;
				if (sameStage.length === 1) existing = sameStage[0];
			}
			if (!existing) {
				const schoolWide = await sql`
        select id from students
        where school_id = ${staff.school_id} and name = ${name}
      `;
				if (schoolWide.length === 1) existing = schoolWide[0];
			}
		}
		if (existing) {
			await sql`
          update students set
            parent_phone = case when ${phone} <> '' then ${phone} else parent_phone end,
            parent_phone_2 = case when ${phone2} <> '' then ${phone2} else parent_phone_2 end,
            national_id = case when ${nationalId} <> '' and coalesce(national_id, '') in ('', ${nationalId}) then ${nationalId} else national_id end,
            nationality = case when ${nationality} <> '' then ${nationality} else nationality end,
            class_id = ${cls.id},
            roster_order = ${fileOrder}
          where id = ${existing.id} and school_id = ${staff.school_id}
        `;
			if (roster && nationalId && !existing.national_id) existing.national_id = nationalId;
			updated += 1;
		} else {
			const created = (await sql`
          insert into students (school_id, class_id, name, name_en, parent_phone, parent_phone_2, national_id, nationality, roster_order)
          values (${staff.school_id}, ${cls.id}, ${name}, ${englishName(name)}, ${phone}, ${phone2}, ${nationalId}, ${nationality}, ${fileOrder})
          returning id
        `)[0];
			if (roster) roster.push({ id: created.id, name, national_id: nationalId });
			inserted += 1;
		}
	}
	let pruned = { removedClasses: 0, removedStages: 0 };
	if (!preserve) {
		await repairClassStructure(sql, staff.school_id);
		if (data.replaceEmpty !== false) pruned = await pruneEmptyDivisions(sql, staff.school_id, usedClassIds);
	}
	return {
		inserted,
		updated,
		skipped,
		ambiguous,
		removedClasses: pruned.removedClasses,
		removedStages: pruned.removedStages
	};
});
export const previewNoorPdf = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ pdfBase64: z.string().min(80).max(12000000) })).handler(async ({ context, data }) => {
	await requireAdmin(context.userId);
	const { parseNoorStudentPdf } = await import("./noor-pdf");
	let rows;
	try {
		rows = await parseNoorStudentPdf(Buffer.from(data.pdfBase64, "base64"));
	} catch (err) {
		const message = err instanceof Error && err.message ? err.message : "تعذر قراءة كشف نور";
		throw new Error(message);
	}
	if (!rows.length) throw new Error("لم يُعثر على طلاب مستمرين في هذا الملف");
	const classes = new Map();
	for (const row of rows) {
		const label = `${row.stageName} · فصل ${row.className}`;
		classes.set(label, (classes.get(label) ?? 0) + 1);
	}
	return {
		total: rows.length,
		withPhone: rows.filter((row) => row.parentPhone).length,
		withId: rows.filter((row) => row.nationalId).length,
		classes: [...classes.entries()].map(([label, count]) => ({ label, count })),
		rows
	};
});
async function insertCredentialStaff(sql, opts) {
	if ((await sql`
    select id from "user" where email = ${opts.email}
  `)[0]) throw new Error("هذا الحساب مسجّل مسبقاً");
	const id = randomBytes(16).toString("hex");
	const hashed = await hashPassword(opts.password);
	await sql`
    insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
    values (${id}, ${opts.name}, ${opts.email}, true, now(), now())
  `;
	await sql`
    insert into "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
    values (${id}, ${id}, ${"credential"}, ${id}, ${hashed}, now(), now())
  `;
	await sql.query(`insert into staff (user_id, school_id, display_name, role, subject, phone, appearance)
    values ($1, $2, $3, $4, $5, $6, $7::jsonb)`, [
		id,
		opts.schoolId,
		opts.name,
		opts.role,
		opts.subject,
		opts.phone,
		JSON.stringify(opts.locale === "en" ? { locale: "en" } : { locale: "ar" })
	]);
	return id;
}
async function setCredentialPassword(sql, userId, password) {
	const hashed = await hashPassword(password);
	const account = await sql`
    select id from "account"
    where "userId" = ${userId} and "providerId" = 'credential'
  `;
	if (account[0]) await sql`
      update "account" set password = ${hashed}, "updatedAt" = now()
      where id = ${account[0].id}
    `;
	else await sql`
      insert into "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
      values (${userId}, ${userId}, ${"credential"}, ${userId}, ${hashed}, now(), now())
    `;
}
export const listStaff = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff, school } = await requirePerm(context.userId, "editStaff");
	const mapped = mapSchool(school);
	let rows = [];
	try {
		rows = await sql`
      select st.user_id, st.display_name, st.role, st.created_at::text as created_at,
             u.email as email,
             coalesce(st.subject, '') as subject,
             coalesce(st.phone, '') as phone,
             coalesce(st.permissions::text, '{}') as permissions,
             coalesce(st.appearance::text, '{}') as appearance,
             coalesce(st.active, true) as active
      from staff st
      left join "user" u on u.id = st.user_id
      where st.school_id = ${staff.school_id}
      order by
        coalesce(st.active, true) desc,
        case st.role
          when 'pending' then 0 when 'admin' then 1 when 'principal' then 2
          when 'school_vp' then 3 when 'teachers_vp' then 4 when 'counselor' then 5
          when 'student_counselor' then 6 when 'health_counselor' then 7
          when 'activity_leader' then 8 when 'security' then 9
          when 'admin_assistant' then 10 when 'admin_staff' then 11 else 12
        end,
        st.created_at
    `;
	} catch {
		rows = await sql`
      select st.user_id, st.display_name, st.role, st.created_at::text as created_at,
             u.email as email,
             coalesce(st.subject, '') as subject,
             coalesce(st.phone, '') as phone,
             coalesce(st.permissions::text, '{}') as permissions
      from staff st
      left join "user" u on u.id = st.user_id
      where st.school_id = ${staff.school_id}
      order by
        case st.role when 'pending' then 0 when 'admin' then 1 else 2 end,
        st.created_at
    `;
		rows = rows.map((r) => ({
			...r,
			active: true
		}));
	}
	return rows.map((r) => ({
		userId: r.user_id,
		displayName: r.display_name,
		role: r.role,
		createdAt: r.created_at,
		email: r.email ?? "",
		subject: r.subject,
		phone: r.phone,
		permissions: parsePermissions(r.permissions, r.role, mapped),
		active: r.active !== false,
		locale: parseOptionalAppearance(r.appearance)?.locale === "en" ? "en" : "ar"
	}));
});
export const setStaffRole = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	userId: z.string(),
	role: z.enum([
		"admin",
		"principal",
		"school_vp",
		"teachers_vp",
		"counselor",
		"student_counselor",
		"health_counselor",
		"activity_leader",
		"teacher",
		"security",
		"admin_assistant",
		"admin_staff",
		"pending"
	])
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editStaff");
	if (data.userId === staff.user_id && data.role !== "admin") throw new Error("لا يمكنك إزالة صلاحية المدير عن حسابك");
	await assertNotLastAdmin(sql, staff.school_id, data.userId, data.role, true);
	const current = (await sql`
      select role from staff where user_id = ${data.userId} and school_id = ${staff.school_id}
    `)[0];
	await sql`
      update staff set role = ${data.role}
      where user_id = ${data.userId} and school_id = ${staff.school_id}
    `;
	if (current && current.role !== data.role) {
		const school = await loadSchool(sql, staff.school_id);
		const nextPerms = defaultPermissions(data.role, school ? mapSchool(school) : void 0);
		await sql.query(`update staff set permissions = $1::jsonb where user_id = $2 and school_id = $3`, [
			JSON.stringify(nextPerms),
			data.userId,
			staff.school_id
		]);
	}
	return { ok: true };
});
export const updateStaffMember = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	userId: z.string(),
	displayName: z.string().min(2).max(80),
	role: z.enum([
		"admin",
		"principal",
		"school_vp",
		"teachers_vp",
		"counselor",
		"student_counselor",
		"health_counselor",
		"activity_leader",
		"teacher",
		"security",
		"admin_assistant",
		"admin_staff",
		"pending"
	]),
	subject: z.string().max(240).optional(),
	phone: z.string().max(20).optional(),
	password: z.string().max(80).optional(),
	locale: z.enum(["ar", "en"]).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requirePerm(context.userId, "editStaff");
	if (data.userId === staff.user_id && data.role !== "admin") throw new Error("لا يمكنك إزالة صلاحية المدير عن حسابك");
	await assertNotLastAdmin(sql, staff.school_id, data.userId, data.role, true);
	const name = data.displayName.trim();
	const subject = data.subject?.trim() ?? "";
	const phone = data.phone ? normalizeSaudiPhone(data.phone) : "";
	const current = (await sql`
      select role from staff where user_id = ${data.userId} and school_id = ${staff.school_id}
    `)[0];
	if (current && current.role !== data.role) {
		const nextPerms = defaultPermissions(data.role, mapSchool(school));
		await sql.query(`update staff
         set display_name = $1, role = $2, subject = $3, phone = $4, permissions = $5::jsonb
       where user_id = $6 and school_id = $7`, [
			name,
			data.role,
			subject,
			phone,
			JSON.stringify(nextPerms),
			data.userId,
			staff.school_id
		]);
	} else await sql`
      update staff
      set display_name = ${name}, role = ${data.role}, subject = ${subject}, phone = ${phone}
      where user_id = ${data.userId} and school_id = ${staff.school_id}
    `;
	await sql`
      update "user" set name = ${name}, "updatedAt" = now()
      where id = ${data.userId}
    `;
	const pass = data.password?.trim() ?? "";
	if (pass) {
		if (pass.length < 4) throw new Error("كلمة المرور يجب ألا تقل عن 4 خانات");
		await setCredentialPassword(sql, data.userId, pass);
	}
	if (data.locale) {
		await sql.query(`update staff set appearance = coalesce(appearance, '{}'::jsonb) || $1::jsonb where user_id = $2 and school_id = $3`, [
			JSON.stringify({ locale: data.locale }),
			data.userId,
			staff.school_id
		]);
	}
	return { ok: true };
});
export const createStaffUser = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	name: z.string().min(2).max(80),
	email: z.string().optional(),
	phone: z.string().optional(),
	password: z.string().min(4).max(80),
	role: z.enum([
		"admin",
		"principal",
		"school_vp",
		"teachers_vp",
		"counselor",
		"student_counselor",
		"health_counselor",
		"activity_leader",
		"teacher",
		"security",
		"admin_assistant",
		"admin_staff"
	]),
	subject: z.string().max(240).optional(),
	locale: z.enum(["ar", "en"]).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editStaff");
	const phone = data.phone ? normalizeSaudiPhone(data.phone) : "";
	const emailRaw = data.email?.trim() || phone;
	const email = phoneToLoginEmail(emailRaw);
	if (!email) throw new Error("أدخل البريد الإلكتروني أو رقم الجوال");
	const name = data.name.trim();
	return { userId: await insertCredentialStaff(sql, {
		schoolId: staff.school_id,
		name,
		email,
		password: data.password,
		role: data.role,
		subject: data.subject?.trim() ?? "",
		phone,
		locale: data.locale === "en" ? "en" : "ar"
	}) };
});
async function assertNotLastAdmin(sql, schoolId, userId, nextRole, nextActive) {
	const target = (await sql`
      select role, coalesce(active, true) as active from staff
      where user_id = ${userId} and school_id = ${schoolId}
    `)[0];
	if (!target || target.role !== "admin") return;
	if (nextRole === "admin" && nextActive !== false) return;
	if (((await sql`
      select count(*)::int as count from staff
      where school_id = ${schoolId} and role = 'admin' and coalesce(active, true) = true and user_id <> ${userId}
    `)[0]?.count ?? 0) < 1) throw new Error("لا يمكن إلغاء آخر مدير تطبيق");
}
export const setStaffActive = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	userId: z.string(),
	active: z.boolean()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editStaff");
	if (data.userId === staff.user_id) throw new Error("لا يمكنك إلغاء حسابك");
	await assertNotLastAdmin(sql, staff.school_id, data.userId, "admin", data.active);
	const updated = await sql`
      update staff set active = ${data.active}
      where user_id = ${data.userId} and school_id = ${staff.school_id}
      returning display_name, active
    `;
	if (!updated[0]) throw new Error("الموظف غير موجود");
	return {
		ok: true,
		displayName: updated[0].display_name,
		active: updated[0].active
	};
});
export const importTeachers = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ rows: z.array(z.object({
	name: z.string(),
	phone: z.string(),
	subject: z.string()
})).max(400) })).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editStaff");
	let inserted = 0;
	let updated = 0;
	let skipped = 0;
	for (const row of data.rows) {
		const name = row.name.trim();
		const phone = normalizeSaudiPhone(row.phone);
		const subject = row.subject.trim();
		if (!name || !phone) {
			skipped += 1;
			continue;
		}
		const email = phoneToLoginEmail(phone);
		const existingUser = await sql`
        select id from "user" where email = ${email}
      `;
		if (existingUser[0]) {
			await sql`
          update staff
          set display_name = ${name}, subject = ${subject}, phone = ${phone}
          where user_id = ${existingUser[0].id} and school_id = ${staff.school_id}
        `;
			await sql`
          update "user" set name = ${name}, "updatedAt" = now()
          where id = ${existingUser[0].id}
        `;
			updated += 1;
			continue;
		}
		await insertCredentialStaff(sql, {
			schoolId: staff.school_id,
			name,
			email,
			password: DEFAULT_TEACHER_PASSWORD,
			role: "teacher",
			subject,
			phone
		});
		inserted += 1;
	}
	return {
		inserted,
		updated,
		skipped
	};
});
export const updateSchool = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	name: z.string().min(3).max(120),
	principalName: z.string().max(80).optional(),
	season: z.enum(["winter", "summer"]).optional(),
	region: z.string().max(120).optional(),
	governorate: z.string().max(120).optional(),
	leadershipGender: z.enum(["male", "female"]).optional(),
	studentGender: z.enum(["male", "female"]).optional(),
	counselorName: z.string().max(80).optional(),
	technicalVpName: z.string().max(80).optional(),
	logoUrl: z.string().max(4e5).optional(),
	extraLogoUrl: z.string().max(4e5).optional(),
	tagline: z.string().max(160).optional(),
	printMargins: z.object({
		top: z.number().min(0).max(40),
		right: z.number().min(0).max(40),
		bottom: z.number().min(0).max(40),
		left: z.number().min(0).max(40)
	}).optional(),
	printSchoolLogo: z.boolean().optional(),
	schedules: z.object({
		winter: z.array(z.object({
			key: z.string().min(1).max(40),
			label: z.string().min(1).max(40),
			from: z.string().max(8),
			to: z.string().max(8),
			startMin: z.number().optional(),
			endMin: z.number().optional()
		})).max(20),
		summer: z.array(z.object({
			key: z.string().min(1).max(40),
			label: z.string().min(1).max(40),
			from: z.string().max(8),
			to: z.string().max(8),
			startMin: z.number().optional(),
			endMin: z.number().optional()
		})).max(20)
	}).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	const current = await loadSchool(sql, staff.school_id);
	if (!current) throw new Error("المدرسة غير موجودة");
	const name = data.name.trim();
	const principalName = data.principalName !== void 0 ? data.principalName.trim() : current.principal_name ?? "";
	const season = data.season ?? current.season ?? "winter";
	const region = data.region !== void 0 ? data.region.trim() : current.region ?? "";
	const governorate = data.governorate !== void 0 ? data.governorate.trim() : current.governorate ?? "";
	const leadershipGender = data.leadershipGender ?? current.leadership_gender ?? "male";
	const studentGender = data.studentGender ?? current.student_gender ?? "male";
	const counselorName = data.counselorName !== void 0 ? data.counselorName.trim() : current.counselor_name ?? "";
	const technicalVpName = data.technicalVpName !== void 0 ? data.technicalVpName.trim() : current.technical_vp_name ?? "";
	const logoUrl = data.logoUrl !== void 0 ? data.logoUrl : current.logo_url ?? "";
	const extraLogoUrl = data.extraLogoUrl !== void 0 ? data.extraLogoUrl : current.extra_logo_url ?? "";
	const tagline = data.tagline !== void 0 ? data.tagline.trim() : current.tagline ?? "";
	const printMargins = data.printMargins ? parsePrintMargins(data.printMargins) : parsePrintMargins(current.print_margins);
	const printSchoolLogo = data.printSchoolLogo !== void 0 ? data.printSchoolLogo : Boolean(current.print_school_logo);
	const schedules = data.schedules !== void 0 ? parseSchedules(data.schedules) : parseSchedules(current.schedules);
	await sql`
      update schools
      set name = ${name},
          principal_name = ${principalName},
          season = ${season},
          region = ${region},
          governorate = ${governorate},
          leadership_gender = ${leadershipGender},
          student_gender = ${studentGender},
          counselor_name = ${counselorName},
          technical_vp_name = ${technicalVpName},
          logo_url = ${logoUrl},
          tagline = ${tagline}
      where id = ${staff.school_id}
    `;
	try {
		const raw = JSON.stringify(printMargins);
		await sql.query(`update schools set print_margins = $1::jsonb where id = $2`, [raw, staff.school_id]);
	} catch {}
	try {
		await sql`update schools set extra_logo_url = ${extraLogoUrl} where id = ${staff.school_id}`;
	} catch {}
	try {
		await sql`update schools set print_school_logo = ${printSchoolLogo} where id = ${staff.school_id}`;
	} catch {}
	try {
		await sql.query(`update schools set schedules = $1::jsonb where id = $2`, [JSON.stringify(schedules), staff.school_id]);
	} catch {}
	return {
		name,
		principalName,
		season,
		region,
		governorate,
		leadershipGender,
		studentGender,
		counselorName,
		technicalVpName,
		logoUrl,
		extraLogoUrl,
		tagline,
		printMargins,
		printSchoolLogo,
		schedules
	};
});
export const updateMessageTemplates = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	templates: z.record(z.string(), z.object({
		title: z.string().min(2).max(80),
		body: z.string().min(4).max(2e3)
	})),
	customMessages: z.array(z.object({
		id: z.string().min(1).max(40),
		title: z.string().min(2).max(80),
		body: z.string().min(4).max(2e3)
	})).max(40).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	await sql.query(`update schools set message_templates = $1::jsonb where id = $2`, [JSON.stringify(data.templates), staff.school_id]);
	if (data.customMessages) try {
		await sql.query(`update schools set custom_messages = $1::jsonb where id = $2`, [JSON.stringify(data.customMessages), staff.school_id]);
	} catch {
		throw new Error("تعذر حفظ الرسائل المخصصة — أعد تشغيل التطبيق بعد التحديث");
	}
	return { ok: true };
});
export const updateSchoolName = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ name: z.string().min(3).max(120) })).handler(async ({ context, data }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	await sql`
      update schools set name = ${data.name.trim()}
      where id = ${staff.school_id}
    `;
	return { name: data.name.trim() };
});
export const updateStaffName = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	name: z.string().min(2).max(80),
	subject: z.string().max(240).optional(),
	phone: z.string().max(20).optional(),
	password: z.string().min(4).max(80).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireApproved(context.userId);
	const name = data.name.trim();
	const subject = data.subject?.trim() ?? staff.subject;
	const phone = data.phone !== void 0 ? normalizeSaudiPhone(data.phone) : staff.phone;
	await sql`
      update staff set display_name = ${name}, subject = ${subject}, phone = ${phone}
      where user_id = ${staff.user_id}
    `;
	if (phone && phone !== staff.phone) {
		const email = phoneToLoginEmail(phone);
		if ((await sql`
        select id from "user" where email = ${email} and id <> ${staff.user_id}
      `)[0]) throw new Error("اسم المستخدم (رقم الجوال) مستخدم مسبقاً");
		await sql`
        update "user" set name = ${name}, email = ${email}, "updatedAt" = now()
        where id = ${staff.user_id}
      `;
	} else await sql`
        update "user" set name = ${name}, "updatedAt" = now()
        where id = ${staff.user_id}
      `;
	if (data.password && data.password.trim().length >= 4) {
		await setCredentialPassword(sql, staff.user_id, data.password.trim());
	}
	return {
		name,
		subject,
		phone
	};
});
async function createCatalogItem(sql, schoolId, table, name) {
	if ((await sql.query(`select id from ${table} where school_id = $1 and name = $2 limit 1`, [schoolId, name]))[0]) throw new Error("هذا الخيار موجود مسبقاً");
	const max = await sql.query(`select max(sort_order) as max from ${table} where school_id = $1`, [schoolId]);
	return { id: (await sql.query(`insert into ${table} (school_id, name, sort_order, active)
     values ($1, $2, $3, true) returning id`, [
		schoolId,
		name,
		(max[0]?.max ?? 0) + 1
	]))[0].id };
}
async function patchCatalogItem(sql, schoolId, table, data) {
	const existing = await sql.query(`select id, name, active from ${table} where id = $1 and school_id = $2`, [data.id, schoolId]);
	if (!existing[0]) throw new Error("الخيار غير موجود");
	const name = data.name?.trim() ?? existing[0].name;
	const active = data.active ?? existing[0].active;
	if (name !== existing[0].name) {
		if ((await sql.query(`select id from ${table} where school_id = $1 and name = $2 and id <> $3 limit 1`, [
			schoolId,
			name,
			data.id
		]))[0]) throw new Error("هذا الخيار موجود مسبقاً");
	}
	if (table === "behavior_types" && data.degree !== void 0) await sql.query(`update behavior_types set name = $1, active = $2, degree = $3 where id = $4 and school_id = $5`, [
		name,
		active,
		data.degree,
		data.id,
		schoolId
	]);
	else await sql.query(`update ${table} set name = $1, active = $2 where id = $3 and school_id = $4`, [
		name,
		active,
		data.id,
		schoolId
	]);
	return { ok: true };
}
export const listAllBehaviorTypes = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	await ensureBehaviorTypes(sql, staff.school_id);
	return listBehaviorTypeRows(sql, staff.school_id, false);
});
export const createBehaviorType = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	name: z.string().min(2).max(300),
	degree: z.number().int().min(1).max(5).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	const name = data.name.trim();
	if ((await sql.query(`select id from behavior_types where school_id = $1 and name = $2 limit 1`, [staff.school_id, name]))[0]) throw new Error("هذا الخيار موجود مسبقاً");
	const max = await sql.query(`select max(sort_order) as max from behavior_types where school_id = $1`, [staff.school_id]);
	return { id: (await sql.query(`insert into behavior_types (school_id, name, sort_order, active, degree, procedures)
       values ($1, $2, $3, true, $4, $5::jsonb) returning id`, [
		staff.school_id,
		name,
		(max[0]?.max ?? 0) + 1,
		data.degree ?? 1,
		JSON.stringify(procedureLadder(data.degree ?? 1))
	]))[0].id };
});
export const updateBehaviorType = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	id: z.number(),
	name: z.string().min(2).max(300).optional(),
	active: z.boolean().optional(),
	degree: z.number().int().min(1).max(5).optional(),
	procedures: z.array(z.array(z.string().max(220)).max(20)).max(8).optional()
}).refine((d) => d.name !== void 0 || d.active !== void 0 || d.degree !== void 0 || d.procedures !== void 0, { message: "لا يوجد تعديل" })).handler(async ({ context, data }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	if (data.procedures) {
		const cleaned = data.procedures.map((stage) => stage.map((item) => item.trim()).filter(Boolean)).filter((stage) => stage.length);
		if (cleaned.length) await sql.query(`update behavior_types set procedures = $1::jsonb where id = $2 and school_id = $3`, [
			JSON.stringify(cleaned),
			data.id,
			staff.school_id
		]);
	}
	if (data.name !== void 0 || data.active !== void 0 || data.degree !== void 0) await patchCatalogItem(sql, staff.school_id, "behavior_types", data);
	return { ok: true };
});
export const listAllActionTypes = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	await ensureActionTypes(sql, staff.school_id);
	return listActionTypeRows(sql, staff.school_id, false);
});
export const createActionType = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ name: z.string().min(2).max(80) })).handler(async ({ context, data }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	return createCatalogItem(sql, staff.school_id, "action_types", data.name.trim());
});
export const updateActionType = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	id: z.number(),
	name: z.string().min(2).max(80).optional(),
	active: z.boolean().optional()
}).refine((d) => d.name !== void 0 || d.active !== void 0, { message: "لا يوجد تعديل" })).handler(async ({ context, data }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	return patchCatalogItem(sql, staff.school_id, "action_types", data);
});
export const createStudent = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	classId: z.number(),
	name: z.string().min(2).max(80),
	parentPhone: z.string().max(20).optional(),
	parentPhone2: z.string().max(20).optional(),
	nationalId: z.string().max(20).optional(),
	nationality: z.string().max(40).optional(),
	nameEn: z.string().max(120).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editStudents");
	await ensureStudentProfile(sql);
	if (!(await sql`
      select id from classes where id = ${data.classId} and school_id = ${staff.school_id}
    `)[0]) throw new Error("الفصل غير موجود");
	const name = data.name.trim();
	const phone = data.parentPhone ? normalizeSaudiPhone(data.parentPhone) : "";
	const phone2 = data.parentPhone2 ? normalizeSaudiPhone(data.parentPhone2) : "";
	const nationalId = String(data.nationalId ?? "").replace(/\D/g, "").slice(0, 10);
	const nationality = String(data.nationality ?? "").trim().slice(0, 40);
	const nameEn = englishName(name, data.nameEn);
	const nextOrder = Number((await sql`
    select coalesce(max(roster_order), 0) + 1 as n
    from students where school_id = ${staff.school_id} and class_id = ${data.classId}
  `)[0]?.n) || 1;
	return { id: (await sql`
      insert into students (school_id, class_id, name, name_en, parent_phone, parent_phone_2, national_id, nationality, roster_order)
      values (${staff.school_id}, ${data.classId}, ${name}, ${nameEn}, ${phone}, ${phone2}, ${nationalId}, ${nationality}, ${nextOrder})
      returning id
    `)[0].id };
});
export const updateStudent = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	studentId: z.number(),
	name: z.string().min(2).max(80),
	parentPhone: z.string().max(20).optional(),
	parentPhone2: z.string().max(20).optional(),
	nationalId: z.string().max(20).optional(),
	nationality: z.string().max(40).optional(),
	classId: z.number(),
	nameEn: z.string().max(120).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editStudents");
	await ensureStudentProfile(sql);
	if (!(await sql`
      select id from classes where id = ${data.classId} and school_id = ${staff.school_id}
    `)[0]) throw new Error("الفصل غير موجود");
	const name = data.name.trim();
	const nameEn = englishName(name, data.nameEn);
	const phone = data.parentPhone ? normalizeSaudiPhone(data.parentPhone) : "";
	const phone2 = data.parentPhone2 ? normalizeSaudiPhone(data.parentPhone2) : "";
	const nationalId = String(data.nationalId ?? "").replace(/\D/g, "").slice(0, 10);
	const nationality = String(data.nationality ?? "").trim().slice(0, 40);
	await sql`
      update students
      set name = ${name}, name_en = ${nameEn},
          parent_phone = ${phone},
          parent_phone_2 = ${phone2},
          national_id = ${nationalId},
          nationality = ${nationality},
          class_id = ${data.classId}
      where id = ${data.studentId} and school_id = ${staff.school_id}
    `;
	return {
		ok: true,
		classId: data.classId
	};
});
export const requestClassMove = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	studentId: z.number(),
	classId: z.number()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	await ensureClassMoveRequests(sql);
	await ensureNoticeStudent(sql);
	const student = (await sql`
      select s.id, s.name, s.class_id, c.name as class_name, st.short_name
      from students s
      join classes c on c.id = s.class_id
      join stages st on st.id = c.stage_id
      where s.id = ${data.studentId} and s.school_id = ${staff.school_id}
    `)[0];
	if (!student) throw new Error("الطالب غير موجود");
	if (student.class_id === data.classId) throw new Error("الطالب في هذا الفصل بالفعل");
	const target = (await sql`
      select c.id, c.name, st.short_name
      from classes c
      join stages st on st.id = c.stage_id
      where c.id = ${data.classId} and c.school_id = ${staff.school_id}
    `)[0];
	if (!target) throw new Error("الفصل غير موجود");
	const fromLabel = classLabel(student.short_name, student.class_name);
	const toLabel = classLabel(target.short_name, target.name);
	const existing = (await sql`
      select id, to_class_id, requested_by
      from class_move_requests
      where school_id = ${staff.school_id} and student_id = ${student.id} and status = 'pending'
      order by id desc
      limit 1
    `)[0];
	if (existing && Number(existing.to_class_id) === Number(target.id) && existing.requested_by === staff.user_id) {
		return { ok: true, applied: false, pending: true, toLabel };
	}
	if (existing) {
		await sql`
        update class_move_requests
        set from_class_id = ${student.class_id},
            to_class_id = ${target.id},
            requested_by = ${staff.user_id},
            created_at = now()
        where id = ${existing.id} and school_id = ${staff.school_id}
      `;
	} else {
		await sql`
        insert into class_move_requests (school_id, student_id, from_class_id, to_class_id, requested_by, status)
        values (${staff.school_id}, ${student.id}, ${student.class_id}, ${target.id}, ${staff.user_id}, ${"pending"})
      `;
	}
	await notifyDeskInbox(sql, school, staff, {
		noteId: null,
		studentId: student.id,
		kind: "class-move",
		title: "طلب نقل فصل",
		body: `${staff.display_name} يطلب نقل الطالب ${student.name} من ${fromLabel} إلى ${toLabel}.`,
		tone: "warn"
	});
	return { ok: true, applied: false, pending: true, toLabel };
});
export const listDeskInbox = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	const seeMoves = canSeeMoveInbox(staff, school);
	const seeStudy = canSeeStudyInbox(staff, school);
	const canMessage = staff.role === "admin" || Boolean(mappedPerms(staff, school).sendMessages);
	await ensureClassMoveRequests(sql);
	const mapMove = (row) => ({
		id: row.id,
		studentId: row.student_id,
		studentName: row.student_name,
		fromLabel: classLabel(row.from_short, row.from_name),
		toLabel: classLabel(row.to_short, row.to_name),
		requesterName: row.requester_name || "موظف",
		requesterRole: row.requester_role || "teacher",
		status: row.status === "applied" || row.status === "rejected" ? row.status : "pending",
		reason: row.decision_note || "",
		deciderName: row.decider_name || "",
		createdAt: row.created_at,
		decidedAt: row.decided_at || ""
	});
	const mineRows = await sql`
      select r.id, r.student_id, r.status, coalesce(r.decision_note, '') as decision_note,
             r.created_at::text as created_at, r.decided_at::text as decided_at,
             s.name as student_name,
             coalesce(fc.name, '') as from_name, coalesce(fs.short_name, '') as from_short,
             coalesce(tc.name, '') as to_name, coalesce(ts.short_name, '') as to_short,
             coalesce(sf.display_name, '') as requester_name,
             coalesce(sf.role, 'teacher') as requester_role,
             coalesce(df.display_name, '') as decider_name
      from class_move_requests r
      join students s on s.id = r.student_id
      left join classes fc on fc.id = r.from_class_id
      left join stages fs on fs.id = fc.stage_id
      left join classes tc on tc.id = r.to_class_id
      left join stages ts on ts.id = tc.stage_id
      left join staff sf on sf.user_id = r.requested_by and sf.school_id = r.school_id
      left join staff df on df.user_id = r.decided_by and df.school_id = r.school_id
      where r.school_id = ${staff.school_id}
        and r.requested_by = ${staff.user_id}
        and r.created_at > now() - interval '120 days'
      order by r.id desc
      limit 40
    `;
	const mine = mineRows.map(mapMove);
	if (!seeMoves && !seeStudy && !canMessage) {
		return { visible: mine.length > 0, canHandle: false, moves: [], notices: [], decisions: [], mine, studyMessages: [] };
	}
	const moves = seeMoves ? await sql`
      select r.id, r.student_id, r.created_at::text as created_at,
             s.name as student_name,
             coalesce(fc.name, '') as from_name, coalesce(fs.short_name, '') as from_short,
             tc.name as to_name, ts.short_name as to_short,
             coalesce(sf.display_name, '') as requester_name,
             coalesce(sf.role, 'teacher') as requester_role
      from class_move_requests r
      join students s on s.id = r.student_id
      left join classes fc on fc.id = r.from_class_id
      left join stages fs on fs.id = fc.stage_id
      join classes tc on tc.id = r.to_class_id
      join stages ts on ts.id = tc.stage_id
      left join staff sf on sf.user_id = r.requested_by and sf.school_id = r.school_id
      where r.school_id = ${staff.school_id} and r.status = 'pending'
      order by r.created_at desc
      limit 80
    ` : [];
	const studySql = seeStudy
		? sql`
      select n.id, n.details, n.suggested_action, n.compensation, n.teacher_id,
             n.created_at::text as created_at,
             s.id as student_id, s.name as student_name, coalesce(s.parent_phone, '') as parent_phone,
             c.name as class_name, st.short_name,
             coalesce(sf.display_name, '') as teacher_name
      from notes n
      join students s on s.id = n.student_id
      join classes c on c.id = s.class_id
      join stages st on st.id = c.stage_id
      left join staff sf on sf.user_id = n.teacher_id and sf.school_id = n.school_id
      where n.school_id = ${staff.school_id}
        and n.type = 'homework'
        and n.status = 'open'
        and n.suggested_action like ${STUDY_PARENT_MARK + "%"}
      order by n.created_at asc
      limit 80
    `
		: sql`
      select n.id, n.details, n.suggested_action, n.compensation, n.teacher_id,
             n.created_at::text as created_at,
             s.id as student_id, s.name as student_name, coalesce(s.parent_phone, '') as parent_phone,
             c.name as class_name, st.short_name,
             coalesce(sf.display_name, '') as teacher_name
      from notes n
      join students s on s.id = n.student_id
      join classes c on c.id = s.class_id
      join stages st on st.id = c.stage_id
      left join staff sf on sf.user_id = n.teacher_id and sf.school_id = n.school_id
      where n.school_id = ${staff.school_id}
        and n.type = 'homework'
        and n.status = 'open'
        and n.teacher_id = ${staff.user_id}
        and n.suggested_action like ${STUDY_PARENT_MARK + "%"}
      order by n.created_at asc
      limit 80
    `;
	const study = seeStudy || canMessage ? await studySql : [];
	const pendingStudentIds = new Set((seeMoves ? moves : []).map((row) => Number(row.student_id)));
	let noticeRows = [];
	if (seeMoves) {
		try {
			await ensureNoticeStudent(sql);
			noticeRows = await sql`
        select ntf.id, ntf.student_id, ntf.body, ntf.created_at::text as created_at,
               coalesce(s.name, '') as student_name
        from notifications ntf
        left join students s on s.id = ntf.student_id
        where ntf.school_id = ${staff.school_id}
          and ntf.user_id = ${staff.user_id}
          and ntf.kind = 'class-move'
          and ntf.created_at > now() - interval '60 days'
        order by ntf.created_at desc
        limit 40
      `;
		} catch {
			noticeRows = [];
		}
	}
	const seenNotice = new Set();
	const notices = [];
	for (const row of noticeRows) {
		if (row.student_id && pendingStudentIds.has(Number(row.student_id))) continue;
		const key = `${row.student_id || 0}:${row.body}`;
		if (seenNotice.has(key)) continue;
		seenNotice.add(key);
		notices.push({
			id: row.id,
			studentId: row.student_id ?? null,
			studentName: row.student_name || "",
			body: row.body || "",
			createdAt: row.created_at
		});
	}
	return {
		visible: true,
		canHandle: seeStudy,
		moves: moves.map((row) => ({
			id: row.id,
			studentId: row.student_id,
			studentName: row.student_name,
			fromLabel: classLabel(row.from_short, row.from_name),
			toLabel: classLabel(row.to_short, row.to_name),
			requesterName: row.requester_name || "موظف",
			requesterRole: row.requester_role || "teacher",
			createdAt: row.created_at
		})),
		notices,
		decisions: seeMoves ? (await sql`
      select r.id, r.student_id, r.status, coalesce(r.decision_note, '') as decision_note,
             r.created_at::text as created_at, r.decided_at::text as decided_at,
             s.name as student_name,
             coalesce(fc.name, '') as from_name, coalesce(fs.short_name, '') as from_short,
             coalesce(tc.name, '') as to_name, coalesce(ts.short_name, '') as to_short,
             coalesce(sf.display_name, '') as requester_name,
             coalesce(sf.role, 'teacher') as requester_role,
             coalesce(df.display_name, '') as decider_name
      from class_move_requests r
      join students s on s.id = r.student_id
      left join classes fc on fc.id = r.from_class_id
      left join stages fs on fs.id = fc.stage_id
      left join classes tc on tc.id = r.to_class_id
      left join stages ts on ts.id = tc.stage_id
      left join staff sf on sf.user_id = r.requested_by and sf.school_id = r.school_id
      left join staff df on df.user_id = r.decided_by and df.school_id = r.school_id
      where r.school_id = ${staff.school_id}
        and r.status in ('applied', 'rejected')
        and r.decided_at > now() - interval '60 days'
      order by r.decided_at desc
      limit 40
    `).map(mapMove) : [],
		mine,
		studyMessages: study.map((row) => ({
			id: row.id,
			studentId: row.student_id,
			studentName: row.student_name,
			classLabel: classLabel(row.short_name, row.class_name),
			teacherName: row.teacher_name || "معلم",
			details: row.details || "",
			compensation: row.compensation || "",
			body: studyParentBody(row.suggested_action),
			parentPhone: revealPhone(staff, school, row.parent_phone),
			createdAt: row.created_at
		}))
	};
});
export const decideClassMove = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	requestId: z.number(),
	decision: z.enum(["apply", "reject"]),
	reason: z.string().max(400).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	if (!canSeeMoveInbox(staff, school)) throw new Error("ليست لديك صلاحية هذا الطلب");
	await ensureClassMoveRequests(sql);
	const reason = (data.reason ?? "").trim();
	if (data.decision === "reject" && reason.length < 2) throw new Error("اكتب سبب الرفض");
	const row = (await sql`
      select r.id, r.student_id, r.requested_by, r.to_class_id, r.from_class_id,
             s.name as student_name,
             coalesce(fc.name, '') as from_name, coalesce(fs.short_name, '') as from_short,
             tc.name as to_name, ts.short_name as to_short
      from class_move_requests r
      join students s on s.id = r.student_id
      left join classes fc on fc.id = r.from_class_id
      left join stages fs on fs.id = fc.stage_id
      join classes tc on tc.id = r.to_class_id
      join stages ts on ts.id = tc.stage_id
      where r.id = ${data.requestId} and r.school_id = ${staff.school_id} and r.status = 'pending'
    `)[0];
	if (!row) throw new Error("الطلب غير موجود أو عُولج");
	const toLabel = classLabel(row.to_short, row.to_name);
	const fromLabel = classLabel(row.from_short, row.from_name);
	const note = data.decision === "apply" ? "تم قبول النقل" : reason;
	if (data.decision === "apply") {
		const target = (await sql`select id from classes where id = ${row.to_class_id} and school_id = ${staff.school_id}`)[0];
		if (!target) throw new Error("الفصل غير موجود");
		await sql`
        update students set class_id = ${row.to_class_id}
        where id = ${row.student_id} and school_id = ${staff.school_id}
      `;
		await sql`
        update class_move_requests
        set status = 'applied', decided_by = ${staff.user_id}, decided_at = now(), decision_note = ${note}
        where id = ${row.id} and school_id = ${staff.school_id}
      `;
	} else {
		await sql`
        update class_move_requests
        set status = 'rejected', decided_by = ${staff.user_id}, decided_at = now(), decision_note = ${note}
        where id = ${row.id} and school_id = ${staff.school_id}
      `;
	}
	const resultLine = data.decision === "apply"
		? `قُبل نقل الطالب ${row.student_name} من ${fromLabel} إلى ${toLabel}.`
		: `رُفض نقل الطالب ${row.student_name} من ${fromLabel} إلى ${toLabel}. السبب: ${reason}`;
	const actionText = data.decision === "apply"
		? `قبول النقل من ${fromLabel} إلى ${toLabel}`
		: `رفض النقل من ${fromLabel} إلى ${toLabel}. السبب: ${reason}`;
	await notifyActionSplit(sql, school, staff, {
		authorId: row.requested_by,
		noteId: null,
		studentId: row.student_id,
		observation: resultLine,
		actionText,
		kind: "class-move"
	});
	return { ok: true, applied: data.decision === "apply", toLabel, studentName: row.student_name };
});
export const sendStudyParentNotice = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	noteId: z.number(),
	closeWithoutSend: z.boolean().optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	const note = (await sql`
      select n.id, n.teacher_id, n.details, n.suggested_action, n.compensation, n.status, n.type,
             s.id as student_id, s.name as student_name, coalesce(s.parent_phone, '') as parent_phone
      from notes n
      join students s on s.id = n.student_id
      where n.id = ${data.noteId} and n.school_id = ${staff.school_id}
    `)[0];
	if (!note || note.type !== "homework" || note.status !== "open") throw new Error("الملاحظة ليست بانتظار الإرسال");
	const body = studyParentBody(note.suggested_action);
	if (!body) throw new Error("الملاحظة ليست بانتظار الإرسال");
	if (data.closeWithoutSend) {
		if (!canSeeStudyInbox(staff, school)) throw new Error("ليست لديك صلاحية إرسال هذا الإشعار");
		const actionTaken = note.compensation ? `${note.compensation} — تعذر إرسال إشعار ولي الأمر` : "تعذر إرسال إشعار ولي الأمر";
		await sql`
        update notes
        set status = 'closed', action_taken = ${actionTaken}, closed_at = now(), closed_by = ${staff.user_id}
        where id = ${note.id} and school_id = ${staff.school_id}
      `;
		await notifyActionSplit(sql, school, staff, {
			authorId: note.teacher_id,
			noteId: note.id,
			studentId: note.student_id,
			observation: `الملاحظة على الطالب ${note.student_name}: ${note.details}`,
			actionText: actionTaken,
			kind: "study-message"
		});
		return { ok: true, closed: true, whatsapp: null };
	}
	if (!canSendHeldStudy(staff, school, note)) throw new Error("ليست لديك صلاحية إرسال هذا الإشعار");
	const phone = note.parent_phone || "";
	if (!phone) throw new Error("لا يوجد رقم ولي أمر");
	await sql.query(`alter table parent_messages add column if not exists note_id integer`);
	await sql`
      insert into parent_messages (school_id, student_id, staff_id, kind, body, parent_phone, note_id)
      values (${staff.school_id}, ${note.student_id}, ${staff.user_id}, ${"homework"}, ${body}, ${phone}, ${note.id})
    `;
	const actionTaken = note.compensation ? `${note.compensation} — أُرسل إشعار ولي الأمر` : "أُرسل إشعار ولي الأمر";
	await sql`
      update notes
      set status = 'closed', action_taken = ${actionTaken}, closed_at = now(), closed_by = ${staff.user_id}
      where id = ${note.id} and school_id = ${staff.school_id}
    `;
	await notifyActionSplit(sql, school, staff, {
		authorId: note.teacher_id,
		noteId: note.id,
		studentId: note.student_id,
		observation: `الملاحظة على الطالب ${note.student_name}: ${note.details}`,
		actionText: actionTaken,
		kind: "study-message"
	});
	return { ok: true, closed: false, whatsapp: { phone, body }, studentName: note.student_name };
});
export const deleteStudent = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ studentId: z.number() })).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editStudents");
	if (!(await sql`
      select id from students
      where id = ${data.studentId} and school_id = ${staff.school_id}
    `)[0]) throw new Error("الطالب غير موجود");
	await sql`
      delete from students
      where id = ${data.studentId} and school_id = ${staff.school_id}
    `;
	return { ok: true };
});
export const bulkDeleteStudents = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	scope: z.enum(["all", "stage", "class"]),
	stageId: z.number().optional(),
	classId: z.number().optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editStudents");
	let deleted = 0;
	if (data.scope === "all") {
		const rows = await sql`delete from students where school_id = ${staff.school_id} returning id`;
		deleted = rows.length;
	} else if (data.scope === "stage") {
		if (!data.stageId) throw new Error("حدد المرحلة");
		const stage = (await sql`select id from stages where id = ${data.stageId} and school_id = ${staff.school_id}`)[0];
		if (!stage) throw new Error("المرحلة غير موجودة");
		const rows = await sql`
      delete from students
      where school_id = ${staff.school_id}
        and class_id in (select id from classes where stage_id = ${data.stageId} and school_id = ${staff.school_id})
      returning id`;
		deleted = rows.length;
	} else {
		if (!data.classId) throw new Error("حدد الفصل");
		const cls = (await sql`select id from classes where id = ${data.classId} and school_id = ${staff.school_id}`)[0];
		if (!cls) throw new Error("الفصل غير موجود");
		const rows = await sql`delete from students where school_id = ${staff.school_id} and class_id = ${data.classId} returning id`;
		deleted = rows.length;
	}
	return { ok: true, deleted };
});
export const bulkDeleteStaff = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	scope: z.enum(["teachers", "selected"]),
	userIds: z.array(z.string()).max(200).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editStaff");
	let targets = [];
	if (data.scope === "teachers") {
		targets = await sql`select user_id, display_name, role from staff where school_id = ${staff.school_id} and role = 'teacher'`;
	} else {
		const ids = [...new Set(data.userIds ?? [])];
		if (!ids.length) throw new Error("لم يُحدد موظفون للحذف");
		targets = [];
		for (const id of ids) {
			const row = (await sql`select user_id, display_name, role from staff where user_id = ${id} and school_id = ${staff.school_id}`)[0];
			if (row) targets.push(row);
		}
	}
	let deleted = 0;
	const skipped = [];
	for (const t of targets) {
		if (t.user_id === staff.user_id) {
			skipped.push(t.display_name);
			continue;
		}
		if (t.role === "admin") {
			const others = (await sql`
        select count(*)::int as count from staff
        where school_id = ${staff.school_id} and role = 'admin' and coalesce(active, true) = true and user_id <> ${t.user_id}
      `)[0]?.count ?? 0;
			if (others < 1) {
				skipped.push(t.display_name);
				continue;
			}
		}
		await sql`delete from notifications where user_id = ${t.user_id} and school_id = ${staff.school_id}`;
		await sql`delete from staff where user_id = ${t.user_id} and school_id = ${staff.school_id}`;
		try {
			await sql`delete from "session" where "userId" = ${t.user_id}`;
			await sql`delete from "account" where "userId" = ${t.user_id}`;
			await sql`delete from "user" where id = ${t.user_id}`;
		} catch {}
		deleted += 1;
	}
	return { ok: true, deleted, skipped };
});
export const updateSchoolPermissions = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	teachersCanMessage: z.boolean(),
	teachersCanViewAll: z.boolean()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	await sql`
      update schools
      set teachers_can_message = ${data.teachersCanMessage},
          teachers_can_view_all = ${data.teachersCanViewAll}
      where id = ${staff.school_id}
    `;
	return data;
});
export const logParentMessage = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	studentId: z.number(),
	kind: z.enum([
		"absence",
		"late",
		"homework",
		"behavior",
		"general"
	]),
	body: z.string().min(2).max(2e3),
	parentPhone: z.string().max(20).optional(),
	noteId: z.number().optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	if (!mappedPerms(staff, school).sendMessages) throw new Error("إرسال رسائل أولياء الأمور غير مفعّل لحسابك");
	const student = await sql`
      select id, parent_phone from students
      where id = ${data.studentId} and school_id = ${staff.school_id}
    `;
	if (!student[0]) throw new Error("الطالب غير موجود");
	try {
		await sql.query(`alter table parent_messages add column if not exists note_id integer`);
	} catch {}
	let noteId = null;
	if (data.noteId) {
		const note = (await sql`
        select id from notes
        where id = ${data.noteId} and student_id = ${student[0].id} and school_id = ${staff.school_id}
      `)[0];
		noteId = note?.id ?? null;
	}
	const phone = data.parentPhone || student[0].parent_phone;
	return { id: (await sql`
      insert into parent_messages (school_id, student_id, staff_id, kind, body, parent_phone, note_id)
      values (${staff.school_id}, ${student[0].id}, ${staff.user_id}, ${data.kind}, ${data.body.trim()}, ${phone}, ${noteId})
      returning id
    `)[0]?.id };
});
export const listParentMessages = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	studentId: z.number().optional(),
	classId: z.number().optional(),
	stageId: z.number().optional(),
	from: z.string().optional(),
	to: z.string().optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	try {
		await sql.query(`alter table parent_messages add column if not exists note_id integer`);
	} catch {}
	const params = [staff.school_id];
	let where = "m.school_id = $1";
	if (data.studentId) {
		params.push(data.studentId);
		where += ` and m.student_id = $${params.length}`;
	}
	if (data.classId) {
		params.push(data.classId);
		where += ` and s.class_id = $${params.length}`;
	}
	if (data.stageId) {
		params.push(data.stageId);
		where += ` and c.stage_id = $${params.length}`;
	}
	if (data.from) {
		params.push(data.from);
		where += ` and m.created_at >= $${params.length}::date`;
	}
	if (data.to) {
		params.push(data.to);
		where += ` and m.created_at < ($${params.length}::date + interval '1 day')`;
	}
	if (staff.role === "teacher" && !mappedPerms(staff, school).editRecords) {
		params.push(staff.user_id);
		where += ` and m.staff_id = $${params.length}`;
	}
	return { messages: (await sql.query(`select m.id, m.student_id, s.name as student_name, c.name as class_name,
              stg.short_name, coalesce(sf.display_name, 'موظف') as staff_name,
              m.kind, m.body, m.parent_phone, m.note_id, m.created_at::text as created_at
       from parent_messages m
       join students s on s.id = m.student_id
       join classes c on c.id = s.class_id
       join stages stg on stg.id = c.stage_id
       left join staff sf on sf.user_id = m.staff_id
       where ${where}
       order by m.created_at desc
       limit 400`, params)).map((r) => ({
		id: r.id,
		studentId: r.student_id,
		studentName: r.student_name,
		className: r.class_name,
		shortName: r.short_name,
		staffName: r.staff_name,
		kind: r.kind,
		body: r.body,
		noteId: r.note_id ?? null,
		parentPhone: revealPhone(staff, school, r.parent_phone),
		createdAt: r.created_at
	})) };
});
async function listImprovementRows(sql, schoolId, opts) {
	const params = [schoolId];
	let where = "i.school_id = $1";
	if (opts.studentId) {
		params.push(opts.studentId);
		where += ` and i.student_id = $${params.length}`;
	}
	if (opts.teacherId) {
		params.push(opts.teacherId);
		where += ` and i.teacher_id = $${params.length}`;
	}
	if (opts.openOnly) where += ` and i.status <> 'closed'`;
	return (await sql.query(`select i.id, i.student_id, s.name as student_name, c.name as class_name, stg.short_name,
            i.teacher_id, coalesce(sf.display_name, 'معلم') as teacher_name,
            coalesce(sf.subject, '') as teacher_subject,
            i.note_id, i.plan, i.teacher_followup, i.counselor_note, i.status,
            i.created_at::text as created_at, i.updated_at::text as updated_at
     from behavior_improvements i
     join students s on s.id = i.student_id
     join classes c on c.id = s.class_id
     join stages stg on stg.id = c.stage_id
     left join staff sf on sf.user_id = i.teacher_id
     where ${where}
     order by i.created_at desc
     limit 200`, params)).map((r) => ({
		id: r.id,
		studentId: r.student_id,
		studentName: r.student_name,
		classLabel: classLabel(r.short_name, r.class_name),
		teacherId: r.teacher_id,
		teacherName: r.teacher_name,
		teacherSubject: r.teacher_subject,
		noteId: r.note_id,
		plan: r.plan,
		teacherFollowup: r.teacher_followup,
		counselorNote: r.counselor_note,
		status: r.status,
		createdAt: r.created_at,
		updatedAt: r.updated_at
	}));
}
export const listImprovements = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	studentId: z.number().optional(),
	openOnly: z.boolean().optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	const hideOthers = cannotViewAll(staff, school) && !mappedPerms(staff, school).editRecords;
	return listImprovementRows(sql, staff.school_id, {
		studentId: data.studentId,
		teacherId: hideOthers ? staff.user_id : void 0,
		openOnly: data.openOnly
	});
});
export const createImprovement = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	studentId: z.number(),
	plan: z.string().min(4).max(800),
	noteId: z.number().optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireApproved(context.userId);
	const student = await sql`
      select id, name from students
      where id = ${data.studentId} and school_id = ${staff.school_id}
    `;
	if (!student[0]) throw new Error("الطالب غير موجود");
	let noteId = null;
	if (data.noteId) noteId = (await sql`
        select id from notes
        where id = ${data.noteId} and student_id = ${student[0].id} and school_id = ${staff.school_id}
      `)[0]?.id ?? null;
	const inserted = await sql`
      insert into behavior_improvements
        (school_id, student_id, teacher_id, note_id, plan)
      values (${staff.school_id}, ${student[0].id}, ${staff.user_id}, ${noteId}, ${data.plan.trim()})
      returning id
    `;
	const title = "خطة تحسين سلوك";
	const body = `قدّم ${staff.display_name} خطة لتحسين سلوك الطالب ${student[0].name}.`;
	const schoolRow = await loadSchool(sql, staff.school_id);
	const recipients = await sql`
      select user_id, role, coalesce(permissions::text, '{}') as permissions from staff
      where school_id = ${staff.school_id}
        and user_id <> ${staff.user_id}
    `;
	for (const rec of recipients) {
		if (!parsePermissions(rec.permissions, rec.role, schoolRow ? mapSchool(schoolRow) : void 0).acceptImprovements) continue;
		await sql`
        insert into notifications (school_id, user_id, note_id, kind, title, body, tone)
        values (${staff.school_id}, ${rec.user_id}, ${noteId}, ${"improve"}, ${title}, ${body}, ${"ok"})
      `;
	}
	return {
		id: inserted[0]?.id,
		studentName: student[0].name
	};
});
export const followImprovement = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	id: z.number(),
	teacherFollowup: z.string().max(800).optional(),
	counselorNote: z.string().max(800).optional(),
	status: z.enum([
		"open",
		"following",
		"closed"
	]).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	const row = (await sql`
      select i.id, i.teacher_id, s.name as student_name
      from behavior_improvements i
      join students s on s.id = i.student_id
      where i.id = ${data.id} and i.school_id = ${staff.school_id}
    `)[0];
	if (!row) throw new Error("الخطة غير موجودة");
	const lead = mappedPerms(staff, school).acceptImprovements;
	if (!lead && row.teacher_id !== staff.user_id) throw new Error("لا يمكنك تعديل خطة معلم آخر");
	const teacherFollowup = data.teacherFollowup?.trim();
	const counselorNote = lead ? data.counselorNote?.trim() : void 0;
	const status = lead ? data.status : void 0;
	if (teacherFollowup !== void 0) await sql`
        update behavior_improvements
        set teacher_followup = ${teacherFollowup}, updated_at = now()
        where id = ${row.id}
      `;
	if (counselorNote !== void 0) await sql`
        update behavior_improvements
        set counselor_note = ${counselorNote}, updated_at = now()
        where id = ${row.id}
      `;
	if (status) {
		if (status === "closed") await sql`
          update behavior_improvements
          set status = ${status}, closed_at = now(), closed_by = ${staff.user_id}, updated_at = now()
          where id = ${row.id}
        `;
		else await sql`
          update behavior_improvements
          set status = ${status}, updated_at = now()
          where id = ${row.id}
        `;
		if (row.teacher_id !== staff.user_id) {
			const title = status === "closed" ? "أُغلقت خطة التحسين" : "متابعة خطة التحسين";
			const body = status === "closed" ? `أغلق المرشد خطة تحسين سلوك الطالب ${row.student_name}.` : `تابع المرشد خطة تحسين سلوك الطالب ${row.student_name}.`;
			await sql`
          insert into notifications (school_id, user_id, note_id, kind, title, body, tone)
          values (${staff.school_id}, ${row.teacher_id}, ${null}, ${"improve"}, ${title}, ${body}, ${"ok"})
        `;
		}
	}
	return { ok: true };
});
var permissionShape = z.object({
	editStudents: z.boolean().optional(),
	sendMessages: z.boolean().optional(),
	viewAllViolations: z.boolean().optional(),
	editStaff: z.boolean().optional(),
	takeActions: z.boolean().optional(),
	acceptImprovements: z.boolean().optional(),
	dailyAttendance: z.boolean().optional(),
	counseling: z.boolean().optional(),
	editRecords: z.boolean().optional(),
	editClasses: z.boolean().optional(),
	viewClasses: z.boolean().optional(),
	viewPrint: z.boolean().optional()
});
export const updateStaffPermissions = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	userId: z.string(),
	permissions: permissionShape
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requirePerm(context.userId, "editStaff");
	const target = await sql`
      select user_id, role, coalesce(permissions::text, '{}') as permissions from staff
      where user_id = ${data.userId} and school_id = ${staff.school_id}
    `;
	if (!target[0]) throw new Error("الموظف غير موجود");
	if (target[0].role === "admin") throw new Error("مدير التطبيق يملك كل الصلاحيات ولا تُقيَّد");
	const mapped = mapSchool(school);
	const next = parsePermissions({
		...parsePermissions(target[0].permissions, target[0].role, mapped),
		...data.permissions
	}, target[0].role, mapped);
	await sql.query(`update staff set permissions = $1::jsonb where user_id = $2 and school_id = $3`, [
		JSON.stringify(next),
		data.userId,
		staff.school_id
	]);
	return {
		userId: data.userId,
		permissions: next
	};
});
var appearanceShape = z.object({
	themeId: z.enum([
		"oasis",
		"ministry",
		"navy",
		"sand",
		"olive",
		"rose",
		"sky",
		"night"
	]),
	font: z.enum([
		"cairo",
		"messiri",
		"tajawal",
		"almarai",
		"ibm",
		"readex",
		"amiri",
		"naskh"
	]),
	fontScale: z.number().min(.8).max(1.5).optional(),
	calendar: z.enum(["hijri", "gregorian"]).optional(),
	locale: z.enum(["ar", "en"]).optional(),
	custom: z.object({
		primary: z.string().max(20).optional(),
		bg: z.string().max(20).optional(),
		fg: z.string().max(20).optional(),
		card: z.string().max(20).optional()
	}).optional()
});
export const updateAppearance = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	scope: z.enum(["personal", "school"]),
	appearance: appearanceShape.optional(),
	reset: z.boolean().optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	if (data.reset) {
		await sql.query(`update staff set appearance = $1::jsonb where user_id = $2`, ["{}", staff.user_id]);
		return {
			scope: "personal",
			appearance: parseAppearance(school.appearance)
		};
	}
	const appearance = parseAppearance(data.appearance);
	if (!appearance.locale) {
		const prev = parseOptionalAppearance(staff.appearance)?.locale;
		if (prev) appearance.locale = prev;
	}
	if (data.scope === "school") {
		if (staff.role !== "admin") throw new Error("تعميم المظهر على المدرسة للمدير فقط");
		const { locale: _locale, ...schoolLook } = appearance;
		await sql.query(`update schools set appearance = $1::jsonb where id = $2`, [JSON.stringify(schoolLook), staff.school_id]);
	} else await sql.query(`update staff set appearance = $1::jsonb where user_id = $2`, [JSON.stringify(appearance), staff.user_id]);
	return {
		scope: data.scope,
		appearance
	};
});
export const setPreferredLocale = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	locale: z.enum(["ar", "en"])
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireApproved(context.userId);
	await sql.query(`update staff set appearance = coalesce(appearance, '{}'::jsonb) || $1::jsonb where user_id = $2`, [
		JSON.stringify({ locale: data.locale }),
		staff.user_id
	]);
	return { locale: data.locale };
});
function todayISODate() {
	const d = /* @__PURE__ */ new Date();
	const pad = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const getDailyAttendance = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	day: z.string().max(12).optional(),
	classId: z.number().optional(),
	stageId: z.number().optional(),
	classIds: z.array(z.number()).max(80).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "dailyAttendance");
	await ensureStudentProfile(sql);
	const day = data.day?.trim() || todayISODate();
	const params = [staff.school_id];
	let where = `s.school_id = $1`;
	if (data.classIds && data.classIds.length === 0) return {
		day,
		students: []
	};
	if (data.classIds && data.classIds.length) {
		const start = params.length + 1;
		for (const id of data.classIds) params.push(id);
		const placeholders = data.classIds.map((_, i) => `$${start + i}`).join(", ");
		where += ` and s.class_id in (${placeholders})`;
	} else {
		if (data.stageId) {
			params.push(data.stageId);
			where += ` and c.stage_id = $${params.length}`;
		}
		if (data.classId) {
			params.push(data.classId);
			where += ` and s.class_id = $${params.length}`;
		}
	}
	params.push(day);
	const dayIdx = params.length;
	return {
		day,
		students: (await sql.query(`select s.id, s.name, coalesce(s.name_en, '') as name_en, s.class_id, c.name as class_name, st.short_name, st.name as stage_name,
              case when abs.id is not null then 'absence' when lt.id is not null then 'late' else null end as kind,
              coalesce(abs.excused, false) as excused,
              '' as details,
              lt.arrived_at::text as arrived_at,
              (lv.id is not null) as has_leave,
              coalesce(lv.details, '') as leave_details
       from students s
       join classes c on c.id = s.class_id
       join stages st on st.id = c.stage_id
       left join daily_attendance abs
         on abs.student_id = s.id and abs.school_id = s.school_id and abs.day = $${dayIdx}::date and abs.kind = 'absence'
       left join daily_attendance lt
         on lt.student_id = s.id and lt.school_id = s.school_id and lt.day = $${dayIdx}::date and lt.kind = 'late'
       left join daily_attendance lv
         on lv.student_id = s.id and lv.school_id = s.school_id and lv.day = $${dayIdx}::date and lv.kind = 'leave'
       where ${where}
       order by st.sort_order, c.sort_order, s.roster_order nulls last, s.id`, params)).map((r) => ({
			studentId: r.id,
			studentName: r.name,
			nameEn: r.name_en ?? "",
			classId: r.class_id,
			classLabel: classLabel(r.short_name, r.class_name),
			kind: r.kind ?? null,
			excused: Boolean(r.excused),
			details: "",
			arrivedAt: r.arrived_at || null,
			hasLeave: Boolean(r.has_leave),
			leaveDetails: r.leave_details ?? ""
		}))
	};
});
async function ensureAttendanceStamp(sql) {
	await sql`alter table daily_attendance add column if not exists recorded_at timestamptz`;
}
export const saveDailyAttendance = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	day: z.string().min(8).max(12),
	entries: z.array(z.object({
		studentId: z.number(),
		kind: z.enum([
			"present",
			"absence",
			"late",
			"leave"
		]),
		clear: z.enum(["absence", "late", "leave", "all"]).optional(),
		excused: z.boolean().optional(),
		details: z.string().max(200).optional(),
		arrivedAt: z.string().max(40).optional()
	}))
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "dailyAttendance");
	await ensureAttendanceStamp(sql);
	const day = data.day.trim();
	for (const entry of data.entries) {
		if (!(await sql`
          select id from students where id = ${entry.studentId} and school_id = ${staff.school_id}
        `)[0]) continue;
		if (entry.kind === "present") {
			const clear = entry.clear ?? "all";
			if (clear === "all") {
				await sql`
            delete from daily_attendance
            where school_id = ${staff.school_id} and student_id = ${entry.studentId} and day = ${day}::date
          `;
			} else {
				await sql`
            delete from daily_attendance
            where school_id = ${staff.school_id} and student_id = ${entry.studentId} and day = ${day}::date and kind = ${clear}
          `;
			}
			continue;
		}
		if (entry.kind === "absence") {
			await sql`
          delete from daily_attendance
          where school_id = ${staff.school_id} and student_id = ${entry.studentId} and day = ${day}::date and kind in ('late', 'leave')
        `;
		} else {
			await sql`
          delete from daily_attendance
          where school_id = ${staff.school_id} and student_id = ${entry.studentId} and day = ${day}::date and kind = 'absence'
        `;
		}
		const arrived = entry.kind === "late" ? entry.arrivedAt?.trim() ? new Date(entry.arrivedAt).toISOString() : (/* @__PURE__ */ new Date()).toISOString() : null;
		await sql.query(`insert into daily_attendance (school_id, student_id, day, kind, excused, details, recorded_by, arrived_at, recorded_at)
         values ($1, $2, $3::date, $4, $5, $6, $7, $8, now())
         on conflict (school_id, student_id, day, kind)
         do update set excused = excluded.excused, details = excluded.details, recorded_by = excluded.recorded_by, arrived_at = excluded.arrived_at, recorded_at = now()`, [
			staff.school_id,
			entry.studentId,
			day,
			entry.kind,
			Boolean(entry.excused),
			entry.details?.trim() ?? "",
			staff.user_id,
			arrived
		]);
	}
	const school = await loadSchool(sql, staff.school_id);
	await upsertAttendanceDigest(sql, staff, school);
	return {
		ok: true,
		day
	};
});
export const getCounselingDesk = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requirePerm(context.userId, "counseling");
	const referrals = await sql`
      select n.id, n.student_id, s.name as student_name, c.name as class_name, st.short_name,
             n.type, n.details, n.status, n.action_taken,
             n.created_at::text as created_at,
             coalesce(n.occurred_at, n.created_at)::text as occurred_at,
             coalesce(n.suggested_action, '') as suggested_action,
             coalesce(n.compensation, '') as compensation,
             bt.name as behavior_type_name, bt.degree as behavior_degree,
             n.behavior_type_id,
             coalesce(sf.display_name, 'معلم') as teacher_name,
             coalesce(sf.subject, '') as teacher_subject,
             coalesce(n.period_key, '') as period_key
      from notes n
      join students s on s.id = n.student_id
      join classes c on c.id = s.class_id
      join stages st on st.id = c.stage_id
      left join behavior_types bt on bt.id = n.behavior_type_id
      left join staff sf on sf.user_id = n.teacher_id
      where n.school_id = ${staff.school_id} and n.refer_counselor = true
      order by n.created_at desc
      limit 80
    `;
	const health = await sql`
      select s.id, s.name, coalesce(s.health_note, '') as health_note,
             c.name as class_name, st.short_name, s.class_id
      from students s
      join classes c on c.id = s.class_id
      join stages st on st.id = c.stage_id
      where s.school_id = ${staff.school_id} and coalesce(s.health_note, '') <> ''
      order by s.name
    `;
	const roster = await sql`
      select s.id, s.name, coalesce(s.health_note, '') as health_note,
             c.name as class_name, st.short_name, s.class_id
      from students s
      join classes c on c.id = s.class_id
      join stages st on st.id = c.stage_id
      where s.school_id = ${staff.school_id}
      order by st.sort_order, c.sort_order, s.name
    `;
	let cases = [];
	try {
		cases = await sql`
        select cc.id, cc.student_id, s.name as student_name, c.name as class_name, st.short_name,
               cc.kind, cc.body, cc.created_at::text as created_at,
               coalesce(sf.display_name, 'معلم') as author_name
        from counseling_cases cc
        join students s on s.id = cc.student_id
        join classes c on c.id = s.class_id
        join stages st on st.id = c.stage_id
        left join staff sf on sf.user_id = cc.author_id
        where cc.school_id = ${staff.school_id}
        order by cc.created_at desc
        limit 80
      `;
	} catch {
		cases = [];
	}
	return {
		referrals: referrals.map((n) => ({
			id: n.id,
			studentId: n.student_id,
			studentName: n.student_name,
			classLabel: classLabel(n.short_name, n.class_name),
			type: n.type,
			details: n.details,
			status: n.status,
			actionTaken: n.action_taken,
			createdAt: n.created_at,
			occurredAt: n.occurred_at,
			suggestedAction: n.suggested_action,
			compensation: n.compensation,
			behaviorTypeId: n.behavior_type_id,
			behaviorTypeName: n.behavior_type_name,
			behaviorDegree: n.behavior_degree,
			teacherName: n.teacher_name,
			teacherSubject: n.teacher_subject,
			periodKey: n.period_key
		})),
		health: health.map((s) => ({
			id: s.id,
			name: s.name,
			healthNote: s.health_note,
			classLabel: classLabel(s.short_name, s.class_name),
			classId: s.class_id
		})),
		roster: roster.map((s) => ({
			id: s.id,
			name: s.name,
			healthNote: s.health_note,
			classLabel: classLabel(s.short_name, s.class_name),
			classId: s.class_id
		})),
		cases: cases.map((c) => ({
			id: c.id,
			studentId: c.student_id,
			studentName: c.student_name,
			classLabel: classLabel(c.short_name, c.class_name),
			authorName: c.author_name,
			kind: c.kind,
			body: c.body,
			createdAt: c.created_at
		}))
	};
});
export const updateHealthNote = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	studentId: z.number(),
	healthNote: z.string().max(240)
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "counseling");
	const student = (await sql`
        select id, name from students where id = ${data.studentId} and school_id = ${staff.school_id}
      `)[0];
	if (!student) throw new Error("الطالب غير موجود");
	await sql`
      update students set health_note = ${data.healthNote.trim()}
      where id = ${data.studentId} and school_id = ${staff.school_id}
    `;
	return {
		ok: true,
		studentName: student.name,
		healthNote: data.healthNote.trim()
	};
});
async function notifyCounselingStaff(sql, school, staff, title, body, noteId, tone = "warn") {
	const recipients = await sql`
    select user_id, role, coalesce(permissions::text, '{}') as permissions from staff
    where school_id = ${staff.school_id} and user_id <> ${staff.user_id}
  `;
	const mapped = mapSchool(school);
	for (const rec of recipients) {
		const perms = parsePermissions(rec.permissions, rec.role, mapped);
		if (rec.role !== "admin" && !perms.counseling) continue;
		await sql`
      insert into notifications (school_id, user_id, note_id, kind, title, body, tone)
      values (${staff.school_id}, ${rec.user_id}, ${noteId}, ${"referral"}, ${title}, ${body}, ${tone})
    `;
	}
}
const STUDY_PARENT_MARK = "إشعار ولي الأمر:";
function studyParentDraft(message) {
	return `${STUDY_PARENT_MARK}\n${message}`;
}
function studyParentBody(suggested) {
	const text = String(suggested || "");
	if (!text.startsWith(STUDY_PARENT_MARK)) return "";
	return text.slice(STUDY_PARENT_MARK.length).replace(/^\n/, "").trim();
}
function isStudyAudience(row, mapped) {
	if (row.role === "admin" || row.role === "principal" || row.role === "counselor" || row.role === "student_counselor") return true;
	const perms = parsePermissions(row.permissions, row.role, mapped);
	return Boolean(perms.takeActions);
}
function isMoveAudience(row, mapped) {
	if (isStudyAudience(row, mapped)) return true;
	const perms = parsePermissions(row.permissions, row.role, mapped);
	return Boolean(perms.editStudents);
}
function canSeeStudyInbox(staff, school) {
	if (!staff) return false;
	return isStudyAudience(staff, mapSchool(school));
}
function canSeeMoveInbox(staff, school) {
	if (!staff) return false;
	return isMoveAudience(staff, mapSchool(school));
}
function canSeeDeskInbox(staff, school) {
	return canSeeStudyInbox(staff, school) || canSeeMoveInbox(staff, school);
}
async function ensureNoticeStudent(sql) {
	await sql.query(`alter table notifications add column if not exists student_id integer`);
}
async function ensureClassMoveRequests(sql) {
	await sql.query(`create table if not exists class_move_requests (
    id serial primary key,
    school_id integer not null,
    student_id integer not null,
    from_class_id integer,
    to_class_id integer not null,
    requested_by text not null,
    status text not null default 'pending',
    decision_note text not null default '',
    decided_by text,
    created_at timestamptz not null default now(),
    decided_at timestamptz
  )`);
	await sql.query(`create index if not exists class_move_requests_school_idx on class_move_requests (school_id, status, created_at desc)`);
}
async function listActiveStaff(sql, schoolId) {
	return sql`
    select user_id, role, coalesce(permissions::text, '{}') as permissions
    from staff
    where school_id = ${schoolId}
      and coalesce(active, true) = true
      and role <> 'pending'
  `;
}
async function pushNotice(sql, schoolId, userId, notice) {
	await sql`
    insert into notifications (school_id, user_id, note_id, student_id, kind, title, body, tone)
    values (${schoolId}, ${userId}, ${notice.noteId ?? null}, ${notice.studentId ?? null}, ${notice.kind || "action"}, ${notice.title}, ${notice.body}, ${notice.tone || "ok"})
  `;
}
async function notifyDeskInbox(sql, school, actor, notice) {
	await ensureNoticeStudent(sql);
	const people = await listActiveStaff(sql, actor.school_id);
	const mapped = mapSchool(school);
	const match = notice.kind === "class-move" ? isMoveAudience : isStudyAudience;
	for (const row of people) {
		if (row.user_id === actor.user_id) continue;
		if (!match(row, mapped)) continue;
		await pushNotice(sql, actor.school_id, row.user_id, notice);
	}
}
async function notifyActionSplit(sql, school, actor, input) {
	await ensureNoticeStudent(sql);
	const roleName = ROLE_LABEL[actor.role] || "الموظف";
	const othersBody = `${actor.display_name} (${roleName}) اتخذ الإجراء: ${input.actionText}`;
	const authorId = input.authorId || "";
	if (authorId && authorId !== actor.user_id) {
		await pushNotice(sql, actor.school_id, authorId, {
			noteId: input.noteId ?? null,
			studentId: input.studentId ?? null,
			kind: input.kind || "action",
			title: input.kind === "class-move" ? "نتيجة طلب النقل" : "تم الإجراء على ملاحظتك",
			body: input.observation,
			tone: "ok"
		});
	}
	const people = await listActiveStaff(sql, actor.school_id);
	const mapped = mapSchool(school);
	const match = input.kind === "class-move" ? isMoveAudience : input.kind === "study-message" ? isStudyAudience : (row, mappedSchool) => isStudyAudience(row, mappedSchool) || isMoveAudience(row, mappedSchool);
	for (const row of people) {
		if (row.user_id === actor.user_id) continue;
		if (authorId && row.user_id === authorId) continue;
		if (!match(row, mapped)) continue;
		await pushNotice(sql, actor.school_id, row.user_id, {
			noteId: input.noteId ?? null,
			studentId: input.studentId ?? null,
			kind: input.kind || "action",
			title: "تم اتخاذ إجراء",
			body: othersBody,
			tone: "ok"
		});
	}
}
function canSendHeldStudy(staff, school, note) {
	const perms = mappedPerms(staff, school);
	if (staff.role !== "admin" && !perms.sendMessages) return false;
	if (note.teacher_id === staff.user_id) return true;
	return canSeeStudyInbox(staff, school);
}
export const referToCounselor = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ noteId: z.number() })).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requirePerm(context.userId, "takeActions");
	const note = (await sql`
        select n.id, n.teacher_id, n.details, n.type, s.id as student_id, s.name as student_name
        from notes n
        join students s on s.id = n.student_id
        where n.id = ${data.noteId} and n.school_id = ${staff.school_id}
      `)[0];
	if (!note) throw new Error("الملاحظة غير موجودة");
	await sql`
      update notes set refer_counselor = true, dest = 'counselor' where id = ${note.id} and school_id = ${staff.school_id}
    `;
	const meta = NOTE_META[note.type] || { label: "ملاحظة" };
	await notifyActionSplit(sql, school, staff, {
		authorId: note.teacher_id,
		noteId: note.id,
		studentId: note.student_id,
		observation: `الملاحظة على الطالب ${note.student_name}: ${(note.details || meta.label || "").trim()}`,
		actionText: "إحالة إلى الإرشاد الطلابي"
	});
	return {
		ok: true,
		studentName: note.student_name
	};
});
export const listAllHealthConditions = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	await ensureHealthConditions(sql, staff.school_id);
	return listCatalogRows(sql, staff.school_id, "health_conditions", false);
});
export const createHealthCondition = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ name: z.string().min(2).max(80) })).handler(async ({ context, data }) => {
	const { sql, staff } = await requireApproved(context.userId);
	const perms = mappedPerms(staff, await loadSchool(sql, staff.school_id));
	if (staff.role !== "admin" && !perms.counseling) throw new Error("ليست لديك هذه الصلاحية");
	const name = data.name.trim();
	const existing = (await sql.query(`select id, name from health_conditions where school_id = $1 and name = $2 limit 1`, [staff.school_id, name]))[0];
	if (existing) return {
		id: existing.id,
		name: existing.name,
		existed: true
	};
	return {
		...await createCatalogItem(sql, staff.school_id, "health_conditions", name),
		existed: false
	};
});
export const updateHealthCondition = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	id: z.number(),
	name: z.string().min(2).max(80).optional(),
	active: z.boolean().optional()
}).refine((d) => d.name !== void 0 || d.active !== void 0, { message: "لا يوجد تعديل" })).handler(async ({ context, data }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	return patchCatalogItem(sql, staff.school_id, "health_conditions", data);
});
export const sendCounselingCase = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	studentId: z.number(),
	kind: z.enum([
		"health",
		"psych",
		"learning"
	]),
	body: z.string().min(2).max(800)
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	const student = (await sql`
        select s.id, s.name
        from students s
        where s.id = ${data.studentId} and s.school_id = ${staff.school_id}
      `)[0];
	if (!student) throw new Error("الطالب غير موجود");
	const row = (await sql`
        insert into counseling_cases (school_id, student_id, author_id, kind, body)
        values (${staff.school_id}, ${student.id}, ${staff.user_id}, ${data.kind}, ${data.body.trim()})
        returning id
      `)[0];
	const kindLabel = data.kind === "health" ? "حالة صحية" : data.kind === "psych" ? "حالة نفسية" : "صعوبات تعلم";
	await notifyCounselingStaff(sql, school, staff, `مراسلة للمرشد — ${kindLabel}`, `راسل ${staff.display_name} المرشد بخصوص الطالب ${student.name} (${kindLabel}).`, null);
	return {
		id: row?.id,
		studentName: student.name,
		kind: data.kind
	};
});
export const listAllCompensationOptions = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	await ensureCompensations(sql, staff.school_id);
	return listCatalogRows(sql, staff.school_id, "compensation_options", false);
});
export const createCompensationOption = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ name: z.string().min(2).max(80) })).handler(async ({ context, data }) => {
	const { sql, staff } = await requireApproved(context.userId);
	const perms = mappedPerms(staff, await loadSchool(sql, staff.school_id));
	if (staff.role !== "admin" && !perms.counseling && !perms.takeActions) throw new Error("ليست لديك هذه الصلاحية");
	const name = data.name.trim();
	if (name === "أخرى") throw new Error("أخرى خيار ثابت — اكتب الفرصة نفسها");
	const existing = (await sql.query(`select id, name from compensation_options where school_id = $1 and name = $2 limit 1`, [staff.school_id, name]))[0];
	if (existing) return {
		id: existing.id,
		name: existing.name,
		existed: true
	};
	return {
		...await createCatalogItem(sql, staff.school_id, "compensation_options", name),
		existed: false
	};
});
export const updateCompensationOption = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	id: z.number(),
	name: z.string().min(2).max(80).optional(),
	active: z.boolean().optional()
}).refine((d) => d.name !== void 0 || d.active !== void 0, { message: "لا يوجد تعديل" })).handler(async ({ context, data }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	return patchCatalogItem(sql, staff.school_id, "compensation_options", data);
});
export const setNoteCompensation = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	noteId: z.number(),
	compensation: z.string().max(400)
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	const perms = mappedPerms(staff, school);
	if (staff.role !== "admin" && !perms.counseling && !perms.takeActions) throw new Error("ليست لديك هذه الصلاحية");
	const note = (await sql`
        select n.id from notes n
        where n.id = ${data.noteId} and n.school_id = ${staff.school_id}
      `)[0];
	if (!note) throw new Error("الملاحظة غير موجودة");
	await sql`
      update notes set compensation = ${data.compensation.trim()}
      where id = ${note.id} and school_id = ${staff.school_id}
    `;
	return { ok: true };
});
export const listAllImprovementOptions = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	if (!canManageImproveCatalog(staff, school)) throw new Error("ليست لديك هذه الصلاحية");
	await ensureImproveOptions(sql, staff.school_id);
	return listCatalogRows(sql, staff.school_id, "improvement_options", false);
});
export const createImprovementOption = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ name: z.string().min(2).max(80) })).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	if (!canManageImproveCatalog(staff, school)) throw new Error("ليست لديك هذه الصلاحية");
	const name = data.name.trim();
	if (name === "أخرى") throw new Error("أخرى خيار ثابت — اكتب السلوك نفسه");
	await ensureImproveOptions(sql, staff.school_id);
	const existing = (await sql.query(`select id, name from improvement_options where school_id = $1 and name = $2 limit 1`, [staff.school_id, name]))[0];
	if (existing) return {
		id: existing.id,
		name: existing.name,
		existed: true
	};
	return {
		...await createCatalogItem(sql, staff.school_id, "improvement_options", name),
		existed: false
	};
});
export const updateImprovementOption = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	id: z.number(),
	name: z.string().min(2).max(80).optional(),
	active: z.boolean().optional()
}).refine((d) => d.name !== void 0 || d.active !== void 0, { message: "لا يوجد تعديل" })).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	if (!canManageImproveCatalog(staff, school)) throw new Error("ليست لديك هذه الصلاحية");
	return patchCatalogItem(sql, staff.school_id, "improvement_options", data);
});
export const listAllStudyNotes = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	await ensureStudyNotes(sql, staff.school_id);
	return listCatalogRows(sql, staff.school_id, "study_notes", false);
});
export const createStudyNote = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ name: z.string().min(2).max(80) })).handler(async ({ context, data }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	const name = data.name.trim();
	if (name === "ملاحظة أخرى" || name === "أخرى") throw new Error("ملاحظة أخرى خيار ثابت في القائمة");
	await ensureStudyNotes(sql, staff.school_id);
	const existing = (await sql.query(`select id, name from study_notes where school_id = $1 and name = $2 limit 1`, [staff.school_id, name]))[0];
	if (existing) return { id: existing.id, name: existing.name, existed: true };
	return { ...await createCatalogItem(sql, staff.school_id, "study_notes", name), existed: false };
});
export const updateStudyNote = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	id: z.number(),
	name: z.string().min(2).max(80).optional(),
	active: z.boolean().optional()
}).refine((d) => d.name !== void 0 || d.active !== void 0, { message: "لا يوجد تعديل" })).handler(async ({ context, data }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	if (data.name?.trim() === "ملاحظة أخرى") throw new Error("ملاحظة أخرى خيار ثابت في القائمة");
	await ensureStudyNotes(sql, staff.school_id);
	return patchCatalogItem(sql, staff.school_id, "study_notes", data);
});
export const listRoster = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	await ensureStudentProfile(sql);
	const rows = await sql`
      select
        c.id as class_id,
        c.name as class_name,
        c.sort_order as class_sort,
        st.id as stage_id,
        st.name as stage_name,
        st.short_name as short_name,
        st.sort_order as stage_sort,
        s.id as student_id,
        s.name as student_name,
        coalesce(nullif(s.parent_phone, ''), nullif(s.parent_phone_2, ''), '') as parent_phone,
        coalesce(s.national_id, '') as national_id,
        coalesce(s.nationality, '') as nationality,
        coalesce(s.parent_phone_2, '') as parent_phone_2
      from classes c
      join stages st on st.id = c.stage_id
      left join students s on s.class_id = c.id and s.school_id = c.school_id
      where c.school_id = ${staff.school_id}
      order by st.sort_order, c.sort_order, s.name
    `;
	const byClass = new Map();
	for (const r of rows) {
		let cls = byClass.get(r.class_id);
		if (!cls) {
			cls = {
				id: r.class_id,
				name: r.class_name,
				label: classLabel(r.short_name, r.class_name),
				stageId: r.stage_id,
				stageName: r.stage_name,
				stageSort: r.stage_sort,
				classSort: r.class_sort,
				students: []
			};
			byClass.set(r.class_id, cls);
		}
		if (r.student_id) cls.students.push({
			id: r.student_id,
			name: r.student_name,
			parentPhone: r.parent_phone,
			parentPhone2: r.parent_phone_2,
			nationalId: r.national_id,
			nationality: r.nationality,
			classId: r.class_id
		});
	}
	const classes = [...byClass.values()];
	const stages = [];
	const stageMap = new Map();
	for (const cls of classes) {
		let stage = stageMap.get(cls.stageId);
		if (!stage) {
			stage = {
				id: cls.stageId,
				name: cls.stageName,
				sort: cls.stageSort,
				classes: []
			};
			stageMap.set(cls.stageId, stage);
			stages.push(stage);
		}
		stage.classes.push({
			id: cls.id,
			name: cls.name,
			label: cls.label,
			stageId: cls.stageId,
			stageName: cls.stageName,
			students: cls.students
		});
	}
	return {
		stages: stages.map((st) => ({
			id: st.id,
			name: st.name,
			classes: st.classes
		})),
		studentCount: classes.reduce((n, c) => n + c.students.length, 0),
		classCount: classes.length
	};
});

export const updateNote = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	noteId: z.number(),
	type: noteTypeSchema.optional(),
	details: z.string().max(500).optional(),
	behaviorTypeId: z.number().nullable().optional(),
	periodKey: z.string().max(40).optional(),
	occurredAt: z.string().max(40).optional(),
	actionTaken: z.string().max(1200).optional(),
	status: z.enum(["open", "closed"]).optional(),
	compensation: z.string().max(400).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	const note = (await sql`
      select id, teacher_id, type, details, behavior_type_id, period_key, occurred_at, action_taken, status, compensation, closed_at, closed_by
      from notes where id = ${data.noteId} and school_id = ${staff.school_id}
    `)[0];
	if (!note) throw new Error("الملاحظة غير موجودة");
	const own = note.teacher_id === staff.user_id;
	const perms = mappedPerms(staff, school);
	if (!(own || staff.role === "admin" || perms.editRecords)) throw new Error("لا يمكنك تعديل ملاحظة معلم آخر");
	const nextType = data.type ?? note.type;
	let behaviorTypeId = data.behaviorTypeId === void 0 ? note.behavior_type_id : data.behaviorTypeId;
	if (nextType !== "behavior") behaviorTypeId = null;
	if (nextType === "behavior" && behaviorTypeId) {
		const bt = (await sql`
        select id from behavior_types where id = ${behaviorTypeId} and school_id = ${staff.school_id}
      `)[0];
		if (!bt) throw new Error("نوع المخالفة غير صالح");
	}
	const details = data.details !== void 0 ? data.details.trim() : note.details;
	const periodKey = data.periodKey !== void 0 ? data.periodKey : note.period_key;
	const occurredAt = data.occurredAt?.trim() && !Number.isNaN(Date.parse(data.occurredAt))
		? new Date(data.occurredAt).toISOString()
		: note.occurred_at;
	const actionTaken = data.actionTaken !== void 0 ? data.actionTaken.trim() : note.action_taken;
	const status = data.status ?? note.status;
	const compensation = data.compensation !== void 0 ? data.compensation.trim() : note.compensation;
	const closedAt = status === "open" ? null : (note.closed_at || new Date().toISOString());
	const closedBy = status === "open" ? null : (note.closed_by || staff.user_id);
	await sql`
      update notes set
        type = ${nextType},
        details = ${details},
        behavior_type_id = ${behaviorTypeId},
        period_key = ${periodKey},
        occurred_at = ${occurredAt},
        action_taken = ${actionTaken},
        status = ${status},
        compensation = ${compensation},
        closed_at = ${closedAt},
        closed_by = ${closedBy}
      where id = ${note.id} and school_id = ${staff.school_id}
    `;
	return { ok: true };
});

export const deleteNote = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ noteId: z.number() })).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	const note = (await sql`select id, teacher_id from notes where id = ${data.noteId} and school_id = ${staff.school_id}`)[0];
	if (!note) throw new Error("الملاحظة غير موجودة");
	const ownNote = note.teacher_id === staff.user_id;
	const canDelete = ownNote || staff.role === "admin" || mappedPerms(staff, school).editRecords;
	if (!canDelete) throw new Error("لا يمكنك حذف ملاحظة معلم آخر");
	await sql`delete from notifications where note_id = ${note.id} and school_id = ${staff.school_id}`;
	await sql`delete from notes where id = ${note.id} and school_id = ${staff.school_id}`;
	return { ok: true };
});

export const updateParentMessage = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	id: z.number(),
	body: z.string().min(2).max(2e3)
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editRecords");
	const row = (await sql`
      update parent_messages set body = ${data.body.trim()}
      where id = ${data.id} and school_id = ${staff.school_id}
      returning id
    `)[0];
	if (!row) throw new Error("الرسالة غير موجودة");
	return { ok: true };
});

export const deleteParentMessage = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ id: z.number() })).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editRecords");
	const row = (await sql`
      delete from parent_messages where id = ${data.id} and school_id = ${staff.school_id} returning id
    `)[0];
	if (!row) throw new Error("الرسالة غير موجودة");
	return { ok: true };
});

export const deleteImprovement = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ id: z.number() })).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editRecords");
	const row = (await sql`
      delete from behavior_improvements where id = ${data.id} and school_id = ${staff.school_id} returning id
    `)[0];
	if (!row) throw new Error("الخطة غير موجودة");
	return { ok: true };
});

export const updateImprovementPlan = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	id: z.number(),
	plan: z.string().min(4).max(800)
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editRecords");
	const row = (await sql`
      update behavior_improvements
      set plan = ${data.plan.trim()}, updated_at = now()
      where id = ${data.id} and school_id = ${staff.school_id}
      returning id
    `)[0];
	if (!row) throw new Error("الخطة غير موجودة");
	return { ok: true };
});

export const deleteCounselingCase = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ id: z.number() })).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editRecords");
	const row = (await sql`
      delete from counseling_cases where id = ${data.id} and school_id = ${staff.school_id} returning id
    `)[0];
	if (!row) throw new Error("الحالة غير موجودة");
	return { ok: true };
});

export const updateCounselingCase = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	id: z.number(),
	body: z.string().min(2).max(2e3)
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editRecords");
	const row = (await sql`
      update counseling_cases set body = ${data.body.trim()}
      where id = ${data.id} and school_id = ${staff.school_id}
      returning id
    `)[0];
	if (!row) throw new Error("الحالة غير موجودة");
	return { ok: true };
});

export const listCounselingCases = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	const perms = mappedPerms(staff, school);
	if (staff.role !== "admin" && !perms.editRecords && !perms.counseling) throw new Error("ليست لديك هذه الصلاحية");
	try {
		const rows = await sql`
      select cc.id, cc.student_id, s.name as student_name, c.name as class_name, st.short_name,
             cc.kind, cc.body, cc.created_at::text as created_at,
             coalesce(sf.display_name, 'معلم') as author_name
      from counseling_cases cc
      join students s on s.id = cc.student_id
      join classes c on c.id = s.class_id
      join stages st on st.id = c.stage_id
      left join staff sf on sf.user_id = cc.author_id
      where cc.school_id = ${staff.school_id}
      order by cc.created_at desc
      limit 200
    `;
		return rows.map((r) => ({
			id: r.id,
			studentId: r.student_id,
			studentName: r.student_name,
			classLabel: classLabel(r.short_name, r.class_name),
			authorName: r.author_name,
			kind: r.kind,
			body: r.body,
			createdAt: r.created_at
		}));
	} catch {
		return [];
	}
});

export const deleteStaffPermanent = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ userId: z.string() })).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editStaff");
	if (data.userId === staff.user_id) throw new Error("لا يمكنك حذف حسابك");
	const target = (await sql`
      select display_name, role, coalesce(active, true) as active from staff
      where user_id = ${data.userId} and school_id = ${staff.school_id}
    `)[0];
	if (!target) throw new Error("الموظف غير موجود");
	if (target.role === "admin") {
		const others = (await sql`
        select count(*)::int as count from staff
        where school_id = ${staff.school_id} and role = 'admin' and coalesce(active, true) = true and user_id <> ${data.userId}
      `)[0]?.count ?? 0;
		if (others < 1) throw new Error("لا يمكن حذف آخر مدير تطبيق");
	}
	await sql`delete from notifications where user_id = ${data.userId} and school_id = ${staff.school_id}`;
	await sql`delete from staff where user_id = ${data.userId} and school_id = ${staff.school_id}`;
	try {
		await sql`delete from "session" where "userId" = ${data.userId}`;
		await sql`delete from "account" where "userId" = ${data.userId}`;
		await sql`delete from "user" where id = ${data.userId}`;
	} catch {
		/* auth rows may already be gone */
	}
	return { ok: true, displayName: target.display_name };
});

async function classStructurePayload(sql, schoolId) {
	const stages = await sql`
      select id, name, short_name, sort_order
      from stages where school_id = ${schoolId}
      order by sort_order, id
    `;
	const classes = await sql`
      select c.id, c.stage_id, c.name, c.sort_order,
             (select count(*)::int from students s where s.class_id = c.id) as student_count
      from classes c
      where c.school_id = ${schoolId}
      order by c.sort_order, c.id
    `;
	return stages.map((s) => ({
		id: s.id,
		name: s.name,
		shortName: s.short_name,
		sortOrder: s.sort_order,
		classes: classes.filter((c) => c.stage_id === s.id).map((c) => ({
			id: c.id,
			stageId: c.stage_id,
			name: c.name,
			sortOrder: c.sort_order,
			studentCount: c.student_count,
			label: classLabel(s.short_name, c.name)
		}))
	}));
}

export const listClassStructure = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requirePerm(context.userId, "editClasses");
	return { stages: await classStructurePayload(sql, staff.school_id) };
});

export const repairClassStructureFn = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requirePerm(context.userId, "editClasses");
	const result = await repairClassStructure(sql, staff.school_id);
	return { ...result, stages: await classStructurePayload(sql, staff.school_id) };
});
export const pruneEmptyDivisionsFn = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requirePerm(context.userId, "editClasses");
	const result = await pruneEmptyDivisions(sql, staff.school_id, null);
	return { ...result, stages: await classStructurePayload(sql, staff.school_id) };
});

export const applyStandardStages = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requirePerm(context.userId, "editClasses");
	await repairClassStructure(sql, staff.school_id);
	const existing = await sql`
      select id, name, short_name, sort_order from stages where school_id = ${staff.school_id} order by sort_order, id
    `;
	for (const def of DEFAULT_STAGES) {
		const match = existing.find((s) => stageOrdinal(s.name) === def.sortOrder || stageOrdinal(s.short_name) === def.sortOrder) ?? existing.find((s) => s.sort_order === def.sortOrder && stageOrdinal(s.name) == null && stageOrdinal(s.short_name) == null);
		if (match) {
			await sql`
        update stages set name = ${def.name}, short_name = ${def.shortName}, sort_order = ${def.sortOrder}
        where id = ${match.id} and school_id = ${staff.school_id}
      `;
			const classes = await sql`select id, name from classes where stage_id = ${match.id} and school_id = ${staff.school_id}`;
			if (classes.length === 0) {
				for (let i = 1; i <= 5; i += 1) {
					await sql`
            insert into classes (school_id, stage_id, name, sort_order)
            values (${staff.school_id}, ${match.id}, ${String(i)}, ${i})
          `;
				}
			}
		} else {
			const created = (await sql`
        insert into stages (school_id, name, short_name, sort_order)
        values (${staff.school_id}, ${def.name}, ${def.shortName}, ${def.sortOrder})
        returning id
      `)[0];
			for (let i = 1; i <= 5; i += 1) {
				await sql`
          insert into classes (school_id, stage_id, name, sort_order)
          values (${staff.school_id}, ${created.id}, ${String(i)}, ${i})
        `;
			}
		}
	}
	await repairClassStructure(sql, staff.school_id);
	return { stages: await classStructurePayload(sql, staff.school_id) };
});

export const createStage = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	name: z.string().min(2).max(80),
	shortName: z.string().min(1).max(12),
	sections: z.number().min(0).max(20).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editClasses");
	const name = data.name.trim();
	const shortName = data.shortName.trim();
	const maxOrder = (await sql`select coalesce(max(sort_order), 0)::int as n from stages where school_id = ${staff.school_id}`)[0]?.n ?? 0;
	const created = (await sql`
      insert into stages (school_id, name, short_name, sort_order)
      values (${staff.school_id}, ${name}, ${shortName}, ${maxOrder + 1})
      returning id
    `)[0];
	const sections = data.sections ?? 5;
	for (let i = 1; i <= sections; i += 1) {
		await sql`
      insert into classes (school_id, stage_id, name, sort_order)
      values (${staff.school_id}, ${created.id}, ${String(i)}, ${i})
    `;
	}
	return { id: created.id, stages: await classStructurePayload(sql, staff.school_id) };
});

export const updateStage = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	id: z.number(),
	name: z.string().min(2).max(80).optional(),
	shortName: z.string().min(1).max(12).optional(),
	sortOrder: z.number().min(0).max(99).optional()
}).refine((d) => d.name !== undefined || d.shortName !== undefined || d.sortOrder !== undefined, { message: "لا يوجد تعديل" })).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editClasses");
	const row = (await sql`select id, name, short_name, sort_order from stages where id = ${data.id} and school_id = ${staff.school_id}`)[0];
	if (!row) throw new Error("المرحلة غير موجودة");
	const name = data.name !== undefined ? data.name.trim() : row.name;
	const shortName = data.shortName !== undefined ? data.shortName.trim() : row.short_name;
	const sortOrder = data.sortOrder !== undefined ? data.sortOrder : row.sort_order;
	await sql`
      update stages set name = ${name}, short_name = ${shortName}, sort_order = ${sortOrder}
      where id = ${row.id} and school_id = ${staff.school_id}
    `;
	return { stages: await classStructurePayload(sql, staff.school_id) };
});

export const deleteStage = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ id: z.number(), withStudents: z.boolean().optional() })).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editClasses");
	const students = (await sql`
      select count(*)::int as n from students s
      join classes c on c.id = s.class_id
      where c.stage_id = ${data.id} and c.school_id = ${staff.school_id}
    `)[0]?.n ?? 0;
	if (students > 0 && !data.withStudents) throw new Error("لا يمكن حذف صف فيه طلاب — احذف الطلاب أولاً أو أكّد الحذف مع الطلاب");
	if (students > 0) {
		await sql`
      delete from students
      where school_id = ${staff.school_id}
        and class_id in (select id from classes where stage_id = ${data.id} and school_id = ${staff.school_id})
    `;
	}
	await sql`delete from classes where stage_id = ${data.id} and school_id = ${staff.school_id}`;
	const row = (await sql`delete from stages where id = ${data.id} and school_id = ${staff.school_id} returning id`)[0];
	if (!row) throw new Error("المرحلة غير موجودة");
	return { stages: await classStructurePayload(sql, staff.school_id) };
});

export const createClassInStage = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	stageId: z.number(),
	name: z.string().min(1).max(20).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editClasses");
	const stage = (await sql`select id from stages where id = ${data.stageId} and school_id = ${staff.school_id}`)[0];
	if (!stage) throw new Error("المرحلة غير موجودة");
	const existing = await sql`select name, sort_order from classes where stage_id = ${stage.id} and school_id = ${staff.school_id}`;
	const used = new Set(existing.map((c) => parseSectionName(c.name)));
	let name = data.name ? parseSectionName(data.name) || data.name.trim() : "";
	if (!name) {
		let n = 1;
		while (used.has(String(n))) n += 1;
		name = String(n);
	}
	if (existing.some((c) => parseSectionName(c.name) === parseSectionName(name))) throw new Error("هذا القسم موجود مسبقاً في الصف");
	const sortOrder = Number(name) || existing.length + 1;
	await sql`
      insert into classes (school_id, stage_id, name, sort_order)
      values (${staff.school_id}, ${stage.id}, ${name}, ${sortOrder})
    `;
	return { stages: await classStructurePayload(sql, staff.school_id) };
});

export const updateClassRow = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	id: z.number(),
	name: z.string().min(1).max(20).optional(),
	sortOrder: z.number().min(0).max(99).optional()
}).refine((d) => d.name !== undefined || d.sortOrder !== undefined, { message: "لا يوجد تعديل" })).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editClasses");
	const row = (await sql`select id, stage_id, name, sort_order from classes where id = ${data.id} and school_id = ${staff.school_id}`)[0];
	if (!row) throw new Error("الفصل غير موجود");
	const name = data.name !== undefined ? (parseSectionName(data.name) || data.name.trim()) : row.name;
	const sortOrder = data.sortOrder !== undefined ? data.sortOrder : row.sort_order;
	if (name !== row.name) {
		const clash = (await sql`
        select id from classes
        where school_id = ${staff.school_id} and stage_id = ${row.stage_id} and id <> ${row.id} and name = ${name}
        limit 1
      `)[0];
		if (clash) throw new Error("يوجد قسم بنفس المسمى في هذا الصف");
	}
	await sql`update classes set name = ${name}, sort_order = ${sortOrder} where id = ${row.id} and school_id = ${staff.school_id}`;
	return { stages: await classStructurePayload(sql, staff.school_id) };
});

export const deleteClassRow = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ id: z.number() })).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editClasses");
	const count = (await sql`select count(*)::int as n from students where class_id = ${data.id} and school_id = ${staff.school_id}`)[0]?.n ?? 0;
	if (count > 0) throw new Error("لا يمكن حذف فصل فيه طلاب — انقل الطلاب أو ادمج الأقسام المكررة");
	const row = (await sql`delete from classes where id = ${data.id} and school_id = ${staff.school_id} returning id`)[0];
	if (!row) throw new Error("الفصل غير موجود");
	return { stages: await classStructurePayload(sql, staff.school_id) };
});

function canAccessFollowup(staff, school) {
	const p = mappedPerms(staff, school);
	return staff.role === "admin" || staff.role === "counselor" || p.takeActions || p.acceptImprovements || p.dailyAttendance || p.counseling;
}
async function countKindBucket(sql, schoolId, table, kind) {
	if (table === "daily") {
		const row = (await sql`
      select
        count(*) filter (where day = current_date)::int as today,
        count(*) filter (where day >= current_date - 6)::int as week,
        count(*) filter (where day >= date_trunc('month', current_date))::int as month,
        count(*)::int as total
      from daily_attendance
      where school_id = ${schoolId} and kind = ${kind}
    `)[0];
		return { today: row?.today ?? 0, week: row?.week ?? 0, month: row?.month ?? 0, total: row?.total ?? 0 };
	}
	const row = (await sql`
    select
      count(*) filter (where created_at >= current_date)::int as today,
      count(*) filter (where created_at >= current_date - interval '6 days')::int as week,
      count(*) filter (where created_at >= date_trunc('month', current_date))::int as month,
      count(*)::int as total
    from notes
    where school_id = ${schoolId} and type = ${kind}
  `)[0];
	return { today: row?.today ?? 0, week: row?.week ?? 0, month: row?.month ?? 0, total: row?.total ?? 0 };
}
function pickBucket(bucket, range) {
	if (range === "week") return bucket.week;
	if (range === "month") return bucket.month;
	if (range === "total") return bucket.total;
	return bucket.today;
}
function counterHref(source, range) {
	const r = range === "total" ? "all" : (range || "today");
	if (source === "daily-absence") return `/admin/absence?range=${r}`;
	if (source === "daily-late") return `/admin/late?range=${r}`;
	const type = source === "note-absence" ? "absence" : source === "note-late" ? "late" : source === "homework" ? "homework" : "behavior";
	return `/admin/behavior?type=${type}&range=${r}`;
}
async function upsertAttendanceDigest(sql, staff, school) {
	if (!school) return;
	const schoolId = staff.school_id;
	const absDaily = (await sql`select count(*)::int as n from daily_attendance where school_id = ${schoolId} and day = current_date and kind = 'absence'`)[0]?.n ?? 0;
	const lateDaily = (await sql`select count(*)::int as n from daily_attendance where school_id = ${schoolId} and day = current_date and kind = 'late'`)[0]?.n ?? 0;
	const absNotes = (await sql`select count(*)::int as n from notes where school_id = ${schoolId} and created_at >= current_date and type = 'absence'`)[0]?.n ?? 0;
	const lateNotes = (await sql`select count(*)::int as n from notes where school_id = ${schoolId} and created_at >= current_date and type = 'late'`)[0]?.n ?? 0;
	const homework = (await sql`select count(*)::int as n from notes where school_id = ${schoolId} and created_at >= current_date and type = 'homework'`)[0]?.n ?? 0;
	const behavior = (await sql`select count(*)::int as n from notes where school_id = ${schoolId} and created_at >= current_date and type = 'behavior'`)[0]?.n ?? 0;
	const abs = absDaily + absNotes;
	const late = lateDaily + lateNotes;
	function extrasFor(kind) {
		const parts = [];
		if (kind === "absence" && late) parts.push(`${late} تأخر`);
		if (kind === "late" && abs) parts.push(`${abs} غياب`);
		if (behavior) parts.push(`${behavior} مخالفات`);
		if (homework) parts.push(`${homework} واجب`);
		return parts.length ? ` كذلك اليوم: ${parts.join("، ")}.` : "";
	}
	const absTitle = `غياب اليوم: ${abs}`;
	const lateTitle = `تأخر اليوم: ${late}`;
	const absBody = abs
		? `سُجّل اليوم غياب ${abs} طالب${absDaily && absNotes ? ` (يومي ${absDaily} · حصة ${absNotes})` : absDaily ? " — غياب يومي" : " — غياب حصة"}.${extrasFor("absence")}`
		: `لا يوجد غياب اليوم.${extrasFor("absence")}`;
	const lateBody = late
		? `سُجّل اليوم تأخر ${late} طالب${lateDaily && lateNotes ? ` (صباحي ${lateDaily} · حصة ${lateNotes})` : lateDaily ? " — تأخر صباحي" : " — تأخر حصة"}.${extrasFor("late")}`
		: `لا يوجد تأخر اليوم.${extrasFor("late")}`;
	if (abs === 0 && late === 0 && homework === 0 && behavior === 0) return;
	const recipients = await sql`
    select user_id, role, coalesce(permissions::text, '{}') as permissions from staff
    where school_id = ${schoolId} and user_id <> ${staff.user_id}
  `;
	const mapped = mapSchool(school);
	const targets = [];
	for (const rec of recipients) {
		const perms = parsePermissions(rec.permissions, rec.role, mapped);
		if (rec.role === "admin" || rec.role === "counselor" || perms.dailyAttendance || perms.takeActions) targets.push(rec.user_id);
	}
	async function upsertOne(userId, kind, title, body, tone) {
		const existing = (await sql`
      select id from notifications
      where school_id = ${schoolId} and user_id = ${userId} and kind = ${kind} and created_at >= current_date
      order by created_at desc limit 1
    `)[0];
		if (existing) {
			await sql`
        update notifications
        set title = ${title}, body = ${body}, tone = ${tone}, read = false, created_at = now()
        where id = ${existing.id}
      `;
			return;
		}
		await sql`
      insert into notifications (school_id, user_id, note_id, kind, title, body, tone)
      values (${schoolId}, ${userId}, ${null}, ${kind}, ${title}, ${body}, ${tone})
    `;
	}
	for (const userId of targets) {
		await upsertOne(userId, "digest-absence", absTitle, absBody, abs ? "danger" : "warn");
		await upsertOne(userId, "digest-late", lateTitle, lateBody, late ? "warn" : "ok");
	}
}
export const listAttendanceRoster = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	kind: z.enum(["absence", "late", "leave"]),
	from: z.string().min(8).max(12),
	to: z.string().min(8).max(12)
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	if (!canAccessFollowup(staff, school)) throw new Error("ليست لديك صلاحية متابعة الغياب");
	const daily = await sql.query(`select a.day::text as day, s.id as student_id, s.name as student_name,
            c.name as class_name, st.short_name,
            coalesce(a.excused, false) as excused,
            coalesce(a.details, '') as details,
            a.arrived_at::text as arrived_at
     from daily_attendance a
     join students s on s.id = a.student_id
     join classes c on c.id = s.class_id
     join stages st on st.id = c.stage_id
     where a.school_id = $1 and a.kind = $2
       and a.day >= $3::date and a.day <= $4::date
     order by a.day desc, st.sort_order, c.sort_order, s.name`, [staff.school_id, data.kind, data.from, data.to]);
	const notes = data.kind === "leave" ? [] : await sql.query(`select n.created_at::date::text as day, s.id as student_id, s.name as student_name,
            c.name as class_name, st.short_name,
            false as excused,
            coalesce(n.details, '') as details,
            null as arrived_at
     from notes n
     join students s on s.id = n.student_id
     join classes c on c.id = s.class_id
     join stages st on st.id = c.stage_id
     where n.school_id = $1 and n.type = $2
       and n.created_at >= $3::date and n.created_at < ($4::date + interval '1 day')
     order by n.created_at desc`, [staff.school_id, data.kind, data.from, data.to]);
	const rows = [
		...daily.map((r) => ({
			day: r.day,
			studentId: r.student_id,
			studentName: r.student_name,
			classLabel: classLabel(r.short_name, r.class_name),
			excused: Boolean(r.excused),
			arrivedAt: r.arrived_at || null,
			details: r.details || (data.kind === "absence" ? "غياب يومي" : "تأخر صباحي")
		})),
		...notes.map((r) => ({
			day: r.day,
			studentId: r.student_id,
			studentName: r.student_name,
			classLabel: classLabel(r.short_name, r.class_name),
			excused: false,
			arrivedAt: null,
			details: r.details ? `${data.kind === "absence" ? "غياب حصة" : "تأخر حصة"} — ${r.details}` : (data.kind === "absence" ? "غياب حصة" : "تأخر حصة")
		}))
	].sort((a, b) => b.day.localeCompare(a.day) || a.studentName.localeCompare(b.studentName, "ar"));
	return { rows };
});
export const listDailyRegister = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	kind: z.enum(["absence", "late", "leave"]),
	studentId: z.number().optional(),
	from: z.string().max(12).optional(),
	to: z.string().max(12).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	const perms = mappedPerms(staff, school);
	if (!(staff.role === "admin" || staff.role === "principal" || staff.role === "counselor" || perms.dailyAttendance || perms.takeActions || perms.counseling)) {
		throw new Error("ليست لديك صلاحية طباعة الكشف");
	}
	const params = [staff.school_id, data.kind];
	let where = `a.school_id = $1 and a.kind = $2`;
	if (data.studentId) {
		params.push(data.studentId);
		where += ` and a.student_id = $${params.length}`;
	}
	if (data.from) {
		params.push(data.from);
		where += ` and a.day >= $${params.length}::date`;
	}
	if (data.to) {
		params.push(data.to);
		where += ` and a.day <= $${params.length}::date`;
	}
	const rows = await sql.query(`select a.day::text as day, s.id as student_id, s.name as student_name,
            c.name as class_name, st.short_name,
            coalesce(a.details, '') as details,
            a.arrived_at::text as arrived_at
     from daily_attendance a
     join students s on s.id = a.student_id
     join classes c on c.id = s.class_id
     join stages st on st.id = c.stage_id
     where ${where}
     order by a.day desc, st.sort_order, c.sort_order, s.name
     limit 2500`, params);
	return {
		rows: rows.map((r) => ({
			day: String(r.day).slice(0, 10),
			studentId: r.student_id,
			studentName: r.student_name,
			classLabel: classLabel(r.short_name, r.class_name),
			details: r.details ?? "",
			arrivedAt: r.arrived_at || null
		}))
	};
});
export const listFollowupNotes = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	type: z.enum(["absence", "late", "homework", "behavior"]),
	from: z.string().min(8).max(12).optional(),
	to: z.string().min(8).max(12).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	if (!canAccessFollowup(staff, school)) throw new Error("ليست لديك صلاحية الإحصاء");
	return fetchNotes(sql, staff.school_id, {
		type: data.type,
		from: data.from,
		to: data.to,
		limit: 400,
		staff,
		school
	});
});
export const getFollowupStats = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	if (!canAccessFollowup(staff, school)) throw new Error("ليست لديك صلاحية الإحصاء");
	const stats = {
		dailyAbsence: await countKindBucket(sql, staff.school_id, "daily", "absence"),
		dailyLate: await countKindBucket(sql, staff.school_id, "daily", "late"),
		noteAbsence: await countKindBucket(sql, staff.school_id, "notes", "absence"),
		noteLate: await countKindBucket(sql, staff.school_id, "notes", "late"),
		homework: await countKindBucket(sql, staff.school_id, "notes", "homework"),
		behavior: await countKindBucket(sql, staff.school_id, "notes", "behavior")
	};
	const counters = parseStatCounters(school.stat_counters);
	const sourceKey = {
		"daily-absence": "dailyAbsence",
		"daily-late": "dailyLate",
		"note-absence": "noteAbsence",
		"note-late": "noteLate",
		homework: "homework",
		behavior: "behavior"
	};
	const extra = counters.map((c) => ({
		id: c.id,
		title: c.title,
		href: counterHref(c.source, c.range),
		value: pickBucket(stats[sourceKey[c.source]], c.range),
		tone: c.source.includes("late") || c.source === "homework" ? "warn" : "danger"
	}));
	return { stats, extra, counters, hidden: parseStatHidden(school.stat_hidden) };
});
export const saveStatCounters = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	counters: z.array(z.object({
		id: z.string().min(1).max(40),
		title: z.string().min(2).max(40),
		source: z.enum(["daily-absence", "daily-late", "note-absence", "note-late", "homework", "behavior"]),
		range: z.enum(["today", "week", "month", "total"]).optional()
	})).max(12).optional(),
	hidden: z.array(z.string().max(40)).max(40).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	const perms = mappedPerms(staff, school);
	if (staff.role !== "admin" && !perms.counseling && !perms.takeActions) throw new Error("ليست لديك صلاحية إضافة عداد");
	const counters = data.counters
		? parseStatCounters(data.counters.map((c, i) => ({
			id: c.id || `c-${i + 1}`,
			title: c.title,
			source: c.source,
			range: c.range || "today"
		})))
		: parseStatCounters(school.stat_counters);
	const hidden = data.hidden ? parseStatHidden(data.hidden) : parseStatHidden(school.stat_hidden);
	try {
		await sql`alter table schools add column if not exists stat_counters jsonb not null default '[]'::jsonb`;
		await sql.query(`update schools set stat_counters = $1::jsonb where id = $2`, [JSON.stringify(counters), staff.school_id]);
	} catch {
		throw new Error("تعذر حفظ العدادات");
	}
	try {
		await sql`alter table schools add column if not exists stat_hidden jsonb not null default '[]'::jsonb`;
		await sql.query(`update schools set stat_hidden = $1::jsonb where id = $2`, [JSON.stringify(hidden), staff.school_id]);
	} catch {
		throw new Error("تعذر حفظ إظهار العدادات");
	}
	return { counters, hidden };
});

async function ensureRosterTemplates(sql) {
	try {
		await sql`create table if not exists roster_templates (
      id serial primary key,
      school_id integer not null,
      owner_id text not null default '',
      name text not null,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )`;
	} catch {}
}
function clampWidth(value, fallback) {
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(80, Math.max(8, Math.round(n)));
}
function parseRosterPayload(raw) {
	let value = raw;
	if (typeof raw === "string") try {
		value = JSON.parse(raw);
	} catch {
		value = {};
	}
	if (!value || typeof value !== "object" || Array.isArray(value)) value = {};
	const extras = Array.isArray(value.extraCols) ? value.extraCols : [];
	const widths = value.widths && typeof value.widths === "object" ? value.widths : {};
	return {
		title: String(value.title ?? "بيانات الطلاب").trim().slice(0, 80) || "بيانات الطلاب",
		showPhone: Boolean(value.showPhone),
		showClass: Boolean(value.showClass),
		showStage: Boolean(value.showStage),
		extraCols: extras.filter((c) => c && typeof c === "object").map((c, i) => ({
			id: String(c.id || `c${i + 1}`).slice(0, 40),
			title: String(c.title ?? "").trim().slice(0, 40),
			width: clampWidth(c.width, 20)
		})).slice(0, 24),
		widths: {
			seq: clampWidth(widths.seq, 10),
			name: clampWidth(widths.name, 42),
			class: clampWidth(widths.class, 22),
			stage: clampWidth(widths.stage, 18),
			phone: clampWidth(widths.phone, 28)
		},
		order: Array.isArray(value.order) ? value.order.map((id) => String(id).slice(0, 40)).filter(Boolean).slice(0, 40) : []
	};
}
function mapRosterTemplate(row) {
	return {
		id: row.id,
		ownerId: row.owner_id ?? "",
		name: row.name,
		payload: parseRosterPayload(row.payload),
		public: !row.owner_id,
		createdAt: row.created_at
	};
}
export const getHomeDesk = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff, school } = await requireDesk(context.userId);
	const perms = mappedPerms(staff, school);
	const myNotes = (await sql`select count(*)::int as count from notes where school_id = ${staff.school_id} and teacher_id = ${staff.user_id}`)[0]?.count ?? 0;
	const myClosed = (await sql`select count(*)::int as count from notes where school_id = ${staff.school_id} and teacher_id = ${staff.user_id} and status = 'closed'`)[0]?.count ?? 0;
	const waitingOwn = (await sql`select count(*)::int as count from notes where school_id = ${staff.school_id} and teacher_id = ${staff.user_id} and status = 'open'`)[0]?.count ?? 0;
	let actionNeeded = 0;
	let ownOpenBehavior = 0;
	if (perms.takeActions) {
		actionNeeded = (await sql`select count(*)::int as count from notes where school_id = ${staff.school_id} and status = 'open' and type = 'behavior'`)[0]?.count ?? 0;
		ownOpenBehavior = (await sql`select count(*)::int as count from notes where school_id = ${staff.school_id} and teacher_id = ${staff.user_id} and status = 'open' and type = 'behavior'`)[0]?.count ?? 0;
	}
	let extra = 0;
	if (canSeeMoveInbox(staff, school) || canSeeStudyInbox(staff, school)) {
		try {
			await ensureClassMoveRequests(sql);
			const moves = canSeeMoveInbox(staff, school)
				? (await sql`select count(*)::int as count from class_move_requests where school_id = ${staff.school_id} and status = 'pending'`)[0]?.count ?? 0
				: 0;
			const study = canSeeStudyInbox(staff, school)
				? (await sql`
        select count(*)::int as count from notes
        where school_id = ${staff.school_id} and type = 'homework' and status = 'open'
          and teacher_id <> ${staff.user_id}
          and suggested_action like ${STUDY_PARENT_MARK + "%"}
      `)[0]?.count ?? 0
				: 0;
			extra = Number(moves) + Number(study);
		} catch {}
	}
	let moveRequests = 0;
	if (canSeeMoveInbox(staff, school)) {
		try {
			await ensureClassMoveRequests(sql);
			await ensureNoticeStudent(sql);
			const pending = (await sql`select count(*)::int as count from class_move_requests where school_id = ${staff.school_id} and status = 'pending'`)[0]?.count ?? 0;
			const older = (await sql`
        select count(*)::int as count from notifications ntf
        where ntf.school_id = ${staff.school_id}
          and ntf.user_id = ${staff.user_id}
          and ntf.kind = 'class-move'
          and ntf.created_at > now() - interval '60 days'
          and (
            ntf.student_id is null
            or not exists (
              select 1 from class_move_requests r
              where r.school_id = ntf.school_id and r.student_id = ntf.student_id and r.status = 'pending'
            )
          )
      `)[0]?.count ?? 0;
			moveRequests = Number(pending) + Number(older);
		} catch {}
	}
	const waiting = Number(waitingOwn) + extra + Math.max(0, Number(actionNeeded) - Number(ownOpenBehavior));
	const referrals = perms.counseling || perms.takeActions
		? (await sql`select count(*)::int as count from notes where school_id = ${staff.school_id} and refer_counselor = true`)[0]?.count ?? 0
		: (await sql`select count(distinct student_id)::int as count from notes where school_id = ${staff.school_id} and teacher_id = ${staff.user_id}`)[0]?.count ?? 0;
	return {
		myNotes,
		myClosed,
		waiting,
		actionNeeded,
		moveRequests,
		referrals
	};
});
export const listRosterTemplates = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requireApproved(context.userId);
	await ensureRosterTemplates(sql);
	const rows = await sql`
      select id, owner_id, name, payload::text as payload, created_at::text as created_at
      from roster_templates
      where school_id = ${staff.school_id}
        and (owner_id = '' or owner_id = ${staff.user_id})
      order by (owner_id = '') desc, created_at desc
    `;
	return { templates: rows.map(mapRosterTemplate) };
});
export const saveRosterTemplate = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	id: z.number().optional(),
	name: z.string().min(2).max(60),
	payload: z.any()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireApproved(context.userId);
	await ensureRosterTemplates(sql);
	const payload = JSON.stringify(parseRosterPayload(data.payload));
	const name = data.name.trim();
	if (data.id) {
		const row = (await sql`select id, owner_id from roster_templates where id = ${data.id} and school_id = ${staff.school_id}`)[0];
		if (!row) throw new Error("القالب غير موجود");
		if (row.owner_id && row.owner_id !== staff.user_id && staff.role !== "admin") throw new Error("لا يمكنك تعديل هذا القالب");
		if (!row.owner_id && staff.role !== "admin") throw new Error("قوالب الإدارة ثابتة — احفظ نسخة باسمك");
		await sql.query(`update roster_templates set name = $1, payload = $2::jsonb where id = $3 and school_id = $4`, [name, payload, data.id, staff.school_id]);
		return { id: data.id, ok: true };
	}
	const inserted = await sql.query(`insert into roster_templates (school_id, owner_id, name, payload) values ($1, $2, $3, $4::jsonb) returning id`, [
		staff.school_id,
		staff.role === "admin" ? "" : staff.user_id,
		name,
		payload
	]);
	return { id: inserted[0]?.id, ok: true };
});
export const deleteRosterTemplate = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	id: z.number()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireApproved(context.userId);
	await ensureRosterTemplates(sql);
	const row = (await sql`select id, owner_id from roster_templates where id = ${data.id} and school_id = ${staff.school_id}`)[0];
	if (!row) throw new Error("القالب غير موجود");
	if (row.owner_id && row.owner_id !== staff.user_id && staff.role !== "admin") throw new Error("لا يمكنك حذف هذا القالب");
	if (!row.owner_id && staff.role !== "admin") throw new Error("قوالب الإدارة يحذفها المدير فقط");
	await sql`delete from roster_templates where id = ${data.id} and school_id = ${staff.school_id}`;
	return { ok: true };
});
export const publishRosterTemplate = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	id: z.number()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	await ensureRosterTemplates(sql);
	const row = (await sql`select id from roster_templates where id = ${data.id} and school_id = ${staff.school_id}`)[0];
	if (!row) throw new Error("القالب غير موجود");
	await sql`update roster_templates set owner_id = '' where id = ${data.id} and school_id = ${staff.school_id}`;
	return { ok: true };
});

export const listStudents = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	stageId: z.number().optional(),
	classId: z.number().optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	await ensureStudentProfile(sql);
	const params = [staff.school_id];
	let where = "s.school_id = $1";
	if (data.classId) {
		params.push(data.classId);
		where += ` and s.class_id = $${params.length}`;
	} else if (data.stageId) {
		params.push(data.stageId);
		where += ` and c.stage_id = $${params.length}`;
	}
	const rows = await sql.query(`select s.id, s.name, s.class_id,
      coalesce(nullif(s.parent_phone, ''), nullif(s.parent_phone_2, ''), '') as parent_phone,
      coalesce(s.health_note, '') as health_note, c.name as class_name, st.short_name, st.name as stage_name, st.id as stage_id
     from students s
     join classes c on c.id = s.class_id
     join stages st on st.id = c.stage_id
     where ${where}
     order by st.sort_order, c.sort_order, s.roster_order nulls last, s.id`, params);
	return {
		students: rows.map((s) => ({
			id: s.id,
			name: s.name,
			classId: s.class_id,
			stageId: s.stage_id,
			className: s.class_name,
			stageName: s.stage_name,
			shortName: s.short_name,
			parentPhone: revealPhone(staff, school, s.parent_phone),
			healthNote: s.health_note ?? "",
			label: classLabel(s.short_name, s.class_name)
		}))
	};
});
export const listMessageRecipients = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	scope: z.enum(["all", "stage", "class", "absence", "late"]),
	stageId: z.number().optional(),
	classId: z.number().optional(),
	day: z.string().max(12).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	if (!mappedPerms(staff, school).sendMessages) throw new Error("إرسال الرسائل غير مفعّل لحسابك");
	const day = data.day?.trim() || todayISODate();
	const params = [staff.school_id];
	let where = "s.school_id = $1";
	if (data.scope === "class") {
		if (!data.classId) throw new Error("حدد الفصل");
		params.push(data.classId);
		where += ` and s.class_id = $${params.length}`;
	} else if (data.scope === "stage") {
		if (!data.stageId) throw new Error("حدد الصف");
		params.push(data.stageId);
		where += ` and c.stage_id = $${params.length}`;
	} else if (data.classId) {
		params.push(data.classId);
		where += ` and s.class_id = $${params.length}`;
	} else if (data.stageId) {
		params.push(data.stageId);
		where += ` and c.stage_id = $${params.length}`;
	}
	let joinAtt = "";
	if (data.scope === "absence" || data.scope === "late") {
		params.push(day);
		const dayIdx = params.length;
		params.push(data.scope);
		joinAtt = `join daily_attendance a on a.student_id = s.id and a.school_id = s.school_id and a.day = $${dayIdx}::date and a.kind = $${params.length}`;
	}
	const rows = await sql.query(`select s.id, s.name, s.class_id,
      coalesce(nullif(s.parent_phone, ''), nullif(s.parent_phone_2, ''), '') as parent_phone,
      c.name as class_name, st.short_name, st.name as stage_name, st.id as stage_id
    from students s
    join classes c on c.id = s.class_id
    join stages st on st.id = c.stage_id
    ${joinAtt}
    where ${where}
    order by st.sort_order, c.sort_order, s.name`, params);
	return {
		day,
		students: rows.map((s) => ({
			id: s.id,
			name: s.name,
			classId: s.class_id,
			stageId: s.stage_id,
			className: s.class_name,
			stageName: s.stage_name,
			shortName: s.short_name,
			parentPhone: revealPhone(staff, school, s.parent_phone),
			label: classLabel(s.short_name, s.class_name)
		}))
	};
});
export const getDeskNotes = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	status: z.enum(["open", "closed", "all"]).optional(),
	referred: z.boolean().optional(),
	scope: z.enum(["mine", "actions"]).optional(),
	teacherId: z.string().optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireDesk(context.userId);
	if (data.scope === "actions") {
		if (!mappedPerms(staff, school).takeActions) throw new Error("ليست لديك صلاحية اتخاذ الإجراء");
		const notes = await fetchNotes(sql, staff.school_id, {
			status: "open",
			type: "behavior",
			limit: 200,
			staff,
			school
		});
		return { notes };
	}
	const teacherId = data.teacherId?.trim() || staff.user_id;
	if (teacherId !== staff.user_id && staff.role !== "admin" && !mappedPerms(staff, school).viewAllViolations) {
		throw new Error("ليست لديك صلاحية الاطلاع على مكتب الزميل");
	}
	const notes = await fetchNotes(sql, staff.school_id, {
		status: data.status && data.status !== "all" ? data.status : void 0,
		teacherId,
		limit: 400,
		staff,
		school
	});
	return { notes: data.referred ? notes.filter((n) => n.referCounselor) : notes };
});

export const listNoteMessages = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	noteId: z.number()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	await ensureNoteThread(sql);
	const note = (await sql`
      select n.id, n.teacher_id, n.dest, n.refer_counselor, s.name as student_name
      from notes n
      join students s on s.id = n.student_id
      where n.id = ${data.noteId} and n.school_id = ${staff.school_id}
    `)[0];
	if (!note) throw new Error("الملاحظة غير موجودة");
	if (!canAccessNoteThread(staff, school, note)) throw new Error("ليست لديك صلاحية هذه المراسلة");
	const rows = await sql`
      select m.id, m.note_id, m.author_id, m.to_kind, m.body, m.created_at::text as created_at,
             coalesce(sf.display_name, 'موظف') as author_name,
             coalesce(sf.role, 'teacher') as author_role
      from note_messages m
      left join staff sf on sf.user_id = m.author_id
      where m.note_id = ${note.id} and m.school_id = ${staff.school_id}
      order by m.created_at asc, m.id asc
    `;
	return {
		noteId: note.id,
		studentName: note.student_name,
		dest: note.dest === "health" || note.dest === "counselor" ? note.dest : (note.refer_counselor ? "counselor" : "vp"),
		messages: rows.map((m) => ({
			id: m.id,
			noteId: m.note_id,
			authorId: m.author_id,
			authorName: m.author_name,
			authorRole: m.author_role,
			toKind: m.to_kind,
			body: m.body,
			createdAt: m.created_at,
			mine: m.author_id === staff.user_id
		}))
	};
});
export const postNoteMessage = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	noteId: z.number(),
	body: z.string().min(1).max(1200),
	toKind: z.enum(["vp", "counselor", "health", "teacher"]).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	await ensureNoteThread(sql);
	const note = (await sql`
      select n.id, n.teacher_id, n.dest, n.refer_counselor, s.name as student_name
      from notes n
      join students s on s.id = n.student_id
      where n.id = ${data.noteId} and n.school_id = ${staff.school_id}
    `)[0];
	if (!note) throw new Error("الملاحظة غير موجودة");
	if (!canAccessNoteThread(staff, school, note)) throw new Error("ليست لديك صلاحية هذه المراسلة");
	const isTeacher = note.teacher_id === staff.user_id && !mappedPerms(staff, school).takeActions && !mappedPerms(staff, school).counseling && staff.role !== "admin";
	const toKind = data.toKind || (isTeacher ? (note.dest === "health" || note.dest === "counselor" ? note.dest : "vp") : "teacher");
	const body = data.body.trim();
	if (!body) throw new Error("اكتب نص المراسلة");
	const row = (await sql`
      insert into note_messages (school_id, note_id, author_id, to_kind, body)
      values (${staff.school_id}, ${note.id}, ${staff.user_id}, ${toKind}, ${body})
      returning id, created_at::text as created_at
    `)[0];
	await notifyNoteThread(sql, staff, school, note, toKind, body);
	return {
		id: row.id,
		noteId: note.id,
		authorId: staff.user_id,
		authorName: staff.display_name,
		authorRole: staff.role,
		toKind,
		body,
		createdAt: row.created_at,
		mine: true
	};
});
function canAccessNoteThread(staff, school, note) {
	if (staff.role === "admin") return true;
	if (note.teacher_id === staff.user_id) return true;
	const p = mappedPerms(staff, school);
	if (p.takeActions || p.counseling) return true;
	return false;
}
async function notifyNoteThread(sql, staff, school, note, toKind, body) {
	const title = `مراسلة على ملاحظة ${note.student_name}`;
	const snippet = body.length > 80 ? body.slice(0, 80) + "…" : body;
	const text = `${staff.display_name}: ${snippet}`;
	const recipients = await sql`
    select user_id, role, coalesce(permissions::text, '{}') as permissions from staff
    where school_id = ${staff.school_id} and user_id <> ${staff.user_id}
  `;
	const mapped = mapSchool(school);
	const ids = new Set();
	if (toKind === "teacher" && note.teacher_id && note.teacher_id !== staff.user_id) ids.add(note.teacher_id);
	for (const rec of recipients) {
		const perms = parsePermissions(rec.permissions, rec.role, mapped);
		if (toKind === "vp" && (rec.role === "admin" || rec.role === "counselor" || perms.takeActions)) ids.add(rec.user_id);
		if (toKind === "counselor" && (rec.role === "admin" || perms.counseling) && rec.role !== "health_counselor") ids.add(rec.user_id);
		if (toKind === "health" && (rec.role === "admin" || rec.role === "health_counselor" || (perms.counseling && rec.role === "health_counselor"))) ids.add(rec.user_id);
		if (toKind === "teacher") continue;
	}
	if (toKind === "health") {
		for (const rec of recipients) {
			if (rec.role === "health_counselor" || rec.role === "admin") ids.add(rec.user_id);
		}
	}
	if (toKind === "counselor") {
		for (const rec of recipients) {
			const perms = parsePermissions(rec.permissions, rec.role, mapped);
			if (rec.role === "student_counselor" || perms.counseling) ids.add(rec.user_id);
		}
	}
	for (const userId of ids) {
		if (userId === staff.user_id) continue;
		await sql`
      insert into notifications (school_id, user_id, note_id, kind, title, body, tone)
      values (${staff.school_id}, ${userId}, ${note.id}, ${"thread"}, ${title}, ${text}, ${"warn"})
    `;
	}
}

async function resolveMailAssignee(sql, school, dest, assigneeId) {
	if (dest === "teacher") {
		if (!assigneeId) throw new Error("اختر المعلم");
		const row = (await sql`
      select user_id, display_name, role from staff
      where school_id = ${school.id} and user_id = ${assigneeId} and coalesce(active, true) = true and role <> 'pending'
    `)[0];
		if (!row) throw new Error("الموظف غير موجود");
		return row;
	}
	const rows = await sql`
    select user_id, display_name, role, coalesce(permissions::text, '{}') as permissions
    from staff
    where school_id = ${school.id} and coalesce(active, true) = true and role <> 'pending'
  `;
	const mapped = mapSchool(school);
	if (dest === "vp") {
		return rows.find((r) => r.role === "counselor") || rows.find((r) => parsePermissions(r.permissions, r.role, mapped).takeActions) || rows.find((r) => r.role === "admin") || null;
	}
	if (dest === "counselor") {
		return rows.find((r) => r.role === "student_counselor") || rows.find((r) => r.role !== "health_counselor" && parsePermissions(r.permissions, r.role, mapped).counseling) || rows.find((r) => r.role === "admin") || null;
	}
	if (dest === "health") {
		return rows.find((r) => r.role === "health_counselor") || rows.find((r) => parsePermissions(r.permissions, r.role, mapped).counseling) || rows.find((r) => r.role === "admin") || null;
	}
	return null;
}
function canAccessMail(staff, school, mail) {
	if (staff.role === "admin") return true;
	if (mail.author_id === staff.user_id || mail.assignee_id === staff.user_id) return true;
	const p = mappedPerms(staff, school);
	if (p.takeActions || p.counseling) return true;
	return false;
}
function mapMailRow(row, staff) {
	return {
		id: row.id,
		studentId: row.student_id,
		studentName: row.student_name,
		classLabel: classLabel(row.short_name, row.class_name),
		authorId: row.author_id,
		authorName: row.author_name,
		authorRole: row.author_role,
		assigneeId: row.assignee_id,
		assigneeName: row.assignee_name,
		assigneeRole: row.assignee_role,
		dest: row.dest === "counselor" || row.dest === "health" || row.dest === "teacher" ? row.dest : "vp",
		status: row.status === "closed" ? "closed" : "open",
		lastBody: row.last_body ?? "",
		parentPhone: row.parent_phone || row.parent_phone_2 || "",
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		mine: row.author_id === staff.user_id,
		assignedToMe: row.assignee_id === staff.user_id
	};
}
const MAIL_SQL = `select m.id, m.student_id, m.author_id, m.assignee_id, m.dest, m.status,
             m.created_at::text as created_at, m.updated_at::text as updated_at,
             s.name as student_name, c.name as class_name, st.short_name,
             coalesce(s.parent_phone, '') as parent_phone, coalesce(s.parent_phone_2, '') as parent_phone_2,
             coalesce(au.display_name, 'موظف') as author_name,
             coalesce(au.role, 'teacher') as author_role,
             coalesce(asg.display_name, 'موظف') as assignee_name,
             coalesce(asg.role, 'teacher') as assignee_role,
             coalesce((
               select msg.body from student_mail_msg msg
               where msg.mail_id = m.id
               order by msg.created_at desc, msg.id desc
               limit 1
             ), '') as last_body
      from student_mail m
      join students s on s.id = m.student_id
      join classes c on c.id = s.class_id
      join stages st on st.id = c.stage_id
      left join staff au on au.user_id = m.author_id
      left join staff asg on asg.user_id = m.assignee_id`;
async function notifyMailStaff(sql, staff, school, mail, title, body) {
	const snippet = body.length > 80 ? body.slice(0, 80) + "…" : body;
	const text = `${staff.display_name}: ${snippet}`;
	const ids = new Set();
	if (mail.assignee_id && mail.assignee_id !== staff.user_id) ids.add(mail.assignee_id);
	if (mail.author_id && mail.author_id !== staff.user_id) ids.add(mail.author_id);
	for (const userId of ids) {
		await sql`
      insert into notifications (school_id, user_id, note_id, kind, title, body, tone)
      values (${staff.school_id}, ${userId}, ${null}, ${"mail"}, ${title}, ${text}, ${"warn"})
    `;
	}
}
export const listStaffDirectory = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requireApproved(context.userId);
	const rows = await sql`
    select user_id, display_name, role, coalesce(subject, '') as subject
    from staff
    where school_id = ${staff.school_id}
      and coalesce(active, true) = true
      and role <> 'pending'
    order by display_name
  `;
	return {
		staff: rows.map((r) => ({
			userId: r.user_id,
			displayName: r.display_name,
			role: r.role,
			subject: r.subject
		}))
	};
});
export const createStudentMail = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	studentId: z.number(),
	dest: z.enum(["vp", "counselor", "health", "teacher"]),
	assigneeId: z.string().optional(),
	body: z.string().min(2).max(8000)
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	await ensureStaffMail(sql);
	const student = (await sql`
      select s.id, s.name from students s
      where s.id = ${data.studentId} and s.school_id = ${staff.school_id}
    `)[0];
	if (!student) throw new Error("الطالب غير موجود");
	const assignee = await resolveMailAssignee(sql, school, data.dest, data.assigneeId);
	if (!assignee) throw new Error("لا يوجد مستلم لهذه الجهة في المدرسة");
	if (assignee.user_id === staff.user_id && data.dest === "teacher") throw new Error("اختر معلماً آخر");
	const body = data.body.trim();
	const row = (await sql`
      insert into student_mail (school_id, student_id, author_id, assignee_id, dest)
      values (${staff.school_id}, ${student.id}, ${staff.user_id}, ${assignee.user_id}, ${data.dest})
      returning id
    `)[0];
	await sql`
      insert into student_mail_msg (school_id, mail_id, author_id, kind, body)
      values (${staff.school_id}, ${row.id}, ${staff.user_id}, ${"message"}, ${body})
    `;
	await notifyMailStaff(sql, staff, school, { author_id: staff.user_id, assignee_id: assignee.user_id }, `مراسلة عن ${student.name}`, body);
	return {
		id: row.id,
		studentName: student.name,
		assigneeName: assignee.display_name,
		dest: data.dest
	};
});
export const listStudentMail = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	studentId: z.number()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	await ensureStaffMail(sql);
	const rows = await sql.query(MAIL_SQL + ` where m.school_id = $1 and m.student_id = $2 order by m.updated_at desc, m.id desc limit 80`, [staff.school_id, data.studentId]);
	return {
		threads: rows.filter((r) => canAccessMail(staff, school, r)).map((r) => mapMailRow(r, staff))
	};
});
export const listMyMail = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	await ensureStaffMail(sql);
	const p = mappedPerms(staff, school);
	const seeAll = staff.role === "admin" || p.takeActions || p.counseling;
	const rows = seeAll ? await sql.query(MAIL_SQL + ` where m.school_id = $1 order by m.updated_at desc, m.id desc limit 120`, [staff.school_id]) : await sql.query(MAIL_SQL + ` where m.school_id = $1 and (m.author_id = $2 or m.assignee_id = $2) order by m.updated_at desc, m.id desc limit 120`, [staff.school_id, staff.user_id]);
	return { threads: rows.map((r) => mapMailRow(r, staff)) };
});
export const listMailMessages = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	mailId: z.number()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	await ensureStaffMail(sql);
	const mail = (await sql`
      select m.id, m.author_id, m.assignee_id, m.dest, s.name as student_name
      from student_mail m
      join students s on s.id = m.student_id
      where m.id = ${data.mailId} and m.school_id = ${staff.school_id}
    `)[0];
	if (!mail) throw new Error("المراسلة غير موجودة");
	if (!canAccessMail(staff, school, mail)) throw new Error("ليست لديك صلاحية هذه المراسلة");
	const rows = await sql`
      select msg.id, msg.mail_id, msg.author_id, msg.kind, msg.body, msg.created_at::text as created_at,
             coalesce(sf.display_name, 'موظف') as author_name,
             coalesce(sf.role, 'teacher') as author_role
      from student_mail_msg msg
      left join staff sf on sf.user_id = msg.author_id
      where msg.mail_id = ${mail.id} and msg.school_id = ${staff.school_id}
      order by msg.created_at asc, msg.id asc
    `;
	return {
		mailId: mail.id,
		studentName: mail.student_name,
		messages: rows.map((m) => ({
			id: m.id,
			mailId: m.mail_id,
			authorId: m.author_id,
			authorName: m.author_name,
			authorRole: m.author_role,
			kind: m.kind === "forward" ? "forward" : "message",
			body: m.body,
			createdAt: m.created_at,
			mine: m.author_id === staff.user_id
		}))
	};
});
export const postMailMessage = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	mailId: z.number(),
	body: z.string().min(1).max(8000)
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	await ensureStaffMail(sql);
	const mail = (await sql`
      select m.id, m.author_id, m.assignee_id, m.dest, s.name as student_name
      from student_mail m
      join students s on s.id = m.student_id
      where m.id = ${data.mailId} and m.school_id = ${staff.school_id}
    `)[0];
	if (!mail) throw new Error("المراسلة غير موجودة");
	if (!canAccessMail(staff, school, mail)) throw new Error("ليست لديك صلاحية هذه المراسلة");
	const body = data.body.trim();
	if (!body) throw new Error("اكتب نص المراسلة");
	const row = (await sql`
      insert into student_mail_msg (school_id, mail_id, author_id, kind, body)
      values (${staff.school_id}, ${mail.id}, ${staff.user_id}, ${"message"}, ${body})
      returning id, created_at::text as created_at
    `)[0];
	await sql`update student_mail set updated_at = now() where id = ${mail.id} and school_id = ${staff.school_id}`;
	await notifyMailStaff(sql, staff, school, mail, `رد على مراسلة ${mail.student_name}`, body);
	return {
		id: row.id,
		mailId: mail.id,
		authorId: staff.user_id,
		authorName: staff.display_name,
		authorRole: staff.role,
		kind: "message",
		body,
		createdAt: row.created_at,
		mine: true
	};
});
export const forwardStudentMail = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	mailId: z.number(),
	dest: z.enum(["vp", "counselor", "health", "teacher"]),
	assigneeId: z.string().optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	await ensureStaffMail(sql);
	const mail = (await sql`
      select m.id, m.author_id, m.assignee_id, m.dest, s.name as student_name
      from student_mail m
      join students s on s.id = m.student_id
      where m.id = ${data.mailId} and m.school_id = ${staff.school_id}
    `)[0];
	if (!mail) throw new Error("المراسلة غير موجودة");
	const p = mappedPerms(staff, school);
	const allowed = staff.role === "admin" || mail.author_id === staff.user_id || mail.assignee_id === staff.user_id || p.takeActions || p.counseling;
	if (!allowed) throw new Error("ليست لديك صلاحية تحويل هذه المراسلة");
	const assignee = await resolveMailAssignee(sql, school, data.dest, data.assigneeId);
	if (!assignee) throw new Error("لا يوجد مستلم لهذه الجهة في المدرسة");
	const destLabel = data.dest === "vp" ? "وكيل شؤون الطلاب" : data.dest === "counselor" ? "المرشد الطلابي" : data.dest === "health" ? "المرشد الصحي" : assignee.display_name;
	const body = `حُوّلت المراسلة من ${staff.display_name} إلى ${assignee.display_name} (${destLabel})`;
	await sql`
      update student_mail
      set assignee_id = ${assignee.user_id}, dest = ${data.dest}, updated_at = now()
      where id = ${mail.id} and school_id = ${staff.school_id}
    `;
	await sql`
      insert into student_mail_msg (school_id, mail_id, author_id, kind, body)
      values (${staff.school_id}, ${mail.id}, ${staff.user_id}, ${"forward"}, ${body})
    `;
	await notifyMailStaff(sql, staff, school, { author_id: mail.author_id, assignee_id: assignee.user_id }, `تحويل مراسلة ${mail.student_name}`, body);
	return {
		ok: true,
		assigneeName: assignee.display_name,
		dest: data.dest
	};
});

async function ensureStudentProfile(sql) {
	await sql`alter table students add column if not exists national_id text not null default ''`;
	await sql`alter table students add column if not exists parent_phone_2 text not null default ''`;
	await sql`alter table students add column if not exists nationality text not null default ''`;
	await sql`alter table students add column if not exists roster_order integer`;
}
async function ensureTeacherEval(sql) {
	await ensureStudentProfile(sql);
	await sql`create table if not exists teacher_class_pins (
    staff_id text not null,
    class_id integer not null references classes (id) on delete cascade,
    school_id integer not null references schools (id) on delete cascade,
    primary key (staff_id, class_id)
  )`;
	await sql`create table if not exists eval_scales (
    staff_id text primary key,
    school_id integer not null references schools (id) on delete cascade,
    tasks_max numeric not null default 40,
    quizzes_max numeric not null default 20
  )`;
	await sql`create table if not exists eval_cards (
    id serial primary key,
    school_id integer not null references schools (id) on delete cascade,
    staff_id text not null,
    label text not null,
    points numeric not null,
    bucket text not null check (bucket in ('tasks', 'quizzes')),
    enabled boolean not null default true,
    sort_order integer not null default 0
  )`;
	await sql`create table if not exists student_evals (
    id serial primary key,
    school_id integer not null references schools (id) on delete cascade,
    staff_id text not null,
    student_id integer not null references students (id) on delete cascade,
    class_id integer not null references classes (id) on delete cascade,
    card_id integer references eval_cards (id) on delete set null,
    label text not null,
    points numeric not null,
    bucket text not null,
    subject text not null default '',
    created_at timestamptz not null default now()
  )`;
	await sql`create table if not exists student_subject_marks (
    school_id integer not null references schools (id) on delete cascade,
    staff_id text not null,
    student_id integer not null references students (id) on delete cascade,
    class_id integer not null references classes (id) on delete cascade,
    participation numeric not null default 0,
    exam numeric not null default 0,
    primary key (staff_id, student_id)
  )`;
	await sql`create table if not exists staff_timetable (
    staff_id text not null,
    school_id integer not null references schools (id) on delete cascade,
    day smallint not null check (day between 0 and 4),
    period_key text not null,
    class_id integer references classes (id) on delete set null,
    place text not null default '',
    subject text not null default '',
    primary key (staff_id, day, period_key)
  )`;
	await sql`alter table staff_timetable add column if not exists subject text not null default ''`;
	await sql`alter table eval_scales add column if not exists plan text not null default ''`;
	await sql`alter table student_evals add column if not exists period_no integer not null default 1`;
	await sql`alter table student_evals add column if not exists lesson_key text not null default ''`;
	await sql`alter table student_evals add column if not exists column_id text not null default ''`;
	await sql`alter table eval_cards add column if not exists column_id text not null default ''`;
	await sql`alter table eval_cards add column if not exists column_ref text not null default ''`;
	await sql`create table if not exists grade_formats (
    id serial primary key,
    school_id integer not null references schools (id) on delete cascade,
    owner_id text not null,
    owner_name text not null default '',
    name text not null,
    payload text not null default '{}',
    created_at timestamptz not null default now()
  )`;
	await sql`create table if not exists student_period_marks (
    school_id integer not null references schools (id) on delete cascade,
    staff_id text not null,
    student_id integer not null references students (id) on delete cascade,
    class_id integer not null references classes (id) on delete cascade,
    period_no integer not null,
    participation numeric not null default 0,
    exam numeric not null default 0,
    subject text not null default '',
    primary key (staff_id, student_id, period_no, subject)
  )`;
	await sql`alter table student_period_marks add column if not exists subject text not null default ''`;
	await sql`alter table student_period_marks add column if not exists extras text not null default '{}'`;
	try {
		await sql.query(`alter table student_period_marks drop constraint if exists student_period_marks_pkey`);
		await sql.query(`alter table student_period_marks add primary key (staff_id, student_id, period_no, subject)`);
	} catch {}
}
async function seedTeacherEval(sql, staff) {
	const scale = (await sql`select staff_id from eval_scales where staff_id = ${staff.user_id}`)[0];
	if (!scale) {
		await sql`
      insert into eval_scales (staff_id, school_id) values (${staff.user_id}, ${staff.school_id})
    `;
	}
	const existing = await sql`
    select id, label, enabled from eval_cards
    where school_id = ${staff.school_id} and staff_id = ${staff.user_id}
  `;
	const have = new Map(existing.map((row) => [row.label, row]));
	let order = existing.length;
	for (const card of DEFAULT_EVAL_CARDS) {
		const found = have.get(card.label);
		if (found) {
			if (found.enabled === false) {
				await sql`update eval_cards set enabled = true where id = ${found.id} and staff_id = ${staff.user_id}`;
			}
			continue;
		}
		order += 1;
		await sql`
      insert into eval_cards (school_id, staff_id, label, points, bucket, sort_order)
      values (${staff.school_id}, ${staff.user_id}, ${card.label}, ${card.points}, ${card.bucket}, ${order})
    `;
	}
}
function phoneOf(row) {
	const first = String(row.parent_phone ?? "").trim();
	const second = String(row.parent_phone_2 ?? "").trim();
	return first || second;
}
function columnGroup(column) {
	return column?.group === "tasks" || column?.group === "exam" || column?.group === "eval" ? column.group : "eval";
}
function sumColumnGroup(columns, extras, group) {
	return (columns ?? []).filter((column) => columnGroup(column) === group).reduce((sum, column) => {
		const value = Number(extras?.[column.id]) || 0;
		const max = Number(column?.max) || 0;
		return sum + (max > 0 ? Math.min(Math.max(value, 0), max) : value);
	}, 0);
}
async function shiftMarkColumn(sql, staff, studentId, classId, period, subject, columnId, delta) {
	if (!columnId || !period) return;
	const row = (await sql`
    select participation, exam, coalesce(extras, '{}') as extras
    from student_period_marks
    where staff_id = ${staff.user_id} and student_id = ${studentId} and period_no = ${period.no} and subject = ${subject}
  `)[0];
	const extras = parseExtras(row?.extras);
	extras[columnId] = roundMark((Number(extras[columnId]) || 0) + delta);
	const columns = period.columns ?? [];
	const taskParts = columns.some((column) => columnGroup(column) === "tasks");
	const examParts = columns.some((column) => columnGroup(column) === "exam");
	const participation = taskParts ? clampScore(sumColumnGroup(columns, extras, "tasks"), period.tasksMax) : Number(row?.participation ?? 0);
	const exam = examParts ? clampScore(sumColumnGroup(columns, extras, "exam"), period.examMax) : Number(row?.exam ?? 0);
	const payload = JSON.stringify(extras);
	await sql`
    insert into student_period_marks (school_id, staff_id, student_id, class_id, period_no, participation, exam, subject, extras)
    values (${staff.school_id}, ${staff.user_id}, ${studentId}, ${classId}, ${period.no}, ${participation}, ${exam}, ${subject}, ${payload})
    on conflict (staff_id, student_id, period_no, subject) do update
      set participation = ${participation}, exam = ${exam}, extras = ${payload}
  `;
}
function roundMark(value) {
	return Math.round(Number(value) * 10) / 10;
}
function parseExtras(raw) {
	try {
		const parsed = typeof raw === "string" ? JSON.parse(raw || "{}") : raw ?? {};
		const out = {};
		for (const [key, value] of Object.entries(parsed)) out[key] = Number(value) || 0;
		return out;
	} catch {
		return {};
	}
}
function parseSubjectPlan(raw, tasksMax, quizzesMax) {
	const titles = ["الفترة الأولى", "الفترة الثانية", "الفترة الثالثة", "الفترة الرابعة"];
	let stored = [];
	try {
		stored = raw ? JSON.parse(raw) : [];
	} catch {
		stored = [];
	}
	if (!Array.isArray(stored) || stored.length === 0) {
		const count = 2;
		return Array.from({ length: count }, (_, index) => ({
			no: index + 1,
			title: titles[index],
			tasksMax,
			examMax: quizzesMax,
			closed: false
		}));
	}
	return stored.slice(0, 4).map((item, index) => ({
		no: index + 1,
		title: String(item?.title || titles[index]).slice(0, 40),
		tasksMax: Math.min(100, Math.max(0, Number(item?.tasksMax) || 0)),
		examMax: Math.min(100, Math.max(0, Number(item?.examMax) || 0)),
		closed: Boolean(item?.closed),
		columns: Array.isArray(item?.columns)
			? item.columns.slice(0, 9).map((column, columnIndex) => ({
				id: String(column?.id || `c${columnIndex + 1}`).slice(0, 20),
				title: String(column?.title || "عمود").slice(0, 40),
				group: column?.group === "tasks" || column?.group === "exam" || column?.group === "eval" ? column.group : "eval",
				max: Math.min(100, Math.max(0, Number(column?.max) || 0))
			}))
			: []
	}));
}
function loadPlanBook(raw) {
	try {
		const parsed = raw ? JSON.parse(raw) : null;
		if (Array.isArray(parsed)) return { "*": { combine: "sum", periods: parsed } };
		if (parsed && typeof parsed === "object") return parsed;
	} catch {}
	return {};
}
async function subjectPlanOf(sql, staff, subject) {
	const row = (await sql`select tasks_max, quizzes_max, coalesce(plan, '') as plan from eval_scales where staff_id = ${staff.user_id}`)[0];
	const tasksMax = Number(row?.tasks_max ?? 40);
	const quizzesMax = Number(row?.quizzes_max ?? 20);
	const book = loadPlanBook(row?.plan);
	const key = String(subject || "").trim();
	const entry = (key && book[key]) || book["*"] || null;
	const periods = parseSubjectPlan(entry?.periods ? JSON.stringify(entry.periods) : "", tasksMax, quizzesMax);
	return {
		combine: entry?.combine === "sum" ? "sum" : "avg",
		periods,
		book,
		tasksMax,
		quizzesMax,
		finalExamMax: Math.min(100, Math.max(1, Number(entry?.finalExamMax) || 40)),
		finalColumns: (Array.isArray(entry?.finalColumns) ? entry.finalColumns : []).slice(0, 6).map((column, index) => ({
			id: String(column?.id || `f${index + 1}`).slice(0, 20),
			title: String(column?.title || "جزء").slice(0, 40),
			max: Math.min(100, Math.max(0, Number(column?.max) || 0))
		}))
	};
}
async function ensureDefaultSubjectPlans(sql, owner, subjects) {
	const row = (await sql`select coalesce(plan, '') as plan from eval_scales where staff_id = ${owner.user_id}`)[0];
	const book = loadPlanBook(row?.plan);
	let changed = false;
	for (const name of subjects) {
		const key = String(name || "").trim();
		if (!key || book[key]) continue;
		book[key] = {
			combine: "avg",
			periods: [
				{ title: "الفترة الأولى", tasksMax: 40, examMax: 20, closed: false, columns: [] },
				{ title: "الفترة الثانية", tasksMax: 40, examMax: 20, closed: false, columns: [] }
			],
			finalExamMax: 40,
			finalColumns: []
		};
		changed = true;
	}
	if (changed) await writePlanBook(sql, owner, book);
}
async function writePlanBook(sql, staff, book) {
	const plan = JSON.stringify(book);
	const first = Object.values(book)[0];
	const periods = Array.isArray(first?.periods) ? first.periods : [];
	const tasksMax = periods.reduce((sum, period) => sum + Number(period.tasksMax || 0), 0) || 40;
	const quizzesMax = periods.reduce((sum, period) => sum + Number(period.examMax || 0), 0) || 20;
	await sql`
    insert into eval_scales (staff_id, school_id, tasks_max, quizzes_max, plan)
    values (${staff.user_id}, ${staff.school_id}, ${tasksMax}, ${quizzesMax}, ${plan})
    on conflict (staff_id) do update set tasks_max = ${tasksMax}, quizzes_max = ${quizzesMax}, plan = ${plan}
  `;
}
export const getTeacherPins = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requireDesk(context.userId);
	await ensureTeacherEval(sql);
	const rows = await sql`
    select c.id, c.name, st.short_name, st.name as stage_name,
           (select count(*)::int from students s where s.class_id = c.id) as student_count
    from teacher_class_pins p
    join classes c on c.id = p.class_id and c.school_id = p.school_id
    join stages st on st.id = c.stage_id
    where p.staff_id = ${staff.user_id} and p.school_id = ${staff.school_id}
    order by st.sort_order, c.sort_order
  `;
	return {
		classes: rows.map((row) => ({
			id: row.id,
			name: row.name,
			label: classLabel(row.short_name, row.name),
			stageName: row.stage_name,
			studentCount: row.student_count
		}))
	};
});
export const setTeacherPins = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	classIds: z.array(z.number()).max(40)
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireDesk(context.userId);
	await ensureTeacherEval(sql);
	const ids = [...new Set(data.classIds)];
	await sql`delete from teacher_class_pins where staff_id = ${staff.user_id} and school_id = ${staff.school_id}`;
	for (const classId of ids) {
		const cls = (await sql`select id from classes where id = ${classId} and school_id = ${staff.school_id}`)[0];
		if (!cls) continue;
		await sql`
      insert into teacher_class_pins (staff_id, class_id, school_id)
      values (${staff.user_id}, ${classId}, ${staff.school_id})
    `;
	}
	return { ok: true };
});
export const getClassEval = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	classId: z.number(),
	subject: z.string().max(40).optional(),
	lessonKey: z.string().max(20).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireDesk(context.userId);
	await ensureTeacherEval(sql);
	await seedTeacherEval(sql, staff);
	const cls = (await sql`
    select c.id, c.name, st.short_name, st.name as stage_name
    from classes c
    join stages st on st.id = c.stage_id
    where c.id = ${data.classId} and c.school_id = ${staff.school_id}
  `)[0];
	if (!cls) throw new Error("الفصل غير موجود");
	const cards = await sql`
    select id, label, points, bucket, enabled, sort_order, coalesce(column_id, '') as column_id
    from eval_cards
    where school_id = ${staff.school_id} and staff_id = ${staff.user_id}
    order by sort_order, id
  `;
	const students = await sql`
    select s.id, s.name, coalesce(s.national_id, '') as national_id,
           coalesce(s.nationality, '') as nationality,
           coalesce(s.parent_phone, '') as parent_phone,
           coalesce(s.parent_phone_2, '') as parent_phone_2,
           a.kind as daily_kind
    from students s
    left join daily_attendance a on a.student_id = s.id and a.school_id = s.school_id and a.day = current_date
    where s.class_id = ${cls.id} and s.school_id = ${staff.school_id}
    order by s.roster_order nulls last, s.id
  `;
	let attendanceRows = [];
	let attendanceDays = 0;
	try {
		attendanceRows = await sql`
      select student_id,
        count(*) filter (where kind = 'absence' and coalesce(excused, false) = false)::int as absent,
        count(*) filter (where kind = 'late')::int as late,
        count(*) filter (where kind = 'leave')::int as leave_count,
        count(*) filter (where kind = 'absence' and coalesce(excused, false) = true)::int as excused_absence,
        coalesce(string_agg(day::text, '، ' order by day) filter (where kind = 'absence' and coalesce(excused, false) = false), '') as absence_dates
      from daily_attendance
      where school_id = ${staff.school_id}
        and student_id in (select id from students where class_id = ${cls.id} and school_id = ${staff.school_id})
      group by student_id
    `;
		const dayRow = (await sql`
      select count(distinct day)::int as days
      from daily_attendance
      where school_id = ${staff.school_id}
        and student_id in (select id from students where class_id = ${cls.id} and school_id = ${staff.school_id})
    `)[0];
		attendanceDays = Number(dayRow?.days) || 0;
	} catch {
		attendanceRows = [];
		attendanceDays = 0;
	}
	const attendanceOf = new Map(attendanceRows.map((row) => [row.student_id, row]));
	const listed = parseSubjects(staff.subject);
	const chosen = (data.subject ?? "").trim();
	const lessonSubject = listed.length === 1 ? listed[0] : chosen;
	const plan = await subjectPlanOf(sql, staff, lessonSubject);
	const periods = plan.periods;
	const combine = plan.combine;
	const yearMax = periods.length ? roundMark(periods.reduce((sum, period) => sum + period.tasksMax + period.examMax, 0) / periods.length) : 60;
	const finalExamMax = plan.finalExamMax || 40;
	const tasksMax = periods[0]?.tasksMax || 40;
	const quizzesMax = periods[0]?.examMax || 20;
	const openPeriod = periods.find((period) => !period.closed)?.no ?? null;
	const evals = lessonSubject ? await sql`
    select student_id, bucket, points, period_no, coalesce(column_id, '') as column_id
    from student_evals
    where school_id = ${staff.school_id} and staff_id = ${staff.user_id} and class_id = ${cls.id}
      and (subject = ${lessonSubject} or subject = '')
  ` : [];
	const marks = await sql`
    select student_id, participation, exam
    from student_subject_marks
    where school_id = ${staff.school_id} and staff_id = ${staff.user_id} and class_id = ${cls.id}
  `;
	let periodRows = await sql`
    select student_id, period_no, participation, exam, coalesce(subject, '') as subject, coalesce(extras, '{}') as extras
    from student_period_marks
    where school_id = ${staff.school_id} and staff_id = ${staff.user_id} and class_id = ${cls.id}
      and (${lessonSubject} = '' or subject = ${lessonSubject} or subject = '')
  `;
	if (periodRows.length === 0 && marks.length && lessonSubject) {
		for (const row of marks) {
			await sql`
        insert into student_period_marks (school_id, staff_id, student_id, class_id, period_no, participation, exam, subject)
        values (${staff.school_id}, ${staff.user_id}, ${row.student_id}, ${cls.id}, 1, ${row.participation}, ${row.exam}, ${lessonSubject})
        on conflict (staff_id, student_id, period_no, subject) do nothing
      `;
			periodRows.push({ student_id: row.student_id, period_no: 1, participation: row.participation, exam: row.exam, subject: lessonSubject });
		}
	}
	const periodMarkOf = new Map(periodRows.map((row) => [`${row.student_id}:${row.period_no}`, row]));
	const lessonKey = (data.lessonKey ?? "").trim();
	const noteRows = await sql`
    select student_id, label, count(*)::int as count, coalesce(sum(points), 0) as points
    from student_evals
    where school_id = ${staff.school_id} and staff_id = ${staff.user_id} and class_id = ${cls.id}
      and (created_at at time zone 'Asia/Riyadh')::date = (now() at time zone 'Asia/Riyadh')::date
      and (${lessonKey} = '' or lesson_key = ${lessonKey} or lesson_key = '')
      and (${lessonSubject} = '' or subject = ${lessonSubject} or subject = '')
    group by student_id, label
  `;
	const tapsOf = new Map();
	for (const row of noteRows) {
		const list = tapsOf.get(Number(row.student_id)) ?? [];
		list.push({ label: row.label, count: Number(row.count), points: Number(row.points) });
		tapsOf.set(Number(row.student_id), list);
	}
	const tally = new Map();
	const periodTally = new Map();
	for (const row of evals) {
		const periodNo = Number(row.period_no) || 1;
		const key = `${row.student_id}:${periodNo}`;
		const bucket = periodTally.get(key) ?? { tasks: 0, quizzes: 0 };
		const points = Number(row.points);
		if (!row.column_id) {
			if (row.bucket === "quizzes") bucket.quizzes += points;
			else bucket.tasks += points;
			periodTally.set(key, bucket);
		}
		if (openPeriod != null && periodNo !== openPeriod) continue;
		const cur = tally.get(row.student_id) ?? { tasks: 0, quizzes: 0, positive: 0, negative: 0 };
		if (row.bucket === "quizzes") cur.quizzes += points;
		else cur.tasks += points;
		if (points >= 0) cur.positive += 1;
		else cur.negative += 1;
		tally.set(row.student_id, cur);
	}
	const recent = lessonSubject ? await sql`
    select id, student_id, label, points, coalesce(subject, '') as subject, coalesce(lesson_key, '') as lesson_key, created_at::text as created_at
    from student_evals
    where school_id = ${staff.school_id} and staff_id = ${staff.user_id} and class_id = ${cls.id}
      and (subject = ${lessonSubject} or subject = '')
    order by id desc
    limit 40
  ` : [];
	return {
		class: {
			id: cls.id,
			label: classLabel(cls.short_name, cls.name),
			stageName: cls.stage_name
		},
		teacherName: staff.display_name || "",
		subject: lessonSubject,
		dutyDays: attendanceDays,
		combine,
		openPeriod,
		periods,
		scale: { tasksMax, quizzesMax, totalMax: yearMax + finalExamMax, yearMax, finalExamMax },
		finalColumns: plan.finalColumns ?? [],
		cards: cards.map((card) => ({
			id: card.id,
			label: card.label,
			points: Number(card.points),
			bucket: card.bucket,
			enabled: card.enabled !== false,
			sortOrder: Number(card.sort_order) || 0,
			columnId: card.column_id || ""
		})),
		students: students.map((student) => {
			const byPeriod = periods.map((period) => {
				const marked = periodMarkOf.get(`${student.id}:${period.no}`);
				const rawPeriod = periodTally.get(`${student.id}:${period.no}`) ?? { tasks: 0, quizzes: 0 };
				const extras = parseExtras(marked?.extras);
				const columns = period.columns ?? [];
				const taskParts = columns.some((column) => columnGroup(column) === "tasks");
				const examParts = columns.some((column) => columnGroup(column) === "exam");
				const participation = taskParts ? clampScore(sumColumnGroup(columns, extras, "tasks"), period.tasksMax) : clampScore(Number(marked?.participation ?? 0), period.tasksMax);
				const exam = examParts ? clampScore(sumColumnGroup(columns, extras, "exam"), period.examMax) : clampScore(Number(marked?.exam ?? 0), period.examMax);
				const evalPoints = rawPeriod.tasks + rawPeriod.quizzes;
				const periodCap = period.tasksMax + period.examMax;
				return { no: period.no, participation, exam, evalPoints, extras, total: clampScore(participation + exam + evalPoints + sumColumnGroup(columns, extras, "eval"), periodCap) };
			});
			const raw = tally.get(student.id) ?? { tasks: 0, quizzes: 0, positive: 0, negative: 0 };
			const current = byPeriod.find((period) => period.no === openPeriod) ?? { participation: 0, exam: 0, evalPoints: 0, total: 0 };
			const count = Math.max(byPeriod.length, 1);
			const yearWork = roundMark(byPeriod.reduce((sum, period) => sum + period.total, 0) / count);
			const examKey = `${student.id}:0`;
			const examRow = periodMarkOf.get(examKey);
			const finalExtras = parseExtras(examRow?.extras);
			const fromParts = (plan.finalColumns ?? []).reduce((sum, column) => {
				const cap = Number(column.max) || 0;
				const value = Number(finalExtras[column.id]) || 0;
				return sum + (cap > 0 ? Math.min(Math.max(value, 0), cap) : value);
			}, 0);
			const sheetExam = clampScore((plan.finalColumns?.length && fromParts) ? fromParts : Number(examRow?.exam ?? 0), finalExamMax);
			const finalTotal = roundMark(yearWork + sheetExam);
			const attend = attendanceOf.get(student.id);
			const absent = Number(attend?.absent) || 0;
			const late = Number(attend?.late) || 0;
			const leave = Number(attend?.leave_count) || 0;
			const excusedAbsence = Number(attend?.excused_absence) || 0;
			const excused = leave + excusedAbsence;
			const presentDays = Math.max(0, attendanceDays - absent);
			const attendancePercent = attendanceDays > 0 ? Math.max(0, Math.round((presentDays / attendanceDays) * 100)) : 100;
			return {
				id: student.id,
				name: student.name,
				nationalId: student.national_id,
				nationality: student.nationality,
				phone: phoneOf(student),
				today: student.daily_kind === "absence" || student.daily_kind === "late" ? student.daily_kind : "present",
				tasks: current.participation,
				quizzes: current.exam,
				participation: current.participation,
				exam: current.exam,
				evalPoints: current.evalPoints,
				total: finalTotal,
				yearWork,
				sheetExam,
				finalExtras,
				finalTotal,
				positive: raw.positive,
				negative: raw.negative,
				absent,
				late,
				excused,
				leave,
				excusedAbsence,
				presentDays,
				absenceDates: attend?.absence_dates || "—",
				attendancePercent,
				taps: tapsOf.get(Number(student.id)) ?? [],
				byPeriod
			};
		}),
		recent: recent.map((row) => ({
			id: row.id,
			studentId: row.student_id,
			label: row.label,
			points: Number(row.points),
			subject: row.subject || "",
			lessonKey: row.lesson_key || "",
			createdAt: row.created_at
		}))
	};
});
export const applyClassEval = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	classId: z.number(),
	studentIds: z.array(z.number()).min(1).max(80),
	cardId: z.number().optional(),
	label: z.string().max(40).optional(),
	points: z.number().min(-30).max(30).optional(),
	bucket: z.enum(["tasks", "quizzes"]).optional(),
	subject: z.string().max(40).optional(),
	lessonKey: z.string().max(20).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, actor } = await requireDesk(context.userId);
	const actorId = actor?.user_id || staff.user_id;
	await ensureTeacherEval(sql);
	const cls = (await sql`select id from classes where id = ${data.classId} and school_id = ${staff.school_id}`)[0];
	if (!cls) throw new Error("الفصل غير موجود");
	let label = String(data.label ?? "").trim();
	let points = data.points;
	let bucket = data.bucket;
	let cardId = null;
	let columnId = "";
	let cardRef = "";
	if (data.cardId) {
		const card = (await sql`
      select id, label, points, bucket, coalesce(column_id, '') as column_id, coalesce(column_ref, '') as column_ref from eval_cards
      where id = ${data.cardId} and school_id = ${staff.school_id} and staff_id = ${staff.user_id}
    `)[0];
		if (!card) throw new Error("بطاقة التقييم غير موجودة");
		label = card.label;
		points = Number(card.points);
		bucket = card.bucket;
		cardId = card.id;
		columnId = card.column_id || "";
		cardRef = card.column_ref || "";
	}
	if (!label || points == null || !bucket) throw new Error("حدد التقييم");
	const listed = parseSubjects(staff.subject);
	const sent = (data.subject ?? "").trim().slice(0, 40);
	const norm = (value) => value.trim().replace(/^ال/, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/\s+/g, "");
	const lessonSubject = listed.length === 1
		? listed[0]
		: listed.find((name) => name === sent || norm(name) === norm(sent)) || sent;
	if (listed.length > 1 && !lessonSubject) throw new Error("اختر المادة");
	const plan = await subjectPlanOf(sql, staff, lessonSubject);
	const open = plan.periods.find((period) => !period.closed) ?? plan.periods[0];
	if (!open) throw new Error("لا توجد فترة لتسجيل المتابعة");
	const periodOpen = plan.periods.some((period) => !period.closed);
	if (cardId) {
		const ref = String(cardRef || "");
		const split = ref.indexOf(":");
		const group = split >= 0 ? ref.slice(0, split) : "";
		const title = split >= 0 ? ref.slice(split + 1) : "";
		const found = (open.columns ?? []).find((column) => columnGroup(column) === group && column.title === title);
		if (found) columnId = found.id;
		else if (columnId && !(open.columns ?? []).some((column) => column.id === columnId)) columnId = "";
	}
	const lessonKey = (data.lessonKey ?? "").trim().slice(0, 20);
	const ids = [];
	for (const studentId of [...new Set(data.studentIds)]) {
		const student = (await sql`
      select id from students where id = ${studentId} and class_id = ${cls.id} and school_id = ${staff.school_id}
    `)[0];
		if (!student) continue;
		const row = (await sql`
      insert into student_evals (school_id, staff_id, student_id, class_id, card_id, label, points, bucket, subject, period_no, lesson_key, column_id, entered_by)
      values (${staff.school_id}, ${staff.user_id}, ${studentId}, ${cls.id}, ${cardId}, ${label}, ${points}, ${bucket}, ${lessonSubject}, ${open.no}, ${lessonKey}, ${columnId}, ${actorId})
      returning id
    `)[0];
		if (columnId && periodOpen) await shiftMarkColumn(sql, staff, studentId, cls.id, open, lessonSubject, columnId, Number(points));
		ids.push(row.id);
	}
	if (!ids.length) throw new Error("لم يُختر طالب من هذا الفصل");
	return { ids, count: ids.length, label, points: Number(points) };
});
export const undoClassEval = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	ids: z.array(z.number()).min(1).max(80)
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireDesk(context.userId);
	await ensureTeacherEval(sql);
	const removed = await sql.query(`
    delete from student_evals
    where school_id = $1 and staff_id = $2 and id = any($3::int[])
    returning id, student_id, class_id, points, period_no, coalesce(subject, '') as subject, coalesce(column_id, '') as column_id
  `, [
		staff.school_id,
		staff.user_id,
		data.ids
	]);
	for (const row of removed ?? []) {
		if (!row.column_id) continue;
		const plan = await subjectPlanOf(sql, staff, row.subject);
		const period = plan.periods.find((item) => item.no === Number(row.period_no));
		if (!period) continue;
		await shiftMarkColumn(sql, staff, row.student_id, row.class_id, period, row.subject, row.column_id, -Number(row.points));
	}
	return { ok: true };
});
export const undoLastClassEval = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	classId: z.number(),
	studentIds: z.array(z.number()).min(1).max(80),
	label: z.string().max(40).optional(),
	cardId: z.number().optional(),
	subject: z.string().max(40).optional(),
	lessonKey: z.string().max(20).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireDesk(context.userId);
	await ensureTeacherEval(sql);
	const listed = parseSubjects(staff.subject);
	const lessonSubject = listed.length === 1 ? listed[0] : (data.subject ?? "").trim();
	const label = (data.label ?? "").trim();
	const studentIds = [...new Set(data.studentIds)];
	const rows = await sql.query(`
    delete from student_evals
    where school_id = $1 and staff_id = $2 and id in (
      select distinct on (student_id) id
      from student_evals
      where school_id = $1 and staff_id = $2 and class_id = $3
        and student_id = any($4::int[])
        and ($5::text = '' or label = $5)
        and (
          $6::text = ''
          or subject = $6
          or subject = ''
          or replace(subject, 'ال', '') = replace($6, 'ال', '')
        )
      order by student_id, id desc
    )
    returning id, student_id, class_id, points, period_no, coalesce(subject, '') as subject, coalesce(column_id, '') as column_id
  `, [
		staff.school_id,
		staff.user_id,
		data.classId,
		studentIds,
		label,
		lessonSubject
	]);
	const found = rows?.length ? rows : label ? await sql.query(`
    delete from student_evals
    where school_id = $1 and staff_id = $2 and id in (
      select distinct on (student_id) id
      from student_evals
      where school_id = $1 and staff_id = $2 and class_id = $3
        and student_id = any($4::int[])
        and label = $5
      order by student_id, id desc
    )
    returning id, student_id, class_id, points, period_no, coalesce(subject, '') as subject, coalesce(column_id, '') as column_id
  `, [staff.school_id, staff.user_id, data.classId, studentIds, label]) : [];
	if (!found.length) throw new Error("لا يوجد تقييم لإلغائه");
	for (const row of found) {
		if (!row.column_id) continue;
		const plan = await subjectPlanOf(sql, staff, row.subject || lessonSubject);
		const period = plan.periods.find((item) => item.no === Number(row.period_no));
		if (!period) continue;
		await shiftMarkColumn(sql, staff, row.student_id, row.class_id, period, row.subject || lessonSubject, row.column_id, -Number(row.points));
	}
	return { ok: true, ids: found.map((row) => row.id), count: found.length };
});
export const saveEvalCard = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	id: z.number().optional(),
	label: z.string().min(1).max(40),
	points: z.number().min(-30).max(30),
	bucket: z.enum(["tasks", "quizzes"]),
	enabled: z.boolean().optional(),
	columnId: z.string().max(20).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireDesk(context.userId);
	await ensureTeacherEval(sql);
	await seedTeacherEval(sql, staff);
	const label = data.label.trim();
	const columnId = (data.columnId ?? "").trim().slice(0, 20);
	if (data.id) {
		await sql`
      update eval_cards
      set label = ${label}, points = ${data.points}, bucket = ${data.bucket},
          enabled = ${data.enabled !== false}, column_id = ${columnId}
      where id = ${data.id} and school_id = ${staff.school_id} and staff_id = ${staff.user_id}
    `;
		return { ok: true };
	}
	const order = ((await sql`
    select coalesce(max(sort_order), 0)::int as n from eval_cards
    where school_id = ${staff.school_id} and staff_id = ${staff.user_id}
  `)[0]?.n ?? 0) + 1;
	await sql`
    insert into eval_cards (school_id, staff_id, label, points, bucket, enabled, sort_order, column_id)
    values (${staff.school_id}, ${staff.user_id}, ${label}, ${data.points}, ${data.bucket}, ${data.enabled !== false}, ${order}, ${columnId})
  `;
	return { ok: true };
});
export const reorderEvalCards = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	ids: z.array(z.number()).min(1).max(40)
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireDesk(context.userId);
	await ensureTeacherEval(sql);
	let order = 0;
	for (const id of data.ids) {
		order += 1;
		await sql`
      update eval_cards set sort_order = ${order}
      where id = ${id} and school_id = ${staff.school_id} and staff_id = ${staff.user_id}
    `;
	}
	return { ok: true };
});
const gradeFormatPayload = z.object({
	combine: z.enum(["sum", "avg"]).optional(),
	periods: z.array(z.object({
		title: z.string().max(40),
		tasksMax: z.number().min(0).max(100),
		examMax: z.number().min(0).max(100),
		columns: z.array(z.object({
			title: z.string().max(40),
			group: z.enum(["tasks", "exam", "eval"]).optional(),
			max: z.number().min(0).max(100).optional()
		})).max(9).optional()
	})).min(1).max(4),
	finalExamMax: z.number().min(0).max(100).optional(),
	finalColumns: z.array(z.object({
		id: z.string().max(20).optional(),
		title: z.string().max(40),
		max: z.number().min(0).max(100).optional()
	})).max(6).optional(),
	cards: z.array(z.object({
		label: z.string().min(1).max(40),
		points: z.number().min(-30).max(30),
		bucket: z.enum(["tasks", "quizzes"]),
		enabled: z.boolean().optional(),
		columnRef: z.string().max(80).optional()
	})).max(40).optional()
});
function cleanFormat(data) {
	const periods = (Array.isArray(data?.periods) ? data.periods : []).slice(0, 4);
	const designed = periods.reduce((best, period) => ((period?.columns?.length ?? 0) > (best?.columns?.length ?? 0) ? period : best), periods[0] ?? { title: "فترة", tasksMax: 40, examMax: 20, columns: [] });
	return {
		combine: data?.combine === "avg" ? "avg" : "sum",
		periods: (periods.length ? periods : [designed]).map((period) => ({
			title: String(period?.title || "فترة").trim().slice(0, 40) || "فترة",
			tasksMax: Math.min(100, Math.max(0, Number(period?.tasksMax) || 0)),
			examMax: Math.min(100, Math.max(0, Number(period?.examMax) || 0)),
			columns: (Array.isArray(period?.columns) ? period.columns : []).map((column) => ({
				title: String(column?.title || "قسم").trim().slice(0, 40) || "قسم",
				group: column?.group === "tasks" || column?.group === "exam" ? column.group : "eval",
				max: Math.min(100, Math.max(0, Number(column?.max) || 0))
			}))
		})),
		finalExamMax: Math.min(100, Math.max(0, Number(data?.finalExamMax) || 40)),
		finalColumns: (Array.isArray(data?.finalColumns) ? data.finalColumns : []).slice(0, 6).map((column, index) => ({
			id: String(column?.id || `f${index + 1}`).slice(0, 20),
			title: String(column?.title || "جزء").trim().slice(0, 40) || "جزء",
			max: Math.min(100, Math.max(0, Number(column?.max) || 0))
		})).filter((column) => column.title),
		cards: (Array.isArray(data?.cards) ? data.cards : []).map((card) => ({
			label: String(card?.label || "").trim().slice(0, 40),
			points: Number(card?.points) || 0,
			bucket: card?.bucket === "quizzes" ? "quizzes" : "tasks",
			enabled: card?.enabled !== false,
			columnRef: String(card?.columnRef ?? "").trim().slice(0, 80)
		})).filter((card) => card.label)
	};
}
function designOf(payload) {
	return payload.periods.reduce((best, period) => (period.columns.length > best.columns.length ? period : best), payload.periods[0]);
}
async function applyFormatToStaff(sql, staff, data) {
	const payload = cleanFormat(data.payload ?? data);
	const periodNo = Number(data.periodNo) || 0;
	const names = parseSubjects(staff.subject);
	const subjects = data.subject ? [data.subject] : (names.length ? names : [""]);
	for (const name of subjects) {
		const current = await subjectPlanOf(sql, staff, name);
		const next = current.periods.map((period, index) => {
			const indexed = payload.periods[Math.min((periodNo || index + 1) - 1, payload.periods.length - 1)];
			const source = periodNo ? (indexed?.columns?.length ? indexed : designOf(payload)) : designOf(payload);
			if (periodNo && period.no !== periodNo) return period;
			const columns = (source?.columns ?? []).map((column, columnIndex) => {
				const found = (period.columns ?? []).find((item) => item.title === column.title && columnGroup(item) === column.group);
				return {
					id: found?.id || `c${index}${columnIndex}${column.group[0]}`.slice(0, 20),
					title: column.title,
					group: column.group,
					max: Math.min(100, Math.max(0, Number(column.max) || 0))
				};
			});
			return {
				...period,
				title: periodNo ? period.title : (payload.periods[index]?.title || period.title),
				tasksMax: source?.tasksMax ?? period.tasksMax,
				examMax: source?.examMax ?? period.examMax,
				columns
			};
		});
		const book = current.book;
		book[name || "*"] = { combine: payload.combine, periods: next, finalExamMax: payload.finalExamMax || 40, finalColumns: payload.finalColumns ?? [] };
		await writePlanBook(sql, staff, book);
	}
	const first = subjects[0] || "";
	const linked = await subjectPlanOf(sql, staff, first);
	const open = linked.periods.find((period) => !period.closed) ?? linked.periods[0];
	const existing = await sql`
    select id, label from eval_cards
    where school_id = ${staff.school_id} and staff_id = ${staff.user_id}
  `;
	let order = 0;
	for (const card of payload.cards) {
		order += 1;
		const split = card.columnRef.indexOf(":");
		const group = split >= 0 ? card.columnRef.slice(0, split) : "";
		const title = split >= 0 ? card.columnRef.slice(split + 1) : "";
		const column = (open?.columns ?? []).find((item) => columnGroup(item) === group && item.title === title);
		const found = existing.find((row) => row.label === card.label);
		if (found) {
			await sql`
        update eval_cards
        set points = ${card.points}, bucket = ${card.bucket}, enabled = ${card.enabled},
            sort_order = ${order}, column_id = ${column?.id || ""}, column_ref = ${card.columnRef}
        where id = ${found.id} and staff_id = ${staff.user_id}
      `;
		} else {
			await sql`
        insert into eval_cards (school_id, staff_id, label, points, bucket, enabled, sort_order, column_id, column_ref)
        values (${staff.school_id}, ${staff.user_id}, ${card.label}, ${card.points}, ${card.bucket}, ${card.enabled}, ${order}, ${column?.id || ""}, ${card.columnRef})
      `;
		}
	}
	const kept = payload.cards.map((card) => card.label);
	const protectedLabels = DEFAULT_EVAL_CARDS.map((card) => card.label);
	if (kept.length) {
		await sql.query(`
      update eval_cards set enabled = false
      where school_id = $1 and staff_id = $2
        and not (label = any($3::text[]))
        and not (label = any($4::text[]))
    `, [staff.school_id, staff.user_id, kept, protectedLabels]);
	}
	return { ok: true };
}
export const getGradeStudio = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requireDesk(context.userId);
	await ensureTeacherEval(sql);
	await seedTeacherEval(sql, staff);
	const names = parseSubjects(staff.subject);
	const subjects = [];
	for (const name of names.length ? names : [""]) {
		const plan = await subjectPlanOf(sql, staff, name);
		subjects.push({ name: name || "المادة", combine: plan.combine, periods: plan.periods, finalExamMax: plan.finalExamMax, finalColumns: plan.finalColumns });
	}
	const cards = await sql`
    select id, label, points, bucket, enabled, sort_order, coalesce(column_ref, '') as column_ref
    from eval_cards
    where school_id = ${staff.school_id} and staff_id = ${staff.user_id}
    order by sort_order, id
  `;
	const formats = await sql`
    select id, owner_id, owner_name, name, payload, created_at::text as created_at
    from grade_formats
    where school_id = ${staff.school_id}
    order by created_at desc
  `;
	return {
		subjects,
		cards: cards.map((card) => ({
			id: card.id,
			label: card.label,
			points: Number(card.points),
			bucket: card.bucket,
			enabled: card.enabled !== false,
			columnRef: card.column_ref || ""
		})),
		formats: formats.map((row) => ({
			id: row.id,
			name: row.name,
			ownerId: row.owner_id,
			ownerName: row.owner_name || "معلم",
			mine: row.owner_id === staff.user_id,
			payload: (() => {
				const raw = row.payload;
				if (raw && typeof raw === "object") return raw;
				try { return JSON.parse(raw || "{}"); } catch { return {}; }
			})()
		}))
	};
});
export const saveGradeFormat = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	name: z.string().min(2).max(60),
	payload: gradeFormatPayload
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireDesk(context.userId);
	await ensureTeacherEval(sql);
	const name = data.name.trim();
	const payload = JSON.stringify(cleanFormat(data.payload));
	const inserted = await sql`
    insert into grade_formats (school_id, owner_id, owner_name, name, payload)
    values (${staff.school_id}, ${staff.user_id}, ${staff.display_name || staff.name || "معلم"}, ${name}, ${payload})
    returning id
  `;
	return { id: inserted[0]?.id, ok: true };
});
export const applyGradeFormat = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	subject: z.string().max(40).optional(),
	periodNo: z.number().min(0).max(4).optional(),
	payload: gradeFormatPayload
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireDesk(context.userId);
	await ensureTeacherEval(sql);
	await seedTeacherEval(sql, staff);
	const listed = parseSubjects(staff.subject);
	if (data.subject && listed.length && !listed.includes(data.subject)) throw new Error("هذه المادة ليست من موادك");
	return applyFormatToStaff(sql, staff, data);
});
export const deleteGradeFormat = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	id: z.number()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireDesk(context.userId);
	await ensureTeacherEval(sql);
	const row = (await sql`select id, owner_id from grade_formats where id = ${data.id} and school_id = ${staff.school_id}`)[0];
	if (!row) throw new Error("التنسيق غير موجود");
	if (row.owner_id !== staff.user_id && staff.role !== "admin") throw new Error("لا يمكنك حذف تنسيق معلم آخر");
	await sql`delete from grade_formats where id = ${data.id} and school_id = ${staff.school_id}`;
	return { ok: true };
});
export const getFollowLedger = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requireDesk(context.userId);
	await ensureTeacherEval(sql);
	const rows = await sql`
    select e.id, e.student_id, e.class_id, e.label, e.points, coalesce(e.subject, '') as subject, coalesce(e.lesson_key, '') as lesson_key,
           e.created_at::text as created_at, s.name as student_name, c.name as class_name,
           coalesce(actor.display_name, '') as entered_by_name
    from student_evals e
    join students s on s.id = e.student_id
    join classes c on c.id = e.class_id
    left join staff actor on actor.user_id = e.entered_by
    where e.school_id = ${staff.school_id} and e.staff_id = ${staff.user_id}
    order by e.id desc
    limit 400
  `;
	const classes = await sql`
    select c.id, c.name, st.short_name,
           exists (
             select 1 from teacher_class_pins p
             where p.class_id = c.id and p.staff_id = ${staff.user_id} and p.school_id = ${staff.school_id}
           ) as pinned
    from classes c
    join stages st on st.id = c.stage_id
    where c.school_id = ${staff.school_id}
      and (
        exists (
          select 1 from teacher_class_pins p
          where p.class_id = c.id and p.staff_id = ${staff.user_id} and p.school_id = ${staff.school_id}
        )
        or exists (
          select 1 from staff_timetable t
          where t.class_id = c.id and t.staff_id = ${staff.user_id} and t.school_id = ${staff.school_id}
        )
      )
    order by pinned desc, st.sort_order, c.sort_order, c.name
  `;
	const classIds = classes.map((row) => row.id);
	const students = classIds.length ? await sql.query(`
    select id, name, class_id from students
    where school_id = $1 and class_id = any($2::int[])
    order by name
  `, [staff.school_id, classIds]) : [];
	return {
		classes: classes.map((row) => ({
			id: row.id,
			name: classLabel(row.short_name, row.name),
			pinned: Boolean(row.pinned)
		})),
		students: (students ?? []).map((row) => ({ id: row.id, name: row.name, classId: row.class_id })),
		rows: rows.map((row) => ({
			id: row.id,
			studentId: row.student_id,
			classId: row.class_id,
			label: row.label,
			points: Number(row.points),
			subject: row.subject || "",
			lessonKey: row.lesson_key || "",
			createdAt: row.created_at,
			studentName: row.student_name,
			className: row.class_name,
			enteredByName: row.entered_by_name || ""
		}))
	};
});
export const saveEvalScale = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	tasksMax: z.number().min(1).max(100),
	quizzesMax: z.number().min(0).max(100)
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireDesk(context.userId);
	await ensureTeacherEval(sql);
	await sql`
    insert into eval_scales (staff_id, school_id, tasks_max, quizzes_max)
    values (${staff.user_id}, ${staff.school_id}, ${data.tasksMax}, ${data.quizzesMax})
    on conflict (staff_id) do update set tasks_max = ${data.tasksMax}, quizzes_max = ${data.quizzesMax}
  `;
	return { ok: true };
});
export const getSubjectPlan = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requireApproved(context.userId);
	await ensureTeacherEval(sql);
	await seedTeacherEval(sql, staff);
	const names = parseSubjects(staff.subject);
	const subjects = [];
	for (const name of names.length ? names : [""]) {
		const plan = await subjectPlanOf(sql, staff, name);
		subjects.push({ name: name || "المادة", combine: plan.combine, periods: plan.periods });
	}
	return { subjects };
});
export const saveSubjectPlan = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	subject: z.string().max(40).optional(),
	staffId: z.string().optional(),
	combine: z.enum(["sum", "avg"]).optional(),
	periods: z.array(z.object({
		title: z.string().min(1).max(40),
		tasksMax: z.number().min(0).max(100),
		examMax: z.number().min(0).max(100),
		closed: z.boolean().optional(),
		columns: z.array(z.object({
			id: z.string().max(20),
			title: z.string().max(40),
			group: z.enum(["tasks", "exam", "eval"]).optional(),
			max: z.number().min(0).max(100).optional()
		})).max(9).optional()
	})).min(1).max(4)
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireDesk(context.userId);
	await ensureTeacherEval(sql);
	let owner = staff;
	if (data.staffId && data.staffId !== staff.user_id) {
		if (staff.role !== "admin") throw new Error("ليست لديك هذه الصلاحية");
		const row = (await sql`select * from staff where user_id = ${data.staffId} and school_id = ${staff.school_id}`)[0];
		if (!row) throw new Error("المعلم غير موجود");
		owner = row;
		owner.user_id = row.user_id;
		owner.school_id = row.school_id;
	}
	await seedTeacherEval(sql, owner);
	const titles = ["الفترة الأولى", "الفترة الثانية", "الفترة الثالثة", "الفترة الرابعة"];
	const periods = data.periods.map((period, index) => ({
		no: index + 1,
		title: period.title.trim() || titles[index],
		tasksMax: period.tasksMax,
		examMax: period.examMax,
		closed: Boolean(period.closed),
		columns: (period.columns ?? []).slice(0, 9).map((column, columnIndex) => ({
			id: String(column.id || `c${columnIndex + 1}`).slice(0, 20),
			title: String(column.title || "عمود").slice(0, 40),
			group: column.group === "tasks" || column.group === "exam" || column.group === "eval" ? column.group : "eval",
			max: Math.min(100, Math.max(0, Number(column.max) || 0))
		}))
	}));
	const key = (data.subject ?? "").trim() || "*";
	const current = await subjectPlanOf(sql, owner, key === "*" ? "" : key);
	const book = current.book;
	book[key] = { combine: data.combine === "avg" ? "avg" : "sum", periods };
	await writePlanBook(sql, owner, book);
	return { subject: key, combine: book[key].combine, periods };
});
export const setPeriodClosed = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	no: z.number().min(1).max(4),
	closed: z.boolean(),
	subject: z.string().max(40).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireDesk(context.userId);
	await ensureTeacherEval(sql);
	const key = (data.subject ?? "").trim();
	const current = await subjectPlanOf(sql, staff, key);
	const next = current.periods.map((period) => period.no === data.no ? { ...period, closed: data.closed } : period);
	if (!next.some((period) => period.no === data.no)) throw new Error("الفترة غير موجودة");
	const book = current.book;
	book[key || "*"] = { combine: current.combine, periods: next };
	await writePlanBook(sql, staff, book);
	return { periods: next };
});
export const savePeriodMark = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	classId: z.number(),
	studentId: z.number(),
	periodNo: z.number().min(0).max(4),
	participation: z.number().min(0).max(100),
	exam: z.number().min(0).max(100),
	subject: z.string().max(40).optional(),
	extras: z.record(z.string(), z.number()).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireApproved(context.userId);
	await ensureTeacherEval(sql);
	const student = (await sql`
    select id from students where id = ${data.studentId} and class_id = ${data.classId} and school_id = ${staff.school_id}
  `)[0];
	if (!student) throw new Error("الطالب ليس في هذا الفصل");
	const subject = (data.subject ?? "").trim();
	const plan = await subjectPlanOf(sql, staff, subject);
	if (data.periodNo === 0) {
		const columns = plan.finalColumns ?? [];
		const extras = { ...(data.extras ?? {}) };
		let exam = clampScore(data.exam, plan.finalExamMax || 40);
		if (columns.length && data.extras) {
			for (const column of columns) {
				const cap = Number(column.max) || 0;
				const value = Number(extras[column.id]) || 0;
				extras[column.id] = cap > 0 ? Math.min(Math.max(value, 0), cap) : Math.max(value, 0);
			}
			exam = clampScore(columns.reduce((sum, column) => sum + (Number(extras[column.id]) || 0), 0), plan.finalExamMax || 40);
		}
		const extrasJson = JSON.stringify(columns.length && data.extras ? extras : {});
		await sql`
      insert into student_period_marks (school_id, staff_id, student_id, class_id, period_no, participation, exam, subject, extras)
      values (${staff.school_id}, ${staff.user_id}, ${data.studentId}, ${data.classId}, 0, 0, ${exam}, ${subject}, ${extrasJson})
      on conflict (staff_id, student_id, period_no, subject) do update
        set class_id = ${data.classId}, exam = ${exam}, extras = case when ${Boolean(columns.length && data.extras)} then ${extrasJson} else student_period_marks.extras end
    `;
		return { participation: 0, exam };
	}
	const period = plan.periods.find((item) => item.no === data.periodNo);
	if (!period) throw new Error("الفترة غير موجودة");
	if (period.closed) throw new Error("الفترة مغلقة. أعد فتحها للتعديل.");
	const extras = data.extras ?? {};
	const columns = period.columns ?? [];
	const taskParts = columns.some((column) => columnGroup(column) === "tasks");
	const examParts = columns.some((column) => columnGroup(column) === "exam");
	const participation = taskParts ? clampScore(sumColumnGroup(columns, extras, "tasks"), period.tasksMax) : clampScore(data.participation, period.tasksMax);
	const exam = examParts ? clampScore(sumColumnGroup(columns, extras, "exam"), period.examMax) : clampScore(data.exam, period.examMax);
	const extrasJson = JSON.stringify(extras);
	await sql`
    insert into student_period_marks (school_id, staff_id, student_id, class_id, period_no, participation, exam, subject, extras)
    values (${staff.school_id}, ${staff.user_id}, ${data.studentId}, ${data.classId}, ${data.periodNo}, ${participation}, ${exam}, ${subject}, ${extrasJson})
    on conflict (staff_id, student_id, period_no, subject) do update
      set class_id = ${data.classId}, participation = ${participation}, exam = ${exam}, extras = ${extrasJson}
  `;
	return { participation, exam };
});
export const getTeacherStudentReport = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	studentId: z.number()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireApproved(context.userId);
	await ensureTeacherEval(sql);
	const student = (await sql`
    select s.id, s.name, s.class_id, c.name as class_name, st.short_name, st.name as stage_name
    from students s
    join classes c on c.id = s.class_id
    join stages st on st.id = c.stage_id
    where s.id = ${data.studentId} and s.school_id = ${staff.school_id}
  `)[0];
	if (!student) throw new Error("الطالب غير موجود");
	const notes = await sql`
    select id, type, details, coalesce(subject, '') as subject, period_key, created_at::text as created_at
    from notes
    where school_id = ${staff.school_id} and student_id = ${student.id} and teacher_id = ${staff.user_id}
    order by created_at desc
    limit 40
  `;
	const evalRows = await sql`
    select label, points, subject, created_at::text as created_at
    from student_evals
    where school_id = ${staff.school_id} and staff_id = ${staff.user_id} and student_id = ${student.id}
    order by created_at desc
    limit 80
  `;
	let attendanceRows = [];
	let classDays = 0;
	try {
		attendanceRows = await sql`
      select kind, coalesce(excused, false) as excused, day::text as day
      from daily_attendance
      where school_id = ${staff.school_id} and student_id = ${student.id}
      order by day
    `;
		const dayRow = (await sql`
      select count(distinct a.day)::int as days
      from daily_attendance a
      join students s on s.id = a.student_id
      where a.school_id = ${staff.school_id} and s.class_id = ${student.class_id}
    `)[0];
		classDays = Number(dayRow?.days) || 0;
	} catch {
		attendanceRows = [];
		classDays = 0;
	}
	const names = parseSubjects(staff.subject);
	const grades = [];
	for (const name of names.length ? names : [""]) {
		const plan = await subjectPlanOf(sql, staff, name);
		const evals = await sql`
      select period_no, coalesce(sum(points), 0) as points
      from student_evals
      where school_id = ${staff.school_id} and staff_id = ${staff.user_id} and student_id = ${student.id}
        and (${name} = '' or subject = ${name} or subject = '')
      group by period_no
    `;
		const marks = await sql`
      select period_no, participation, exam
      from student_period_marks
      where school_id = ${staff.school_id} and staff_id = ${staff.user_id} and student_id = ${student.id}
        and (${name} = '' or subject = ${name} or subject = '')
    `;
		const byPeriod = plan.periods.map((period) => {
			const marked = marks.find((row) => Number(row.period_no) === period.no);
			const extra = evals.find((row) => Number(row.period_no) === period.no);
			const participation = Number(marked?.participation ?? 0);
			const exam = Number(marked?.exam ?? 0);
			const evalPoints = Number(extra?.points ?? 0);
			const periodCap = Number(period.tasksMax ?? 0) + Number(period.examMax ?? 0);
			return { no: period.no, title: period.title, participation, exam, evalPoints, total: clampScore(participation + exam + evalPoints, periodCap || participation + exam + evalPoints), closed: period.closed };
		});
		const summed = byPeriod.reduce((sum, period) => sum + period.total, 0);
		const cap = plan.periods.reduce((sum, period) => sum + Number(period.tasksMax ?? 0) + Number(period.examMax ?? 0), 0);
		const total = plan.combine === "avg" && byPeriod.length ? roundMark(summed / byPeriod.length) : roundMark(summed);
		grades.push({ subject: name || "المادة", combine: plan.combine, periods: byPeriod, total: clampScore(total, cap || total) });
	}
	const positive = evalRows.filter((row) => Number(row.points) > 0);
	const negative = evalRows.filter((row) => Number(row.points) < 0);
	const points = roundMark(evalRows.reduce((sum, row) => sum + Number(row.points || 0), 0));
	const counts = new Map();
	for (const row of evalRows) counts.set(row.label, (counts.get(row.label) || 0) + 1);
	const frequent = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
	const days = new Set(evalRows.map((row) => String(row.created_at).slice(0, 10))).size;
	const absent = attendanceRows.filter((row) => row.kind === "absence" && !row.excused);
	const late = attendanceRows.filter((row) => row.kind === "late");
	const excused = attendanceRows.filter((row) => row.kind === "leave" || (row.kind === "absence" && row.excused));
	const presentDays = Math.max(0, classDays - absent.length);
	const attendancePercent = classDays > 0 ? Math.max(0, Math.round((presentDays / classDays) * 100)) : absent.length ? 0 : 100;
	const datesOf = (rows) => rows.map((row) => String(row.day).slice(0, 10)).join("، ") || "—";
	return {
		student: {
			id: student.id,
			name: student.name,
			classLabel: classLabel(student.short_name, student.class_name),
			stageName: student.stage_name || ""
		},
		teacher: staff.display_name,
		subject: grades[0]?.subject || "المادة",
		stats: {
			points,
			count: evalRows.length,
			positive: positive.length,
			negative: negative.length,
			days,
			badges: evalRows.filter((row) => String(row.label).includes("وسام")).length,
			lastLabel: evalRows[0]?.label || "—",
			frequentLabel: frequent ? frequent[0] : "—",
			summary: evalRows.length
				? points > 0
					? "مستواه جيد حسب التقييمات المرصودة."
					: points < 0
						? "يحتاج متابعة، التقييمات السلبية أكثر من الإيجابية."
						: "تقييماته متعادلة حتى الآن."
				: "لم ترصد تقييمات بعد — لا يحكم على مستواه من مجموعه الحالي."
		},
		indicators: {
			positive: evalRows.length ? Math.round((positive.length / evalRows.length) * 100) : null,
			negative: evalRows.length ? Math.round((negative.length / evalRows.length) * 100) : null,
			attendance: attendancePercent
		},
		evals: evalRows.map((row) => ({
			label: row.label,
			points: Number(row.points),
			subject: row.subject || "",
			createdAt: row.created_at
		})),
		attendance: {
			percent: attendancePercent,
			rows: [
				{ status: "حاضر", days: presentDays, dates: "—" },
				{ status: "غائب", days: absent.length, dates: datesOf(absent) },
				{ status: "متأخر", days: late.length, dates: datesOf(late) },
				{ status: "مستأذن/بعذر", days: excused.length, dates: datesOf(excused) }
			].filter((row) => row.status === "حاضر" || row.days > 0)
		},
		notes: notes.map((note) => ({
			id: note.id,
			type: note.type,
			details: note.details,
			subject: note.subject,
			periodKey: note.period_key,
			createdAt: note.created_at
		})),
		grades
	};
});
export const getStudentDossier = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	studentId: z.number()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireApproved(context.userId);
	await ensureAttendanceStamp(sql);
	await ensureExitPermits(sql);
	await ensureTeacherEval(sql);
	const student = (await sql`
    select s.id, s.name, c.name as class_name, st.short_name, st.name as stage_name
    from students s
    join classes c on c.id = s.class_id
    join stages st on st.id = c.stage_id
    where s.id = ${data.studentId} and s.school_id = ${staff.school_id}
  `)[0];
	if (!student) throw new Error("الطالب غير موجود");
	const attendance = await sql`
    select a.kind, a.day::text as day, coalesce(a.details, '') as details,
           coalesce(a.arrived_at::text, '') as arrived_at,
           coalesce(a.recorded_at::text, a.arrived_at::text, a.day::text) as recorded_at,
           coalesce(stf.display_name, '') as recorder
    from daily_attendance a
    left join staff stf on stf.user_id = a.recorded_by and stf.school_id = a.school_id
    where a.school_id = ${staff.school_id} and a.student_id = ${student.id}
      and a.kind in ('absence', 'late', 'leave')
    order by a.day desc, a.kind
  `;
	const permits = await sql`
    select p.kind, p.created_at::text as created_at, coalesce(stf.display_name, '') as recorder
    from exit_permits p
    left join staff stf on stf.user_id = p.staff_id and stf.school_id = p.school_id
    where p.school_id = ${staff.school_id} and p.student_id = ${student.id}
    order by p.created_at desc
    limit 80
  `;
	const notes = await sql`
    select n.type, coalesce(n.details, '') as details, coalesce(n.subject, '') as subject,
           coalesce(bt.name, '') as behavior_name, n.created_at::text as created_at,
           coalesce(stf.display_name, '') as teacher, coalesce(stf.subject, '') as teacher_subject
    from notes n
    left join staff stf on stf.user_id = n.teacher_id and stf.school_id = n.school_id
    left join behavior_types bt on bt.id = n.behavior_type_id
    where n.school_id = ${staff.school_id} and n.student_id = ${student.id}
    order by n.created_at desc
    limit 80
  `;
	const evals = await sql`
    select e.label, e.points, coalesce(nullif(e.subject, ''), nullif(stf.subject, ''), 'بدون مادة') as subject,
           e.created_at::text as created_at, coalesce(stf.display_name, '') as teacher
    from student_evals e
    left join staff stf on stf.user_id = e.staff_id and stf.school_id = e.school_id
    where e.school_id = ${staff.school_id} and e.student_id = ${student.id}
    order by subject, e.created_at desc
    limit 160
  `;
	return {
		student: {
			name: student.name,
			classLabel: classLabel(student.short_name, student.class_name),
			stageName: student.stage_name || ""
		},
		attendance: attendance.map((row) => ({
			kind: row.kind,
			day: String(row.day).slice(0, 10),
			details: row.details,
			arrivedAt: row.arrived_at,
			recordedAt: row.recorded_at,
			recorder: row.recorder
		})),
		permits: permits.map((row) => ({ kind: row.kind, createdAt: row.created_at, recorder: row.recorder })),
		notes: notes.map((row) => ({
			type: row.type,
			details: row.details,
			subject: row.subject || row.teacher_subject || "",
			behaviorName: row.behavior_name,
			createdAt: row.created_at,
			teacher: row.teacher
		})),
		levels: evals.map((row) => ({
			label: row.label,
			points: Number(row.points) || 0,
			subject: row.subject,
			createdAt: row.created_at,
			teacher: row.teacher
		}))
	};
});
export const saveSubjectMark = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	classId: z.number(),
	studentId: z.number(),
	participation: z.number().min(0).max(100),
	exam: z.number().min(0).max(100)
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireApproved(context.userId);
	await ensureTeacherEval(sql);
	const student = (await sql`
    select id from students where id = ${data.studentId} and class_id = ${data.classId} and school_id = ${staff.school_id}
  `)[0];
	if (!student) throw new Error("الطالب ليس في هذا الفصل");
	const scaleRow = (await sql`select tasks_max, quizzes_max from eval_scales where staff_id = ${staff.user_id}`)[0];
	const tasksMax = Number(scaleRow?.tasks_max ?? 40);
	const quizzesMax = Number(scaleRow?.quizzes_max ?? 20);
	const participation = clampScore(data.participation, tasksMax);
	const exam = clampScore(data.exam, quizzesMax);
	await sql`
    insert into student_subject_marks (school_id, staff_id, student_id, class_id, participation, exam)
    values (${staff.school_id}, ${staff.user_id}, ${data.studentId}, ${data.classId}, ${participation}, ${exam})
    on conflict (staff_id, student_id) do update
      set class_id = ${data.classId}, participation = ${participation}, exam = ${exam}
  `;
	return { participation, exam };
});
export const getMyTimetable = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requireDesk(context.userId);
	await ensureTeacherEval(sql);
	const rows = await sql`
    select t.day, t.period_key, t.class_id, t.place, coalesce(t.subject, '') as subject,
           c.name as class_name, st.short_name
    from staff_timetable t
    left join classes c on c.id = t.class_id
    left join stages st on st.id = c.stage_id
    where t.staff_id = ${staff.user_id} and t.school_id = ${staff.school_id}
    order by t.day, t.period_key
  `;
	return {
		cells: rows.map((row) => ({
			day: Number(row.day),
			periodKey: row.period_key,
			classId: row.class_id == null ? null : Number(row.class_id),
			place: row.place || "",
			subject: row.subject || "",
			classLabel: row.class_name ? classLabel(row.short_name, row.class_name) : ""
		})),
		subject: staff.subject || "",
		role: staff.role,
		displayName: staff.display_name || ""
	};
});
export const saveMyTimetable = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	cells: z.array(z.object({
		day: z.number().int().min(0).max(4),
		periodKey: z.string().max(20),
		classId: z.number().nullable().optional(),
		place: z.string().max(80),
		subject: z.string().max(40).optional()
	})).max(40)
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireDesk(context.userId);
	await ensureTeacherEval(sql);
	await sql`delete from staff_timetable where staff_id = ${staff.user_id} and school_id = ${staff.school_id}`;
	let saved = 0;
	for (const cell of data.cells) {
		if (!/^p\d+$/.test(cell.periodKey)) continue;
		const place = cell.place.trim().slice(0, 80);
		const subject = (cell.subject ?? "").trim().slice(0, 40);
		const classId = cell.classId ?? null;
		if (!place && !classId) continue;
		if (classId) {
			const cls = (await sql`select id from classes where id = ${classId} and school_id = ${staff.school_id}`)[0];
			if (!cls) continue;
		}
		await sql`
      insert into staff_timetable (staff_id, school_id, day, period_key, class_id, place, subject)
      values (${staff.user_id}, ${staff.school_id}, ${cell.day}, ${cell.periodKey}, ${classId}, ${place}, ${subject})
    `;
		saved += 1;
	}
	return { ok: true, saved };
});
export const getSchoolTimetable = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requireApproved(context.userId);
	if (staff.role !== "admin") throw new Error("هذه الصفحة لمدير المدرسة");
	await ensureTeacherEval(sql);
	const rows = await sql`
    select t.staff_id, sf.display_name, t.day, t.period_key, t.class_id,
           coalesce(t.subject, '') as subject, coalesce(t.place, '') as place,
           c.name as class_name, st.short_name
    from staff_timetable t
    join staff sf on sf.user_id = t.staff_id and sf.school_id = t.school_id
    left join classes c on c.id = t.class_id
    left join stages st on st.id = c.stage_id
    where t.school_id = ${staff.school_id}
    order by t.day, t.period_key
  `;
	return {
		cells: rows.map((row) => ({
			staffId: row.staff_id,
			staffName: row.display_name || "",
			day: Number(row.day),
			periodKey: row.period_key,
			classId: row.class_id == null ? null : Number(row.class_id),
			subject: row.subject || "",
			place: row.place || "",
			classLabel: row.class_name ? classLabel(row.short_name, row.class_name) : ""
		}))
	};
});
export const getLiveLessons = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requireApproved(context.userId);
	await ensureTeacherEval(sql);
	const stages = await sql`
    select id, name, sort_order from stages where school_id = ${staff.school_id} order by sort_order, id
  `;
	const rows = await sql`
    select t.day, t.period_key, coalesce(t.subject, '') as subject, sf.display_name,
           c.name as class_name, st.id as stage_id, st.short_name
    from staff_timetable t
    join staff sf on sf.user_id = t.staff_id and sf.school_id = t.school_id
    join classes c on c.id = t.class_id
    join stages st on st.id = c.stage_id
    where t.school_id = ${staff.school_id}
    order by st.sort_order, c.name
  `;
	return {
		stages: stages.map((stage) => ({ id: stage.id, name: stage.name || "", sortOrder: Number(stage.sort_order) || 0 })),
		lessons: rows.map((row) => ({
			day: Number(row.day),
			periodKey: row.period_key,
			subject: row.subject || "",
			teacher: row.display_name || "",
			classLabel: classLabel(row.short_name, row.class_name),
			stageId: row.stage_id
		}))
	};
});
const timetableCell = z.object({
	day: z.number().int().min(0).max(4),
	periodKey: z.string().max(20),
	classId: z.number().nullable().optional(),
	place: z.string().max(80).optional(),
	subject: z.string().max(40).optional(),
	staffId: z.string().max(80).optional()
});
export const saveClassTimetable = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	classId: z.number(),
	cells: z.array(timetableCell).max(40)
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireApproved(context.userId);
	if (staff.role !== "admin") throw new Error("هذه الصفحة لمدير المدرسة");
	await ensureTeacherEval(sql);
	const cls = (await sql`select id from classes where id = ${data.classId} and school_id = ${staff.school_id}`)[0];
	if (!cls) throw new Error("الفصل غير موجود");
	await sql`delete from staff_timetable where school_id = ${staff.school_id} and class_id = ${data.classId}`;
	let saved = 0;
	for (const cell of data.cells) {
		if (!cell.staffId || !/^p\d+$/.test(cell.periodKey)) continue;
		const teacher = (await sql`select user_id from staff where user_id = ${cell.staffId} and school_id = ${staff.school_id}`)[0];
		if (!teacher) continue;
		const subject = (cell.subject ?? "").trim().slice(0, 40);
		const place = (cell.place ?? "").trim().slice(0, 80);
		await sql`
      delete from staff_timetable
      where staff_id = ${cell.staffId} and school_id = ${staff.school_id}
        and day = ${cell.day} and period_key = ${cell.periodKey}
    `;
		await sql`
      insert into staff_timetable (staff_id, school_id, day, period_key, class_id, place, subject)
      values (${cell.staffId}, ${staff.school_id}, ${cell.day}, ${cell.periodKey}, ${data.classId}, ${place}, ${subject})
    `;
		saved += 1;
	}
	return { ok: true, saved };
});
export const saveStaffTimetable = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	staffId: z.string().min(1).max(80),
	cells: z.array(timetableCell).max(40)
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireApproved(context.userId);
	if (staff.role !== "admin") throw new Error("هذه الصفحة لمدير المدرسة");
	await ensureTeacherEval(sql);
	const teacher = (await sql`select user_id from staff where user_id = ${data.staffId} and school_id = ${staff.school_id}`)[0];
	if (!teacher) throw new Error("المعلم غير موجود");
	await sql`delete from staff_timetable where staff_id = ${data.staffId} and school_id = ${staff.school_id}`;
	let saved = 0;
	for (const cell of data.cells) {
		if (!/^p\d+$/.test(cell.periodKey)) continue;
		const place = (cell.place ?? "").trim().slice(0, 80);
		const subject = (cell.subject ?? "").trim().slice(0, 40);
		const classId = cell.classId ?? null;
		if (!place && !classId) continue;
		if (classId) {
			const cls = (await sql`select id from classes where id = ${classId} and school_id = ${staff.school_id}`)[0];
			if (!cls) continue;
		}
		await sql`
      insert into staff_timetable (staff_id, school_id, day, period_key, class_id, place, subject)
      values (${data.staffId}, ${staff.school_id}, ${cell.day}, ${cell.periodKey}, ${classId}, ${place}, ${subject})
    `;
		saved += 1;
	}
	return { ok: true, saved };
});
export const importSmartTimetable = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	cells: z.array(z.object({
		teacherName: z.string().max(120),
		nickname: z.string().max(80).optional(),
		day: z.number().int().min(0).max(4),
		period: z.number().int().min(1).max(7),
		stageNo: z.number().int().min(1).max(6),
		classNo: z.number().int().min(1).max(30),
		subject: z.string().min(1).max(40)
	})).max(800),
	classKeys: z.array(z.string().regex(/^\d+\/\d+$/)).max(80).optional(),
	links: z.array(z.object({
		name: z.string().max(160),
		staffId: z.string().min(1).max(80)
	})).max(80).optional(),
	dry: z.boolean().optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireApproved(context.userId);
	if (staff.role !== "admin") throw new Error("هذه الصفحة لمدير المدرسة");
	await ensureTeacherEval(sql);
	const people = (await sql`
    select user_id, display_name, subject from staff
    where school_id = ${staff.school_id} and role = 'teacher' and coalesce(active, true) = true
  `).map((row) => ({ userId: row.user_id, name: row.display_name || "", subject: row.subject || "" }));
	const stageList = (await sql`
    select id, name, short_name, sort_order from stages where school_id = ${staff.school_id}
  `).map((row) => ({ id: row.id, name: row.name, shortName: row.short_name, sortOrder: Number(row.sort_order) || 0 }));
	const classList = (await sql`
    select id, stage_id, name from classes where school_id = ${staff.school_id}
  `).map((row) => ({ id: row.id, stageId: row.stage_id, name: row.name }));
	const foldPart = (value) => String(value ?? "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[^\u0600-\u06FFa-z0-9]/gi, "").toLowerCase();
	const bare = (part) => (part.startsWith("ال") && part.length > 4 ? part.slice(2) : part);
	const tokens = (value) => String(value ?? "").split(/\s+/).map((part) => bare(foldPart(part))).filter((part) => part && part !== "بن" && part !== "ابن" && part !== "ال" && part.length > 1);
	const firstLast = (list) => (list.length >= 2 ? `${list[0]}|${list[list.length - 1]}` : "");
	const linkByName = new Map((data.links ?? []).map((link) => [foldArabic(link.name), link.staffId]));
	function matchTeacher(full, nick) {
		const linkedId = linkByName.get(foldArabic(nick || "")) || linkByName.get(foldArabic(full)) || linkByName.get(foldArabic(`${nick || ""} ${full}`));
		if (linkedId) return people.find((person) => person.userId === linkedId) ?? null;
		const names = [nick, full].map((value) => foldArabic(value || "")).filter(Boolean);
		const exact = people.find((person) => names.includes(foldArabic(person.name)));
		if (exact) return exact;
		const fileTokens = [...new Set([...tokens(nick), ...tokens(full)])];
		const fileEnds = new Set([firstLast(tokens(full)), firstLast(tokens(nick))].filter(Boolean));
		const latin = /[a-z]/i.test(`${full} ${nick || ""}`);
		const hits = people.map((person) => {
			const folded = foldArabic(person.name);
			if (latin && (folded === foldArabic(full) || (nick && folded === foldArabic(nick)))) return { person, shared: 99, family: true };
			const staffTokens = tokens(person.name);
			const has = new Set(staffTokens);
			const shared = fileTokens.filter((part) => has.has(part)).length;
			const family = fileEnds.has(firstLast(staffTokens));
			return { person, shared, family };
		}).filter((hit) => hit.family || hit.shared >= 3 || (fileTokens.length > 0 && fileTokens.length < 3 && hit.shared === fileTokens.length));
		const familyHits = hits.filter((hit) => hit.family);
		const pool = familyHits.length ? familyHits : hits;
		pool.sort((a, b) => b.shared - a.shared);
		if (!pool.length) return null;
		if (pool.length === 1 || pool[0].shared > pool[1].shared) return pool[0].person;
		return null;
	}
	async function ensureClass(stageNo, classNo) {
		let stage = stageList.find((item) => item.sortOrder === stageNo || stageOrdinal(item.name) === stageNo || stageOrdinal(item.shortName) === stageNo);
		if (!stage) {
			const known = DEFAULT_STAGES.find((item) => item.sortOrder === stageNo);
			if (!known) return null;
			const created = (await sql`
        insert into stages (school_id, name, short_name, sort_order)
        values (${staff.school_id}, ${known.name}, ${known.shortName}, ${known.sortOrder})
        returning id, name, short_name, sort_order
      `)[0];
			stage = { id: created.id, name: created.name, shortName: created.short_name, sortOrder: Number(created.sort_order) };
			stageList.push(stage);
		}
		const found = classList.find((item) => item.stageId === stage.id && (parseSectionName(item.name) === String(classNo) || foldArabic(item.name) === foldArabic(String(classNo))));
		if (found) return found;
		const created = (await sql`
      insert into classes (school_id, stage_id, name, sort_order)
      values (${staff.school_id}, ${stage.id}, ${String(classNo)}, ${classNo})
      returning id, stage_id, name
    `)[0];
		const cls = { id: created.id, stageId: created.stage_id, name: created.name };
		classList.push(cls);
		return cls;
	}
	const wanted = new Set(data.classKeys ?? []);
	const source = wanted.size ? data.cells.filter((cell) => wanted.has(`${cell.stageNo}/${cell.classNo}`)) : data.cells;
	const unmatched = new Set();
	const ready = [];
	for (const cell of source) {
		const teacher = matchTeacher(cell.teacherName, cell.nickname);
		if (!teacher) {
			unmatched.add(cell.nickname || cell.teacherName);
			continue;
		}
		if (data.dry) {
			ready.push({ ...cell, staffId: teacher.userId, classId: 0 });
			continue;
		}
		const cls = await ensureClass(cell.stageNo, cell.classNo);
		if (!cls) continue;
		ready.push({ ...cell, staffId: teacher.userId, classId: cls.id });
	}
	const staffIds = [...new Set(ready.map((cell) => cell.staffId))];
	if (data.dry) return { saved: ready.length, teachers: staffIds.length, unmatched: [...unmatched] };
	const classIds = [...new Set(ready.map((cell) => cell.classId))];
	const full = !wanted.size;
	if (full && staffIds.length) {
		await sql.query(`delete from staff_timetable where school_id = $1 and staff_id = any($2::text[])`, [staff.school_id, staffIds]);
	}
	if (classIds.length) {
		await sql.query(`delete from staff_timetable where school_id = $1 and class_id = any($2::int[])`, [staff.school_id, classIds]);
	}
	let saved = 0;
	const subjectsByTeacher = new Map();
	for (const cell of ready) {
		await sql`
      delete from staff_timetable
      where staff_id = ${cell.staffId} and school_id = ${staff.school_id}
        and day = ${cell.day} and period_key = ${"p" + cell.period}
    `;
		await sql`
      insert into staff_timetable (staff_id, school_id, day, period_key, class_id, place, subject)
      values (${cell.staffId}, ${staff.school_id}, ${cell.day}, ${"p" + cell.period}, ${cell.classId}, ${""}, ${cell.subject})
    `;
		const list = subjectsByTeacher.get(cell.staffId) ?? [];
		if (!list.includes(cell.subject)) list.push(cell.subject);
		subjectsByTeacher.set(cell.staffId, list);
		saved += 1;
	}
	for (const [staffId, subjects] of subjectsByTeacher) {
		const person = people.find((item) => item.userId === staffId);
		const merged = formatSubjects([...parseSubjects(person?.subject || ""), ...subjects]);
		await sql`update staff set subject = ${merged} where user_id = ${staffId} and school_id = ${staff.school_id}`;
		await ensureDefaultSubjectPlans(sql, { user_id: staffId, school_id: staff.school_id }, subjects);
	}
	return { saved, teachers: staffIds.length, unmatched: [...unmatched] };
});

export const getStudentRecordCounts = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const { sql, staff } = await requireAdmin(context.userId);
		const noteRows = await sql`
			select student_id, count(*)::int as cnt
			from notes
			where school_id = ${staff.school_id}
			group by student_id
		`;
		const attRows = await sql`
			select student_id, count(*)::int as cnt
			from daily_attendance
			where school_id = ${staff.school_id}
			group by student_id
		`;
		const evalRows = await sql`
			select student_id, count(*)::int as cnt
			from student_evals
			where school_id = ${staff.school_id}
			group by student_id
		`;
		const counts = {};
		for (const r of noteRows) {
			const id = Number(r.student_id);
			counts[id] = counts[id] || { notes: 0, attendance: 0, evals: 0 };
			counts[id].notes = Number(r.cnt) || 0;
		}
		for (const r of attRows) {
			const id = Number(r.student_id);
			counts[id] = counts[id] || { notes: 0, attendance: 0, evals: 0 };
			counts[id].attendance = Number(r.cnt) || 0;
		}
		for (const r of evalRows) {
			const id = Number(r.student_id);
			counts[id] = counts[id] || { notes: 0, attendance: 0, evals: 0 };
			counts[id].evals = Number(r.cnt) || 0;
		}
		return { counts };
	});

export const mergeDuplicateStudents = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(
		z.object({
			pairs: z
				.array(
					z.object({
						keepId: z.number(),
						removeId: z.number(),
					}),
				)
				.min(1)
				.max(500),
		}),
	)
	.handler(async ({ context, data }) => {
		const { sql, staff } = await requirePerm(context.userId, "editStudents");
		await ensureStudentProfile(sql);
		let merged = 0;
		let movedNotes = 0;

		for (const pair of data.pairs) {
			const { keepId, removeId } = pair;
			if (!keepId || !removeId || keepId === removeId) continue;

			const keepRow = (
				await sql`
					select * from students
					where id = ${keepId} and school_id = ${staff.school_id}
				`
			)[0];
			const removeRow = (
				await sql`
					select * from students
					where id = ${removeId} and school_id = ${staff.school_id}
				`
			)[0];
			if (!keepRow || !removeRow) continue;

			const nCount =
				(
					await sql`
						select count(*)::int as cnt from notes
						where student_id = ${removeId} and school_id = ${staff.school_id}
					`
				)[0]?.cnt ?? 0;
			movedNotes += Number(nCount) || 0;

			// اعتماد الاسم الأكمل (مثل اعتماد الاسم الرباعي بدلاً من الثلاثي الناقص)
			const keepWords = String(keepRow.name || "").trim().split(/\s+/).filter(Boolean).length;
			const removeWords = String(removeRow.name || "").trim().split(/\s+/).filter(Boolean).length;
			const bestName = removeWords > keepWords ? removeRow.name.trim() : keepRow.name.trim();
			const bestNameEn = englishName(bestName, keepRow.name_en || removeRow.name_en);

			// توحيد ودمج أرقام الجوال والسجل المدني والجنسية والملاحظات الصحية
			const phone1 = keepRow.parent_phone
				? normalizeSaudiPhone(keepRow.parent_phone)
				: removeRow.parent_phone
					? normalizeSaudiPhone(removeRow.parent_phone)
					: "";
			const phone2 = keepRow.parent_phone_2
				? normalizeSaudiPhone(keepRow.parent_phone_2)
				: removeRow.parent_phone_2
					? normalizeSaudiPhone(removeRow.parent_phone_2)
					: "";
			const natId = keepRow.national_id || removeRow.national_id || "";
			const nationality = keepRow.nationality || removeRow.nationality || "";
			const healthNote = keepRow.health_note || removeRow.health_note || "";

			await sql`
				update students set
					name = ${bestName},
					name_en = ${bestNameEn},
					parent_phone = ${phone1},
					parent_phone_2 = ${phone2},
					national_id = ${natId},
					nationality = ${nationality},
					health_note = ${healthNote}
				where id = ${keepId} and school_id = ${staff.school_id}
			`;

			// نقل جميع السجلات المرتبطة من السجل المكرر إلى السجل الأساسي قبل حذفه
			try {
				await sql`update exit_permits set student_id = ${keepId} where student_id = ${removeId} and school_id = ${staff.school_id}`;
			} catch {}
			try {
				await sql`update student_mail set student_id = ${keepId} where student_id = ${removeId} and school_id = ${staff.school_id}`;
			} catch {}
			try {
				await sql`update notifications set student_id = ${keepId} where student_id = ${removeId} and school_id = ${staff.school_id}`;
			} catch {}
			try {
				await sql`update class_move_requests set student_id = ${keepId} where student_id = ${removeId} and school_id = ${staff.school_id}`;
			} catch {}
			try {
				await sql`update student_evals set student_id = ${keepId} where student_id = ${removeId} and school_id = ${staff.school_id}`;
			} catch {}
			try {
				await sql`
					delete from student_subject_marks m
					where m.student_id = ${removeId}
					and exists (
						select 1 from student_subject_marks k
						where k.student_id = ${keepId} and k.staff_id = m.staff_id
					)
				`;
				await sql`update student_subject_marks set student_id = ${keepId} where student_id = ${removeId}`;
			} catch {}
			try {
				await sql`
					delete from student_period_marks m
					where m.student_id = ${removeId}
					and exists (
						select 1 from student_period_marks k
						where k.student_id = ${keepId} and k.staff_id = m.staff_id and k.period_no = m.period_no and k.subject = m.subject
					)
				`;
				await sql`update student_period_marks set student_id = ${keepId} where student_id = ${removeId}`;
			} catch {}

			// نقل الملاحظات والمخالفات والرسائل والغياب وحذف السجل الزائد
			await reassignStudent(sql, removeId, keepId);
			merged += 1;
		}

		return { ok: true, merged, movedNotes };
	});