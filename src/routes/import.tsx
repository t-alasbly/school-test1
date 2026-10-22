import { createFileRoute } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeftRight, CheckCircle2, ChevronDown, Search, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppGate } from "@/components/app-gate";
import { SettingsBack } from "@/components/settings-back";
import { PageHelp } from "@/components/page-help";
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
import { bulkDeleteStudents, getStudentRecordCounts, importStudents, importTeachers, listRoster, mergeDuplicateStudents, previewNoorPdf } from "@/lib/school/api";
import { DEFAULT_TEACHER_PASSWORD } from "@/lib/school/constants";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/import")({ component: ImportPage });

type StudentMapping = {
  name: string;
  parentPhone: string;
  parentPhone2: string;
  workPhone: string;
  nationalId: string;
  nationality: string;
  stageName: string;
  className: string;
};

type TeacherMapping = {
  name: string;
  phone: string;
  subject: string;
};

const STUDENT_FIELDS: { key: keyof StudentMapping; label: string }[] = [
  { key: "name", label: tr("اسم الطالب") },
  { key: "nationalId", label: tr("السجل المدني") },
  { key: "parentPhone", label: tr("جوال الطالب / ولي الأمر") },
  { key: "parentPhone2", label: tr("رقم المنزل") },
  { key: "workPhone", label: tr("رقم العمل") },
  { key: "nationality", label: tr("الجنسية") },
  { key: "stageName", label: tr("المرحلة") },
  { key: "className", label: tr("الفصل") },
];

const TEACHER_FIELDS: { key: keyof TeacherMapping; label: string }[] = [
  { key: "name", label: tr("اسم المعلم") },
  { key: "phone", label: tr("رقم الجوال") },
  { key: "subject", label: tr("المادة") },
];

