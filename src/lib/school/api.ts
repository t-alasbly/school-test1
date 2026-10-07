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
  OFFICIAL_BEHAVIOR_TYPES,
  LEGACY_DEGREE_PROCEDURES,
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
import { transliterateArabicName } from "./transliterate";
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
	return {
		sql,
		staff,
		school
	};
}
let studentEnglishReady = false;
async function ensureStudentEnglish(sql) {
	if (studentEnglishReady) return;
	await sql.query(`alter table students add column if not exists name_en text not null default ''`);
	const missing = await sql`select id, name from students where coalesce(name_en, '') = '' limit 800`;
	for (const row of missing) {
		const english = transliterateArabicName(row.name);
		if (!english) continue;
		await sql`update students set name_en = ${english} where id = ${row.id} and coalesce(name_en, '') = ''`;
	}
	studentEnglishReady = true;
}
function englishName(name, given) {
	const typed = typeof given === "string" ? given.trim() : "";
	if (typed) return typed.slice(0, 120);
	return transliterateArabicName(name).slice(0, 120);
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
		const ladder = procedureLadder(item.degree);
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
			const legacy = LEGACY_DEGREE_PROCEDURES[item.degree] ?? [];
			const empty = stages.length === 0;
			const untouched = JSON.stringify(stages) === JSON.stringify(legacy);
			if (empty || untouched) {
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
		await ensureStaffMail(sql);
	}
	const behaviorTypes = pending ? [] : await listBehaviorTypeRows(sql, school.id, true);
	const actionTypes = pending ? [] : await listActionTypeRows(sql, school.id, true);
	let healthConditions = [];
	let compensations = [];
	let improvementOptions = [];
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
		improvementOptions
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
export const getClassPage = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ classId: z.number() })).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	const row = (await sql`
      select c.id, c.name, c.stage_id, st.name as stage_name, st.short_name
      from classes c
      join stages st on st.id = c.stage_id
      where c.id = ${data.classId} and c.school_id = ${staff.school_id}
    `)[0];
	if (!row) throw new Error("الفصل غير موجود");
	const students = await sql`
      select s.id, s.name, coalesce(s.name_en, '') as name_en, s.parent_phone, coalesce(s.health_note, '') as health_note,
             a.kind as daily_kind, a.arrived_at::text as arrived_at
      from students s
      left join daily_attendance a
        on a.student_id = s.id and a.school_id = s.school_id and a.day = current_date
      where s.class_id = ${row.id} and s.school_id = ${staff.school_id}
      order by s.name
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
             coalesce(sf.subject, '') as teacher_subject
      from notes n
      join students s on s.id = n.student_id
      left join behavior_types bt on bt.id = n.behavior_type_id
      left join staff sf on sf.user_id = n.teacher_id
      where s.class_id = ${row.id}
        and n.school_id = ${staff.school_id}
        and n.created_at >= current_date
    `;
	const byStudent = new Map();
	const hideOthers = cannotViewAll(staff, school) && !mappedPerms(staff, school).editRecords;
	for (const n of notes) {
		if (hideOthers && n.teacher_id !== staff.user_id) continue;
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
			referCounselor: Boolean(n.refer_counselor)
		});
		byStudent.set(n.student_id, list);
	}
	for (const list of byStudent.values()) list.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
	const studentRows = students.map((s) => ({
		id: s.id,
		name: s.name,
		nameEn: s.name_en ?? "",
		parentPhone: revealPhone(staff, school, s.parent_phone),
		classId: row.id,
		healthNote: s.health_note ?? "",
		dailyKind: s.daily_kind ?? null,
		arrivedAt: s.arrived_at || null,
		todayNotes: byStudent.get(s.id) ?? []
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
		students: studentRows
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
	compensation: z.string().max(400).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	await ensureNoteThread(sql);
	const student = (await sql`
      select s.id, s.name, s.class_id, coalesce(s.parent_phone, '') as parent_phone,
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
	const suggested = data.suggestedAction?.trim() ?? "";
	const compensation = data.compensation?.trim() ?? "";
	const dest = "vp";
	const refer = false;
	const noteId = (await sql`
      insert into notes (school_id, student_id, teacher_id, type, details, behavior_type_id, period_key, occurred_at, refer_counselor, suggested_action, compensation, dest)
      values (${staff.school_id}, ${student.id}, ${staff.user_id}, ${data.type}, ${data.details?.trim() ?? ""}, ${behaviorTypeId}, ${periodKey}, ${occurredAt}, ${refer}, ${suggested}, ${compensation}, ${dest})
      returning id
    `)[0]?.id ?? null;
	const meta = NOTE_META[data.type];
	const label = behaviorName ? `${meta.label} (${behaviorName})` : meta.label;
	let occurrence = 1;
	if (data.type === "behavior" && behaviorTypeId) occurrence = (await sql`
        select count(*)::int as count from notes
        where school_id = ${staff.school_id}
          and student_id = ${student.id}
          and type = 'behavior'
          and behavior_type_id = ${behaviorTypeId}
      `)[0]?.count ?? 1;
	let handled = "vp";
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
	const actor = ROLE_LABEL[staff.role] || "الموظف";
	const body = behaviorDegree === 1 && occurrence >= 3
		? `تكررت مخالفة الدرجة الأولى (${behaviorName}) على الطالب ${student.name} ${occurrenceLabel(occurrence)}. سجّلها ${actor} ${staff.display_name}. تُحال إلى وكيل شؤون الطلاب لاتخاذ إجراء هذه المرحلة.`
		: occurrence > 1
			? `تكررت مخالفة (${behaviorName}) على الطالب ${student.name} ${occurrenceLabel(occurrence)}. سجّلها ${actor} ${staff.display_name}. يُرجى إشعار وكيل الشؤون الفنية${school.technical_vp_name ? ` (${school.technical_vp_name})` : ""} واتخاذ إجراء المرحلة المناسبة.`
			: `تم تسجيل ${label} للطالب ${student.name} بواسطة ${actor} ${staff.display_name}`;
	const tone = occurrence > 1 ? "danger" : meta.tone;
	if (data.type === "absence" || data.type === "late") {
		await upsertAttendanceDigest(sql, staff, school);
	} else if (handled !== "verbal") {
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
	if (refer) await notifyCounselingStaff(sql, school, staff, "إحالة إلى الإرشاد الطلابي", `أُحيل الطالب ${student.name} إلى الإرشاد الطلابي — ${label}.`, noteId);
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
		handled
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
             coalesce(sf.subject, '') as teacher_subject,
             n.behavior_type_id,
             bt.name as behavior_type_name,
             bt.degree as behavior_degree,
             coalesce(n.period_key, '') as period_key
      from notes n
      left join staff sf on sf.user_id = n.teacher_id
      left join behavior_types bt on bt.id = n.behavior_type_id
      where n.student_id = ${student.id} and n.school_id = ${staff.school_id}
      order by n.created_at desc
    `;
	const hideOthers = cannotViewAll(staff, school) && !mappedPerms(staff, school).editRecords;
	const visible = hideOthers ? notes.filter((n) => n.teacher_id === staff.user_id) : notes;
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
		notes: withOccurrence(visible.map((n) => ({
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
			behaviorTypeId: n.behavior_type_id,
			behaviorTypeName: n.behavior_type_name,
			behaviorDegree: n.behavior_degree,
			periodKey: n.period_key,
			referCounselor: Boolean(n.refer_counselor),
			dest: n.dest === "health" || n.dest === "counselor" ? n.dest : (n.refer_counselor ? "counselor" : "vp"),
			suggestedAction: n.suggested_action ?? "",
			compensation: n.compensation ?? ""
		}))),
		scopedToTeacher: hideOthers
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
            coalesce(sf.subject, '') as teacher_subject,
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
	const { sql, staff } = await requirePerm(context.userId, "takeActions");
	const note = (await sql`
      select n.id, n.teacher_id, n.type, s.name as student_name
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
	const meta = NOTE_META[note.type];
	const title = "تم اتخاذ الإجراء";
	const body = `قام ${ROLE_LABEL[staff.role] || "الإدارة"} بإغلاق ملاحظة (${meta.label}) للطالب ${note.student_name}: ${data.actionTaken.trim()}`;
	await sql`
      insert into notifications (school_id, user_id, note_id, kind, title, body, tone)
      values (${staff.school_id}, ${note.teacher_id}, ${note.id}, ${"action"}, ${title}, ${body}, ${"ok"})
    `;
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
	stageName: z.string(),
	className: z.string()
})).max(800), replaceEmpty: z.boolean().optional() })).handler(async ({ context, data }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	await repairClassStructure(sql, staff.school_id);
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
		let existing = (await sql`
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
		const phone = row.parentPhone.trim();
		if (existing) {
			await sql`
          update students set parent_phone = ${phone}, class_id = ${cls.id}
          where id = ${existing.id} and school_id = ${staff.school_id}
        `;
			updated += 1;
		} else {
			await sql`
          insert into students (school_id, class_id, name, name_en, parent_phone)
          values (${staff.school_id}, ${cls.id}, ${name}, ${englishName(name)}, ${phone})
        `;
			inserted += 1;
		}
	}
	await repairClassStructure(sql, staff.school_id);
	let pruned = { removedClasses: 0, removedStages: 0 };
	if (data.replaceEmpty !== false) pruned = await pruneEmptyDivisions(sql, staff.school_id, usedClassIds);
	return {
		inserted,
		updated,
		skipped,
		removedClasses: pruned.removedClasses,
		removedStages: pruned.removedStages
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
	subject: z.string().max(80).optional(),
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
	subject: z.string().max(80).optional(),
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
	subject: z.string().max(80).optional(),
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
	procedures: z.array(z.array(z.string().max(220)).max(10)).max(8).optional()
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
	nameEn: z.string().max(120).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editStudents");
	if (!(await sql`
      select id from classes where id = ${data.classId} and school_id = ${staff.school_id}
    `)[0]) throw new Error("الفصل غير موجود");
	const name = data.name.trim();
	const phone = data.parentPhone ? normalizeSaudiPhone(data.parentPhone) : "";
	const nameEn = englishName(name, data.nameEn);
	return { id: (await sql`
      insert into students (school_id, class_id, name, name_en, parent_phone)
      values (${staff.school_id}, ${data.classId}, ${name}, ${nameEn}, ${phone})
      returning id
    `)[0].id };
});
export const updateStudent = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	studentId: z.number(),
	name: z.string().min(2).max(80),
	parentPhone: z.string().max(20).optional(),
	classId: z.number(),
	nameEn: z.string().max(120).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editStudents");
	if (!(await sql`
      select id, class_id from students
      where id = ${data.studentId} and school_id = ${staff.school_id}
    `)[0]) throw new Error("الطالب غير موجود");
	if (!(await sql`
      select id from classes where id = ${data.classId} and school_id = ${staff.school_id}
    `)[0]) throw new Error("الفصل غير موجود");
	const name = data.name.trim();
	const nameEn = englishName(name, data.nameEn);
	await sql`
      update students
      set name = ${name}, name_en = ${nameEn}, parent_phone = ${data.parentPhone ? normalizeSaudiPhone(data.parentPhone) : ""}, class_id = ${data.classId}
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
	await sql.query(`alter table notifications add column if not exists student_id integer`);
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
	const people = await sql`
      select user_id, role, coalesce(permissions::text, '{}') as permissions
      from staff
      where school_id = ${staff.school_id}
        and coalesce(active, true) = true
        and role <> 'pending'
    `;
	const mapped = mapSchool(school);
	const canEditRow = (row) => row.role === "admin" || row.role === "principal" || Boolean(parsePermissions(row.permissions, row.role, mapped).editStudents);
	const editors = people.filter(canEditRow);
	const others = editors.filter((row) => row.user_id !== staff.user_id);
	const senderCanEdit = staff.role === "admin" || staff.role === "principal" || Boolean(mappedPerms(staff, school).editStudents);
	if (others.length === 0 && senderCanEdit) {
		await sql`
        update students set class_id = ${target.id}
        where id = ${student.id} and school_id = ${staff.school_id}
      `;
		return { ok: true, applied: true, count: 0, toLabel };
	}
	if (others.length === 0) throw new Error("لا يوجد مسؤول يملك صلاحية تعديل الطلاب");
	const title = "طلب تغيير فصل";
	const body = `${staff.display_name} يطلب نقل الطالب ${student.name} من ${fromLabel} إلى ${toLabel}.`;
	for (const row of others) {
		await sql`
        insert into notifications (school_id, user_id, note_id, student_id, kind, title, body, tone)
        values (${staff.school_id}, ${row.user_id}, ${null}, ${student.id}, ${"class-move"}, ${title}, ${body}, ${"warn"})
      `;
	}
	return { ok: true, applied: false, count: others.length, toLabel };
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
	parentPhone: z.string().max(20).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	if (!mappedPerms(staff, school).sendMessages) throw new Error("إرسال رسائل أولياء الأمور غير مفعّل لحسابك");
	const student = await sql`
      select id, parent_phone from students
      where id = ${data.studentId} and school_id = ${staff.school_id}
    `;
	if (!student[0]) throw new Error("الطالب غير موجود");
	const phone = data.parentPhone || student[0].parent_phone;
	return { id: (await sql`
      insert into parent_messages (school_id, student_id, staff_id, kind, body, parent_phone)
      values (${staff.school_id}, ${student[0].id}, ${staff.user_id}, ${data.kind}, ${data.body.trim()}, ${phone})
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
              m.kind, m.body, m.parent_phone, m.created_at::text as created_at
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
              a.kind, coalesce(a.excused, false) as excused, coalesce(a.details, '') as details,
              a.arrived_at::text as arrived_at
       from students s
       join classes c on c.id = s.class_id
       join stages st on st.id = c.stage_id
       left join daily_attendance a
         on a.student_id = s.id and a.school_id = s.school_id and a.day = $${dayIdx}::date
       where ${where}
       order by st.sort_order, c.sort_order, s.name`, params)).map((r) => ({
			studentId: r.id,
			studentName: r.name,
			nameEn: r.name_en ?? "",
			classId: r.class_id,
			classLabel: classLabel(r.short_name, r.class_name),
			kind: r.kind ?? null,
			excused: Boolean(r.excused),
			details: r.details ?? "",
			arrivedAt: r.arrived_at || null
		}))
	};
});
export const saveDailyAttendance = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	day: z.string().min(8).max(12),
	entries: z.array(z.object({
		studentId: z.number(),
		kind: z.enum([
			"present",
			"absence",
			"late"
		]),
		excused: z.boolean().optional(),
		details: z.string().max(200).optional(),
		arrivedAt: z.string().max(40).optional()
	}))
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "dailyAttendance");
	const day = data.day.trim();
	for (const entry of data.entries) {
		if (!(await sql`
          select id from students where id = ${entry.studentId} and school_id = ${staff.school_id}
        `)[0]) continue;
		if (entry.kind === "present") {
			await sql`
          delete from daily_attendance
          where school_id = ${staff.school_id} and student_id = ${entry.studentId} and day = ${day}::date
        `;
			continue;
		}
		const arrived = entry.kind === "late" ? entry.arrivedAt?.trim() ? new Date(entry.arrivedAt).toISOString() : (/* @__PURE__ */ new Date()).toISOString() : null;
		await sql.query(`insert into daily_attendance (school_id, student_id, day, kind, excused, details, recorded_by, arrived_at)
         values ($1, $2, $3::date, $4, $5, $6, $7, $8)
         on conflict (school_id, student_id, day)
         do update set kind = excluded.kind, excused = excluded.excused, details = excluded.details, recorded_by = excluded.recorded_by, arrived_at = excluded.arrived_at`, [
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
export const referToCounselor = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ noteId: z.number() })).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requirePerm(context.userId, "takeActions");
	const note = (await sql`
        select n.id, n.refer_counselor, s.name as student_name, n.type
        from notes n
        join students s on s.id = n.student_id
        where n.id = ${data.noteId} and n.school_id = ${staff.school_id}
      `)[0];
	if (!note) throw new Error("الملاحظة غير موجودة");
	await sql`
      update notes set refer_counselor = true where id = ${note.id} and school_id = ${staff.school_id}
    `;
	await notifyCounselingStaff(sql, school, staff, "إحالة إلى الإرشاد الطلابي", `أحال وكيل شؤون الطلاب ${staff.display_name} الطالب ${note.student_name} إلى الإرشاد الطلابي.`, note.id);
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
export const listRoster = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requireAdmin(context.userId);
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
        coalesce(s.parent_phone, '') as parent_phone
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
	const { sql, staff } = await requirePerm(context.userId, "editRecords");
	const note = (await sql`
      select id, type, details, behavior_type_id, period_key, occurred_at, action_taken, status, compensation, closed_at, closed_by
      from notes where id = ${data.noteId} and school_id = ${staff.school_id}
    `)[0];
	if (!note) throw new Error("الملاحظة غير موجودة");
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
	const { sql, staff } = await requirePerm(context.userId, "editRecords");
	const note = (await sql`select id from notes where id = ${data.noteId} and school_id = ${staff.school_id}`)[0];
	if (!note) throw new Error("الملاحظة غير موجودة");
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
	kind: z.enum(["absence", "late"]),
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
	const notes = await sql.query(`select n.created_at::date::text as day, s.id as student_id, s.name as student_name,
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
	const { sql, staff, school } = await requireApproved(context.userId);
	const perms = mappedPerms(staff, school);
	const myNotes = (await sql`select count(*)::int as count from notes where school_id = ${staff.school_id} and teacher_id = ${staff.user_id}`)[0]?.count ?? 0;
	const myClosed = (await sql`select count(*)::int as count from notes where school_id = ${staff.school_id} and teacher_id = ${staff.user_id} and status = 'closed'`)[0]?.count ?? 0;
	const waiting = (await sql`select count(*)::int as count from notes where school_id = ${staff.school_id} and teacher_id = ${staff.user_id} and status = 'open'`)[0]?.count ?? 0;
	const referrals = perms.counseling || perms.takeActions
		? (await sql`select count(*)::int as count from notes where school_id = ${staff.school_id} and refer_counselor = true`)[0]?.count ?? 0
		: (await sql`select count(distinct student_id)::int as count from notes where school_id = ${staff.school_id} and teacher_id = ${staff.user_id}`)[0]?.count ?? 0;
	return {
		myNotes,
		myClosed,
		waiting,
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
	const params = [staff.school_id];
	let where = "s.school_id = $1";
	if (data.classId) {
		params.push(data.classId);
		where += ` and s.class_id = $${params.length}`;
	} else if (data.stageId) {
		params.push(data.stageId);
		where += ` and c.stage_id = $${params.length}`;
	}
	const rows = await sql.query(`select s.id, s.name, s.class_id, coalesce(s.parent_phone, '') as parent_phone, coalesce(s.health_note, '') as health_note, c.name as class_name, st.short_name, st.name as stage_name, st.id as stage_id
     from students s
     join classes c on c.id = s.class_id
     join stages st on st.id = c.stage_id
     where ${where}
     order by st.sort_order, c.sort_order, s.name`, params);
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
	const rows = await sql.query(`select s.id, s.name, s.class_id, coalesce(s.parent_phone, '') as parent_phone,
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
	referred: z.boolean().optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	const notes = await fetchNotes(sql, staff.school_id, {
		status: data.status && data.status !== "all" ? data.status : void 0,
		teacherId: staff.user_id,
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
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		mine: row.author_id === staff.user_id,
		assignedToMe: row.assignee_id === staff.user_id
	};
}
const MAIL_SQL = `select m.id, m.student_id, m.author_id, m.assignee_id, m.dest, m.status,
             m.created_at::text as created_at, m.updated_at::text as updated_at,
             s.name as student_name, c.name as class_name, st.short_name,
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
	body: z.string().min(2).max(2000)
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
	body: z.string().min(1).max(2000)
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
