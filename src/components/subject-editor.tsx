import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tr } from "@/lib/school/i18n";

export function SubjectEditor({
  subjects,
  onChange,
  onAdded,
}: {
  subjects: string[];
  onChange: (next: string[]) => void;
  onAdded?: (name: string, combine: "sum" | "avg") => void;
}) {
  const [draft, setDraft] = useState("");
  const [combine, setCombine] = useState<"sum" | "avg">("sum");

  function add() {
    const name = draft.trim().slice(0, 40);
    if (!name || subjects.length >= 8) return;
    if (subjects.some((item) => item === name)) {
      setDraft("");
      return;
    }
    onChange([...subjects, name]);
    onAdded?.(name, combine);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      {subjects.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {subjects.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onChange(subjects.filter((item) => item !== name))}
              className="inline-flex min-h-9 items-center gap-1 rounded-full border border-primary bg-primary/10 px-3 text-sm text-primary"
            >
              {name}
              <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={tr("اسم المادة، ثم إضافة")}
          className="min-w-40 flex-1"
        />
        <select
          value={combine}
          onChange={(e) => setCombine(e.target.value as "sum" | "avg")}
          className="h-11 rounded-[var(--radius-md)] border border-border bg-bg px-2 text-sm"
        >
          <option value="sum">{tr("جمع الفترات")}</option>
          <option value="avg">{tr("متوسط الفترات")}</option>
        </select>
        <Button type="button" variant="secondary" onClick={add} disabled={!draft.trim() || subjects.length >= 8}>
          {tr("إضافة مادة")}
        </Button>
      </div>
    </div>
  );
}