import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withDbTransaction, type Sql } from "@/lib/db";

const SKIP = new Set(["_migrations", "session", "verification"]);

type Col = { name: string; type: string };
type Fk = { child: string; parent: string };

function quote(name: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("اسم جدول غير مسموح");
  return `"${name}"`;
}

function bind(value: unknown, type: string) {
  if (value == null) return null;
  if (type === "jsonb" || type === "json") return typeof value === "string" ? value : JSON.stringify(value);
  return value;
}

async function requireAdmin(userId: string) {
  const sql = await getSql();
  const staff = (await sql`select * from staff where user_id = ${userId}`)[0] as { user_id: string; school_id: number; role: string; display_name?: string } | undefined;
  if (!staff || staff.role !== "admin") throw new Error("هذه الصفحة مخصصة لمدير التطبيق");
  return staff;
}

async function schemaOf(sql: Sql) {
  const columns = await sql.query<{ table_name: string; column_name: string; data_type: string; udt_name: string; is_generated: string }>(
    `select table_name, column_name, data_type, udt_name, is_generated
     from information_schema.columns
     where table_schema = 'public'
     order by table_name, ordinal_position`,
  );
  const tables = new Map<string, Col[]>();
  for (const row of columns) {
    if (SKIP.has(row.table_name) || row.is_generated === "ALWAYS") continue;
    const type = row.udt_name === "jsonb" || row.data_type === "jsonb" ? "jsonb" : row.data_type === "json" ? "json" : row.data_type;
    const list = tables.get(row.table_name) ?? [];
    list.push({ name: row.column_name, type });
    tables.set(row.table_name, list);
  }
  const fks = await sql.query<Fk>(
    `select tc.table_name as child, ccu.table_name as parent
     from information_schema.table_constraints tc
     join information_schema.constraint_column_usage ccu
       on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
     where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'`,
  );
  return { tables, fks };
}

function deleteOrder(names: string[], fks: Fk[]) {
  const set = new Set(names);
  const kids = new Map<string, Set<string>>();
  const parents = new Map<string, Set<string>>();
  for (const name of names) {
    kids.set(name, new Set());
    parents.set(name, new Set());
  }
  for (const fk of fks) {
    if (!set.has(fk.child) || !set.has(fk.parent) || fk.child === fk.parent) continue;
    kids.get(fk.parent)!.add(fk.child);
    parents.get(fk.child)!.add(fk.parent);
  }
  const pending = names.filter((name) => kids.get(name)!.size === 0);
  const order: string[] = [];
  const seen = new Set<string>();
  while (pending.length) {
    const name = pending.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    order.push(name);
    for (const parent of parents.get(name) ?? []) {
      kids.get(parent)!.delete(name);
      if (kids.get(parent)!.size === 0) pending.push(parent);
    }
  }
  for (const name of names) if (!seen.has(name)) order.push(name);
  return order;
}

async function schoolUserIds(sql: Sql, schoolId: number) {
  const rows = await sql.query<{ user_id: string }>(`select user_id from staff where school_id = $1`, [schoolId]);
  return rows.map((row) => row.user_id);
}

export const exportSchoolBackup = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await requireAdmin(context.userId);
    const sql = await getSql();
    const { tables } = await schemaOf(sql);
    const school = (await sql.query<{ id: number; name: string }>(`select id, name from schools where id = $1`, [staff.school_id]))[0];
    const userIds = await schoolUserIds(sql, staff.school_id);
    const dumped: Record<string, any[]> = {};
    for (const [name, cols] of tables) {
      const hasSchool = cols.some((col) => col.name === "school_id");
      let rows: any[] = [];
      if (name === "schools") rows = await sql.query(`select * from schools where id = $1`, [staff.school_id]);
      else if (name === "user") rows = userIds.length ? await sql.query(`select * from "user" where id = any($1::text[])`, [userIds]) : [];
      else if (name === "account") rows = userIds.length ? await sql.query(`select * from "account" where "userId" = any($1::text[])`, [userIds]) : [];
      else if (hasSchool) rows = await sql.query(`select * from ${quote(name)} where school_id = $1`, [staff.school_id]);
      else continue;
      dumped[name] = rows;
    }
    const counts = {
      students: dumped.students?.length ?? 0,
      notes: dumped.notes?.length ?? 0,
      staff: dumped.staff?.length ?? 0,
      classes: dumped.classes?.length ?? 0,
    };
    return {
      app: "smart-followup" as const,
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      schoolId: staff.school_id,
      schoolName: school?.name ?? "",
      counts,
      tables: dumped,
    };
  });

