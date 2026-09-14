// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
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
  NOTE_META,
  OFFICIAL_BEHAVIOR_TYPES,
  classLabel,
  foldArabic,
  normalizeSaudiPhone,
  occurrenceLabel,
  parseProcedures,
  phoneToLoginEmail,
  procedureLadder,
  withOccurrence,
} from "./constants";
import { parsePermissions, defaultPermissions, type PermissionKey } from "./permissions";
import { parseAppearance, parseOptionalAppearance, type Appearance } from "./theme";
import type {
  ImprovementStatus,
  NoteType,
  School,
  SchoolGender,
  Season,
  StaffRole,
} from "./types";

type StaffRow = {
  user_id: string;
  school_id: number;
  display_name: string;
  role: "admin" | "teacher" | "counselor" | "pending";
  subject: string;
  phone: string;
  permissions: unknown;
  appearance: unknown;
};

type SchoolRow = {
  id: number;
  name: string;
  principal_name: string;
  season: Season;
  region: string;
  governorate: string;
  leadership_gender: string;
  student_gender: string;
  counselor_name: string;
  technical_vp_name: string;
  logo_url: string;
  tagline: string;
  message_templates: unknown;
  teachers_can_message: boolean;
  teachers_can_view_all: boolean;
  appearance: unknown;
};

