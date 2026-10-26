import { Phone } from "lucide-react";
import { tr } from "@/lib/school/i18n";
import { canCallParent } from "@/lib/school/permissions";
import { useWorkspace } from "@/lib/school/workspace";

function dialable(phone?: string) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 9 ? digits : "";
}

export function CallParent({ phones }: { phones: Array<string | null | undefined> }) {
  const { staff } = useWorkspace();
  if (!canCallParent(staff)) return null;
  const number = phones.map((phone) => dialable(phone || "")).find(Boolean);
  if (!number) return null;
  return (
    <a
      href={`tel:${number}`}
      aria-label={tr("اتصال بولي الأمر")}
      title={tr("اتصال بولي الأمر")}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"
      onClick={(event) => event.stopPropagation()}
    >
      <Phone className="size-4" />
    </a>
  );
}
