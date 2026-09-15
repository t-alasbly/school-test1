import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsBack } from "@/components/settings-back";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateInviteReasons, updateMessageTemplates } from "@/lib/school/api";
import { DEFAULT_INVITE_REASONS, WHATSAPP_TEMPLATES } from "@/lib/school/constants";
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
  const [invite, setInvite] = useState<string[]>(() =>
    school.inviteReasons?.length ? school.inviteReasons : DEFAULT_INVITE_REASONS,
  );
  const [inviteDraft, setInviteDraft] = useState("");

  const mutation = useMutation({
    mutationFn: (customMessages: CustomMessage[]) =>
      updateMessageTemplates({
        data: { templates: drafts, customMessages },
      }),
    onSuccess: () => {
      toast.success("تم حفظ قوالب الرسائل");
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });

  const inviteMutation = useMutation({
    mutationFn: (reasons: string[]) => updateInviteReasons({ data: { reasons } }),
    onSuccess: () => {
      toast.success("تم حفظ عبارات الاستدعاء");
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });

  function addCustom() {
    const t = title.trim();
    const b = body.trim();
    if (t.length < 2 || b.length < 4) {
      toast.error("اكتب عنواناً ونص الرسالة");
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
        <h1 className="text-3xl font-semibold tracking-tight">الرسائل</h1>
        <p className="text-sm text-fg-muted">
          المتغيرات: {"{name}"} {"{class}"} {"{date}"} {"{weekday}"} {"{school}"} {"{details}"} {"{session}"}
        </p>
      </div>
      {KEYS.map((key) => (
        <Card key={key}>
          <CardHeader>
            <CardTitle>{WHATSAPP_TEMPLATES[key].title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`t-${key}`}>العنوان</Label>
              <Input
                id={`t-${key}`}
                value={drafts[key].title}
                onChange={(e) =>
                  setDrafts({ ...drafts, [key]: { ...drafts[key], title: e.target.value } })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`b-${key}`}>نص الرسالة</Label>
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
          <CardTitle>رسائل عامة مخصصة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-fg-muted">
            أضف قوالب إضافية تظهر مع «رسالة عامة» عند مراسلة ولي الأمر (تهنئة، تنبيه، اجتماع…).
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="c-title">عنوان القالب</Label>
            <Input
              id="c-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: تهنئة تفوّق"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-body">نص الرسالة</Label>
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
                  حذف
                </Button>
              </li>
            ))}
            {custom.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-fg-muted">لا توجد رسائل مخصصة بعد</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>

      <Button disabled={mutation.isPending} onClick={() => mutation.mutate(custom)}>
        حفظ كل القوالب
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>عبارات استدعاء ولي الأمر</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-fg-muted">
            تظهر كخيارات ثابتة في نموذج خطاب الدعوة، ويمكن تعديلها قبل الطباعة.
          </p>
          <ul className="space-y-2">
            {invite.map((item, index) => (
              <li key={`${item}-${index}`} className="flex gap-2">
                <Input
                  value={item}
                  onChange={(e) =>
                    setInvite((prev) => prev.map((row, i) => (i === index ? e.target.value : row)))
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setInvite((prev) => prev.filter((_, i) => i !== index))}
                >
                  حذف
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={inviteDraft}
              onChange={(e) => setInviteDraft(e.target.value)}
              placeholder="عبارة جديدة"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const text = inviteDraft.trim();
                if (text.length < 4) return;
                setInvite((prev) => [...prev, text]);
                setInviteDraft("");
              }}
            >
              إضافة
            </Button>
          </div>
          <Button
            disabled={inviteMutation.isPending}
            onClick={() => inviteMutation.mutate(invite.map((s) => s.trim()).filter((s) => s.length >= 4))}
          >
            حفظ عبارات الاستدعاء
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
