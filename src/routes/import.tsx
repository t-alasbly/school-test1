import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppGate } from "@/components/app-gate";
import { SettingsBack } from "@/components/settings-back";
import { StaffManager } from "@/components/staff-manager";
import {
  AddStudentButton,
  DeleteStudentButton,
  EditStudentButton,
} from "@/components/student-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { bulkDeleteStudents, importStudents, importTeachers, listRoster } from "@/lib/school/api";
import { DEFAULT_TEACHER_PASSWORD } from "@/lib/school/constants";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/import")({ component: ImportPage });

type StudentMapping = {
  name: string;
  parentPhone: string;
  stageName: string;
  className: string;
};

type TeacherMapping = {
  name: string;
  phone: string;
  subject: string;
};

const STUDENT_FIELDS: { key: keyof StudentMapping; label: string }[] = [
  { key: "name", label: "اسم الطالب" },
  { key: "parentPhone", label: "جوال ولي الأمر" },
  { key: "stageName", label: "المرحلة" },
  { key: "className", label: "الفصل" },
];

const TEACHER_FIELDS: { key: keyof TeacherMapping; label: string }[] = [
  { key: "name", label: "اسم المعلم" },
  { key: "phone", label: "رقم الجوال" },
  { key: "subject", label: "المادة" },
];

type RosterStudent = {
  id: number;
  name: string;
  parentPhone: string;
  classId: number;
};

type RosterClass = {
  id: number;
  name: string;
  label: string;
  stageName: string;
  students: RosterStudent[];
};

type RosterStage = {
  id: number;
  name: string;
  classes: RosterClass[];
};

function ImportPage() {
  return (
    <AppGate>
      <ImportBody />
    </AppGate>
  );
}

function ImportBody() {
  const { staff } = useWorkspace();
  const [tab, setTab] = useState<"students" | "teachers">("students");

  if (staff.role !== "admin") {
    return <p className="text-fg-muted">الاستيراد متاح للإدارة فقط.</p>;
  }

  return (
    <div className="space-y-6">
      <header>
        <SettingsBack />
        <p className="text-sm text-fg-muted">
          كل البيانات المضافة ظاهرة هنا: الفصول والطلاب والمعلمون — مع التعديل والحذف والاستيراد من إكسل
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">البيانات والاستيراد</h1>
      </header>
      <div className="flex gap-2">
        <Button
          variant={tab === "students" ? "default" : "secondary"}
          onClick={() => setTab("students")}
        >
          الطلاب
        </Button>
        <Button
          variant={tab === "teachers" ? "default" : "secondary"}
          onClick={() => setTab("teachers")}
        >
          المعلمون
        </Button>
      </div>
      {tab === "students" ? <StudentImport /> : <TeacherImport />}
    </div>
  );
}

