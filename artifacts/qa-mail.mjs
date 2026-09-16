import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8080";

async function shot(page, name) {
  await page.screenshot({ path: `/workspace/screenshots/${name}.png`, fullPage: true });
  console.log("shot", name);
}

function must(body, needle, label) {
  if (!body.includes(needle)) throw new Error(`${label}: missing «${needle}» :: ${body.slice(0, 280)}`);
}
function mustNot(body, needle, label) {
  if (body.includes(needle)) throw new Error(`${label}: unexpected «${needle}»`);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  if (page.url().includes("/login")) {
    await page.fill("#email", "0505763155");
    await page.fill("#password", "1234");
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 25000 });
  }
  await page.waitForTimeout(700);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(25000);
page.on("pageerror", (err) => console.log("PAGEERROR", err.message));

await login(page);

await page.goto(`${BASE}/attendance`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const att = await page.locator("body").innerText();
if (att.includes("Something went") || att.includes("Error Component")) throw new Error(`attendance crash: ${att.slice(0, 400)}`);
must(att, "الغياب اليومي والتأخر", "attendance title");
must(att, "حاضر", "present chip");
must(att, "غياب", "absence chip");
const plusAtt = await page.locator('button[aria-label^="تسجيل ملاحظة"]').count();
const sproutAtt = await page.locator('button[aria-label*="تحسين"]').count();
const waAtt = await page.locator('button[aria-label^="واتساب"], button[aria-label*="واتساب"]').count();
const mailAtt = await page.locator('button[aria-label^="مراسلة"]').count();
if (plusAtt !== 0) throw new Error(`attendance must not have plus, got ${plusAtt}`);
if (sproutAtt !== 0) throw new Error(`attendance must not have sprout, got ${sproutAtt}`);
if (waAtt !== 0) throw new Error(`attendance must not have whatsapp, got ${waAtt}`);
if (mailAtt !== 0) throw new Error(`attendance must not have mail, got ${mailAtt}`);
mustNot(att, "مراسلة المرشد", "attendance counselor");
console.log("attendance actions", { plusAtt, sproutAtt, waAtt, mailAtt, students: att.includes("طالب") });
await shot(page, "qa-mail-attendance");

await page.goto(`${BASE}/classes`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
const cls = await page.locator("body").innerText();
if (cls.includes("Something went")) throw new Error(`classes crash: ${cls.slice(0, 400)}`);
const plusCls = await page.locator('button[aria-label^="تسجيل ملاحظة"]').count();
const sproutCls = await page.locator('button[aria-label*="تحسين"]').count();
const waCls = await page.locator('button[aria-label^="واتساب"], button[aria-label*="واتساب"]').count();
const mailCls = await page.locator('button[aria-label^="مراسلة"]').count();
if (plusCls < 1) throw new Error(`classes missing plus, got ${plusCls}`);
if (sproutCls < 1) throw new Error(`classes missing sprout, got ${sproutCls}`);
if (waCls !== 0) throw new Error(`classes must not have whatsapp, got ${waCls}`);
if (mailCls !== 0) throw new Error(`classes must not have mail, got ${mailCls}`);
mustNot(cls, "مراسلة المرشد", "classes counselor btn");
console.log("classes actions", { plusCls, sproutCls, waCls, mailCls });
await shot(page, "qa-mail-classes");

await page.locator('button[aria-label^="تسجيل ملاحظة"]').first().click();
await page.waitForTimeout(400);
const dlg = await page.locator('[role="dialog"]').innerText();
must(dlg, "تسجيل ملاحظة أو مخالفة", "plus dialog");
mustNot(dlg, "إرسال إلى", "plus dest chips");
mustNot(dlg, "المرشد الطلابي", "plus dest counselor");
mustNot(dlg, "المرشد الصحي", "plus dest health");
must(dlg, "غياب", "plus types");
must(dlg, "تأخر", "plus late");
must(dlg, "واجب", "plus hw");
must(dlg, "سلوك", "plus behavior");
await shot(page, "qa-mail-plus");
await page.locator('[role="dialog"] button:has-text("إغلاق"), [role="dialog"] button .sr-only:has-text("إغلاق")').first().click({ force: true }).catch(() => {});
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.locator('[role="dialog"]').waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});

await page.locator("ul.divide-y li > button").first().click();
await page.waitForTimeout(1000);
await shot(page, "qa-mail-sheet");
const waSheet = await page.locator('button[aria-label^="مراسلة ولي أمر"]').count();
const staffMail = await page.locator('button[aria-label^="مراسلة عن"]').count();
const mailText = await page.locator('button:has-text("مراسلة")').count();
console.log("sheet buttons", { waSheet, staffMail, mailText });
if (staffMail < 1 && mailText < 1) throw new Error("student sheet missing مراسلة");
if (waSheet < 1) throw new Error("student sheet missing WhatsApp (مراسلة ولي أمر)");

await page.locator('button[aria-label^="مراسلة عن"], button:has-text("مراسلة")').first().click();
await page.waitForTimeout(500);
const mailDlg = await page.locator('[role="dialog"]').last().innerText();
must(mailDlg, "وكيل شؤون الطلاب", "mail dest vp");
must(mailDlg, "المرشد الطلابي", "mail dest counselor");
must(mailDlg, "المرشد الصحي", "mail dest health");
must(mailDlg, "معلم آخر", "mail dest teacher");
await page.locator('[role="dialog"] textarea').last().fill("متابعة تجريبية للطالب من المدير");
await page.locator('[role="dialog"] button:has-text("إرسال المراسلة")').click();
await page.waitForTimeout(1200);
await shot(page, "qa-mail-sent");

await page.goto(`${BASE}/settings/school`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
const sch = await page.locator("body").innerText();
must(sch, "السطر الأول", "school line1");
must(sch, "السطر الثاني", "school line2");
must(sch, "اسم المدرسة (السطر الثالث", "school line3");
must(sch, "ثلاث خانات", "school empty fields copy");
mustNot(sch, "placeholder=\"مثال: مكة المكرمة\"", "old region placeholder");
await page.fill("#region", "منطقة مكة المكرمة");
await page.fill("#gov", "إدارة التعليم بمحافظة جدة");
await page.waitForTimeout(200);
const preview = await page.locator("body").innerText();
must(preview, "منطقة مكة المكرمة", "verbatim line1");
must(preview, "إدارة التعليم بمحافظة جدة", "verbatim line2");
mustNot(preview, "إدارة التعليم بمنطقة مكة", "no auto prefix on region");
await shot(page, "qa-mail-letterhead");

await page.goto(`${BASE}/desk/mail`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
const inbox = await page.locator("body").innerText();
must(inbox, "مراسلاتي", "desk mail");
must(inbox, "متابعة تجريبية", "sent mail appears");
await shot(page, "qa-mail-inbox");

console.log("QA_MAIL_OK");
await browser.close();
