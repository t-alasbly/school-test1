import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppGate } from "@/components/app-gate";
import { ActionQueue } from "@/components/action-queue";
import { ClassMoveInbox } from "@/components/class-move-inbox";
import { DeskInbox } from "@/components/desk-inbox";
import { DeskNotesList, ColleagueDesks } from "@/components/desk-notes";
import { PageHelp } from "@/components/page-help";
import { StaffMailInbox } from "@/components/staff-mail-inbox";
import { TeacherCases } from "@/components/teacher-cases";
import { StaffTimetable } from "@/components/staff-timetable";
import { ExitPermitStrip } from "@/components/exit-permit";
import { TeacherStudio, GradeFormatStudio, FollowLedgerPage } from "@/components/teacher-studio";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { getHomeDesk, getLiveLessons, getMyTimetable, listStaff, setDeskTarget } from "@/lib/school/api";
import { ROLE_LABEL, currentPeriod, parseSubjects, scheduleFor } from "@/lib/school/constants";
import { useLocale, tr } from "@/lib/school/i18n";
import { staffCan } from "@/lib/school/permissions";
import { useWorkspace } from "@/lib/school/workspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/desk")({ component: DeskLayout });

type Section = "home" | "notes" | "waiting" | "closed" | "referrals" | "moves" | "mail" | "format" | "ledger";

const TABS: { id: Section; to: "/desk" | "/desk/notes" | "/desk/waiting" | "/desk/closed" | "/desk/counselor" | "/desk/moves" | "/desk/mail" | "/desk/format" | "/desk/ledger"; label: string }[] = [
  { id: "home", to: "/desk", label: "المتابعة" },
  { id: "format", to: "/desk/format", label: "تنسيق الدرجات" },
  { id: "ledger", to: "/desk/ledger", label: "سجل المتابعة" },
  { id: "notes", to: "/desk/notes", label: "ملاحظاتي" },
  { id: "waiting", to: "/desk/waiting", label: "تنتظر الرد" },
  { id: "closed", to: "/desk/closed", label: "رُد عليها" },
  { id: "referrals", to: "/desk/counselor", label: "إحالاتي" },
  { id: "moves", to: "/desk/moves", label: "طلبات النقل" },
  { id: "mail", to: "/desk/mail", label: "مراسلاتي" },
];

function sectionOf(pathname: string): Section {
  if (pathname.includes("/desk/format")) return "format";
  if (pathname.includes("/desk/ledger")) return "ledger";
  if (pathname.includes("/desk/notes")) return "notes";
  if (pathname.includes("/desk/moves")) return "moves";
  if (pathname.includes("/desk/closed")) return "closed";
  if (pathname.includes("/desk/waiting")) return "waiting";
  if (pathname.includes("/desk/counselor")) return "referrals";
  if (pathname.includes("/desk/mail")) return "mail";
  return "home";
}

function DeskLayout() {
  return (
    <AppGate>
      <DeskFrame />
    </AppGate>
  );
}

