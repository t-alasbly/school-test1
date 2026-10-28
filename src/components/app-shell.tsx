import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  HeartHandshake,
  Languages,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Printer,
  Settings,
} from "lucide-react";
import { useEffect, useState } from "react";
import { signOut } from "@/lib/auth/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { ROLE_LABEL, schoolLogoSrc } from "@/lib/school/constants";
import { rememberLocale, tr, useLocale } from "@/lib/school/i18n";
import { formatToday } from "@/lib/school/calendar";
import { canFollowup, staffCan } from "@/lib/school/permissions";
import { useCalendar } from "@/lib/school/use-calendar";
import { useWorkspace } from "@/lib/school/workspace";
import type { Staff } from "@/lib/school/types";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./notification-bell";
import { DeskSwitch } from "./desk-switch";
import { SchoolMark } from "./school-mark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const NAV: {
  to: string;
  label: string;
  counselorLabel?: string;
  icon: typeof BookOpen;
}[] = [
  { to: "/desk", label: tr("مكتبي"), icon: ClipboardList },
  { to: "/classes", label: tr("الفصول"), icon: BookOpen },
  {
    to: "/admin",
    label: tr("الإدارة"),
    counselorLabel: tr("شؤون الطلاب"),
    icon: LayoutDashboard,
  },
  { to: "/attendance", label: tr("الغياب اليومي"), icon: ClipboardCheck },
  { to: "/messages", label: tr("الرسائل"), icon: MessageCircle },
  { to: "/counseling", label: tr("الإرشاد"), icon: HeartHandshake },
  { to: "/print", label: tr("الطباعة"), icon: Printer },
];

function navActive(pathname: string, to: string, fromDesk: boolean) {
  if (to === "/desk") return pathname === "/desk" || pathname.startsWith("/desk/") || (fromDesk && pathname.startsWith("/class"));
  if (to === "/classes") {
    if (fromDesk && pathname.startsWith("/class")) return false;
    return pathname.startsWith("/classes") || pathname.startsWith("/stage") || pathname.startsWith("/class");
  }
  if (to === "/settings") return pathname.startsWith("/settings") || pathname === "/staff" || pathname === "/import" || pathname === "/archive";
  if (to === "/admin") return pathname === "/admin" || pathname.startsWith("/admin/");
  if (to === "/counseling") return pathname === "/counseling" || pathname.startsWith("/counseling/");
  if (to === "/print") return pathname.startsWith("/print") || pathname === "/reports" || pathname === "/forms";
  return pathname === to;
}

