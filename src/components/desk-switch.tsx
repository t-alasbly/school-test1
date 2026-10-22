import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listStaff, setDeskTarget } from "@/lib/school/api";
import { ROLE_LABEL } from "@/lib/school/constants";
import { tr } from "@/lib/school/i18n";
import { staffCan } from "@/lib/school/permissions";
import { useWorkspace } from "@/lib/school/workspace";

export const DESK_AS_EVENT = "desk-as-change";

export function DeskSwitch() {
  const { actor } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canOpen = actor.role === "admin" || staffCan(actor, "viewAllViolations");
  const [asId, setAsId] = useState("");
  const people = useQuery({
    queryKey: ["staff-list"],
    queryFn: () => listStaff(),
    enabled: canOpen,
  });
  useEffect(() => {
    if (!canOpen) return;
    const saved = sessionStorage.getItem("desk_as") || "";
    setAsId(saved);
    if (saved) void setDeskTarget({ data: { staffId: saved } });
  }, [canOpen]);
  if (!canOpen) return null;
  async function choose(id: string) {
    await setDeskTarget({ data: { staffId: id } });
    if (id) sessionStorage.setItem("desk_as", id);
    else sessionStorage.removeItem("desk_as");
    setAsId(id);
    window.dispatchEvent(new CustomEvent(DESK_AS_EVENT, { detail: id }));
    await queryClient.invalidateQueries();
    if (id) void navigate({ to: "/desk" });
    else void navigate({ to: actor.role === "admin" || actor.role === "principal" ? "/admin" : "/desk" });
  }
  const list = ((people.data ?? []) as { userId: string; displayName: string; role: string; active?: boolean }[])
    .filter((person) => person.active !== false && person.role !== "pending" && person.userId !== actor.userId);
  return (
    <label className="flex items-center gap-1">
      <span className="sr-only">{tr("مكتب المعلم")}</span>
      <select
        className="h-9 max-w-44 rounded-full border border-border bg-bg px-2 text-xs font-semibold"
        value={asId}
        onChange={(event) => void choose(event.target.value)}
        aria-label={tr("مكتب المعلم")}
      >
        <option value="">{actor.role === "admin" ? tr("المستخدم الرئيسي") : tr("مكتبي")}</option>
        {list.map((person) => (
          <option key={person.userId} value={person.userId}>
            {person.displayName} · {ROLE_LABEL[person.role as keyof typeof ROLE_LABEL] || person.role}
          </option>
        ))}
      </select>
    </label>
  );
}