function mapGender(value: any) {
	return value === "female" ? "female" : "male";
}
function mapSchool(school: any): School {
	return {
		id: school.id,
		name: school.name,
		principalName: school.principal_name,
		season: school.season === "summer" ? "summer" : "winter",
		region: school.region ?? "",
		governorate: school.governorate ?? "",
		leadershipGender: mapGender(school.leadership_gender) as SchoolGender,
		studentGender: mapGender(school.student_gender) as SchoolGender,
		counselorName: school.counselor_name ?? "",
		technicalVpName: school.technical_vp_name ?? "",
		logoUrl: school.logo_url ?? "",
		extraLogoUrl: school.extra_logo_url ?? "",
		tagline: school.tagline ?? "",
		printMargins: parsePrintMargins(school.print_margins ?? school.printMargins),
		messageTemplates: parseMessageTemplates(school.message_templates),
		customMessages: parseCustomMessages(school.custom_messages),
		teachersCanMessage: school.teachers_can_message !== false,
		teachersCanViewAll: Boolean(school.teachers_can_view_all),
		appearance: parseAppearance(school.appearance)
	};
}
function parseMessageTemplates(raw: any) {
	let value = raw;
	if (typeof raw === "string") try {
		value = JSON.parse(raw);
	} catch {
		return {};
	}
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value;
}
function parseCustomMessages(raw: any) {
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
async function loadSchool(sql: any, schoolId: any) {
	const row = (await sql<any>`
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
	try {
		const extra = (await sql`
      select coalesce(tagline, '') as tagline, coalesce(print_margins::text, '{}') as print_margins,
             coalesce(extra_logo_url, '') as extra_logo_url,
             coalesce(custom_messages::text, '[]') as custom_messages
      from schools where id = ${schoolId}
    `)[0];
		tagline = extra?.tagline ?? "";
		print_margins = extra?.print_margins ?? DEFAULT_PRINT_MARGINS;
		extra_logo_url = extra?.extra_logo_url ?? "";
		custom_messages = extra?.custom_messages ?? "[]";
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
	return { ...row, tagline, print_margins, extra_logo_url, custom_messages };
}
async function getStaff(sql: any, userId: any) {
	try {
		return (await sql<any>`
    select user_id, school_id, display_name, role,
           coalesce(subject, '') as subject, coalesce(phone, '') as phone,
           coalesce(permissions::text, '{}') as permissions,
           coalesce(appearance::text, '{}') as appearance,
           coalesce(active, true) as active
    from staff
    where user_id = ${userId}
  `)[0] ?? null;
	} catch {
		const row = (await sql<any>`
    select user_id, school_id, display_name, role,
           coalesce(subject, '') as subject, coalesce(phone, '') as phone,
           coalesce(permissions::text, '{}') as permissions,
           coalesce(appearance::text, '{}') as appearance
    from staff
    where user_id = ${userId}
  `)[0] ?? null;
		return row ? { ...row, active: true } : null;
	}
}
function mappedPerms(staff: any, school: any) {
	return parsePermissions(staff.permissions, staff.role, mapSchool(school));
}
function cannotViewAll(staff: any, school: any) {
	return !mappedPerms(staff, school).viewAllViolations;
}
function mapStaffPublic(staff: any, school: any) {
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
async function requirePerm(userId: any, perm: any) {
	const ctx = await requireApproved(userId);
	const permissions = mappedPerms(ctx.staff, ctx.school);
	if (ctx.staff.role !== "admin" && !permissions[perm]) throw new Error("ليست لديك هذه الصلاحية");
	return {
		...ctx,
		permissions
	};
}
async function requireApproved(userId: any) {
	const sql = await getSql();
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
async function requireAdmin(userId: any) {
	const ctx = await requireApproved(userId);
	if (ctx.staff.role !== "admin") throw new Error("هذه الصفحة مخصصة لمدير التطبيق");
	return ctx;
}
async function ensureCatalog(sql: any, schoolId: any, table: any, defaults: any) {
	if (((await sql.query<any>(`select count(*)::int as count from ${table} where school_id = $1`, [schoolId]))[0]?.count ?? 0) > 0) return;
	for (let i = 0; i < defaults.length; i += 1) await sql.query<any>(`insert into ${table} (school_id, name, sort_order, active) values ($1, $2, $3, true)`, [
		schoolId,
		defaults[i],
		i + 1
	]);
}
async function ensureBehaviorTypes(sql: any, schoolId: any) {
	const existing = await sql.query<any>(`select id, name, coalesce(degree, 1)::int as degree, procedures
     from behavior_types where school_id = $1`, [schoolId]);
	const have = new Set(existing.map((r) => r.name));
	let order = existing.length;
	for (const item of OFFICIAL_BEHAVIOR_TYPES) {
		if (have.has(item.name)) continue;
		order += 1;
		const ladder = procedureLadder(item.degree);
		await sql.query<any>(`insert into behavior_types (school_id, name, sort_order, active, degree, procedures)
       values ($1, $2, $3, true, $4, $5::jsonb)`, [
			schoolId,
			item.name,
			order,
			item.degree,
			JSON.stringify(ladder)
		]);
	}
	for (const row of existing) {
		const stored = parseProcedures(row.procedures, row.degree);
		if (row.procedures == null || row.procedures === "[]" || Array.isArray(row.procedures) && row.procedures.length === 0) await sql.query<any>(`update behavior_types set procedures = $1::jsonb where id = $2`, [JSON.stringify(procedureLadder(row.degree ?? 1)), row.id]);
		else if (!stored.length) await sql.query<any>(`update behavior_types set procedures = $1::jsonb where id = $2`, [JSON.stringify(procedureLadder(row.degree ?? 1)), row.id]);
	}
}
async function ensureActionTypes(sql: any, schoolId: any) {
	await ensureCatalog(sql, schoolId, "action_types", DEFAULT_ACTION_TYPES);
}
async function ensureHealthConditions(sql: any, schoolId: any) {
	try {
		await ensureCatalog(sql, schoolId, "health_conditions", DEFAULT_HEALTH_CONDITIONS);
	} catch {
		// table may not exist until migration applies
	}
}
async function ensureCompensations(sql: any, schoolId: any) {
	try {
		await ensureCatalog(sql, schoolId, "compensation_options", COMPENSATION_OPTIONS);
	} catch {
		// table may not exist until migration applies
	}
}
async function ensureImproveOptions(sql: any, schoolId: any) {
	try {
		await ensureCatalog(sql, schoolId, "improvement_options", IMPROVE_OPTIONS);
	} catch {
		// table may not exist until migration applies
	}
}
function canManageImproveCatalog(staff: any, school: any) {
	if (staff.role === "admin") return true;
	const perms = mappedPerms(staff, school);
	return Boolean(perms.counseling || perms.acceptImprovements);
}
function mapCatalog(rows: any) {
	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		sortOrder: r.sort_order,
		active: r.active,
		degree: r.degree
	}));
}
function mapBehaviorTypes(rows: any) {
	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		sortOrder: r.sort_order,
		active: r.active,
		degree: r.degree,
		procedures: parseProcedures(r.procedures, r.degree)
	}));
}
async function listCatalogRows(sql: any, schoolId: any, table: any, activeOnly: any = false) {
	const sqlText = activeOnly ? `select id, name, sort_order, active from ${table}
         where school_id = $1 and active = true order by sort_order, id` : `select id, name, sort_order, active from ${table}
         where school_id = $1 order by sort_order, id`;
	return mapCatalog(await sql.query<any>(sqlText, [schoolId]));
}
async function listBehaviorTypeRows(sql: any, schoolId: any, activeOnly: any = false) {
	const sqlText = activeOnly ? `select id, name, sort_order, active, coalesce(degree, 1)::int as degree,
              procedures
         from behavior_types
         where school_id = $1 and active = true order by sort_order, id` : `select id, name, sort_order, active, coalesce(degree, 1)::int as degree,
              procedures
         from behavior_types
         where school_id = $1 order by sort_order, id`;
	return mapBehaviorTypes(await sql.query<any>(sqlText, [schoolId]));
}
async function listActionTypeRows(sql: any, schoolId: any, activeOnly: any = false) {
	return listCatalogRows(sql, schoolId, "action_types", activeOnly);
}
async function listClassOptions(sql: any, schoolId: any) {
	return (await sql<any>`
    select c.id, c.stage_id, st.name as stage_name, c.name, st.short_name
    from classes c
    join stages st on st.id = c.stage_id
    where c.school_id = ${schoolId}
    order by st.sort_order, c.sort_order
  `).map((r) => ({
		id: r.id,
		stageId: r.stage_id,
		stageName: r.stage_name,
		name: r.name,
		shortName: r.short_name,
		label: classLabel(r.short_name, r.name)
	}));
}
async function seedSchool(sql: any, schoolId: any) {
	await ensureBehaviorTypes(sql, schoolId);
	await ensureActionTypes(sql, schoolId);
}
async function ensureSchoolAndAdmin(sql: any) {
	const phone = normalizeSaudiPhone(DEFAULT_ADMIN_PHONE);
	const email = phoneToLoginEmail(phone);
	const name = DEFAULT_ADMIN_NAME;
	const schools = await sql<any>`select id from schools order by id limit 1`;
	let user = (await sql<any>`select id from "user" where email = ${email}`)[0];
	if (!user) {
		const id = randomBytes(16).toString("hex");
		const hashed = await hashPassword(DEFAULT_ADMIN_PASSWORD);
		await sql<any>`
      insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
      values (${id}, ${name}, ${email}, true, now(), now())
    `;
		await sql<any>`
      insert into "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
      values (${id}, ${id}, ${"credential"}, ${id}, ${hashed}, now(), now())
    `;
		user = { id };
	} else if (!(await sql<any>`
      select id from "account" where "userId" = ${user.id} and "providerId" = 'credential'
    `)[0]) {
		const hashed = await hashPassword(DEFAULT_ADMIN_PASSWORD);
		await sql<any>`
      insert into "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
      values (${user.id}, ${user.id}, ${"credential"}, ${user.id}, ${hashed}, now(), now())
    `;
	}
	let schoolId = schools[0]?.id;
	if (!schoolId) {
		schoolId = (await sql<any>`
      insert into schools (name, created_by)
      values (${DEFAULT_SCHOOL_NAME}, ${user.id})
      returning id
    `)[0].id;
		await seedSchool(sql, schoolId);
	}
	if (!(await sql<any>`
    select user_id from staff where user_id = ${user.id} and school_id = ${schoolId}
  `)[0]) await sql<any>`
      insert into staff (user_id, school_id, display_name, role, subject, phone)
      values (${user.id}, ${schoolId}, ${name}, 'admin', '', ${phone})
    `;
	else await sql<any>`
      update staff
      set role = 'admin', phone = ${phone}
      where user_id = ${user.id} and school_id = ${schoolId}
    `;
}
export const ensureAppReady = createServerFn({ method: "GET" }).handler(async () => {
	const sql = await getSql();
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
	} catch {
		/* tagline column applies after restart */
	}
	return { ok: true, name, logoUrl, tagline };
});
async function listStageSummaries(sql: any, schoolId: any, teacherId: any) {
	return (teacherId ? await sql<any>`
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
      ` : await sql<any>`
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
	await ensureSchoolAndAdmin(sql);
	const userId = context.userId;
	const users = await sql<any>`
      select name, email from "user" where id = ${userId}
    `;
	const displayName = users[0]?.name?.trim() || users[0]?.email || "عضو هيئة التعليم";
	let staff = await getStaff(sql, userId);
	if (!staff) {
		const existing = await sql<any>`select id, name from schools order by id limit 1`;
		if (existing[0]) await sql<any>`
          insert into staff (user_id, school_id, display_name, role)
          values (${userId}, ${existing[0].id}, ${displayName}, 'pending')
        `;
		staff = await getStaff(sql, userId);
	}
	if (!staff) throw new Error("تعذر تجهيز الحساب");
	if (staff.active === false) throw new Error("تم إلغاء هذا الحساب. راجع مدير التطبيق.");
	const school = await loadSchool(sql, staff.school_id);
	if (!school) throw new Error("المدرسة غير موجودة");
	const pending = staff.role === "pending";
	const hideOthers = cannotViewAll(staff, school);
	const stages = pending ? [] : await listStageSummaries(sql, school.id, hideOthers ? staff.user_id : void 0);
	const classes = pending ? [] : await listClassOptions(sql, school.id);
	if (!pending) {
		await ensureBehaviorTypes(sql, school.id);
		await ensureActionTypes(sql, school.id);
		await ensureHealthConditions(sql, school.id);
		await ensureCompensations(sql, school.id);
		await ensureImproveOptions(sql, school.id);
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
	const hideOthers = cannotViewAll(staff, school);
	const stage = (await sql<any>`
      select id, name, short_name from stages
      where id = ${data.stageId} and school_id = ${staff.school_id}
    `)[0];
	if (!stage) throw new Error("المرحلة غير موجودة");
	const list = (hideOthers ? await sql<any>`
          select
            c.id, c.stage_id, c.name, c.sort_order,
            (select count(*)::int from students s where s.class_id = c.id) as student_count,
            (select count(*)::int from notes n
               join students s on s.id = n.student_id
               where s.class_id = c.id and n.status = 'open' and n.teacher_id = ${staff.user_id}) as open_notes
          from classes c
          where c.stage_id = ${stage.id} and c.school_id = ${staff.school_id}
          order by c.sort_order
        ` : await sql<any>`
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
	const row = (await sql<any>`
      select c.id, c.name, c.stage_id, st.name as stage_name, st.short_name
      from classes c
      join stages st on st.id = c.stage_id
      where c.id = ${data.classId} and c.school_id = ${staff.school_id}
    `)[0];
	if (!row) throw new Error("الفصل غير موجود");
	const students = await sql<any>`
      select s.id, s.name, s.parent_phone, coalesce(s.health_note, '') as health_note,
             a.kind as daily_kind, a.arrived_at::text as arrived_at
      from students s
      left join daily_attendance a
        on a.student_id = s.id and a.school_id = s.school_id and a.day = current_date
      where s.class_id = ${row.id} and s.school_id = ${staff.school_id}
      order by s.name
    `;
	const notes = await sql<any>`
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
	const byStudent = /* @__PURE__ */ new Map();
	const hideOthers = cannotViewAll(staff, school);
	for (const n of notes) {
		if (hideOthers && n.teacher_id !== staff.user_id) continue;
		const list = byStudent.get(n.student_id) ?? [];
		list.push({
			id: n.id,
			type: n.type as NoteType,
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
		parentPhone: s.parent_phone,
		classId: row.id,
		healthNote: s.health_note ?? "",
		dailyKind: (s.daily_kind as "absence" | "late" | null) ?? null,
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
const noteTypeSchema = z.enum([
	"absence",
	"late",
	"homework",
	"behavior"
]);
export const createNote = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	studentId: z.number(),
	type: noteTypeSchema,
	details: z.string().max(500).optional(),
	behaviorTypeId: z.number().optional(),
	periodKey: z.string().max(40).optional(),
	occurredAt: z.string().max(40).optional(),
	referCounselor: z.boolean().optional(),
	suggestedAction: z.string().max(800).optional(),
	compensation: z.string().max(400).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	const student = (await sql<any>`
      select id, name, class_id from students
      where id = ${data.studentId} and school_id = ${staff.school_id}
    `)[0];
	if (!student) throw new Error("الطالب غير موجود");
	let behaviorTypeId = null;
	let behaviorName = null;
	if (data.type === "behavior") {
		if (!data.behaviorTypeId) throw new Error("اختر نوع المخالفة السلوكية");
		const types = await sql<any>`
        select id, name from behavior_types
        where id = ${data.behaviorTypeId} and school_id = ${staff.school_id} and active = true
      `;
		if (!types[0]) throw new Error("نوع المخالفة غير صالح");
		behaviorTypeId = types[0].id;
		behaviorName = types[0].name;
	}
	const periodKey = data.periodKey?.trim() ?? "";
	const occurredAt = data.occurredAt?.trim() ? new Date(data.occurredAt).toISOString() : new Date().toISOString();
	if (Number.isNaN(Date.parse(occurredAt))) throw new Error("وقت المخالفة غير صالح");
	const suggested = data.suggestedAction?.trim() ?? "";
	const compensation = data.compensation?.trim() ?? "";
	const canRefer = staff.role === "admin" || staff.role === "counselor" || mappedPerms(staff, school).takeActions;
	const refer = canRefer && Boolean(data.referCounselor);
	const noteId = (await sql<any>`
      insert into notes (school_id, student_id, teacher_id, type, details, behavior_type_id, period_key, occurred_at, refer_counselor, suggested_action, compensation)
      values (${staff.school_id}, ${student.id}, ${staff.user_id}, ${data.type}, ${data.details?.trim() ?? ""}, ${behaviorTypeId}, ${periodKey}, ${occurredAt}, ${refer}, ${suggested}, ${compensation})
      returning id
    `)[0]?.id ?? null;
	const meta = NOTE_META[data.type];
	const label = behaviorName ? `${meta.label} (${behaviorName})` : meta.label;
	let occurrence = 1;
	if (data.type === "behavior" && behaviorTypeId) occurrence = (await sql<any>`
        select count(*)::int as count from notes
        where school_id = ${staff.school_id}
          and student_id = ${student.id}
          and type = 'behavior'
          and behavior_type_id = ${behaviorTypeId}
      `)[0]?.count ?? 1;
	const title = occurrence > 1 ? `تكرار مخالفة — ${occurrenceLabel(occurrence)}` : `تم تسجيل ${meta.label}`;
	const actor = ROLE_LABEL[staff.role] || "الموظف";
	const body = occurrence > 1 ? `تكررت مخالفة (${behaviorName}) على الطالب ${student.name} ${occurrenceLabel(occurrence)}. سجّلها ${actor} ${staff.display_name}. يُرجى إشعار وكيل الشؤون الفنية${school.technical_vp_name ? ` (${school.technical_vp_name})` : ""} واتخاذ إجراء المرحلة المناسبة.` : `تم تسجيل ${label} للطالب ${student.name} بواسطة ${actor} ${staff.display_name}`;
	const tone = occurrence > 1 ? "danger" : meta.tone;
	const recipients = await sql<any>`
      select user_id, role, coalesce(permissions::text, '{}') as permissions from staff
      where school_id = ${staff.school_id}
        and user_id <> ${staff.user_id}
    `;
	for (const rec of recipients) {
		const perms = parsePermissions(rec.permissions, rec.role, mapSchool(school));
		const lead = rec.role === "admin" || rec.role === "counselor" || perms.takeActions;
		if (!lead) continue;
		await sql<any>`
        insert into notifications (school_id, user_id, note_id, kind, title, body, tone)
        values (${staff.school_id}, ${rec.user_id}, ${noteId}, ${occurrence > 1 ? "repeat" : "note"}, ${title}, ${body}, ${tone})
      `;
	}
	if (refer) {
		await notifyCounselingStaff(
			sql,
			school,
			staff,
			"إحالة إلى الإرشاد الطلابي",
			`أُحيل الطالب ${student.name} إلى الإرشاد الطلابي — ${label}.`,
			noteId,
		);
	}
	return {
		id: noteId,
		studentName: student.name,
		type: data.type,
		label,
		occurrence,
		referCounselor: refer
	};
});
export const getStudentNotes = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ studentId: z.number() })).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	const student = (await sql<any>`
      select s.id, s.name, s.parent_phone, s.class_id, c.name as class_name,
             st.short_name, st.name as stage_name,
             coalesce(s.health_note, '') as health_note
      from students s
      join classes c on c.id = s.class_id
      join stages st on st.id = c.stage_id
      where s.id = ${data.studentId} and s.school_id = ${staff.school_id}
    `)[0];
	if (!student) throw new Error("الطالب غير موجود");
	const notes = await sql<any>`
      select n.id, n.teacher_id, n.type, n.details, n.status, n.action_taken,
             n.created_at::text as created_at,
             coalesce(n.occurred_at, n.created_at)::text as occurred_at,
             coalesce(n.refer_counselor, false) as refer_counselor,
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
	const hideOthers = cannotViewAll(staff, school);
	const visible = hideOthers ? notes.filter((n) => n.teacher_id === staff.user_id) : notes;
	return {
		student: {
			id: student.id,
			name: student.name,
			parentPhone: student.parent_phone,
			classId: student.class_id,
			className: student.class_name,
			shortName: student.short_name,
			stageName: student.stage_name,
			classLabel: classLabel(student.short_name, student.class_name),
			healthNote: student.health_note ?? ""
		},
		notes: withOccurrence(visible.map((n) => ({
			id: n.id,
			type: n.type as NoteType,
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
	const counts = await sql<any>`
      select type, count(*)::int as count
      from notes
      where school_id = ${staff.school_id} and created_at >= current_date
      group by type
    `;
	const openRows = await sql<any>`
      select count(*)::int as count from notes
      where school_id = ${staff.school_id} and status = 'open'
    `;
	const studentRows = await sql<any>`
      select count(*)::int as count from students where school_id = ${staff.school_id}
    `;
	const improveRows = await sql<any>`
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
		feed: await fetchNotes(sql, staff.school_id, { limit: 60 }),
		improvements: await listImprovementRows(sql, staff.school_id, { openOnly: true })
	};
});
async function fetchNotes(sql: any, schoolId: any, opts: any) {
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
	return (await sql.query<any>(`select n.id, n.student_id, s.name as student_name, s.parent_phone,
            c.name as class_name, stg.name as stage_name, stg.short_name,
            n.teacher_id, coalesce(sf.display_name, 'معلم') as teacher_name,
            coalesce(sf.subject, '') as teacher_subject,
            n.type, n.details, n.status, n.action_taken,
            n.created_at::text as created_at, n.closed_at::text as closed_at,
            coalesce(n.occurred_at, n.created_at)::text as occurred_at,
            coalesce(n.refer_counselor, false) as refer_counselor,
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
		parentPhone: n.parent_phone,
		className: n.class_name,
		stageName: n.stage_name,
		shortName: n.short_name,
		teacherId: n.teacher_id,
		teacherName: n.teacher_name,
		teacherSubject: n.teacher_subject,
		type: n.type as NoteType,
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
		suggestedAction: n.suggested_action ?? "",
		compensation: n.compensation ?? ""
	}));
}
const reportSchema = z.object({
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
	const teacherOnly = cannotViewAll(staff, school);
	const notes = await fetchNotes(sql, staff.school_id, {
		...data,
		teacherId: teacherOnly ? staff.user_id : void 0
	});
	const stages = await listStageSummaries(sql, staff.school_id);
	const classes = await sql<any>`
      select c.id, c.stage_id, c.name, st.short_name
      from classes c
      join stages st on st.id = c.stage_id
      where c.school_id = ${staff.school_id}
      order by st.sort_order, c.sort_order
    `;
	const studentList = (await sql<any>`
      select s.id, s.name, s.class_id, c.stage_id
      from students s
      join classes c on c.id = s.class_id
      where s.school_id = ${staff.school_id}
      order by s.name
    `).map((s) => ({
		id: s.id,
		name: s.name,
		classId: s.class_id,
		stageId: s.stage_id
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
	const note = (await sql<any>`
      select n.id, n.teacher_id, n.type, s.name as student_name
      from notes n
      join students s on s.id = n.student_id
      where n.id = ${data.noteId} and n.school_id = ${staff.school_id}
    `)[0];
	if (!note) throw new Error("الملاحظة غير موجودة");
	const compensation = data.compensation?.trim() ?? "";
	await sql<any>`
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
	await sql<any>`
      insert into notifications (school_id, user_id, note_id, kind, title, body, tone)
      values (${staff.school_id}, ${note.teacher_id}, ${note.id}, ${"action"}, ${title}, ${body}, ${"ok"})
    `;
	return { ok: true };
});
export const getNotifications = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff } = await requireApproved(context.userId);
	const rows = await sql<any>`
      select ntf.id, ntf.note_id, ntf.kind, ntf.title, ntf.body, ntf.tone, ntf.read,
             ntf.created_at::text as created_at,
             notes.student_id as student_id,
             s.class_id as class_id
      from notifications ntf
      left join notes on notes.id = ntf.note_id
      left join students s on s.id = notes.student_id
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
	await sql<any>`
      update notifications
      set read = true
      where user_id = ${staff.user_id} and school_id = ${staff.school_id} and read = false
    `;
	return { ok: true };
});
function matchStage(raw: any, stages: any) {
	const folded = foldArabic(raw);
	if (!folded) return null;
	for (const s of stages) {
		if (foldArabic(s.name) === folded || foldArabic(s.shortName) === folded) return s;
		if (folded.includes(foldArabic(s.name)) || foldArabic(s.name).includes(folded)) return s;
		if (folded === String(s.sortOrder)) return s;
	}
	return null;
}
function matchClass(raw: any, classes: any, stageId: any) {
	const digits = raw.match(/\d+/);
	const wanted = digits ? digits[0] : foldArabic(raw);
	return classes.filter((c) => c.stageId === stageId).find((c) => c.name === wanted || foldArabic(c.name) === wanted) ?? null;
}
export const importStudents = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ rows: z.array(z.object({
	name: z.string(),
	parentPhone: z.string(),
	stageName: z.string(),
	className: z.string()
})).max(800) })).handler(async ({ context, data }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	const stageList = (await sql<any>`
      select id, name, short_name, sort_order from stages
      where school_id = ${staff.school_id}
    `).map((s) => ({
		id: s.id,
		name: s.name,
		shortName: s.short_name,
		sortOrder: s.sort_order
	}));
	const classList = (await sql<any>`
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
			const known = DEFAULT_STAGES.find((st) => foldArabic(st.name) === foldArabic(stageName) || foldArabic(st.shortName) === foldArabic(stageName));
			const shortName = known?.shortName ?? (stageName.length <= 8 ? stageName : stageName.slice(0, 8));
			const sortOrder = known?.sortOrder ?? stageList.length + 1;
			const created = (await sql<any>`
        insert into stages (school_id, name, short_name, sort_order)
        values (${staff.school_id}, ${known?.name ?? stageName}, ${shortName}, ${sortOrder})
        returning id, name, short_name, sort_order
      `)[0];
			stage = { id: created.id, name: created.name, shortName: created.short_name, sortOrder: created.sort_order };
			stageList.push(stage);
		}
		let cls = matchClass(row.className, classList, stage.id);
		if (!cls) {
			const rawClass = row.className.trim();
			if (!rawClass) {
				skipped += 1;
				continue;
			}
			const digits = rawClass.match(/\d+/);
			const className = digits ? digits[0] : rawClass;
			const sortOrder = Number(className) || classList.filter((c) => c.stageId === stage.id).length + 1;
			const created = (await sql<any>`
        insert into classes (school_id, stage_id, name, sort_order)
        values (${staff.school_id}, ${stage.id}, ${className}, ${sortOrder})
        returning id, stage_id, name
      `)[0];
			cls = { id: created.id, stageId: created.stage_id, name: created.name };
			classList.push(cls);
		}
		const existing = await sql<any>`
        select id from students
        where school_id = ${staff.school_id} and class_id = ${cls.id} and name = ${name}
        limit 1
      `;
		const phone = row.parentPhone.trim();
		if (existing[0]) {
			await sql<any>`
          update students set parent_phone = ${phone}
          where id = ${existing[0].id} and school_id = ${staff.school_id}
        `;
			updated += 1;
		} else {
			await sql<any>`
          insert into students (school_id, class_id, name, parent_phone)
          values (${staff.school_id}, ${cls.id}, ${name}, ${phone})
        `;
			inserted += 1;
		}
	}
	return {
		inserted,
		updated,
		skipped
	};
});
async function insertCredentialStaff(sql: any, opts: any) {
	if ((await sql<any>`
    select id from "user" where email = ${opts.email}
  `)[0]) throw new Error("هذا الحساب مسجّل مسبقاً");
	const id = randomBytes(16).toString("hex");
	const hashed = await hashPassword(opts.password);
	await sql<any>`
    insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
    values (${id}, ${opts.name}, ${opts.email}, true, now(), now())
  `;
	await sql<any>`
    insert into "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
    values (${id}, ${id}, ${"credential"}, ${id}, ${hashed}, now(), now())
  `;
	await sql<any>`
    insert into staff (user_id, school_id, display_name, role, subject, phone)
    values (${id}, ${opts.schoolId}, ${opts.name}, ${opts.role}, ${opts.subject}, ${opts.phone})
  `;
	return id;
}
export const listStaff = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const { sql, staff, school } = await requirePerm(context.userId, "editStaff");
	const mapped = mapSchool(school);
	let rows: any[] = [];
	try {
		rows = await sql<any>`
      select st.user_id, st.display_name, st.role, st.created_at::text as created_at,
             u.email as email,
             coalesce(st.subject, '') as subject,
             coalesce(st.phone, '') as phone,
             coalesce(st.permissions::text, '{}') as permissions,
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
          when 'activity_leader' then 8 else 9
        end,
        st.created_at
    `;
	} catch {
		rows = await sql<any>`
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
		rows = rows.map((r) => ({ ...r, active: true }));
	}
	return rows.map((r) => ({
		userId: r.user_id,
		displayName: r.display_name,
		role: r.role as StaffRole,
		createdAt: r.created_at,
		email: r.email ?? "",
		subject: r.subject,
		phone: r.phone,
		permissions: parsePermissions(r.permissions, r.role, mapped),
		active: r.active !== false
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
		"pending"
	])
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editStaff");
	if (data.userId === staff.user_id && data.role !== "admin") throw new Error("لا يمكنك إزالة صلاحية المدير عن حسابك");
	await assertNotLastAdmin(sql, staff.school_id, data.userId, data.role, true);
	const current = (await sql<any>`
      select role from staff where user_id = ${data.userId} and school_id = ${staff.school_id}
    `)[0];
	await sql<any>`
      update staff set role = ${data.role}
      where user_id = ${data.userId} and school_id = ${staff.school_id}
    `;
	if (current && current.role !== data.role) {
		const school = await loadSchool(sql, staff.school_id);
		const nextPerms = defaultPermissions(data.role, school ? mapSchool(school) : undefined);
		await sql.query(`update staff set permissions = $1::jsonb where user_id = $2 and school_id = $3`, [
			JSON.stringify(nextPerms),
			data.userId,
			staff.school_id,
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
		"pending"
	]),
	subject: z.string().max(80).optional(),
	phone: z.string().max(20).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requirePerm(context.userId, "editStaff");
	if (data.userId === staff.user_id && data.role !== "admin") throw new Error("لا يمكنك إزالة صلاحية المدير عن حسابك");
	await assertNotLastAdmin(sql, staff.school_id, data.userId, data.role, true);
	const name = data.displayName.trim();
	const subject = data.subject?.trim() ?? "";
	const phone = data.phone ? normalizeSaudiPhone(data.phone) : "";
	const current = (await sql<any>`
      select role from staff where user_id = ${data.userId} and school_id = ${staff.school_id}
    `)[0];
	if (current && current.role !== data.role) {
		const nextPerms = defaultPermissions(data.role, mapSchool(school));
		await sql.query(
			`update staff
         set display_name = $1, role = $2, subject = $3, phone = $4, permissions = $5::jsonb
       where user_id = $6 and school_id = $7`,
			[name, data.role, subject, phone, JSON.stringify(nextPerms), data.userId, staff.school_id],
		);
	} else {
		await sql<any>`
      update staff
      set display_name = ${name}, role = ${data.role}, subject = ${subject}, phone = ${phone}
      where user_id = ${data.userId} and school_id = ${staff.school_id}
    `;
	}
	await sql<any>`
      update "user" set name = ${name}, "updatedAt" = now()
      where id = ${data.userId}
    `;
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
		"teacher"
	]),
	subject: z.string().max(80).optional()
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
		phone
	}) };
});
async function assertNotLastAdmin(sql: any, schoolId: any, userId: any, nextRole: any, nextActive: any) {
	const target = (await sql<any>`
      select role, coalesce(active, true) as active from staff
      where user_id = ${userId} and school_id = ${schoolId}
    `)[0];
	if (!target || target.role !== "admin") return;
	const stillAdmin = nextRole === "admin" && nextActive !== false;
	if (stillAdmin) return;
	const others = (await sql<any>`
      select count(*)::int as count from staff
      where school_id = ${schoolId} and role = 'admin' and coalesce(active, true) = true and user_id <> ${userId}
    `)[0]?.count ?? 0;
	if (others < 1) throw new Error("لا يمكن إلغاء آخر مدير تطبيق");
}
export const setStaffActive = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	userId: z.string(),
	active: z.boolean()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editStaff");
	if (data.userId === staff.user_id) throw new Error("لا يمكنك إلغاء حسابك");
	await assertNotLastAdmin(sql, staff.school_id, data.userId, "admin", data.active);
	const updated = await sql<any>`
      update staff set active = ${data.active}
      where user_id = ${data.userId} and school_id = ${staff.school_id}
      returning display_name, active
    `;
	if (!updated[0]) throw new Error("الموظف غير موجود");
	return { ok: true, displayName: updated[0].display_name, active: updated[0].active };
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
		const existingUser = await sql<any>`
        select id from "user" where email = ${email}
      `;
		if (existingUser[0]) {
			await sql<any>`
          update staff
          set display_name = ${name}, subject = ${subject}, phone = ${phone}
          where user_id = ${existingUser[0].id} and school_id = ${staff.school_id}
        `;
			await sql<any>`
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
	name: z.string().min(3).max(80),
	principalName: z.string().max(80).optional(),
	season: z.enum(["winter", "summer"]).optional(),
	region: z.string().max(80).optional(),
	governorate: z.string().max(80).optional(),
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
	}).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	const current = await loadSchool(sql, staff.school_id);
	if (!current) throw new Error("المدرسة غير موجودة");
	const name = data.name.trim();
	const principalName = data.principalName !== undefined ? data.principalName.trim() : (current.principal_name ?? "");
	const season = data.season ?? current.season ?? "winter";
	const region = data.region !== undefined ? data.region.trim() : (current.region ?? "");
	const governorate = data.governorate !== undefined ? data.governorate.trim() : (current.governorate ?? "");
	const leadershipGender = data.leadershipGender ?? current.leadership_gender ?? "male";
	const studentGender = data.studentGender ?? current.student_gender ?? "male";
	const counselorName = data.counselorName !== undefined ? data.counselorName.trim() : (current.counselor_name ?? "");
	const technicalVpName = data.technicalVpName !== undefined ? data.technicalVpName.trim() : (current.technical_vp_name ?? "");
	const logoUrl = data.logoUrl !== undefined ? data.logoUrl : (current.logo_url ?? "");
	const extraLogoUrl = data.extraLogoUrl !== undefined ? data.extraLogoUrl : (current.extra_logo_url ?? "");
	const tagline = data.tagline !== undefined ? data.tagline.trim() : (current.tagline ?? "");
	const printMargins = data.printMargins ? parsePrintMargins(data.printMargins) : parsePrintMargins(current.print_margins);
	await sql<any>`
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
	} catch {
		/* column applies after restart */
	}
	try {
		await sql`update schools set extra_logo_url = ${extraLogoUrl} where id = ${staff.school_id}`;
	} catch {
		/* column applies after restart */
	}
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
		printMargins
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
	await sql.query<any>(`update schools set message_templates = $1::jsonb where id = $2`, [JSON.stringify(data.templates), staff.school_id]);
	if (data.customMessages) {
		try {
			await sql.query<any>(`update schools set custom_messages = $1::jsonb where id = $2`, [JSON.stringify(data.customMessages), staff.school_id]);
		} catch {
			throw new Error("تعذر حفظ الرسائل المخصصة — أعد تشغيل التطبيق بعد التحديث");
		}
	}
	return { ok: true };
});
export const updateSchoolName = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ name: z.string().min(3).max(80) })).handler(async ({ context, data }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	await sql<any>`
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
	await sql<any>`
      update staff set display_name = ${name}, subject = ${subject}, phone = ${phone}
      where user_id = ${staff.user_id}
    `;
	if (phone && phone !== staff.phone) {
		const email = phoneToLoginEmail(phone);
		if ((await sql<any>`
        select id from "user" where email = ${email} and id <> ${staff.user_id}
      `)[0]) throw new Error("اسم المستخدم (رقم الجوال) مستخدم مسبقاً");
		await sql<any>`
        update "user" set name = ${name}, email = ${email}, "updatedAt" = now()
        where id = ${staff.user_id}
      `;
	} else await sql<any>`
        update "user" set name = ${name}, "updatedAt" = now()
        where id = ${staff.user_id}
      `;
	if (data.password && data.password.trim().length >= 4) {
		const hashed = await hashPassword(data.password.trim());
		const account = await sql<any>`
        select id from "account"
        where "userId" = ${staff.user_id} and "providerId" = 'credential'
      `;
		if (account[0]) await sql<any>`
          update "account" set password = ${hashed}, "updatedAt" = now()
          where id = ${account[0].id}
        `;
		else await sql<any>`
          insert into "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
          values (${staff.user_id}, ${staff.user_id}, ${"credential"}, ${staff.user_id}, ${hashed}, now(), now())
        `;
	}
	return {
		name,
		subject,
		phone
	};
});
async function createCatalogItem(sql: any, schoolId: any, table: any, name: any) {
	if ((await sql.query<any>(`select id from ${table} where school_id = $1 and name = $2 limit 1`, [schoolId, name]))[0]) throw new Error("هذا الخيار موجود مسبقاً");
	const max = await sql.query<any>(`select max(sort_order) as max from ${table} where school_id = $1`, [schoolId]);
	return { id: (await sql.query<any>(`insert into ${table} (school_id, name, sort_order, active)
     values ($1, $2, $3, true) returning id`, [
		schoolId,
		name,
		(max[0]?.max ?? 0) + 1
	]))[0].id };
}
async function patchCatalogItem(sql: any, schoolId: any, table: any, data: any) {
	const existing = await sql.query<any>(`select id, name, active from ${table} where id = $1 and school_id = $2`, [data.id, schoolId]);
	if (!existing[0]) throw new Error("الخيار غير موجود");
	const name = data.name?.trim() ?? existing[0].name;
	const active = data.active ?? existing[0].active;
	if (name !== existing[0].name) {
		if ((await sql.query<any>(`select id from ${table} where school_id = $1 and name = $2 and id <> $3 limit 1`, [
			schoolId,
			name,
			data.id
		]))[0]) throw new Error("هذا الخيار موجود مسبقاً");
	}
	if (table === "behavior_types" && data.degree !== void 0) await sql.query<any>(`update behavior_types set name = $1, active = $2, degree = $3 where id = $4 and school_id = $5`, [
		name,
		active,
		data.degree,
		data.id,
		schoolId
	]);
	else await sql.query<any>(`update ${table} set name = $1, active = $2 where id = $3 and school_id = $4`, [
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
	name: z.string().min(2).max(80),
	degree: z.number().int().min(1).max(5).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	const name = data.name.trim();
	if ((await sql.query<any>(`select id from behavior_types where school_id = $1 and name = $2 limit 1`, [staff.school_id, name]))[0]) throw new Error("هذا الخيار موجود مسبقاً");
	const max = await sql.query<any>(`select max(sort_order) as max from behavior_types where school_id = $1`, [staff.school_id]);
	return { id: (await sql.query<any>(`insert into behavior_types (school_id, name, sort_order, active, degree, procedures)
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
	name: z.string().min(2).max(80).optional(),
	active: z.boolean().optional(),
	degree: z.number().int().min(1).max(5).optional(),
	procedures: z.array(z.array(z.string().max(220)).max(10)).max(8).optional()
}).refine((d) => d.name !== void 0 || d.active !== void 0 || d.degree !== void 0 || d.procedures !== void 0, { message: "لا يوجد تعديل" })).handler(async ({ context, data }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	if (data.procedures) {
		const cleaned = data.procedures.map((stage) => stage.map((item) => item.trim()).filter(Boolean)).filter((stage) => stage.length);
		if (cleaned.length) await sql.query<any>(`update behavior_types set procedures = $1::jsonb where id = $2 and school_id = $3`, [
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
	parentPhone: z.string().max(20).optional()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editStudents");
	if (!(await sql<any>`
      select id from classes where id = ${data.classId} and school_id = ${staff.school_id}
    `)[0]) throw new Error("الفصل غير موجود");
	const name = data.name.trim();
	const phone = data.parentPhone ? normalizeSaudiPhone(data.parentPhone) : "";
	return { id: (await sql<any>`
      insert into students (school_id, class_id, name, parent_phone)
      values (${staff.school_id}, ${data.classId}, ${name}, ${phone})
      returning id
    `)[0].id };
});
export const updateStudent = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	studentId: z.number(),
	name: z.string().min(2).max(80),
	parentPhone: z.string().max(20).optional(),
	classId: z.number()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editStudents");
	if (!(await sql<any>`
      select id, class_id from students
      where id = ${data.studentId} and school_id = ${staff.school_id}
    `)[0]) throw new Error("الطالب غير موجود");
	if (!(await sql<any>`
      select id from classes where id = ${data.classId} and school_id = ${staff.school_id}
    `)[0]) throw new Error("الفصل غير موجود");
	await sql<any>`
      update students
      set name = ${data.name.trim()}, parent_phone = ${data.parentPhone ? normalizeSaudiPhone(data.parentPhone) : ""}, class_id = ${data.classId}
      where id = ${data.studentId} and school_id = ${staff.school_id}
    `;
	return {
		ok: true,
		classId: data.classId
	};
});
export const deleteStudent = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ studentId: z.number() })).handler(async ({ context, data }) => {
	const { sql, staff } = await requirePerm(context.userId, "editStudents");
	if (!(await sql<any>`
      select id from students
      where id = ${data.studentId} and school_id = ${staff.school_id}
    `)[0]) throw new Error("الطالب غير موجود");
	await sql<any>`
      delete from students
      where id = ${data.studentId} and school_id = ${staff.school_id}
    `;
	return { ok: true };
});
export const updateSchoolPermissions = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	teachersCanMessage: z.boolean(),
	teachersCanViewAll: z.boolean()
})).handler(async ({ context, data }) => {
	const { sql, staff } = await requireAdmin(context.userId);
	await sql<any>`
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
	const student = await sql<any>`
      select id, parent_phone from students
      where id = ${data.studentId} and school_id = ${staff.school_id}
    `;
	if (!student[0]) throw new Error("الطالب غير موجود");
	const phone = data.parentPhone || student[0].parent_phone;
	return { id: (await sql<any>`
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
	const { sql, staff } = await requireApproved(context.userId);
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
	if (staff.role === "teacher") {
		params.push(staff.user_id);
		where += ` and m.staff_id = $${params.length}`;
	}
	return { messages: (await sql.query<any>(`select m.id, m.student_id, s.name as student_name, c.name as class_name,
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
		parentPhone: r.parent_phone,
		createdAt: r.created_at
	})) };
});
async function listImprovementRows(sql: any, schoolId: any, opts: any) {
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
	return (await sql.query<any>(`select i.id, i.student_id, s.name as student_name, c.name as class_name, stg.short_name,
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
		status: r.status as ImprovementStatus,
		createdAt: r.created_at,
		updatedAt: r.updated_at
	}));
}
export const listImprovements = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	studentId: z.number().optional(),
	openOnly: z.boolean().optional()
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requireApproved(context.userId);
	const hideOthers = cannotViewAll(staff, school);
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
	const student = await sql<any>`
      select id, name from students
      where id = ${data.studentId} and school_id = ${staff.school_id}
    `;
	if (!student[0]) throw new Error("الطالب غير موجود");
	let noteId = null;
	if (data.noteId) noteId = (await sql<any>`
        select id from notes
        where id = ${data.noteId} and student_id = ${student[0].id} and school_id = ${staff.school_id}
      `)[0]?.id ?? null;
	const inserted = await sql<any>`
      insert into behavior_improvements
        (school_id, student_id, teacher_id, note_id, plan)
      values (${staff.school_id}, ${student[0].id}, ${staff.user_id}, ${noteId}, ${data.plan.trim()})
      returning id
    `;
	const title = "خطة تحسين سلوك";
	const body = `قدّم ${staff.display_name} خطة لتحسين سلوك الطالب ${student[0].name}.`;
	const schoolRow = await loadSchool(sql, staff.school_id);
	const recipients = await sql<any>`
      select user_id, role, coalesce(permissions::text, '{}') as permissions from staff
      where school_id = ${staff.school_id}
        and user_id <> ${staff.user_id}
    `;
	for (const rec of recipients) {
		if (!parsePermissions(rec.permissions, rec.role, schoolRow ? mapSchool(schoolRow) : void 0).acceptImprovements) continue;
		await sql<any>`
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
	const row = (await sql<any>`
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
	if (teacherFollowup !== void 0) await sql<any>`
        update behavior_improvements
        set teacher_followup = ${teacherFollowup}, updated_at = now()
        where id = ${row.id}
      `;
	if (counselorNote !== void 0) await sql<any>`
        update behavior_improvements
        set counselor_note = ${counselorNote}, updated_at = now()
        where id = ${row.id}
      `;
	if (status) {
		if (status === "closed") await sql<any>`
          update behavior_improvements
          set status = ${status}, closed_at = now(), closed_by = ${staff.user_id}, updated_at = now()
          where id = ${row.id}
        `;
		else await sql<any>`
          update behavior_improvements
          set status = ${status}, updated_at = now()
          where id = ${row.id}
        `;
		if (row.teacher_id !== staff.user_id) {
			const title = status === "closed" ? "أُغلقت خطة التحسين" : "متابعة خطة التحسين";
			const body = status === "closed" ? `أغلق المرشد خطة تحسين سلوك الطالب ${row.student_name}.` : `تابع المرشد خطة تحسين سلوك الطالب ${row.student_name}.`;
			await sql<any>`
          insert into notifications (school_id, user_id, note_id, kind, title, body, tone)
          values (${staff.school_id}, ${row.teacher_id}, ${null}, ${"improve"}, ${title}, ${body}, ${"ok"})
        `;
		}
	}
	return { ok: true };
});
const permissionShape = z.object({
	editStudents: z.boolean(),
	sendMessages: z.boolean(),
	viewAllViolations: z.boolean(),
	editStaff: z.boolean(),
	takeActions: z.boolean(),
	acceptImprovements: z.boolean(),
	dailyAttendance: z.boolean(),
	counseling: z.boolean()
});
export const updateStaffPermissions = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({
	userId: z.string(),
	permissions: permissionShape
})).handler(async ({ context, data }) => {
	const { sql, staff, school } = await requirePerm(context.userId, "editStaff");
	const target = await sql<any>`
      select user_id, role from staff
      where user_id = ${data.userId} and school_id = ${staff.school_id}
    `;
	if (!target[0]) throw new Error("الموظف غير موجود");
	if (target[0].role === "admin") throw new Error("مدير التطبيق يملك كل الصلاحيات ولا تُقيَّد");
	await sql.query<any>(`update staff set permissions = $1::jsonb where user_id = $2 and school_id = $3`, [
		JSON.stringify(data.permissions),
		data.userId,
		staff.school_id
	]);
	return {
		userId: data.userId,
		permissions: parsePermissions(data.permissions, target[0].role, mapSchool(school))
	};
});
const appearanceShape = z.object({
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
	fontScale: z.number().min(0.8).max(1.5).optional(),
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
		await sql.query<any>(`update staff set appearance = $1::jsonb where user_id = $2`, ["{}", staff.user_id]);
		return {
			scope: "personal",
			appearance: parseAppearance(school.appearance)
		};
	}
	const appearance = parseAppearance(data.appearance);
	if (data.scope === "school") {
		if (staff.role !== "admin") throw new Error("تعميم المظهر على المدرسة للمدير فقط");
		await sql.query<any>(`update schools set appearance = $1::jsonb where id = $2`, [JSON.stringify(appearance), staff.school_id]);
	} else await sql.query<any>(`update staff set appearance = $1::jsonb where user_id = $2`, [JSON.stringify(appearance), staff.user_id]);
	return {
		scope: data.scope,
		appearance
	};
});

function todayISODate() {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const getDailyAttendance = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(
		z.object({
			day: z.string().max(12).optional(),
			classId: z.number().optional(),
			stageId: z.number().optional(),
			classIds: z.array(z.number()).max(80).optional(),
		}),
	)
	.handler(async ({ context, data }) => {
		const { sql, staff } = await requirePerm(context.userId, "dailyAttendance");
		const day = data.day?.trim() || todayISODate();
		const params: unknown[] = [staff.school_id];
		let where = `s.school_id = $1`;
		if (data.classIds && data.classIds.length === 0) {
			return { day, students: [] };
		}
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
		const rows = await sql.query<any>(
			`select s.id, s.name, s.class_id, c.name as class_name, st.short_name, st.name as stage_name,
              a.kind, coalesce(a.excused, false) as excused, coalesce(a.details, '') as details,
              a.arrived_at::text as arrived_at
       from students s
       join classes c on c.id = s.class_id
       join stages st on st.id = c.stage_id
       left join daily_attendance a
         on a.student_id = s.id and a.school_id = s.school_id and a.day = $${dayIdx}::date
       where ${where}
       order by st.sort_order, c.sort_order, s.name`,
			params,
		);
		return {
			day,
			students: rows.map((r: any) => ({
				studentId: r.id,
				studentName: r.name,
				classId: r.class_id,
				classLabel: classLabel(r.short_name, r.class_name),
				kind: (r.kind as "absence" | "late" | null) ?? null,
				excused: Boolean(r.excused),
				details: r.details ?? "",
				arrivedAt: r.arrived_at || null,
			})),
		};
	});

export const saveDailyAttendance = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(
		z.object({
			day: z.string().min(8).max(12),
			entries: z.array(
				z.object({
					studentId: z.number(),
					kind: z.enum(["present", "absence", "late"]),
					excused: z.boolean().optional(),
					details: z.string().max(200).optional(),
					arrivedAt: z.string().max(40).optional(),
				}),
			),
		}),
	)
	.handler(async ({ context, data }) => {
		const { sql, staff } = await requirePerm(context.userId, "dailyAttendance");
		const day = data.day.trim();
		for (const entry of data.entries) {
			const student = (
				await sql<any>`
          select id from students where id = ${entry.studentId} and school_id = ${staff.school_id}
        `
			)[0];
			if (!student) continue;
			if (entry.kind === "present") {
				await sql<any>`
          delete from daily_attendance
          where school_id = ${staff.school_id} and student_id = ${entry.studentId} and day = ${day}::date
        `;
				continue;
			}
			const arrived = entry.kind === "late"
				? (entry.arrivedAt?.trim() ? new Date(entry.arrivedAt).toISOString() : new Date().toISOString())
				: null;
			await sql.query<any>(
				`insert into daily_attendance (school_id, student_id, day, kind, excused, details, recorded_by, arrived_at)
         values ($1, $2, $3::date, $4, $5, $6, $7, $8)
         on conflict (school_id, student_id, day)
         do update set kind = excluded.kind, excused = excluded.excused, details = excluded.details, recorded_by = excluded.recorded_by, arrived_at = excluded.arrived_at`,
				[
					staff.school_id,
					entry.studentId,
					day,
					entry.kind,
					Boolean(entry.excused),
					entry.details?.trim() ?? "",
					staff.user_id,
					arrived,
				],
			);
		}
		return { ok: true, day };
	});

export const getCounselingDesk = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const { sql, staff } = await requirePerm(context.userId, "counseling");
		const referrals = await sql<any>`
      select n.id, n.student_id, s.name as student_name, c.name as class_name, st.short_name,
             n.type, n.details, n.status, n.action_taken,
             n.created_at::text as created_at,
             coalesce(n.occurred_at, n.created_at)::text as occurred_at,
             coalesce(n.suggested_action, '') as suggested_action,
             coalesce(n.compensation, '') as compensation,
             bt.name as behavior_type_name, bt.degree as behavior_degree,
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
		const health = await sql<any>`
      select s.id, s.name, coalesce(s.health_note, '') as health_note,
             c.name as class_name, st.short_name, s.class_id
      from students s
      join classes c on c.id = s.class_id
      join stages st on st.id = c.stage_id
      where s.school_id = ${staff.school_id} and coalesce(s.health_note, '') <> ''
      order by s.name
    `;
		const roster = await sql<any>`
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
			cases = await sql<any>`
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
			referrals: referrals.map((n: any) => ({
				id: n.id,
				studentId: n.student_id,
				studentName: n.student_name,
				classLabel: classLabel(n.short_name, n.class_name),
				type: n.type as NoteType,
				details: n.details,
				status: n.status,
				actionTaken: n.action_taken,
				createdAt: n.created_at,
				occurredAt: n.occurred_at,
				suggestedAction: n.suggested_action,
				compensation: n.compensation,
				behaviorTypeName: n.behavior_type_name,
				behaviorDegree: n.behavior_degree,
				teacherName: n.teacher_name,
				teacherSubject: n.teacher_subject,
				periodKey: n.period_key,
			})),
			health: health.map((s: any) => ({
				id: s.id,
				name: s.name,
				healthNote: s.health_note,
				classLabel: classLabel(s.short_name, s.class_name),
				classId: s.class_id,
			})),
			roster: roster.map((s: any) => ({
				id: s.id,
				name: s.name,
				healthNote: s.health_note,
				classLabel: classLabel(s.short_name, s.class_name),
				classId: s.class_id,
			})),
			cases: cases.map((c: any) => ({
				id: c.id,
				studentId: c.student_id,
				studentName: c.student_name,
				classLabel: classLabel(c.short_name, c.class_name),
				authorName: c.author_name,
				kind: c.kind,
				body: c.body,
				createdAt: c.created_at,
			})),
		};
	});

export const updateHealthNote = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(
		z.object({
			studentId: z.number(),
			healthNote: z.string().max(240),
		}),
	)
	.handler(async ({ context, data }) => {
		const { sql, staff } = await requirePerm(context.userId, "counseling");
		const student = (
			await sql<any>`
        select id, name from students where id = ${data.studentId} and school_id = ${staff.school_id}
      `
		)[0];
		if (!student) throw new Error("الطالب غير موجود");
		await sql<any>`
      update students set health_note = ${data.healthNote.trim()}
      where id = ${data.studentId} and school_id = ${staff.school_id}
    `;
		return { ok: true, studentName: student.name, healthNote: data.healthNote.trim() };
	});


async function notifyCounselingStaff(sql: any, school: any, staff: any, title: any, body: any, noteId: any, tone = "warn") {
	const recipients = await sql<any>`
    select user_id, role, coalesce(permissions::text, '{}') as permissions from staff
    where school_id = ${staff.school_id} and user_id <> ${staff.user_id}
  `;
	const mapped = mapSchool(school);
	for (const rec of recipients) {
		const perms = parsePermissions(rec.permissions, rec.role, mapped);
		if (rec.role !== "admin" && !perms.counseling) continue;
		await sql<any>`
      insert into notifications (school_id, user_id, note_id, kind, title, body, tone)
      values (${staff.school_id}, ${rec.user_id}, ${noteId}, ${"referral"}, ${title}, ${body}, ${tone})
    `;
	}
}

export const referToCounselor = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ noteId: z.number() }))
	.handler(async ({ context, data }) => {
		const { sql, staff, school } = await requirePerm(context.userId, "takeActions");
		const note = (
			await sql<any>`
        select n.id, n.refer_counselor, s.name as student_name, n.type
        from notes n
        join students s on s.id = n.student_id
        where n.id = ${data.noteId} and n.school_id = ${staff.school_id}
      `
		)[0];
		if (!note) throw new Error("الملاحظة غير موجودة");
		await sql<any>`
      update notes set refer_counselor = true where id = ${note.id} and school_id = ${staff.school_id}
    `;
		await notifyCounselingStaff(
			sql,
			school,
			staff,
			"إحالة إلى الإرشاد الطلابي",
			`أحال وكيل شؤون الطلاب ${staff.display_name} الطالب ${note.student_name} إلى الإرشاد الطلابي.`,
			note.id,
		);
		return { ok: true, studentName: note.student_name };
	});

