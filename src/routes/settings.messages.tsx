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
import { updateMessageTemplates } from "@/lib/school/api";
import { WHATSAPP_TEMPLATES } from "@/lib/school/constants";
import type { MessageKind, MessageTemplate } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";

export const Route = createFileRoute("/settings/messages")({ component: MessagesSettings });

const KEYS: MessageKind[] = ["absence", "late", "homework", "behavior", "general"];

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

  const mutation = useMutation({
    mutationFn: () => updateMessageTemplates({ data: { templates: drafts } }),
    onSuccess: () => {
      toast.success("تم حفظ قوالب الرسائل");
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "تعذر الحفظ"),
  });

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
      <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        حفظ كل القوالب
      </Button>
    </div>
  );
}
