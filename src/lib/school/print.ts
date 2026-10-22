import { toast } from "sonner";

const MOUNT_ID = "school-print-mount";

function reveal(node: HTMLElement) {
  node.inert = false;
  node.removeAttribute("inert");
  node.removeAttribute("aria-hidden");
  node.removeAttribute("data-inert-ed");
  node.removeAttribute("data-aria-hidden");
}

function collectedStyles() {
  return Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => {
      if (node instanceof HTMLLinkElement && node.href) {
        return `<link rel="stylesheet" href="${node.href}">`;
      }
      return node.outerHTML;
    })
    .join("");
}

function prepareClone(el: HTMLElement) {
  const clone = el.cloneNode(true) as HTMLElement;
  const live = el.querySelectorAll("input, textarea");
  const copied = clone.querySelectorAll("input, textarea");
  live.forEach((node, index) => {
    const target = copied[index];
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
      target.value = node.value;
      target.setAttribute("value", node.value);
    }
  });
  clone.classList.add("print-form", "print-report");
  clone.classList.remove("hidden");
  clone.style.display = "block";
  clone.style.visibility = "visible";
  return clone;
}

function absoluteMarkup(html: string) {
  const origin = location.origin;
  return html.replace(/(src|href)=("|')\/(?!\/)/g, `$1=$2${origin}/`);
}

function printInPlace(el: HTMLElement) {
  let mount = document.getElementById(MOUNT_ID);
  if (!mount) {
    mount = document.createElement("div");
    mount.id = MOUNT_ID;
    document.body.appendChild(mount);
  }
  mount.innerHTML = "";
  mount.appendChild(prepareClone(el));
  Array.from(document.body.children).forEach((node) => {
    if (node instanceof HTMLElement) reveal(node);
  });
  reveal(mount);
  document.body.classList.add("printing-form");
  const done = () => {
    document.body.classList.remove("printing-form");
    mount.innerHTML = "";
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.setTimeout(done, 60_000);
  window.print();
}

function printInPopup(el: HTMLElement) {
  const markup = absoluteMarkup(prepareClone(el).outerHTML);
  const win = window.open("", "_blank");
  if (!win) {
    toast.error("اسمح بالنوافذ المنبثقة حتى تظهر الطباعة.");
    printInPlace(el);
    return;
  }
  win.document.open();
  win.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<title>طباعة</title>
${collectedStyles()}
<style>
  @page { size: A4 portrait; margin: 0; }
  html, body { margin: 0; background: #fff; color: #111; direction: rtl; }
  body { font-family: "Noto Naskh Arabic", Amiri, "Times New Roman", serif; font-size: 12px; line-height: 1.45; }
  .print-form {
    box-sizing: border-box;
    width: 210mm;
    max-width: 210mm;
    margin: 0 auto;
    padding: var(--print-margin-top, 10mm) var(--print-margin-right, 10mm) var(--print-margin-bottom, 12mm) var(--print-margin-left, 8mm);
  }
  .print-form h2, .student-print-line, .year-title { text-align: center; }
  .year-title { display: block; width: 100%; border: 0; background: transparent; font-weight: 700; font-size: 14px; margin: 0 0 8px; }
  .student-print-line { margin: 4px 0 10px; font-size: 15px; }
  .block { display: block; }
  .text-center { text-align: center; }
  .text-right { text-align: right; }
  .font-semibold, strong { font-weight: 700; }
  .official-accent { background: #00857c; }
  .print-form header .grid {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 8px;
    text-align: center;
  }
  .ksa-diwani { height: 32px; width: auto; }
  img { max-height: 52px; width: auto; object-fit: contain; }
  table, .official-table, .grade-equal, .grade-sheet {
    width: 100% !important;
    border-collapse: collapse;
    text-align: center;
    margin: 6px 0 10px;
    table-layout: fixed;
  }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  .grade-sheet tbody tr, .grade-equal tbody tr,
  .grade-sheet tbody td, .grade-equal tbody td {
    height: var(--row-h, 8mm) !important;
    min-height: var(--row-h, 8mm) !important;
    box-sizing: border-box;
    padding-top: 0;
    padding-bottom: 0;
    line-height: 1;
  }
  .grade-sheet thead tr:first-child th, .grade-equal thead th {
    background: #9aa0a6 !important;
    color: #fff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .grade-sheet thead tr:nth-child(2) th {
    background: #e5e7eb !important;
    color: #111 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .grade-sheet tbody tr:nth-child(even) td, .grade-equal tbody tr:nth-child(even) td {
    background: #f3f4f6 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .grade-name, td.grade-name { text-align: right !important; font-weight: 700 !important; font-size: var(--name-font, 13px) !important; }
  th, td { border: 1px solid #111; padding: 1px 3px; vertical-align: middle; font-size: 11px; }
  .grade-warn { display: none !important; }
  input, .grade-sheet input, .roster-fit input {
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    text-align: center;
    width: 100%;
    font: inherit;
    padding: 0;
  }
  .year-sheet, .official-sheet { border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
  .grade-scroll { overflow: visible !important; width: 100% !important; }
  .year-sheet table, .grade-equal, .grade-sheet { width: 100% !important; max-width: 100% !important; }
  .sheet-signs { display: flex; justify-content: space-between; margin-top: 14px; text-align: center; break-inside: avoid; }
  .sheet-signs p { margin: 2px 0; }
</style>
</head>
<body class="printing-form"><div id="${MOUNT_ID}">${markup}</div></body>
</html>`);
  win.document.close();
  const close = () => {
    win.removeEventListener("afterprint", close);
    win.close();
  };
  win.addEventListener("afterprint", close);

  let printed = false;
  const run = () => {
    if (printed) return;
    printed = true;
    win.focus();
    win.print();
  };
  const links = Array.from(win.document.querySelectorAll('link[rel="stylesheet"]'));
  const images = Array.from(win.document.images);
  let pending = links.length + images.length;
  const tick = () => {
    pending -= 1;
    if (pending <= 0) win.setTimeout(run, 60);
  };
  if (pending === 0) win.setTimeout(run, 60);
  for (const link of links) {
    const sheet = link instanceof HTMLLinkElement ? link.sheet : null;
    if (sheet) tick();
    else {
      link.addEventListener("load", tick);
      link.addEventListener("error", tick);
    }
  }
  for (const img of images) {
    if (img.complete) tick();
    else {
      img.addEventListener("load", tick);
      img.addEventListener("error", tick);
    }
  }
  win.setTimeout(run, 1200);
}

/** The preview blocks printing in-page. A short-lived window shows the system print box, then closes itself. */
export function printElement(el: HTMLElement) {
  printInPopup(el);
}
