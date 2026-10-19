import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { StudentSheet } from "@/components/student-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { decideClassMove, listDeskInbox } from "@/lib/school/api";
import { ROLE_LABEL } from "@/lib/school/constants";
import { tr } from "@/lib/school/i18n";
import { canSeeClassMoves } from "@/lib/school/permissions";
import { useWorkspace } from "@/lib/school/workspace";

type MoveRow = {
  id: number;
  studentId: number;
  studentName: string;
  fromLabel: string;
  toLabel: string;
  requesterName: string;
  requesterRole: string;
  status?: "pending" | "applied" | "rejected";
  reason?: string;
  deciderName?: string;
  createdAt: string;
  decidedAt?: string;
};

type NoticeRow = {
  id: number;
  studentId: number | null;
  studentName: string;
  body: string;
  createdAt: string;
};

function ResultCard({ row }: { row: MoveRow }) {
  const accepted = row.status === "applied";
  const rejected = row.status === "rejected";
  return (
    <li className="rounded-[var(--radius-md)] border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={accepted ? "ok" : rejected ? "danger" : "warn"}>
          {accepted ? tr("تم القبول") : rejected ? tr("تم الرفض") : tr("بانتظار القرار")}
        </Badge>
        {row.deciderName ? <span className="text-xs text-fg-muted">{tr("قرره")} {row.deciderName}</span> : null}
      </div>
      <p className="mt-2 text-base font-semibold">{row.studentName}</p>
      <p className="text-sm text-fg-muted">
        {tr("من")} {row.fromLabel} {tr("إلى")} {row.toLabel}
      </p>
      {rejected && row.reason ? <p className="mt-2 text-sm leading-6">{tr("سبب الرفض")}: {row.reason}</p> : null}
      {accepted ? <p className="mt-2 text-sm text-ok">{tr("تم قبول النقل")}</p> : null}
    </li>
  );
}

export function ClassMoveInbox({ variant = "embed" }: { variant?: "page" | "embed" }) {
  const { staff } = useWorkspace();
  const allowed = canSeeClassMoves(staff);
  const queryClient = useQueryClient();
  const [studentId, setStudentId] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const query = useQuery({
    queryKey: ["desk-inbox"],
    queryFn: () => listDeskInbox(),
  });
  const data = query.data as {
    visible?: boolean;
    moves?: MoveRow[];
    notices?: NoticeRow[];
    decisions?: MoveRow[];
    mine?: MoveRow[];
  } | undefined;
  const moves = data?.moves ?? [];
  const notices = data?.notices ?? [];
  const allDecisions = data?.decisions ?? [];
  const decisions = variant === "page" ? allDecisions : allDecisions.slice(0, 8);
  const mine = (data?.mine ?? []).filter((row) => !moves.some((item) => item.id === row.id));
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["desk-inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["home-desk"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["student"] });
    void queryClient.invalidateQueries({ queryKey: ["class"] });
  };
  const move = useMutation({
    mutationFn: (input: { requestId: number; decision: "apply" | "reject"; reason?: string }) => decideClassMove({ data: input }),
    onSuccess: (result) => {
      const row = result as { applied?: boolean; studentName?: string; toLabel?: string };
      toast.success(row?.applied ? `${tr("تم تنفيذ النقل")} — ${row.studentName ?? ""} ${row.toLabel ?? ""}` : tr("رُفض طلب النقل"));
      setRejectId(null);
      setReason("");
      refresh();
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر تنفيذ الطلب")),
  });

  if (query.isPending) {
    if (variant === "embed") return null;
    return <p className="text-sm text-fg-muted">{tr("جارٍ تحميل طلبات النقل…")}</p>;
  }
  if (query.isError) {
    return <p className="text-sm text-danger">{tr("تعذر تحميل طلبات النقل.")}</p>;
  }
  const showPending = allowed && (moves.length > 0 || notices.length > 0);
  const showHistory = allowed && decisions.length > 0;
  const showMine = mine.length > 0;
  if (!showPending && !showHistory && !showMine) {
    if (variant === "embed") return null;
    return (
      <p className="rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center text-sm text-fg-muted">
        {tr("لا توجد طلبات نقل معلّقة.")}
      </p>
    );
  }

  return (
    <section className="space-y-5">
      {showPending ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{tr("طلبات نقل الطلاب")}</h2>
          {moves.length > 0 ? (
            <ul className="space-y-2">
              {moves.map((row) => (
                <li key={row.id} className="rounded-[var(--radius-md)] border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="warn">{tr("طلب نقل فصل")}</Badge>
                    <span className="text-xs text-fg-muted">
                      {tr("طلب من")} {row.requesterName}
                      {ROLE_LABEL[row.requesterRole as keyof typeof ROLE_LABEL] ? ` · ${tr(ROLE_LABEL[row.requesterRole as keyof typeof ROLE_LABEL])}` : ""}
                    </span>
                  </div>
                  <button type="button" className="mt-2 text-base font-semibold" onClick={() => setStudentId(row.studentId)}>
                    {row.studentName}
                  </button>
                  <p className="text-sm text-fg-muted">
                    {tr("من")} {row.fromLabel} {tr("إلى")} {row.toLabel}
                  </p>
                  {rejectId === row.id ? (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={tr("سبب الرفض")}
                        className="min-h-20"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={move.isPending || reason.trim().length < 2}
                          onClick={() => move.mutate({ requestId: row.id, decision: "reject", reason: reason.trim() })}
                        >
                          {tr("تأكيد الرفض")}
                        </Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => { setRejectId(null); setReason(""); }}>
                          {tr("إلغاء")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" size="sm" disabled={move.isPending} onClick={() => move.mutate({ requestId: row.id, decision: "apply" })}>
                        {tr("تنفيذ النقل")}
                      </Button>
                      <Button type="button" size="sm" variant="secondary" disabled={move.isPending} onClick={() => { setRejectId(row.id); setReason(""); }}>
                        {tr("رفض الطلب")}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {notices.length > 0 ? (
            <ul className="space-y-2">
              {notices.map((row) => (
                <li key={row.id} className="rounded-[var(--radius-md)] border border-border bg-card p-4">
                  <Badge tone="warn">{tr("طلب نقل فصل")}</Badge>
                  {row.studentName ? <p className="mt-2 text-base font-semibold">{row.studentName}</p> : null}
                  <p className="mt-1 text-sm leading-6">{row.body}</p>
                  {row.studentId ? (
                    <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={() => setStudentId(row.studentId)}>
                      {tr("فتح سجل الطالب")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {showHistory ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{tr("قرارات النقل")}</h2>
          <ul className="space-y-2">
            {decisions.map((row) => <ResultCard key={row.id} row={row} />)}
          </ul>
        </div>
      ) : null}
      {showMine ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{tr("طلباتي")}</h2>
          <ul className="space-y-2">
            {mine.map((row) => <ResultCard key={row.id} row={row} />)}
          </ul>
        </div>
      ) : null}
      <StudentSheet studentId={studentId} open={studentId != null} onOpenChange={(open) => { if (!open) setStudentId(null); }} />
    </section>
  );
}
