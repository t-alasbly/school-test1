import { useRouter } from "@tanstack/react-router";
import { placeLabel, tr } from "@/lib/school/i18n";
import { ArrowRight } from "lucide-react";

export function ClassSwitcher({
  label,
  backTo,
}: {
  classId: number;
  stageId: number;
  stageName: string;
  shortName: string;
  label: string;
  backTo?: string;
}) {
  const router = useRouter();
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          if (backTo === "/desk") {
            void router.navigate({ to: "/desk" });
            return;
          }
          if (typeof window !== "undefined" && window.history.length > 1) {
            router.history.back();
            return;
          }
          void router.navigate({ to: "/classes" });
        }}
        className="grid size-11 place-items-center rounded-[var(--radius-sm)] hover:bg-muted"
        aria-label={backTo === "/desk" ? tr("العودة إلى الجدول") : tr("رجوع")}
      >
        <ArrowRight className="size-5" />
      </button>
      <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight sm:text-3xl">{placeLabel(label)}</h1>
    </div>
  );
}
