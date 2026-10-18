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
    h("p", { class: "muted" }, intro || "Grante can only see and change files inside these folders. It asks for a folder when it needs one, or you can add some here. Chrome won't let websites have all of Downloads, Desktop, or Documents, so pick a folder inside one of them."),
    quick, list,
    compact ? null : h("p", { class: "muted small" }, "If Chrome says a folder has system files, open it and pick a folder inside it instead."));

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
        .map(([key, name]) => h("button", { class: "btn btn-ghost", type: "button", onclick: () => add(key) }, icon("plus"), `Pick a folder in ${name}`)),
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

/* The one-time "Grante needs a home" card on the Grante Agent page (website only).
   Chrome on a Mac or Windows keeps websites out of Downloads itself, so Grante gets its own folder
   inside it, and "Downloads" then means that folder. On a Chromebook, Downloads itself is allowed. */
const CHROMEBOOK = /\bCrOS\b/.test(navigator.userAgent);
const dismissKey = (uid) => `grante.homecard.${uid}`;

export function homeCard(uid) {
  const card = h("div", { class: "card home-card", hidden: true });
  const close = () => {
    try { localStorage.setItem(dismissKey(uid), "1"); } catch { /* fine */ }
    card.classList.add("leaving");
    setTimeout(() => card.remove(), 350);
  };
  const tip = h("p", { class: "home-tip" }, "Bonus: in Chrome ", h("strong", {}, "Settings → Downloads"),
    ", pick that folder, and new downloads go straight to Grante. ✨");

  function ask() {
    const go = h("button", { class: "btn", type: "button" }, icon("folder"), CHROMEBOOK ? "Open Downloads" : "Make my Grante folder");
    card.replaceChildren(
      h("h3", {}, CHROMEBOOK ? "📁 Let Grante into Downloads" : "📁 Grante needs a home"),
      h("p", {}, CHROMEBOOK ? "One click, and Grante can tidy up your Downloads."
        : "Chrome keeps websites out of your Downloads (good, honestly). So Grante gets its own little folder in there instead."),
      h("div", { class: "home-actions" }, go, h("button", { class: "text-btn", type: "button", onclick: close }, "Skip for now")),
      h("p", { class: "home-steps" }, CHROMEBOOK
        ? [h("span", { class: "step-dot" }, "1"), " Click ", h("strong", {}, "Select"), " → ", h("strong", {}, "Allow"), ". That's it."]
        : [h("span", { class: "step-dot" }, "1"), " Click ", h("strong", {}, "New Folder"), " → name it ", h("strong", {}, "Grante"),
          " → ", h("strong", {}, "Select"), " → ", h("strong", {}, "Allow")]),
      CHROMEBOOK ? null : tip);
    go.addEventListener("click", async () => {
      try {
        const r = await FILES.addFolder("downloads");
        if (!r) return;   // they closed the window: try again any time
        FILES.setAlias("Downloads", r.name);
        done(r.name);
      } catch (e) { toast(e.message, "bad"); }
    });
  }

  function done(name) {
    const itself = name.toLowerCase() === "downloads";
    card.classList.add("celebrate");
    card.replaceChildren(
      h("h3", {}, "🎉 Grante moved in!"),
      h("p", {}, itself ? "Grante can now use your Downloads." : ["From now on, “Downloads” means your ", h("strong", {}, name), " folder."],
        " Try: ", h("em", {}, "“Sort my Downloads”"), "."),
      itself ? null : h("p", { class: "home-tip" }, "Want it in Finder's sidebar? Drag the ", h("strong", {}, name), " folder there once."),
      h("div", { class: "home-actions" }, h("button", { class: "btn", type: "button", onclick: close }, "Got it")));
  }

  FILES.whenReady().then(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(dismissKey(uid)) === "1"; } catch { /* show it */ }
    if (dismissed || FILES.aliasFor("Downloads") || FILES.folders().some((f) => f.name.toLowerCase() === "downloads")) return card.remove();
    ask();
    card.hidden = false;
  });
  return card;
}
