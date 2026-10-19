import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { listTodayMarks } from "@/lib/school/api";
import { cn } from "@/lib/utils";

export function useTodayMarks() {
  return useQuery({
    queryKey: ["today-marks"],
    queryFn: () => listTodayMarks(),
    refetchInterval: 20_000,
  });
}

export function dayNameClass(kind?: string | null) {
  if (kind === "absence") return "rounded bg-danger px-1 text-white";
  if (kind === "late" || kind === "leave") return "rounded bg-orange-500 px-1 text-white";
  return "";
}

export function DayName({
  studentId,
  className,
  children,
}: {
  studentId: number;
  className?: string;
  children: ReactNode;
}) {
  const marks = useTodayMarks();
  const kind = marks.data?.find((row) => row.studentId === studentId)?.kind;
  return <span className={cn(dayNameClass(kind), className)}>{children}</span>;
}
