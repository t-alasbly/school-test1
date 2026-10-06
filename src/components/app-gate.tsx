import { useQuery } from "@tanstack/react-query";
import { tr } from "@/lib/school/i18n";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getWorkspace } from "@/lib/school/api";
import { WorkspaceContext } from "@/lib/school/workspace";
import { AppShell } from "./app-shell";
import { SchoolMark } from "./school-mark";
import { ThemeApplier } from "./theme-applier";
import { Skeleton } from "./ui/skeleton";

export function AppGate({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const workspace = useQuery({
    queryKey: ["workspace"],
    queryFn: () => getWorkspace(),
    enabled: Boolean(user),
  });

  if (isPending) return <BootScreen />;
  if (!user) return <RedirectToSignIn />;
  if (workspace.isPending) return <BootScreen />;
  if (workspace.isError || !workspace.data) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div className="max-w-sm space-y-3">
          <SchoolMark size="lg" className="mx-auto" />
          <h1 className="text-xl font-semibold">{tr("تعذر تحميل المدرسة")}</h1>
          <p className="text-sm text-fg-muted">
            {workspace.error instanceof Error
              ? workspace.error.message
              : tr("حاول تحديث الصفحة.")}
          </p>
        </div>
      </div>
    );
  }

  if (workspace.data.staff.role === "pending") {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg px-6 text-center">
        <div className="max-w-md space-y-4">
          <SchoolMark size="lg" className="mx-auto" />
          <h1 className="text-2xl font-semibold">{tr("بانتظار موافقة الإدارة")}</h1>
          <p className="text-fg-muted">
            تم إنشاء حسابك في {workspace.data.school.name}. سيظهر لك التطبيق بعد
            أن يعتمد المدير صلاحيتك كمعلم أو أحد مسميات القيادة والإرشاد.
          </p>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceContext.Provider value={workspace.data}>
      <ThemeApplier />
      <AppShell>{children}</AppShell>
    </WorkspaceContext.Provider>
  );
}

function BootScreen() {
  return (
    <div className="min-h-dvh bg-bg px-4 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex items-center gap-3">
          <Skeleton className="size-11 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <p className="text-sm text-fg-muted">{tr("جارٍ تجهيز لوحة المتابعة…")}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-44 rounded-[var(--radius-xl)]" />
          <Skeleton className="h-44 rounded-[var(--radius-xl)]" />
          <Skeleton className="h-44 rounded-[var(--radius-xl)]" />
        </div>
      </div>
    </div>
  );
}
