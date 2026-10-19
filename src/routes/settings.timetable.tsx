import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SettingsBack } from "@/components/settings-back";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getSchoolTimetable, importSmartTimetable, listStaff, saveClassTimetable, saveStaffTimetable } from "@/lib/school/api";
import { parseSubjects, parseSectionName, scheduleFor, stageOrdinal } from "@/lib/school/constants";
import { parseSmartTimetable, type SmartLesson } from "@/lib/school/smart-timetable";
import { tr } from "@/lib/school/i18n";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/settings/timetable")({ component: TimetableSettings });

const DAYS = [
  { id: 0, name: "الأحد" },
  { id: 1, name: "الاثنين" },
  { id: 2, name: "الثلاثاء" },
  { id: 3, name: "الأربعاء" },
  { id: 4, name: "الخميس" },
];

type Cell = { staffId: string; subject: string; classId: number | null; place: string };
type SchoolCell = Cell & { day: number; periodKey: string; staffName?: string; classLabel?: string };

function keyOf(day: number, periodKey: string) {
  return `${day}:${periodKey}`;
}

function TimetableSettings() {
  const { school, classes, staff } = useWorkspace();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"class" | "teacher">("class");
  const [classId, setClassId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [draft, setDraft] = useState<Record<string, Cell>>({});
  const [pending, setPending] = useState<SmartLesson[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const slots = scheduleFor(school.season, school.schedules);
  const board = useQuery({
    queryKey: ["school-timetable"],
    queryFn: () => getSchoolTimetable(),
    enabled: staff.role === "admin",
  });
  const people = useQuery({
    queryKey: ["staff"],
    queryFn: () => listStaff(),
    enabled: staff.role === "admin",
  });
  const teachers = ((people.data ?? []) as { userId: string; displayName: string; role: string; subject: string; active?: boolean }[])
    .filter((person) => person.role === "teacher" && person.active !== false);
  const cells = ((board.data as { cells?: SchoolCell[] } | undefined)?.cells ?? []);
  const chosenClass = Number(classId);
  const teacher = teachers.find((person) => person.userId === staffId);
  const teacherSubjects = parseSubjects(teacher?.subject);

  useEffect(() => {
    const next: Record<string, Cell> = {};
    if (mode === "class" && chosenClass) {
      for (const cell of cells) {
        if (cell.classId !== chosenClass) continue;
        next[keyOf(cell.day, cell.periodKey)] = {
          staffId: cell.staffId,
          subject: cell.subject,
          classId: cell.classId,
          place: cell.place,
        };
      }
    }
    if (mode === "teacher" && staffId) {
      for (const cell of cells) {
        if (cell.staffId !== staffId) continue;
        next[keyOf(cell.day, cell.periodKey)] = {
          staffId: cell.staffId,
          subject: cell.subject,
          classId: cell.classId,
          place: cell.place,
        };
      }
    }
    setDraft(next);
  }, [mode, chosenClass, staffId, board.data]);

  const save = useMutation({
    mutationFn: async () => {
      const rows = Object.entries(draft).map(([key, cell]) => {
        const [day, periodKey] = key.split(":");
        return { day: Number(day), periodKey, ...cell };
      });
      if (mode === "class") {
        if (!chosenClass) throw new Error("اختر الفصل");
        return saveClassTimetable({
          data: {
            classId: chosenClass,
            cells: rows.filter((cell) => cell.staffId).map((cell) => ({
              day: cell.day,
              periodKey: cell.periodKey,
              staffId: cell.staffId,
              subject: cell.subject,
              place: cell.place,
            })),
          },
        });
      }
      if (!staffId) throw new Error("اختر المعلم");
      return saveStaffTimetable({
        data: {
          staffId,
          cells: rows.filter((cell) => cell.classId).map((cell) => ({
            day: cell.day,
            periodKey: cell.periodKey,
            classId: cell.classId,
            subject: cell.subject || (teacherSubjects.length === 1 ? teacherSubjects[0] : ""),
            place: cell.place,
          })),
        },
      });
    },
    onSuccess: () => {
      toast.success(tr("وُزّع الجدول على المعلمين"));
      void queryClient.invalidateQueries({ queryKey: ["school-timetable"] });
      void queryClient.invalidateQueries({ queryKey: ["my-timetable"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
  });
  const upload = useMutation({
    mutationFn: async (input?: { classKeys?: string[] }) => {
      if (!pending?.length) throw new Error("ارفع ملف الجدول أولاً");
      const linksPayload = Object.entries(links).filter(([, staffId]) => staffId).map(([name, staffId]) => ({ name, staffId }));
      return importSmartTimetable({ data: { cells: pending, classKeys: input?.classKeys, links: linksPayload } });
    },
    onSuccess: (result) => {
      setUnmatched(result.unmatched);
      const missed = result.unmatched.length ? ` — ${tr("اربط الأسماء المتبقية")}` : "";
      toast.success(`${tr("وُزّع الجدول")}: ${result.saved} ${tr("حصة")} / ${result.teachers} ${tr("معلم")}${missed}`);
      void queryClient.invalidateQueries({ queryKey: ["school-timetable"] });
      void queryClient.invalidateQueries({ queryKey: ["my-timetable"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
      if (!result.unmatched.length) {
        setPending(null);
        setPicked([]);
        setLinks({});
      }
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر قراءة الجدول")),
  });

  const fileClasses = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cell of pending ?? []) {
      const key = `${cell.stageNo}/${cell.classNo}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, count]) => {
        const [stageNo, classNo] = key.split("/").map(Number);
        const found = classes.find((item) => (
          (stageOrdinal(item.stageName) === stageNo || stageOrdinal(item.shortName) === stageNo)
          && (parseSectionName(item.name) === String(classNo) || item.name === String(classNo))
        ));
        return { key, count, label: found?.label || key };
      })
      .sort((a, b) => a.key.localeCompare(b.key, "ar", { numeric: true }));
  }, [pending, classes]);

  async function readTimetable(file: File) {
    const XLSX = await import("xlsx");
    const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheets: Record<string, unknown[][]> = {};
    for (const name of book.SheetNames) {
      sheets[name] = XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, defval: "" }) as unknown[][];
    }
    const lessons = parseSmartTimetable(sheets);
    if (!lessons.length) {
      toast.error(tr("لم أجد حصصاً في ملف الجدول"));
      return;
    }
    setPending(lessons);
    setPicked([]);
    setLinks({});
    const preview = await importSmartTimetable({ data: { cells: lessons, dry: true } });
    setUnmatched(preview.unmatched);
  }
  const counts = useMemo(() => {
    const byTeacher = new Map<string, number>();
    for (const cell of cells) {
      if (!cell.classId) continue;
      byTeacher.set(cell.staffName || cell.staffId, (byTeacher.get(cell.staffName || cell.staffId) ?? 0) + 1);
    }
    return [...byTeacher.entries()];
  }, [cells]);
  const ready = mode === "class" ? Boolean(chosenClass) : Boolean(staffId);

  if (staff.role !== "admin") {
    return <p className="text-sm text-fg-muted">{tr("جدول المدرسة يعدّه مدير المدرسة.")}</p>;
  }

  function setCell(day: number, periodKey: string, patch: Partial<Cell>) {
    const key = keyOf(day, periodKey);
    setDraft((prev) => {
      const current = prev[key] ?? { staffId: "", subject: "", classId: mode === "class" ? chosenClass || null : null, place: "" };
      return { ...prev, [key]: { ...current, ...patch } };
    });
  }

  return (
    <div className="space-y-4">
      <SettingsBack />
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{tr("جدول المدرسة")}</h1>
        <p className="text-sm text-fg-muted">
          {tr("وزّع الحصص على المعلم والفصل والمادة. ارفع ملف إكسل الجدول الذكي ليُجدول الأسبوع لكل معلم، وتُتجاهل خانات الانتظار.")}
        </p>
      </header>
      <label
        className="flex min-h-11 cursor-pointer items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border bg-card px-3 text-sm font-semibold"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files?.[0];
          if (file) void readTimetable(file);
        }}
      >
        {tr("اسحب جدول الإكسل أو اضغط لرفعه")}
        <input
          type="file"
          accept=".xlsx,.xls"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void readTimetable(file);
          }}
        />
      </label>
      {pending ? (
        <section className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{tr("الفصول في الملف")}</p>
            <button type="button" className="text-xs font-semibold text-primary" onClick={() => setPicked(picked.length === fileClasses.length ? [] : fileClasses.map((item) => item.key))}>
              {picked.length === fileClasses.length ? tr("إلغاء التحديد") : tr("تحديد الكل")}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {fileClasses.map((item) => {
              const on = picked.includes(item.key);
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setPicked((prev) => on ? prev.filter((key) => key !== item.key) : [...prev, item.key])}
                  className={on ? "rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary" : "rounded-full border border-border px-2.5 py-1 text-xs font-semibold"}
                >
                  {item.label}
                  <span className="ms-1 text-[10px] text-fg-muted">{item.count}</span>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" disabled={upload.isPending || picked.length === 0} onClick={() => upload.mutate({ classKeys: picked })}>
              {tr("تحديث الفصول المحددة")}
            </Button>
            <Button type="button" disabled={upload.isPending} onClick={() => upload.mutate({})}>
              {upload.isPending ? tr("جارٍ التوزيع…") : tr("إضافة الجدول مرة واحدة")}
            </Button>
          </div>
          {unmatched.length ? (
            <div className="space-y-1.5 border-t border-border pt-2">
              <p className="text-xs font-semibold text-fg-muted">{tr("أسماء لم تُربط — يُقبل الاسم مع العائلة أو ثلاثة أسماء، وإلا اختر المعلم")}</p>
              {unmatched.map((name) => (
                <div key={name} className="grid items-center gap-1 sm:grid-cols-[1fr_1fr]">
                  <p className="text-sm">{name}</p>
                  <Select value={links[name] ?? ""} onChange={(event) => setLinks((prev) => ({ ...prev, [name]: event.target.value }))}>
                    <option value="">{tr("اربط بمعلم")}</option>
                    {teachers.map((person) => (
                      <option key={person.userId} value={person.userId}>{person.displayName}</option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["class", "حسب الفصل"],
            ["teacher", "حسب المعلم"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={mode === id ? "min-h-8 rounded-full border border-primary bg-primary/10 text-sm font-semibold text-primary" : "min-h-8 rounded-full border border-border bg-card text-sm font-semibold"}
          >
            {tr(label)}
          </button>
        ))}
      </div>
      {mode === "class" ? (
        <div className="space-y-1.5">
          <Label>{tr("الفصل")}</Label>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">{tr("اختر الفصل")}</option>
            {classes.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </Select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>{tr("المعلم")}</Label>
          <Select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">{tr("اختر المعلم")}</option>
            {teachers.map((person) => (
              <option key={person.userId} value={person.userId}>
                {person.displayName}{person.subject ? ` — ${person.subject}` : ""}
              </option>
            ))}
          </Select>
        </div>
      )}
      {ready ? (
        <div className="space-y-3">
          {DAYS.map((day) => (
            <section key={day.id} className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
              <h2 className="border-b border-border px-3 py-2 text-sm font-semibold">{tr(day.name)}</h2>
              <div className="divide-y divide-border">
                {slots.map((slot) => {
                  const cell = draft[keyOf(day.id, slot.key)] ?? { staffId: "", subject: "", classId: null, place: "" };
                  const owner = teachers.find((person) => person.userId === (mode === "teacher" ? staffId : cell.staffId));
                  const subjects = parseSubjects(owner?.subject);
                  return (
                    <div key={slot.key} className="grid gap-2 px-3 py-2 sm:grid-cols-[7rem_1fr_1fr]">
                      <div>
                        <p className="text-sm font-medium">{slot.label.replace("الحصة ", "")}</p>
                        <p className="text-[11px] text-fg-muted" dir="ltr">{slot.from}–{slot.to}</p>
                      </div>
                      {mode === "class" ? (
                        <Select
                          value={cell.staffId}
                          onChange={(e) => {
                            const nextId = e.target.value;
                            const nextTeacher = teachers.find((person) => person.userId === nextId);
                            const only = parseSubjects(nextTeacher?.subject);
                            setCell(day.id, slot.key, { staffId: nextId, subject: only.length === 1 ? only[0] : "" });
                          }}
                        >
                          <option value="">{tr("بدون معلم")}</option>
                          {teachers.map((person) => (
                            <option key={person.userId} value={person.userId}>{person.displayName}</option>
                          ))}
                        </Select>
                      ) : (
                        <Select
                          value={cell.classId ? String(cell.classId) : ""}
                          onChange={(e) => setCell(day.id, slot.key, {
                            classId: e.target.value ? Number(e.target.value) : null,
                            staffId,
                            subject: cell.subject || (teacherSubjects.length === 1 ? teacherSubjects[0] : ""),
                          })}
                        >
                          <option value="">{tr("بدون فصل")}</option>
                          {classes.map((item) => (
                            <option key={item.id} value={item.id}>{item.label}</option>
                          ))}
                        </Select>
                      )}
                      <Select
                        value={cell.subject}
                        onChange={(e) => setCell(day.id, slot.key, { subject: e.target.value })}
                        disabled={subjects.length === 0}
                      >
                        <option value="">{subjects.length > 1 ? tr("اختر المادة") : tr("المادة")}</option>
                        {subjects.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </Select>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          <Button type="button" className="w-full" disabled={save.isPending || board.isPending} onClick={() => save.mutate()}>
            {tr("حفظ وتوزيع الجدول")}
          </Button>
        </div>
      ) : null}
      {counts.length ? (
        <p className="text-xs text-fg-muted">
          {counts.map(([name, count]) => `${name}: ${count}`).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
