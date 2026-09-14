const MOUNT_ID = "school-print-mount";

export function printElement(el: HTMLElement) {
  let mount = document.getElementById(MOUNT_ID);
  if (!mount) {
    mount = document.createElement("div");
    mount.id = MOUNT_ID;
    document.body.appendChild(mount);
  }
  mount.innerHTML = "";
  const clone = el.cloneNode(true) as HTMLElement;
  clone.classList.add("print-form");
  mount.appendChild(clone);
  document.body.classList.add("printing-form");
  let cleaned = false;
  const done = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove("printing-form");
    if (mount) mount.innerHTML = "";
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.setTimeout(done, 60_000);
  requestAnimationFrame(() => {
    window.print();
  });
}
