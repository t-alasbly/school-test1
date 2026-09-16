import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";
import { SectionNav } from "@/components/section-nav";

export const Route = createFileRoute("/desk")({ component: DeskLayout });

const DESK_NAV = [
  { to: "/desk", label: "ملاحظاتي" },
  { to: "/desk/closed", label: "رُد عليها" },
  { to: "/desk/waiting", label: "تنتظر الرد" },
  { to: "/desk/counselor", label: "حالاتي" },
  { to: "/desk/mail", label: "مراسلاتي" },
];

function DeskLayout() {
  return (
    <AppGate>
      <div className="space-y-5">
        <header className="no-print">
          <p className="text-sm text-fg-muted">صفحة خاصة بك وبطلابك: ما حرّرته وما أُحيل للإرشاد أو لوكيل شؤون الطلاب وما جرى عليه</p>
          <h1 className="text-3xl font-semibold tracking-tight">مكتبي</h1>
        </header>
        <SectionNav items={DESK_NAV} />
        <Outlet />
      </div>
    </AppGate>
  );
}
