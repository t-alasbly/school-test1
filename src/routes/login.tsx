import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { tr } from "@/lib/school/i18n";
import { useEffect, useState } from "react";
import { SchoolMark } from "@/components/school-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { ensureAppReady } from "@/lib/school/api";
import { APP_NAME, DEFAULT_APP_PHRASE, phoneToLoginEmail, schoolLogoSrc } from "@/lib/school/constants";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [brand, setBrand] = useState<{ name: string; logoUrl: string; tagline: string }>({
    name: "",
    logoUrl: "",
    tagline: "",
  });

  useEffect(() => {
    void ensureAppReady()
      .then((res) => {
        setBrand({
          name: res.name ?? "",
          logoUrl: res.logoUrl ?? "",
          tagline: res.tagline ?? "",
        });
      })
      .catch(() => {
        /* still allow login */
      });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await ensureAppReady();
      const identifier = phoneToLoginEmail(email);
      const res = await authClient.signIn.email({
        email: identifier,
        password,
        callbackURL: "/",
      });
      if (res.error) throw new Error(res.error.message || tr("بيانات الدخول غير صحيحة"));
      await navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr("حدث خطأ غير متوقع"));
    } finally {
      setBusy(false);
    }
  }

  const phrase = brand.tagline.trim() || DEFAULT_APP_PHRASE;

  return (
    <main className="relative grid min-h-dvh place-items-center px-4 py-10">
      <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden>
        <div className="login-wash absolute inset-x-0 top-0 h-48" />
      </div>
      <div className="relative w-full max-w-md space-y-6">
        <div className="text-center">
          <SchoolMark size="lg" src={schoolLogoSrc(brand.logoUrl) || undefined} className="mx-auto" />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-fg-muted">{phrase}</p>
          {brand.name ? <p className="mt-1 text-xs text-fg-subtle">{brand.name}</p> : null}
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base leading-6">
              <span className="block">تسجيل الدخول برقم الجوال</span>
              <span className="mt-0.5 block text-sm font-normal text-fg-muted">Sign in with your mobile number</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {authEnabled ? (
              <form className="space-y-3" onSubmit={onSubmit}>
                <div className="space-y-1.5">
                  <Label htmlFor="email">
                    رقم الجوال
                    <span className="ms-2 font-normal text-fg-muted">Mobile number</span>
                  </Label>
                  <Input
                    id="email"
                    type="tel"
                    inputMode="tel"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    required
                    dir="ltr"
                    placeholder="05xxxxxxxx"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">
                    كلمة المرور
                    <span className="ms-2 font-normal text-fg-muted">Password</span>
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    minLength={4}
                    required
                    dir="ltr"
                  />
                </div>
                {error ? <p className="text-sm text-danger">{error}</p> : null}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? tr("جارٍ التنفيذ…") : "دخول · Sign in"}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-fg-muted">{tr("تسجيل الدخول غير مفعّل.")}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
