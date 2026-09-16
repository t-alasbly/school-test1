import { chromium } from "playwright";
import * as XLSX from "xlsx";

const BASE = "http://127.0.0.1:8080";

async function shot(page, name) {
  await page.screenshot({ path: `/workspace/screenshots/${name}.png`, fullPage: true });
  console.log("shot", name);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  if (page.url().includes("/login")) {
    await page.fill("#email", "0505763155");
    await page.fill("#password", "1234");
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 25000 });
  }
  await page.waitForTimeout(1000);
}

function must(body, needle, label) {
  if (!body.includes(needle)) {
    throw new Error(`${label}: missing «${needle}» in: ${body.slice(0, 280)}`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(25000);

  await login(page);
  await shot(page, "qa6-home");
  const home = await page.locator("body").innerText();
  must(home, "اختر المرحلة", "home");

  // 6. Staff job titles + 1. cancel employee
  await page.goto(`${BASE}/staff`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "qa6-staff");
  const staffText = await page.locator("body").innerText();
  must(staffText, "مدير مدرسة", "staff roles");
  must(staffText, "وكيل الشؤون المدرسية", "staff roles");
  must(staffText, "وكيل شؤون المعلمين", "staff roles");
  must(staffText, "مرشد طلابي", "staff roles");
  must(staffText, "مرشد صحي", "staff roles");
  must(staffText, "رائد نشاط", "staff roles");
  must(staffText, "إلغاء", "staff cancel");

  const roleOptions = await page.locator("#new-role option").evaluateAll((els) =>
    els.map((e) => e.textContent?.trim()),
  );
  for (const label of [
    "مدير مدرسة",
    "وكيل الشؤون المدرسية",
    "وكيل شؤون المعلمين",
    "مرشد طلابي",
    "مرشد صحي",
    "رائد نشاط",
    "وكيل شؤون الطلاب",
    "معلم",
    "مدير التطبيق",
  ]) {
    if (!roleOptions.includes(label)) throw new Error(`create-role missing ${label}: ${roleOptions}`);
  }
  console.log("roles ok", roleOptions);

  // create a temp staff then cancel
  const existing = page.locator("li").filter({ hasText: "رائد تجريبي" });
  if ((await existing.count()) === 0) {
    const phone = `059${String(Date.now()).slice(-7)}`;
    await page.fill("#new-name", "رائد تجريبي");
    await page.fill("#new-phone", phone);
    await page.selectOption("#new-role", "activity_leader");
    await page.getByRole("button", { name: "إضافة المستخدم" }).click();
    await page.waitForTimeout(1200);
  }
  const afterCreate = await page.locator("body").innerText();
  must(afterCreate, "رائد تجريبي", "created staff");
  must(afterCreate, "رائد نشاط", "created role label");
  await shot(page, "qa6-staff-created");

  const row = page.locator("li").filter({ hasText: "رائد تجريبي" }).first();
  const rowText = await row.innerText();
  if (rowText.includes("ملغى")) {
    console.log("already cancelled — reactivate then cancel");
    await row.getByRole("button", { name: "إعادة تفعيل" }).click();
    await page.waitForTimeout(1000);
  }
  await row.getByRole("button", { name: /إلغاء رائد تجريبي/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "تأكيد الإلغاء" }).click();
  await page.waitForTimeout(1000);
  const afterCancel = await page.locator("body").innerText();
  must(afterCancel, "ملغى", "cancelled badge");
  must(afterCancel, "إعادة تفعيل", "reactivate");
  await shot(page, "qa6-staff-cancelled");
  console.log("cancel staff ok");

  // 2. custom general messages
  await page.goto(`${BASE}/settings/messages`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const msgText = await page.locator("body").innerText();
  must(msgText, "رسائل عامة مخصصة", "messages page");
  const existingCustom = await page.locator("ul input").evaluateAll((els) =>
    els.map((e) => e.value),
  );
  if (!existingCustom.some((v) => v.includes("تهنئة"))) {
    await page.fill("#c-title", "تهنئة تفوّق");
    await page.fill("#c-body", "السلام عليكم ولي أمر الطالب {name}، نهنئكم بتفوق ابنكم في صف {class}.");
    await page.getByRole("button", { name: "إضافة للرسائل العامة" }).click();
    await page.waitForTimeout(1200);
  }
  await shot(page, "qa6-messages");
  const vals = await page.locator("ul input").evaluateAll((els) => els.map((e) => e.value));
  if (!vals.some((v) => v.includes("تهنئة"))) {
    throw new Error("saved custom template missing, inputs=" + JSON.stringify(vals));
  }
  console.log("custom message ok");

  // 3. improve behavior options
  await page.goto(`${BASE}/settings/improve`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const impText = await page.locator("body").innerText();
  must(impText, "خيارات تحسين السلوك", "improve settings");
  if (!impText.includes("احترام الطابور الصباحي")) {
    await page.getByPlaceholder("سلوك تريد تحسينه…").fill("احترام الطابور الصباحي");
    await page.getByRole("button", { name: "إضافة" }).click();
    await page.waitForTimeout(1000);
  }
  await shot(page, "qa6-improve");
  const afterImp = await page.locator("body").innerText();
  must(afterImp, "احترام الطابور الصباحي", "new improve option");
  console.log("improve catalog ok");

  // Seed a small roster so attendance/print have stages and classes
  const sheet = XLSX.utils.aoa_to_sheet([
    ["اسم الطالب", "جوال ولي الأمر", "المرحلة", "الفصل"],
    ["خالد التجريبي", "0501112201", "أول متوسط", "1"],
    ["سعد التجريبي", "0501112202", "أول متوسط", "2"],
    ["فهد التجريبي", "0501112203", "أول متوسط", "3"],
    ["ماجد التجريبي", "0501112204", "أول متوسط", "4"],
    ["بندر التجريبي", "0501112205", "أول متوسط", "5"],
    ["يوسف التجريبي", "0501112211", "ثاني متوسط", "1"],
    ["تركي التجريبي", "0501112212", "ثاني متوسط", "2"],
    ["نايف التجريبي", "0501112213", "ثاني متوسط", "3"],
    ["سلطان التجريبي", "0501112214", "ثاني متوسط", "4"],
    ["عمر التجريبي", "0501112215", "ثاني متوسط", "5"],
    ["حسن التجريبي", "0501112221", "ثالث متوسط", "1"],
    ["علي التجريبي", "0501112222", "ثالث متوسط", "2"],
    ["إبراهيم التجريبي", "0501112223", "ثالث متوسط", "3"],
    ["راشد التجريبي", "0501112224", "ثالث متوسط", "4"],
    ["حمد التجريبي", "0501112225", "ثالث متوسط", "5"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "طلاب");
  const xlsxPath = "/tmp/qa6-students.xlsx";
  XLSX.writeFile(wb, xlsxPath);

  await page.goto(`${BASE}/import`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const already = await page.locator("body").innerText();
  if (!already.includes("خالد التجريبي")) {
    await page.getByRole("button", { name: /استيراد من إكسل/ }).click();
    await page.waitForTimeout(300);
    await page.locator('input[type="file"]').setInputFiles(xlsxPath);
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "اعتماد استيراد الطلاب" }).click();
    await page.waitForTimeout(2500);
  }
  await shot(page, "qa6-imported");
  const imported = await page.locator("body").innerText();
  must(imported, "خالد التجريبي", "imported student");
  console.log("import ok");

  // 3b. improve dialog on a student
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "qa6-home-stages");
  await page.locator("a").filter({ hasText: "أول متوسط" }).first().click();
  await page.waitForTimeout(700);
  await page.locator("a").filter({ hasText: /أولى/ }).first().click();
  await page.waitForTimeout(800);
  const improveBtn = page.getByRole("button", { name: /تحسين سلوك/ }).first();
  await improveBtn.click();
  await page.waitForTimeout(400);
  const dlg = await page.locator('[role="dialog"]').innerText();
  must(dlg, "السلوك الذي تريد تحسينه", "improve dialog");
  if (!dlg.includes("احترام الطابور الصباحي") && !dlg.includes("احترام المعلم")) {
    throw new Error("improve chips missing: " + dlg.slice(0, 200));
  }
  await shot(page, "qa6-improve-dialog");
  await page.keyboard.press("Escape");
  console.log("improve dialog ok");

  // 4. attendance checkboxes
  await page.goto(`${BASE}/attendance`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "qa6-attendance");
  const att = await page.locator("body").innerText();
  must(att, "المراحل", "attendance stages");
  must(att, "أولى", "attendance stage chip");
  const stageChecks = await page.locator("form input[type='checkbox']").count();
  if (stageChecks < 8) throw new Error(`expected stage+class checkboxes, got ${stageChecks}`);
  const firstStage = page.locator("form label").filter({ has: page.locator("input[type='checkbox']") }).first();
  const firstName = (await firstStage.innerText()).trim();
  await firstStage.locator("input").uncheck();
  await page.waitForTimeout(800);
  await shot(page, "qa6-attendance-filter");
  console.log("attendance checkboxes ok, unchecked", firstName, "count", stageChecks);

  // 5. print compensation checkbox on forms page
  await page.goto(`${BASE}/forms`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const formText = await page.locator("body").innerText();
  must(formText, "إظهار فرص التعويض في التعهد والخطاب", "forms compensation toggle");
  await shot(page, "qa6-print-comp");
  console.log("print compensation checkbox ok");

  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "qa6-admin");
  const printBtn = page.getByRole("button", { name: "طباعة تعهد" }).first();
  if (await printBtn.count()) {
    await printBtn.click();
    await page.waitForTimeout(600);
    const dlg = await page.locator('[role="dialog"]').innerText();
    must(dlg, "إظهار فرص التعويض في التعهد والخطاب", "print compensation toggle");
    await shot(page, "qa6-print-comp");
    await page.keyboard.press("Escape");
    console.log("print compensation checkbox ok");
  } else {
    console.log("no print button on admin — skip");
  }

  // settings hub has improve card
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const hub = await page.locator("body").innerText();
  must(hub, "خيارات تحسين السلوك", "settings hub");
  must(hub, "رسائل عامة مخصصة", "settings hub messages blurb");
  await shot(page, "qa6-settings-hub");

  console.log("ALL SIX CHECKS PASSED");
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
