import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tr } from "@/lib/school/i18n";
import { grantExitPermit, listActiveExitPermits } from "@/lib/school/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const EXIT_PERMITS = [
  { kind: "bathroom", label: "دورة المياه", className: "bg-sky-100 text-sky-900" },
  { kind: "cafeteria", label: "المقصف", className: "bg-amber-100 text-amber-950" },
  { kind: "counselor", label: "زيارة المرشد", className: "bg-violet-100 text-violet-950" },
  { kind: "vice", label: "زيارة الوكيل", className: "bg-rose-100 text-rose-950" },
] as const;

export type ExitKind = (typeof EXIT_PERMITS)[number]["kind"];

const WINDOW_MS = 15 * 60 * 1000;

export function useExitPermits() {
  return useQuery({
    queryKey: ["exit-permits"],
    queryFn: () => listActiveExitPermits(),
    refetchInterval: 20_000,
  });
}

export type ExitPermitRow = { studentId: number; studentName?: string; kind: string; createdAt: string };

export function permitClock(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ar-SA", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(date);
}

export function activeExitPermits(rows: ExitPermitRow[] | undefined) {
  return (rows ?? []).filter((row) => {
    const age = Date.now() - new Date(row.createdAt).getTime();
    return Number.isFinite(age) && age >= 0 && age <= WINDOW_MS;
  });
}

export function exitPermitFor(rows: ExitPermitRow[] | undefined, studentId: number) {
  const row = activeExitPermits(rows).find((item) => item.studentId === studentId);
  if (!row) return null;
  const meta = EXIT_PERMITS.find((item) => item.kind === row.kind);
  if (!meta) return null;
  return { ...meta, createdAt: row.createdAt, studentName: row.studentName ?? "" };
}

export function ExitPermitBadge({ studentId, className }: { studentId: number; className?: string }) {
  const permits = useExitPermits();
  const permit = exitPermitFor(permits.data, studentId);
  if (!permit) return null;
  const clock = permitClock(permit.createdAt);
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-4", permit.className, className)}>
      {tr("مستأذن")} · {tr(permit.label)}{clock ? ` · ${clock}` : ""}
    </span>
  );
}

export function ExitPermitStrip() {
  const permits = useExitPermits();
  const rows = activeExitPermits(permits.data);
  if (!rows.length) return null;
  return (
    <div className="no-print border-t border-amber-300 bg-amber-100 px-4 py-1.5">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1.5">
        {rows.map((row) => {
          const meta = EXIT_PERMITS.find((item) => item.kind === row.kind);
          const clock = permitClock(row.createdAt);
          return (
            <span key={row.studentId} className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold", meta?.className ?? "bg-white text-fg")}>
              {row.studentName} · {tr("مستأذن")} · {tr(meta?.label ?? "")}{clock ? ` · ${clock}` : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function useGrantExitPermit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { studentId: number; kind: ExitKind }) => grantExitPermit({ data: input }),
    onSuccess: (_row, input) => {
      const label = EXIT_PERMITS.find((item) => item.kind === input.kind)?.label ?? "";
      toast.success(`${tr("سُمح بالخروج")}: ${tr(label)}`);
      void queryClient.invalidateQueries({ queryKey: ["exit-permits"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر حفظ الإذن")),
  });
}
