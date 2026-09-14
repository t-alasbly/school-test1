import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppGate } from "@/components/app-gate";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { importStudents, importTeachers } from "@/lib/school/api";
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
        <p className="text-sm text-fg-muted">ارفع ملف إكسل ثم طابق الأعمدة مع حقول النظام</p>
        <h1 className="text-3xl font-semibold tracking-tight">الاستيراد</h1>
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
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
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
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
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