function DeskFrame() {
  const { t } = useLocale();
  const { staff } = useWorkspace();
  const queryClient = useQueryClient();
  const canAct = staffCan(staff, "takeActions");
  const canOpen = staff.role === "admin" || staffCan(staff, "viewAllViolations");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const section = sectionOf(pathname);
  const [asId, setAsId] = useState("");
  const [live, setLive] = useState(() => localStorage.getItem("desk-live-classes") === "1");
  const people = useQuery({
    queryKey: ["staff-list"],
    queryFn: () => listStaff(),
    enabled: canOpen,
  });
  const owner = useQuery({
    queryKey: ["my-timetable", asId],
    queryFn: () => getMyTimetable(),
    enabled: canOpen ? Boolean(asId) : parseSubjects(staff.subject).length > 0,
  });
  useEffect(() => {
    if (!canOpen) return;
    const saved = sessionStorage.getItem("desk_as") || "";
    if (!saved) return;
    setAsId(saved);
    void setDeskTarget({ data: { staffId: saved } });
  }, [canOpen]);
  const desk = useQuery({ queryKey: ["home-desk", asId], queryFn: () => getHomeDesk() });
  const ownerInfo = owner.data as { role?: string; subject?: string; displayName?: string } | undefined;
  const hasSubjects = asId
    ? !owner.isPending && parseSubjects(ownerInfo?.subject || "").length > 0
    : parseSubjects(staff.subject).length > 0;
  const visibleTabs = TABS.filter((tab) => hasSubjects || (tab.id !== "format" && tab.id !== "ledger"));
  const showStudio = asId
    ? ownerInfo?.role === "teacher" || parseSubjects(ownerInfo?.subject || "").length > 0
    : staff.role === "teacher";
  async function chooseDesk(id: string) {
    await setDeskTarget({ data: { staffId: id } });
    if (id) sessionStorage.setItem("desk_as", id);
    else sessionStorage.removeItem("desk_as");
    await queryClient.invalidateQueries();
    setAsId(id);
  }
  const stats = (desk.data ?? {}) as {
    myNotes?: number;
    myClosed?: number;
    waiting?: number;
    moveRequests?: number;
    referrals?: number;
  };
  const counts: Record<Section, number | null> = {
    home: null,
    notes: stats.myNotes ?? 0,
    waiting: stats.waiting ?? 0,
    closed: stats.myClosed ?? 0,
    referrals: stats.referrals ?? 0,
    moves: stats.moveRequests ?? 0,
    mail: null,
    format: null,
    ledger: null,
  };
  const copy: Record<Exclude<Section, "home">, { title: string; hint: string }> = {
    notes: { title: "ملاحظاتي", hint: "كل ما سجّلته على الطلاب." },
    waiting: { title: "تنتظر الرد", hint: "ما ينتظر الرد أو الإجراء." },
    closed: { title: "رُد عليها", hint: "ما أُغلق عليه إجراء." },
    referrals: { title: "إحالاتي", hint: "ما أُحيل للمرشد أو لوكيل شؤون الطلاب أو للمرشد الصحي." },
    moves: { title: "طلبات النقل", hint: "الطلبات الواردة وقراراتها، وطلباتك أنت." },
    mail: { title: "مراسلاتي", hint: "ما أرسلته أو وصل إليك عن الطلاب." },
    format: { title: "تنسيق الدرجات", hint: "تنسيق واحد لأعمال السنة والتقويم والمتابعة، ويمكن تعميمه على كل المواد والفترات." },
    ledger: { title: "سجل المتابعة", hint: "سجل محفوظ ترجع إليه عند الحاجة: الحصة والتاريخ والمادة والتقييم." },
  };

  return (
    <div className="space-y-5">
      <header className="no-print space-y-1">
        <h1 className="flex flex-wrap items-center gap-2 text-3xl font-semibold tracking-tight">
          {t("مكتبي")}
          <PageHelp text={t("المتابعة هي الصفحة الرئيسية: جدولك وإحصاءات المكتب وفصولك. كل زر يفتح صفحته فقط.")} />
          <button
            type="button"
            className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", live ? "border-primary bg-primary text-primary-fg" : "border-border bg-card text-fg-muted")}
            onClick={() => {
              const next = !live;
              setLive(next);
              localStorage.setItem("desk-live-classes", next ? "1" : "0");
            }}
          >
            {t("حصص الفصول")}
          </button>
        </h1>
      </header>
      {canOpen ? (
        <div className="no-print flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-border bg-card p-3">
          <label className="min-w-52 flex-1 space-y-1 text-sm">
            <span className="font-semibold">{t("مكتب المعلم")}</span>
            <Select className="h-10 w-full" value={asId} onChange={(event) => void chooseDesk(event.target.value)}>
              <option value="">{t("مكتبي")}</option>
              {((people.data ?? []) as { userId: string; displayName: string; role: string; active?: boolean }[])
                .filter((person) => person.active !== false && person.role !== "pending" && person.userId !== staff.userId)
                .map((person) => (
                  <option key={person.userId} value={person.userId}>
                    {person.displayName} · {ROLE_LABEL[person.role as keyof typeof ROLE_LABEL] || person.role}
                  </option>
                ))}
            </Select>
          </label>
          {asId ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => void chooseDesk("")}>{t("العودة لمكتبي")}</Button>
          ) : null}
        </div>
      ) : null}
      <div key={asId || "self"} className="space-y-5">
      {asId && ownerInfo?.displayName ? (
        <p className="no-print text-sm font-semibold">{t("تدير مكتب")} {ownerInfo.displayName}</p>
      ) : null}
      {section === "home" ? (
        <>
          <ExitPermitStrip />
          <StaffTimetable ownerKey={asId} />
          <LiveClassesOption on={live} />
          <nav className="no-print grid grid-cols-2 gap-2 sm:grid-cols-3">
            {visibleTabs.filter((tab) => tab.id !== "home").map((tab) => {
              const count = counts[tab.id];
              const featured = tab.id === "format" || tab.id === "ledger";
              return (
                <Link
                  key={tab.id}
                  to={tab.to}
                  className={cn(
                    "flex min-h-14 flex-col justify-between rounded-[var(--radius-lg)] border px-3 py-2 text-right transition-colors",
                    tab.id === "format" && "border-amber-600 bg-amber-500 text-white hover:bg-amber-600",
                    tab.id === "ledger" && "border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700",
                    !featured && "border-border bg-card hover:border-primary",
                  )}
                >
                  <span className={cn("text-base font-semibold", featured ? "text-white" : "text-xs font-normal text-fg-muted")}>
                    {t(tab.id === "waiting" && canAct ? "تحتاج إجراء" : tab.label)}
                  </span>
                  {featured ? (
                    <span className="text-xs text-white/90">{tab.id === "format" ? t("اختر التنسيق وشاهده ثم احفظه") : t("سجل محفوظ ترجع إليه")}</span>
                  ) : (
                    <span className="text-2xl font-semibold tabular-nums">{count == null ? "—" : desk.isPending ? "…" : count}</span>
                  )}
                </Link>
              );
            })}
          </nav>
          {showStudio ? <TeacherStudio /> : null}
        </>
      ) : (
        <>
          <nav className="no-print flex gap-2 overflow-x-auto">
            {visibleTabs.map((tab) => {
              const active = section === tab.id;
              return (
                <Link
                  key={tab.id}
                  to={tab.to}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-sm",
                    tab.id === "format" && (active ? "border-amber-700 bg-amber-500 text-white" : "border-amber-600 bg-amber-100 text-amber-950"),
                    tab.id === "ledger" && (active ? "border-emerald-800 bg-emerald-600 text-white" : "border-emerald-700 bg-emerald-100 text-emerald-950"),
                    tab.id !== "format" && tab.id !== "ledger" && (active ? "border-primary bg-primary text-primary-fg" : "border-border bg-card"),
                  )}
                >
                  {t(tab.id === "waiting" && canAct ? "تحتاج إجراء" : tab.label)}
                </Link>
              );
            })}
          </nav>
          <section className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">{t(section === "waiting" && canAct ? "تحتاج إجراء" : copy[section].title)}</h2>
              <p className="text-sm text-fg-muted">
                {t(section === "waiting" && canAct ? "مخالفات مسجّلة بانتظار اتخاذ الإجراء، ثم الملاحظات المفتوحة." : copy[section].hint)}
              </p>
            </div>
            {section === "notes" ? (
              <div className="space-y-5">
                <ColleagueDesks />
                <DeskNotesList status="all" empty={tr("لم تسجّل ملاحظات بعد. ستظهر هنا فور تسجيل ملاحظة من الفصل.")} />
              </div>
            ) : null}
            {section === "waiting" ? (
              <div className="space-y-5">
                {canAct ? <ActionQueue /> : null}
                <DeskInbox />
                <DeskNotesList
                  status="open"
                  empty={tr(canAct ? "لا توجد مخالفات بانتظار إجراء، ولا ملاحظات مفتوحة." : "لا توجد ملاحظات بانتظار الرد.")}
                />
              </div>
            ) : null}
            {section === "closed" ? (
              <DeskNotesList status="closed" empty={tr("لا توجد ملاحظات أُغلق فيها الإجراء بعد.")} />
            ) : null}
            {section === "referrals" ? <TeacherCases /> : null}
            {section === "moves" ? <ClassMoveInbox variant="page" /> : null}
            {section === "mail" ? <StaffMailInbox title="" hint="" /> : null}
            {section === "format" && hasSubjects ? <GradeFormatStudio /> : null}
            {section === "ledger" && hasSubjects ? <FollowLedgerPage /> : null}
          </section>
        </>
      )}
      <Outlet />
      </div>
    </div>
  );
}

