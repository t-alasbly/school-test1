import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { classLabel } from "@/lib/school/constants";
import { parsePermissions } from "@/lib/school/permissions";
import type { DailyKind, StaffRole } from "@/lib/school/types";

async function attendanceStaff(userId: string) {
  const sql = await getSql();
  const staff = (
    await sql<{
      school_id: number;
      role: string;
      permissions: string;
      active: boolean;
    }>`
      select school_id, role,
             coalesce(permissions::text, '{}') as permissions,
             coalesce(active, true) as active
      from staff
      where user_id = ${userId}
    `
  )[0];
  if (!staff || staff.role === "pending" || staff.active === false) {
    throw new Error("لا تملك صلاحية الوصول بعد");
  }
  const perms = parsePermissions(staff.permissions, staff.role as StaffRole);
  if (staff.role !== "admin" && !perms.dailyAttendance) {
    throw new Error("ليست لديك هذه الصلاحية");
  }
  return { sql, staff, perms };
}

export const listAttendanceDayCounts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql, staff } = await attendanceStaff(context.userId);
    const rows = await sql<{ student_id: number; absence_days: number; late_days: number }>`
      select student_id,
             sum(case when kind = 'absence' then 1 else 0 end)::int as absence_days,
             sum(case when kind = 'late' then 1 else 0 end)::int as late_days
      from daily_attendance
      where school_id = ${staff.school_id}
      group by student_id
    `;
    return {
      counts: rows.map((row) => ({
        studentId: Number(row.student_id),
        absenceDays: Number(row.absence_days) || 0,
        lateDays: Number(row.late_days) || 0,
      })),
    };
  });

export const getStudentAttendanceDays = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ studentId: z.number() }))
  .handler(async ({ context, data }) => {
    const { sql, staff, perms } = await attendanceStaff(context.userId);
    const student = (
      await sql<{
        id: number;
        name: string;
        parent_phone: string;
        class_name: string;
        short_name: string;
      }>`
        select s.id, s.name, coalesce(s.parent_phone, '') as parent_phone,
               c.name as class_name, st.short_name
        from students s
        join classes c on c.id = s.class_id
        join stages st on st.id = c.stage_id
        where s.id = ${data.studentId} and s.school_id = ${staff.school_id}
      `
    )[0];
    if (!student) throw new Error("الطالب غير موجود");
    const days = await sql<{ day: string; kind: DailyKind; arrived_at: string | null }>`
      select day::text as day, kind, arrived_at::text as arrived_at
      from daily_attendance
      where school_id = ${staff.school_id} and student_id = ${student.id}
      order by day
    `;
    return {
      studentId: student.id,
      studentName: student.name,
      classLabel: classLabel(student.short_name, student.class_name),
      parentPhone: perms.sendMessages ? student.parent_phone : "",
      days: days.map((row) => ({
        day: String(row.day).slice(0, 10),
        kind: row.kind,
        arrivedAt: row.arrived_at || null,
      })),
    };
  });
