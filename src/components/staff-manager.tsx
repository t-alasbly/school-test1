import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Shield, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { bulkDeleteStaff, createStaffUser, deleteStaffPermanent, listStaff, setStaffActive, updateStaffMember, updateStaffPermissions } from "@/lib/school/api";
import { ASSIGNABLE_ROLES, CREATE_ROLES, ROLE_LABEL, formatStamp } from "@/lib/school/constants";
import { PERMISSION_META, staffCan, type StaffPermissions } from "@/lib/school/permissions";
import type { StaffRole } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

function roleTone(role: StaffRole) {
  if (role === "pending") return "warn" as const;
  if (role === "admin" || role === "principal") return "primary" as const;
  if (role === "counselor" || role === "school_vp" || role === "teachers_vp") return "ok" as const;
  return "default" as const;
}

type StaffRow = Awaited<ReturnType<typeof listStaff>>[number];

export function StaffManager({ compact = false }: { compact?: boolean }) {
  const { staff } = useWorkspace();
  const queryClient = useQueryClient();
  const canManage = staffCan(staff, "editStaff");
  const query = useQuery({
    queryKey: ["staff"],
    queryFn: () => listStaff(),
    enabled: canManage,
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("1234");
  const [subject, setSubject] = useState("");
  const [role, setRole] = useState<Exclude<StaffRole, "pending">>("teacher");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [permsFor, setPermsFor] = useState<StaffRow | null>(null);
  const [cancelFor, setCancelFor] = useState<StaffRow | null>(null);
  const [deleteFor, setDeleteFor] = useState<StaffRow | null>(null);
  const [editing, setEditing] = useState<{
    userId: string;
    displayName: string;
    role: StaffRole;
    subject: string;
    phone: string;
    password: string;
  } | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      createStaffUser({
        data: { name, email, phone, password, role, subject },
      }),
    onSuccess: () => {
      toast.success("تم إضافة المستخدم");
      setName("");
      setEmail("");
      setPhone("");
      setPassword("1234");
      setSubject("");
      setRole("teacher");
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الإضافة"),
  });

  const updateMutation = useMutation({
    mutationFn: (input: {
      userId: string;
      displayName: string;
      role: StaffRole;
      subject: string;
      phone: string;
      password?: string;
    }) =>
      updateStaffMember({
        data: {
          ...input,
          password: input.password?.trim() ? input.password.trim() : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ بيانات المستخدم");
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر التحديث"),
  });

  const activeMutation = useMutation({
    mutationFn: (input: { userId: string; active: boolean }) => setStaffActive({ data: input }),
    onSuccess: (res) => {
      toast.success(res.active ? `أُعيد تفعيل ${res.displayName}` : `أُلغي حساب ${res.displayName}`);
      setCancelFor(null);
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر تغيير حالة الحساب"),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (input: { scope: "teachers" | "selected"; userIds?: string[] }) =>
      bulkDeleteStaff({ data: input }),
    onSuccess: (res) => {
      toast.success(`حُذف ${res.deleted} حساب` + (res.skipped?.length ? ` — تُرك ${res.skipped.length}` : ""));
      setSelected({});
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحذف"),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => deleteStaffPermanent({ data: { userId } }),
    onSuccess: (res) => {
      toast.success(`حُذف حساب ${res.displayName} نهائياً`);
      setDeleteFor(null);
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحذف"),
  });

  const permMutation = useMutation({
    mutationFn: (input: { userId: string; permissions: StaffPermissions }) =>
      updateStaffPermissions({ data: input }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["staff"] });
      const previous = queryClient.getQueryData<StaffRow[]>(["staff"]);
      queryClient.setQueryData<StaffRow[]>(["staff"], (old) =>
        (old ?? []).map((member) =>
          member.userId === input.userId ? { ...member, permissions: input.permissions } : member,
        ),
      );
      return { previous };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["staff"], ctx.previous);
      toast.error(err instanceof Error ? err.message : "تعذر حفظ الصلاحية");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
  });

  if (!canManage) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{compact ? "إضافة معلم" : "إضافة معلم أو مستخدم"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-name">الاسم</Label>
              <Input
                id="new-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: سعد العتيبي"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-phone">رقم الجوال (اسم المستخدم)</Label>
              <Input
                id="new-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05xxxxxxxx"
                dir="ltr"
                className="text-left"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-email">البريد الإلكتروني (اختياري)</Label>
              <Input
                id="new-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="إن وُجد بدل الجوال"
                dir="ltr"
                className="text-left"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-subject">المادة</Label>
              <Input
                id="new-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="رياضيات، لغتي…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pass">كلمة المرور</Label>
              <Input
                id="new-pass"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="الافتراضي 1234"
                required
                minLength={4}
                dir="ltr"
                className="text-left"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-role">المسمى الوظيفي</Label>
              <Select
                id="new-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Exclude<StaffRole, "pending">)}
              >
                {CREATE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Button
                type="submit"
                disabled={
                  createMutation.isPending ||
                  name.trim().length < 2 ||
                  password.length < 4 ||
                  (!phone.trim() && !email.trim())
                }
              >
                إضافة المستخدم
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={bulkDeleteMutation.isPending}
          onClick={() => {
            const n = (query.data ?? []).filter((m) => m.role === "teacher").length;
            if (!n) {
              toast.error("لا يوجد معلمون للحذف");
              return;
            }
            if (window.confirm(`حذف جميع المعلمين (${n}) نهائياً؟ لا يُحذف حسابك. لا يمكن التراجع.`)) {
              bulkDeleteMutation.mutate({ scope: "teachers" });
            }
          }}
        >
          حذف جميع المعلمين
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={bulkDeleteMutation.isPending || !Object.values(selected).some(Boolean)}
          onClick={() => {
            const ids = Object.keys(selected).filter((id) => selected[id]);
            if (!ids.length) return;
            if (window.confirm(`حذف ${ids.length} حساب محدد نهائياً؟ لا يمكن التراجع.`)) {
              bulkDeleteMutation.mutate({ scope: "selected", userIds: ids });
            }
          }}
        >
          حذف المحددين
        </Button>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
        {(query.data ?? []).map((member) => (
          <li key={member.userId} className={cn("px-4 py-3", member.active === false && "opacity-60")}>
            <div className="flex flex-wrap items-center gap-2">
              {member.userId !== staff.userId ? (
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={Boolean(selected[member.userId])}
                  onChange={(e) =>
                    setSelected((prev) => ({ ...prev, [member.userId]: e.target.checked }))
                  }
                  aria-label={`تحديد ${member.displayName}`}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{member.displayName}</p>
                <p className="text-xs text-fg-subtle">
                  {member.phone || member.email || "بدون حساب دخول"}
                  {member.subject ? ` · ${member.subject}` : ""}
                  {` · ${formatStamp(member.createdAt)}`}
                </p>
              </div>
              <Badge tone={roleTone(member.role)}>{ROLE_LABEL[member.role]}</Badge>
              {member.active === false ? <Badge tone="danger">ملغى</Badge> : null}
              {member.role === "admin" ? (
                <span className="text-xs text-fg-muted">كل الصلاحيات</span>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPermsFor(member)}
                  aria-label={`صلاحيات ${member.displayName}`}
                >
                  <Shield className="size-4" />
                  صلاحيات
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setEditing({
                    userId: member.userId,
                    displayName: member.displayName,
                    role: member.role,
                    subject: member.subject,
                    phone: member.phone,
                    password: "",
                  })
                }
              >
                تعديل
              </Button>
              {member.userId === staff.userId ? (
                <span className="text-xs text-fg-muted">حسابك</span>
              ) : member.active === false ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={activeMutation.isPending}
                  onClick={() => activeMutation.mutate({ userId: member.userId, active: true })}
                >
                  إعادة تفعيل
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCancelFor(member)}
                  aria-label={`إلغاء ${member.displayName}`}
                >
                  <Ban className="size-4" />
                  إلغاء
                </Button>
              )}
              {member.userId !== staff.userId ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setDeleteFor(member)}
                  aria-label={`حذف ${member.displayName} نهائياً`}
                >
                  <Trash2 className="size-4 text-danger" />
                  حذف نهائي
                </Button>
              ) : null}
            </div>
          </li>
        ))}
        {query.data?.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-fg-muted">لا يوجد موظفون بعد</li>
        ) : null}
      </ul>

      <Dialog open={editing != null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل المستخدم</DialogTitle>
          </DialogHeader>
          {editing ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                updateMutation.mutate(editing);
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">الاسم</Label>
                <Input
                  id="edit-name"
                  value={editing.displayName}
                  onChange={(e) =>
                    setEditing({ ...editing, displayName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-phone">الجوال</Label>
                <Input
                  id="edit-phone"
                  value={editing.phone}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  dir="ltr"
                  className="text-left"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-pass">كلمة المرور</Label>
                <Input
                  id="edit-pass"
                  type="text"
                  value={editing.password}
                  onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                  placeholder="اتركه فارغاً إن لم ترد التغيير"
                  dir="ltr"
                  className="text-left"
                  autoComplete="new-password"
                />
                <p className="text-xs text-fg-muted">إن كُتبت بالخطأ يمكنك تصحيحها هنا دون إنشاء حساب جديد.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-subject">المادة</Label>
                <Input
                  id="edit-subject"
                  value={editing.subject}
                  onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-role">المسمى الوظيفي</Label>
                <Select
                  id="edit-role"
                  value={editing.role}
                  onChange={(e) =>
                    setEditing({ ...editing, role: e.target.value as StaffRole })
                  }
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={
                  updateMutation.isPending ||
                  editing.displayName.trim().length < 2 ||
                  (editing.password.trim().length > 0 && editing.password.trim().length < 4)
                }
              >
                حفظ التعديلات
              </Button>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={permsFor != null} onOpenChange={(open) => !open && setPermsFor(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>صلاحيات {permsFor?.displayName}</DialogTitle>
          </DialogHeader>
          {permsFor ? (
            <div className="space-y-2">
              <p className="text-sm text-fg-muted">
                اختر المسموح به لهذا الموظف ثم أغلق النافذة. لا تظهر صلاحيات الجميع في القائمة.
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {PERMISSION_META.map((item) => {
                  const live = (query.data ?? []).find((m) => m.userId === permsFor.userId);
                  const on = (live ?? permsFor).permissions[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      disabled={false}
                      onClick={() =>
                        permMutation.mutate({
                          userId: permsFor.userId,
                          permissions: { ...(live ?? permsFor).permissions, [item.key]: !on },
                        })
                      }
                      className={cn(
                        "flex min-h-12 items-start gap-2 rounded-[var(--radius-sm)] border px-2.5 py-2 text-right transition-colors",
                        on
                          ? "border-primary bg-primary/10 text-fg"
                          : "border-border bg-bg-elevated text-fg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-[4px] border",
                          on
                            ? "border-primary bg-primary text-primary-fg"
                            : "border-border-strong bg-card",
                        )}
                      >
                        {on ? <Check className="size-3.5" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-5">{item.label}</span>
                        <span className="mt-0.5 block text-[11px] leading-4 opacity-80">{item.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <Button type="button" className="w-full" variant="secondary" onClick={() => setPermsFor(null)}>
                تم
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={cancelFor != null} onOpenChange={(open) => !open && setCancelFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إلغاء حساب {cancelFor?.displayName}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-fg-muted">
            لن يتمكن من الدخول حتى تعيد تفعيله. سجل ملاحظاته ورسائله يبقى محفوظاً.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setCancelFor(null)}>
              تراجع
            </Button>
            <Button
              className="flex-1"
              disabled={activeMutation.isPending || !cancelFor}
              onClick={() =>
                cancelFor && activeMutation.mutate({ userId: cancelFor.userId, active: false })
              }
            >
              تأكيد الإلغاء
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteFor != null} onOpenChange={(open) => !open && setDeleteFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف {deleteFor?.displayName} نهائياً</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-fg-muted">
            يُحذف الحساب ولا يمكنه الدخول بعد ذلك. ملاحظاته ورسائله تبقى في السجل باسم «معلم». لا يمكن التراجع.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteFor(null)}>
              تراجع
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={deleteMutation.isPending || !deleteFor}
              onClick={() => deleteFor && deleteMutation.mutate(deleteFor.userId)}
            >
              تأكيد الحذف النهائي
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
