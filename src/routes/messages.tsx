import { createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";
import { BulkMessagesPanel } from "@/components/bulk-messages";
import { staffCan } from "@/lib/school/permissions";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/messages")({ component: MessagesPage });

function MessagesPage() {
  return <AppGate><MessagesBody /></AppGate>;
}

function MessagesBody() {
  const { staff } = useWorkspace();
  if (!staffCan(staff, "sendMessages")) {
    return <p className="text-fg-muted">الرسائل الجماعية متاحة لمن مُنح صلاحية مراسلة أولياء الأمور.</p>;
  }
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-fg-muted">اختر نوع الرسالة واليوم والفصول، وسيتم تجهيز الطلاب تلقائياً.</p>
        <h1 className="text-3xl font-semibold tracking-tight">الرسائل الجماعية</h1>
      </header>
      <BulkMessagesPanel />
    </div>
  );
}
