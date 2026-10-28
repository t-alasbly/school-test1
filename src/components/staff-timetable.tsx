import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHelp } from "@/components/page-help";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMyTimetable, getTeacherPins, saveMyTimetable } from "@/lib/school/api";
import { parseSubjects, scheduleFor } from "@/lib/school/constants";
import { placeLabel, tr } from "@/lib/school/i18n";
import type { PeriodSlot } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

const DAYS = [
  { id: 0, name: "الأحد" },
  { id: 1, name: "الاثنين" },
  { id: 2, name: "الثلاثاء" },
  { id: 3, name: "الأربعاء" },
  { id: 4, name: "الخميس" },
];

type Cell = {
  day: number;
  periodKey: string;
  classId: number | null;
  place: string;
  classLabel: string;
  subject: string;
};

type PinClass = { id: number; label: string };

function lessonSlots(slots: PeriodSlot[]) {
  return slots.filter((slot) => /^p\d+$/.test(slot.key));
}

function cellKey(day: number, periodKey: string) {
  return `${day}:${periodKey}`;
}

function periodWord(label: string) {
  return tr(label.replace(/^الحصة\s+/, ""));
}

function reminderText(kind: "now" | "next", slot: PeriodSlot, cell: Cell) {
  const bits = [placeLabel(cell.classLabel), cell.place].filter(Boolean).join(" ");
  const when = `${tr(slot.label)} (${slot.from}–${slot.to})`;
  const lead = kind === "now" ? tr("لديك حصة") : tr("الحصة القادمة: لديك حصة");
  return bits ? `${lead} ${bits} — ${when}` : "";
}

