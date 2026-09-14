import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8080";

async function shot(page, name) {
  await page.screenshot({ path: `/workspace/screenshots/${name}.png`, fullPage: true });
  console.log("shot", name);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(20000);

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.fill("#email", "0505763155");
  await page.fill("#password", "1234");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 });
  await page.waitForTimeout(1200);
  await shot(page, "qa4-dashboard");

  const body = await page.locator("body").innerText();
  if (!body.includes("أول متوسط") && !body.includes("اختر المرحلة")) {
    throw new Error("dashboard missing stages: " + body.slice(0, 200));
  }

  await page.getByRole("link", { name: /أول متوسط/ }).click();
  await page.waitForTimeout(600);
  await page.getByRole("link").filter({ hasText: /أولى/ }).first().click();
  await page.waitForTimeout(800);
  await shot(page, "qa4-class");

  // Add student
  await page.getByRole("button", { name: "إضافة طالب" }).click();
  await page.waitForTimeout(300);
  await page.fill("#st-name", "زياد التجريبي");
  await page.fill("#st-phone", "0509998877");
  await page.getByRole("button", { name: "إضافة" }).click();
  await page.waitForTimeout(800);
  const classText = await page.locator("body").innerText();
  if (!classText.includes("زياد التجريبي")) {
    throw new Error("added student not visible");
  }
  console.log("add student ok");

  // Edit + transfer
  await page.getByRole("button", { name: /تعديل بيانات زياد التجريبي/ }).click();
  await page.waitForTimeout(300);
  await page.fill("#st-name", "زياد المنقول");
  const classSelect = page.locator("#st-class");
  const options = await classSelect.locator("option").evaluateAll((els) =>
    els.map((e) => ({ value: e.value, label: e.textContent })),
  );
  const other = options.find((o) => o.label && !o.label.includes("أولى / 1") && o.value);
  if (other) {
    await classSelect.selectOption(other.value);
    console.log("transfer target", other.label);
  }
  await page.getByRole("button", { name: "حفظ التعديلات" }).click();
  await page.waitForTimeout(800);
  const afterEdit = await page.locator("body").innerText();
  if (afterEdit.includes("زياد المنقول")) {
    console.log("rename stayed in class (or same class)");
  } else {
    console.log("student transferred away — expected");
  }
  await shot(page, "qa4-after-edit");

  // Record a note on first remaining student
  const plus = page.getByRole("button", { name: /تسجيل ملاحظة/ }).first();
  await plus.click();
  await page.waitForTimeout(300);
  const periodSelect = page.locator('select[id^="period-"]');
  const periodVal = await periodSelect.inputValue();
  console.log("auto period", periodVal);
  await page.getByRole("button", { name: "سلوك" }).click();
  await page.waitForTimeout(200);
  await page.locator('[role="dialog"], [data-radix-popper-content-wrapper]').getByRole("button").nth(1).click();
  await page.waitForTimeout(1000);
  await shot(page, "qa4-note");

  // Open first student sheet
  await page.locator("ul li button").first().click();
  await page.waitForTimeout(800);
  const sheet = await page.locator("body").innerText();
  if (!sheet.includes("طباعة نموذج") && !sheet.includes("نماذج")) {
    console.log("print button text missing in sheet, body snippet:", sheet.slice(-400));
  } else {
    console.log("print button visible in sheet");
  }
  await shot(page, "qa4-sheet");

  if (await page.getByRole("button", { name: /طباعة نموذج/ }).count()) {
    await page.getByRole("button", { name: /طباعة نموذج/ }).click();
    await page.waitForTimeout(500);
    const dlg = await page.locator("body").innerText();
    if (!dlg.includes("تعهد سلوكي") && !dlg.includes("النموذج")) {
      console.log("print dialog maybe empty", dlg.slice(-300));
    } else {
      console.log("print dialog ok");
    }
    await shot(page, "qa4-print");
    await page.keyboard.press("Escape");
  }

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // Settings season
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /صيفي/ }).click();
  await page.getByRole("button", { name: "حفظ بيانات المدرسة" }).click();
  await page.waitForTimeout(800);
  const settingsText = await page.locator("body").innerText();
  if (!settingsText.includes("6:45") && !settingsText.includes("صيفي")) {
    throw new Error("summer schedule not shown");
  }
  console.log("season toggle ok");
  await shot(page, "qa4-settings");

  // Admin print
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "qa4-admin");
  const adminText = await page.locator("body").innerText();
  console.log("admin has print?", adminText.includes("طباعة تعهد"));
  console.log("admin has notes?", adminText.includes("مخالفة") || adminText.includes("سلوك"));

  await browser.close();
  console.log("QA DONE");
}

main().catch((err) => {
  console.error("QA FAIL", err);
  process.exit(1);
});
