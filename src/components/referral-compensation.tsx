import { useMutation, useQueryClient } from "@tanstack/react-query";
import { tr } from "@/lib/school/i18n";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { OptionChips } from "@/components/option-chips";
import { Label } from "@/components/ui/label";
import { createCompensationOption, setNoteCompensation } from "@/lib/school/api";
import { COMPENSATION_OPTIONS, isOtherChoice, resolveOther } from "@/lib/school/constants";
import { useWorkspace } from "@/lib/school/workspace";

const MAX_PICK = 3;

export function ReferralCompensation({ noteId, current }: { noteId: number; current: string }) {
  const { compensations = [] } = useWorkspace();
  const queryClient = useQueryClient();
  const options =
    compensations.length > 0 ? compensations.map((c) => c.name) : COMPENSATION_OPTIONS;
  const initial = current ? current.split(" — ").filter(Boolean) : [];
  const [picked, setPicked] = useState<string[]>(() => {
    return initial.map((name) => (options.includes(name) ? name : tr("أخرى")));
  });
  const [other, setOther] = useState(
    () => initial.find((name) => !options.includes(name) && !isOtherChoice(name)) ?? "",
  );
  const [savedFlash, setSavedFlash] = useState(false);
  const otherTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const next = current ? current.split(" — ").filter(Boolean) : [];
    setPicked(next.map((name) => (options.includes(name) ? name : tr("أخرى"))));
    setOther(next.find((name) => !options.includes(name) && !isOtherChoice(name)) ?? "");
  }, [current]);

  const mutation = useMutation({
    mutationFn: async (input: { picked: string[]; other: string }) => {
      const names = resolveOther(input.picked, input.other);
      if (input.picked.some(isOtherChoice) && input.other.trim().length < 2) {
        return { skipped: true as const };
      }
      const custom = names.filter((name) => !options.some((o) => o === name));
      for (const name of custom) {
        try {
          await createCompensationOption({ data: { name } });
        } catch {
          /* ignore */
        }
      }
      await setNoteCompensation({ data: { noteId, compensation: names.join(" — ") } });
      return { skipped: false as const };
    },
    onSuccess: (res) => {
      if (res?.skipped) return;
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1600);
      void queryClient.invalidateQueries({ queryKey: ["counseling-desk"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
  });

  function persist(nextPicked: string[], nextOther: string) {
    mutation.mutate({ picked: nextPicked, other: nextOther });
  }

  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-border bg-bg p-3">
      <div className="flex items-center justify-between gap-2">
        <Label>{tr("فرص تعويض درجات السلوك")}</Label>
        {savedFlash ? <span className="text-xs text-ok">{tr("حُفظت للطالب")}</span> : null}
      </div>
      <p className="text-xs text-fg-muted">{tr("اختر خيارين أو ثلاثة من القائمة المسجّلة — تُحفظ فور التحديد.")}</p>
      {current ? <p className="text-sm text-ok">المحفوظ: {current}</p> : null}
      <OptionChips
        items={options}
        selected={picked}
        onToggle={(name) => {
          setPicked((prev) => {
            const exists = prev.includes(name);
            let next = exists ? prev.filter((x) => x !== name) : [...prev, name];
            if (!exists && next.length > MAX_PICK) {
              toast.message(tr("يمكن اختيار ثلاث فرص كحد أقصى"));
              next = prev;
              return prev;
            }
            persist(next, other);
            return next;
          });
        }}
        otherValue={other}
        onOtherChange={(value) => {
          setOther(value);
          if (otherTimer.current) clearTimeout(otherTimer.current);
          otherTimer.current = setTimeout(() => persist(picked, value), 500);
        }}
        otherPlaceholder={tr("اكتب فرصة التعويض يدوياً…")}
      />
    </div>
  );
}
