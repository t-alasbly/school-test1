import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8080";
async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  if (page.url().includes("/login")) {
    await page.fill("#email", "0505763155");
    await page.fill("#password", "1234");
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 25000 });
  }
  await page.waitForTimeout(600);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(30000);
page.on("pageerror", (err) => console.log("PAGEERROR", err.message));
await login(page);

await page.goto(`${BASE}/classes`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.locator('button[aria-label^="تسجيل ملاحظة"]').first().click();
await page.waitForTimeout(400);
const dlg = await page.locator('[role="dialog"]').innerText();
console.log("NOTE DIALOG HAS DEST", {
  vp: dlg.includes("وكيل شؤون الطلاب"),
  counselor: dlg.includes("المرشد الطلابي"),
  health: dlg.includes("المرشد الصحي"),
});
if (!dlg.includes("وكيل شؤون الطلاب") || !dlg.includes("المرشد الصحي")) {
  throw new Error("note dest chips missing: " + dlg.slice(0, 400));
}
await page.getByRole("button", { name: "واجب" }).click();
await page.getByRole("button", { name: "المرشد الطلابي" }).click();
await page.locator("textarea").first().fill("تجربة مراسلة للإرشاد");
await page.getByRole("button", { name: /إرسال/ }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: "/workspace/screenshots/qa-thread-note-sent.png", fullPage: true });

await page.goto(`${BASE}/desk`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
const desk = await page.locator("body").innerText();
console.log("desk has thread", desk.includes("مراسلة الملاحظة"), "has note", desk.includes("تجربة مراسلة") || desk.includes("واجب") || desk.includes("عدم حل"));
await page.screenshot({ path: "/workspace/screenshots/qa-thread-desk.png", fullPage: true });
if (await page.getByRole("button", { name: /مراسلة الملاحظة|فتح الدردشة/ }).count()) {
  await page.getByRole("button", { name: /مراسلة الملاحظة|فتح الدردشة/ }).first().click();
  await page.waitForTimeout(500);
  await page.locator("textarea").last().fill("متابعة من المعلم للمرشد على نفس الملاحظة");
  await page.getByRole("button", { name: "إرسال المراسلة" }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/workspace/screenshots/qa-thread-chat.png", fullPage: true });
  const chat = await page.locator("body").innerText();
  if (!chat.includes("متابعة من المعلم")) throw new Error("thread message missing");
  console.log("thread send ok");
}

await page.goto(`${BASE}/staff`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const teacherCard = page.locator("li, article, div").filter({ hasText: "معلم" }).filter({ hasText: "صلاحيات" }).first();
await page.getByRole("button", { name: "صلاحيات" }).nth(1).click().catch(() => {});
await page.waitForTimeout(400);
let open = await page.getByRole("dialog").count();
if (!open) {
  const btns = page.getByRole("button", { name: "صلاحيات" });
  const n = await btns.count();
  console.log("perm buttons", n);
  if (n > 0) await btns.nth(Math.min(1, n - 1)).click();
  await page.waitForTimeout(500);
}
const permDlg = page.getByRole("dialog");
const permText = await permDlg.innerText();
console.log("perm dialog keys", ["الفصول", "الطباعة", "السجلات", "تنسيق"].map((k) => [k, permText.includes(k)]));
const classesToggle = permDlg.getByRole("checkbox", { name: /إظهار صفحة الفصول/ });
if (await classesToggle.count()) {
  const before = await classesToggle.getAttribute("aria-checked");
  await classesToggle.click();
  await page.waitForTimeout(900);
  const after = await classesToggle.getAttribute("aria-checked");
  console.log("viewClasses", before, "->", after);
  if (before === after) throw new Error("permission did not toggle");
  await classesToggle.click();
  await page.waitForTimeout(900);
  const back = await classesToggle.getAttribute("aria-checked");
  console.log("viewClasses restored", back);
} else {
  console.log("checkbox not found, perm text snippet", permText.slice(0, 300));
}
await page.screenshot({ path: "/workspace/screenshots/qa-thread-perm-dialog.png" });

await browser.close();
console.log("QA2_OK");
