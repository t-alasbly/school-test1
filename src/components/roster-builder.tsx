import { ArrowDown, ArrowUp, Download, Plus, Save } from "lucide-react";
import { tr } from "@/lib/school/i18n";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const DEFAULT_COL_MM = {
  seq: 10,
  name: 42,
  class: 22,
  stage: 18,
  phone: 28,
} as const;

export const EXTRA_DEFAULT_MM = 20;
export const COL_MM_MIN = 8;
export const COL_MM_MAX = 80;

export type BuiltinCol = keyof typeof DEFAULT_COL_MM;
export type ExtraCol = { id: string; title: string; width: number; max?: number; calc?: "" | "sum" | "avg" | "cards"; sources?: string[]; head?: string };
export type RosterPayload = {
  title: string;
  showPhone: boolean;
  showClass: boolean;
  showStage: boolean;
  extraCols: ExtraCol[];
  widths: Record<BuiltinCol, number>;
  order: string[];
  rowMm?: number;
  sheetStyle?: "names" | "grades";
  margins?: { top: number; right: number; bottom: number; left: number };
};

export type RosterTemplate = {
  id: number;
  name: string;
  payload: RosterPayload;
  public?: boolean;
};

const BUILTIN_META: { id: BuiltinCol; title: string; optional?: boolean }[] = [
  { id: "seq", title: tr("م") },
  { id: "name", title: tr("اسم الطالب") },
  { id: "stage", title: tr("الصف / المرحلة"), optional: true },
  { id: "class", title: tr("الفصل"), optional: true },
  { id: "phone", title: tr("جوال ولي الأمر"), optional: true },
];

export function clampMm(value: number, fallback = EXTRA_DEFAULT_MM) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(COL_MM_MAX, Math.max(COL_MM_MIN, Math.round(value)));
}

export function defaultOrder(extraCols: ExtraCol[], show: { stage: boolean; class: boolean; phone: boolean }) {
  const ids = ["seq", "name"];
  if (show.stage) ids.push("stage");
  if (show.class) ids.push("class");
  if (show.phone) ids.push("phone");
  for (const col of extraCols) ids.push(col.id);
  return ids;
}

export const GRADE_SHEET_COLUMNS: ExtraCol[] = [
  { id: "theory", title: "اختبار نظري", width: 22, max: 20 },
  { id: "homework", title: "واجبات", width: 18, max: 10 },
  { id: "share", title: "مشاركة", width: 18, max: 10 },
  { id: "tasks", title: "مهام أدائية", width: 22, max: 20 },
  { id: "final", title: "اختبار نهائي", width: 22, max: 40 },
  { id: "total", title: "المجموع", width: 18, max: 100 },
];

export function gradeSheetPayload(): RosterPayload {
  return {
    title: "كشف الدرجات",
    showPhone: false,
    showClass: false,
    showStage: false,
    extraCols: GRADE_SHEET_COLUMNS.map((col) => ({ ...col })),
    widths: { ...DEFAULT_COL_MM, seq: 12, name: 68 },
    order: ["seq", "name", ...GRADE_SHEET_COLUMNS.map((col) => col.id)],
    rowMm: 8,
    sheetStyle: "grades",
  };
}

export function mergeOrder(order: string[] | undefined, extraCols: ExtraCol[], show: { stage: boolean; class: boolean; phone: boolean }) {
  const extras = new Set(extraCols.map((c) => c.id));
  const allowed = new Set<string>(["seq", "name"]);
  if (show.stage) allowed.add("stage");
  if (show.class) allowed.add("class");
  if (show.phone) allowed.add("phone");
  for (const id of extras) allowed.add(id);
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of order ?? []) {
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  for (const id of defaultOrder(extraCols, show)) {
    if (seen.has(id)) continue;
    next.push(id);
  }
  return next;
}

export type VisibleCol = { id: string; title: string; width: number; builtin?: BuiltinCol; max?: number };

export function visibleColumns(payload: Pick<RosterPayload, "extraCols" | "widths" | "order" | "showClass" | "showStage" | "showPhone">): VisibleCol[] {
  const show = { stage: payload.showStage, class: payload.showClass, phone: payload.showPhone };
  const order = mergeOrder(payload.order, payload.extraCols, show);
  const extras = new Map(payload.extraCols.map((c) => [c.id, c]));
  return order
    .map((id) => {
      const builtin = BUILTIN_META.find((c) => c.id === id);
      if (builtin) {
        return {
          id,
          title: builtin.title,
          width: clampMm(payload.widths[builtin.id], DEFAULT_COL_MM[builtin.id]),
          builtin: builtin.id,
        };
      }
      const extra = extras.get(id);
      if (!extra) return null;
      return {
        id,
        title: extra.title.trim() || tr("عمود"),
        width: clampMm(extra.width, EXTRA_DEFAULT_MM),
        max: Number(extra.max) > 0 ? Number(extra.max) : undefined,
      };
    })
    .filter((c): c is VisibleCol => Boolean(c));
}

