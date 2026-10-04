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

const home = await page.locator("body").innerText();
must(home, "رسائل جماعية", "home card");
await shot(page, "qa-bulk-home");

const nav = page.locator("nav").filter({ hasText: "الرسائل" });
if ((await nav.count()) === 0) throw new Error("nav missing الرسائل");

await page.goto(`${BASE}/messages`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
const body = await page.locator("body").innerText();
if (body.includes("Something went") || body.includes("Error")) throw new Error(`messages crashed: ${body.slice(0, 400)}`);
must(body, "رسائل جماعية", "page title");
must(body, "غائبو اليوم", "absence scope");
must(body, "متأخرو اليوم", "late scope");
must(body, "فصل", "class scope");
await shot(page, "qa-bulk-page");

await page.getByRole("button", { name: "صف كامل" }).click();
await page.waitForTimeout(600);
await shot(page, "qa-bulk-stage");

await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const set = await page.locator("body").innerText();
must(set, "رسائل جماعية", "settings card");
must(set, "قوالب واتساب", "templates renamed");
await shot(page, "qa-bulk-settings");

console.log("QA_BULK_OK");
await browser.close();