export const listAllHealthConditions = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const { sql, staff } = await requireAdmin(context.userId);
		await ensureHealthConditions(sql, staff.school_id);
		return listCatalogRows(sql, staff.school_id, "health_conditions", false);
	});

export const createHealthCondition = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ name: z.string().min(2).max(80) }))
	.handler(async ({ context, data }) => {
		const { sql, staff } = await requireApproved(context.userId);
		const school = await loadSchool(sql, staff.school_id);
		const perms = mappedPerms(staff, school);
		if (staff.role !== "admin" && !perms.counseling) throw new Error("ليست لديك هذه الصلاحية");
		const name = data.name.trim();
		const existing = (
			await sql.query<any>(`select id, name from health_conditions where school_id = $1 and name = $2 limit 1`, [
				staff.school_id,
				name,
			])
		)[0];
		if (existing) return { id: existing.id, name: existing.name, existed: true };
		return { ...(await createCatalogItem(sql, staff.school_id, "health_conditions", name)), existed: false };
	});

export const updateHealthCondition = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(
		z
			.object({
				id: z.number(),
				name: z.string().min(2).max(80).optional(),
				active: z.boolean().optional(),
			})
			.refine((d) => d.name !== void 0 || d.active !== void 0, { message: "لا يوجد تعديل" }),
	)
	.handler(async ({ context, data }) => {
		const { sql, staff } = await requireAdmin(context.userId);
		return patchCatalogItem(sql, staff.school_id, "health_conditions", data);
	});

