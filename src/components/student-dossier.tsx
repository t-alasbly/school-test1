import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Printer } from "lucide-react";
import { OfficialLetterhead } from "@/components/print-forms";
import { Button } from "@/components/ui/button";
import { EXIT_PERMITS } from "@/components/exit-permit";
import { getStudentDossier } from "@/lib/school/api";
import { NOTE_META, formatStamp, formatTime } from "@/lib/school/constants";
import { tr } from "@/lib/school/i18n";
import { printElement } from "@/lib/school/print";
import { useWorkspace } from "@/lib/school/workspace";

const KIND_LABEL: Record<string, string> = {
  absence: "غياب",
  late: "تأخر",
  leave: "انصراف متأخر",
};

export function StudentDossier({ studentId }: { studentId: number }) {
  const { school } = useWorkspace();
  const printRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["student-dossier", studentId],
    queryFn: () => getStudentDossier({ data: { studentId } }),
    enabled: open && studentId > 0,
  });
  const data = query.data;
  const levels = new Map<string, NonNullable<typeof data>["levels"]>();
  for (const row of data?.levels ?? []) {
    const list = levels.get(row.subject) ?? [];
    list.push(row);
    levels.set(row.subject, list);
  }
  return (
    <section className="space-y-2">
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Printer className="size-4" />
        {tr("التقرير المفصل")}
      </Button>
      {open ? (
        <div className="space-y-2 rounded-[var(--radius-md)] border border-border p-3">
          {query.isPending ? <p className="text-sm text-fg-muted">{tr("جارٍ تحميل التقرير…")}</p> : null}
          {query.isError ? <p className="text-sm text-danger">{tr("تعذر تحميل التقرير.")}</p> : null}
          {data ? (
            <>
              <div className="flex justify-end">
                <Button type="button" size="sm" variant="secondary" onClick={() => printRef.current && printElement(printRef.current)}>
                  {tr("طباعة")}
                </Button>
              </div>
              <div ref={printRef} className="space-y-3 bg-white p-3 text-sm text-black">
                <OfficialLetterhead school={school} />
                <h2 className="text-center text-base font-semibold">
                  {tr("التقرير المفصل")} — {data.student.name}
                </h2>
                <p className="text-center text-xs">
                  {data.student.stageName} · {data.student.classLabel}
                </p>
                <DossierTable
                  title={tr("الغياب والتأخر والانصراف")}
                  headers={[tr("النوع"), tr("اليوم"), tr("الوقت"), tr("المسجل")]}
                  rows={data.attendance.map((row) => [
                    tr(KIND_LABEL[row.kind] ?? row.kind),
                    row.day,
                    row.kind === "late" && row.arrivedAt ? formatTime(row.arrivedAt) : row.recordedAt ? formatStamp(row.recordedAt) : "—",
                    row.recorder || "—",
                  ])}
                />
                <DossierTable
                  title={tr("الاستئذان")}
                  headers={[tr("الوجهة"), tr("التاريخ والوقت"), tr("المسجل")]}
                  rows={data.permits.map((row) => [
                    tr(EXIT_PERMITS.find((item) => item.kind === row.kind)?.label ?? row.kind),
                    formatStamp(row.createdAt),
                    row.recorder || "—",
                  ])}
                />
                <DossierTable
                  title={tr("المخالفات والملاحظات")}
                  headers={[tr("النوع"), tr("التفصيل"), tr("المادة"), tr("المعلم"), tr("التاريخ")]}
                  rows={data.notes.map((row) => [
                    row.behaviorName || tr(NOTE_META[row.type as keyof typeof NOTE_META]?.label ?? row.type),
                    row.details || "—",
                    row.subject || "—",
                    row.teacher || "—",
                    formatStamp(row.createdAt),
                  ])}
                />
                {[...levels.entries()].map(([subject, rows]) => (
                  <DossierTable
                    key={subject}
                    title={`${tr("المستوى الدراسي")} — ${subject}`}
                    headers={[tr("المتابعة"), tr("الدرجة"), tr("المعلم"), tr("التاريخ")]}
                    rows={rows.map((row) => [row.label, String(row.points), row.teacher || "—", formatStamp(row.createdAt)])}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function DossierTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-neutral-500">{tr("لا يوجد سجل")}</p>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header} className="border border-black px-1.5 py-1 text-right">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="border border-black px-1.5 py-1 text-right">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
