import { createFileRoute } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { OfficialLetterhead } from "@/components/print-forms";
import { SettingsBack } from "@/components/settings-back";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSchool } from "@/lib/school/api";
import {
  SEASON_LABEL,
  SUMMER_SCHEDULE,
  WINTER_SCHEDULE,
  counselorTitle,
  principalTitle,
  rebuildSlot,
  scheduleFor,
} from "@/lib/school/constants";
import type { SchoolGender, SchoolSchedules, Season } from "@/lib/school/types";
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
  const [schedules, setSchedules] = useState<SchoolSchedules>(() => ({
    winter: school.schedules?.winter?.length ? school.schedules.winter : WINTER_SCHEDULE,
    summer: school.schedules?.summer?.length ? school.schedules.summer : SUMMER_SCHEDULE,
  }));

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
          schedules,
        },
      }),
    onSuccess: () => {
      toast.success(tr("تم حفظ بيانات المدرسة"));
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
  });

  if (staff.role !== "admin") {
    return (
      <div className="space-y-3">
        <SettingsBack />
        <p className="text-fg-muted">{tr("بيانات المدرسة متاحة لمدير التطبيق.")}</p>
      </div>
    );
  }

  const slots = scheduleFor(season, schedules);

  function patchSlot(index: number, field: "label" | "from" | "to", value: string) {
    setSchedules((prev) => {
      const list = [...prev[season]];
      const current = list[index];
      if (!current) return prev;
      list[index] = rebuildSlot({
        key: current.key,
        label: field === "label" ? value : current.label,
        from: field === "from" ? value : current.from,
        to: field === "to" ? value : current.to,
      });
      return { ...prev, [season]: list };
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <SettingsBack />
        <h1 className="text-3xl font-semibold tracking-tight">{tr("بيانات المدرسة")}</h1>
        <p className="text-sm text-fg-muted">
          ثلاثة أسطر تُكتب يدوياً كما تريدها في يسار ترويسة الخطاب — السطر الأسفل اسم المدرسة
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{tr("ترويسة الخطاب — الجهة اليسرى")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-fg-muted">
            ثلاث خانات فاضية تُكتب كاملة كما تظهر في الخطاب. لا تُضاف كلمات تلقائياً — اكتب «منطقة…» أو «إدارة التعليم بـ…» بنفسك إن أردت.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="region">{tr("السطر الأول")}</Label>
            <Input
              id="region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder={tr("مثال: منطقة مكة المكرمة")}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gov">{tr("السطر الثاني")}</Label>
            <Input
              id="gov"
              value={governorate}
              onChange={(e) => setGovernorate(e.target.value)}
              placeholder={tr("مثال: إدارة التعليم بمحافظة جدة")}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="school">{tr("اسم المدرسة (السطر الثالث — الأسفل)")}</Label>
            <Input
              id="school"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder={tr("مثال: متوسطة الأمير سلطان")}
              maxLength={120}
            />
          </div>
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-white text-black">
            <OfficialLetterhead
              school={{
                ...school,
                name: schoolName,
                region,
                governorate,
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{tr("صفة القيادة في النماذج")}</Label>
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
            <Label>{tr("صفة الطلبة في النماذج")}</Label>
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
                  {g === "male" ? tr("طالب") : tr("طالبة")}
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
              placeholder={tr("يظهر في الترويسة والكشوفات")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="counselor">{counselorTitle(leadershipGender)}</Label>
            <Input
              id="counselor"
              value={counselorName}
              onChange={(e) => setCounselorName(e.target.value)}
              placeholder={tr("يظهر في التوقيعات والإحالات")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="techvp">{tr("وكيل الشؤون الفنية")}</Label>
            <Input
              id="techvp"
              value={technicalVpName}
              onChange={(e) => setTechnicalVpName(e.target.value)}
              placeholder={tr("يُذكر عند تكرار المخالفة")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{tr("التوقيت الدراسي")}</Label>
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
                  {s === "winter" ? tr("شتوي — بداية 7:00") : tr("صيفي — بداية 6:45")}
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
        <CardContent className="space-y-3">
          <p className="text-sm text-fg-muted">{tr("عدّل أوقات الحصص للتوقيت المعروض أعلاه ثم احفظ بيانات المدرسة.")}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-fg-muted">
                  <th className="px-3 py-2 font-medium">{tr("الحصة")}</th>
                  <th className="px-3 py-2 font-medium">{tr("من")}</th>
                  <th className="px-3 py-2 font-medium">{tr("إلى")}</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((s, i) => (
                  <tr key={s.key} className="border-t border-border">
                    <td className="px-2 py-2">
                      <Input value={s.label} onChange={(e) => patchSlot(i, "label", e.target.value)} />
                    </td>
                    <td className="px-2 py-2">
                      <Input type="time" dir="ltr" value={s.from} onChange={(e) => patchSlot(i, "from", e.target.value)} />
                    </td>
                    <td className="px-2 py-2">
                      <Input type="time" dir="ltr" value={s.to} onChange={(e) => patchSlot(i, "to", e.target.value)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setSchedules((prev) => ({
                ...prev,
                [season]: season === "summer" ? SUMMER_SCHEDULE : WINTER_SCHEDULE,
              }))
            }
          >
            إعادة الجدول الافتراضي لهذا التوقيت
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
