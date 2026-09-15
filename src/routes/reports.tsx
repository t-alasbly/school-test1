import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Printer,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { AppGate } from "@/components/app-gate";
import { OfficialLetterhead } from "@/components/print-forms";
import {
  MessageRecordTools,
  NoteRecordTools,
} from "@/components/record-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  getAttendanceRangeReport,
  getReport,
  listParentMessages,
} from "@/lib/school/api";
import {
  NOTE_META,
  NOTE_TYPES,
  classLabel,
  counselorTitle,
  formatDay,
  formatStamp,
  hijriDate,
  messageKindLabel,
  occurrenceLabel,
  periodShort,
  principalTitle,
  todayLabel,
} from "@/lib/school/constants";
import { printElement } from "@/lib/school/print";
import { staffCan } from "@/lib/school/permissions";
import type { NoteType } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/reports")({ component: ReportsPage });

type RosterColumn = { id: string; label: string; width: number };
type RosterTemplate = {
  id: string;
  name: string;
  title: string;
  showPhone: boolean;
  showClass: boolean;
  showStage: boolean;
  extraCols: { id: string; title: string }[];
  order: string[];
  widths: Record<string, number>;
};

const DEFAULT_ROSTER_WIDTHS: Record<string, number> = {
  number: 10,
  name: 42,
  stage: 24,
  class: 24,
  phone: 32,
};

function clampColumnWidth(value: string | number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Math.min(80, Math.max(8, Number.isFinite(parsed) ? parsed : 20));
}

function ReportsPage() {
  return (
    <AppGate>
      <ReportsBody />
    </AppGate>
  );
}

