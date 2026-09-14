import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsBack } from "@/components/settings-back";
import { StaffManager } from "@/components/staff-manager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSchool, updateStaffName } from "@/lib/school/api";
import {
  ROLE_LABEL,
  SAUDI_REGIONS,
  SEASON_LABEL,
  counselorTitle,
  principalTitle,
  scheduleFor,
} from "@/lib/school/constants";
import type { SchoolGender, Season } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/settings/school")({ component: SchoolSettings });

function SchoolSettings() {
  const { school, staff } = useWorkspace();
  const queryClient = useQueryClient();
  const [schoolName, setSchoolName] = useState(school.name);
  const [principalName, setPrincipalName] = useState(school.principalName);
  const [counselorName, setCounselorName] = useState(school.counselorName);
  const [technicalVpName, setTechnicalVpName] = useState(school.technicalVpName);
  const [region, setRegion] = useState(school.region);
  const [governorate, setGovernorate] = useState(school.governorate);
  const [leadershipGender, setLeadershipGender] = useState<SchoolGender>(school.leadershipGender);
  const [studentGender, setStudentGender] = useState<SchoolGender>(school.studentGender);
  const [season, setSeason] = useState<Season>(school.season);
  const [logoUrl, setLogoUrl] = useState(school.logoUrl);
  const [displayName, setDisplayName] = useState(staff.displayName);
  const [subject, setSubject] = useState(staff.subject);
  const [phone, setPhone] = useState(staff.phone);
  const [password, setPassword] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);

  const schoolMutation = useMutation({
    mutationFn: () =>
      updateSchool({
        data: {
          name: schoolName,
          principalName,
          counselorName,
          technicalVpName,
          region,
          governorate,
          leadershipGender,
          studentGender,
          season,
          logoUrl,
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ بيانات المدرسة");
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });

  const nameMutation = useMutation({
    mutationFn: () =>
      updateStaffName({
        data: {
          name: displayName,
          subject,
          phone,
          password: password.trim() ? password : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ بيانات حسابك");
      setPassword("");
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });

  async function onLogoFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("اختر صورة للشعار (PNG أو JPG)");
      return;
    }
    setLogoBusy(true);
    try {
      setLogoUrl(await resizeLogo(file));
      toast.success("تم تجهيز الشعار — اضغط حفظ بيانات المدرسة");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر قراءة الشعار");
    } finally {
      setLogoBusy(false);
    }
  }

  const slots = scheduleFor(season);

  return (
    <div className="space-y-6">
      <div>
        <SettingsBack />
        <h1 className="text-3xl font-semibold tracking-tight">البيانات</h1>
        <p className="text-sm text-fg-muted">المدرسة، الشعار، والمعلمون</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>حسابك في النظام</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-fg-muted">صلاحيتك الحالية: {ROLE_LABEL[staff.role]}</p>
          <div className="space-y-1.5">
            <Label htmlFor="display">الاسم</Label>
            <Input id="display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="username">اسم المستخدم (رقم الجوال)</Label>
            <Input
              id="username"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
              className="text-left"
              placeholder="05xxxxxxxx"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">كلمة المرور الجديدة</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
              className="text-left"
              placeholder="اتركه فارغاً إن لم ترد التغيير"
              minLength={4}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subject">المادة الدراسية</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="مثال: لغتي، رياضيات، علوم"
            />
          </div>
          <Button
            disabled={nameMutation.isPending || displayName.trim().length < 2}
            onClick={() => nameMutation.mutate()}
          >
            حفظ الحساب
          </Button>
        </CardContent>
      </Card>

      {staff.role === "admin" ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>بيانات المدرسة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="region">المنطقة</Label>
                <Input
                  id="region"
                  list="regions"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="مثال: المنطقة الشرقية"
                />
                <datalist id="regions">
                  {SAUDI_REGIONS.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gov">المحافظة / إدارة التعليم</Label>
                <Input
                  id="gov"
                  value={governorate}
                  onChange={(e) => setGovernorate(e.target.value)}
                  placeholder="مثال: الأحساء"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="school">اسم المدرسة</Label>
                <Input id="school" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="logo">شعار المدرسة — يظهر بجوار شعار الوزارة</Label>
                <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-border bg-bg-elevated p-3">
                  <div className="flex h-16 items-center gap-2 overflow-hidden rounded-[var(--radius-sm)] bg-white px-2">
                    <img src="/moe-logo.jpg" alt="" className="h-12 w-auto object-contain" />
                    {logoUrl ? <img src={logoUrl} alt="" className="h-12 w-auto object-contain" /> : null}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input
                      id="logo"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={logoBusy}
                      onChange={(e) => void onLogoFile(e.target.files?.[0])}
                    />
                    <p className="text-xs text-fg-muted">
                      شعار الوزارة ثابت. ارفع شعار مدرستك ليظهر بجانبه في النماذج والكشوفات.
                    </p>
                    <Button type="button" size="sm" variant="secondary" onClick={() => setLogoUrl("")}>
                      إزالة شعار المدرسة
                    </Button>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>صفة القيادة في النماذج</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["male", "female"] as SchoolGender[]).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setLeadershipGender(g)}
                      className={
                        leadershipGender === g
                          ? "h-11 rounded-[var(--radius-sm)] border border-primary bg-primary text-primary-fg text-sm font-medium"
                          : "h-11 rounded-[var(--radius-sm)] border border-border bg-bg-elevated text-sm"
                      }
                    >
                      {principalTitle(g)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>صفة الطلبة في النماذج</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["male", "female"] as SchoolGender[]).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setStudentGender(g)}
                      className={
                        studentGender === g
                          ? "h-11 rounded-[var(--radius-sm)] border border-primary bg-primary text-primary-fg text-sm font-medium"
                          : "h-11 rounded-[var(--radius-sm)] border border-border bg-bg-elevated text-sm"
                      }
                    >
                      {g === "male" ? "طالب" : "طالبة"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="principal">اسم {principalTitle(leadershipGender)}</Label>
                <Input
                  id="principal"
                  value={principalName}
                  onChange={(e) => setPrincipalName(e.target.value)}
                  placeholder="يظهر في الترويسة والكشوفات"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="counselor">{counselorTitle(leadershipGender)}</Label>
                <Input
                  id="counselor"
                  value={counselorName}
                  onChange={(e) => setCounselorName(e.target.value)}
                  placeholder="يظهر في التوقيعات والإحالات"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="techvp">وكيل الشؤون الفنية</Label>
                <Input
                  id="techvp"
                  value={technicalVpName}
                  onChange={(e) => setTechnicalVpName(e.target.value)}
                  placeholder="يُذكر عند تكرار المخالفة"
                />
              </div>
              <div className="space-y-1.5">
                <Label>التوقيت الدراسي</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["winter", "summer"] as Season[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSeason(s)}
                      className={
                        season === s
                          ? "h-11 rounded-[var(--radius-sm)] border border-primary bg-primary text-primary-fg text-sm font-medium"
                          : "h-11 rounded-[var(--radius-sm)] border border-border bg-bg-elevated text-sm"
                      }
                    >
                      {s === "winter" ? "شتوي — بداية 7:00" : "صيفي — بداية 6:45"}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                disabled={schoolMutation.isPending || schoolName.trim().length < 3}
                onClick={() => schoolMutation.mutate()}
              >
                حفظ بيانات المدرسة
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>جدول الحصص ({SEASON_LABEL[season]})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-right text-fg-muted">
                      <th className="px-3 py-2 font-medium">الحصة</th>
                      <th className="px-3 py-2 font-medium">من</th>
                      <th className="px-3 py-2 font-medium">إلى</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slots.map((s) => (
                      <tr key={s.key} className="border-t border-border">
                        <td className="px-3 py-2">{s.label}</td>
                        <td className="px-3 py-2 tabular-nums">{s.from}</td>
                        <td className="px-3 py-2 tabular-nums">{s.to}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div>
            <h2 className="mb-3 text-xl font-semibold">المعلمون والمستخدمون</h2>
            <p className="mb-4 text-sm text-fg-muted">
              أضف المعلمين يدويًا أو عدّل الاسم والجوال والمادة، ثم فعّل أمام كل موظف الصلاحيات المسموح له بها.
            </p>
            <StaffManager />
          </div>
        </>
      ) : null}
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
