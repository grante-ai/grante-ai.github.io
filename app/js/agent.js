/* Home screen and the Grante agent (the part that does things with your files). */
import { api, FILES, WEB } from "./api.js";
import { foldersCard, permissionStrip } from "./folders-ui.js";
import { USES } from "./content.js";
import { app } from "./state.js";
import { formatDate, h, icon, markdown, thinking } from "./ui.js";

export const KIND_TAGS = {
  move_file: "Moved", rename_file: "Renamed", create_folder: "New folder",
  delete_file: "Deleted", sort_files: "Sorted", open_app: "Opened app",
};

export function activityCard(item) {
  return h("div", { class: "card activity-item" },
    h("div", { class: "activity-top" },
      h("span", { class: "date" }, formatDate(item.time)),
      KIND_TAGS[item.kind] ? h("span", { class: "tag" }, KIND_TAGS[item.kind]) : null),
    h("div", { class: "text" }, item.text));
}

/* ---------- Home ---------- */

export async function renderHome(view) {
  if (WEB && !FILES.supported) return renderWebHome(view);
  const input = h("input", { type: "text", autocomplete: "off", "aria-label": "Tell Grante what to do",
    placeholder: "Move report.pdf from Downloads to Documents…" });
  const greeting = h("h1", {}, `Hey, ${app.user.display_name.split(" ")[0]}!`);
  const list = h("div", { class: "activity-list" }, h("div", { class: "card activity-item muted" }, "Loading…"));
  const form = h("form", { class: "composer big" }, input, h("button", { class: "btn", type: "submit" }, "Go"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    app.pendingAgentMessage = text;
    location.hash = "#/agent";
  });
  const chip = (label, fill) => h("button", { class: "chip", type: "button", onclick: () => { input.value = fill; input.focus(); } }, label);
  view.replaceChildren(h("div", { class: "home" },
    h("div", { class: "home-main" },
    h("div", { class: "card hero" },
      greeting,
      h("p", { class: "subtitle" }, "What should we do?"),
      form,
      h("div", { class: "chips" },
        chip("What's in Downloads?", "What files are in my Downloads?"),
        chip("Sort my Downloads", "Sort my Downloads"),
        chip("New folder", "Create a folder on my Desktop called Projects")),
      h("p", { class: "hero-note" }, icon("shield"), "Grante asks before deleting anything. ", h("a", { href: "#/safety", class: "link" }, "How Grante keeps you safe"))),
      usesGrid((text) => { input.value = text; input.focus(); input.scrollIntoView({ block: "center", behavior: "smooth" }); })),
    h("aside", { class: "activity" },
      h("div", { class: "card label-card" }, h("span", {}, "Recent activity"), h("a", { href: "#/archive", class: "link small" }, "See all")),
      list)));
  try {
    const data = await api("/home");
    greeting.textContent = data.greeting;
    list.replaceChildren(...(data.recent_activity.length ? data.recent_activity.map(activityCard)
      : [h("div", { class: "card activity-item muted" }, "Nothing yet. Ask Grante to do something!")]));
  } catch (e) {
    list.replaceChildren(h("div", { class: "card activity-item error" }, e.message));
  }
}

/* Home on the website: the ask box goes to Ask Grante AI, because a website can't touch your files. */
function renderWebHome(view) {
  const input = h("input", { type: "text", autocomplete: "off", "aria-label": "Ask Grante anything", placeholder: "Ask Grante anything\u2026" });
  const form = h("form", { class: "composer big" }, input, h("button", { class: "btn", type: "submit" }, "Ask"));
  const ask = (text) => { app.pendingChatMessage = text; app.chatId = null; location.hash = "#/chat"; };
  form.addEventListener("submit", (e) => { e.preventDefault(); const text = input.value.trim(); if (text) ask(text); });
  const chip = (label, fill) => h("button", { class: "chip", type: "button", onclick: () => { input.value = fill; input.focus(); } }, label);
  view.replaceChildren(h("div", { class: "home" },
    h("div", { class: "home-main" },
      h("div", { class: "card hero" },
        h("h1", {}, `Hey, ${app.user.display_name.split(" ")[0]}!`),
        h("p", { class: "subtitle" }, "What do you want to know?"),
        form,
        h("div", { class: "chips" },
          chip("Explain something", "Explain how AI agents work, simply"),
          chip("Brainstorm", "Give me 5 ideas for a school project"),
          chip("Make a plan", "Help me make a study plan for a test on Friday")),
        h("p", { class: "hero-note" }, icon("sparkle"), "Replies can take up to a minute. Grante can be wrong, so check important facts.")),
      usesGrid(() => {})),
    h("aside", { class: "activity" },
      h("div", { class: "card label-card" }, h("span", {}, "Grante on the web")),
      h("div", { class: "card activity-item" }, h("div", { class: "date" }, "What works here"),
        h("div", { class: "text" }, "Ask Grante AI and the forum, in any browser.")),
      h("div", { class: "card activity-item" }, h("div", { class: "date" }, "File tools"),
        h("div", { class: "text" }, "Sorting, moving, and finding your files works in Chrome or Edge on a computer. Open Grante there to use them.")))));
  input.focus();
}

