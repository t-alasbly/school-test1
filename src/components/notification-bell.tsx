import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tr } from "@/lib/school/i18n";
import { useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getNotifications, markNotificationsRead } from "@/lib/school/api";
import { formatStamp } from "@/lib/school/constants";
import { staffCan } from "@/lib/school/permissions";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { staff } = useWorkspace();
  const seen = useRef<number | null>(null);
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => getNotifications(),
    refetchInterval: 5000,
  });

  const unread = query.data?.unread ?? 0;
  const items = query.data?.items ?? [];
  const canAdmin = staffCan(staff, "takeActions") || staffCan(staff, "acceptImprovements");
  const canCounsel = staffCan(staff, "counseling");

  useEffect(() => {
    if (seen.current === null) {
      seen.current = unread;
      return;
    }
    if (unread > seen.current) {
      const newest = items.find((i) => !i.read);
      if (newest) {
        toast(newest.title, { description: newest.body });
      }
    }
    seen.current = unread;
  }, [unread, items]);

  async function onOpenChange(open: boolean) {
    if (open && unread > 0) {
      await markNotificationsRead();
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  }

  function openItem(item: {
    kind: string;
    studentId?: number | null;
    classId?: number | null;
  }) {
    if (item.kind === "referral" && canCounsel) {
      void navigate({ to: "/counseling/referrals" });
      return;
    }
    if (item.kind === "digest-absence") {
      void navigate({ to: "/admin/absence", search: { range: "today" } });
      return;
    }
    if (item.kind === "digest-late") {
      void navigate({ to: "/admin/late", search: { range: "today" } });
      return;
    }
    if (item.kind === "login-help") {
      void navigate({ to: "/staff" });
      return;
    }
    if (item.classId && item.studentId) {
      void navigate({
        to: "/class/$classId",
        params: { classId: String(item.classId) },
        search: { student: item.studentId },
      });
      return;
    }
    if (item.studentId && canAdmin) {
      void navigate({ to: "/admin/behavior", search: { student: item.studentId } });
      return;
    }
    if (canAdmin) {
      void navigate({ to: "/admin" });
      return;
    }
    void navigate({ to: "/" });
  }

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative grid size-11 place-items-center rounded-[var(--radius-sm)] text-fg hover:bg-muted"
          aria-label={tr("الإشعارات")}
        >
          <Bell className="size-5" />
          {unread > 0 ? (
            <span className="absolute top-1.5 left-1.5 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-xs font-semibold leading-4 text-primary-fg tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel>{tr("التنبيهات")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-fg-muted">{tr("لا توجد تنبيهات بعد")}</p>
        ) : (
          items.slice(0, 8).map((item) => (
            <DropdownMenuItem
              key={item.id}
              className="flex flex-col items-stretch gap-0.5 py-2"
              onSelect={() => openItem(item)}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{item.title}</span>
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    item.tone === "danger"
                      ? "bg-danger"
                      : item.tone === "ok"
                        ? "bg-ok"
                        : "bg-warn",
                  )}
                />
              </span>
              <span className="text-xs leading-5 whitespace-pre-line text-fg-muted">{item.body}</span>
              <span className="text-xs text-fg-subtle">{formatStamp(item.createdAt)}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
