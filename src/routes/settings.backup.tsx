import { createFileRoute } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsBack } from "@/components/settings-back";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { exportSchoolBackup, resetSchoolData, restoreSchoolBackup } from "@/lib/school/backup";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/settings/backup")({ component: BackupSettings });

function BackupSettings() {
  const { staff } = useWorkspace();
  const [restoreWord, setRestoreWord] = useState("");
  const [resetWord, setResetWord] = useState("");
  const [fileName, setFileName] = useState("");
  const [backup, setBackup] = useState<Awaited<ReturnType<typeof exportSchoolBackup>> | null>(null);
  const [notes, setNotes] = useState(true);
  const [roster, setRoster] = useState(false);
  const [teachers, setTeachers] = useState(false);

  const download = useMutation({
    mutationFn: () => exportSchoolBackup(),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const link = document.createElement("a");
      const day = new Date().toISOString().slice(0, 10);
      link.href = URL.createObjectURL(blob);
      link.download = `نسخة-احتياطية-${day}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success(`${tr("تم تنزيل النسخة")}: ${data.counts.students} ${tr("طالب")} · ${data.counts.notes} ${tr("مخالفة")} · ${data.counts.staff} ${tr("مستخدم")}`);
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر إنشاء النسخة")),
  });

  const restore = useMutation({
    mutationFn: () => {
      if (!backup) throw new Error("اختر ملف النسخة أولاً");
      return restoreSchoolBackup({ data: { confirm: "استعادة", backup } });
    },
    onSuccess: (res) => {
      toast.success(`${tr("تمت الاستعادة")}: ${res.students} ${tr("طالب")} · ${res.notes} ${tr("مخالفة")}`);
      window.setTimeout(() => window.location.assign("/settings/backup"), 600);
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الاستعادة")),
  });

  const reset = useMutation({
    mutationFn: () => resetSchoolData({ data: { confirm: "تصفية", notes, roster, teachers } }),
    onSuccess: (res) => {
      toast.success(`${tr("تمت التصفية")} (${res.removed})`);
      setResetWord("");
      window.setTimeout(() => window.location.assign("/settings/backup"), 600);
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر التصفية")),
  });

  if (staff.role !== "admin") {
    return (
      <div className="space-y-3">
        <SettingsBack />
        <p className="text-fg-muted">{tr("النسخة الاحتياطية لمدير التطبيق فقط.")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <SettingsBack />
        <h1 className="text-3xl font-semibold tracking-tight">{tr("النسخة الاحتياطية")}</h1>
        <p className="text-sm text-fg-muted">{tr("احفظ نسخة كاملة على جهازك أو في سحابتك، ويمكنك استعادتها لاحقاً. ملف النسخة فيه الحسابات فاحتفظ به في مكان خاص.")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{tr("تنزيل النسخة")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-fg-muted">{tr("تشمل الطلاب والفصول والمعلمين والمخالفات والدرجات والجداول وإعدادات المدرسة.")}</p>
          <Button type="button" disabled={download.isPending} onClick={() => download.mutate()}>{download.isPending ? tr("جارٍ التجهيز…") : tr("تنزيل النسخة الاحتياطية")}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr("استعادة نسخة")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-fg-muted">{tr("تُستبدل بيانات هذه المدرسة بما في الملف. خذ نسخة جديدة قبل الاستعادة.")}</p>
          <input
            type="file"
            accept="application/json,.json"
            className="block text-sm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setFileName(file.name);
              const reader = new FileReader();
              reader.onload = () => {
                try {
                  const parsed = JSON.parse(String(reader.result || ""));
                  if (parsed?.app !== "smart-followup" || parsed?.version !== 1 || !parsed.tables) throw new Error("ملف النسخة غير صالح");
                  setBackup(parsed);
                  toast.success(tr("تم قراءة الملف"));
                } catch (err) {
                  setBackup(null);
                  toast.error(err instanceof Error ? tr(err.message) : tr("ملف النسخة غير صالح"));
                }
              };
              reader.readAsText(file);
            }}
          />
          {fileName ? <p className="text-xs text-fg-muted">{fileName}</p> : null}
          <label className="block space-y-1 text-sm">
            <span>{tr("اكتب استعادة للتأكيد")}</span>
            <Input value={restoreWord} onChange={(event) => setRestoreWord(event.target.value)} placeholder={tr("استعادة")} />
          </label>
          <Button type="button" variant="secondary" disabled={!backup || restoreWord.trim() !== "استعادة" || restore.isPending} onClick={() => restore.mutate()}>{tr("استعادة النسخة")}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr("تصفية نهاية العام")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-fg-muted">{tr("تُحذف البيانات المختارة ولا تُحذف حسابات المدير. خذ نسخة احتياطية قبل التصفية. تصفية الفصول تحذف المخالفات والدرجات المرتبطة بالطلاب.")}</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={notes} onChange={(event) => setNotes(event.target.checked)} />
            {tr("المخالفات والغياب والدرجات والمتابعة")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={roster} onChange={(event) => setRoster(event.target.checked)} />
            {tr("الفصول والطلبة")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={teachers} onChange={(event) => setTeachers(event.target.checked)} />
            {tr("المعلمون ما عدا مدير التطبيق")}
          </label>
          <label className="block space-y-1 text-sm">
            <span>{tr("اكتب تصفية للتأكيد")}</span>
            <Input value={resetWord} onChange={(event) => setResetWord(event.target.value)} placeholder={tr("تصفية")} />
          </label>
          <Button
            type="button"
            variant="secondary"
            disabled={resetWord.trim() !== "تصفية" || (!notes && !roster && !teachers) || reset.isPending}
            onClick={() => reset.mutate()}
          >{tr("تنفيذ التصفية")}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