/* ---------- Agent ---------- */

let thread = null;   // kept between visits so the conversation stays

function bubble(who, content, extraClass = "") {
  const node = h("div", { class: `card msg ${who} ${extraClass}` },
    h("div", { class: "who" }, who === "user" ? "You" : "Grante"),
    typeof content === "string" ? (who === "user" ? h("div", { class: "prose" }, content) : markdown(content)) : content);
  thread.append(node);
  node.scrollIntoView({ block: "end", behavior: "smooth" });
  return node;
}

/* The folder preview: one blurred line; click to see the whole thing */
function folderPreview(tree) {
  const lines = tree.split("\n");
  const head = lines[0];
  const count = lines.slice(1).filter((l) => !l.includes("(empty)")).length;
  const full = h("pre", { class: "tree" }, tree);
  const button = h("button", { class: "tree-peek", type: "button", "aria-expanded": "false" },
    icon("folder"),
    h("span", { class: "tree-line" }, lines.slice(0, 4).map((l) => l.replace(/[├└│─]/g, "").trim()).join("   ")),
    h("span", { class: "tree-label" }, `Show ${head} (${count} item${count === 1 ? "" : "s"})`),
    icon("chevron", "chev"));
  const box = h("div", { class: "tree-box" }, button, full);
  button.addEventListener("click", () => {
    const open = box.classList.toggle("open");
    button.setAttribute("aria-expanded", String(open));
    button.querySelector(".tree-label").textContent = open ? "Hide folder" : `Show ${head} (${count} item${count === 1 ? "" : "s"})`;
  });
  return box;
}

function resultBubble(r, shown, showTree) {
  const actions = r.actions.slice(shown);
  if (!actions.length && !r.reply && !(showTree && r.tree)) return;
  const body = h("div", {});
  if (r.reply) body.append(markdown(r.reply));
  if (actions.length) body.append(h("div", { class: "actions" }, ...actions.map((a) =>
    h("div", { class: `action ${a.success ? "ok" : "no"}` }, h("span", { class: "dot-icon" }, icon(a.success ? "check" : "x")), h("span", {}, a.result)))));
  if (showTree && r.tree) body.append(folderPreview(r.tree));
  bubble("grante", body);
}

function askApproval(approval) {
  return new Promise((resolve) => {
    const yes = h("button", { class: "btn" }, "Allow");
    const no = h("button", { class: "btn btn-ghost" }, "Decline");
    const buttons = h("div", { class: "buttons" }, yes, no);
    bubble("grante", h("div", {},
      h("div", { class: "approval-head" }, icon("shield"), "Grante needs your OK"),
      h("p", { class: "approval-q" }, `${approval.description}?`),
      buttons), "approval");
    const done = (answer) => { buttons.replaceWith(h("p", { class: "muted small" }, answer ? "You allowed this." : "You declined this.")); resolve(answer); };
    yes.addEventListener("click", () => done(true));
    no.addEventListener("click", () => done(false));
    yes.focus();
  });
}

