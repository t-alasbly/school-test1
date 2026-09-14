import { createFileRoute } from "@tanstack/react-router";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings/app")({ component: AppIconSettings });

const BRAND_PRESETS = [
  { src: "/brand-cap.png", label: "القبعة والسهم" },
  { src: "/brand-student.png", label: "الطالب المتابع" },
] as const;

function AppIconSettings() {
  const { school, staff } = useWorkspace();
  const queryClient = useQueryClient();
  const [logoUrl, setLogoUrl] = useState(school.logoUrl);
  const [extraLogoUrl, setExtraLogoUrl] = useState(school.extraLogoUrl ?? "");
  const [tagline, setTagline] = useState(school.tagline ?? "");
  const [logoBusy, setLogoBusy] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      updateSchool({
        data: {
          name: school.name,
          logoUrl,
          extraLogoUrl,
          tagline,
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ شعارات التطبيق والعبارة");
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });

  async function onLogoFile(
    file: File | undefined,
    setter: (value: string) => void,
  ) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("اختر صورة للشعار (PNG أو JPG)");
      return;
    }
    setLogoBusy(true);
    try {
      setter(await resizeLogo(file));
      toast.success("تم تجهيز الشعار — اضغط حفظ");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر قراءة الشعار");
    } finally {
      setLogoBusy(false);
    }
  }

  if (staff.role !== "admin") {
    return (
      <div className="space-y-3">
        <SettingsBack />
        <p className="text-fg-muted">شعار التطبيق متاح لمدير التطبيق.</p>
      </div>
    );
  }

  const iconSrc = logoUrl || "/app-logo.jpg";

  return (
    <div className="space-y-6">
      <div>
        <SettingsBack />
        <h1 className="text-3xl font-semibold tracking-tight">أيقونة التطبيق</h1>
        <p className="text-sm text-fg-muted">
          شعار البرنامج على الشاشة الرئيسية وشاشة الدخول، وشعار إضافي يظهر في ترويسة الخطابات بجانب الوزارة والمدرسة.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>الشعار والعبارة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>أيقونة المتابع الذكي</Label>
            <div className="grid grid-cols-2 gap-2">
              {BRAND_PRESETS.map((preset) => {
                const selected = logoUrl === preset.src || (!logoUrl && preset.src === "/brand-cap.png");
                return (
                  <button
                    key={preset.src}
                    type="button"
                    onClick={() => setLogoUrl(preset.src)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-[var(--radius-md)] border bg-white p-3",
                      selected ? "border-primary ring-2 ring-primary/30" : "border-border",
                    )}
                  >
                    <img src={preset.src} alt="" className="size-20 object-contain" />
                    <span className="text-xs font-medium">{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="logo">شعار المدرسة في الخطابات والتطبيق</Label>
            <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-border bg-bg-elevated p-3">
              <div className="flex h-16 items-center gap-2 overflow-hidden rounded-[var(--radius-sm)] bg-white px-2">
                <img src="/moe-logo.jpg" alt="" className="h-12 w-auto object-contain" />
                {logoUrl ? <img src={logoUrl} alt="" className="h-12 w-auto object-contain" /> : null}
                {extraLogoUrl ? <img src={extraLogoUrl} alt="" className="h-12 w-auto object-contain" /> : null}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <Input
                  id="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={logoBusy}
                  onChange={(e) => void onLogoFile(e.target.files?.[0], setLogoUrl)}
                />
                <p className="text-xs text-fg-muted">
                  يظهر بجوار شعار الوزارة في الخطابات، وعلى شاشة الدخول وأيقونة البرنامج.
                </p>
                <Button type="button" size="sm" variant="secondary" onClick={() => setLogoUrl("")}>
                  استخدام أيقونة المتابع الذكي فقط
                </Button>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="extra-logo">شعار ثالث في الخطابات (اختياري)</Label>
            <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-border bg-bg-elevated p-3">
              <div className="grid size-16 place-items-center overflow-hidden rounded-[var(--radius-sm)] bg-white">
                {extraLogoUrl ? (
                  <img src={extraLogoUrl} alt="" className="size-full object-contain" />
                ) : (
                  <span className="text-[11px] text-fg-subtle">فارغ</span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <Input
                  id="extra-logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={logoBusy}
                  onChange={(e) => void onLogoFile(e.target.files?.[0], setExtraLogoUrl)}
                />
                <p className="text-xs text-fg-muted">
                  يُعرض بجانب شعار الوزارة وشعار المدرسة في ترويسة النماذج.
                </p>
                <Button type="button" size="sm" variant="secondary" onClick={() => setExtraLogoUrl("")}>
                  إزالة الشعار الثالث
                </Button>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tagline">عبارة التطبيق</Label>
            <Input
              id="tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder={DEFAULT_APP_PHRASE}
              maxLength={160}
            />
          </div>
          <div className="rounded-[var(--radius-md)] border border-border bg-bg-elevated p-4">
            <p className="mb-3 text-sm font-semibold">معاينة أيقونة الشاشة الرئيسية</p>
            <div className="flex items-center gap-3">
              <span className="grid size-16 place-items-center overflow-hidden rounded-[1.1rem] bg-white shadow-sm ring-1 ring-border">
                <img src={iconSrc} alt="" className="size-full object-contain" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{APP_NAME}</span>
                <span className="block text-sm text-fg-muted">{tagline.trim() || DEFAULT_APP_PHRASE}</span>
                <span className="block text-xs text-fg-subtle">{school.name}</span>
              </span>
            </div>
            <ol className="mt-4 list-decimal space-y-1 pr-5 text-sm leading-6 text-fg-muted">
              <li>من Safari أو Chrome افتح قائمة المشاركة أو القائمة.</li>
              <li>اختر «إضافة إلى الشاشة الرئيسية» أو «تثبيت التطبيق».</li>
              <li>ستظهر أيقونة المتابع الذكي داخل التطبيق وعلى شاشة الدخول.</li>
            </ol>
          </div>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            حفظ الشعار والعبارة
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
        reject(new Error("تعذر معالجة الشعار"));
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
      reject(new Error("تعذر قراءة الصورة"));
    };
    img.src = url;
  });
}
