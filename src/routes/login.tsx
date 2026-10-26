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
import { ensureAppReady, reportLoginHelp } from "@/lib/school/api";
import { APP_NAME, DEFAULT_APP_PHRASE, phoneToLoginEmail, schoolLogoSrc } from "@/lib/school/constants";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" && search.next.startsWith("/") && !search.next.startsWith("//") && !search.next.startsWith("/login") ? search.next : "",
  }),
  component: Login,
});

function Login() {
  const { next } = Route.useSearch();
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <div className="min-h-dvh bg-bg" />;
  }
  if (user) {
    if (next && typeof window !== "undefined") {
      window.location.replace(next);
      return <div className="min-h-dvh bg-bg" />;
    }
    return <Navigate to="/desk" />;
  }
  return <LoginForm next={next} />;
}

function LoginForm({ next }: { next: string }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpName, setHelpName] = useState("");
  const [helpPhone, setHelpPhone] = useState("");
  const [helpBusy, setHelpBusy] = useState(false);
  const [helpSent, setHelpSent] = useState(false);
  const [helpError, setHelpError] = useState<string | null>(null);
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
        callbackURL: next || "/desk",
      });
      if (res.error) throw new Error(res.error.message || tr("بيانات الدخول غير صحيحة"));
      if (next) {
        window.location.replace(next);
        return;
      }
      await navigate({ to: "/desk" });
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr("حدث خطأ غير متوقع"));
      setHelpOpen(true);
      setHelpPhone((current) => current || email);
    } finally {
      setBusy(false);
    }
  }

  async function sendHelp() {
    setHelpError(null);
    setHelpBusy(true);
    try {
      await reportLoginHelp({ data: { name: helpName.trim(), phone: helpPhone.trim() } });
      setHelpSent(true);
    } catch (err) {
      setHelpError(err instanceof Error ? err.message : "تعذر الإرسال");
    } finally {
      setHelpBusy(false);
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
                <button
                  type="button"
                  className="w-full text-center text-sm font-medium text-primary"
                  onClick={() => {
                    setHelpOpen(true);
                    setHelpPhone((current) => current || email);
                  }}
                >
                  تعذر الدخول؟ أرسل اسمك ورقم جوالك
                  <span className="mt-0.5 block text-xs font-normal text-fg-muted">Could not sign in? Send your name and mobile number</span>
                </button>
                {helpOpen ? (
                  <div className="space-y-3 rounded-[var(--radius-md)] border border-border bg-bg p-3">
                    {helpSent ? (
                      <p className="text-sm leading-6 text-ok">
                        تم الإرسال إلى مدير النظام.
                        <span className="mt-0.5 block text-fg-muted">Sent to the administrator.</span>
                      </p>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          <Label htmlFor="help-name">
                            الاسم
                            <span className="ms-2 font-normal text-fg-muted">Name</span>
                          </Label>
                          <Input
                            id="help-name"
                            value={helpName}
                            onChange={(e) => setHelpName(e.target.value)}
                            required
                            minLength={2}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="help-phone">
                            رقم الجوال
                            <span className="ms-2 font-normal text-fg-muted">Mobile number</span>
                          </Label>
                          <Input
                            id="help-phone"
                            type="tel"
                            inputMode="tel"
                            value={helpPhone}
                            onChange={(e) => setHelpPhone(e.target.value)}
                            dir="ltr"
                            placeholder="05xxxxxxxx"
                            required
                          />
                        </div>
                        {helpError ? <p className="text-sm text-danger">{helpError}</p> : null}
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full"
                          disabled={helpBusy || helpName.trim().length < 2 || helpPhone.trim().length < 5}
                          onClick={() => void sendHelp()}
                        >
                          {helpBusy ? "جارٍ الإرسال…" : "إرسال · Send"}
                        </Button>
                      </>
                    )}
                  </div>
                ) : null}
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
