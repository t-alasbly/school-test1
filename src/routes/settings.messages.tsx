import { Link, createFileRoute } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsBack } from "@/components/settings-back";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateMessageTemplates } from "@/lib/school/api";
import { WHATSAPP_TEMPLATES } from "@/lib/school/constants";
import type { CustomMessage, MessageKind, MessageTemplate } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/settings/messages")({ component: MessagesSettings });

const KEYS: MessageKind[] = ["absence", "late", "homework", "behavior", "general"];

function newId() {
  return `c${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function MessagesSettings() {
  const { school } = useWorkspace();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<MessageKind, MessageTemplate>>(() => {
    const next = {} as Record<MessageKind, MessageTemplate>;
    for (const key of KEYS) {
      next[key] = school.messageTemplates[key] ?? WHATSAPP_TEMPLATES[key];
    }
    return next;
  });
  const [custom, setCustom] = useState<CustomMessage[]>(() => school.customMessages ?? []);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(WHATSAPP_TEMPLATES.general.body);

  const mutation = useMutation({
    mutationFn: (customMessages: CustomMessage[]) =>
      updateMessageTemplates({
        data: { templates: drafts, customMessages },
      }),
    onSuccess: () => {
      toast.success(tr("تم حفظ قوالب الرسائل"));
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? tr(err.message) : tr("تعذر الحفظ")),
  });

  function addCustom() {
    const t = title.trim();
    const b = body.trim();
    if (t.length < 2 || b.length < 4) {
      toast.error(tr("اكتب عنواناً ونص الرسالة"));
      return;
    }
    const next = [...custom, { id: newId(), title: t, body: b }];
    setCustom(next);
    setTitle("");
    setBody(WHATSAPP_TEMPLATES.general.body);
    mutation.mutate(next);
  }

  return (
    <div className="space-y-6">
      <div>
        <SettingsBack />
        <h1 className="text-3xl font-semibold tracking-tight">{tr("قوالب واتساب")}</h1>
        <p className="text-sm text-fg-muted">
          المتغيرات: {"{name}"} {"{class}"} {"{date}"} {"{weekday}"} {"{school}"} {"{details}"} {"{session}"}
        </p>
        <Link to="/messages" className="mt-2 inline-flex text-sm font-medium text-primary">
          إلى الرسائل الجماعية
        </Link>
      </div>
      {KEYS.map((key) => (
        <Card key={key}>
          <CardHeader>
            <CardTitle>{WHATSAPP_TEMPLATES[key].title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`t-${key}`}>{tr("العنوان")}</Label>
              <Input
                id={`t-${key}`}
                value={drafts[key].title}
                onChange={(e) =>
                  setDrafts({ ...drafts, [key]: { ...drafts[key], title: e.target.value } })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`b-${key}`}>{tr("نص الرسالة")}</Label>
              <Textarea
                id={`b-${key}`}
                className="min-h-36"
                value={drafts[key].body}
                onChange={(e) =>
                  setDrafts({ ...drafts, [key]: { ...drafts[key], body: e.target.value } })
                }
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setDrafts({ ...drafts, [key]: WHATSAPP_TEMPLATES[key] })}
            >
              استعادة النص الافتراضي
            </Button>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>{tr("رسائل عامة مخصصة")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-fg-muted">
            أضف قوالب إضافية تظهر مع «رسالة عامة» عند مراسلة ولي الأمر (تهنئة، تنبيه، اجتماع…).
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="c-title">{tr("عنوان القالب")}</Label>
            <Input
              id="c-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tr("مثال: تهنئة تفوّق")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-body">{tr("نص الرسالة")}</Label>
            <Textarea
              id="c-body"
              className="min-h-28"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <Button type="button" variant="secondary" onClick={addCustom}>
            إضافة للرسائل العامة
          </Button>
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-md)] border border-border">
            {custom.map((item) => (
              <li key={item.id} className="space-y-2 px-3 py-3">
                <Input
                  value={item.title}
                  onChange={(e) =>
                    setCustom((prev) =>
                      prev.map((m) => (m.id === item.id ? { ...m, title: e.target.value } : m)),
                    )
                  }
                />
                <Textarea
                  className="min-h-24"
                  value={item.body}
                  onChange={(e) =>
                    setCustom((prev) =>
                      prev.map((m) => (m.id === item.id ? { ...m, body: e.target.value } : m)),
                    )
                  }
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCustom((prev) => prev.filter((m) => m.id !== item.id))}
                >
                  {tr("حذف")}
                </Button>
              </li>
            ))}
            {custom.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-fg-muted">{tr("لا توجد رسائل مخصصة بعد")}</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>

      <Button disabled={mutation.isPending} onClick={() => mutation.mutate(custom)}>
        حفظ كل القوالب
      </Button>
    </div>
  );
}