export const sendCounselingCase = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(
		z.object({
			studentId: z.number(),
			kind: z.enum(["health", "psych", "learning"]),
			body: z.string().min(2).max(800),
		}),
	)
	.handler(async ({ context, data }) => {
		const { sql, staff, school } = await requireApproved(context.userId);
		const student = (
			await sql<any>`
        select s.id, s.name
        from students s
        where s.id = ${data.studentId} and s.school_id = ${staff.school_id}
      `
		)[0];
		if (!student) throw new Error("الطالب غير موجود");
		const row = (
			await sql<any>`
        insert into counseling_cases (school_id, student_id, author_id, kind, body)
        values (${staff.school_id}, ${student.id}, ${staff.user_id}, ${data.kind}, ${data.body.trim()})
        returning id
      `
		)[0];
		const kindLabel = data.kind === "health" ? "حالة صحية" : data.kind === "psych" ? "حالة نفسية" : "صعوبات تعلم";
		await notifyCounselingStaff(
			sql,
			school,
			staff,
			`مراسلة للمرشد — ${kindLabel}`,
			`راسل ${staff.display_name} المرشد بخصوص الطالب ${student.name} (${kindLabel}).`,
			null,
		);
		return { id: row?.id, studentName: student.name, kind: data.kind };
	});

