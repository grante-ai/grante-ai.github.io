/* Website only, on Macs: setting up Grante Helper so Grante can reach all your folders.
   One card that walks through it in tiny steps:
     1. Copy one line, open Terminal, paste.  (done once, ever)
     2. A few quick questions: which folders, ask before deleting, anything private.
     3. Say yes to the Mac's "Allow access?" popups.
   Every step fades in, and nothing needs more than a glance to understand. */
import { api, FILES } from "./api.js";
import { app } from "./state.js";
import { h, icon, toast } from "./ui.js";

const laterKey = () => `grante.unlock.later.${app.user?.username}`;
const key = (...k) => h("kbd", {}, ...k);

function copyLine(line, label = "Copy") {
  const btn = h("button", { class: "btn btn-small", type: "button" }, icon("copy"), label);
  btn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(line); } catch { toast("Couldn't copy. Select the line and press ⌘ C.", "bad"); return; }
    btn.replaceChildren(icon("check"), "Copied!");
    btn.classList.add("copied");
    setTimeout(() => { btn.replaceChildren(icon("copy"), label); btn.classList.remove("copied"); }, 2500);
  });
  return h("div", { class: "code-line" }, h("code", {}, line), btn);
}

/* Swap the card's insides with a soft fade. */
function show(card, ...children) {
  card.classList.remove("step-in");
  void card.offsetWidth;   // restart the animation
  card.replaceChildren(...children.filter(Boolean));
  card.classList.add("step-in");
}

const progress = (n, of) => h("div", { class: "q-progress", "aria-label": `Question ${n} of ${of}` },
  ...Array.from({ length: of }, (_, i) => h("span", { class: i < n ? "on" : "" })));