function ReportsBody() {
  const { staff, school } = useWorkspace();
  const canEditRecords = staffCan(staff, "editRecords");
  const [stageId, setStageId] = useState<string>("");
  const [classId, setClassId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");
  const [type, setType] = useState<"all" | NoteType>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mode, setMode] = useState<
    "notes" | "messages" | "names" | "attendance"
  >("notes");
  const [rosterTitle, setRosterTitle] = useState("بيانات الطلاب");
  const [showPhone, setShowPhone] = useState(false);
  const [showClass, setShowClass] = useState(false);
  const [showStage, setShowStage] = useState(false);
  const [extraCols, setExtraCols] = useState<{ id: string; title: string }[]>(
    []
  );
  const [showTeacherSign, setShowTeacherSign] = useState(true);
  const [showCounselorSign, setShowCounselorSign] = useState(true);
  const [showPrincipalSign, setShowPrincipalSign] = useState(true);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    () => {
      try {
        const saved = localStorage.getItem("reports.rosterColumnWidths");
        return saved
          ? { ...DEFAULT_ROSTER_WIDTHS, ...JSON.parse(saved) }
          : DEFAULT_ROSTER_WIDTHS;
      } catch {
        return DEFAULT_ROSTER_WIDTHS;
      }
    }
  );
  const [templates, setTemplates] = useState<RosterTemplate[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("reports.rosterTemplates") || "[]"
      );
    } catch {
      return [];
    }
  });
  const [templateName, setTemplateName] = useState("");
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [bulkMessage, setBulkMessage] = useState(
    "السلام عليكم، نود إشعاركم بخصوص الطالب {name}."
  );
  const sheetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    localStorage.setItem(
      "reports.rosterColumnWidths",
      JSON.stringify(columnWidths)
    );
  }, [columnWidths]);

  useEffect(() => {
    localStorage.setItem("reports.rosterTemplates", JSON.stringify(templates));
  }, [templates]);

  const filters = useMemo(
    () => ({
      stageId: stageId ? Number(stageId) : undefined,
      classId: classId ? Number(classId) : undefined,
      studentId: studentId ? Number(studentId) : undefined,
      type,
      from: from || undefined,
      to: to || undefined,
    }),
    [stageId, classId, studentId, type, from, to]
  );

  const query = useQuery({
    queryKey: ["report", filters],
    queryFn: () => getReport({ data: filters }),
  });

  const stages = query.data?.stages ?? [];
  const classes = (query.data?.classes ?? []).filter(c =>
    stageId ? c.stageId === Number(stageId) : true
  );
  const students = (query.data?.students ?? []).filter(s => {
    if (classId) return s.classId === Number(classId);
    if (stageId) return s.stageId === Number(stageId);
    return true;
  });
  const messagesQuery = useQuery({
    queryKey: ["parent-messages", studentId, classId, stageId, from, to],
    queryFn: () =>
      listParentMessages({
        data: {
          studentId: studentId ? Number(studentId) : undefined,
          classId: classId ? Number(classId) : undefined,
          stageId: stageId ? Number(stageId) : undefined,
          from: from || undefined,
          to: to || undefined,
        },
      }),
    enabled: mode === "messages",
  });
  const messages = messagesQuery.data?.messages ?? [];
  const attendanceQuery = useQuery({
    queryKey: [
      "attendance-range-report",
      stageId,
      classId,
      studentId,
      from,
      to,
      type,
    ],
    queryFn: () =>
      getAttendanceRangeReport({
        data: {
          from,
          to,
          stageId: stageId ? Number(stageId) : undefined,
          classId: classId ? Number(classId) : undefined,
          studentId: studentId ? Number(studentId) : undefined,
          kind: type === "absence" || type === "late" ? type : "all",
        },
      }),
    enabled: mode === "attendance" && Boolean(from && to),
  });
  const scopedToTeacher = query.data?.scopedToTeacher;
  const notes = query.data?.notes ?? [];
  const reportSchool = query.data?.school ?? school;

  const selectedClass = classes.find(c => String(c.id) === classId);
  const selectedStage = stages.find((s: any) => String(s.id) === stageId);
  const selectedStudent = students.find((s: any) => String(s.id) === studentId);

  const classLine = selectedClass
    ? selectedClass.label
    : selectedStage
      ? selectedStage.name
      : "جميع الفصول";
  const rangeLine =
    from || to
      ? `${from ? formatDay(`${from}T12:00:00`) : "البداية"} — ${to ? formatDay(`${to}T12:00:00`) : "اليوم"}`
      : "جميع التواريخ";
  const typeLine = type === "all" ? "جميع الملاحظات" : NOTE_META[type].label;

  const rosterColumns = useMemo<RosterColumn[]>(
    () => [
      {
        id: "number",
        label: "م",
        width: columnWidths.number ?? DEFAULT_ROSTER_WIDTHS.number,
      },
      {
        id: "name",
        label: "اسم الطالب",
        width: columnWidths.name ?? DEFAULT_ROSTER_WIDTHS.name,
      },
      ...(showStage
        ? [
            {
              id: "stage",
              label: "الصف",
              width: columnWidths.stage ?? DEFAULT_ROSTER_WIDTHS.stage,
            },
          ]
        : []),
      ...(showClass
        ? [
            {
              id: "class",
              label: "الفصل",
              width: columnWidths.class ?? DEFAULT_ROSTER_WIDTHS.class,
            },
          ]
        : []),
      ...(showPhone
        ? [
            {
              id: "phone",
              label: "جوال ولي الأمر",
              width: columnWidths.phone ?? DEFAULT_ROSTER_WIDTHS.phone,
            },
          ]
        : []),
      ...extraCols.map((col, index) => ({
        id: col.id,
        label: col.title.trim() || `عمود ${index + 1}`,
        width: columnWidths[col.id] ?? 24,
      })),
    ],
    [columnWidths, extraCols, showClass, showPhone, showStage]
  );

  const orderedRosterColumns = useMemo(() => {
    const byId = new Map(rosterColumns.map(col => [col.id, col]));
    const ordered = columnOrder
      .map(id => byId.get(id))
      .filter(Boolean) as RosterColumn[];
    return [
      ...ordered,
      ...rosterColumns.filter(col => !columnOrder.includes(col.id)),
    ];
  }, [columnOrder, rosterColumns]);

  useEffect(() => {
    setColumnOrder(prev => {
      const ids = rosterColumns.map(col => col.id);
      const next = prev.filter(id => ids.includes(id));
      return [...next, ...ids.filter(id => !next.includes(id))];
    });
  }, [rosterColumns]);

  function setColumnWidth(id: string, value: string) {
    setColumnWidths(prev => ({ ...prev, [id]: clampColumnWidth(value) }));
  }

  function resetColumnWidths() {
    setColumnWidths({
      ...DEFAULT_ROSTER_WIDTHS,
      ...Object.fromEntries(extraCols.map(col => [col.id, 24])),
    });
  }

  function saveRosterTemplate() {
    const name = templateName.trim();
    if (!name) return;
    setTemplates(prev => [
      ...prev,
      {
        id: `tpl-${Date.now()}`,
        name,
        title: rosterTitle,
        showPhone,
        showClass,
        showStage,
        extraCols,
        order: orderedRosterColumns.map(col => col.id),
        widths: columnWidths,
      },
    ]);
    try {
      const activity = JSON.parse(
        localStorage.getItem("school.activityLog") || "[]"
      );
      activity.unshift({
        action: "حفظ قالب كشف",
        name,
        at: new Date().toISOString(),
      });
      localStorage.setItem(
        "school.activityLog",
        JSON.stringify(activity.slice(0, 100))
      );
    } catch {
      // Ignore unavailable browser storage.
    }
    setTemplateName("");
  }

  function loadRosterTemplate(template: RosterTemplate) {
    setRosterTitle(template.title);
    setShowPhone(template.showPhone);
    setShowClass(template.showClass);
    setShowStage(template.showStage);
    setExtraCols(template.extraCols);
    setColumnOrder(template.order);
    setColumnWidths({ ...DEFAULT_ROSTER_WIDTHS, ...template.widths });
  }

  function moveRosterColumn(id: string, direction: -1 | 1) {
    setColumnOrder(prev => {
      const current = prev.indexOf(id);
      const target = current + direction;
      if (current < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[current], next[target]] = [next[target], next[current]];
      return next;
    });
  }

  function exportRosterExcel() {
    const rows = students.map((student: any, index) => {
      const row: Record<string, string | number> = {};
      for (const col of orderedRosterColumns) {
        row[col.label] =
          col.id === "number"
            ? index + 1
            : col.id === "name"
              ? student.name
              : col.id === "stage"
                ? student.stageName
                : col.id === "class"
                  ? student.label
                  : col.id === "phone"
                    ? student.parentPhone || ""
                    : "";
      }
      return row;
    });
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "كشف الأسماء");
    XLSX.writeFile(
      book,
      `${(rosterTitle.trim() || "كشف الأسماء").replace(/[\\/:*?"<>|]/g, "-")}.xlsx`
    );
  }

  function sendBulkWhatsApp() {
    const recipients = students.filter((student: any) =>
      String(student.parentPhone || "").trim()
    );
    for (const student of recipients) {
      const text = bulkMessage
        .replaceAll("{name}", student.name)
        .replaceAll("{class}", student.label || "");
      const phone = String(student.parentPhone).replace(/\D/g, "");
      window.open(
        `https://wa.me/${phone}?text=${encodeURIComponent(text)}`,
        "_blank",
        "noopener,noreferrer"
      );
    }
  }

  const counts = useMemo(() => {
    const empty = {
      absence: 0,
      late: 0,
      homework: 0,
      behavior: 0,
      open: 0,
      closed: 0,
    };
    for (const n of notes) {
      empty[n.type as keyof typeof empty] += 1;
      if (n.status === "open") empty.open += 1;
      else empty.closed += 1;
    }
    return empty;
  }, [notes]);

  function handlePrint() {
    if (sheetRef.current) printElement(sheetRef.current);
  }

  const principal = principalTitle(reportSchool.leadershipGender);
  const counselor = counselorTitle(reportSchool.leadershipGender);

  return (
    <div className="space-y-6">
      <header className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-fg-muted">
            مخالفات ورسائل أولياء الأمور، أو كشف أسماء لفصل أو صف كامل
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">التقارير</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid grid-cols-4 overflow-hidden rounded-[var(--radius-sm)] border border-border">
            <button
              type="button"
              onClick={() => setMode("notes")}
              className={
                mode === "notes"
                  ? "h-11 px-3 text-sm font-medium bg-primary text-primary-fg"
                  : "h-11 px-3 text-sm bg-bg-elevated"
              }
            >
              الملاحظات
            </button>
            <button
              type="button"
              onClick={() => setMode("messages")}
              className={
                mode === "messages"
                  ? "h-11 px-3 text-sm font-medium bg-primary text-primary-fg"
                  : "h-11 px-3 text-sm bg-bg-elevated"
              }
            >
              الرسائل
            </button>
            <button
              type="button"
              onClick={() => setMode("names")}
              className={
                mode === "names"
                  ? "h-11 px-3 text-sm font-medium bg-primary text-primary-fg"
                  : "h-11 px-3 text-sm bg-bg-elevated"
              }
            >
              كشف الأسماء
            </button>
            <button
              type="button"
              onClick={() => setMode("attendance")}
              className={
                mode === "attendance"
                  ? "h-11 px-3 text-sm font-medium bg-primary text-primary-fg"
                  : "h-11 px-3 text-sm bg-bg-elevated"
              }
            >
              غياب زمني
            </button>
          </div>
          <Button
            onClick={handlePrint}
            disabled={
              mode === "messages" ? messagesQuery.isPending : query.isPending
            }
          >
            <Printer className="size-4" />
            {mode === "messages"
              ? "طباعة الرسائل"
              : mode === "names"
                ? "طباعة كشف الأسماء"
                : "طباعة الكشف"}
          </Button>
        </div>
      </header>

      <form className="no-print grid gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="stage">المرحلة</Label>
          <Select
            id="stage"
            value={stageId}
            onChange={e => {
              setStageId(e.target.value);
              setClassId("");
              setStudentId("");
            }}
          >
            <option value="">الكل</option>
            {stages.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cls">الفصل</Label>
          <Select
            id="cls"
            value={classId}
            onChange={e => {
              setClassId(e.target.value);
              setStudentId("");
            }}
          >
            <option value="">الكل</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        {mode !== "names" ? (
          <div className="space-y-1.5">
            <Label htmlFor="student">اسم الطالب</Label>
            <Select
              id="student"
              value={studentId}
              onChange={e => setStudentId(e.target.value)}
            >
              <option value="">الكل</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        {mode === "notes" ? (
          <div className="space-y-1.5">
            <Label htmlFor="type">نوع الملاحظة</Label>
            <Select
              id="type"
              value={type}
              onChange={e => setType(e.target.value as "all" | NoteType)}
            >
              <option value="all">الكل</option>
              {NOTE_TYPES.map(t => (
                <option key={t} value={t}>
                  {NOTE_META[t].label}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        {mode !== "names" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="from">من تاريخ</Label>
              <Input
                id="from"
                type="date"
                value={from}
                onChange={e => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to">إلى تاريخ</Label>
              <Input
                id="to"
                type="date"
                value={to}
                onChange={e => setTo(e.target.value)}
              />
            </div>
          </>
        ) : null}
      </form>
      {mode === "attendance" ? (
        <section className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">إحصائية الغياب والتأخر</h2>
              <p className="text-sm text-fg-muted">
                يظهر أول طالب أو جميع الطلاب حسب الفلاتر.
              </p>
            </div>
            {attendanceQuery.data?.summary ? (
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-danger-soft px-3 py-1 text-danger">
                  غياب: {attendanceQuery.data.summary.absence}
                </span>
                <span className="rounded-full bg-warn-soft px-3 py-1 text-warn">
                  تأخر: {attendanceQuery.data.summary.late}
                </span>
                <span className="rounded-full bg-muted px-3 py-1">
                  طلاب: {attendanceQuery.data.summary.students}
                </span>
              </div>
            ) : null}
          </div>
          {!from || !to ? (
            <p className="py-8 text-center text-sm text-fg-muted">
              حدد تاريخ البداية والنهاية لعرض التقرير.
            </p>
          ) : attendanceQuery.isPending ? (
            <p className="py-8 text-center text-sm text-fg-muted">
              جارٍ إعداد الإحصائية…
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-right">
                    <th className="p-2">الطالب</th>
                    <th className="p-2">الفصل</th>
                    <th className="p-2">أيام مسجلة</th>
                    <th className="p-2">غياب</th>
                    <th className="p-2">تأخر</th>
                  </tr>
                </thead>
                <tbody>
                  {(attendanceQuery.data?.rows ?? []).map((row: any) => (
                    <tr key={row.id} className="border-b border-border">
                      <td className="p-2 font-medium">{row.name}</td>
                      <td className="p-2">
                        {row.short_name} — {row.class_name}
                      </td>
                      <td className="p-2">{row.total_days}</td>
                      <td className="p-2 text-danger">{row.absence_count}</td>
                      <td className="p-2 text-warn">{row.late_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
      {mode === "names" ? (
        <div className="no-print grid gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="roster-title">عنوان الكشف (يظهر فوق الجدول)</Label>
            <Input
              id="roster-title"
              value={rosterTitle}
              onChange={e => setRosterTitle(e.target.value)}
              placeholder="بيانات الطلاب"
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>أعمدة إضافية (اسم مختصر لكل عمود)</Label>
              <button
                type="button"
                className="text-sm font-medium text-primary disabled:opacity-40"
                disabled={extraCols.length >= 16}
                onClick={() =>
                  setExtraCols(prev =>
                    prev.length >= 16
                      ? prev
                      : [...prev, { id: `c${Date.now()}`, title: "" }]
                  )
                }
              >
                إضافة عمود
              </button>
            </div>
            {extraCols.length === 0 ? (
              <p className="text-xs text-fg-muted">
                لا أعمدة إضافية — أضف عموداً واكتب اسمه المختصر.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {extraCols.map((col, i) => (
                  <li key={col.id} className="flex items-center gap-1.5">
                    <Input
                      value={col.title}
                      placeholder={`عمود ${i + 1}`}
                      maxLength={20}
                      onChange={e =>
                        setExtraCols(prev =>
                          prev.map(c =>
                            c.id === col.id
                              ? { ...c, title: e.target.value }
                              : c
                          )
                        )
                      }
                    />
                    <button
                      type="button"
                      className="text-xs text-danger"
                      onClick={() =>
                        setExtraCols(prev => prev.filter(c => c.id !== col.id))
                      }
                    >
                      حذف
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-sm sm:col-span-2 lg:col-span-3">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={showPhone}
                onChange={e => setShowPhone(e.target.checked)}
              />
              جوال ولي الأمر
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={showClass}
                onChange={e => setShowClass(e.target.checked)}
              />
              الفصل
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={showStage}
                onChange={e => setShowStage(e.target.checked)}
              />
              الصف / المرحلة
            </label>
          </div>
          <div className="space-y-3 rounded-[var(--radius-md)] border border-border bg-bg-elevated p-3 sm:col-span-2 lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Label>عرض الأعمدة (مم)</Label>
                <p className="text-xs text-fg-muted">
                  اضبط عرض كل عمود قبل الطباعة. الحد الأدنى 8 مم والأقصى 80 مم.
                </p>
              </div>
              <button
                type="button"
                className="text-sm font-medium text-primary"
                onClick={resetColumnWidths}
              >
                إعادة المقاسات الافتراضية
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {rosterColumns.map(col => (
                <label key={col.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{col.label}</span>
                  <Input
                    type="number"
                    min={8}
                    max={80}
                    step={1}
                    dir="ltr"
                    className="w-24 text-left"
                    value={col.width}
                    onChange={e => setColumnWidth(col.id, e.target.value)}
                    aria-label={`عرض ${col.label} بالمليمتر`}
                  />
                  <span className="text-xs text-fg-muted">مم</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-3 rounded-[var(--radius-md)] border border-border bg-bg-elevated p-3 sm:col-span-2 lg:col-span-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1 space-y-1.5">
                <Label htmlFor="template-name">حفظ القالب باسم</Label>
                <Input
                  id="template-name"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  placeholder="كشف الفصل الأول"
                />
              </div>
              <Button
                type="button"
                size="sm"
                onClick={saveRosterTemplate}
                disabled={!templateName.trim()}
              >
                <Save className="size-4" /> حفظ القالب
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={exportRosterExcel}
              >
                <Download className="size-4" /> Excel
              </Button>
            </div>
            {templates.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {templates.map(template => (
                  <div
                    key={template.id}
                    className="flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1 text-sm"
                  >
                    <button
                      type="button"
                      className="font-medium text-primary"
                      onClick={() => loadRosterTemplate(template)}
                    >
                      {template.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`حذف ${template.name}`}
                      className="text-danger"
                      onClick={() =>
                        setTemplates(prev =>
                          prev.filter(item => item.id !== template.id)
                        )
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="space-y-1">
              <p className="text-sm font-medium">ترتيب الأعمدة</p>
              <div className="flex flex-wrap gap-2">
                {orderedRosterColumns.map((col, index) => (
                  <div
                    key={col.id}
                    className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs"
                  >
                    <span>{col.label}</span>
                    <button
                      type="button"
                      aria-label="تحريك لأعلى"
                      disabled={index === 0}
                      onClick={() => moveRosterColumn(col.id, -1)}
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="تحريك لأسفل"
                      disabled={index === orderedRosterColumns.length - 1}
                      onClick={() => moveRosterColumn(col.id, 1)}
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2 rounded-[var(--radius-md)] border border-border bg-bg-elevated p-3 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="bulk-message">رسالة جماعية عبر واتساب</Label>
            <p className="text-xs text-fg-muted">
              المتغيرات: &#123;name&#125; و&#123;class&#125; — ستُفتح رسالة
              منفصلة لكل طالب لديه رقم جوال.
            </p>
            <textarea
              id="bulk-message"
              className="min-h-20 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 py-2 text-sm"
              value={bulkMessage}
              onChange={e => setBulkMessage(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={sendBulkWhatsApp}
              disabled={!students.some((student: any) => student.parentPhone)}
            >
              فتح رسائل واتساب الجماعية
            </Button>
          </div>
        </div>
      ) : null}

      <article
        ref={sheetRef}
        className="print-form print-report official-sheet official-report overflow-hidden rounded-[var(--radius-lg)] border border-border bg-white text-black font-naskh sm:px-5 sm:py-4"
      >
        <OfficialLetterhead school={reportSchool} />
        <h2 className="mt-2 text-center text-[20px] font-semibold tracking-wide">
          {mode === "messages"
            ? "كشف رسائل أولياء الأمور"
            : mode === "names"
              ? rosterTitle.trim() || "بيانات الطلاب"
              : "كشف متابعة الطلاب"}
        </h2>
        <p className="text-center text-[13px] text-[#00857c]">
          {todayLabel()} — {hijriDate()}
        </p>

        {mode === "names" ? (
          <div className="official-meta mb-2 grid grid-cols-2 overflow-hidden rounded-sm border border-black text-center">
            <div className="border-l border-black px-1.5 py-1.5">
              <p className="text-[11px] font-semibold text-[#00857c]">
                الصف / الفصل
              </p>
              <p className="text-[13px] font-medium leading-5">{classLine}</p>
            </div>
            <div className="px-1.5 py-1.5">
              <p className="text-[11px] font-semibold text-[#00857c]">
                عدد الطلاب
              </p>
              <p className="text-[13px] font-medium leading-5 tabular-nums">
                {students.length}
              </p>
            </div>
          </div>
        ) : selectedStudent ? (
          <table className="official-table mb-3">
            <thead>
              <tr>
                <th>اسم الطالب</th>
                <th>الصف / الفصل</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2.5 text-[18px] font-semibold">
                  {selectedStudent.name}
                </td>
                <td className="py-2.5 text-[16px] font-semibold">
                  {classLine}
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div className="official-meta mb-2 grid grid-cols-2 overflow-hidden rounded-sm border border-black text-center sm:grid-cols-4">
            {[
              ["الصف / المرحلة", classLine],
              ["اسم الطالب", "جميع الطلاب"],
              [
                "نوع الملاحظة",
                mode === "messages" ? "رسائل أولياء الأمور" : typeLine,
              ],
              ["الفترة", rangeLine],
            ].map(([label, value]) => (
              <div
                key={label}
                className="border-l border-black px-1.5 py-1.5 last:border-l-0"
              >
                <p className="text-[11px] font-semibold text-[#00857c]">
                  {label}
                </p>
                <p className="text-[13px] font-medium leading-5">{value}</p>
              </div>
            ))}
          </div>
        )}

        {mode === "attendance" ? null : mode === "names" ? null : mode ===
          "notes" ? (
          <div className="official-tint mb-2 grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-[#00857c] bg-[#00857c] text-center text-[11px] sm:grid-cols-6">
            {(
              [
                ["غياب", counts.absence],
                ["تأخر", counts.late],
                ["واجب", counts.homework],
                ["سلوك", counts.behavior],
                ["مفتوحة", counts.open],
                ["أُغلقت", counts.closed],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="bg-[#f3faf8] px-1 py-1.5">
                <p className="font-semibold text-[#0f4f4a]">{label}</p>
                <p className="text-[13px] font-semibold tabular-nums">{n}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="official-tint mb-2 rounded-sm border border-[#00857c] px-3 py-2 text-center text-[12px]">
            سجل الرسائل المرسلة إلى أولياء الأمور — عدد السجلات:{" "}
            {messages.length}
          </p>
        )}

        <div className="overflow-x-auto">
          {mode === "attendance" ? null : mode === "names" ? (
            <table className="official-table official-report-table official-roster-table">
              <colgroup>
                {orderedRosterColumns.map(col => (
                  <col key={col.id} style={{ width: `${col.width}mm` }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {orderedRosterColumns.map(col => (
                    <th key={col.id}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td
                      colSpan={
                        2 +
                        (showStage ? 1 : 0) +
                        (showClass ? 1 : 0) +
                        (showPhone ? 1 : 0) +
                        extraCols.length
                      }
                      className="py-8 text-center"
                    >
                      لا يوجد طلاب ضمن الصف أو الفصل المحدد.
                    </td>
                  </tr>
                ) : (
                  students.map((s: any, index: number) => (
                    <tr key={s.id}>
                      {orderedRosterColumns.map(col => (
                        <td
                          key={`b-${s.id}-${col.id}`}
                          className={
                            col.id === "name"
                              ? "text-right font-medium"
                              : col.id === "phone"
                                ? "tabular-nums"
                                : "h-8"
                          }
                          dir={col.id === "phone" ? "ltr" : undefined}
                        >
                          {col.id === "number"
                            ? index + 1
                            : col.id === "name"
                              ? s.name
                              : col.id === "stage"
                                ? s.stageName
                                : col.id === "class"
                                  ? s.label
                                  : col.id === "phone"
                                    ? s.parentPhone || ""
                                    : ""}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : mode === "messages" ? (
            <table className="official-table official-report-table">
              <thead>
                <tr>
                  <th className="w-8">م</th>
                  <th>اسم الطالب</th>
                  <th>النوع</th>
                  <th>المرسل</th>
                  <th>التاريخ</th>
                  <th>نص الرسالة</th>
                  {canEditRecords ? (
                    <th className="no-print w-24 whitespace-nowrap"></th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {messages.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canEditRecords ? 7 : 6}
                      className="py-8 text-center"
                    >
                      لا توجد رسائل ضمن الفترة المحددة.
                    </td>
                  </tr>
                ) : (
                  messages.map((msg, index) => (
                    <tr key={msg.id}>
                      <td className="tabular-nums">{index + 1}</td>
                      <td className="text-right">
                        <span className="block font-medium leading-5">
                          {msg.studentName}
                        </span>
                        <span className="block text-[10px] leading-4">
                          {classLabel(msg.shortName, msg.className)}
                        </span>
                      </td>
                      <td>{messageKindLabel(msg.kind)}</td>
                      <td>{msg.staffName}</td>
                      <td className="whitespace-nowrap">
                        {formatStamp(msg.createdAt)}
                      </td>
                      <td className="text-right text-[11px] leading-5">
                        {msg.body}
                      </td>
                      {canEditRecords ? (
                        <td className="no-print whitespace-nowrap">
                          <MessageRecordTools id={msg.id} body={msg.body} />
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="official-table official-report-table">
              <thead>
                <tr>
                  <th className="w-8">م</th>
                  <th>اسم الطالب</th>
                  <th>النوع / المخالفة</th>
                  <th>الحصة · المادة</th>
                  <th>التاريخ</th>
                  <th>الحالة / الإجراء</th>
                  {canEditRecords ? (
                    <th className="no-print w-24 whitespace-nowrap"></th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {notes.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canEditRecords ? 7 : 6}
                      className="py-8 text-center"
                    >
                      لا توجد نتائج ضمن عوامل التصفية الحالية.
                    </td>
                  </tr>
                ) : (
                  notes.map((note: any, index: number) => (
                    <tr key={note.id}>
                      <td className="tabular-nums">{index + 1}</td>
                      <td className="text-right">
                        <span className="block font-medium leading-5">
                          {note.studentName}
                        </span>
                        <span className="block text-[10px] leading-4">
                          {classLabel(note.shortName, note.className)}
                        </span>
                      </td>
                      <td className="text-right">
                        <span className="block leading-5">
                          {NOTE_META[note.type as NoteType].label}
                        </span>
                        {note.behaviorTypeName ? (
                          <span className="block text-[10px] leading-4">
                            {note.behaviorTypeName}
                            {note.occurrence > 1
                              ? ` · ${occurrenceLabel(note.occurrence)}`
                              : ""}
                          </span>
                        ) : note.details ? (
                          <span className="block text-[10px] leading-4">
                            {note.details}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <span className="block leading-5">
                          {periodShort(
                            note.periodKey,
                            reportSchool.season,
                            reportSchool.schedules
                          )}
                        </span>
                        <span className="block text-[10px] leading-4">
                          {note.teacherSubject || note.teacherName || "—"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        {formatDay(note.createdAt)}
                      </td>
                      <td className="text-right">
                        {note.status === "closed"
                          ? note.actionTaken || "أُغلقت"
                          : "قيد المتابعة"}
                      </td>
                      {canEditRecords ? (
                        <td className="no-print whitespace-nowrap">
                          <NoteRecordTools note={note} />
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        <p className="mt-2 text-[10px] leading-5">
          أعدّ الكشف: {staff.displayName} · عدد السجلات:{" "}
          {mode === "messages"
            ? messages.length
            : mode === "names"
              ? students.length
              : notes.length}{" "}
          · طُبع في {todayLabel()}
          {scopedToTeacher && mode === "notes"
            ? " · ملاحظات هذا المعلم فقط"
            : ""}
        </p>

        <div className="no-print mt-3 flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={showTeacherSign}
              onChange={e => setShowTeacherSign(e.target.checked)}
            />
            إظهار المعلم
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={showCounselorSign}
              onChange={e => setShowCounselorSign(e.target.checked)}
            />
            إظهار اسم الوكيل
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={showPrincipalSign}
              onChange={e => setShowPrincipalSign(e.target.checked)}
            />
            إظهار اسم المدير
          </label>
        </div>
        {showTeacherSign || showCounselorSign || showPrincipalSign ? (
          <footer
            className="mt-4 grid gap-3 text-center text-[12px] leading-6"
            style={{
              gridTemplateColumns: `repeat(${[showTeacherSign, showCounselorSign, showPrincipalSign].filter(Boolean).length}, minmax(0, 1fr))`,
            }}
          >
            {showTeacherSign ? (
              <div>
                <p className="font-semibold">المعلم</p>
                <p>الاسم: {query.data?.teacherName || staff.displayName}</p>
                <p>التوقيع: ………………</p>
              </div>
            ) : null}
            {showCounselorSign ? (
              <div>
                <p className="font-semibold">{counselor}</p>
                <p>الاسم: {reportSchool.counselorName || "………………"}</p>
                <p>التوقيع: ………………</p>
              </div>
            ) : null}
            {showPrincipalSign ? (
              <div>
                <p className="font-semibold">{principal}</p>
                <p>الاسم: {reportSchool.principalName || "………………"}</p>
                <p>التوقيع: ………………</p>
              </div>
            ) : null}
          </footer>
        ) : null}
      </article>
    </div>
  );
}
