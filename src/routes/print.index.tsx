import { createFileRoute } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { OfficialLetterhead } from "@/components/print-forms";
import { MonthDays } from "@/components/attendance-roster";
import { MessageRecordTools, NoteRecordTools } from "@/components/record-actions";
import {
  DEFAULT_COL_MM,
  RosterBuilder,
  visibleColumns,
  type ExtraCol,
  type RosterPayload,
  type RosterTemplate,
} from "@/components/roster-builder";
import { Button } from "@/components/ui/button";
import { PageHelp } from "@/components/page-help";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  deleteRosterTemplate,
  getReport,
  listParentMessages,
  listRosterTemplates,
  publishRosterTemplate,
  saveRosterTemplate,
} from "@/lib/school/api";
import {
  NOTE_META,
  NOTE_TYPES,
  classLabel,
  counselorTitle,
  formatDay,
  formatStamp,
  messageKindLabel,
  occurrenceLabel,
  periodShort,
  principalTitle,
} from "@/lib/school/constants";
import { printElement } from "@/lib/school/print";
import { staffCan } from "@/lib/school/permissions";
import type { NoteType } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";

function localDay(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function briefAction(raw: string | null | undefined, status?: string) {
  const text = String(raw || "");
  const bits: string[] = [];
  const add = (label: string) => {
    if (!bits.includes(label)) bits.push(label);
  };
  if (/تعهد/.test(text)) add("تعهد");
  if (/أُرسل|ارسل|تم إرسال|رسالة/.test(text)) add("تم إرسال رسالة");
  if (/إشعار ولي|إبلاغ ولي|دعوة ولي|ولي الأمر/.test(text)) add("إبلاغ ولي الأمر");
  if (/تنبيه/.test(text)) add("تنبيه");
  if (/حسم/.test(text)) add("حسم درجة");
  if (/إحالة|تحويل/.test(text)) add("إحالة");
  if (/اعتذار/.test(text)) add("اعتذار");
  if (/نقل/.test(text)) add("نقل");
  if (!bits.length) return status === "closed" ? "أُغلقت" : "قيد المتابعة";
  return bits.slice(0, 3).join(" · ");
}

function typeShort(type: string) {
  if (type === "behavior") return "سلوكية";
  if (type === "absence") return "غياب";
  if (type === "late") return "تأخر";
  if (type === "homework") return "دراسية";
  return "ملاحظة";
}

function compactDay(iso?: string) {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(d);
}

export const Route = createFileRoute("/print/")({ component: ReportsBody });

function ReportsBody() {
  const { staff, school } = useWorkspace();
  const canEditRecords = staffCan(staff, "editRecords");
  const canPhone = staffCan(staff, "sendMessages");
  const [stageId, setStageId] = useState<string>("");
  const [classId, setClassId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");
  const [type, setType] = useState<"all" | NoteType>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const official = staffCan(staff, "viewOfficialPrint");
  const [mode, setMode] = useState<"notes" | "messages" | "names" | "attend">(official ? "notes" : "names");
  const [rosterTitle, setRosterTitle] = useState(tr("بيانات الطلاب"));
  const [showPhone, setShowPhone] = useState(false);
  const [showClass, setShowClass] = useState(false);
  const [showStage, setShowStage] = useState(false);
  const [extraCols, setExtraCols] = useState<ExtraCol[]>([]);
  const [colWidths, setColWidths] = useState({ ...DEFAULT_COL_MM });
  const [colOrder, setColOrder] = useState<string[]>(["seq", "name"]);
  const [rowMm, setRowMm] = useState(7);
  const [sheetStyle, setSheetStyle] = useState<"names" | "grades">("names");
  const [sheetMargins, setSheetMargins] = useState(school.printMargins ?? { top: 10, right: 10, bottom: 12, left: 8 });
  const [rosterMarks, setRosterMarks] = useState<Record<string, string>>({});
  const [templateName, setTemplateName] = useState("");
  const [activeTemplateId, setActiveTemplateId] = useState<number | null>(null);
  const [showTeacherSign, setShowTeacherSign] = useState(true);
  const [showCounselorSign, setShowCounselorSign] = useState(true);
  const [showPrincipalSign, setShowPrincipalSign] = useState(true);
  const sheetRef = useRef<HTMLElement>(null);
  const queryClient = useQueryClient();
  const templatesQuery = useQuery({
    queryKey: ["roster-templates"],
    queryFn: () => listRosterTemplates(),
    enabled: mode === "names",
  });
  const templates = ((templatesQuery.data as { templates?: RosterTemplate[] } | undefined)?.templates ?? []) as RosterTemplate[];

  const filters = useMemo(
    () => ({
      stageId: stageId ? Number(stageId) : undefined,
      classId: classId ? Number(classId) : undefined,
      studentId: studentId ? Number(studentId) : undefined,
      type,
      from: from || undefined,
      to: to || undefined,
    }),
    [stageId, classId, studentId, type, from, to],
  );

  const query = useQuery({
    queryKey: ["report", filters],
    queryFn: () => getReport({ data: filters }),
  });

  const stages = query.data?.stages ?? [];
  const classes = (query.data?.classes ?? []).filter((c) =>
    stageId ? c.stageId === Number(stageId) : true,
  );
  const students = (query.data?.students ?? []).filter((s) => {
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
    enabled: official && mode === "messages",
  });
  const messages = messagesQuery.data?.messages ?? [];
  const rawNotes = query.data?.notes ?? [];
  const notes = mode === "attend" ? rawNotes.filter((note) => note.type === "absence" || note.type === "late") : rawNotes;
  const reportSchool = query.data?.school ?? school;
  const periodSummaries = useMemo(() => {
    if (mode !== "notes" && mode !== "attend") return [];
    const kinds = (type === "all" ? ["absence", "late"] : type === "absence" || type === "late" ? [type] : []) as NoteType[];
    return kinds.map((kind) => {
      const map = new Map<number, { studentId: number; studentName: string; classLabel: string; days: Map<string, string[]> }>();
      for (const note of notes) {
        if (note.type !== kind) continue;
        const day = localDay(note.occurredAt || note.createdAt);
        const current = map.get(note.studentId) ?? {
          studentId: note.studentId,
          studentName: note.studentName,
          classLabel: classLabel(note.shortName, note.className),
          days: new Map<string, string[]>(),
        };
        const bits = current.days.get(day) ?? [];
        const period = note.periodKey ? periodShort(note.periodKey, reportSchool.season, reportSchool.schedules) : "";
        const bit = [period && period !== "—" ? period : "", note.teacherSubject || ""].filter(Boolean).join(" · ");
        if (bit && !bits.includes(bit)) bits.push(bit);
        current.days.set(day, bits);
        map.set(note.studentId, current);
      }
      const groups = [...map.values()]
        .map((group) => {
          const days = [...group.days.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([day, bits]) => ({ day, extra: bits.join(tr("، ")) }));
          return { studentId: group.studentId, studentName: group.studentName, classLabel: group.classLabel, days, count: group.days.size };
        })
        .sort((a, b) => a.classLabel.localeCompare(b.classLabel, "ar") || a.studentName.localeCompare(b.studentName, "ar"));
      return { kind, title: tr(NOTE_META[kind].label), groups };
    }).filter((summary) => type !== "all" || summary.groups.length > 0);
  }, [mode, type, notes, reportSchool.season, reportSchool.schedules]);

  const selectedClass = classes.find((c) => String(c.id) === classId);
  const selectedStage = stages.find((s: any) => String(s.id) === stageId);
  const selectedStudent = students.find((s: any) => String(s.id) === studentId);

  const classLine = selectedClass
    ? selectedClass.label
    : selectedStage
      ? selectedStage.name
      : tr("جميع الفصول");
  const rangeLine =
    from || to
      ? `${from ? formatDay(`${from}T12:00:00`) : tr("البداية")} — ${to ? formatDay(`${to}T12:00:00`) : tr("اليوم")}`
      : tr("جميع التواريخ");
  const typeLine = type === "all" ? tr("جميع الملاحظات") : tr(NOTE_META[type].label);

  const counts = useMemo(() => {
    const empty = { absence: 0, late: 0, homework: 0, behavior: 0, open: 0, closed: 0 };
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

  const isAdmin = staff.role === "admin";
  const currentPayload: RosterPayload = {
    title: rosterTitle,
    showPhone,
    showClass,
    showStage,
    extraCols,
    widths: colWidths,
    order: colOrder,
    rowMm,
    sheetStyle,
    margins: sheetMargins,
  };
  const nameCols = visibleColumns(currentPayload);

  function applyTemplate(payload: Partial<RosterPayload> | undefined, id?: number) {
    if (!payload) return;
    setRosterTitle(payload.title || tr("بيانات الطلاب"));
    setShowPhone(Boolean(payload.showPhone));
    setShowClass(Boolean(payload.showClass));
    setShowStage(Boolean(payload.showStage));
    const extras: ExtraCol[] = Array.isArray(payload.extraCols)
      ? payload.extraCols.map((c, i) => ({
          id: String(c.id || `c${i + 1}`),
          title: String(c.title ?? ""),
          width: Number(c.width) > 0 ? Number(c.width) : 20,
          max: Number(c.max) > 0 ? Number(c.max) : undefined,
        }))
      : [];
    setExtraCols(extras);
    if (payload.widths) {
      setColWidths({
        seq: Number(payload.widths.seq) || DEFAULT_COL_MM.seq,
        name: Number(payload.widths.name) || DEFAULT_COL_MM.name,
        class: Number(payload.widths.class) || DEFAULT_COL_MM.class,
        stage: Number(payload.widths.stage) || DEFAULT_COL_MM.stage,
        phone: Number(payload.widths.phone) || DEFAULT_COL_MM.phone,
      });
    }
    setColOrder(Array.isArray(payload.order) ? payload.order.map(String) : ["seq", "name"]);
    setRowMm(Number(payload.rowMm) >= 4 ? Number(payload.rowMm) : 7);
    setSheetStyle(payload.sheetStyle === "grades" ? "grades" : "names");
    if (payload.margins) {
      setSheetMargins({
        top: Number(payload.margins.top) || 0,
        right: Number(payload.margins.right) || 0,
        bottom: Number(payload.margins.bottom) || 0,
        left: Number(payload.margins.left) || 0,
      });
    }
    if (id) setActiveTemplateId(id);
  }

  function nameCell(col: (typeof nameCols)[number], student: any, index: number) {
    if (col.builtin === "seq") return index + 1;
    if (col.builtin === "name") return student.name;
    if (col.builtin === "stage") return student.stageName ?? "";
    if (col.builtin === "class") return student.label ?? "";
    if (col.builtin === "phone") return canPhone ? student.parentPhone ?? "" : "";
    return "";
  }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const headers = nameCols.map((c) => c.title);
    const body = students.map((s: any, index: number) => nameCols.map((col) => nameCell(col, s, index)));
    const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
    ws["!cols"] = nameCols.map((c) => ({ wch: Math.max(8, Math.round(c.width / 2)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tr("كشف الأسماء"));
    XLSX.writeFile(wb, `${(rosterTitle.trim() || tr("كشف-الاسماء")).replace(/[\\/:*?"<>|]+/g, "-")}.xlsx`);
  }

  const saveTpl = useMutation({
    mutationFn: (asNew?: boolean) =>
      saveRosterTemplate({
        data: {
          id: asNew ? undefined : activeTemplateId ?? undefined,
          name: templateName.trim() || rosterTitle.trim() || "كشف أسماء",
          payload: currentPayload,
        },
      }),
    onSuccess: (res) => {
      toast.success(isAdmin ? "حُفظ القالب لجميع المعلمين" : "حُفظ القالب في حسابك");
      const id = (res as { id?: number } | undefined)?.id;
      if (id) setActiveTemplateId(id);
      void queryClient.invalidateQueries({ queryKey: ["roster-templates"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : "تعذر حفظ القالب"),
  });
  const deleteTpl = useMutation({
    mutationFn: (id: number) => deleteRosterTemplate({ data: { id } }),
    onSuccess: (_res, id) => {
      toast.success("حُذف القالب");
      setActiveTemplateId((cur) => (cur === id ? null : cur));
      void queryClient.invalidateQueries({ queryKey: ["roster-templates"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحذف")),
  });
  const publishTpl = useMutation({
    mutationFn: (id: number) => publishRosterTemplate({ data: { id } }),
    onSuccess: () => {
      toast.success("عُمّم القالب على كل المعلمين");
      void queryClient.invalidateQueries({ queryKey: ["roster-templates"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : "تعذر التعميم"),
  });

  const principal = principalTitle(reportSchool.leadershipGender);
  const counselor = counselorTitle(reportSchool.leadershipGender);
  const tableMm = nameCols.reduce((n, c) => n + c.width, 0);

  return (
    <div className="space-y-6">
      <header className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            {tr("التقارير")}
            <PageHelp text={tr("مخالفات ورسائل أولياء الأمور، أو كشف أسماء لفصل أو صف كامل")} />
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={official ? "grid grid-cols-3 overflow-hidden rounded-[var(--radius-sm)] border border-border" : "grid grid-cols-3 overflow-hidden rounded-[var(--radius-sm)] border border-border"}>
            {official ? (
            <button
              type="button"
              onClick={() => setMode("notes")}
              className={
                mode === "notes"
                  ? "h-11 px-3 text-sm font-medium bg-primary text-primary-fg"
                  : "h-11 px-3 text-sm bg-bg-elevated"
              }
            >
              {tr("الملاحظات")}
            </button>
            ) : (
            <button
              type="button"
              onClick={() => setMode("notes")}
              className={
                mode === "notes"
                  ? "h-11 px-3 text-sm font-medium bg-primary text-primary-fg"
                  : "h-11 px-3 text-sm bg-bg-elevated"
              }
            >
              {tr("مخالفاتي")}
            </button>
            )}
            {official ? (
            <button
              type="button"
              onClick={() => setMode("messages")}
              className={
                mode === "messages"
                  ? "h-11 px-3 text-sm font-medium bg-primary text-primary-fg"
                  : "h-11 px-3 text-sm bg-bg-elevated"
              }
            >
              {tr("الرسائل")}
            </button>
            ) : (
            <button
              type="button"
              onClick={() => {
                setType("all");
                setMode("attend");
              }}
              className={
                mode === "attend"
                  ? "h-11 px-3 text-sm font-medium bg-primary text-primary-fg"
                  : "h-11 px-3 text-sm bg-bg-elevated"
              }
            >
              {tr("الغياب")}
            </button>
            )}
            <button
              type="button"
              onClick={() => setMode("names")}
              className={
                mode === "names"
                  ? "h-11 px-3 text-sm font-medium bg-primary text-primary-fg"
                  : "h-11 px-3 text-sm bg-bg-elevated"
              }
            >
              {tr("كشف الأسماء")}
            </button>
          </div>
          <Button
            onClick={handlePrint}
            disabled={mode === "messages" ? messagesQuery.isPending : query.isPending}
          >
            <Printer className="size-4" />
            {mode === "messages" ? "طباعة الرسائل" : mode === "names" ? "طباعة كشف الأسماء" : mode === "attend" ? "طباعة الغياب" : "طباعة الكشف"}
          </Button>
        </div>
      </header>

      <form className="no-print grid gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="stage">{tr("المرحلة")}</Label>
          <Select
            id="stage"
            value={stageId}
            onChange={(e) => {
              setStageId(e.target.value);
              setClassId("");
              setStudentId("");
            }}
          >
            <option value="">{tr("الكل")}</option>
            {stages.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cls">{tr("الفصل")}</Label>
          <Select
            id="cls"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setStudentId("");
            }}
          >
            <option value="">{tr("الكل")}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        {mode !== "names" ? (
        <div className="space-y-1.5">
          <Label htmlFor="student">{tr("اسم الطالب")}</Label>
          <Select id="student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">{tr("الكل")}</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        ) : null}
        {mode === "notes" ? (
        <div className="space-y-1.5">
          <Label htmlFor="type">{tr("نوع الملاحظة")}</Label>
          <Select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as "all" | NoteType)}
          >
            <option value="all">{tr("الكل")}</option>
            {NOTE_TYPES.map((t) => (
              <option key={t} value={t}>
                {tr(NOTE_META[t].label)}
              </option>
            ))}
          </Select>
        </div>
        ) : null}
        {mode !== "names" ? (
        <>
        <div className="space-y-1.5">
          <Label htmlFor="from">{tr("من تاريخ")}</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">{tr("إلى تاريخ")}</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        </>
        ) : null}
      </form>
      {mode === "names" ? (
        <RosterBuilder
          title={rosterTitle}
          onTitle={setRosterTitle}
          showPhone={showPhone}
          showClass={showClass}
          showStage={showStage}
          extraCols={extraCols}
          widths={colWidths}
          order={colOrder}
          onChange={(patch) => {
            if (patch.title !== undefined) setRosterTitle(patch.title);
            if (patch.showPhone !== undefined) setShowPhone(patch.showPhone);
            if (patch.showClass !== undefined) setShowClass(patch.showClass);
            if (patch.showStage !== undefined) setShowStage(patch.showStage);
            if (patch.extraCols) setExtraCols(patch.extraCols);
            if (patch.widths) setColWidths(patch.widths);
            if (patch.order) setColOrder(patch.order);
            if (patch.rowMm) setRowMm(patch.rowMm);
            if (patch.sheetStyle) setSheetStyle(patch.sheetStyle);
          }}
          templateName={templateName}
          onTemplateName={setTemplateName}
          templates={templates}
          activeId={activeTemplateId}
          onApply={(tpl) => {
            applyTemplate(tpl.payload, tpl.id);
            setTemplateName(tpl.name);
          }}
          onSave={() => {
            const tpl = templates.find((t) => t.id === activeTemplateId);
            saveTpl.mutate(!activeTemplateId || (!isAdmin && Boolean(tpl?.public)));
          }}
          onSaveAs={() => saveTpl.mutate(true)}
          onDelete={(id) => deleteTpl.mutate(id)}
          onPublish={(id) => publishTpl.mutate(id)}
          isAdmin={isAdmin}
          saving={saveTpl.isPending}
          onExcel={() => void exportExcel()}
          rowMm={rowMm}
          onRowMm={setRowMm}
        />
      ) : null}

      {mode === "names" ? (
        <div className="no-print flex flex-wrap items-end gap-2 rounded-[var(--radius-md)] border border-border bg-card p-3">
          <p className="w-full text-sm font-semibold">{tr("هوامش هذا النموذج (مم)")}</p>
          {([["top", "أعلى"], ["bottom", "أسفل"], ["right", "يمين"], ["left", "يسار"]] as const).map(([key, label]) => (
            <label key={key} className="space-y-1 text-sm">
              <span>{label}</span>
              <Input className="w-20" type="number" min={0} max={40} value={sheetMargins[key]} onChange={(event) => setSheetMargins((prev) => ({ ...prev, [key]: Math.min(40, Math.max(0, Number(event.target.value) || 0)) }))} />
            </label>
          ))}
          {sheetStyle === "grades" ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => {
              const year = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { year: "numeric" }).format(new Date());
              setRosterTitle(`كشف أعمال السنة لمادة ${query.data?.subject || "…"} للفصل ${classLine} الفصل الدراسي الأول للعام ${year}`);
            }}>{tr("عنوان تلقائي")}</Button>
          ) : null}
          <p className="w-full text-xs text-fg-muted">{tr("تُحفظ الهوامش والعنوان مع القالب عند الضغط على حفظ.")}</p>
        </div>
      ) : null}

      <article
        ref={sheetRef}
        className="print-form print-report official-sheet official-report overflow-hidden rounded-[var(--radius-lg)] border border-border bg-white text-black font-naskh sm:px-5 sm:py-4"
        style={{
          ["--print-margin-top" as string]: `${sheetMargins.top}mm`,
          ["--print-margin-right" as string]: `${sheetMargins.right}mm`,
          ["--print-margin-bottom" as string]: `${sheetMargins.bottom}mm`,
          ["--print-margin-left" as string]: `${sheetMargins.left}mm`,
        }}
      >
        <OfficialLetterhead school={reportSchool} />
        {mode === "names" ? null : mode === "notes" || mode === "attend" ? (
          <h2 className="mb-2 text-center text-[15px] font-semibold">
            {mode === "attend" ? "كشف الغياب" : "كشف المتابعة"}
            {classLine ? ` — ${classLine}` : ""}
            {query.data?.subject ? ` — ${query.data.subject}` : ""}
          </h2>
        ) : (
        <h2 className="mt-2 mb-2 text-center text-[20px] font-semibold tracking-wide">
          {mode === "messages" ? "كشف رسائل أولياء الأمور" : "سجل المتابعة"}
        </h2>
        )}

        {mode === "names" && sheetStyle === "grades" ? (
          <input
            className="year-title mb-2 w-full border-0 bg-transparent text-center text-[15px] font-semibold outline-none"
            value={rosterTitle}
            onChange={(event) => setRosterTitle(event.target.value)}
          />
        ) : mode === "names" ? (
          <div className="official-meta mb-2 flex flex-nowrap items-center gap-3 overflow-hidden whitespace-nowrap border border-black px-2 py-1 text-[12px] leading-5">
            <p className="min-w-0 flex-1 whitespace-normal text-right text-[15px] font-semibold leading-6">{rosterTitle.trim() || "بيانات الطلاب"}</p>
            <p>
              <span className="font-semibold text-[#00857c]">{tr("الصف / الفصل")}</span>
              {" "}{classLine}
            </p>
            <p>
              <span className="font-semibold text-[#00857c]">{tr("عدد الطلاب")}</span>
              {" "}<span className="tabular-nums">{students.length}</span>
            </p>
          </div>
        ) : mode === "notes" || mode === "attend" ? null : selectedStudent ? (
          <table className="official-table mb-3">
            <thead>
              <tr>
                <th>{tr("اسم الطالب")}</th>
                <th>{tr("الصف / الفصل")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2.5 text-[18px] font-semibold">{selectedStudent.name}</td>
                <td className="py-2.5 text-[16px] font-semibold">{classLine}</td>
              </tr>
            </tbody>
          </table>
        ) : (
        <div className="official-meta mb-2 grid grid-cols-2 overflow-hidden rounded-sm border border-black text-center sm:grid-cols-4">
          {[
            ["الصف / المرحلة", classLine],
            [tr("اسم الطالب"), "جميع الطلاب"],
            [tr("نوع الملاحظة"), mode === "messages" ? "رسائل أولياء الأمور" : typeLine],
            ["الفترة", rangeLine],
          ].map(([label, value]) => (
            <div key={label} className="border-l border-black px-1.5 py-1.5 last:border-l-0">
              <p className="text-[11px] font-semibold text-[#00857c]">{label}</p>
              <p className="text-[13px] font-medium leading-5">{value}</p>
            </div>
          ))}
        </div>
        )}

        {mode === "names" || mode === "notes" || mode === "attend" ? null : mode === "messages" ? (
          <p className="official-tint mb-2 rounded-sm border border-[#00857c] px-3 py-2 text-center text-[12px]">
            سجل الرسائل المرسلة إلى أولياء الأمور — عدد السجلات: {messages.length}
          </p>
        ) : null}

        <div className="overflow-x-auto">
        {mode === "names" ? (
        <>
        <table className="official-table official-report-table roster-fit" style={{ tableLayout: "fixed", width: `${tableMm}mm`, ["--roster-row" as string]: `${rowMm}mm` }}>
          <thead>
            <tr>
              {nameCols.map((col) => (
                <th key={col.id} style={{ width: `${col.width}mm` }}>{col.title}</th>
              ))}
            </tr>
            {nameCols.some((col) => col.max) ? (
              <tr>
                {nameCols.map((col) => (
                  <th key={`${col.id}-max`} style={{ width: `${col.width}mm` }}>{col.max ?? ""}</th>
                ))}
              </tr>
            ) : null}
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan={Math.max(1, nameCols.length)} className="py-8 text-center">
                  لا يوجد طلاب ضمن الصف أو الفصل المحدد.
                </td>
              </tr>
            ) : (
              students.map((s: any, index: number) => (
                <tr key={s.id} className={sheetStyle === "grades" && index % 2 === 1 ? "bg-[#f3f4f6]" : undefined}>
                  {nameCols.map((col) => (
                    <td
                      key={col.id}
                      className={
                        col.builtin === "name"
                          ? "text-right font-medium"
                          : col.builtin === "phone"
                            ? "tabular-nums"
                            : col.builtin
                              ? "tabular-nums"
                              : "h-8"
                      }
                      dir={col.builtin === "phone" ? "ltr" : undefined}
                    >
                      {col.builtin ? nameCell(col, s, index) : (
                        <input
                          className="h-8 w-full bg-transparent text-center"
                          inputMode="decimal"
                          value={rosterMarks[`${s.id}:${col.id}`] ?? ""}
                          placeholder="0"
                          onChange={(event) => setRosterMarks((prev) => ({ ...prev, [`${s.id}:${col.id}`]: event.target.value }))}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
        {sheetStyle === "grades" ? (
          <div className="mt-6 flex items-start justify-between gap-6 text-sm">
            <p className="font-semibold">معلم المادة: {query.data?.teacherName || "………………"}</p>
            <p className="font-semibold">{principal}: ………………</p>
          </div>
        ) : null}
        </>
        ) : mode === "messages" ? (
        <table className="official-table official-report-table">
          <thead>
            <tr>
              <th className="w-8">{tr("م")}</th>
              <th>{tr("اسم الطالب")}</th>
              <th>{tr("النوع")}</th>
              <th>{tr("المرسل")}</th>
              <th>{tr("التاريخ")}</th>
              <th>{tr("نص الرسالة")}</th>
              {canEditRecords ? <th className="no-print w-24 whitespace-nowrap"></th> : null}
            </tr>
          </thead>
          <tbody>
            {messages.length === 0 ? (
              <tr>
                <td colSpan={canEditRecords ? 7 : 6} className="py-8 text-center">
                  لا توجد رسائل ضمن الفترة المحددة.
                </td>
              </tr>
            ) : (
              messages.map((msg, index) => (
                <tr key={msg.id}>
                  <td className="tabular-nums">{index + 1}</td>
                  <td className="text-right">
                    <span className="block font-medium leading-5">{msg.studentName}</span>
                    <span className="block text-[10px] leading-4">
                      {classLabel(msg.shortName, msg.className)}
                    </span>
                  </td>
                  <td>{messageKindLabel(msg.kind)}</td>
                  <td>{msg.staffName}</td>
                  <td className="whitespace-nowrap">{formatStamp(msg.createdAt)}</td>
                  <td className="text-right text-[11px] leading-5">{msg.body}</td>
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
        <>
        {periodSummaries.map((summary) => (
          <div key={summary.kind} className="mb-3">
            <h3 className="mb-1 text-center text-[16px] font-semibold">{summary.title}</h3>
            <p className="mb-1 text-center text-[12px]">
              {summary.groups.length} طالب · {summary.groups.reduce((sum, group) => sum + group.count, 0)} يوم
            </p>
            <table className="w-full border-collapse text-sm" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr className="bg-[#9aa0a6] text-white">
                  <th className="w-10 border border-black px-1 py-1">{tr("م")}</th>
                  <th className="border border-black px-2 py-1 text-right">{tr("اسم الطالب")}</th>
                  <th className="border border-black px-1 py-1">{tr("الصف")}</th>
                  <th className="w-16 border border-black px-1 py-1">{tr("عدد الأيام")}</th>
                  <th className="border border-black px-2 py-1 text-right">{tr("الأيام والحصص")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.groups.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center">{tr("لا سجلات في هذا النطاق.")}</td>
                  </tr>
                ) : (
                  summary.groups.map((group, index) => (
                    <tr key={group.studentId} className={index % 2 ? "bg-[#f3f4f6]" : undefined}>
                      <td className="border border-black px-1 text-center">{index + 1}</td>
                      <td className="border border-black px-2 text-right font-bold">{group.studentName}</td>
                      <td className="border border-black px-1 text-center">{group.classLabel}</td>
                      <td className="border border-black px-1 text-center font-semibold">{group.count}</td>
                      <td className="border border-black px-2 text-right align-top text-[12px]"><MonthDays days={group.days} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ))}
        {periodSummaries.length > 0 ? (
          <h3 className="mb-1 text-center text-[15px] font-semibold">{type === "all" ? "تفاصيل السجلات" : "تفاصيل الحصص"}</h3>
        ) : null}
        <table className="w-full border-collapse text-sm" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="bg-[#9aa0a6] text-white">
              <th className="border border-black px-1 py-1" style={{ width: "6%" }}>{tr("م")}</th>
              <th className="border border-black px-1 py-1 text-right" style={{ width: "16%" }}>{tr("اسم الطالب")}</th>
              <th className="border border-black px-1 py-1" style={{ width: "9%" }}>{tr("النوع")}</th>
              <th className="border border-black px-1 py-1 text-right" style={{ width: "32%" }}>{tr("المخالفة")}</th>
              <th className="border border-black px-1 py-1" style={{ width: "13%" }}>{tr("الحصة")}</th>
              <th className="border border-black px-1 py-1" style={{ width: "12%" }}>{tr("التاريخ")}</th>
              <th className="border border-black px-1 py-1" style={{ width: "12%" }}>{tr("الإجراء")}</th>
              {canEditRecords ? <th className="no-print w-24 whitespace-nowrap border border-black"></th> : null}
            </tr>
          </thead>
          <tbody>
            {notes.length === 0 ? (
              <tr>
                <td colSpan={canEditRecords ? 8 : 7} className="py-8 text-center">
                  لا توجد نتائج ضمن عوامل التصفية الحالية.
                </td>
              </tr>
            ) : (
              notes.map((note: any, index: number) => {
                const violation = note.behaviorTypeName || note.details || "—";
                const extra = note.behaviorTypeName && note.details && note.details !== note.behaviorTypeName && String(note.details).length <= 48 ? note.details : "";
                return (
                <tr key={note.id} className={index % 2 ? "bg-[#f3f4f6]" : undefined}>
                  <td className="border border-black px-1 text-center tabular-nums">{index + 1}</td>
                  <td className="border border-black px-1 text-right font-bold">
                    <span className="block text-[12px] leading-5">{note.studentName}</span>
                    <span className="block text-[10px] font-normal leading-4">
                      {classLabel(note.shortName, note.className)}
                    </span>
                  </td>
                  <td className="border border-black px-1 text-center text-[12px] font-semibold">{tr(typeShort(note.type))}</td>
                  <td className="border border-black px-1.5 text-right align-top">
                    <span className="block text-[13px] font-bold leading-5">{tr(violation)}</span>
                    {note.occurrence > 1 ? <span className="block text-[10px] leading-4">{occurrenceLabel(note.occurrence)}</span> : null}
                    {extra ? <span className="block text-[10px] leading-4">{extra}</span> : null}
                  </td>
                  <td className="border border-black px-1 text-center align-top">
                    <span className="block text-[12px] leading-5">{periodShort(note.periodKey, reportSchool.season, reportSchool.schedules)}</span>
                    {note.teacherSubject ? <span className="block text-[11px] leading-4">{note.teacherSubject}</span> : null}
                  </td>
                  <td className="border border-black px-1 text-center text-[11px] whitespace-nowrap">{compactDay(note.occurredAt || note.createdAt)}</td>
                  <td className="border border-black px-1 text-center text-[12px] font-semibold leading-5">{tr(briefAction(note.actionTaken, note.status))}</td>
                  {canEditRecords ? (
                    <td className="no-print whitespace-nowrap">
                      <NoteRecordTools note={note} />
                    </td>
                  ) : null}
                </tr>
                );
              })
            )}
          </tbody>
        </table>
        </>
        )}
        </div>

        <div className="no-print mt-3 flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={showTeacherSign} onChange={(e) => setShowTeacherSign(e.target.checked)} />
            إظهار المعلم
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={showCounselorSign} onChange={(e) => setShowCounselorSign(e.target.checked)} />
            إظهار اسم الوكيل
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={showPrincipalSign} onChange={(e) => setShowPrincipalSign(e.target.checked)} />
            إظهار اسم المدير
          </label>
        </div>
        {showTeacherSign || showCounselorSign || showPrincipalSign ? (
        <footer className={mode === "notes" || mode === "attend" ? "mt-8 flex items-start justify-between gap-6 text-sm" : "mt-6 grid grid-cols-3 gap-3 text-center text-[12px] leading-6"}>
          <div>
            {showTeacherSign ? (
              <>
                <p className="font-semibold">{tr("معلم المادة")}</p>
                <p>{query.data?.teacherName || staff.displayName}</p>
                <p>{tr("التوقيع: ………………")}</p>
              </>
            ) : null}
          </div>
          <div>
            {showCounselorSign ? (
              <>
                <p className="font-semibold">{counselor}</p>
                <p>{reportSchool.counselorName || "………………"}</p>
                <p>{tr("التوقيع: ………………")}</p>
              </>
            ) : null}
          </div>
          <div>
            {showPrincipalSign ? (
              <>
                <p className="font-semibold">{principal}</p>
                <p>{reportSchool.principalName || "………………"}</p>
                <p>{tr("التوقيع: ………………")}</p>
              </>
            ) : null}
          </div>
        </footer>
        ) : null}
      </article>
    </div>
  );
}