/* The card on the Grante Agent page. onFolder: show the simpler "Grante folder" card instead. */
export function helperCard({ onFolder, onReady } = {}) {
  const card = h("div", { class: "card home-card helper-card", hidden: true });
  let polling = null;
  const stopPolling = () => { clearInterval(polling); polling = null; };
  const finish = () => {
    stopPolling();
    card.classList.add("leaving");
    setTimeout(() => card.remove(), 350);
  };

  // ---- Step 0: install (only if the helper isn't there yet) ----
  function install() {
    show(card,
      h("h3", {}, "🔓 Let Grante into all your folders"),
      h("p", {}, "30 seconds, and you only ever do it once."),
      h("ol", { class: "unlock-steps" },
        h("li", {}, h("span", { class: "step-dot" }, "1"), h("div", {}, "Copy this:", copyLine(FILES.INSTALL_LINE))),
        h("li", {}, h("span", { class: "step-dot" }, "2"), h("div", {}, "Open Terminal: press ", key("⌘"), " + ", key("Space"), ", type ", h("strong", {}, "Terminal"), ", press ", key("Return"), ".")),
        h("li", {}, h("span", { class: "step-dot" }, "3"), h("div", {}, "Paste with ", key("⌘"), " + ", key("V"), " and press ", key("Return"), "."))),
      h("div", { class: "waiting" }, h("span", { class: "pulse" }), "Waiting for Grante Helper… this card moves on by itself."),
      h("p", { class: "home-tip" }, "If Chrome asks to let Grante “access other apps and services on this device”, click ", h("strong", {}, "Allow"), "."),
      h("div", { class: "home-actions" },
        h("button", { class: "text-btn", type: "button", onclick: () => {
          stopPolling();
          try { localStorage.setItem(laterKey(), "1"); } catch { /* fine */ }
          card.remove(); onFolder?.();
        } }, "Not now, just use one folder")));
    stopPolling();
    polling = setInterval(async () => { if (!document.body.contains(card)) return stopPolling(); if (await FILES.findHelper()) { stopPolling(); connect(); } }, 2000);
  }

  // ---- Connect, then the questions ----
  async function connect() {
    try {
      await FILES.pairHelper();
      const list = await FILES.helperFolders();
      askFolders(list.map((f) => f.name), list.filter((f) => f.guarded).map((f) => f.name));
    } catch (e) { toast(e.message, "bad"); install(); }
  }

  const answers = { folders: "all", ask: true, keepOut: [] };

  function askFolders(names, guarded) {
    const pickBox = h("div", { class: "pick-grid", hidden: true },
      ...names.map((n) => h("label", { class: "pick" }, h("input", { type: "checkbox", value: n, checked: true }), icon("folder"), n)));
    const next = h("button", { class: "btn", type: "button", hidden: true }, "Next");
    show(card,
      progress(1, 3),
      h("h3", {}, "Which folders should Grante use?"),
      h("div", { class: "q-options" },
        h("button", { class: "q-option best", type: "button", onclick: () => { answers.folders = "all"; askDelete(names, guarded); } },
          h("strong", {}, "✨ All my folders"), h("span", {}, "Desktop, Documents, Downloads, and the rest. Never system files.")),
        h("button", { class: "q-option", type: "button", onclick: () => { pickBox.hidden = false; next.hidden = false; } },
          h("strong", {}, "Let me pick"), h("span", {}, "Choose exactly which ones."))),
      pickBox, h("div", { class: "home-actions" }, next));
    next.addEventListener("click", () => {
      const chosen = [...pickBox.querySelectorAll("input:checked")].map((i) => i.value);
      if (!chosen.length) return toast("Pick at least one folder.", "bad");
      answers.folders = chosen;
      askDelete(names, guarded);
    });
  }

  function askDelete(names, guarded) {
    const pick = (yes) => { answers.ask = yes; askPrivate(names, guarded); };
    show(card,
      progress(2, 3),
      h("h3", {}, "Should Grante ask before deleting things?"),
      h("div", { class: "q-options" },
        h("button", { class: "q-option best", type: "button", onclick: () => pick(true) },
          h("strong", {}, "🛡️ Yes, always ask"), h("span", {}, "You click OK first. Recommended.")),
        h("button", { class: "q-option", type: "button", onclick: () => pick(false) },
          h("strong", {}, "No, just do it"), h("span", {}, "Deleted things still go to a “Grante Trash” folder."))));
  }

  function askPrivate(names, guarded) {
    const chosen = answers.folders === "all" ? names : answers.folders;
    const input = h("input", { type: "text", list: "private-options", placeholder: "Like Documents/Private", autocomplete: "off" });
    const options = h("datalist", { id: "private-options" });
    const chips = h("div", { class: "chips" });
    const draw = () => chips.replaceChildren(...answers.keepOut.map((p) => h("span", { class: "chip" }, icon("lock"), p)));
    const add = () => {
      const v = input.value.trim().replace(/^\/|\/$/g, "");
      if (!v) return;
      if (!chosen.some((n) => v.toLowerCase() === n.toLowerCase() || v.toLowerCase().startsWith(n.toLowerCase() + "/"))) return toast("Pick something inside one of your folders.", "bad");
      if (!answers.keepOut.includes(v)) answers.keepOut.push(v);
      input.value = ""; draw();
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
    FILES.helperSuggestions(chosen.filter((n) => !guarded.includes(n))).then((list) => options.replaceChildren(...list.map((p) => h("option", { value: p })))).catch(() => {});
    show(card,
      progress(3, 3),
      h("h3", {}, "Anything private Grante should stay out of?"),
      h("p", { class: "home-tip" }, "Grante won't see or touch these. You can change it any time in Account Settings."),
      h("div", { class: "keepout-add" }, input, h("button", { class: "btn btn-ghost", type: "button", onclick: add }, "Add")), options, chips,
      h("div", { class: "home-actions" },
        h("button", { class: "btn", type: "button", onclick: () => save(guarded) }, "Done"),
        h("button", { class: "text-btn", type: "button", onclick: () => { answers.keepOut = []; save(guarded); } }, "Nothing, skip")));
  }

  async function save(guarded) {
    FILES.saveHelperSettings({ ...FILES.helperSettings(), folders: answers.folders, setup: true });
    await FILES.refresh();
    for (const p of answers.keepOut) { try { FILES.addKeepOut(p); } catch { /* not inside a folder: skip */ } }
    const ask = answers.ask ? [...new Set([...(app.settings?.ask_before || []), "delete_file"])] : (app.settings?.ask_before || []).filter((t) => t !== "delete_file");
    try { app.settings = await api("/settings", { method: "POST", body: { ask_before: ask } }); } catch { /* keep going */ }
    const needAllow = guarded.filter((n) => answers.folders === "all" || answers.folders.includes(n));
    if (needAllow.length) allowMac(needAllow); else done();
  }

  // ---- The Mac's own "Allow access?" popups ----
  function allowMac(names, result = null) {
    const go = h("button", { class: "btn", type: "button" }, result ? "Try again" : "Ask my Mac");
    const rows = h("ul", { class: "allow-list" }, ...names.map((n) => {
      const r = result?.[n];
      return h("li", { class: r === "ok" ? "ok" : r ? "no" : "" }, h("span", { class: "dot-icon" }, icon(r === "ok" ? "check" : r ? "x" : "folder")), n);
    }));
    const blocked = result && names.some((n) => result[n] && result[n] !== "ok");
    show(card,
      h("h3", {}, "🍎 Last step: tell your Mac it's OK"),
      h("p", {}, "Your Mac will pop up a few times. Click ", h("strong", {}, "Allow"), " each time."),
      rows,
      blocked ? h("p", { class: "home-tip" }, "Clicked Don't Allow by accident? Open ", h("strong", {}, "System Settings → Privacy & Security → Files & Folders → grante-helper"),
        " and switch those folders on. Then press Try again.") : null,
      h("div", { class: "home-actions" }, go, result ? h("button", { class: "text-btn", type: "button", onclick: done }, "Skip for now") : null));
    go.addEventListener("click", async () => {
      go.disabled = true; go.textContent = "Waiting for your clicks…";
      let res = {};
      try { res = await FILES.helperAccess(names); } catch (e) { toast(e.message, "bad"); }
      if (names.every((n) => res[n] === "ok")) done(); else allowMac(names, res);
    });
  }

  function done() {
    card.classList.add("celebrate");
    show(card,
      h("h3", {}, "🎉 All set! Grante can reach your folders."),
      h("p", {}, "Try: ", h("em", {}, "“Sort my Downloads”"), " or ", h("em", {}, "“Find my resume”"), "."),
      h("div", { class: "home-actions" }, h("button", { class: "btn", type: "button", onclick: () => { finish(); onReady?.(); } }, "Let's go")));
  }

  // ---- Which step to start on ----
  FILES.whenReady().then(async () => {
    const status = FILES.helperStatus();
    if (status.active) return card.remove();                 // all set up and running
    let later = false;
    try { later = localStorage.getItem(laterKey()) === "1"; } catch { /* show it */ }
    const found = await FILES.findHelper();
    if (status.setUp && !found) {                             // set up before, but not running right now
      card.hidden = false;
      show(card,
        h("h3", {}, "😴 Grante Helper is napping"),
        h("p", {}, "It usually starts by itself. Restart your Mac, or paste the install line in Terminal again:"),
        copyLine(FILES.INSTALL_LINE),
        h("div", { class: "home-actions" }, h("button", { class: "text-btn", type: "button", onclick: finish }, "Hide")));
      return;
    }
    if (later && !found) { card.remove(); onFolder?.(); return; }
    card.hidden = false;
    if (found) connect(); else install();
  });
  return card;
}

/* Account Settings: what the helper is doing, and how to change or remove it. */
export function helperSettingsCard(onChange) {
  const card = h("div", { class: "card form-stack" }, h("h3", {}, "Grante Helper"), h("p", { class: "muted" }, "Checking…"));
  async function draw() {
    await FILES.whenReady();
    const status = FILES.helperStatus(), found = await FILES.findHelper();
    const set = FILES.helperSettings();
    const which = set.folders === "all" ? "All your folders" : Array.isArray(set.folders) ? set.folders.join(", ") : "";
    const restart = h("button", { class: "btn btn-ghost", type: "button", onclick: async () => {
      FILES.saveHelperSettings({ ...set, setup: false });
      try { localStorage.removeItem(laterKey()); } catch { /* fine */ }
      await FILES.refresh(); location.hash = "#/setup";   // the full-screen setup again
    } }, status.setUp ? "Change folders" : "Set it up");
    card.replaceChildren(
      h("h3", {}, "Grante Helper"),
      h("p", { class: "muted" }, "A tiny Mac program that lets Grante reach all your folders, which Chrome won't let a website do on its own."),
      h("p", {}, status.active ? ["✅ Connected. Grante can use: ", h("strong", {}, which), "."]
        : found ? "Installed, but not connected to this account yet." : status.setUp ? "😴 Not running right now. Restart your Mac to wake it up." : "Not installed."),
      h("div", { class: "home-actions" }, restart,
        status.setUp ? h("button", { class: "text-btn", type: "button", onclick: async () => { await FILES.forgetHelper(); toast("Disconnected from Grante Helper"); draw(); onChange?.(); } }, "Disconnect") : null),
      found || status.setUp ? h("details", { class: "small" }, h("summary", {}, "Remove it from this Mac"),
        h("p", { class: "muted" }, "Paste this in Terminal. Your files aren't touched."), copyLine(FILES.UNINSTALL_LINE)) : null);
  }
  draw();
  return card;
}

/* Should Grante show the full "let Grante into your folders" screen before the app?
   Yes the first time on a Mac in Chrome or Edge, until it's set up or the person chooses "Not now". */
const seenKey = () => `grante.setup.seen.${app.user?.username}`;
export async function needsSetupScreen() {
  if (!FILES?.supported || !FILES.onMac) return false;
  // Only in Grante's own window (the one Open Grante opens), and only the very first time.
  if (window.name !== "grante-app" && !matchMedia("(display-mode: standalone)").matches) return false;
  try { if (localStorage.getItem(seenKey()) === "1") return false; } catch { /* show it */ }
  await FILES.whenReady();
  if (FILES.helperStatus().active || FILES.helperSettings().setup) return false;
  try { if (localStorage.getItem(laterKey()) === "1") return false; } catch { /* show it */ }
  return true;
}

/* The full-screen version: nothing else on screen, so it can't be missed. */
export function renderSetupScreen(root, onDone) {
  try { localStorage.setItem(seenKey(), "1"); } catch { /* fine */ }   // from now on, it's in Account Settings
  const first = (app.user?.display_name || "").split(" ")[0] || "there";
  const card = helperCard({ onFolder: onDone, onReady: onDone });
  card.classList.add("setup-big");
  root.replaceChildren(h("main", { class: "setup-screen" },
    h("div", { class: "setup-inner" },
      h("div", { class: "setup-brand" }, h("span", { class: "setup-wave" }, "👋"), h("h1", {}, `Hey ${first}! One quick thing first.`)),
      h("p", { class: "setup-sub" }, "Grante sorts and finds your files. To do that, it needs a key to your folders."),
      card)));
}
