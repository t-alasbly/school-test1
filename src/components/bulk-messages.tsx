import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getDailyAttendance, getReport, logBulkParentMessages } from "@/lib/school/api";
import {
  WHATSAPP_TEMPLATES,
  fillTemplate,
  formatDay,
  toWhatsAppNumber,
  weekdayName,
} from "@/lib/school/constants";
import type { MessageKind } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

const KEYS: MessageKind[] = ["general", "absence", "late", "homework", "behavior"];

type SentRow = { id: number; name: string; parentPhone: string; body: string };

export function BulkMessagesPanel() {
  const { school, classes, stages } = useWorkspace();
  const queryClient = useQueryClient();
  const [stageId, setStageId] = useState("");
  const [classId, setClassId] = useState("");
  const [picker, setPicker] = useState<string>("general");
  const [attendanceDay, setAttendanceDay] = useState(() => {
    const d = new Date(); const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
  const [body, setBody] = useState(school.messageTemplates.general?.body ?? WHATSAPP_TEMPLATES.general.body);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [queue, setQueue] = useState<SentRow[]>([]);
  const [cursor, setCursor] = useState(0);

  const report = useQuery({
    queryKey: ["report", "bulk"],
    queryFn: () => getReport({ data: {} }),
  });

  const students = useMemo(() => {
    return ((report.data as { students?: any[] } | undefined)?.students ?? []).filter((s: any) => {
      if (classId) return s.classId === Number(classId);
      if (stageId) return s.stageId === Number(stageId);
      return true;
    });
  }, [report.data, classId, stageId]);

  const filteredClasses = classes.filter((c) => (stageId ? c.stageId === Number(stageId) : true));
  const isAttendancePicker = picker === "absence" || picker === "late";
  const attendanceQuery = useQuery({
    queryKey: ["bulk-attendance", attendanceDay, stageId, classId],
    queryFn: () => getDailyAttendance({ data: { day: attendanceDay, classIds: classId ? [Number(classId)] : classes.filter(c => stageId ? c.stageId === Number(stageId) : true).map(c => c.id) } }),
    enabled: isAttendancePicker && Boolean(attendanceDay),
  });
  const attendanceMatches = useMemo(() => {
    const rows = attendanceQuery.data?.students ?? [];
    return students.filter((s: any) => rows.some((r: any) => r.studentId === s.id && r.kind === picker));
  }, [attendanceQuery.data, picker, students]);
  // For the daily absence/late templates, show only students who match the selected day.
  // Other templates continue to show the normal filtered student list.
  const visibleStudents = isAttendancePicker ? attendanceMatches : students;
  const selectedStudents = visibleStudents.filter((s: any) => selected.has(s.id));
  const withPhone = selectedStudents.filter((s: any) => String(s.parentPhone || "").trim());
  const allSelected = visibleStudents.length > 0 && visibleStudents.every((s: any) => selected.has(s.id));

  useEffect(() => {
    if (!isAttendancePicker || attendanceQuery.isFetching) return;
    setSelected(new Set(attendanceMatches.map((s: any) => s.id)));
  }, [attendanceDay, attendanceMatches, attendanceQuery.isFetching, isAttendancePicker]);

  function applyTemplate(key: string) {
    setPicker(key);
    if (key !== "absence" && key !== "late") setSelected(new Set());
    if (key.startsWith("c:")) {
      const found = (school.customMessages ?? []).find((m) => m.id === key.slice(2));
      if (found) setBody(found.body);
      return;
    }
    const k = key as MessageKind;
    setBody(school.messageTemplates[k]?.body ?? WHATSAPP_TEMPLATES[k].body);
  }

  function toggleAll(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of visibleStudents) {
        if (on) next.add(s.id);
        else next.delete(s.id);
      }
      return next;
    });
  }

  const mutation = useMutation({
    mutationFn: () =>
      logBulkParentMessages({
        data: {
          studentIds: selectedStudents.map((s: any) => s.id),
          kind: (picker.startsWith("c:") ? "general" : picker) as MessageKind,
          body,
        },
      }),
    onSuccess: (data: { sent: SentRow[]; skipped: { id: number; name: string }[] }) => {
      setQueue(data.sent);
      setCursor(0);
      void queryClient.invalidateQueries({ queryKey: ["parent-messages"] });
      if (data.sent.length === 0) {
        toast.error("لا يوجد جوال لأولياء الأمور المحددين");
        return;
      }
      toast.success(`سُجّلت ${data.sent.length} رسالة${data.skipped.length ? ` — بدون جوال: ${data.skipped.length}` : ""}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الإرسال"),
  });

  function openWhatsApp(row: SentRow) {
    const phone = toWhatsAppNumber(row.parentPhone);
    if (!phone) return;
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(row.body)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function openNext() {
    const row = queue[cursor];
    if (!row) return;
    openWhatsApp(row);
    setCursor((n) => n + 1);
  }

  const preview =
    selectedStudents[0] &&
    fillTemplate(body, {
      name: selectedStudents[0].name,
      class: selectedStudents[0].label,
      school: school.name,
      date: isAttendancePicker ? formatDay(`${attendanceDay}T12:00:00`) : formatDay(new Date().toISOString()),
      weekday: isAttendancePicker ? weekdayName(`${attendanceDay}T12:00:00`) : weekdayName(new Date().toISOString()),
      details: "",
      session: "",
    });

  return (
    <section className="space-y-4 rounded-[var(--radius-lg)] border border-border bg-card p-4">
      <header>
        <p className="text-sm text-fg-muted">اختر الطلاب أو الكل، عدّل النص، ثم سجّل الرسائل وافتح واتساب</p>
        <h2 className="text-lg font-semibold">رسائل جماعية لأولياء الأمور</h2>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="bulk-stage">المرحلة</Label>
          <Select
            id="bulk-stage"
            value={stageId}
            onChange={(e) => {
              setStageId(e.target.value);
              setClassId("");
            }}
          >
            <option value="">الكل</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bulk-class">الفصل</Label>
          <Select id="bulk-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">الكل</option>
            {filteredClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        {isAttendancePicker ? (
          <div className="space-y-1.5">
            <Label htmlFor="bulk-att-day">يوم الغياب / التأخر</Label>
            <input id="bulk-att-day" type="date" value={attendanceDay} onChange={(e) => setAttendanceDay(e.target.value)} className="h-10 w-full rounded-[var(--radius-sm)] border border-border bg-bg-elevated px-3 text-sm" />
            <p className="text-xs text-fg-muted">سيتم عرض الطلاب المسجلين {picker === "late" ? "متأخرين" : "غائبين"} في هذا اليوم وتحديدهم تلقائياً.</p>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="bulk-tpl">القالب</Label>
          <Select id="bulk-tpl" value={picker} onChange={(e) => applyTemplate(e.target.value)}>
            {KEYS.map((key) => (
              <option key={key} value={key}>
                {(school.messageTemplates[key] ?? WHATSAPP_TEMPLATES[key]).title}
              </option>
            ))}
            {(school.customMessages ?? []).map((m) => (
              <option key={m.id} value={`c:${m.id}`}>
                {m.title}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bulk-body">نص الرسالة</Label>
        <p className="text-xs text-fg-muted">المتغيرات: {"{name}"} {"{class}"} {"{date}"} {"{weekday}"} {"{school}"}</p>
        <Textarea id="bulk-body" className="min-h-28" value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      {preview ? (
        <p className="rounded-[var(--radius-sm)] border border-border bg-bg-elevated px-3 py-2 text-sm leading-7 text-fg-muted">
          معاينة لأول محدد: {preview}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex min-h-11 items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={allSelected}
            onChange={(e) => toggleAll(e.target.checked)}
          />
          اختيار الكل ({visibleStudents.length})
        </label>
        <p className="text-xs text-fg-muted">
          محدد: {selectedStudents.length} — لديهم جوال: {withPhone.length}
        </p>
      </div>
      <ul className="max-h-72 divide-y divide-border overflow-auto rounded-[var(--radius-md)] border border-border">
        {visibleStudents.map((s: any) => {
          const on = selected.has(s.id);
          const phone = String(s.parentPhone || "").trim();
          return (
            <li key={s.id}>
              <label
                className={cn(
                  "flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2",
                  on && "bg-primary/8",
                )}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={on}
                  onChange={(e) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(s.id);
                      else next.delete(s.id);
                      return next;
                    })
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block truncate text-xs text-fg-muted">{s.label}</span>
                </span>
                <span className={cn("text-xs", phone ? "text-ok" : "text-danger")}>
                  {phone || "بدون جوال"}
                </span>
              </label>
            </li>
          );
        })}
        {visibleStudents.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-fg-muted">
            {isAttendancePicker
              ? `لا يوجد ${picker === "late" ? "طلاب متأخرون" : "طلاب غائبون"} مسجلون في اليوم المحدد.`
              : "لا يوجد طلاب في النطاق المحدد."}
          </li>
        ) : null}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={withPhone.length === 0 || mutation.isPending || body.trim().length < 4}
          onClick={() => mutation.mutate()}
        >
          <MessageCircle className="size-4" />
          {mutation.isPending ? "جارٍ التسجيل…" : `تسجيل وإرسال (${withPhone.length})`}
        </Button>
      </div>
      {queue.length > 0 ? (
        <div className="space-y-2 rounded-[var(--radius-md)] border border-border bg-bg-elevated p-3">
          <p className="text-sm font-medium">
            افتح واتساب تباعاً — {Math.min(cursor + 1, queue.length)} / {queue.length}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={openNext} disabled={cursor >= queue.length}>
              {cursor >= queue.length ? "اكتملت الرسائل" : `فتح واتساب: ${queue[cursor]?.name}`}
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setQueue([]); setCursor(0); }}>
              إغلاق القائمة
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