export const listAllCompensationOptions = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const { sql, staff } = await requireAdmin(context.userId);
		await ensureCompensations(sql, staff.school_id);
		return listCatalogRows(sql, staff.school_id, "compensation_options", false);
	});

export const createCompensationOption = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ name: z.string().min(2).max(80) }))
	.handler(async ({ context, data }) => {
		const { sql, staff } = await requireApproved(context.userId);
		const school = await loadSchool(sql, staff.school_id);
		const perms = mappedPerms(staff, school);
		if (staff.role !== "admin" && !perms.counseling && !perms.takeActions) throw new Error("ليست لديك هذه الصلاحية");
		const name = data.name.trim();
		if (name === "أخرى") throw new Error("أخرى خيار ثابت — اكتب الفرصة نفسها");
		const existing = (
			await sql.query<any>(`select id, name from compensation_options where school_id = $1 and name = $2 limit 1`, [
				staff.school_id,
				name,
			])
		)[0];
		if (existing) return { id: existing.id, name: existing.name, existed: true };
		return { ...(await createCatalogItem(sql, staff.school_id, "compensation_options", name)), existed: false };
	});

export const updateCompensationOption = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(
		z
			.object({
				id: z.number(),
				name: z.string().min(2).max(80).optional(),
				active: z.boolean().optional(),
			})
			.refine((d) => d.name !== void 0 || d.active !== void 0, { message: "لا يوجد تعديل" }),
	)
	.handler(async ({ context, data }) => {
		const { sql, staff } = await requireAdmin(context.userId);
		return patchCatalogItem(sql, staff.school_id, "compensation_options", data);
	});