/* "Which one did you mean?" Two buttons (or more), each with an icon, the name, where it is, and what's inside. */
function askChoice(choice) {
  return new Promise((resolve) => {
    const options = h("div", { class: "choices" }, ...choice.options.map((o, i) => {
      const inside = o.is_folder
        ? (o.count ? `${o.contents.join(", ")}${o.count > o.contents.length ? `, +${o.count - o.contents.length} more` : ""}` : "Empty folder")
        : (o.detail || "File");
      const btn = h("button", { class: "choice", type: "button" },
        h("span", { class: "choice-icon" }, icon(o.is_folder ? "folder" : "file")),
        h("span", { class: "choice-text" },
          h("span", { class: "choice-name" }, o.name),
          h("span", { class: "choice-where" }, `in ${o.location}`),
          h("span", { class: "choice-inside" }, o.is_folder && o.count ? `${o.count} item${o.count === 1 ? "" : "s"}: ${inside}` : inside)));
      btn.addEventListener("click", () => done(i, `You picked ${o.name} in ${o.location}.`));
      return btn;
    }));
    const cancel = h("button", { class: "text-btn", type: "button" }, "Never mind");
    const box = h("div", {},
      h("div", { class: "approval-head" }, icon("help"), "Which one did you mean?"),
      h("p", { class: "approval-q" }, `There's more than one ${choice.kind === "folder" ? "folder" : "thing"} called \u201c${choice.name}\u201d.`),
      options, cancel);
    bubble("grante", box, "approval");
    const done = (index, label) => {
      options.replaceWith(h("p", { class: "muted small" }, label));
      cancel.remove();
      resolve(index);
    };
    cancel.addEventListener("click", () => done(-1, "You cancelled this."));
    options.querySelector("button")?.focus();
  });
}

async function send(text, form) {
  if (app.busy) return;
  thread.querySelector(".empty")?.remove();
  bubble("user", text);
  app.busy = true;
  form.classList.add("busy");
  let wait = bubble("grante", thinking());
  try {
    let r = await api("/agent", { method: "POST", body: { message: text, session_id: app.agentSession } });
    app.agentSession = r.session_id;
    let shown = 0, changed = false;
    while (r.status === "needs_approval" || r.status === "needs_choice") {
      wait.remove();
      changed ||= r.actions.some((a) => a.success);
      resultBubble({ ...r, reply: null }, shown, false);
      shown = r.actions.length;
      if (r.status === "needs_choice") {
        const index = await askChoice(r.choice);
        wait = bubble("grante", thinking());
        r = await api(`/agent/${app.agentSession}/choice`, { method: "POST", body: { index } });
      } else {
        const approve = app.settings.ask_before.includes(r.approval.tool) ? await askApproval(r.approval) : true;
        wait = bubble("grante", thinking());
        r = await api(`/agent/${app.agentSession}/decision`, { method: "POST", body: { approve } });
      }
    }
    wait.remove();
    changed ||= r.actions.some((a) => a.success);
    resultBubble(r, shown, changed);
    if (r.error) bubble("grante", r.error);
  } catch (e) {
    wait.remove();
    bubble("grante", h("p", { class: "error" }, e.message));
  } finally {
    app.busy = false;
    form.classList.remove("busy");
    form.querySelector("input").focus();
  }
}

function welcomeCard() {
  // Clicking an example types it into the box below, so you can change it before sending
  const fill = (text) => { const box = document.querySelector(".composer input"); if (box) { box.value = text; box.focus(); } };
  return h("div", { class: "card empty" },
    h("div", { class: "empty-icon" }, icon("sparkle")),
    h("h3", {}, "What should Grante do?"),
    h("p", { class: "muted" }, "Type what you want in plain words, or start with one of these:"),
    h("div", { class: "chips" }, ...USES.filter((u) => u.go === "agent").map((u) =>
      h("button", { class: "chip", type: "button", title: u.text, onclick: () => fill(u.try) }, u.try))));
}

