import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";

export const Route = createFileRoute("/settings")({ component: SettingsLayout });

function SettingsLayout() {
  return (
    <AppGate>
      <Outlet />
    </AppGate>
  );
}
