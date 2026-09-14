import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SchoolMark } from "@/components/school-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  GROK_PROVIDERS,
  authClient,
  authEnabled,
  signIn,
} from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { ensureAppReady } from "@/lib/school/api";
import { phoneToLoginEmail } from "@/lib/school/constants";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <div className="min-h-dvh bg-bg" />;
  }
  if (user) return <Navigate to="/" />;
  return <LoginForm />;
}

function LoginForm() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void ensureAppReady();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await ensureAppReady();
      const identifier = phoneToLoginEmail(email);
      if (mode === "up") {
        const res = await authClient.signUp.email({
          email: identifier,
          password,
          name: name.trim() || identifier.split("@")[0] || "معلم",
          callbackURL: "/",
        });
        if (res.error) throw new Error(res.error.message || "تعذر إنشاء الحساب");
      } else {
        const res = await authClient.signIn.email({
          email: identifier,
          password,
          callbackURL: "/",
        });
        if (res.error) throw new Error(res.error.message || "بيانات الدخول غير صحيحة");
      }
      await navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative grid min-h-dvh place-items-center px-4 py-10">
      <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden>
        <div className="login-wash absolute inset-x-0 top-0 h-48" />
      </div>
      <div className="relative w-full max-w-md space-y-6">
        <div className="text-center">
          <SchoolMark size="lg" className="mx-auto" />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">متابعة الطلاب الشاملة</h1>
          <p className="mt-1 text-sm text-fg-muted">
            نظام متابعة شؤون الطلاب — بين المعلم والإدارة وولي الأمر
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {mode === "in" ? "تسجيل الدخول" : "إنشاء حساب جديد"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {authEnabled ? (
              <>
                <form className="space-y-3" onSubmit={onSubmit}>
                  {mode === "up" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="name">الاسم</Label>
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoComplete="name"
                        required
                      />
                    </div>
                  ) : null}
                  <div className="space-y-1.5">
                    <Label htmlFor="email">البريد أو رقم الجوال</Label>
                    <Input
                      id="email"
                      type="text"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="username"
                      required
                      dir="ltr"
                      placeholder="البريد أو رقم الجوال"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">كلمة المرور</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={mode === "up" ? "new-password" : "current-password"}
                      minLength={mode === "up" ? 8 : 4}
                      required
                      dir="ltr"
                    />
                  </div>
                  {error ? <p className="text-sm text-danger">{error}</p> : null}
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy
                      ? "جارٍ التنفيذ…"
                      : mode === "in"
                        ? "دخول"
                        : "إنشاء الحساب"}
                  </Button>
                </form>
                <button
                  type="button"
                  className="w-full text-sm text-fg-muted hover:text-fg"
                  onClick={() => {
                    setMode(mode === "in" ? "up" : "in");
                    setError(null);
                  }}
                >
                  {mode === "in" ? "ليس لديك حساب؟ أنشئ حسابًا" : "لديك حساب؟ سجّل الدخول"}
                </button>
                <div className="relative py-2">
                  <div className="h-px bg-border" />
                  <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-xs text-fg-subtle">
                    أو
                  </span>
                </div>
                <div className="space-y-2">
                  {GROK_PROVIDERS.map((p) => (
                    <Button
                      key={p.providerId}
                      type="button"
                      variant="secondary"
                      className="w-full"
                      onClick={() => signIn(p.providerId, { callbackURL: "/" })}
                    >
                      متابعة باستخدام {p.label}
                    </Button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-fg-muted">تسجيل الدخول غير مفعّل.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