function teacherCanOpen(pathname: string, person: Staff) {
  if (pathname.startsWith("/desk") || pathname === "/") return true;
  if (pathname.startsWith("/classes") || pathname.startsWith("/stage") || pathname.startsWith("/class")) return staffCan(person, "viewClasses");
  if (pathname.startsWith("/print") || pathname === "/reports" || pathname === "/forms") return staffCan(person, "viewPrint");
  if (pathname.startsWith("/messages")) return staffCan(person, "sendMessages");
  if (pathname.startsWith("/attendance")) return staffCan(person, "dailyAttendance");
  if (pathname.startsWith("/counseling")) return staffCan(person, "counseling");
  if (pathname.startsWith("/admin")) return canFollowup(person);
  if (pathname === "/settings" || pathname === "/settings/" || pathname.startsWith("/settings/profile") || pathname.startsWith("/settings/subject") || pathname.startsWith("/settings/appearance")) return true;
  if (pathname.startsWith("/settings") || pathname.startsWith("/staff") || pathname.startsWith("/import") || pathname.startsWith("/archive")) {
    return person.role === "admin" || staffCan(person, "editStaff") || staffCan(person, "editClasses");
  }
  return true;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { school, staff, actor } = useWorkspace();
  const navigate = useNavigate();
  const { t, locale, setLocale } = useLocale();
  const calendar = useCalendar();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fromDesk = useRouterState({
    select: (s) => {
      const search = s.location.search as { from?: string } | string;
      if (typeof search === "string") return new URLSearchParams(search).get("from") === "desk";
      return search?.from === "desk";
    },
  });
  const user = useCurrentUser();
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    const preferred = staff.appearance?.locale;
    if (preferred !== "ar" && preferred !== "en") return;
    if (window.localStorage.getItem("school-locale-chosen") === "1") {
      window.localStorage.setItem("school-locale-user", staff.userId);
      window.localStorage.removeItem("school-locale-chosen");
      return;
    }
    if (window.localStorage.getItem("school-locale-user") === staff.userId) return;
    window.localStorage.setItem("school-locale-user", staff.userId);
    rememberLocale(preferred);
    if (preferred !== locale) window.location.reload();
  }, [staff.userId, staff.appearance?.locale, locale]);
  const schoolLogo = schoolLogoSrc(school.logoUrl);
  const preview = actor.userId !== staff.userId;
  useEffect(() => {
    if (!preview) return;
    if (!teacherCanOpen(pathname, staff)) void navigate({ to: "/desk" });
  }, [preview, pathname, staff, navigate]);
  const items = NAV.filter((item) => {
    if (staff.role === "pending") return false;
    if (item.to === "/classes") return staffCan(staff, "viewClasses");
    if (item.to === "/admin") return canFollowup(staff);
    if (item.to === "/attendance") return staffCan(staff, "dailyAttendance");
    if (item.to === "/messages") return staffCan(staff, "sendMessages");
    if (item.to === "/counseling") return staffCan(staff, "counseling");
    if (item.to === "/print") return staffCan(staff, "viewPrint");
    return true;
  });

  return (
    <div className="min-h-dvh min-w-0 bg-bg text-fg">
      <header className="app-header no-print sticky top-0 z-40 border-b border-border bg-bg-elevated/95 backdrop-blur-sm">
        <div className="mx-auto flex min-h-14 max-w-6xl items-center gap-3 px-4 py-2">
          <Link to="/desk" className="flex min-w-0 items-center gap-2">
            <SchoolMark size="sm" src={schoolLogo || undefined} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{school.name}</span>
              <span className="block truncate text-xs text-fg-muted">
                {school.tagline?.trim() || t("متابعة الطلاب الشاملة")}
              </span>
            </span>
          </Link>
          <nav className="mx-auto hidden items-center gap-1 md:flex">
            {items.map((item) => {
              const active = navActive(pathname, item.to, fromDesk);
              const Icon = item.icon;
              const label = t(
                staff.role === "counselor" && item.counselorLabel ? item.counselorLabel : item.label,
              );
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
            <DeskSwitch />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-10 max-w-40 items-center gap-1 rounded-full px-2 text-sm font-medium hover:bg-muted sm:max-w-56"
                >
                  <span className="min-w-0 truncate">{staff.displayName}</span>
                  <ChevronDown className="size-4 shrink-0 text-fg-muted" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-sm text-fg">
                  <span className="block truncate font-semibold">{staff.displayName}</span>
                  <span className="block truncate font-normal text-fg-muted">{t(tr(ROLE_LABEL[staff.role]))}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setLocale(locale === "ar" ? "en" : "ar", { save: false })}>
                  <Languages className="size-4" />
                  {locale === "ar" ? "English" : tr("العربية")}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings">
                    <Settings className="size-4" />
                    {t("الإعدادات")}
                  </Link>
                </DropdownMenuItem>
                {user && !user.isDevFallback ? (
                  <DropdownMenuItem
                    disabled={signingOut}
                    onSelect={() => {
                      setSigningOut(true);
                      void signOut().catch(() => setSigningOut(false));
                    }}
                    className="text-danger focus:text-danger"
                  >
                    <LogOut className="size-4" />
                    {t("تسجيل الخروج")}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="mx-auto min-w-0 max-w-6xl px-4 py-6 pb-24 md:pb-10">{children}</main>
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg-elevated/95 backdrop-blur-sm md:hidden">
        <div className="flex items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
          {items.map((item) => {
            const active = navActive(pathname, item.to, fromDesk);
            const Icon = item.icon;
            const label = t(
              staff.role === "counselor" && item.counselorLabel ? item.counselorLabel : item.label,
            );
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-fg-muted",
                )}
              >
                <Icon className="size-4" />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