type RosterStudent = {
  id: number;
  name: string;
  parentPhone: string;
  parentPhone2?: string;
  workPhone?: string;
  nationalId?: string;
  nationality?: string;
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

type StudentCounts = { notes: number; attendance: number; evals: number };

type DuplicatePair = {
  pairId: string;
  stageName: string;
  classLabel: string;
  keep: RosterStudent;
  remove: RosterStudent;
  keepCounts: StudentCounts;
  removeCounts: StudentCounts;
  reason: string;
  selected: boolean;
};

function normalizeArabicName(raw: string) {
  return String(raw ?? "")
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/عبد\s+/g, "عبد")
    .replace(/ابو\s+/g, "ابو")
    .replace(/آل\s+/g, "ال")
    .replace(/بن\s+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function checkNameSimilarity(name1: string, name2: string) {
  const n1 = normalizeArabicName(name1);
  const n2 = normalizeArabicName(name2);
  if (!n1 || !n2) return { isSimilar: false, reason: "" };
  if (n1 === n2) return { isSimilar: true, reason: "تطابق تام في الاسم" };
  const w1 = n1.split(" ").filter(Boolean);
  const w2 = n2.split(" ").filter(Boolean);
  if (w1.length >= 3 && w2.length >= 3) {
    if (w1[0] === w2[0] && w1[1] === w2[1] && w1[w1.length - 1] === w2[w2.length - 1]) {
      return { isSimilar: true, reason: "تطابق الاسم الأول والأب والعائلة" };
    }
    const shorter = w1.length <= w2.length ? w1 : w2;
    const longer = w1.length <= w2.length ? w2 : w1;
    let idx = 0;
    for (const word of longer) if (word === shorter[idx]) idx += 1;
    if (idx === shorter.length) return { isSimilar: true, reason: "أحد الاسمين مختصر للآخر" };
  }
  return { isSimilar: false, reason: "" };
}

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
    return <p className="text-fg-muted">{tr("الاستيراد متاح للإدارة فقط.")}</p>;
  }

  return (
    <div className="space-y-6">
      <header>
        <SettingsBack />
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          {tr("البيانات والاستيراد")}
          <PageHelp text={tr("كل البيانات المضافة ظاهرة هنا: الفصول والطلاب والمعلمون — مع التعديل والحذف والاستيراد من إكسل")} />
        </h1>
      </header>
      <div className="flex gap-2">
        <Button
          variant={tab === "students" ? "default" : "secondary"}
          onClick={() => setTab("students")}
        >
          {tr("الطلاب")}
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
  const [showExistingAudit, setShowExistingAudit] = useState(false);
  const [duplicatePairs, setDuplicatePairs] = useState<DuplicatePair[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  const bulkMutation = useMutation({
    mutationFn: (input: { scope: "all" | "stage" | "class"; stageId?: number; classId?: number }) =>
      bulkDeleteStudents({ data: input }),
    onSuccess: (res) => {
      toast.success(`حُذف ${res.deleted} طالب`);
      void queryClient.invalidateQueries({ queryKey: ["roster"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
      void queryClient.invalidateQueries({ queryKey: ["class"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحذف")),
  });

  const mergeMutation = useMutation({
    mutationFn: (pairs: { keepId: number; removeId: number }[]) => mergeDuplicateStudents({ data: { pairs } }),
    onSuccess: (res, variables) => {
      const removedIds = new Set(variables.map((pair) => pair.removeId));
      setDuplicatePairs((prev) => prev.filter((item) => !removedIds.has(item.remove.id)));
      toast.success(`تم دمج ${res.merged} طالب ونقل الملاحظات ثم حذف المكرر.`);
      void queryClient.invalidateQueries({ queryKey: ["roster"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
      void queryClient.invalidateQueries({ queryKey: ["class"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر دمج السجلات المكررة")),
  });

  const scanExistingDuplicates = useCallback(async () => {
    const allStages: RosterStage[] = roster.data?.stages ?? [];
    if (!allStages.length) {
      toast.warning("لا توجد بيانات طلاب لفحصها.");
      return;
    }
    setIsScanning(true);
    let countsMap: Record<number, StudentCounts> = {};
    try {
      const res = await getStudentRecordCounts();
      countsMap = (res?.counts ?? {}) as Record<number, StudentCounts>;
    } catch {
      countsMap = {};
    } finally {
      setIsScanning(false);
    }
    const foundPairs: DuplicatePair[] = [];
    for (const stage of allStages) {
      for (const cls of stage.classes) {
        const students = cls.students ?? [];
        const usedIds = new Set<number>();
        for (let i = 0; i < students.length; i += 1) {
          const stA = students[i];
          if (!stA || usedIds.has(stA.id)) continue;
          for (let j = i + 1; j < students.length; j += 1) {
            const stB = students[j];
            if (!stB || usedIds.has(stB.id)) continue;
            const sameNationalId = Boolean(stA.nationalId && stB.nationalId) && stA.nationalId?.trim() === stB.nationalId?.trim();
            const sim = checkNameSimilarity(stA.name, stB.name);
            if (!sameNationalId && !sim.isSimilar) continue;
            usedIds.add(stB.id);
            const cA = countsMap[stA.id] ?? { notes: 0, attendance: 0, evals: 0 };
            const cB = countsMap[stB.id] ?? { notes: 0, attendance: 0, evals: 0 };
            const score = (counts: StudentCounts) => counts.notes * 100 + counts.attendance * 20 + counts.evals * 10;
            let keep = stA;
            let remove = stB;
            let keepCounts = cA;
            let removeCounts = cB;
            if (score(cB) > score(cA)) {
              keep = stB;
              remove = stA;
              keepCounts = cB;
              removeCounts = cA;
            } else if (score(cA) === score(cB)) {
              const wordsA = stA.name.trim().split(/\s+/).length;
              const wordsB = stB.name.trim().split(/\s+/).length;
              if (wordsB > wordsA || (wordsB === wordsA && stB.id < stA.id)) {
                keep = stB;
                remove = stA;
                keepCounts = cB;
                removeCounts = cA;
              }
            }
            foundPairs.push({
              pairId: `${keep.id}_${remove.id}`,
              stageName: stage.name,
              classLabel: cls.label,
              keep,
              remove,
              keepCounts,
              removeCounts,
              reason: sameNationalId ? "تطابق السجل المدني" : sim.reason,
              selected: true,
            });
          }
        }
      }
    }
    setDuplicatePairs(foundPairs);
    setShowExistingAudit(true);
    if (foundPairs.length) toast.info(`تم العثور على ${foundPairs.length} حالة تكرار.`);
    else toast.success("لم يُعثر على أسماء مكررة في الفصول الحالية.");
  }, [roster.data]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "q") {
        event.preventDefault();
        void scanExistingDuplicates();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scanExistingDuplicates]);

  function swapPair(pairId: string) {
    setDuplicatePairs((prev) =>
      prev.map((item) =>
        item.pairId === pairId
          ? { ...item, keep: item.remove, remove: item.keep, keepCounts: item.removeCounts, removeCounts: item.keepCounts }
          : item,
      ),
    );
  }

  function togglePairSelection(pairId: string) {
    setDuplicatePairs((prev) => prev.map((item) => (item.pairId === pairId ? { ...item, selected: !item.selected } : item)));
  }

  const selectedPairs = duplicatePairs.filter((pair) => pair.selected);

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
            placeholder={tr("بحث باسم الطالب أو جوال ولي الأمر")}
            className="pr-10"
          />
        </div>
        <Button variant="secondary" disabled={isScanning} onClick={() => void scanExistingDuplicates()}>
          <AlertTriangle className="size-4" />
          {isScanning ? "جارٍ الفحص…" : "تدقيق الأسماء المكررة"}
        </Button>
        <Button variant="secondary" onClick={() => setShowExcel((v) => !v)}>
          <Upload className="size-4" />
          {showExcel ? tr("إخفاء ملف الإكسل") : tr("استيراد من إكسل")}
        </Button>
      </div>
      {showExistingAudit ? (
        <Card className="border-amber-500/40">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="size-5 text-amber-600" />
                تدقيق الأسماء المكررة ({duplicatePairs.length})
              </CardTitle>
              <p className="mt-1 text-xs text-fg-muted">
                يُبقى صاحب الملاحظات الأكثر، وتُنقل إليه الملاحظات والغياب والتقييمات ثم يُحذف المكرر.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedPairs.length ? (
                <Button
                  disabled={mergeMutation.isPending}
                  onClick={() => {
                    if (!window.confirm(`دمج ${selectedPairs.length} وحذف المكرر؟ لا يمكن التراجع.`)) return;
                    mergeMutation.mutate(selectedPairs.map((pair) => ({ keepId: pair.keep.id, removeId: pair.remove.id })));
                  }}
                >
                  <CheckCircle2 className="size-4" />
                  {mergeMutation.isPending ? "جارٍ الدمج…" : `دمج المحدد (${selectedPairs.length})`}
                </Button>
              ) : null}
              <Button variant="secondary" size="sm" onClick={() => setShowExistingAudit(false)}>إغلاق</Button>
            </div>
          </CardHeader>
          <CardContent>
            {duplicatePairs.length === 0 ? (
              <p className="py-4 text-center text-sm text-fg-muted">لا توجد أسماء مكررة.</p>
            ) : (
              <div className="max-h-96 overflow-auto rounded-[var(--radius-md)] border border-border">
                <table className="w-full text-right text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr>
                      <th className="border border-border p-2">تحديد</th>
                      <th className="border border-border p-2">الفصل</th>
                      <th className="border border-border p-2">يبقى</th>
                      <th className="border border-border p-2">تبديل</th>
                      <th className="border border-border p-2">يُحذف</th>
                      <th className="border border-border p-2">السبب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duplicatePairs.map((pair) => (
                      <tr key={pair.pairId}>
                        <td className="border border-border p-2 text-center">
                          <input type="checkbox" className="size-4 accent-primary" checked={pair.selected} onChange={() => togglePairSelection(pair.pairId)} />
                        </td>
                        <td className="border border-border p-2">{pair.stageName} · {pair.classLabel}</td>
                        <td className="border border-border p-2 font-semibold text-primary">
                          {pair.keep.name}
                          <span className="mt-1 block font-normal text-fg-muted">ملاحظات {pair.keepCounts.notes} · غياب {pair.keepCounts.attendance}</span>
                        </td>
                        <td className="border border-border p-2 text-center">
                          <Button type="button" size="sm" variant="secondary" onClick={() => swapPair(pair.pairId)}>
                            <ArrowLeftRight className="size-3.5" />
                          </Button>
                        </td>
                        <td className="border border-border p-2 text-danger">
                          {pair.remove.name}
                          <span className="mt-1 block font-normal text-fg-muted">ملاحظات {pair.removeCounts.notes} · غياب {pair.removeCounts.attendance}</span>
                        </td>
                        <td className="border border-border p-2 text-fg-muted">{pair.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
      <NoorImport
        onImported={() => {
          void queryClient.invalidateQueries({ queryKey: ["roster"] });
          void queryClient.invalidateQueries({ queryKey: ["workspace"] });
        }}
      />
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
        <p className="text-danger">{tr("تعذر تحميل قائمة الطلاب.")}</p>
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
                  ? tr("لا نتائج مطابقة للبحث.")
                  : tr("لم يُضف طلاب بعد. ارفع ملف إكسل أو أضف طالبًا داخل فصل.")}
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
                            <p className="px-4 py-6 text-sm text-fg-muted">{tr("لا طلاب في هذا الفصل بعد.")}</p>
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
                                      {[student.parentPhone, student.parentPhone2, student.workPhone].filter(Boolean).join(" · ") || tr("بدون أرقام")}
                                      {student.nationalId ? ` · ${student.nationalId}` : ""}
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

function NoorImport({ onImported }: { onImported: () => void }) {
  const [preview, setPreview] = useState<{
    total: number;
    withPhone: number;
    withId: number;
    classes: { label: string; count: number }[];
    rows: {
      name: string;
      parentPhone: string;
      parentPhone2: string;
      workPhone: string;
      nationalId: string;
      nationality: string;
      stageName: string;
      className: string;
    }[];
  } | null>(null);
  const [fileName, setFileName] = useState("");

  const read = useMutation({
    mutationFn: (pdfBase64: string) => previewNoorPdf({ data: { pdfBase64 } }),
    onSuccess: (data) => setPreview(data),
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر قراءة الكشف")),
  });

  const commit = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error("اختر ملف الكشف أولًا");
      return importStudents({
        data: { rows: preview.rows, replaceEmpty: false, preserveRecords: true },
      });
    },
    onSuccess: (result) => {
      const conflict = result.ambiguous
        ? `، وتُرك ${result.ambiguous} لأن السجل المدني لا يطابق الاسم`
        : "";
      toast.success(
        `تم سحب الكشف: ${result.updated} محدّث، ${result.inserted} جديد، ${result.skipped} متجاوز${conflict}. المخالفات المسجّلة بقيت كما هي.`,
      );
      setPreview(null);
      setFileName("");
      onImported();
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر سحب البيانات")),
  });

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setPreview(null);
    const dataUrl = await file.arrayBuffer();
    const bytes = new Uint8Array(dataUrl);
    let binary = "";
    const chunk = 0x2000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    read.mutate(btoa(binary));
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg">سحب كشف الطلاب من نور</CardTitle>
        <p className="text-sm text-fg-muted">
          ارفع ملف PDF «كشف الطلاب» كما يخرجه نور. يُحدَّث الطالب في مكانه بالسجل المدني، ثم بالاسم.
          المخالفات والملاحظات والرسائل لا تُحذف ولا تُنقل، ومن ليس في الملف يبقى كما هو.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border bg-bg-elevated px-4 text-center">
          <span className="font-medium">{fileName || "اختر ملف PDF"}</span>
          <span className="mt-1 text-sm text-fg-muted">السجل المدني هو المفتاح. تُحفظ ثلاثة أرقام: جوال الطالب، المنزل، والعمل.</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
        {read.isPending ? <Skeleton className="h-24 rounded-[var(--radius-lg)]" /> : null}
        {preview ? (
          <div className="space-y-3">
            <p className="text-sm">
              {preview.total} طالب مستمر · {preview.withId} بسجل مدني · {preview.withPhone} بجوال
            </p>
            <div className="flex flex-wrap gap-2">
              {preview.classes.map((item) => (
                <Badge key={item.label}>
                  {item.label} · {item.count}
                </Badge>
              ))}
            </div>
            <PreviewTable
              labels={["الاسم", "السجل", "الجوال", "المنزل", "العمل", "الجنسية", "الصف", "الفصل"]}
              rows={preview.rows.slice(0, 5).map((row) => [
                row.name,
                row.nationalId,
                row.parentPhone,
                row.parentPhone2,
                row.workPhone,
                row.nationality,
                row.stageName,
                row.className,
              ])}
            />
            <Button disabled={commit.isPending} onClick={() => commit.mutate()}>
              {commit.isPending ? "جارٍ السحب…" : "سحب البيانات دون المساس بالمخالفات"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StudentExcelForm({ onImported }: { onImported: () => void }) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [keepEmpty, setKeepEmpty] = useState(true);
  const [mapping, setMapping] = useState<StudentMapping>({
    name: "",
    parentPhone: "",
    parentPhone2: "",
    workPhone: "",
    nationalId: "",
    nationality: "",
    stageName: "",
    className: "",
  });

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof importStudents>[0]["data"]["rows"]) =>
      importStudents({ data: { rows: payload, replaceEmpty: !keepEmpty, preserveRecords: keepEmpty } }),
    onSuccess: (result) => {
      const extra =
        result.removedClasses || result.removedStages
          ? ` — أُزيل ${result.removedClasses ?? 0} قسماً فارغاً قديماً`
          : "";
      toast.success(
        `تم الاستيراد: ${result.inserted} جديد، ${result.updated} محدّث، ${result.skipped} متجاوز${extra}`,
      );
      onImported();
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الاستيراد")),
  });

  async function onFile(file: File | undefined) {
    const parsed = await readSheet(file);
    if (!parsed) return;
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    const phone = guess(parsed.headers, ["جوال الطالب", "جوال ولي", "جوال", "هاتف", "phone"]);
    const home = guess(parsed.headers.filter((header) => header !== phone), ["منزل", "المنزل", "home"]);
    const work = guess(parsed.headers.filter((header) => header !== phone && header !== home), ["عمل", "العمل", "work"]);
    setMapping({
      name: guess(parsed.headers, ["اسم", "name", "الطالب"]),
      parentPhone: phone,
      parentPhone2: home,
      workPhone: work,
      nationalId: guess(parsed.headers, ["سجل", "هوية", "وطني", "national"]),
      nationality: guess(parsed.headers, ["جنسية", "nationality"]),
      stageName: guess(parsed.headers, ["مرحلة", "صف", "stage"]),
      className: guess(parsed.headers, ["فصل", "شعبة", "class"]),
    });
  }

  function mappedRows() {
    const index = {
      name: headers.indexOf(mapping.name),
      parentPhone: headers.indexOf(mapping.parentPhone),
      parentPhone2: headers.indexOf(mapping.parentPhone2),
      workPhone: headers.indexOf(mapping.workPhone),
      nationalId: headers.indexOf(mapping.nationalId),
      nationality: headers.indexOf(mapping.nationality),
      stageName: headers.indexOf(mapping.stageName),
      className: headers.indexOf(mapping.className),
    };
    return rows.map((row) => ({
      name: index.name >= 0 ? row[index.name] ?? "" : "",
      parentPhone: index.parentPhone >= 0 ? row[index.parentPhone] ?? "" : "",
      parentPhone2: index.parentPhone2 >= 0 ? row[index.parentPhone2] ?? "" : "",
      workPhone: index.workPhone >= 0 ? row[index.workPhone] ?? "" : "",
      nationalId: index.nationalId >= 0 ? row[index.nationalId] ?? "" : "",
      nationality: index.nationality >= 0 ? row[index.nationality] ?? "" : "",
      stageName: index.stageName >= 0 ? row[index.stageName] ?? "" : "",
      className: index.className >= 0 ? row[index.className] ?? "" : "",
    }));
  }

  const preview = mappedRows().slice(0, 6);

  return (
    <div className="space-y-4">
      <DropZone
        hint={tr("الأعمدة: الاسم، السجل المدني، جوال الطالب، رقم المنزل، رقم العمل، الجنسية، المرحلة، الفصل.")}
        onFile={onFile}
      />
      {headers.length > 0 ? (
        <div className="space-y-4 rounded-[var(--radius-lg)] border border-border bg-card p-4">
          <h2 className="font-semibold">{tr("تعيين الأعمدة")}</h2>
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
            rows={preview.map((row) => [
              row.name,
              row.nationalId,
              row.parentPhone,
              row.parentPhone2,
              row.workPhone,
              row.nationality,
              row.stageName,
              row.className,
            ])}
          />
          <p className="text-sm text-fg-muted">{rows.length} صف جاهز للاستيراد</p>
          <label className="flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-bg-elevated px-3 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={keepEmpty}
              onChange={(e) => setKeepEmpty(e.target.checked)}
            />
            حماية السجلات: لا تُحذف الفصول ولا يُدمج الطلاب، وتبقى المخالفات كما هي
          </label>
          <Button
            disabled={mutation.isPending || !mapping.name || !mapping.stageName || !mapping.className}
            onClick={() => mutation.mutate(mappedRows())}
          >
            {mutation.isPending ? tr("جارٍ الحفظ…") : tr("اعتماد استيراد الطلاب")}
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
        <p className="text-sm text-fg-muted">{tr("أضف معلمًا أو عدّل بياناته، أو ارفع ملف إكسل دفعة واحدة.")}</p>
        <Button variant="secondary" onClick={() => setShowExcel((v) => !v)}>
          <Upload className="size-4" />
          {showExcel ? tr("إخفاء ملف الإكسل") : tr("استيراد معلمين من إكسل")}
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
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الاستيراد")),
  });

  async function onFile(file: File | undefined) {
    const parsed = await readSheet(file);
    if (!parsed) return;
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping({
      name: guess(parsed.headers, [tr("اسم"), "name", tr("معلم")]),
      phone: guess(parsed.headers, [tr("جوال"), tr("هاتف"), "phone", tr("رقم")]),
      subject: guess(parsed.headers, [tr("مادة"), tr("تخصص"), "subject"]),
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
          <h2 className="font-semibold">{tr("تعيين الأعمدة")}</h2>
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
            {mutation.isPending ? tr("جارٍ الحفظ…") : tr("اعتماد استيراد المعلمين")}
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
      <span className="font-medium">{tr("اختر ملف .xlsx أو .xls")}</span>
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
        <option value="">{tr("— غير معيّن —")}</option>
        {headers.map((header) => (
          <option key={header} value={header}>
            {header || tr("(بدون عنوان)")}
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
    toast.error(tr("الملف لا يحتوي على ورقة عمل"));
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
