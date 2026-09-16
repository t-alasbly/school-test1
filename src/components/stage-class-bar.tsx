import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { classLabel } from "@/lib/school/constants";
import type { ClassOption, StageSummary } from "@/lib/school/types";
import { cn } from "@/lib/utils";

export type ClassSort = "order" | "alpha";

export function sortedClasses<T extends { label?: string; name: string }>(list: T[], sort: ClassSort): T[] {
  if (sort === "alpha") {
    return [...list].sort((a, b) => (a.label || a.name).localeCompare(b.label || b.name, "ar"));
  }
  return list;
}

export function sortedStudents<T extends { studentName?: string; name?: string; classLabel?: string; label?: string }>(
  list: T[],
  sort: ClassSort,
): T[] {
  const copy = [...list];
  if (sort === "alpha") {
    return copy.sort((a, b) => {
      const an = a.studentName || a.name || "";
      const bn = b.studentName || b.name || "";
      return an.localeCompare(bn, "ar");
    });
  }
  return copy.sort((a, b) => {
    const ac = a.classLabel || a.label || "";
    const bc = b.classLabel || b.label || "";
    const c = ac.localeCompare(bc, "ar", { numeric: true });
    if (c) return c;
    const an = a.studentName || a.name || "";
    const bn = b.studentName || b.name || "";
    return an.localeCompare(bn, "ar");
  });
}

export function StageClassBar({
  stages,
  classes,
  selectedStageId,
  selectedClassId,
  sort,
  onChange,
  onSort,
  studentCount,
}: {
  stages: StageSummary[];
  classes: ClassOption[];
  selectedStageId: number | null;
  selectedClassId: number | null;
  sort: ClassSort;
  onChange: (stageId: number, classId: number | null) => void;
  onSort: (sort: ClassSort) => void;
  studentCount?: number;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const selectedStage = stages.find((s) => s.id === selectedStageId) ?? null;
  const selectedClass = classes.find((c) => c.id === selectedClassId) ?? null;

  return (
    <div className="no-print sticky top-[3.85rem] z-30 -mx-4 mb-3 border-b border-border bg-bg-elevated px-4 py-2.5">
      <div className="mx-auto max-w-6xl space-y-2">
        {stages.length === 0 ? (
          <p className="py-1 text-sm text-fg-muted">
            لا صفوف بعد. ارفع ملف الطلاب من الإعدادات ← الاستيراد.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {stages.map((stage) => {
              const active = selectedStageId === stage.id;
              const stageClasses = sortedClasses(
                classes.filter((c) => c.stageId === stage.id),
                sort,
              );
              return (
                <Popover
                  key={stage.id}
                  open={openId === stage.id}
                  onOpenChange={(open) => setOpenId(open ? stage.id : null)}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedStageId !== stage.id) onChange(stage.id, null);
                      }}
                      className={cn(
                        "inline-flex h-10 shrink-0 items-center gap-1 rounded-full border px-3 text-sm font-semibold",
                        active
                          ? "border-primary bg-primary text-primary-fg shadow-sm"
                          : "border-border bg-bg text-fg-muted hover:border-primary hover:text-fg",
                      )}
                    >
                      {stage.shortName || stage.name}
                      <ChevronDown className={cn("size-4", active ? "opacity-90" : "opacity-60")} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 p-2">
                    <p className="px-2 pb-2 text-xs text-fg-muted">{stage.name} — اختر الفصل</p>
                    <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          onChange(stage.id, null);
                          setOpenId(null);
                        }}
                        className={cn(
                          "flex min-h-10 items-center rounded-[var(--radius-sm)] px-3 text-sm",
                          active && selectedClassId === null
                            ? "bg-primary text-primary-fg"
                            : "hover:bg-muted",
                        )}
                      >
                        جميع الفصول
                      </button>
                      {stageClasses.map((cls) => (
                        <button
                          key={cls.id}
                          type="button"
                          onClick={() => {
                            onChange(stage.id, cls.id);
                            setOpenId(null);
                          }}
                          className={cn(
                            "flex min-h-10 items-center rounded-[var(--radius-sm)] px-3 text-sm",
                            selectedClassId === cls.id
                              ? "bg-primary text-primary-fg"
                              : "hover:bg-muted",
                          )}
                        >
                          {cls.label || classLabel(cls.shortName, cls.name)}
                        </button>
                      ))}
                      {stageClasses.length === 0 ? (
                        <p className="px-3 py-4 text-center text-sm text-fg-muted">لا فصول في هذه المرحلة</p>
                      ) : null}
                    </div>
                  </PopoverContent>
                </Popover>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 flex-1 text-xs text-fg-muted">
            {selectedStage
              ? selectedClass
                ? selectedClass.label || classLabel(selectedClass.shortName, selectedClass.name)
                : `جميع فصول ${selectedStage.shortName || selectedStage.name}`
              : "اضغط الصف ثم اختر فصلاً أو جميع الفصول"}
            {selectedStage && selectedClassId === null ? ` · ترتيب ${sort === "alpha" ? "أبجدي" : "تسلسلي"}` : ""}
            {typeof studentCount === "number" ? ` · ${studentCount} طالب` : ""}
          </p>
          <div className="grid shrink-0 grid-cols-2 overflow-hidden rounded-full border border-border">
            <button
              type="button"
              onClick={() => onSort("order")}
              className={cn(
                "h-9 px-2.5 text-xs font-medium",
                sort === "order" ? "bg-primary text-primary-fg" : "bg-bg text-fg-muted hover:text-fg",
              )}
            >
              تسلسل
            </button>
            <button
              type="button"
              onClick={() => onSort("alpha")}
              className={cn(
                "h-9 px-2.5 text-xs font-medium",
                sort === "alpha" ? "bg-primary text-primary-fg" : "bg-bg text-fg-muted hover:text-fg",
              )}
            >
              أبجدي
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