const restoreSchema = z.object({
  confirm: z.literal("استعادة"),
  backup: z.object({
    app: z.literal("smart-followup"),
    version: z.literal(1),
    schoolId: z.number(),
    schoolName: z.string().optional(),
    exportedAt: z.string().optional(),
    counts: z.any().optional(),
    tables: z.record(z.string(), z.array(z.record(z.string(), z.any()))),
  }),
});

export const restoreSchoolBackup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(restoreSchema)
  .handler(async ({ context, data }) => {
    const staff = await requireAdmin(context.userId);
    const snapshot = { ...staff };
    return withDbTransaction(async (sql) => {
      let savepoint = false;
      try {
        await sql.query(`savepoint replica_try`);
        savepoint = true;
        await sql.query(`set local session_replication_role = replica`);
        await sql.query(`release savepoint replica_try`);
      } catch (err) {
        if (!savepoint) throw err;
        try { await sql.query(`rollback to savepoint replica_try`); } catch { throw err; }
      }
      const { tables, fks } = await schemaOf(sql);
      const present = Object.keys(data.backup.tables).filter((name) => tables.has(name) && !SKIP.has(name));
      const schoolTables = present.filter((name) => name !== "user" && name !== "account" && name !== "schools");
      const userIds = await schoolUserIds(sql, staff.school_id);
      for (const name of deleteOrder(schoolTables, fks)) {
        if (!tables.get(name)?.some((col) => col.name === "school_id")) continue;
        await sql.query(`delete from ${quote(name)} where school_id = $1`, [staff.school_id]);
      }
      const others = userIds.filter((id) => id !== staff.user_id);
      if (others.length) {
        await sql.query(`delete from "account" where "userId" = any($1::text[])`, [others]);
        await sql.query(`delete from "user" where id = any($1::text[])`, [others]);
      }
      const schoolRow = data.backup.tables.schools?.[0];
      const schoolCols = tables.get("schools") ?? [];
      if (schoolRow) {
        const editable = schoolCols.filter((col) => col.name !== "id" && col.name in schoolRow);
        if (editable.length) {
          const values = editable.map((col) => bind(schoolRow[col.name], col.type));
          const sets = editable.map((col, index) => `${quote(col.name)} = $${index + 2}`);
          await sql.query(`update schools set ${sets.join(", ")} where id = $1`, [staff.school_id, ...values]);
        }
      }
      const ordered = deleteOrder(schoolTables, fks);
      const preferred = ["user", "account", ...[...ordered].reverse()];
      for (const name of preferred) {
        const cols = tables.get(name);
        const rows = data.backup.tables[name] ?? [];
        if (!cols || !rows.length || name === "schools") continue;
        await insertRows(sql, name, cols, rows, staff.school_id);
      }
      const kept = (await sql.query<{ user_id: string }>(`select user_id from staff where user_id = $1`, [staff.user_id]))[0];
      if (!kept) {
        await sql.query(
          `insert into staff (user_id, school_id, display_name, role) values ($1, $2, $3, 'admin')`,
          [snapshot.user_id, snapshot.school_id, snapshot.display_name || "مدير التطبيق"],
        );
      }
      await fixSequences(sql, [...preferred]);
      const students = await countSchool(sql, "students", staff.school_id);
      const notes = await countSchool(sql, "notes", staff.school_id);
      const people = await countSchool(sql, "staff", staff.school_id);
      const expected = data.backup.tables.students?.length ?? 0;
      if (expected > 0 && students === 0) throw new Error("لم تُحفظ بيانات الطلاب");
      return { students, notes, staff: people };
    });
  });

async function insertRows(sql: Sql, table: string, cols: Col[], rows: Record<string, unknown>[], schoolId: number) {
  const usable = cols.filter((col) => rows.some((row) => col.name in row));
  if (!usable.length) return;
  const updates = usable
    .filter((col) => col.name !== "id")
    .map((col) => `${quote(col.name)} = excluded.${quote(col.name)}`)
    .join(", ");
  const conflict = table === "user" || table === "account"
    ? (updates ? ` on conflict (id) do update set ${updates}` : " on conflict (id) do nothing")
    : "";
  const size = 40;
  for (let start = 0; start < rows.length; start += size) {
    const slice = rows.slice(start, start + size);
    const values: unknown[] = [];
    const tuples = slice.map((row) => {
      const slots = usable.map((col) => {
        const raw = col.name === "school_id" ? schoolId : row[col.name];
        values.push(bind(raw, col.type));
        const cast = col.type === "jsonb" || col.type === "json" ? "::jsonb" : "";
        return `$${values.length}${cast}`;
      });
      return `(${slots.join(",")})`;
    });
    const names = usable.map((col) => quote(col.name)).join(",");
    try {
      await sql.query(`insert into ${quote(table)} (${names}) values ${tuples.join(",")}${conflict}`, values);
    } catch (err) {
      const message = err instanceof Error ? err.message : "خطأ غير معروف";
      throw new Error(`تعذر إدخال ${table}: ${message}`);
    }
  }
}