export const setNoteCompensation = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ noteId: z.number(), compensation: z.string().max(400) }))
	.handler(async ({ context, data }) => {
		const { sql, staff, school } = await requireApproved(context.userId);
		const perms = mappedPerms(staff, school);
		if (staff.role !== "admin" && !perms.counseling && !perms.takeActions) throw new Error("ليست لديك هذه الصلاحية");
		const note = (
			await sql<any>`
        select n.id from notes n
        where n.id = ${data.noteId} and n.school_id = ${staff.school_id}
      `
		)[0];
		if (!note) throw new Error("الملاحظة غير موجودة");
		await sql<any>`
      update notes set compensation = ${data.compensation.trim()}
      where id = ${note.id} and school_id = ${staff.school_id}
    `;
		return { ok: true };
	});

export const listAllImprovementOptions = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const { sql, staff, school } = await requireApproved(context.userId);
		if (!canManageImproveCatalog(staff, school)) throw new Error("ليست لديك هذه الصلاحية");
		await ensureImproveOptions(sql, staff.school_id);
		return listCatalogRows(sql, staff.school_id, "improvement_options", false);
	});

export const createImprovementOption = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ name: z.string().min(2).max(80) }))
	.handler(async ({ context, data }) => {
		const { sql, staff, school } = await requireApproved(context.userId);
		if (!canManageImproveCatalog(staff, school)) throw new Error("ليست لديك هذه الصلاحية");
		const name = data.name.trim();
		if (name === "أخرى") throw new Error("أخرى خيار ثابت — اكتب السلوك نفسه");
		await ensureImproveOptions(sql, staff.school_id);
		const existing = (
			await sql.query<any>(`select id, name from improvement_options where school_id = $1 and name = $2 limit 1`, [
				staff.school_id,
				name,
			])
		)[0];
		if (existing) return { id: existing.id, name: existing.name, existed: true };
		return { ...(await createCatalogItem(sql, staff.school_id, "improvement_options", name)), existed: false };
	});