function shortTeacher(name: string) {
  const parts = name.split(/\s+/).filter((part) => part && part !== "بن" && part !== "ابن");
  if (parts.length < 2) return name;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function stageTitle(name: string) {
  if (name.includes("الأول") || name.includes("أولى")) return "أول متوسط";
  if (name.includes("ثاني")) return "ثاني متوسط";
  if (name.includes("ثالث")) return "ثالث متوسط";
  return name.replace(/^الصف\s+/, "");
}

function stageTone(name: string) {
  if (name.includes("الأول") || name.includes("أولى")) return { box: "border-teal-300 bg-teal-50", title: "text-teal-800" };
  if (name.includes("ثاني")) return { box: "border-amber-300 bg-amber-50", title: "text-amber-900" };
  if (name.includes("ثالث")) return { box: "border-violet-300 bg-violet-50", title: "text-violet-900" };
  return { box: "border-border bg-bg-elevated", title: "text-fg" };
}

function sectionNo(label: string) {
  const match = label.match(/(\d+)\s*$/);
  return match ? match[1] : label;
}

function LiveClassesOption({ on }: { on: boolean }) {
  const { t } = useLocale();
  const { school } = useWorkspace();
  const slots = scheduleFor(school.season, school.schedules).filter((slot) => /^p\d+$/.test(slot.key));
  const nowPeriod = currentPeriod(school.season, new Date(), school.schedules);
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(() => {
    const today = new Date().getDay();
    return today >= 0 && today <= 4 ? today : 0;
  });
  const [periodKey, setPeriodKey] = useState(() => (nowPeriod && /^p\d+$/.test(nowPeriod.key) ? nowPeriod.key : slots[0]?.key || "p1"));
  const query = useQuery({
    queryKey: ["live-lessons"],
    queryFn: () => getLiveLessons(),
    enabled: on,
    refetchInterval: 60_000,
  });
  const data = query.data as {
    stages?: { id: number; name: string }[];
    lessons?: { day: number; periodKey: string; subject: string; teacher: string; classLabel: string; stageId: number }[];
  } | undefined;
  const days = [
    [0, "الأحد"],
    [1, "الاثنين"],
    [2, "الثلاثاء"],
    [3, "الأربعاء"],
    [4, "الخميس"],
  ] as const;
  if (!on) return null;
  return (
    <section className="no-print rounded-[var(--radius-lg)] border border-border bg-card p-2 text-sm">
      <div className="flex items-center gap-1.5">
        <Select className="h-8 min-w-0 flex-1" value={String(day)} onChange={(event) => setDay(Number(event.target.value))}>
          {days.map(([id, name]) => <option key={id} value={id}>{t(name)}</option>)}
        </Select>
        <Select className="h-8 min-w-0 flex-1" value={periodKey} onChange={(event) => setPeriodKey(event.target.value)}>
          {slots.map((slot) => <option key={slot.key} value={slot.key}>{slot.label.replace("الحصة ", "")}</option>)}
        </Select>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="h-8 shrink-0 rounded-full border border-border px-2.5 text-xs font-semibold"
        >
          {open ? t("إخفاء") : t("تكبير")}
        </button>
      </div>
      {open ? (
      <div className="mt-2 space-y-2">
        {(data?.stages ?? []).map((stage) => {
          const tone = stageTone(stage.name);
          const items = (data?.lessons ?? [])
            .filter((item) => item.stageId === stage.id && item.day === day && item.periodKey === periodKey)
            .sort((a, b) => Number(sectionNo(a.classLabel)) - Number(sectionNo(b.classLabel)));
          return (
            <div key={stage.id} className={cn("rounded-xl border px-2 py-1.5", tone.box)}>
              <p className={cn("mb-1 text-xs font-semibold", tone.title)}>{stageTitle(stage.name)}</p>
              {items.length === 0 ? <p className="text-[11px] text-fg-subtle">{t("لا حصص")}</p> : (
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {items.map((item) => (
                    <div key={`${item.classLabel}-${item.teacher}`} className="rounded-xl border border-white/80 bg-white/80 px-2 py-1.5">
                      <p className="text-xs font-bold">{sectionNo(item.classLabel)} · {item.subject || "—"}</p>
                      <p className="truncate text-[11px] text-fg-muted">{shortTeacher(item.teacher)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      ) : null}
    </section>
  );
}
