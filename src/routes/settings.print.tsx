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
import { DEFAULT_PRINT_MARGINS, applyPrintMargins, clampPrintMargin } from "@/lib/school/constants";
import type { PrintMargins } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/settings/print")({ component: PrintSettings });

function PrintSettings() {
  const { school, staff } = useWorkspace();
  const queryClient = useQueryClient();
  const [margins, setMargins] = useState<PrintMargins>(school.printMargins ?? DEFAULT_PRINT_MARGINS);

  const mutation = useMutation({
    mutationFn: () =>
      updateSchool({
        data: {
          name: school.name,
          printMargins: margins,
        },
      }),
    onSuccess: () => {
      applyPrintMargins(margins);
      toast.success(tr("تم حفظ هوامش الطباعة"));
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
  });

  function setSide(side: keyof PrintMargins, value: string) {
    setMargins((prev) => ({ ...prev, [side]: clampPrintMargin(value) }));
  }

  if (staff.role !== "admin") {
    return (
      <div className="space-y-3">
        <SettingsBack />
        <p className="text-fg-muted">{tr("هوامش الطباعة متاحة لمدير التطبيق.")}</p>
      </div>
    );
  }

  const fields: { key: keyof PrintMargins; label: string }[] = [
    { key: "top", label: tr("أعلى") },
    { key: "bottom", label: tr("أسفل") },
    { key: "right", label: tr("يمين (جهة الترويسة)") },
    { key: "left", label: tr("يسار") },
  ];

  return (
    <div className="space-y-6">
      <div>
        <SettingsBack />
        <h1 className="text-3xl font-semibold tracking-tight">{tr("هوامش الطباعة")}</h1>
        <p className="text-sm text-fg-muted">
          اضبط الهوامش بالمليمتر لتوافق طابعتك. القيمة صفر تلصق المحتوى بحافة الورقة.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{tr("هوامش الورقة (مم)")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`m-${field.key}`}>{field.label}</Label>
                <Input
                  id={`m-${field.key}`}
                  type="number"
                  min={0}
                  max={40}
                  dir="ltr"
                  className="text-left"
                  value={margins[field.key]}
                  onChange={(e) => setSide(field.key, e.target.value)}
                />
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setMargins({ ...DEFAULT_PRINT_MARGINS })}
          >
            إعادة الافتراضي (10 / 10 / 12 / 8)
          </Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            حفظ الهوامش
          </Button>
        </CardContent>
      </Card>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-white p-3">
        <p className="mb-2 text-sm text-fg-muted">{tr("معاينة الترويسة")}</p>
        <OfficialLetterhead school={school} />
      </div>
    </div>
  );
}
