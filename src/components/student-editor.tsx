import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createStudent, deleteStudent, updateStudent } from "@/lib/school/api";
import { useLocale, tr } from "@/lib/school/i18n";
import { staffCan } from "@/lib/school/permissions";
import { transliterateArabicName } from "@/lib/school/transliterate";
import { useWorkspace } from "@/lib/school/workspace";

export function AddStudentButton({ classId }: { classId: number }) {
  const { staff } = useWorkspace();
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  if (!staffCan(staff, "editStudents")) return null;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        {t("إضافة طالب")}
      </Button>
      <StudentEditorDialog
        open={open}
        onOpenChange={setOpen}
        mode="create"
        classId={classId}
      />
    </>
  );
}

export function EditStudentButton({
  student,
  showLabel = false,
}: {
  student: { id: number; name: string; nameEn?: string; parentPhone: string; parentPhone2?: string; workPhone?: string; nationalId?: string; nationality?: string; classId: number };
  showLabel?: boolean;
}) {
  const { staff } = useWorkspace();
  const [open, setOpen] = useState(false);
  if (!staffCan(staff, "editStudents")) return null;
  return (
    <>
      <Button
        size={showLabel ? "sm" : "icon-sm"}
        variant={showLabel ? "secondary" : "ghost"}
        aria-label={`تعديل بيانات ${student.name}`}
        onClick={() => setOpen(true)}
      >
        <Pencil className="size-4" />
        {showLabel ? tr("تعديل") : null}
      </Button>
      <StudentEditorDialog
        open={open}
        onOpenChange={setOpen}
        mode="edit"
        student={student}
        classId={student.classId}
      />
    </>
  );
}

