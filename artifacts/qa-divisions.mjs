import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8080";

async function shot(page, name) {
  await page.screenshot({ path: `/workspace/screenshots/${name}.png`, fullPage: true });
  console.log("shot", name);
}

function must(body, needle, label) {
  if (!body.includes(needle)) throw new Error(`${label}: missing «${needle}» :: ${body.slice(0, 280)}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(25000);
page.on("pageerror", (err) => console.log("PAGEERROR", err.message));

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
if (page.url().includes("/login")) {
  await page.fill("#email", "0505763155");
  await page.fill("#password", "1234");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 25000 });
}
await page.waitForTimeout(700);

await page.goto(`${BASE}/classes`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const cls = await page.locator("body").innerText();
console.log("classes students line", cls.split("\n").find((l) => l.includes("طالب")) || cls.slice(0, 200));
const stageBtn = page.locator("button").filter({ hasText: /أولى|ثاني|ثالث/ }).first();
if (await stageBtn.count()) {
  await stageBtn.click();
  await page.waitForTimeout(400);
}
await shot(page, "qa-div-classes");
const pop = await page.locator("body").innerText();
must(pop, "جميع الفصول", "stage popover");

await page.goto(`${BASE}/settings/classes`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
const set = await page.locator("body").innerText();
must(set, "حذف الأقسام الفارغة", "prune btn");
must(set, "تنسيق الصفوف", "classes settings");
await shot(page, "qa-div-settings");

const prune = page.getByRole("button", { name: "حذف الأقسام الفارغة" });
page.once("dialog", (d) => d.accept());
await prune.click();
await page.waitForTimeout(1200);
await shot(page, "qa-div-pruned");
const after = await page.locator("body").innerText();
console.log("after prune snippet", after.split("\n").filter((l) => l.includes("قسم") || l.includes("طلاب") || l.includes("فارغ")).slice(0, 8));

await page.goto(`${BASE}/import`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.getByRole("button", { name: /استيراد من إكسل/ }).click();
await page.waitForTimeout(400);
const imp = await page.locator("body").innerText();
must(imp, "تُحذف الأقسام الفارغة القديمة", "import hint");
await shot(page, "qa-div-import");

await page.goto(`${BASE}/classes`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await shot(page, "qa-div-classes-after");
const later = await page.locator("body").innerText();
if (later.includes("Something went") || later.includes("Error")) throw new Error("classes crashed");

console.log("QA_DIV_OK");
await browser.close();
