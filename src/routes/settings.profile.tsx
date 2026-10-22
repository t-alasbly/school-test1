import { createFileRoute } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsBack } from "@/components/settings-back";
import { PageHelp } from "@/components/page-help";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubjectEditor } from "@/components/subject-editor";
import { updateStaffName, saveSubjectPlan, setOwnFollowLedger } from "@/lib/school/api";
import { ROLE_LABEL, formatSubjects, parseSubjects } from "@/lib/school/constants";
import { staffCan } from "@/lib/school/permissions";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/settings/profile")({ component: ProfileSettings });

function ProfileSettings() {
  const { staff } = useWorkspace();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(staff.displayName);
  const [subjects, setSubjects] = useState(() => parseSubjects(staff.subject));
  const [phone, setPhone] = useState(staff.phone);
  const [password, setPassword] = useState("");
  const [ledger, setLedger] = useState(() => staffCan(staff, "viewLedger"));
  const ledgerMutation = useMutation({
    mutationFn: (visible: boolean) => setOwnFollowLedger({ data: { visible } }),
    onSuccess: (_res, visible) => {
      setLedger(visible);
      toast.success(visible ? tr("ظهر سجل المتابعة في مكتبك") : tr("أُخفي سجل المتابعة"));
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
      void queryClient.invalidateQueries({ queryKey: ["my-timetable"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
  });

  const nameMutation = useMutation({
    mutationFn: () =>
      updateStaffName({
        data: {
          name: displayName,
          subject: formatSubjects(subjects),
          phone,
          password: password.trim() ? password : undefined,
        },
      }),
    onSuccess: () => {
      toast.success(tr("تم حفظ بيانات حسابك"));
      setPassword("");
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
  });

  return (
    <div className="space-y-6">
      <div>
        <SettingsBack />
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          {tr("حسابك")}
          <PageHelp text={tr("الاسم الظاهر، رقم الجوال، كلمة المرور، والمواد. يمكن إضافة أكثر من مادة.")} />
        </h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{tr("بيانات الدخول")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-fg-muted">صلاحيتك الحالية: {tr(ROLE_LABEL[staff.role])}</p>
          <div className="space-y-1.5">
            <Label htmlFor="display">{tr("الاسم")}</Label>
            <Input id="display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="username">{tr("اسم المستخدم (رقم الجوال)")}</Label>
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
            <Label htmlFor="password">{tr("كلمة المرور الجديدة")}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
              className="text-left"
              placeholder={tr("اتركه فارغاً إن لم ترد التغيير")}
              minLength={4}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{tr("المواد الدراسية")}</Label>
            <SubjectEditor
              subjects={subjects}
              onChange={setSubjects}
              onAdded={(name, combine) => {
                void saveSubjectPlan({
                  data: {
                    subject: name,
                    combine,
                    periods: [
                      { title: "الفترة الأولى", tasksMax: 20, examMax: 10 },
                      { title: "الفترة الثانية", tasksMax: 20, examMax: 10 },
                    ],
                  },
                });
              }}
            />
          </div>
          <Button
            disabled={nameMutation.isPending || displayName.trim().length < 2}
            onClick={() => nameMutation.mutate()}
          >
            حفظ الحساب
          </Button>
          {staff.role !== "admin" ? (
            <label className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border px-3 py-2 text-sm">
              <span>
                <span className="block font-semibold">{tr("إظهار سجل المتابعة")}</span>
                <span className="block text-xs text-fg-muted">{tr("مخفي افتراضياً. يظهر سجل التقييمات في مكتبك عند التفعيل، ويمكن للمدير إخفاءه من الصلاحيات.")}</span>
              </span>
              <input
                type="checkbox"
                checked={ledger}
                disabled={ledgerMutation.isPending}
                onChange={(event) => ledgerMutation.mutate(event.target.checked)}
              />
            </label>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
