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
import { staffCan } from "@/lib/school/permissions";
import { useWorkspace } from "@/lib/school/workspace";

export function AddStudentButton({ classId }: { classId: number }) {
  const { staff } = useWorkspace();
  const [open, setOpen] = useState(false);
  if (!staffCan(staff, "editStudents")) return null;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        إضافة طالب
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
}: {
  student: { id: number; name: string; parentPhone: string; classId: number };
}) {
  const { staff } = useWorkspace();
  const [open, setOpen] = useState(false);
  if (!staffCan(staff, "editStudents")) return null;
  return (
    <>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`تعديل بيانات ${student.name}`}
        onClick={() => setOpen(true)}
      >
        <Pencil className="size-4" />
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
  student?: { id: number; name: string; parentPhone: string; classId: number };
}) {
  const { classes } = useWorkspace();
  const queryClient = useQueryClient();
  const [name, setName] = useState(student?.name ?? "");
  const [phone, setPhone] = useState(student?.parentPhone ?? "");
  const [targetClass, setTargetClass] = useState(String(student?.classId ?? classId));
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(student?.name ?? "");
    setPhone(student?.parentPhone ?? "");
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
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (mode === "create") {
        return createStudent({
          data: {
            classId,
            name,
            parentPhone: phone,
          },
        });
      }
      return updateStudent({
        data: {
          studentId: student!.id,
          name,
          parentPhone: phone,
          classId: Number(targetClass),
        },
      });
    },
    onSuccess: () => {
      toast.success(mode === "create" ? "تمت إضافة الطالب" : "تم حفظ بيانات الطالب");
      invalidate(Number(targetClass));
      onOpenChange(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteStudent({ data: { studentId: student!.id } }),
    onSuccess: () => {
      toast.success("تم حذف الطالب");
      invalidate();
      onOpenChange(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحذف"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "إضافة طالب" : "تعديل بيانات الطالب"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="st-name">اسم الطالب</Label>
            <Input
              id="st-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st-phone">جوال ولي الأمر</Label>
            <Input
              id="st-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="05xxxxxxxx"
            />
          </div>
          {mode === "edit" ? (
            <div className="space-y-1.5">
              <Label htmlFor="st-class">الفصل (للنقل)</Label>
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
            {mode === "create" ? "إضافة" : "حفظ التعديلات"}
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
                    تأكيد الحذف
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                    إلغاء
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" className="text-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" />
                حذف الطالب
              </Button>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
