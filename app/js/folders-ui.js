/* Website only: choosing which folders Grante can use, and what it must stay out of.
   (The desktop app doesn't need this: it works in your home folder directly.) */
import { FILES } from "./api.js";
import { h, icon, toast } from "./ui.js";

const QUICK = [["downloads", "Downloads"], ["desktop", "Desktop"], ["documents", "Documents"]];

/* The buttons for adding folders, plus the list of folders already added. onChange runs after any change. */
export function foldersCard({ title = "Folders Grante can use", intro, onChange, compact = false } = {}) {
  const list = h("div", { class: "folder-list" });
  const quick = h("div", { class: "folder-quick" });
  const card = h("div", { class: "card form-stack folders-card" },
    h("h3", {}, title),
    h("p", { class: "muted" }, intro || "Grante can only see and change files inside the folders you add here. Your browser will ask you to click Allow for each one."),
    quick, list,
    compact ? null : h("p", { class: "muted small" }, "Some folders, like your whole home folder or system folders, can't be added: your browser keeps them off-limits to all websites."));

  async function add(startIn) {
    try {
      const r = await FILES.addFolder(startIn);
      if (r) toast(r.already ? `${r.name} was already added` : `Grante can now use ${r.name}`);
      draw(); onChange?.();
    } catch (e) { toast(e.message, "bad"); }
  }
  function draw() {
    const have = FILES.folders();
    quick.replaceChildren(
      ...QUICK.filter(([, name]) => !have.some((f) => f.name.toLowerCase() === name.toLowerCase()))
        .map(([key, name]) => h("button", { class: "btn btn-ghost", type: "button", onclick: () => add(key) }, icon("plus"), `Add ${name}`)),
      h("button", { class: "btn btn-ghost", type: "button", onclick: () => add() }, icon("folder"), "Add another folder"));
    list.replaceChildren(...(have.length ? have.map((f) => h("div", { class: "folder-row" },
      h("span", { class: "folder-name" }, icon("folder"), f.name),
      h("button", { class: "text-btn", type: "button", onclick: async () => { await FILES.removeFolder(f.id); toast(`Removed ${f.name}`); draw(); onChange?.(); } }, "Remove")))
      : [h("p", { class: "muted small" }, "No folders yet.")]));
  }
  FILES.whenReady().then(draw);
  return card;
}

/* The "Keep Grante out" list. */
export function keepOutCard() {
  const input = h("input", { type: "text", list: "keepout-options", placeholder: "Start typing a folder, like Documents/Private", autocomplete: "off" });
  const options = h("datalist", { id: "keepout-options" });
  const list = h("div", { class: "folder-list" });
  const add = h("button", { class: "btn", type: "button" }, "Keep out");
  function draw() {
    const items = FILES.keepOutList();
    list.replaceChildren(...(items.length ? items.map((p) => h("div", { class: "folder-row" },
      h("span", { class: "folder-name" }, icon("lock"), p),
      h("button", { class: "text-btn", type: "button", onclick: () => { FILES.removeKeepOut(p); draw(); } }, "Allow again")))
      : [h("p", { class: "muted small" }, "Nothing on the list. Grante can use everything inside your folders.")]));
  }
  add.addEventListener("click", () => {
    try { FILES.addKeepOut(input.value); input.value = ""; draw(); toast("Grante will stay out of that"); }
    catch (e) { toast(e.message, "bad"); }
  });
  FILES.whenReady().then(async () => {
    draw();
    try { options.replaceChildren(...(await FILES.folderSuggestions()).map((p) => h("option", { value: p }))); } catch { /* suggestions are optional */ }
  });
  return h("div", { class: "card form-stack" },
    h("h3", {}, "Keep Grante out"),
    h("p", { class: "muted" }, "Anything on this list is invisible to Grante, and it won't move, rename, sort, or delete it. Good for private or important folders."),
    h("div", { class: "keepout-add" }, input, add), options, list);
}

/* A strip shown when the browser needs the person's OK again (usually on a later visit). */
export function permissionStrip(onAllowed) {
  const strip = h("div", { class: "card perm-strip", hidden: true },
    h("span", {}, icon("lock"), " Your browser needs your OK to use your folders again."),
    h("button", { class: "btn btn-small", type: "button", onclick: async () => {
      if (await FILES.askPermission()) { strip.hidden = true; onAllowed?.(); } else toast("Grante still can't use some folders. Click Allow when your browser asks.", "bad");
    } }, "Allow"));
  FILES.whenReady().then(async () => { strip.hidden = !(await FILES.needsPermission()).length; });
  return strip;
}
