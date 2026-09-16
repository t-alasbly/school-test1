import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  ClipboardCheck,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  Printer,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { signOut } from "@/lib/auth/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { ROLE_LABEL, schoolLogoSrc } from "@/lib/school/constants";
import { formatToday } from "@/lib/school/calendar";
import { canFollowup, staffCan } from "@/lib/school/permissions";
import { useCalendar } from "@/lib/school/use-calendar";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./notification-bell";
import { SchoolMark } from "./school-mark";

const NAV: {
  to: string;
  label: string;
  counselorLabel?: string;
  icon: typeof BookOpen;
}[] = [
  { to: "/classes", label: "الفصول", icon: BookOpen },
  {
    to: "/admin",
    label: "الإدارة",
    counselorLabel: "شؤون الطلاب",
    icon: LayoutDashboard,
  },
  { to: "/attendance", label: "الغياب اليومي", icon: ClipboardCheck },
  { to: "/counseling", label: "الإرشاد", icon: HeartHandshake },
  { to: "/print", label: "الطباعة", icon: Printer },
  { to: "/settings", label: "الإعدادات", icon: Settings },
];

function navActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  if (to === "/classes") return pathname.startsWith("/classes") || pathname.startsWith("/stage") || pathname.startsWith("/class");
  if (to === "/settings") return pathname.startsWith("/settings") || pathname === "/staff" || pathname === "/import" || pathname === "/archive";
  if (to === "/admin") return pathname === "/admin" || pathname.startsWith("/admin/");
  if (to === "/counseling") return pathname === "/counseling" || pathname.startsWith("/counseling/");
  if (to === "/print") return pathname.startsWith("/print") || pathname === "/reports" || pathname === "/forms";
  return pathname === to;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { school, staff } = useWorkspace();
  const calendar = useCalendar();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const user = useCurrentUser();
  const [signingOut, setSigningOut] = useState(false);
  const schoolLogo = schoolLogoSrc(school.logoUrl);
  const items = NAV.filter((item) => {
    if (staff.role === "pending") return false;
    if (item.to === "/classes") return staffCan(staff, "viewClasses");
    if (item.to === "/admin") return canFollowup(staff);
    if (item.to === "/attendance") return staffCan(staff, "dailyAttendance");
    if (item.to === "/counseling") return staffCan(staff, "counseling");
    if (item.to === "/print") return staffCan(staff, "viewPrint");
    return true;
  });

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="app-header no-print sticky top-0 z-40 border-b border-border bg-bg-elevated/95 backdrop-blur-sm">
        <div className="mx-auto flex min-h-14 max-w-6xl items-center gap-3 px-4 py-2">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{school.name}</span>
              <span className="block truncate text-xs text-fg-muted">
                {school.tagline?.trim() || "متابعة الطلاب الشاملة"}
              </span>
            </span>
          </Link>
          <nav className="mx-auto hidden items-center gap-1 md:flex">
            {items.map((item) => {
              const active = navActive(pathname, item.to);
              const Icon = item.icon;
              const label =
                staff.role === "counselor" && item.counselorLabel
                  ? item.counselorLabel
                  : item.label;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors duration-150",
                    active
                      ? "bg-primary text-primary-fg"
                      : "text-fg-muted hover:bg-muted hover:text-fg",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="ms-auto flex items-center gap-1">
            <p className="hidden text-xs text-fg-muted lg:block">{formatToday(calendar)}</p>
            <NotificationBell />
            <div className="hidden min-w-0 items-center gap-2 pe-1 sm:flex">
              <span className="max-w-28 truncate text-sm font-medium">
                {staff.displayName}
              </span>
              <span className="hidden text-xs text-fg-subtle lg:inline">
                · {ROLE_LABEL[staff.role]}
              </span>
            </div>
            {user && !user.isDevFallback ? (
              <button
                type="button"
                disabled={signingOut}
                onClick={() => {
                  setSigningOut(true);
                  void signOut().catch(() => setSigningOut(false));
                }}
                className="grid size-11 place-items-center rounded-[var(--radius-sm)] text-fg-muted hover:bg-muted hover:text-fg"
                aria-label="تسجيل الخروج"
              >
                <LogOut className="size-4" />
              </button>
            ) : null}
            {schoolLogo ? <SchoolMark size="sm" src={schoolLogo} /> : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 md:pb-10">{children}</main>
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg-elevated/95 backdrop-blur-sm md:hidden">
        <div className="flex items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
          {items.map((item) => {
            const active = navActive(pathname, item.to);
            const Icon = item.icon;
            const label =
              staff.role === "counselor" && item.counselorLabel
                ? item.counselorLabel
                : item.label;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium",
                  active ? "text-primary" : "text-fg-muted",
                )}
              >
                <Icon className="size-5" />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
