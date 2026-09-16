import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { OfficialLetterhead } from "@/components/print-forms";
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
  const [mode, setMode] = useState<"notes" | "messages" | "names">("notes");
  const [rosterTitle, setRosterTitle] = useState("بيانات الطلاب");
  const [showPhone, setShowPhone] = useState(false);
  const [showClass, setShowClass] = useState(false);
  const [showStage, setShowStage] = useState(false);
  const [extraCols, setExtraCols] = useState<ExtraCol[]>([]);
  const [colWidths, setColWidths] = useState({ ...DEFAULT_COL_MM });
  const [colOrder, setColOrder] = useState<string[]>(["seq", "name"]);
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
    enabled: mode === "messages",
  });
  const messages = messagesQuery.data?.messages ?? [];
  const scopedToTeacher = query.data?.scopedToTeacher;
  const notes = query.data?.notes ?? [];
  const reportSchool = query.data?.school ?? school;

  const selectedClass = classes.find((c) => String(c.id) === classId);
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
  };
  const nameCols = visibleColumns(currentPayload);

  function applyTemplate(payload: Partial<RosterPayload> | undefined, id?: number) {
    if (!payload) return;
    setRosterTitle(payload.title || "بيانات الطلاب");
    setShowPhone(Boolean(payload.showPhone));
    setShowClass(Boolean(payload.showClass));
    setShowStage(Boolean(payload.showStage));
    const extras: ExtraCol[] = Array.isArray(payload.extraCols)
      ? payload.extraCols.map((c, i) => ({
          id: String(c.id || `c${i + 1}`),
          title: String(c.title ?? ""),
          width: Number(c.width) > 0 ? Number(c.width) : 20,
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
    XLSX.utils.book_append_sheet(wb, ws, "كشف الأسماء");
    XLSX.writeFile(wb, `${(rosterTitle.trim() || "كشف-الاسماء").replace(/[\\/:*?"<>|]+/g, "-")}.xlsx`);
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
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر حفظ القالب"),
  });
  const deleteTpl = useMutation({
    mutationFn: (id: number) => deleteRosterTemplate({ data: { id } }),
    onSuccess: (_res, id) => {
      toast.success("حُذف القالب");
      setActiveTemplateId((cur) => (cur === id ? null : cur));
      void queryClient.invalidateQueries({ queryKey: ["roster-templates"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحذف"),
  });
  const publishTpl = useMutation({
    mutationFn: (id: number) => publishRosterTemplate({ data: { id } }),
    onSuccess: () => {
      toast.success("عُمّم القالب على كل المعلمين");
      void queryClient.invalidateQueries({ queryKey: ["roster-templates"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر التعميم"),
  });

  const principal = principalTitle(reportSchool.leadershipGender);
  const counselor = counselorTitle(reportSchool.leadershipGender);
  const tableMm = nameCols.reduce((n, c) => n + c.width, 0);

  return (
    <div className="space-y-6">
      <header className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-fg-muted">
            مخالفات ورسائل أولياء الأمور، أو كشف أسماء لفصل أو صف كامل
          </p>
          <h1 className="text-xl font-semibold tracking-tight">التقارير</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid grid-cols-3 overflow-hidden rounded-[var(--radius-sm)] border border-border">
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
          </div>
          <Button
            onClick={handlePrint}
            disabled={mode === "messages" ? messagesQuery.isPending : query.isPending}
          >
            <Printer className="size-4" />
            {mode === "messages" ? "طباعة الرسائل" : mode === "names" ? "طباعة كشف الأسماء" : "طباعة الكشف"}
          </Button>
        </div>
      </header>

      <form className="no-print grid gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="stage">المرحلة</Label>
          <Select
            id="stage"
            value={stageId}
            onChange={(e) => {
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
            onChange={(e) => {
              setClassId(e.target.value);
              setStudentId("");
            }}
          >
            <option value="">الكل</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        {mode !== "names" ? (
        <div className="space-y-1.5">
          <Label htmlFor="student">اسم الطالب</Label>
          <Select id="student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">الكل</option>
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
          <Label htmlFor="type">نوع الملاحظة</Label>
          <Select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as "all" | NoteType)}
          >
            <option value="all">الكل</option>
            {NOTE_TYPES.map((t) => (
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
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">إلى تاريخ</Label>
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
        />
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
              <p className="text-[11px] font-semibold text-[#00857c]">الصف / الفصل</p>
              <p className="text-[13px] font-medium leading-5">{classLine}</p>
            </div>
            <div className="px-1.5 py-1.5">
              <p className="text-[11px] font-semibold text-[#00857c]">عدد الطلاب</p>
              <p className="text-[13px] font-medium leading-5 tabular-nums">{students.length}</p>
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
                <td className="py-2.5 text-[18px] font-semibold">{selectedStudent.name}</td>
                <td className="py-2.5 text-[16px] font-semibold">{classLine}</td>
              </tr>
            </tbody>
          </table>
        ) : (
        <div className="official-meta mb-2 grid grid-cols-2 overflow-hidden rounded-sm border border-black text-center sm:grid-cols-4">
          {[
            ["الصف / المرحلة", classLine],
            ["اسم الطالب", "جميع الطلاب"],
            ["نوع الملاحظة", mode === "messages" ? "رسائل أولياء الأمور" : typeLine],
            ["الفترة", rangeLine],
          ].map(([label, value]) => (
            <div key={label} className="border-l border-black px-1.5 py-1.5 last:border-l-0">
              <p className="text-[11px] font-semibold text-[#00857c]">{label}</p>
              <p className="text-[13px] font-medium leading-5">{value}</p>
            </div>
          ))}
        </div>
        )}

        {mode === "names" ? null : mode === "notes" ? (
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
            سجل الرسائل المرسلة إلى أولياء الأمور — عدد السجلات: {messages.length}
          </p>
        )}

        <div className="overflow-x-auto">
        {mode === "names" ? (
        <table className="official-table official-report-table" style={{ tableLayout: "fixed", width: `${tableMm}mm` }}>
          <thead>
            <tr>
              {nameCols.map((col) => (
                <th key={col.id} style={{ width: `${col.width}mm` }}>{col.title}</th>
              ))}
            </tr>
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
                <tr key={s.id}>
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
                      {nameCell(col, s, index)}
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
        <table className="official-table official-report-table">
          <thead>
            <tr>
              <th className="w-8">م</th>
              <th>اسم الطالب</th>
              <th>النوع / المخالفة</th>
              <th>الحصة · المادة</th>
              <th>التاريخ</th>
              <th>الحالة / الإجراء</th>
              {canEditRecords ? <th className="no-print w-24 whitespace-nowrap"></th> : null}
            </tr>
          </thead>
          <tbody>
            {notes.length === 0 ? (
              <tr>
                <td colSpan={canEditRecords ? 7 : 6} className="py-8 text-center">
                  لا توجد نتائج ضمن عوامل التصفية الحالية.
                </td>
              </tr>
            ) : (
              notes.map((note: any, index: number) => (
                <tr key={note.id}>
                  <td className="tabular-nums">{index + 1}</td>
                  <td className="text-right">
                    <span className="block font-medium leading-5">{note.studentName}</span>
                    <span className="block text-[10px] leading-4">
                      {classLabel(note.shortName, note.className)}
                    </span>
                  </td>
                  <td className="text-right">
                    <span className="block leading-5">{NOTE_META[note.type as NoteType].label}</span>
                    {note.behaviorTypeName ? (
                      <span className="block text-[10px] leading-4">
                        {note.behaviorTypeName}
                        {note.occurrence > 1 ? ` · ${occurrenceLabel(note.occurrence)}` : ""}
                      </span>
                    ) : note.details ? (
                      <span className="block text-[10px] leading-4">{note.details}</span>
                    ) : null}
                  </td>
                  <td>
                    <span className="block leading-5">
                      {periodShort(note.periodKey, reportSchool.season, reportSchool.schedules)}
                    </span>
                    <span className="block text-[10px] leading-4">
                      {note.teacherSubject || note.teacherName || "—"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">{formatDay(note.createdAt)}</td>
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
          {mode === "messages" ? messages.length : mode === "names" ? students.length : notes.length} · طُبع في {todayLabel()}
          {scopedToTeacher && mode === "notes" ? " · ملاحظات هذا المعلم فقط" : ""}
        </p>

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
