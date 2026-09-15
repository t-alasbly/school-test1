import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppGate } from "@/components/app-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getDailyAttendance } from "@/lib/school/api";
import { staffCan } from "@/lib/school/permissions";
import type { DailyAttendanceRow, DailyKind } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";
import { filterBulkCandidates, renderBulkMessage } from "@/lib/school/bulk-messaging";

export const Route = createFileRoute("/messages")({
  component: BulkMessagesPage,
});

function todayISO() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function BulkMessagesPage() {
  return (
    <AppGate>
      <BulkMessagesBody />
    </AppGate>
  );
}

function BulkMessagesBody() {
  const { staff, stages, classes } = useWorkspace();
  const canUse =
    staffCan(staff, "dailyAttendance") || staffCan(staff, "editRecords");
  const [day, setDay] = useState(todayISO);
  const [kind, setKind] = useState<DailyKind>("absence");
  const [stageId, setStageId] = useState("");
  const [classId, setClassId] = useState("");
  const [message, setMessage] = useState(
    "السلام عليكم، نود إشعاركم بخصوص الطالب {name} بأنه {status} بتاريخ {day}."
  );
  const [selected, setSelected] = useState<Record<number, boolean>>({});

  const query = useQuery({
    queryKey: ["bulk-attendance-messages", day, kind, stageId, classId],
    queryFn: () =>
      getDailyAttendance({
        data: {
          day,
          stageId: stageId ? Number(stageId) : undefined,
          classId: classId ? Number(classId) : undefined,
        },
      }),
    enabled: canUse,
  });
  const rows = (query.data?.students ?? []) as DailyAttendanceRow[];
  const candidates = useMemo(() => filterBulkCandidates(rows, kind), [rows, kind]);
  const selectedRows = candidates.filter(row => selected[row.studentId]);

  useEffect(() => {
    setSelected({});
  }, [day, kind, stageId, classId]);

  function toggleAll(checked: boolean) {
    setSelected(
      checked
        ? Object.fromEntries(candidates.map(row => [row.studentId, true]))
        : {}
    );
  }

  function sendMessages() {
    const status = kind === "absence" ? "غائب" : "متأخرًا صباحًا";
    const label = new Date(`${day}T12:00:00`).toLocaleDateString("ar-SA");
    for (const row of selectedRows) {
      const phone = row.parentPhone.replace(/\D/g, "");
      const text = renderBulkMessage(message, { name: row.studentName, classLabel: row.classLabel, status, day: label });
      window.open(
        `https://wa.me/${phone}?text=${encodeURIComponent(text)}`,
        "_blank",
        "noopener,noreferrer"
      );
    }
  }

  if (!canUse)
    return (
      <p className="text-fg-muted">
        الرسائل الجماعية متاحة لمسجل الغياب أو من مُنح صلاحية تعديل السجلات.
      </p>
    );

  const filteredClasses = classes.filter(
    item => !stageId || item.stageId === Number(stageId)
  );
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-fg-muted">
          اختر نوع الحالة واليوم، ثم حدد أولياء الأمور المراد مراسلتهم.
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          الرسائل الجماعية
        </h1>
      </header>
      <section className="grid gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="bulk-day">اليوم</Label>
          <Input
            id="bulk-day"
            type="date"
            value={day}
            onChange={event => setDay(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bulk-kind">الحالة</Label>
          <Select
            id="bulk-kind"
            value={kind}
            onChange={event => setKind(event.target.value as DailyKind)}
          >
            <option value="absence">الغياب</option>
            <option value="late">التأخر</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bulk-stage">المرحلة</Label>
          <Select
            id="bulk-stage"
            value={stageId}
            onChange={event => {
              setStageId(event.target.value);
              setClassId("");
            }}
          >
            <option value="">كل المراحل</option>
            {stages.map(stage => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bulk-class">الفصل</Label>
          <Select
            id="bulk-class"
            value={classId}
            onChange={event => setClassId(event.target.value)}
          >
            <option value="">كل الفصول</option>
            {filteredClasses.map(item => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
          <Label htmlFor="bulk-template">نص الرسالة</Label>
          <Input
            id="bulk-template"
            value={message}
            onChange={event => setMessage(event.target.value)}
          />
          <p className="text-xs text-fg-muted">
            المتغيرات المتاحة: &#123;name&#125;، &#123;class&#125;،
            &#123;status&#125;، &#123;day&#125;
          </p>
        </div>
      </section>
      <section className="rounded-[var(--radius-lg)] border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <p className="font-semibold">الحالات المطابقة</p>
            <p className="text-sm text-fg-muted">
              {candidates.length} طالبًا لديه رقم جوال
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => toggleAll(true)}
            >
              تحديد الكل
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => toggleAll(false)}
            >
              إلغاء التحديد
            </Button>
            <Button
              type="button"
              disabled={!selectedRows.length}
              onClick={sendMessages}
            >
              <Send className="size-4" /> إرسال المحدد
            </Button>
          </div>
        </div>
        <ul className="divide-y divide-border">
          {candidates.map(row => (
            <li key={row.studentId} className="flex items-center gap-3 p-3">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={Boolean(selected[row.studentId])}
                onChange={event =>
                  setSelected(prev => ({
                    ...prev,
                    [row.studentId]: event.target.checked,
                  }))
                }
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{row.studentName}</p>
                <p className="text-xs text-fg-muted">
                  {row.classLabel} · {row.parentPhone}
                </p>
              </div>
              <MessageCircle className="size-4 text-ok" />
            </li>
          ))}
          {!candidates.length ? (
            <li className="p-10 text-center text-sm text-fg-muted">
              لا توجد حالات مطابقة لهذا اليوم أو لا توجد أرقام جوال.
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
