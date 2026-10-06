import { useQuery } from "@tanstack/react-query";
import { tr } from "@/lib/school/i18n";
import { useState } from "react";
import { StaffMailThread } from "@/components/staff-mail-thread";
import { StudentSheet } from "@/components/student-sheet";
import { listMyMail, listStudentMail } from "@/lib/school/api";
import { formatStampCalendar } from "@/lib/school/calendar";
import { NOTE_DEST_LABEL } from "@/lib/school/constants";
import { useCalendar } from "@/lib/school/use-calendar";
import type { StudentMail } from "@/lib/school/types";
import { cn } from "@/lib/utils";

export function StaffMailInbox({
  studentId,
  title = tr("مراسلاتي"),
  hint,
}: {
  studentId?: number;
  title?: string;
  hint?: string;
}) {
  const calendar = useCalendar();
  const [openId, setOpenId] = useState<number | null>(null);
  const [student, setStudent] = useState<number | null>(null);
  const query = useQuery({
    queryKey: studentId ? ["student-mail", studentId] : ["my-mail"],
    queryFn: () =>
      studentId ? listStudentMail({ data: { studentId } }) : listMyMail(),
  });
  const threads = ((query.data as { threads?: StudentMail[] } | undefined)?.threads ?? []) as StudentMail[];

  return (
    <section className="space-y-3">
      {title ? (
        <header className="space-y-1">
          {hint ? <p className="text-sm text-fg-muted">{hint}</p> : null}
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        </header>
      ) : null}
      {query.isPending ? (
        <p className="text-sm text-fg-muted">{tr("جارٍ تحميل المراسلات…")}</p>
      ) : threads.length === 0 ? (
        <p className="rounded-[var(--radius-md)] border border-dashed border-border px-4 py-8 text-center text-sm text-fg-muted">
          {tr("لا توجد مراسلات بعد. أرسلها من زر «مراسلة» في صفحة الطالب.")}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
          {threads.map((item) => {
            const open = openId === item.id;
            return (
              <li key={item.id} className="px-4 py-3">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-start gap-2 text-right"
                  onClick={() => setOpenId(open ? null : item.id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{item.studentName}</span>
                    <span className="block text-xs text-fg-muted">
                      {item.classLabel} · {NOTE_DEST_LABEL[item.dest] ?? item.dest} · {item.authorName} → {item.assigneeName}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "text-[11px]",
                      item.assignedToMe ? "font-medium text-primary" : "text-fg-subtle",
                    )}
                  >
                    {formatStampCalendar(item.updatedAt || item.createdAt, calendar)}
                  </span>
                </button>
                {item.lastBody ? (
                  <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{item.lastBody}</p>
                ) : null}
                {open ? (
                  <div className="mt-3 space-y-2">
                    <StaffMailThread mail={item} />
                    {!studentId ? (
                      <button
                        type="button"
                        className="text-xs text-primary"
                        onClick={() => setStudent(item.studentId)}
                      >
                        فتح صفحة الطالب
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <StudentSheet
        studentId={student}
        open={student != null}
        onOpenChange={(next) => {
          if (!next) setStudent(null);
        }}
      />
    </section>
  );
}