export const updateImprovementOption = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(
		z
			.object({
				id: z.number(),
				name: z.string().min(2).max(80).optional(),
				active: z.boolean().optional(),
			})
			.refine((d) => d.name !== void 0 || d.active !== void 0, { message: "لا يوجد تعديل" }),
	)
	.handler(async ({ context, data }) => {
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
				stageName: r.stage_name,
				stageSort: r.stage_sort,
				classSort: r.class_sort,
				students: []
			};
			byClass.set(r.class_id, cls);
		}
		if (r.student_id) {
			cls.students.push({
				id: r.student_id,
				name: r.student_name,
				parentPhone: r.parent_phone,
				classId: r.class_id
			});
		}
	}
	const classes = [...byClass.values()];
	const stages = [];
	const stageMap = new Map();
	for (const cls of classes) {
		let stage = stageMap.get(cls.stageName);
		if (!stage) {
			stage = { name: cls.stageName, sort: cls.stageSort, classes: [] };
			stageMap.set(cls.stageName, stage);
			stages.push(stage);
		}
		stage.classes.push({
			id: cls.id,
			name: cls.name,
			label: cls.label,
			stageName: cls.stageName,
			students: cls.students
		});
	}
	return {
		stages: stages.map((st) => ({ name: st.name, classes: st.classes })),
		studentCount: classes.reduce((n, c) => n + c.students.length, 0),
		classCount: classes.length
	};
});
