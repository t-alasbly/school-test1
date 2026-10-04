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
  @page { size: A4; margin: 8mm; }
  html, body { margin: 0; background: #fff; color: #111; direction: rtl; }
  body { font-family: "Noto Naskh Arabic", Amiri, "Times New Roman", serif; font-size: 14px; line-height: 1.6; }
  .print-form { width: 100%; max-width: 196mm; margin: 0 auto; }
  .print-form h2, .student-print-line { text-align: center; }
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
  .ksa-diwani { height: 35px; width: auto; }
  img { max-height: 62px; width: auto; object-fit: contain; }
  table, .official-table {
    width: 100%;
    border-collapse: collapse;
    text-align: center;
    margin: 8px 0 12px;
  }
  body.printing-form #school-print-mount .official-table th,
  body.printing-form #school-print-mount .official-table td,
  body.printing-form #school-print-mount table th,
  body.printing-form #school-print-mount table td {
    border: 1px solid #111 !important;
    padding: 6px 4px !important;
    vertical-align: middle;
    text-align: center;
    background: #fff !important;
    color: #111 !important;
  }
  body.printing-form #school-print-mount .official-table th,
  body.printing-form #school-print-mount table th {
    background: #e7f4f2 !important;
    font-weight: 700;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .attendance-print tr { height: auto; break-inside: avoid; }
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