async function countSchool(sql: Sql, table: string, schoolId: number) {
  const rows = await sql.query<{ n: number }>(`select count(*)::int as n from ${quote(table)} where school_id = $1`, [schoolId]);
  return Number(rows[0]?.n ?? 0);
}

async function fixSequences(sql: Sql, names: string[]) {
  for (const name of names) {
    if (name === "user" || name === "account" || name === "schools") continue;
    await sql.query("savepoint seq_try");
    try {
      const found = await sql.query<{ seq: string | null }>(`select pg_get_serial_sequence($1, 'id') as seq`, [name]);
      const seq = found[0]?.seq;
      if (seq) {
        await sql.query(
          `select setval($1::regclass, greatest(coalesce((select max(id) from ${quote(name)}), 1), 1), true)`,
          [seq],
        );
      }
      await sql.query("release savepoint seq_try");
    } catch (err) {
      try {
        await sql.query("rollback to savepoint seq_try");
      } catch {
        throw err;
      }
    }
  }
}

const RECORD_TABLES = [
  "note_messages", "notifications", "parent_messages", "behavior_improvements", "counseling_cases",
  "class_move_requests", "student_mail_msg", "student_mail", "exit_permits", "student_evals",
  "student_period_marks", "student_subject_marks", "daily_attendance", "notes",
];
const ROSTER_TABLES = ["students", "classes", "stages"];
const TEACHER_TABLES = [
  "staff_timetable", "teacher_class_pins", "eval_cards", "eval_scales", "grade_format_uses", "grade_formats",
];

export const resetSchoolData = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    confirm: z.literal("تصفية"),
    notes: z.boolean(),
    roster: z.boolean(),
    teachers: z.boolean(),
  }))
  .handler(async ({ context, data }) => {
    const staff = await requireAdmin(context.userId);
    if (!data.notes && !data.roster && !data.teachers) throw new Error("اختر ما تريد تصفيته");
    return withDbTransaction(async (sql) => {
      const { tables, fks } = await schemaOf(sql);
      const wanted = [
        ...(data.notes || data.roster ? RECORD_TABLES : []),
        ...(data.roster ? ROSTER_TABLES : []),
      ].filter((name) => tables.has(name));
      let removed = 0;
      for (const name of deleteOrder(wanted, fks)) {
        if (!tables.get(name)?.some((col) => col.name === "school_id")) continue;
        const rows = await sql.query(`delete from ${quote(name)} where school_id = $1 returning 1`, [staff.school_id]);
        removed += rows.length;
      }
      if (data.teachers) {
        const leaving = await sql.query<{ user_id: string }>(
          `select user_id from staff where school_id = $1 and role <> 'admin' and user_id <> $2`,
          [staff.school_id, staff.user_id],
        );
        const ids = leaving.map((row) => row.user_id);
        if (ids.length) {
          for (const name of TEACHER_TABLES) {
            const cols = tables.get(name);
            if (!cols?.some((col) => col.name === "school_id")) continue;
            const key = cols.some((col) => col.name === "staff_id") ? "staff_id" : cols.some((col) => col.name === "owner_id") ? "owner_id" : "";
            if (!key) continue;
            const rows = await sql.query(`delete from ${quote(name)} where school_id = $1 and ${quote(key)} = any($2::text[]) returning 1`, [staff.school_id, ids]);
            removed += rows.length;
          }
          const gone = await sql.query<{ user_id: string }>(
            `delete from staff where school_id = $1 and user_id = any($2::text[]) returning user_id`,
            [staff.school_id, ids],
          );
          await sql.query(`delete from "account" where "userId" = any($1::text[])`, [ids]);
          await sql.query(`delete from "user" where id = any($1::text[])`, [ids]);
          removed += gone.length;
        }
      }
      return { removed };
    });
  });