export function RosterBuilder({
  title,
  onTitle,
  showPhone,
  showClass,
  showStage,
  extraCols,
  widths,
  order,
  onChange,
  templateName,
  onTemplateName,
  templates,
  activeId,
  onApply,
  onSave,
  onSaveAs,
  onDelete,
  onPublish,
  isAdmin,
  saving,
  onExcel,
  rowMm,
  onRowMm,
  layoutOnly,
}: {
  title: string;
  onTitle: (v: string) => void;
  showPhone: boolean;
  showClass: boolean;
  showStage: boolean;
  extraCols: ExtraCol[];
  widths: Record<BuiltinCol, number>;
  order: string[];
  onChange: (patch: Partial<RosterPayload>) => void;
  templateName: string;
  onTemplateName: (v: string) => void;
  templates: RosterTemplate[];
  activeId: number | null;
  onApply: (tpl: RosterTemplate) => void;
  onSave: () => void;
  onSaveAs: () => void;
  onDelete: (id: number) => void;
  onPublish?: (id: number) => void;
  isAdmin: boolean;
  saving?: boolean;
  onExcel: () => void;
  rowMm: number;
  onRowMm: (value: number) => void;
  layoutOnly?: boolean;
}) {
  const show = { stage: showStage, class: showClass, phone: showPhone };
  const cols = visibleColumns({ extraCols, widths, order, showClass, showStage, showPhone });
  const merged = mergeOrder(order, extraCols, show);

  function setWidth(id: string, raw: string) {
    const n = clampMm(Number(raw), EXTRA_DEFAULT_MM);
    if (id === "seq" || id === "name" || id === "class" || id === "stage" || id === "phone") {
      onChange({ widths: { ...widths, [id]: n } });
      return;
    }
    onChange({
      extraCols: extraCols.map((c) => (c.id === id ? { ...c, width: n } : c)),
    });
  }

  function move(id: string, dir: -1 | 1) {
    const idx = merged.indexOf(id);
    const nextIdx = idx + dir;
    if (idx < 0 || nextIdx < 0 || nextIdx >= merged.length) return;
    const next = [...merged];
    const [item] = next.splice(idx, 1);
    next.splice(nextIdx, 0, item);
    onChange({ order: next });
  }

  function addCol() {
    if (extraCols.length >= 24) return;
    const id = `c${Date.now()}`;
    const nextExtras = [...extraCols, { id, title: "", width: EXTRA_DEFAULT_MM }];
    onChange({ extraCols: nextExtras, order: [...merged, id] });
  }

  function removeCol(id: string) {
    onChange({
      extraCols: extraCols.filter((c) => c.id !== id),
      order: merged.filter((x) => x !== id),
    });
  }

  function resetWidths() {
    onChange({
      widths: { ...DEFAULT_COL_MM },
      extraCols: extraCols.map((c) => ({ ...c, width: EXTRA_DEFAULT_MM })),
    });
    toast.message(tr("أُعيدت المقاسات الافتراضية"));
  }

  return (
    <div className="no-print space-y-3">
      <div className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
        <Label htmlFor="roster-title" className="text-sm">
          {tr("بيانات الطلاب")}
        </Label>
        <Input
          id="roster-title"
          className="mt-2"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder={tr("بيانات الطلاب")}
          maxLength={160}
        />
      </div>

      <div className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{tr("أعمدة إضافية (اسم مختصر لكل عمود)")}</p>
            {extraCols.length === 0 ? (
              <p className="text-xs text-fg-muted">{tr("لا أعمدة إضافية — أضف عموداً واكتب اسمه المختصر.")}</p>
            ) : (
              <p className="text-xs text-fg-muted">{tr("يمكنك إضافة حتى 24 عموداً وتحديد عرض كل منها بالملم.")}</p>
            )}
          </div>
          <button
            type="button"
            className="rounded-full border border-primary px-3 py-1 text-sm font-semibold text-primary"
            onClick={() => onChange(gradeSheetPayload())}
          >
            {tr("نموذج كشف الدرجات")}
          </button>
          <button
            type="button"
            className="text-sm font-medium text-primary disabled:opacity-40"
            disabled={extraCols.length >= 24}
            onClick={addCol}
          >
            <span className="inline-flex items-center gap-1">
              <Plus className="size-4" />
              إضافة عمود
            </span>
          </button>
        </div>
        {extraCols.length > 0 ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {extraCols.map((col, i) => (
              <li key={col.id} className="flex items-center gap-1.5">
                <Input
                  value={col.title}
                  placeholder={`عمود ${i + 1}`}
                  maxLength={40}
                  onChange={(e) =>
                    onChange({
                      extraCols: extraCols.map((c) => (c.id === col.id ? { ...c, title: e.target.value } : c)),
                    })
                  }
                />
                <Input
                  className="w-16"
                  inputMode="decimal"
                  value={col.max ?? ""}
                  placeholder={tr("الحد")}
                  onChange={(e) => {
                    const max = Number(e.target.value);
                    onChange({
                      extraCols: extraCols.map((c) => (c.id === col.id ? { ...c, max: max > 0 ? max : undefined } : c)),
                    });
                  }}
                />
                <button type="button" className="text-xs text-danger" onClick={() => { if (window.confirm(tr("حذف هذا العمود؟"))) removeCol(col.id); }}>
                  {tr("حذف")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={showPhone}
              onChange={(e) => onChange({ showPhone: e.target.checked })}
            />
            {tr("جوال ولي الأمر")}
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={showClass}
              onChange={(e) => onChange({ showClass: e.target.checked })}
            />
            {tr("الفصل")}
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={showStage}
              onChange={(e) => onChange({ showStage: e.target.checked })}
            />
            {tr("الصف / المرحلة")}
          </label>
        </div>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{tr("تنسيق الجدول")}</p>
            <p className="text-xs text-fg-muted">{tr("عرض العمود وارتفاع الصف وترتيب الأعمدة. الحد الأعلى يُكتب تحت اسم العمود في الكشف.")}</p>
          </div>
          <button type="button" className="text-sm font-medium text-primary" onClick={resetWidths}>
            إعادة المقاسات الافتراضية
          </button>
        </div>
        <label className="mt-3 flex max-w-xs items-center gap-2 text-sm">
          <span className="shrink-0 font-medium">{tr("ارتفاع الصف")}</span>
          <Input
            type="number"
            min={4}
            max={16}
            value={rowMm}
            onChange={(e) => onRowMm(Math.min(16, Math.max(4, Number(e.target.value) || 7)))}
          />
          <span className="text-xs text-fg-muted">{tr("مم")}</span>
        </label>
        <p className="mt-1 text-xs text-fg-muted">{tr("صغّر ارتفاع الصف ليظهر الكشف في صفحة واحدة عند زيادة الطلاب.")}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {cols.map((col) => (
            <label key={col.id} className="space-y-1 text-xs text-fg-muted">
              <span className="block truncate">{col.title}</span>
              <span className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={COL_MM_MIN}
                  max={COL_MM_MAX}
                  value={col.width}
                  onChange={(e) => setWidth(col.id, e.target.value)}
                />
                <span>{tr("مم")}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {layoutOnly ? null : (
      <div className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
        <p className="text-sm font-semibold">{tr("حفظ القالب باسم")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            value={templateName}
            onChange={(e) => onTemplateName(e.target.value)}
            placeholder={isAdmin ? tr("كشف الفصل الأول") : tr("اسم قالبك الشخصي")}
            maxLength={60}
            className="max-w-xs"
          />
          <Button type="button" size="sm" disabled={saving} onClick={onSave}>
            <Save className="size-4" />
            حفظ القالب
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={onSaveAs}>
            حفظ باسم جديد
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onExcel}>
            Excel
            <Download className="size-4" />
          </Button>
        </div>
        <p className="mt-2 text-xs text-fg-muted">
          القوالب تظهر لجميع المعلمين. إذا صمّمها مدير التطبيق تظهر كقالب البرنامج، ويمكنك تعديلها وحفظها باسم جديد.
        </p>
        {templates.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {templates.map((tpl) => (
              <li
                key={tpl.id}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-sm",
                  activeId === tpl.id ? "border-primary" : "border-border",
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-right font-medium hover:text-primary"
                  onClick={() => onApply(tpl)}
                >
                  {tpl.name}
                </button>
                <span className="text-xs text-fg-muted">{tpl.public ? tr("عام") : tr("حسابي")}</span>
                <button type="button" className="text-xs text-primary" onClick={() => onApply(tpl)}>
                  تطبيق
                </button>
                {isAdmin && !tpl.public && onPublish ? (
                  <button type="button" className="text-xs text-primary" onClick={() => onPublish(tpl.id)}>
                    تعميم
                  </button>
                ) : null}
                {isAdmin || !tpl.public ? (
                  <button type="button" className="text-xs text-danger" onClick={() => { if (window.confirm(tr("حذف هذا القالب؟ لا يمكن التراجع."))) onDelete(tpl.id); }}>
                    {tr("حذف")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      )}

      <div className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
        <p className="mb-2 text-sm font-semibold">{tr("ترتيب الأعمدة وتقديمها")}</p>
        <div className="flex flex-wrap justify-end gap-2">
          {cols.map((col, i) => (
            <div
              key={col.id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-elevated px-2 py-1 text-sm"
            >
              <button
                type="button"
                className="grid size-7 place-items-center rounded-full text-fg-muted hover:bg-muted disabled:opacity-30"
                disabled={i === cols.length - 1}
                onClick={() => move(col.id, 1)}
                aria-label={tr("تحريك لليسار")}
              >
                <ArrowDown className="size-3.5" />
              </button>
              <button
                type="button"
                className="grid size-7 place-items-center rounded-full text-fg-muted hover:bg-muted disabled:opacity-30"
                disabled={i === 0}
                onClick={() => move(col.id, -1)}
                aria-label={tr("تحريك لليمين")}
              >
                <ArrowUp className="size-3.5" />
              </button>
              <span className="max-w-28 truncate px-1">{col.title}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
