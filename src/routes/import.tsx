import { createFileRoute } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Search, Upload, CheckCircle2, AlertTriangle, ArrowLeftRight } from "lucide-react";
import { useMemo, useState, useEffect, useCallback } from "react";
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
import { bulkDeleteStudents, importStudents, importTeachers, listRoster, previewNoorPdf } from "@/lib/school/api";
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
  { key: "parentPhone", label: tr("جوال ولي الأمر") },
  { key: "parentPhone2", label: tr("جوال آخر (المنزل)") },
  { key: "workPhone", label: tr("هاتف العمل") },
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
  nationalId?: string;
  nationality?: string;
  classId: number;
  violationsCount?: number;
  notesCount?: number;
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

type DuplicatePair = {
  pairId: string;
  stageName: string;
  classLabel: string;
  keep: RosterStudent;
  remove: RosterStudent;
  reason: string;
  selected: boolean;
};

// دالة توحيد النص العربي لمقارنة الأسماء المتشابهة بدقة
function normalizeArabicName(raw: string): string {
  return String(raw ?? "")
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "") // إزالة التشكيل والمد
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/عبد\s+/g, "عبد") // توحيد (عبد الله -> عبدالله)
    .replace(/ابو\s+/g, "ابو")
    .replace(/آل\s+/g, "ال")
    .replace(/بن\s+/g, "") // تجاهل كلمة (بن) عند المقارنة
    .replace(/\s+/g, " ")
    .trim();
}

