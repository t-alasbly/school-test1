import { createFileRoute } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsBack } from "@/components/settings-back";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSchool } from "@/lib/school/api";
import { APP_NAME, DEFAULT_APP_PHRASE } from "@/lib/school/constants";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/settings/app")({ component: AppIconSettings });

const PROGRAM_ICON = "/app-logo.jpg";
const BRAND_PRESETS = new Set(["/brand-cap.png", "/brand-student.png", "/app-logo.jpg"]);

function schoolLogoOf(url: string) {
  return url && !BRAND_PRESETS.has(url) ? url : "";
}

function AppIconSettings() {
  const { school, staff } = useWorkspace();
  const queryClient = useQueryClient();
  const [logoUrl, setLogoUrl] = useState(schoolLogoOf(school.logoUrl));
  const [extraLogoUrl, setExtraLogoUrl] = useState(school.extraLogoUrl ?? "");
  const [printSchoolLogo, setPrintSchoolLogo] = useState(Boolean(school.printSchoolLogo));
  const [tagline, setTagline] = useState(school.tagline ?? "");
  const [logoBusy, setLogoBusy] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      updateSchool({
        data: {
          name: school.name,
          logoUrl,
          extraLogoUrl,
          printSchoolLogo,
          tagline,
        },
      }),
    onSuccess: () => {
      toast.success(tr("تم حفظ شعار المدرسة وشعار الرؤية والعبارة"));
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
  });

  async function onLogoFile(
    file: File | undefined,
    setter: (value: string) => void,
  ) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(tr("اختر صورة للشعار (PNG أو JPG)"));
      return;
    }
    setLogoBusy(true);
    try {
      setter(await resizeLogo(file));
      toast.success(tr("تم تجهيز الشعار — اضغط حفظ"));
    } catch (err) {
      toast.error(err instanceof Error ? tr(err.message) : tr("تعذر قراءة الشعار"));
    } finally {
      setLogoBusy(false);
    }
  }

  if (staff.role !== "admin") {
    return (
      <div className="space-y-3">
        <SettingsBack />
        <p className="text-fg-muted">{tr("شعارات التطبيق متاحة لمدير التطبيق.")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <SettingsBack />
        <h1 className="text-3xl font-semibold tracking-tight">{tr("أيقونة التطبيق والشعارات")}</h1>
        <p className="text-sm text-fg-muted">
          أيقونة البرنامج ثابتة. شعار المدرسة يظهر عند التشغيل وفي رأس الصفحة، وشعار الرؤية أو المئة عام بجانب الوزارة في الخطابات.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{tr("أيقونة البرنامج")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="grid size-16 place-items-center overflow-hidden rounded-[1.1rem] bg-white shadow-sm ring-1 ring-border">
              <img src={PROGRAM_ICON} alt="" className="size-full object-contain" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{APP_NAME}</span>
              <span className="block text-sm text-fg-muted">{tagline.trim() || DEFAULT_APP_PHRASE}</span>
              <span className="block text-xs text-fg-subtle">{tr("هذه أيقونة البرنامج الخارجية — لا تُخلط بشعار المدرسة")}</span>
            </span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{tr("شعار المدرسة")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-fg-muted">
            يظهر عند فتح التطبيق (شاشة الدخول) وعلى رأس الصفحة بجانب اسم المدرسة.
          </p>
          <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-border bg-bg-elevated p-3">
            <div className="grid size-16 place-items-center overflow-hidden rounded-[var(--radius-sm)] bg-white">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="size-full object-contain" />
              ) : (
                <span className="text-[11px] text-fg-subtle">{tr("فارغ")}</span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="logo">{tr("رفع شعار المدرسة")}</Label>
              <Input
                id="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={logoBusy}
                onChange={(e) => void onLogoFile(e.target.files?.[0], setLogoUrl)}
              />
              <Button type="button" size="sm" variant="secondary" onClick={() => setLogoUrl("")}>
                إزالة شعار المدرسة
              </Button>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={printSchoolLogo}
                  onChange={(e) => setPrintSchoolLogo(e.target.checked)}
                />
                <span>
                  إظهار شعار المدرسة في الخطابات المطبوعة
                  <span className="mt-0.5 block text-xs text-fg-muted">
                    يظهر بين اسم المدرسة وشعاري الوزارة والرؤية.
                  </span>
                </span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{tr("شعار الرؤية / المئة عام")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-fg-muted">
            يظهر في ترويسة الخطابات بجانب شعار وزارة التعليم فقط — دون خلطه بشعار المدرسة.
          </p>
          <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-border bg-bg-elevated p-3">
            <div className="flex h-16 items-center gap-2 overflow-hidden rounded-[var(--radius-sm)] bg-white px-2">
              <img src="/moe-logo.jpg" alt="" className="h-12 w-auto object-contain" />
              {extraLogoUrl ? <img src={extraLogoUrl} alt="" className="h-12 w-auto object-contain" /> : null}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="extra-logo">{tr("رفع شعار الرؤية")}</Label>
              <Input
                id="extra-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={logoBusy}
                onChange={(e) => void onLogoFile(e.target.files?.[0], setExtraLogoUrl)}
              />
              <Button type="button" size="sm" variant="secondary" onClick={() => setExtraLogoUrl("")}>
                إزالة شعار الرؤية
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{tr("عبارة التطبيق")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tagline">{tr("العبارة تحت الاسم")}</Label>
            <Input
              id="tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder={DEFAULT_APP_PHRASE}
              maxLength={160}
            />
          </div>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            حفظ الشعارات والعبارة
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function resizeLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 240;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error(tr("تعذر معالجة الشعار")));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      let data = canvas.toDataURL("image/jpeg", 0.82);
      if (data.length > 380000) data = canvas.toDataURL("image/jpeg", 0.55);
      resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(tr("تعذر قراءة الصورة")));
    };
    img.src = url;
  });
}
