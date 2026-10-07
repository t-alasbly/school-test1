import { createFileRoute } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppGate } from "@/components/app-gate";
import {
  CaseRecordTools,
  ImprovementRecordTools,
  MessageRecordTools,
  NoteRecordTools,
} from "@/components/record-actions";
import { Badge } from "@/components/ui/badge";
import { PageHelp } from "@/components/page-help";
import { Input } from "@/components/ui/input";
import { getReport, listCounselingCases, listImprovements, listParentMessages } from "@/lib/school/api";
import {
  CASE_KINDS,
  IMPROVEMENT_STATUS,
  NOTE_META,
  classLabel,
  formatStamp,
  messageKindLabel,
  noteTone,
} from "@/lib/school/constants";
import { staffCan } from "@/lib/school/permissions";
import type { CounselingCase, NoteType } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/archive")({ component: ArchivePage });

type Tab = "notes" | "messages" | "improvements" | "cases";

function ArchivePage() {
  return (
    <AppGate>
      <ArchiveBody />
    </AppGate>
  );
}

function ArchiveBody() {
  const { staff } = useWorkspace();
  const can = staffCan(staff, "editRecords");
  const [tab, setTab] = useState<Tab>("notes");
  const [q, setQ] = useState("");

  const notesQuery = useQuery({
    queryKey: ["report", "archive"],
    queryFn: () => getReport({ data: {} }),
    enabled: can,
  });
  const messagesQuery = useQuery({
    queryKey: ["parent-messages", "archive"],
    queryFn: () => listParentMessages({ data: {} }),
    enabled: can,
  });
  const improveQuery = useQuery({
    queryKey: ["improvements", "archive"],
    queryFn: () => listImprovements({ data: {} }),
    enabled: can,
  });
  const casesQuery = useQuery({
    queryKey: ["archive-cases"],
    queryFn: () => listCounselingCases(),
    enabled: can,
  });

  const term = q.trim();
  const notes = useMemo(() => {
    const list = notesQuery.data?.notes ?? [];
    if (!term) return list;
    return list.filter(
      (n: { studentName: string; details: string; behaviorTypeName?: string | null }) =>
        n.studentName.includes(term) ||
        (n.details || "").includes(term) ||
        (n.behaviorTypeName || "").includes(term),
    );
  }, [notesQuery.data, term]);
  const messages = useMemo(() => {
    const list = messagesQuery.data?.messages ?? [];
    if (!term) return list;
    return list.filter(
      (m: { studentName: string; body: string }) => m.studentName.includes(term) || m.body.includes(term),
    );
  }, [messagesQuery.data, term]);
  const improvements = useMemo(() => {
    const list = improveQuery.data ?? [];
    if (!term) return list;
    return list.filter(
      (i: { studentName: string; plan: string }) => i.studentName.includes(term) || i.plan.includes(term),
    );
  }, [improveQuery.data, term]);
  const cases = useMemo(() => {
    const list: CounselingCase[] = casesQuery.data ?? [];
    if (!term) return list;
    return list.filter((c) => c.studentName.includes(term) || c.body.includes(term));
  }, [casesQuery.data, term]);

  if (!can) {
    return (
      <p className="text-fg-muted">
        الأرشيف وتصحيح السجلات لمن مُنح صلاحية «تعديل وحذف السجلات» من قائمة الموظفين.
      </p>
    );
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "notes", label: tr("الملاحظات"), count: notes.length },
    { key: "messages", label: tr("الرسائل"), count: messages.length },
    { key: "improvements", label: tr("تحسين السلوك"), count: improvements.length },
    { key: "cases", label: tr("حالات الإرشاد"), count: cases.length },
  ];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          {tr("الأرشيف")}
          <PageHelp text={tr("كل ما سُجّل في المدرسة: صحّح الخطأ أو احذفه. يظهر زر التصحيح أيضاً في سجل الطالب وشؤون الطلاب والتقارير.")} />
        </h1>
      </header>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("بحث باسم الطالب أو النص…")} />
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? "h-10 rounded-full bg-primary px-4 text-sm font-medium text-primary-fg"
                : "h-10 rounded-full border border-border bg-bg-elevated px-4 text-sm text-fg-muted"
            }
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {tab === "notes" ? (
        <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
          {notes.map((note: any) => (
            <li key={note.id} className="flex flex-wrap items-start gap-2 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{note.studentName}</p>
                  <Badge tone={noteTone(note.type as NoteType, note.status)}>
                    {NOTE_META[note.type as NoteType]?.label ?? note.type}
                  </Badge>
                  {note.behaviorTypeName ? <span className="text-xs text-fg-muted">{tr(note.behaviorTypeName)}</span> : null}
                </div>
                <p className="text-xs text-fg-subtle">
                  {classLabel(note.shortName, note.className)} · {note.teacherName} · {formatStamp(note.occurredAt || note.createdAt)}
                </p>
                {note.details ? <p className="text-sm">{note.details}</p> : null}
                {note.actionTaken ? <p className="text-sm text-ok">الإجراء: {note.actionTaken}</p> : null}
              </div>
              <NoteRecordTools note={note} />
            </li>
          ))}
          {notes.length === 0 ? <li className="px-4 py-10 text-center text-sm text-fg-muted">{tr("لا ملاحظات")}</li> : null}
        </ul>
      ) : null}

      {tab === "messages" ? (
        <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
          {messages.map((msg: any) => (
            <li key={msg.id} className="flex flex-wrap items-start gap-2 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{msg.studentName}</p>
                  <Badge>{messageKindLabel(msg.kind)}</Badge>
                </div>
                <p className="text-xs text-fg-subtle">
                  {classLabel(msg.shortName, msg.className)} · {msg.staffName} · {formatStamp(msg.createdAt)}
                </p>
                <p className="whitespace-pre-wrap text-sm">{msg.body}</p>
              </div>
              <MessageRecordTools id={msg.id} body={msg.body} />
            </li>
          ))}
          {messages.length === 0 ? <li className="px-4 py-10 text-center text-sm text-fg-muted">{tr("لا رسائل")}</li> : null}
        </ul>
      ) : null}

      {tab === "improvements" ? (
        <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
          {improvements.map((item: any) => (
            <li key={item.id} className="flex flex-wrap items-start gap-2 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{item.studentName}</p>
                  <Badge>{IMPROVEMENT_STATUS[item.status as keyof typeof IMPROVEMENT_STATUS]}</Badge>
                </div>
                <p className="text-xs text-fg-subtle">
                  {item.classLabel} · {item.teacherName} · {formatStamp(item.createdAt)}
                </p>
                <p className="text-sm">{item.plan}</p>
              </div>
              <ImprovementRecordTools id={item.id} plan={item.plan} />
            </li>
          ))}
          {improvements.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-fg-muted">{tr("لا خطط تحسين")}</li>
          ) : null}
        </ul>
      ) : null}

      {tab === "cases" ? (
        <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
          {cases.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start gap-2 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{item.studentName}</p>
                  <Badge>{CASE_KINDS.find((k) => k.key === item.kind)?.label ?? item.kind}</Badge>
                </div>
                <p className="text-xs text-fg-subtle">
                  {item.classLabel} · {item.authorName} · {formatStamp(item.createdAt)}
                </p>
                <p className="text-sm">{item.body}</p>
              </div>
              <CaseRecordTools id={item.id} body={item.body} />
            </li>
          ))}
          {cases.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-fg-muted">{tr("لا حالات إرشادية")}</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