// فحص درجة التشابه بين اسمين داخل نفس الفصل
function checkNameSimilarity(name1: string, name2: string): { isSimilar: boolean; reason: string } {
  const n1 = normalizeArabicName(name1);
  const n2 = normalizeArabicName(name2);

  if (!n1 || !n2) return { isSimilar: false, reason: "" };
  if (n1 === n2) return { isSimilar: true, reason: "تطابق تام في الاسم" };

  const w1 = n1.split(" ").filter(Boolean);
  const w2 = n2.split(" ").filter(Boolean);

  if (w1.length >= 3 && w2.length >= 3) {
    // تطابق الاسم الأول والثاني والأخير (مثل اسم ثلاثي مع رباعي)
    const firstTwoMatch = w1[0] === w2[0] && w1[1] === w2[1];
    const lastMatch = w1[w1.length - 1] === w2[w2.length - 1];
    if (firstTwoMatch && lastMatch) {
      return { isSimilar: true, reason: "تطابق الاسم الأول والأب والعائلة" };
    }

    // إذا كانت كل كلمات الاسم الأقصر موجودة بالترتيب داخل الاسم الأطول
    const shorter = w1.length <= w2.length ? w1 : w2;
    const longer = w1.length <= w2.length ? w2 : w1;
    let idx = 0;
    for (const word of longer) {
      if (word === shorter[idx]) idx++;
    }
    if (idx === shorter.length) {
      return { isSimilar: true, reason: "أحد الاسمين مختصر للآخر" };
    }
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

  // حالات نافذة تدقيق المكررات للبيانات الحالية الموجودة في النظام
  const [showExistingAudit, setShowExistingAudit] = useState(false);
  const [duplicatePairs, setDuplicatePairs] = useState<DuplicatePair[]>([]);

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

  // دالة فحص الطلاب الموجودين حالياً في قاعدة البيانات واكتشاف المكرر بالتشابه
  const scanExistingDuplicates = useCallback(() => {
    const allStages: RosterStage[] = roster.data?.stages ?? [];
    if (!allStages.length) {
      toast.warning("لا توجد بيانات طلاب محملة حالياً لفحصها.");
      return;
    }

    const foundPairs: DuplicatePair[] = [];

    for (const stage of allStages) {
      for (const cls of stage.classes) {
        const students = cls.students ?? [];
        const usedIds = new Set<number>();

        for (let i = 0; i < students.length; i++) {
          const stA = students[i];
          if (!stA || usedIds.has(stA.id)) continue;

          for (let j = i + 1; j < students.length; j++) {
            const stB = students[j];
            if (!stB || usedIds.has(stB.id)) continue;

            const sameNationalId =
              Boolean(stA.nationalId && stB.nationalId) &&
              stA.nationalId?.trim() === stB.nationalId?.trim();

            const sim = checkNameSimilarity(stA.name, stB.name);

            if (sameNationalId || sim.isSimilar) {
              usedIds.add(stB.id);

              // تحديد الطالب الأحق بالبقاء (الأكثر ملاحظات/مخالفات، ثم المكتمل بياناته)
              const scoreA =
                ((stA.violationsCount ?? 0) + (stA.notesCount ?? 0)) * 10 +
                (stA.parentPhone ? 2 : 0) +
                (stA.nationalId ? 1 : 0);
              const scoreB =
                ((stB.violationsCount ?? 0) + (stB.notesCount ?? 0)) * 10 +
                (stB.parentPhone ? 2 : 0) +
                (stB.nationalId ? 1 : 0);

              const keep = scoreB > scoreA ? stB : stA;
              const remove = scoreB > scoreA ? stA : stB;

              foundPairs.push({
                pairId: `${keep.id}_${remove.id}`,
                stageName: stage.name,
                classLabel: cls.label,
                keep,
                remove,
                reason: sameNationalId ? "تطابق السجل المدني" : sim.reason,
                selected: true,
              });
            }
          }
        }
      }
    }

    setDuplicatePairs(foundPairs);
    setShowExistingAudit(true);
    if (foundPairs.length > 0) {
      toast.info(`تم العثور على ${foundPairs.length} حالة تكرار في البيانات الحالية.`);
    } else {
      toast.success("لم يتم العثور على أي أسماء مكررة في الفصول الحالية!");
    }
  }, [roster.data]);

  // تفعيل اختصار لوحة المفاتيح Ctrl + Shift + Q على مستوى صفحة الطلاب بالكامل
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "q") {
        e.preventDefault();
        scanExistingDuplicates();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [scanExistingDuplicates]);

  // تبديل الطالب المعتمد مع الطالب المحذوف يدوياً عند رغبة المدير
  function swapPair(pairId: string) {
    setDuplicatePairs((prev) =>
      prev.map((item) =>
        item.pairId === pairId
          ? { ...item, keep: item.remove, remove: item.keep }
          : item,
      ),
    );
  }

  function togglePairSelection(pairId: string) {
    setDuplicatePairs((prev) =>
      prev.map((item) =>
        item.pairId === pairId ? { ...item, selected: !item.selected } : item,
      ),
    );
  }

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
        <Button variant="secondary" onClick={scanExistingDuplicates}>
          <AlertTriangle className="size-4 text-amber-500" />
          تدقيق المكرر في البيانات الحالية (Ctrl+Shift+Q)
        </Button>
        <Button variant="secondary" onClick={() => setShowExcel((v) => !v)}>
          <Upload className="size-4" />
          {showExcel ? tr("إخفاء ملف الإكسل") : tr("استيراد من إكسل")}
        </Button>
      </div>

      {/* نافذة تدقيق ومعاينة الأسماء المكررة الموجودة فعلياً في قاعدة البيانات */}
      {showExistingAudit ? (
        <Card className="border-amber-500/40 bg-bg-elevated shadow-md">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="size-5 text-amber-500" />
                تدقيق الأسماء المكررة في البيانات الحالية ({duplicatePairs.length} حالة)
              </CardTitle>
              <p className="mt-1 text-xs text-fg-muted">
                راجع الأسماء المتشابهة المكتشفة داخل الفصول. يمكنك عكس الاختيار بزر التبديل لتحديد الاسم الذي سيبقى وتُنقل إليه الملاحظات.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowExistingAudit(false)}>
                إغلاق النافذة
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {duplicatePairs.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-muted">
                لا توجد أي أسماء مكررة أو متشابهة داخل الفصول الحالية.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border max-h-96">
                <table className="w-full text-right text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="p-2.5 border border-border text-center">تحديد</th>
                      <th className="p-2.5 border border-border">الفصل</th>
                      <th className="p-2.5 border border-border">الاسم المعتمد (يبقى وتُنقل له الملاحظات)</th>
                      <th className="p-2.5 border border-border text-center">تبديل</th>
                      <th className="p-2.5 border border-border">الاسم المكرر (سيُحذف بعد النقل)</th>
                      <th className="p-2.5 border border-border">سبب التشابه</th>
                      <th className="p-2.5 border border-border text-center">حذف يدوي سريع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duplicatePairs.map((pair) => (
                      <tr key={pair.pairId} className="hover:bg-bg/50">
                        <td className="p-2.5 border border-border text-center">
                          <input
                            type="checkbox"
                            className="size-4 accent-primary"
                            checked={pair.selected}
                            onChange={() => togglePairSelection(pair.pairId)}
                          />
                        </td>
                        <td className="p-2.5 border border-border text-fg-muted">
                          {pair.stageName} - {pair.classLabel}
                        </td>
                        <td className="p-2.5 border border-border font-semibold text-primary">
                          <div>{pair.keep.name}</div>
                          <div className="text-[11px] font-normal text-fg-muted" dir="ltr">
                            ID: #{pair.keep.id} {pair.keep.parentPhone ? `· ${pair.keep.parentPhone}` : "· بدون جوال"}
                          </div>
                        </td>
                        <td className="p-2.5 border border-border text-center">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            title="تبديل أيهما يبقى وأيهما يُحذف"
                            onClick={() => swapPair(pair.pairId)}
                          >
                            <ArrowLeftRight className="size-3.5" />
                          </Button>
                        </td>
                        <td className="p-2.5 border border-border font-medium text-danger">
                          <div>{pair.remove.name}</div>
                          <div className="text-[11px] font-normal text-fg-muted" dir="ltr">
                            ID: #{pair.remove.id} {pair.remove.parentPhone ? `· ${pair.remove.parentPhone}` : "· بدون جوال"}
                          </div>
                        </td>
                        <td className="p-2.5 border border-border text-fg-muted">
                          {pair.reason}
                        </td>
                        <td className="p-2.5 border border-border text-center">
                          <DeleteStudentButton student={pair.remove} />
                        </td>
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
            <div className="flex flex-wrap items-center gap-2">
              {(roster.data?.studentCount ?? 0) > 0 ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={scanExistingDuplicates}
                  >
                    تدقيق الأسماء المكررة (Ctrl+Shift+Q)
                  </Button>
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
                </>
              ) : null}
            </div>
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
                                      {student.parentPhone || tr("بدون جوال ولي الأمر")}
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
          ارفع ملف PDF «كشف الطلاب» كما يخرجه نور. يُحدَّث الطالب في مكانه بالسجل المدني، ثم بالاسم.
          المخالفات والملاحظات والرسائل لا تُحذف ولا تُنقل، ومن ليس في الملف يبقى كما هو.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border bg-bg-elevated px-4 text-center">
          <span className="font-medium">{fileName || "اختر ملف PDF"}</span>
          <span className="mt-1 text-sm text-fg-muted">السجل المدني هو المفتاح. الجوال الأساسي من رقم جوال الطالب، والمنزل جوال ثانٍ.</span>
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
              labels={["الاسم", "السجل", "الجوال", "جوال آخر", "الجنسية", "الصف", "الفصل"]}
              rows={preview.rows.slice(0, 5).map((row) => [
                row.name,
                row.nationalId,
                row.parentPhone,
                row.parentPhone2,
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

  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditedStudents, setAuditedStudents] = useState<any[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);

  const mutation = useMutation({
    mutationFn: (payload: any[]) =>
      importStudents({ data: { rows: payload, replaceEmpty: !keepEmpty, preserveRecords: keepEmpty } }),
    onSuccess: (result) => {
      const extra =
        result.removedClasses || result.removedStages
          ? ` — أُزيل ${result.removedClasses ?? 0} قسماً فارغاً قديماً`
          : "";
      toast.success(
        `تم الاستيراد: ${result.inserted} جديد، ${result.updated} محدّث، ${result.skipped} متجاوز${extra}`,
      );
      setShowAuditModal(false);
      onImported();
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الاستيراد")),
  });

  async function onFile(file: File | undefined) {
    const parsed = await readSheet(file);
    if (!parsed) return;
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    const phone = guess(parsed.headers, ["جوال ولي", "هاتف ولي", "جوال", "هاتف", "phone", "ولي"]);
    setMapping({
      name: guess(parsed.headers, ["اسم", "name", "الطالب"]),
      parentPhone: phone,
      parentPhone2: guess(parsed.headers.filter((header) => header !== phone), ["جوال", "هاتف", "phone", "آخر", "ثاني", "منزل"]),
      workPhone: guess(parsed.headers, ["عمل", "work", "هاتف العمل"]),
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

  function handleRunAudit() {
    const raw = mappedRows();
    const map = new Map();
    let dups = 0;

    raw.forEach((st) => {
      const key = st.nationalId
        ? st.nationalId.trim()
        : `${normalizeArabicName(st.name)}_${st.stageName.trim()}_${st.className.trim()}`;

      if (map.has(key)) {
        dups++;
        const existing = map.get(key);
        if (!existing.parentPhone && st.parentPhone) existing.parentPhone = st.parentPhone;
        if (!existing.parentPhone2 && st.parentPhone2) existing.parentPhone2 = st.parentPhone2;
        if (!existing.workPhone && st.workPhone) existing.workPhone = st.workPhone;
        if (!existing.nationalId && st.nationalId) existing.nationalId = st.nationalId;
        if (!existing.nationality && st.nationality) existing.nationality = st.nationality;
      } else {
        map.set(key, { ...st });
      }
    });

    setAuditedStudents(Array.from(map.values()));
    setDuplicateCount(dups);
    setShowAuditModal(true);
  }

  const preview = mappedRows().slice(0, 6);

  return (
    <div className="space-y-4">
      <DropZone
        hint={tr("الأعمدة: الاسم، السجل المدني، الجوال، جوال آخر، هاتف العمل، الجنسية، المرحلة والفصل.")}
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
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={!mapping.name || !mapping.stageName || !mapping.className}
            onClick={handleRunAudit}
          >
            تدقيق المكررات في ملف الإكسل ({rows.length} سجل)
          </Button>

          {showAuditModal && (
            <div className="rounded-xl border border-primary/30 bg-bg-elevated p-5 space-y-4 shadow-md mt-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="font-bold text-base text-fg flex items-center gap-2">
                    <CheckCircle2 className="size-5 text-primary" />
                    تقرير تدقيق ودمج السجلات المكررة
                  </h3>
                  <p className="text-xs text-fg-muted mt-1">
                    تم فحص السجلات وإزالة التكرارات ودمج الأرقام (الجوال، المنزل، العمل). عدد الطلاب الصافي بعد التدقيق: <span className="font-semibold text-primary">{auditedStudents.length}</span> طالب (تم دمج {duplicateCount} سجل مكرر).
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setShowAuditModal(false)}>
                    إلغاء وتعديل الأعمدة
                  </Button>
                  <Button
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate(auditedStudents)}
                  >
                    {mutation.isPending ? tr("جارٍ الحفظ…") : tr("اعتماد ورفع السجلات النهائية")}
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border max-h-72">
                <table className="w-full text-right text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="p-2.5 border border-border">اسم الطالب</th>
                      <th className="p-2.5 border border-border">السجل المدني</th>
                      <th className="p-2.5 border border-border">الجوال الأساسي</th>
                      <th className="p-2.5 border border-border">جوال المنزل</th>
                      <th className="p-2.5 border border-border">هاتف العمل</th>
                      <th className="p-2.5 border border-border">المرحلة والفصل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditedStudents.map((st, i) => (
                      <tr key={i} className="hover:bg-bg/50">
                        <td className="p-2.5 border border-border font-medium text-fg">{st.name}</td>
                        <td className="p-2.5 border border-border text-fg-muted">{st.nationalId || "—"}</td>
                        <td className="p-2.5 border border-border text-primary font-mono">{st.parentPhone || "—"}</td>
                        <td className="p-2.5 border border-border text-fg-muted font-mono">{st.parentPhone2 || "—"}</td>
                        <td className="p-2.5 border border-border text-fg-muted font-mono">{st.workPhone || "—"}</td>
                        <td className="p-2.5 border border-border text-fg-muted">{st.stageName} - {st.className}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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