export function DeleteStudentButton({
  student,
}: {
  student: { id: number; name: string; classId: number };
}) {
  const { staff } = useWorkspace();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: () => deleteStudent({ data: { studentId: student.id } }),
    onSuccess: () => {
      toast.success(`تم حذف ${student.name}`);
      void queryClient.invalidateQueries({ queryKey: ["class", student.classId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: ["student"] });
      void queryClient.invalidateQueries({ queryKey: ["roster"] });
      setOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحذف")),
  });
  if (!staffCan(staff, "editStudents")) return null;
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="text-danger"
        aria-label={`حذف ${student.name}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
        {tr("حذف")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("حذف الطالب")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-danger">
            سيُحذف {student.name} وجميع ملاحظاته. لا يمكن التراجع.
          </p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              className="flex-1"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              <Trash2 className="size-4" />
              {tr("تأكيد الحذف")}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {tr("إلغاء")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StudentEditorDialog({
  open,
  onOpenChange,
  mode,
  classId,
  student,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  classId: number;
  student?: { id: number; name: string; nameEn?: string; parentPhone: string; parentPhone2?: string; workPhone?: string; nationalId?: string; nationality?: string; classId: number };
}) {
  const { classes } = useWorkspace();
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [name, setName] = useState(student?.name ?? "");
  const [nameEn, setNameEn] = useState(student?.nameEn ?? "");
  const [enTouched, setEnTouched] = useState(false);
  const [phone, setPhone] = useState(student?.parentPhone ?? "");
  const [phone2, setPhone2] = useState(student?.parentPhone2 ?? "");
  const [workPhone, setWorkPhone] = useState(student?.workPhone ?? "");
  const [nationalId, setNationalId] = useState(student?.nationalId ?? "");
  const [nationality, setNationality] = useState(student?.nationality ?? "");
  const [targetClass, setTargetClass] = useState(String(student?.classId ?? classId));
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(student?.name ?? "");
    setNameEn(student?.nameEn?.trim() || transliterateArabicName(student?.name ?? ""));
    setEnTouched(Boolean(student?.nameEn?.trim()));
    setPhone(student?.parentPhone ?? "");
    setPhone2(student?.parentPhone2 ?? "");
    setWorkPhone(student?.workPhone ?? "");
    setNationalId(student?.nationalId ?? "");
    setNationality(student?.nationality ?? "");
    setTargetClass(String(student?.classId ?? classId));
    setConfirmDelete(false);
  }, [open, student, classId]);

  function invalidate(nextClassId?: number) {
    void queryClient.invalidateQueries({ queryKey: ["class", classId] });
    if (nextClassId && nextClassId !== classId) {
      void queryClient.invalidateQueries({ queryKey: ["class", nextClassId] });
    }
    void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
    void queryClient.invalidateQueries({ queryKey: ["student"] });
    void queryClient.invalidateQueries({ queryKey: ["roster"] });
    void queryClient.invalidateQueries({ queryKey: ["staff"] });
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (mode === "create") {
        return createStudent({
          data: {
            classId,
            name,
            nameEn,
            parentPhone: phone,
            parentPhone2: phone2,
            workPhone,
            nationalId,
            nationality,
          },
        });
      }
      return updateStudent({
        data: {
          studentId: student!.id,
          name,
          nameEn,
          parentPhone: phone,
          parentPhone2: phone2,
          workPhone,
          nationalId,
          nationality,
          classId: Number(targetClass),
        },
      });
    },
    onSuccess: () => {
      toast.success(mode === "create" ? t("تمت إضافة الطالب") : t("تم حفظ بيانات الطالب"));
      invalidate(Number(targetClass));
      onOpenChange(false);
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : t("تعذر الحفظ")),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteStudent({ data: { studentId: student!.id } }),
    onSuccess: () => {
      toast.success(tr("تم حذف الطالب"));
      invalidate();
      onOpenChange(false);
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحذف")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("إضافة طالب") : t("تعديل بيانات الطالب")}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="st-name">{t("اسم الطالب")}</Label>
            <Input
              id="st-name"
              value={name}
              onChange={(e) => {
                const next = e.target.value;
                setName(next);
                if (!enTouched) setNameEn(transliterateArabicName(next));
              }}
              required
              minLength={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st-name-en">{t("الاسم بالإنجليزية")}</Label>
            <Input
              id="st-name-en"
              value={nameEn}
              dir="ltr"
              className="text-left"
              onChange={(e) => {
                setEnTouched(true);
                setNameEn(e.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st-phone">{t("جوال الطالب / ولي الأمر")}</Label>
            <Input
              id="st-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="05xxxxxxxx"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st-phone-2">{t("رقم المنزل")}</Label>
            <Input
              id="st-phone-2"
              value={phone2}
              onChange={(e) => setPhone2(e.target.value)}
              inputMode="tel"
              placeholder="01xxxxxxxx"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st-phone-3">{t("رقم العمل")}</Label>
            <Input
              id="st-phone-3"
              value={workPhone}
              onChange={(e) => setWorkPhone(e.target.value)}
              inputMode="tel"
              placeholder="01xxxxxxxx"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="st-nid">{t("السجل المدني")}</Label>
              <Input id="st-nid" value={nationalId} onChange={(e) => setNationalId(e.target.value)} inputMode="numeric" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-nat">{t("الجنسية")}</Label>
              <Input id="st-nat" value={nationality} onChange={(e) => setNationality(e.target.value)} />
            </div>
          </div>
          {mode === "edit" ? (
            <div className="space-y-1.5">
              <Label htmlFor="st-class">{t("الفصل (للنقل)")}</Label>
              <Select
                id="st-class"
                value={targetClass}
                onChange={(e) => setTargetClass(e.target.value)}
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} — {c.stageName}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <Button
            type="submit"
            className="w-full"
            disabled={saveMutation.isPending || name.trim().length < 2}
          >
            {mode === "create" ? tr("إضافة") : tr("حفظ التعديلات")}
          </Button>
        </form>
        {mode === "edit" ? (
          <div className="mt-4 border-t border-border pt-4">
            {confirmDelete ? (
              <div className="space-y-2">
                <p className="text-sm text-danger">
                  سيُحذف الطالب وجميع ملاحظاته. لا يمكن التراجع.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    className="flex-1"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate()}
                  >
                    <Trash2 className="size-4" />
                    {tr("تأكيد الحذف")}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                    {tr("إلغاء")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" className="text-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" />
                {tr("حذف الطالب")}
              </Button>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
