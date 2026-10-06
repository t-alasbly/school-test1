import { Link } from "@tanstack/react-router";
import { placeLabel, tr } from "@/lib/school/i18n";
import { ArrowRight } from "lucide-react";

export function ClassSwitcher({
  label,
}: {
  classId: number;
  stageId: number;
  stageName: string;
  shortName: string;
  label: string;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Link
        to="/classes"
        className="grid size-11 place-items-center rounded-[var(--radius-sm)] hover:bg-muted"
        aria-label={tr("قائمة الفصول")}
      >
        <ArrowRight className="size-5" />
      </Link>
      <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight sm:text-3xl">{placeLabel(label)}</h1>
    </div>
  );
}