/* "Things you can ask Grante": a box of ideas. File jobs get typed into the ask box; the rest are links. */
export function usesGrid(onPick) {
  const card = (u) => {
    const inside = [h("span", { class: "use-icon" }, icon(u.icon)),
      h("span", { class: "use-words" }, h("strong", {}, u.title), h("span", { class: "use-text" }, u.text),
        h("span", { class: "use-try" }, u.go === "agent" ? `Try: \u201c${u.try}\u201d` : u.try, icon("chevron")))];
    if (WEB && u.go === "agent" && (!FILES.supported || u.try.startsWith("Open "))) {   // shown, but marked as not available here
      inside[1].lastChild.replaceChildren(u.try.startsWith("Open ") ? "In the Mac app" : "Needs Chrome or Edge on a computer");
      return h("div", { class: "use off" }, ...inside);
    }
    return u.go === "agent"
      ? h("button", { class: "use", type: "button", onclick: () => onPick(u.try) }, ...inside)
      : h("a", { class: "use", href: `#/${u.go}` }, ...inside);
  };
  return h("section", { class: "card uses" },
    h("h2", {}, "Things you can ask Grante"),
    h("p", { class: "muted small" }, WEB && !FILES.supported ? "Chat and the forum work here. File jobs need Chrome or Edge on a computer."
      : "Click one to try it. File jobs are typed into the box above so you can change them first."),
    h("div", { class: "use-grid" }, ...USES.map(card)));
}

export function renderAgent(view) {
  if (WEB && !FILES.supported) {
    return view.replaceChildren(h("div", { class: "narrow" }, h("div", { class: "card empty" },
      h("div", { class: "empty-icon" }, icon("folder")),
      h("h3", {}, "File tools need Chrome or Edge on a computer"),
      h("p", { class: "muted" }, "This browser doesn't let websites work with your folders. Open Grante in Chrome or Edge on a Windows, Mac, Linux, or Chromebook computer to sort and move your files. Chat and the forum work here."),
      h("div", { class: "chips" }, h("a", { class: "btn", href: "#/chat" }, "Ask Grante AI"), h("a", { class: "btn btn-ghost", href: "#/forum" }, "Open the forum")))));
  }
  if (WEB && !FILES.folders().length) {   // first time: choose folders before anything else
    return FILES.whenReady().then(() => {
      if (FILES.folders().length) return renderAgent(view);
      view.replaceChildren(h("div", { class: "narrow" },
        h("div", { class: "card page-head" }, h("div", {}, h("h2", {}, "Let's set up your folders"),
          h("p", { class: "muted" }, "Pick the folders Grante can work in. It takes about 30 seconds, and you can change it any time in Account Settings."))),
        foldersCard({ title: "Choose folders", onChange: () => { if (FILES.folders().length) setReady(); } }),
        h("div", { class: "card row-between", id: "folders-done", hidden: true },
          h("span", {}, "All set? You can add more later."),
          h("button", { class: "btn", type: "button", onclick: () => renderAgent(view) }, "Start using Grante"))));
      const setReady = () => { view.querySelector("#folders-done").hidden = false; };
    });
  }
  if (!thread) thread = h("div", { class: "thread" }, welcomeCard());
  const input = h("input", { type: "text", autocomplete: "off", placeholder: "Tell Grante what to do…", "aria-label": "Tell Grante what to do" });
  const form = h("form", { class: "card composer" }, input, h("button", { class: "btn", type: "submit" }, "Send"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    if (WEB) await FILES.askPermission();   // the browser only asks after a click, so ask now if needed
    send(text, form);
  });
  const reset = () => { app.agentSession = null; thread = h("div", { class: "thread" }, welcomeCard()); renderAgent(view); };
  view.replaceChildren(h("div", { class: "chat-layout single" },
    h("div", { class: "card page-head" },
      h("div", {}, h("h2", {}, "Grante Agent"), h("p", { class: "muted" }, "Moves, renames, sorts, and organizes your files.")),
      h("button", { class: "btn btn-ghost", onclick: reset }, icon("plus"), "New task")),
    WEB ? permissionStrip() : null,
    thread,
    h("div", { class: "composer-wrap" }, form,
      h("p", { class: "fine-print" }, WEB ? `Grante works in: ${FILES.folders().map((f) => f.name).join(", ")}. Deleted files go to a "Grante Trash" folder. Replies can take a minute.`
        : "Grante can make mistakes. Deleted files go to your Trash."))));
  if (app.pendingAgentMessage) {
    const text = app.pendingAgentMessage;
    app.pendingAgentMessage = null;
    send(text, form);
  } else {
    input.focus();
  }
}

export function resetAgent() { thread = null; }
