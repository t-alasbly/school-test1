import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function SectionNav({
  items,
}: {
  items: { to: string; label: string }[];
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="no-print flex flex-wrap gap-1.5">
      {items.map((item) => {
        const active =
          item.to === pathname ||
          (item.to !== "/" && item.to !== "/admin" && item.to !== "/counseling" && item.to !== "/print" && item.to !== "/desk" && pathname.startsWith(item.to)) ||
          (item.to === "/admin" && (pathname === "/admin" || pathname === "/admin/")) ||
          (item.to === "/counseling" && (pathname === "/counseling" || pathname === "/counseling/")) ||
          (item.to === "/print" && (pathname === "/print" || pathname === "/print/")) ||
          (item.to === "/desk" && (pathname === "/desk" || pathname === "/desk/"));
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "inline-flex h-10 shrink-0 items-center rounded-full border px-3 text-sm font-medium",
              active
                ? "border-primary bg-primary text-primary-fg"
                : "border-border bg-bg-elevated text-fg-muted hover:text-fg",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
