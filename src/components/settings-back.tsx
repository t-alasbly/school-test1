import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

export function SettingsBack() {
  return (
    <Link
      to="/settings"
      className="inline-flex h-11 items-center gap-2 text-sm text-fg-muted transition-colors hover:text-fg"
    >
      <ArrowRight className="size-4" />
      رجوع للإعدادات
    </Link>
  );
}
