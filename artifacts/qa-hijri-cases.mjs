import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8080";

async function shot(page, name) {
  await page.screenshot({ path: `/workspace/screenshots/${name}.png`, fullPage: true });
  console.log("shot", name);
}

function must(body, needle, label) {
  if (!body.includes(needle)) {
    throw new Error(`${label}: missing «${needle}» in: ${body.slice(0, 400)}`);
  }
}

function mustNot(body, needle, label) {
  if (body.includes(needle)) {
    throw new Error(`${label}: unexpected «${needle}»`);
  }
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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(25000);
  page.on("pageerror", (err) => console.log("PAGEERROR", err.message));

  await login(page);
  const home = await page.locator("body").innerText();
  console.log("school", home.split("\n").slice(0, 8).join(" | "));
  must(home, "حالاتي", "home card");
  mustNot(home, "هـ هـ", "no double hijri mark");
  if (!/١٤48|1448|١٤٤٨/.test(home) && !home.includes("هـ")) {
    throw new Error("home missing hijri date");
  }
  await shot(page, "qa-hijri-home");

  await page.goto(`${BASE}/attendance`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const att = await page.locator("body").innerText();
  if (att.includes("Something went") || att.includes("Error")) {
    throw new Error(`attendance crashed: ${att.slice(0, 500)}`);
  }
  must(att, "الغياب اليومي والتأخر", "attendance title");
  must(att, "هـ", "hijri default");
  mustNot(att, "type=\"date\"", "no native date");
  const nativeDate = await page.locator('input[type="date"]').count();
  if (nativeDate !== 0) throw new Error("native date input still present");
  const hToggle = page.getByRole("button", { name: "هـ", exact: true });
  const mToggle = page.getByRole("button", { name: "م", exact: true });
  if ((await hToggle.count()) === 0 || (await mToggle.count()) === 0) {
    throw new Error("missing هـ/م toggle");
  }
  await shot(page, "qa-hijri-attendance");

  await page.getByRole("button", { name: "م", exact: true }).click();
  await page.waitForTimeout(700);
  const afterM = await page.locator("body").innerText();
  must(afterM, "م", "gregorian toggle");
  await shot(page, "qa-hijri-attendance-g");

  await page.getByRole("button", { name: "هـ", exact: true }).click();
  await page.waitForTimeout(700);

  const chip = page.locator("header").filter({ hasText: "الغياب اليومي والتأخر" }).locator("button").nth(1);
  const box = await chip.boundingBox();
  console.log("date chip box", box);
  if (box && box.height > 72) throw new Error(`date chip too tall: ${box.height}`);

  await page.goto(`${BASE}/desk/counselor`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const desk = await page.locator("body").innerText();
  if (desk.includes("Something went") || desk.includes("Error")) {
    throw new Error(`desk crashed: ${desk.slice(0, 500)}`);
  }
  must(desk, "حالات طلابي", "teacher cases title");
  must(desk, "للإرشاد", "filter counseling");
  must(desk, "لوكيل شؤون الطلاب", "filter vp");
  must(desk, "كل ما حرّرته", "filter all");
  must(desk, "حالاتي", "nav cases");
  const casesNav = page.getByRole("link", { name: "حالاتي" });
  const casesBox = await casesNav.boundingBox();
  console.log("cases nav box", casesBox);
  if (casesBox && casesBox.width < 48) throw new Error("حالاتي chip truncated");
  await shot(page, "qa-hijri-cases");

  await page.goto(`${BASE}/settings/appearance`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const app = await page.locator("body").innerText();
  must(app, "التقويم", "appearance calendar");
  must(app, "هجري", "hijri option");
  must(app, "ميلادي", "gregorian option");
  await shot(page, "qa-hijri-appearance");

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/attendance`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await shot(page, "qa-hijri-attendance-wide");

  await browser.close();
  console.log("QA_OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
