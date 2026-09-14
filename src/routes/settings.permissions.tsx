import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsBack } from "@/components/settings-back";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateSchoolPermissions } from "@/lib/school/api";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings/permissions")({ component: PermissionsSettings });

function PermissionsSettings() {
  const { staff, school } = useWorkspace();
  const queryClient = useQueryClient();
  const [teachersCanMessage, setTeachersCanMessage] = useState(school.teachersCanMessage);
  const [teachersCanViewAll, setTeachersCanViewAll] = useState(school.teachersCanViewAll);

  const mutation = useMutation({
    mutationFn: () =>
      updateSchoolPermissions({ data: { teachersCanMessage, teachersCanViewAll } }),
    onSuccess: () => {
      toast.success("تم حفظ الافتراضي للمعلمين الجدد");
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });

  if (staff.role !== "admin") {
    return (
      <div className="space-y-3">
        <SettingsBack />
        <p className="text-fg-muted">هذه الصفحة مخصصة لمدير التطبيق.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <SettingsBack />
        <h1 className="text-3xl font-semibold tracking-tight">صلاحيات المعلمين</h1>
        <p className="text-sm text-fg-muted">
          هذا الافتراضي للمعلمين الجدد. لمنح موظف محدد صلاحيات أدق استخدم قائمة الموظفين.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>افتراضي المعلمين</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <ToggleRow
            title="إرسال رسالة لولي الأمر"
            body="إن أُخفي، لا يظهر زر واتساب للمعلم الجديد حتى يُمنح من قائمة الموظفين."
            on={teachersCanMessage}
            onLabel="إظهار الإرسال"
            offLabel="إخفاء الإرسال"
            onChange={setTeachersCanMessage}
          />
          <ToggleRow
            title="مشاهدة جميع المخالفات"
            body="إن لم يُفعَّل، يرى المعلم الجديد ملاحظاته فقط. يمكن منح الاطلاع فرديًا أمام كل موظف."
            on={teachersCanViewAll}
            onLabel="مفعّل — كل المعلمين"
            offLabel="مخالفات المعلم فقط"
            onChange={setTeachersCanViewAll}
          />
          <div className="flex flex-wrap gap-2">
            <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              حفظ الافتراضي
            </Button>
            <Link
              to="/staff"
              className="inline-flex h-11 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-bg-elevated px-4 text-sm font-medium hover:bg-muted"
            >
              فتح قائمة الموظفين
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleRow({
  title,
  body,
  on,
  onLabel,
  offLabel,
  onChange,
}: {
  title: string;
  body: string;
  on: boolean;
  onLabel: string;
  offLabel: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="font-medium">{title}</p>
      <p className="text-sm text-fg-muted">{body}</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={cn(
            "h-11 rounded-[var(--radius-sm)] border text-sm font-medium",
            on
              ? "border-primary bg-primary text-primary-fg"
              : "border-border bg-bg-elevated",
          )}
        >
          {onLabel}
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={cn(
            "h-11 rounded-[var(--radius-sm)] border text-sm font-medium",
            !on
              ? "border-primary bg-primary text-primary-fg"
              : "border-border bg-bg-elevated",
          )}
        >
          {offLabel}
        </button>
      </div>
    </div>
  );
}
