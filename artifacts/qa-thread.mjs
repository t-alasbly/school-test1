import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8080";

async function shot(page, name) {
  await page.screenshot({ path: `/workspace/screenshots/${name}.png`, fullPage: true });
  console.log("shot", name);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  if (page.url().includes("/login")) {
    await page.fill("#email", "0505763155");
    await page.fill("#password", "1234");
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 25000 });
  }
  await page.waitForTimeout(800);
}

function must(body, needle, label) {
  if (!body.includes(needle)) throw new Error(`${label}: missing «${needle}» :: ${body.slice(0, 240)}`);
}
function mustNot(body, needle, label) {
  if (body.includes(needle)) throw new Error(`${label}: unexpected «${needle}»`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(25000);
page.on("pageerror", (err) => console.log("PAGEERROR", err.message));

await login(page);
const home = await page.locator("body").innerText();
mustNot(home, "هـ هـ", "home double era");
mustNot(home, "هـ هـ", "home");
console.log("home date", home.split("\n").find((l) => l.includes("هـ") || l.includes("الأربعاء")));
await shot(page, "qa-thread-home");

await page.goto(`${BASE}/attendance`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
const att = await page.locator("body").innerText();
mustNot(att, "هـ هـ", "attendance double");
must(att, "هـ", "attendance hijri");
const plus = await page.locator('button[aria-label^="تسجيل ملاحظة"]').count();
const improve = await page.locator('button[aria-label*="تحسين"], button:has-text("تحسين")').count();
console.log("attendance plus", plus, "improve-ish", improve);
await shot(page, "qa-thread-attendance");

await page.goto(`${BASE}/classes`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
const cls = await page.locator("body").innerText();
const plus2 = await page.locator('button[aria-label^="تسجيل ملاحظة"]').count();
console.log("classes plus", plus2, "body has ملاحظة", cls.includes("ملاحظة"));
await shot(page, "qa-thread-classes");

await page.goto(`${BASE}/desk/counselor`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
const desk = await page.locator("body").innerText();
must(desk, "حالات طلابي", "cases");
await shot(page, "qa-thread-cases");

await page.goto(`${BASE}/staff`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const permBtn = page.getByRole("button", { name: /صلاحيات/ }).first();
if (await permBtn.count()) {
  await permBtn.click();
  await page.waitForTimeout(500);
  const perm = await page.locator("body").innerText();
  must(perm, "إظهار صفحة الفصول", "perm viewClasses");
  must(perm, "إظهار صفحة الطباعة", "perm viewPrint");
  must(perm, "تعديل وحذف السجلات", "perm editRecords");
  must(perm, "تنسيق الصفوف", "perm editClasses");
  await shot(page, "qa-thread-perms");
} else {
  console.log("no perm button");
  await shot(page, "qa-thread-staff");
}

await page.goto(`${BASE}/settings/appearance`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const app = await page.locator("body").innerText();
must(app, "التقويم", "appearance calendar");
must(app, "هجري", "hijri setting");
await shot(page, "qa-thread-appearance");

await browser.close();
console.log("QA_OK");
