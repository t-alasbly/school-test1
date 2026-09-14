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
import {
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
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ بيانات المدرسة");
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });

  if (staff.role !== "admin") {
    return (
      <div className="space-y-3">
        <SettingsBack />
        <p className="text-fg-muted">بيانات المدرسة متاحة لمدير التطبيق.</p>
      </div>
    );
  }

  const slots = scheduleFor(season);

  return (
    <div className="space-y-6">
      <div>
        <SettingsBack />
        <h1 className="text-3xl font-semibold tracking-tight">بيانات المدرسة</h1>
        <p className="text-sm text-fg-muted">المنطقة والإدارة واسم المدرسة وأسماء القيادة — تظهر في ترويسة الخطابات</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>هوية المدرسة في الخطابات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="region">المنطقة</Label>
            <Input
              id="region"
              list="regions"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="مثال: مكة المكرمة"
            />
            <datalist id="regions">
              {SAUDI_REGIONS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gov">المحافظة</Label>
            <Input
              id="gov"
              value={governorate}
              onChange={(e) => setGovernorate(e.target.value)}
              placeholder="مثال: جدة"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="school">اسم المدرسة</Label>
            <Input id="school" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} />
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
    </div>
  );
}
