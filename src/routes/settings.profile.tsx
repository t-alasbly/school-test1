import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsBack } from "@/components/settings-back";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateStaffName } from "@/lib/school/api";
import { ROLE_LABEL } from "@/lib/school/constants";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/settings/profile")({ component: ProfileSettings });

function ProfileSettings() {
  const { staff } = useWorkspace();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(staff.displayName);
  const [subject, setSubject] = useState(staff.subject);
  const [phone, setPhone] = useState(staff.phone);
  const [password, setPassword] = useState("");

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

  return (
    <div className="space-y-6">
      <div>
        <SettingsBack />
        <h1 className="text-3xl font-semibold tracking-tight">حسابك</h1>
        <p className="text-sm text-fg-muted">الاسم الظاهر، رقم الجوال، كلمة المرور، والمادة</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>بيانات الدخول</CardTitle>
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
    </div>
  );
}