export function StaffTimetable({ ownerKey = "" }: { ownerKey?: string }) {
  const { school, classes, staff } = useWorkspace();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["my-timetable", ownerKey], queryFn: () => getMyTimetable() });
  const pins = useQuery({ queryKey: ["teacher-pins", ownerKey], queryFn: () => getTeacherPins() });
  const saved = ((query.data as { cells?: Cell[] } | undefined)?.cells ?? []).map((cell) => ({
    ...cell,
    classId: cell.classId ?? null,
    place: cell.place ?? "",
    classLabel: cell.classLabel ?? "",
    subject: cell.subject ?? "",
  }));
  const [draft, setDraft] = useState<Cell[] | null>(null);
  const [committed, setCommitted] = useState<Cell[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [picked, setPicked] = useState<{ day: number; periodKey: string } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const focusRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  const today = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  const cells = editing && draft ? draft : (committed ?? saved);
  const slots = lessonSlots(scheduleFor(school.season, school.schedules));
  const mine = ((pins.data as { classes?: PinClass[] } | undefined)?.classes ?? []);
  const options = (mine.length ? mine : classes).map((item) => ({ id: item.id, label: item.label }));
  const subjects = parseSubjects(ownerKey ? String((query.data as { subject?: string } | undefined)?.subject || "") : staff.subject);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const save = useMutation({
    mutationFn: (next: Cell[]) =>
      saveMyTimetable({
        data: {
          cells: next
            .filter((cell) => cell.classId || cell.place.trim())
            .map((cell) => ({
              day: cell.day,
              periodKey: cell.periodKey,
              classId: cell.classId,
              place: cell.place.trim(),
              subject: cell.subject.trim(),
            })),
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-timetable"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر حفظ الجدول")),
  });

  function update(day: number, periodKey: string, patch: Partial<Cell>) {
    const base = draft ?? committed ?? saved;
    const key = cellKey(day, periodKey);
    const current = base.find((cell) => cellKey(cell.day, cell.periodKey) === key) ?? {
      day,
      periodKey,
      classId: null,
      place: "",
      classLabel: "",
      subject: "",
    };
    const nextCell = { ...current, ...patch, day, periodKey };
    const rest = base.filter((cell) => cellKey(cell.day, cell.periodKey) !== key);
    const next = nextCell.classId || nextCell.place.trim() ? [...rest, nextCell] : rest;
    setDraft(next);
  }

  function startEdit() {
    setDraft((committed ?? saved).map((cell) => ({ ...cell })));
    setEditing(true);
  }

  function closeEditor() {
    setDraft(null);
    setPicked(null);
    setEditing(false);
  }

  function saveAndClose() {
    const next = (draft ?? committed ?? saved).map((cell) => ({
      ...cell,
      subject: cell.subject.trim() || (subjects.length === 1 ? subjects[0] : ""),
    }));
    if (subjects.length > 1 && next.some((cell) => cell.classId && !cell.subject)) {
      toast.error(tr("اختر المادة لكل حصة. لا تُحدَّد مادة تلقائياً."));
      return;
    }
    save.mutate(next, {
      onSuccess: () => {
        setCommitted(next);
        setDraft(null);
        setPicked(null);
        setEditing(false);
        toast.success(tr("حُفظ الجدول"));
      },
    });
  }

  function openClass(classId: number | null, subject?: string, period?: string) {
    if (!classId) {
      toast(tr("لا يوجد فصل في هذه الحصة"));
      return;
    }
    const chosen = subject?.trim() || (subjects.length === 1 ? subjects[0] : "");
    void navigate({
      to: "/class/$classId",
      params: { classId: String(classId) },
      search: {
        subject: chosen || undefined,
        period: period || undefined,
        from: "desk",
      },
    });
  }

  const schoolToday = today >= 0 && today <= 4 ? today : null;
  const todayName = DAYS.find((item) => item.id === schoolToday)?.name ?? "";
  const liveSlot = schoolToday == null ? null : (slots.find((slot) => mins >= slot.startMin && mins < slot.endMin) ?? null);
  const upcomingSlot = schoolToday == null ? null : (slots.find((slot) => slot.startMin > mins) ?? null);
  const focusSlot = liveSlot ?? upcomingSlot ?? (schoolToday == null ? null : (slots[slots.length - 1] ?? null));
  const mineToday =
    schoolToday == null
      ? []
      : slots.filter((slot) => {
          const cell = cells.find((row) => row.day === schoolToday && row.periodKey === slot.key);
          return Boolean(cell?.classId || cell?.classLabel);
        });
  const stripFocus =
    mineToday.find((slot) => slot.key === liveSlot?.key) ??
    mineToday.find((slot) => slot.startMin > mins) ??
    mineToday[mineToday.length - 1] ??
    null;
  const showGrid = editing || expanded;
  const focusKey = (showGrid ? focusSlot?.key : stripFocus?.key) ?? "";

  useEffect(() => {
    if (editing || !focusKey) return;
    const node = focusRef.current;
    if (!node) return;
    const timer = window.setTimeout(() => {
      node.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }, 140);
    return () => window.clearTimeout(timer);
  }, [editing, expanded, focusKey]);

  const hit = useMemo(() => {
    if (today < 0 || today > 4) return null;
    const mins = now.getHours() * 60 + now.getMinutes();
    const filled = (slot: PeriodSlot) =>
      cells.find((cell) => cell.day === today && cell.periodKey === slot.key && (cell.classId || cell.place.trim()));
    const current = slots.find((slot) => mins >= slot.startMin && mins < slot.endMin);
    if (current) {
      const cell = filled(current);
      if (cell) return { kind: "now" as const, slot: current, cell };
    }
    const upcoming = slots.find((slot) => slot.startMin > mins && filled(slot));
    if (!upcoming) return null;
    const cell = filled(upcoming);
    return cell ? { kind: "next" as const, slot: upcoming, cell } : null;
  }, [cells, now, slots, today]);
  if (!ownerKey && !parseSubjects(staff.subject).length) return null;
  if (ownerKey && !query.isPending && !subjects.length) return null;

  const message = hit ? reminderText(hit.kind, hit.slot, hit.cell) : "";
  const activeSlot = picked ? slots.find((slot) => slot.key === picked.periodKey) : null;
  const activeDay = picked ? DAYS.find((item) => item.id === picked.day) : null;
  const activeCell = picked ? cells.find((cell) => cell.day === picked.day && cell.periodKey === picked.periodKey) : null;

  function cellAt(day: number, periodKey: string) {
    return cells.find((row) => row.day === day && row.periodKey === periodKey);
  }

  return (
    <section className="min-w-0 max-w-full space-y-3 overflow-x-clip">
      {message ? (
        <div
          className={cn(
            "rounded-[var(--radius-lg)] border px-4 py-3 text-sm font-medium",
            hit?.kind === "now" ? "border-primary bg-primary text-primary-fg" : "border-border bg-card",
          )}
        >
          {message}
        </div>
      ) : null}
      <div className="min-w-0 max-w-full overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
        <div className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <p className="font-semibold">{tr("جدولي")}</p>
              <PageHelp
                mark
                text={tr("يظهر يومك والحصص التي في جدولك فقط. الحصة الجارية تُلوَّن بالأحمر الفاتح، والشريط يتحرك إليها. اضغط الحصة لفتح الفصل. تكبير يعرض الأسبوع كاملاً، بما فيه الحصص الفارغة.")}
              />
            </div>
          </div>
          {editing ? (
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <Button type="button" size="sm" onClick={saveAndClose} disabled={save.isPending}>
                {save.isPending ? tr("جارٍ الحفظ…") : tr("حفظ وإغلاق")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={closeEditor} disabled={save.isPending}>
                {tr("إغلاق")}
              </Button>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setExpanded((open) => !open)}
                className="inline-flex h-7 items-center rounded-full border border-primary bg-primary/10 px-2.5 text-xs font-semibold text-primary"
              >
                {expanded ? tr("تصغير") : tr("تكبير")}
              </button>
              <button
                type="button"
                onClick={startEdit}
                className="inline-flex h-7 items-center rounded-full bg-primary px-2.5 text-xs font-semibold text-primary-fg"
              >
                {tr("تعديل")}
              </button>
            </div>
          )}
        </div>
        {showGrid ? (
        <div className="border-t border-border">
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
            <span className="font-semibold">
              {tr("عدد الحصص")} {cells.filter((cell) => cell.classId).length}
            </span>
            {subjects.length > 1
              ? subjects.map((name) => (
                  <span key={name} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {tr(name)} {cells.filter((cell) => cell.classId && cell.subject === name).length}
                  </span>
                ))
              : null}
          </div>
        <div className="min-w-0 max-w-full overflow-x-auto border-t border-border">
          <table className="w-full min-w-[40rem] border-collapse text-center text-sm" dir="rtl">
            <thead>
              <tr>
                <th className="sticky right-0 z-10 min-w-20 border-b border-l border-border bg-muted px-2 py-2 text-xs font-medium">
                  {tr("اليوم")}
                </th>
                {slots.map((slot) => {
                  const live = slot.key === liveSlot?.key && schoolToday != null;
                  return (
                    <th
                      key={slot.key}
                      ref={slot.key === focusKey ? (node) => { focusRef.current = node; } : undefined}
                      className={cn(
                        "min-w-24 border-b border-l border-border px-1 py-2 font-medium",
                        live ? "bg-danger-soft text-danger" : "bg-muted",
                      )}
                    >
                      <span className="block text-xs">{periodWord(slot.label)}</span>
                      <span className="block text-[10px] font-normal" dir="ltr">
                        {slot.from}–{slot.to}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((item) => (
                <tr key={item.id} className={item.id === schoolToday ? "bg-ok-soft/60" : undefined}>
                  <th
                    className={cn(
                      "sticky right-0 z-10 border-b border-l border-border px-2 py-2 text-sm font-semibold",
                      item.id === schoolToday ? "bg-ok-soft" : "bg-card",
                    )}
                  >
                    {tr(item.name)}
                  </th>
                  {slots.map((slot) => {
                    const cell = cellAt(item.id, slot.key);
                    const on = picked?.day === item.id && picked.periodKey === slot.key;
                    return (
                      <td key={slot.key} className="border-b border-l border-border p-1">
                        <button
                          type="button"
                          onClick={() => (editing ? setPicked({ day: item.id, periodKey: slot.key }) : openClass(cell?.classId ?? null, cell?.subject, slot.key))}
                          className={cn(
                            "flex min-h-10 w-full flex-col items-center justify-center rounded-[var(--radius-sm)] px-1 py-1 text-xs leading-tight",
                            on && "ring-2 ring-primary",
                            cell?.classLabel ? "bg-primary/10 font-semibold text-primary" : "text-fg-muted",
                          )}
                        >
                          <span>{cell?.classLabel ? placeLabel(cell.classLabel) : (editing ? tr("اختر") : "—")}</span>
                          {cell?.classLabel ? (
                            <span className={cn("mt-0.5 font-normal", cell.subject ? "text-fg" : "text-warn")}>
                              {cell.subject ? tr(cell.subject) : (subjects.length === 1 ? tr(subjects[0]) : editing ? tr("اختر المادة") : "")}
                            </span>
                          ) : null}
                          {cell?.place ? <span className="mt-0.5 font-normal text-fg-muted">{cell.place}</span> : null}
                          {editing ? <span className="mt-0.5 text-[10px] font-normal text-fg-muted">{tr("تعديل")}</span> : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
        ) : (
          <div className="border-t border-border">
            {schoolToday == null ? (
              <p className="px-4 py-3 text-xs text-fg-muted">{tr("اليوم ليس يوم دراسة. اضغط تكبير لرؤية الأسبوع.")}</p>
            ) : (
              <div className="flex min-w-0 max-w-full" dir="rtl">
                <div className="sticky right-0 z-10 flex w-16 shrink-0 items-center justify-center border-l border-border bg-ok-soft px-1 text-center text-sm font-semibold">
                  {tr(todayName)}
                </div>
                <div className="flex min-w-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth px-2 py-3">
                  {mineToday.length === 0 ? (
                    <p className="self-center text-xs text-fg-muted">{tr("لا حصص في جدولك لهذا اليوم.")}</p>
                  ) : null}
                  {mineToday.map((slot) => {
                    const cell = cellAt(schoolToday!, slot.key);
                    const focused = slot.key === focusKey;
                    const live = slot.key === liveSlot?.key;
                    return (
                      <button
                        key={slot.key}
                        type="button"
                        ref={focused ? (node) => { focusRef.current = node; } : undefined}
                        onClick={() => openClass(cell?.classId ?? null, cell?.subject, slot.key)}
                        className={cn(
                          "flex snap-center flex-col items-center justify-center rounded-[var(--radius-md)] border px-2 py-2 text-center transition-all duration-300",
                          live
                            ? "min-w-40 border-danger bg-danger-soft text-danger shadow-sm"
                            : "min-w-24 border-border bg-bg text-fg",
                        )}
                      >
                        <span className="text-[10px] font-medium">
                          {periodWord(slot.label)}
                          {live ? ` · ${tr("الآن")}` : focused && upcomingSlot?.key === slot.key ? ` · ${tr("القادمة")}` : ""}
                        </span>
                        <span className="text-[10px]" dir="ltr">{slot.from}–{slot.to}</span>
                        <span className="mt-1 text-sm font-semibold leading-tight">{cell?.classLabel ? placeLabel(cell.classLabel) : "—"}</span>
                        {cell?.subject || subjects.length === 1 ? (
                          <span className={cn("text-[10px] font-medium", live ? "text-danger" : "text-fg-muted")}>
                            {tr(cell?.subject || subjects[0])}
                          </span>
                        ) : null}
                        {cell?.place ? <span className={cn("mt-0.5 text-[10px]", live ? "text-danger/80" : "text-fg-muted")}>{cell.place}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="space-y-0 border-t border-border">
              {DAYS.filter((item) => item.id !== schoolToday).map((item) => (
                <div key={item.id} className="flex items-center gap-2 border-b border-border px-3 py-1 last:border-b-0">
                  <span className="w-14 shrink-0 text-[11px] font-medium text-fg-muted">{tr(item.name)}</span>
                  <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
                    {slots.map((slot) => {
                      const cell = cellAt(item.id, slot.key);
                      if (!cell?.classLabel) return null;
                      return (
                        <button
                          key={slot.key}
                          type="button"
                          onClick={() => openClass(cell.classId, cell.subject, slot.key)}
                          className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-fg-muted"
                        >
                          {periodWord(slot.label)} {placeLabel(cell.classLabel)}
                          {cell.subject || subjects.length === 1 ? ` · ${tr(cell.subject || subjects[0])}` : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {editing && picked && activeDay && activeSlot ? (
          <div className="space-y-3 border-t border-border px-3 py-3">
            <p className="text-sm font-medium">
              {tr("تعديل")} — {tr(activeDay.name)} — {tr(activeSlot.label)}
              <span className="mr-2 text-xs font-normal text-fg-muted" dir="ltr">
                {activeSlot.from}–{activeSlot.to}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {options.map((item) => {
                const on = activeCell?.classId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      update(picked.day, picked.periodKey, {
                        classId: item.id,
                        classLabel: item.label,
                        subject: subjects.length === 1 ? subjects[0] : "",
                      })
                    }
                    className={cn(
                      "min-h-8 rounded-full border px-3 text-sm",
                      on ? "border-primary bg-primary text-primary-fg" : "border-border bg-bg",
                    )}
                  >
                    {placeLabel(item.label)}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => update(picked.day, picked.periodKey, { classId: null, classLabel: "", place: "", subject: "" })}
                className="min-h-8 rounded-full border border-dashed border-border px-3 text-sm text-fg-muted"
              >
                {tr("تفريغ")}
              </button>
            </div>
            {subjects.length > 1 ? (
              <div className="space-y-1">
                <p className="text-xs text-fg-muted">{tr("اختر المادة. لا تُحدَّد واحدة مسبقاً.")}</p>
                <div className="flex flex-wrap gap-2">
                {subjects.map((name) => {
                  const on = activeCell?.subject === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => update(picked.day, picked.periodKey, { subject: name })}
                      className={cn(
                        "min-h-8 rounded-full border px-3 text-sm",
                        on ? "border-primary bg-primary text-primary-fg" : "border-border bg-bg",
                      )}
                    >
                      {name}
                    </button>
                  );
                })}
                </div>
              </div>
            ) : null}
            <Input
              value={activeCell?.place ?? ""}
              placeholder={tr("المكان، مثل المعمل أو 2/أ")}
              onChange={(e) => update(picked.day, picked.periodKey, { place: e.target.value })}
            />
            <p className="text-xs text-fg-muted">
              {mine.length ? tr("الفصول المعروضة هي فصول مكتبك.") : tr("لم تختر فصول مكتبك بعد، لذلك تظهر كل الفصول.")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={saveAndClose} disabled={save.isPending}>
                {save.isPending ? tr("جارٍ الحفظ…") : tr("حفظ وإغلاق")}
              </Button>
              <Button type="button" variant="outline" onClick={closeEditor} disabled={save.isPending}>
                {tr("إغلاق")}
              </Button>
            </div>
          </div>
        ) : editing ? (
          <p className="border-t border-border px-4 py-3 text-xs text-fg-muted">{tr("اضغط أي خانة للتعديل، ثم احفظ وأغلق.")}</p>
        ) : null}
      </div>
    </section>
  );
}
