import { CircleAlert, CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { tr } from "@/lib/school/i18n";

export function PageHelp({ text, mark = false }: { text: string; mark?: boolean }) {
  const note = text.trim();
  if (!note) return null;
  const Icon = mark ? CircleHelp : CircleAlert;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-grid size-8 shrink-0 place-items-center rounded-full text-warn hover:bg-warn/10"
          aria-label={tr("شرح الصفحة")}
        >
          <Icon className="size-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm leading-6">{note}</PopoverContent>
    </Popover>
  );
}