function StudentImport() {
  const queryClient = useQueryClient();
  const roster = useQuery({ queryKey: ["roster"], queryFn: () => listRoster() });
  const [q, setQ] = useState("");
  const [openStage, setOpenStage] = useState<Record<string, boolean>>({});
  const [showExcel, setShowExcel] = useState(false);

  const bulkMutation = useMutation({
    mutationFn: (input: { scope: "all" | "stage" | "class"; stageId?: number; classId?: number }) =>
      bulkDeleteStudents({ data: input }),
    onSuccess: (res) => {
      toast.success(`حُذف ${res.deleted} طالب`);
      void queryClient.invalidateQueries({ queryKey: ["roster"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
      void queryClient.invalidateQueries({ queryKey: ["class"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحذف"),
  });

  const stages = useMemo(() => {
    const list: RosterStage[] = roster.data?.stages ?? [];
    const term = q.trim();
    if (!term) return list;
    return list
      .map((stage: RosterStage) => ({
        ...stage,
        classes: stage.classes
          .map((cls: RosterClass) => ({
            ...cls,
            students: cls.students.filter(
              (s: RosterStudent) => s.name.includes(term) || s.parentPhone.includes(term),
            ),
          }))
          .filter((cls: RosterClass) => cls.students.length > 0),
      }))
      .filter((stage: RosterStage) => stage.classes.length > 0);
  }, [roster.data, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-muted" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث باسم الطالب أو جوال ولي الأمر"
            className="pr-10"
          />
        </div>
        <Button variant="secondary" onClick={() => setShowExcel((v) => !v)}>
          <Upload className="size-4" />
          {showExcel ? "إخفاء ملف الإكسل" : "استيراد من إكسل"}
        </Button>
      </div>
      {showExcel ? (
        <StudentExcelForm
          onImported={() => {
            void queryClient.invalidateQueries({ queryKey: ["roster"] });
            void queryClient.invalidateQueries({ queryKey: ["workspace"] });
            setShowExcel(false);
          }}
        />
      ) : null}

      {roster.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : roster.isError ? (
        <p className="text-danger">تعذر تحميل قائمة الطلاب.</p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-fg-muted">
              {roster.data?.studentCount ?? 0} طالب في {roster.data?.classCount ?? 0} فصل
            </p>
            {(roster.data?.studentCount ?? 0) > 0 ? (
              <Button
                variant="danger"
                size="sm"
                disabled={bulkMutation.isPending}
                onClick={() => {
                  const n = roster.data?.studentCount ?? 0;
                  if (window.confirm(`حذف جميع الطلاب (${n}) من كل المراحل؟ لا يمكن التراجع.`)) {
                    bulkMutation.mutate({ scope: "all" });
                  }
                }}
              >
                حذف جميع الطلاب
              </Button>
            ) : null}
          </div>
          {stages.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-fg-muted">
                {q.trim()
                  ? "لا نتائج مطابقة للبحث."
                  : "لم يُضف طلاب بعد. ارفع ملف إكسل أو أضف طالبًا داخل فصل."}
              </CardContent>
            </Card>
          ) : null}
          {stages.map((stage: RosterStage) => {
            const open = openStage[stage.name] !== false;
            const count = stage.classes.reduce((n: number, c: RosterClass) => n + c.students.length, 0);
            return (
              <section key={stage.id ?? stage.name} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] bg-muted px-3 py-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center justify-between text-right"
                  onClick={() =>
                    setOpenStage((prev) => ({ ...prev, [stage.name]: !open }))
                  }
                >
                  <span className="font-semibold">{stage.name}</span>
                  <span className="flex items-center gap-2 text-sm text-fg-muted">
                    {count} طالب · {stage.classes.length} فصل
                    <ChevronDown className={cn("size-4 transition", open ? "rotate-180" : "")} />
                  </span>
                </button>
                {count > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    disabled={bulkMutation.isPending}
                    onClick={() => {
                      if (window.confirm(`حذف ${count} طالب في «${stage.name}»؟ لا يمكن التراجع.`)) {
                        bulkMutation.mutate({ scope: "stage", stageId: stage.id });
                      }
                    }}
                  >
                    حذف المرحلة
                  </Button>
                ) : null}
                </div>
                {open
                  ? stage.classes.map((cls: RosterClass) => (
                      <Card key={cls.id}>
                        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
                          <div>
                            <CardTitle className="text-lg">{cls.label}</CardTitle>
                            <p className="text-xs text-fg-muted">{cls.stageName}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge>{cls.students.length} طالب</Badge>
                            <AddStudentButton classId={cls.id} />
                            {cls.students.length > 0 ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="danger"
                                disabled={bulkMutation.isPending}
                                onClick={() => {
                                  if (window.confirm(`حذف ${cls.students.length} طالب في «${cls.label}»؟ لا يمكن التراجع.`)) {
                                    bulkMutation.mutate({ scope: "class", classId: cls.id });
                                  }
                                }}
                              >
                                حذف الفصل
                              </Button>
                            ) : null}
                          </div>
                        </CardHeader>
                        <CardContent className="p-0">
                          {cls.students.length === 0 ? (
                            <p className="px-4 py-6 text-sm text-fg-muted">لا طلاب في هذا الفصل بعد.</p>
                          ) : (
                            <ul className="divide-y divide-border">
                              {cls.students.map((student: RosterStudent) => (
                                <li
                                  key={student.id}
                                  className="flex flex-wrap items-center gap-2 px-4 py-3"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium">{student.name}</p>
                                    <p className="text-xs text-fg-subtle" dir="ltr">
                                      {student.parentPhone || "بدون جوال ولي الأمر"}
                                    </p>
                                  </div>
                                  <EditStudentButton student={student} showLabel />
                                  <DeleteStudentButton student={student} />
                                </li>
                              ))}
                            </ul>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StudentExcelForm({ onImported }: { onImported: () => void }) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<StudentMapping>({
    name: "",
    parentPhone: "",
    stageName: "",
    className: "",
  });

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof importStudents>[0]["data"]["rows"]) =>
      importStudents({ data: { rows: payload } }),
    onSuccess: (result) => {
      toast.success(
        `تم الاستيراد: ${result.inserted} جديد، ${result.updated} محدّث، ${result.skipped} متجاوز`,
      );
      onImported();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الاستيراد"),
  });

  async function onFile(file: File | undefined) {
    const parsed = await readSheet(file);
    if (!parsed) return;
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping({
      name: guess(parsed.headers, ["اسم", "name", "الطالب"]),
      parentPhone: guess(parsed.headers, ["جوال", "هاتف", "phone", "واتس", "ولي"]),
      stageName: guess(parsed.headers, ["مرحلة", "صف", "stage"]),
      className: guess(parsed.headers, ["فصل", "شعبة", "class"]),
    });
  }

  function mappedRows() {
    const index = {
      name: headers.indexOf(mapping.name),
      parentPhone: headers.indexOf(mapping.parentPhone),
      stageName: headers.indexOf(mapping.stageName),
      className: headers.indexOf(mapping.className),
    };
    return rows.map((row) => ({
      name: index.name >= 0 ? row[index.name] ?? "" : "",
      parentPhone: index.parentPhone >= 0 ? row[index.parentPhone] ?? "" : "",
      stageName: index.stageName >= 0 ? row[index.stageName] ?? "" : "",
      className: index.className >= 0 ? row[index.className] ?? "" : "",
    }));
  }

  const preview = mappedRows().slice(0, 6);

  return (
    <div className="space-y-4">
      <DropZone
        hint="الأعمدة المتوقعة: الاسم، جوال ولي الأمر، المرحلة، الفصل"
        onFile={onFile}
      />
      {headers.length > 0 ? (
        <div className="space-y-4 rounded-[var(--radius-lg)] border border-border bg-card p-4">
          <h2 className="font-semibold">تعيين الأعمدة</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {STUDENT_FIELDS.map((field) => (
              <ColumnSelect
                key={field.key}
                id={field.key}
                label={field.label}
                value={mapping[field.key]}
                headers={headers}
                onChange={(value) => setMapping((prev) => ({ ...prev, [field.key]: value }))}
              />
            ))}
          </div>
          <PreviewTable
            labels={STUDENT_FIELDS.map((f) => f.label)}
            rows={preview.map((row) => [row.name, row.parentPhone, row.stageName, row.className])}
          />
          <p className="text-sm text-fg-muted">{rows.length} صف جاهز للاستيراد</p>
          <Button
            disabled={mutation.isPending || !mapping.name || !mapping.stageName || !mapping.className}
            onClick={() => mutation.mutate(mappedRows())}
          >
            {mutation.isPending ? "جارٍ الحفظ…" : "اعتماد استيراد الطلاب"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TeacherImport() {
  const queryClient = useQueryClient();
  const [showExcel, setShowExcel] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">أضف معلمًا أو عدّل بياناته، أو ارفع ملف إكسل دفعة واحدة.</p>
        <Button variant="secondary" onClick={() => setShowExcel((v) => !v)}>
          <Upload className="size-4" />
          {showExcel ? "إخفاء ملف الإكسل" : "استيراد معلمين من إكسل"}
        </Button>
      </div>
      {showExcel ? (
        <TeacherExcelForm
          onImported={() => {
            void queryClient.invalidateQueries({ queryKey: ["staff"] });
            setShowExcel(false);
          }}
        />
      ) : null}
      <StaffManager compact />
    </div>
  );
}

function TeacherExcelForm({ onImported }: { onImported: () => void }) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<TeacherMapping>({
    name: "",
    phone: "",
    subject: "",
  });

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof importTeachers>[0]["data"]["rows"]) =>
      importTeachers({ data: { rows: payload } }),
    onSuccess: (result) => {
      toast.success(
        `تم استيراد المعلمين: ${result.inserted} جديد، ${result.updated} محدّث، ${result.skipped} متجاوز. كلمة المرور ${DEFAULT_TEACHER_PASSWORD}`,
      );
      onImported();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الاستيراد"),
  });

  async function onFile(file: File | undefined) {
    const parsed = await readSheet(file);
    if (!parsed) return;
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping({
      name: guess(parsed.headers, ["اسم", "name", "معلم"]),
      phone: guess(parsed.headers, ["جوال", "هاتف", "phone", "رقم"]),
      subject: guess(parsed.headers, ["مادة", "تخصص", "subject"]),
    });
  }

  function mappedRows() {
    const index = {
      name: headers.indexOf(mapping.name),
      phone: headers.indexOf(mapping.phone),
      subject: headers.indexOf(mapping.subject),
    };
    return rows.map((row) => ({
      name: index.name >= 0 ? row[index.name] ?? "" : "",
      phone: index.phone >= 0 ? row[index.phone] ?? "" : "",
      subject: index.subject >= 0 ? row[index.subject] ?? "" : "",
    }));
  }

  const preview = mappedRows().slice(0, 6);

  return (
    <div className="space-y-4">
      <DropZone
        hint={`الأعمدة: اسم المعلم، رقم الجوال، المادة. الجوال هو اسم المستخدم وكلمة المرور ${DEFAULT_TEACHER_PASSWORD}`}
        onFile={onFile}
      />
      {headers.length > 0 ? (
        <div className="space-y-4 rounded-[var(--radius-lg)] border border-border bg-card p-4">
          <h2 className="font-semibold">تعيين الأعمدة</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {TEACHER_FIELDS.map((field) => (
              <ColumnSelect
                key={field.key}
                id={field.key}
                label={field.label}
                value={mapping[field.key]}
                headers={headers}
                onChange={(value) => setMapping((prev) => ({ ...prev, [field.key]: value }))}
              />
            ))}
          </div>
          <PreviewTable
            labels={TEACHER_FIELDS.map((f) => f.label)}
            rows={preview.map((row) => [row.name, row.phone, row.subject])}
          />
          <p className="text-sm text-fg-muted">
            {rows.length} معلم — الدخول برقم الجوال وكلمة المرور {DEFAULT_TEACHER_PASSWORD}
          </p>
          <Button
            disabled={mutation.isPending || !mapping.name || !mapping.phone}
            onClick={() => mutation.mutate(mappedRows())}
          >
            {mutation.isPending ? "جارٍ الحفظ…" : "اعتماد استيراد المعلمين"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function DropZone({
  hint,
  onFile,
}: {
  hint: string;
  onFile: (file: File | undefined) => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border bg-card px-4 text-center",
      )}
    >
      <span className="font-medium">اختر ملف .xlsx أو .xls</span>
      <span className="mt-1 text-sm text-fg-muted">{hint}</span>
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </label>
  );
}

function ColumnSelect({
  id,
  label,
  value,
  headers,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  headers: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— غير معيّن —</option>
        {headers.map((header) => (
          <option key={header} value={header}>
            {header || "(بدون عنوان)"}
          </option>
        ))}
      </Select>
    </div>
  );
}

function PreviewTable({ labels, rows }: { labels: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted">
            {labels.map((label) => (
              <th key={label} className="border border-border px-2 py-2 text-right font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="border border-border px-2 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function readSheet(file: File | undefined) {
  if (!file) return null;
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet) {
    toast.error("الملف لا يحتوي على ورقة عمل");
    return null;
  }
  const json = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: "",
  });
  const headers = (json[0] ?? []).map((cell) => String(cell ?? "").trim());
  const rows = json
    .slice(1)
    .map((row) => headers.map((_, i) => String(row[i] ?? "").trim()))
    .filter((row) => row.some((cell) => cell));
  return { headers, rows };
}

function guess(headers: string[], needles: string[]) {
  const found = headers.find((header) =>
    needles.some((needle) => header.toLowerCase().includes(needle.toLowerCase())),
  );
  return found ?? "";
}
