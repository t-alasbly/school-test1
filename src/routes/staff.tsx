import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppGate } from "@/components/app-gate";
import { SettingsBack } from "@/components/settings-back";
import { StaffManager } from "@/components/staff-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateSchoolPermissions } from "@/lib/school/api";
import { staffCan } from "@/lib/school/permissions";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/staff")({ component: StaffPage });

function StaffPage() {
  return (
    <AppGate>
      <StaffBody />
    </AppGate>
  );
}

function StaffBody() {
  const { staff, school } = useWorkspace();
  if (!staffCan(staff, "editStaff")) {
    return <p className="text-fg-muted">إدارة الموظفين متاحة لمن مُنح صلاحية تعديل الموظفين.</p>;
  }
  return (
    <div className="space-y-6">
      <header>
        <SettingsBack />
        <p className="text-sm text-fg-muted">
          اختر المسمى الوظيفي، ثم «صلاحيات» أمام الاسم. «إلغاء» يوقف الدخول دون حذف السجل. «حذف نهائي» يزيل الحساب تماماً.
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">شؤون الموظفين</h1>
      </header>
      {staff.role === "admin" ? <TeacherDefaults school={school} /> : null}
      <StaffManager />
    </div>
  );
}

function TeacherDefaults({
  school,
}: {
  school: { teachersCanMessage: boolean; teachersCanViewAll: boolean };
}) {
  const queryClient = useQueryClient();
  const [teachersCanMessage, setTeachersCanMessage] = useState(school.teachersCanMessage);
  const [teachersCanViewAll, setTeachersCanViewAll] = useState(school.teachersCanViewAll);

  const mutation = useMutation({
    mutationFn: (next: { teachersCanMessage: boolean; teachersCanViewAll: boolean }) =>
      updateSchoolPermissions({ data: next }),
    onSuccess: () => {
      toast.success("تم حفظ الافتراضي للمعلمين الجدد");
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });

  function apply(partial: Partial<{ teachersCanMessage: boolean; teachersCanViewAll: boolean }>) {
    const next = {
      teachersCanMessage: partial.teachersCanMessage ?? teachersCanMessage,
      teachersCanViewAll: partial.teachersCanViewAll ?? teachersCanViewAll,
    };
    if (partial.teachersCanMessage !== undefined) setTeachersCanMessage(partial.teachersCanMessage);
    if (partial.teachersCanViewAll !== undefined) setTeachersCanViewAll(partial.teachersCanViewAll);
    mutation.mutate(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>افتراضي المعلمين الجدد</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-fg-muted">
          يُطبَّق على المعلم عند إنشائه. لأي موظف محدد استخدم «صلاحيات» أمام اسمه في القائمة أدناه.
        </p>
        <ToggleRow
          title="إرسال رسالة لولي الأمر"
          body="إن أُخفي، لا يظهر زر واتساب للمعلم الجديد حتى يُمنح من صلاحياته."
          on={teachersCanMessage}
          onLabel="إظهار الإرسال"
          offLabel="إخفاء الإرسال"
          onChange={(on) => apply({ teachersCanMessage: on })}
        />
        <ToggleRow
          title="مشاهدة جميع المخالفات"
          body="إن لم يُفعَّل، يرى المعلم الجديد ملاحظاته فقط."
          on={teachersCanViewAll}
          onLabel="مفعّل — كل المعلمين"
          offLabel="مخالفات المعلم فقط"
          onChange={(on) => apply({ teachersCanViewAll: on })}
        />
        {mutation.isPending ? <p className="text-xs text-fg-muted">جارٍ الحفظ…</p> : null}
      </CardContent>
    </Card>
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
            on ? "border-primary bg-primary text-primary-fg" : "border-border bg-bg-elevated",
          )}
        >
          {onLabel}
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={cn(
            "h-11 rounded-[var(--radius-sm)] border text-sm font-medium",
            !on ? "border-primary bg-primary text-primary-fg" : "border-border bg-bg-elevated",
          )}
        >
          {offLabel}
        </button>
      </div>
    </div>
  );
}
