/* Ask Grante AI: a normal chat, like most AI chat websites. */
import { api, WEB } from "./api.js";
import { app } from "./state.js";
import { h, icon, markdown, modal, thinking, timeAgo, toast } from "./ui.js";

const SUGGESTIONS = [
  ["Explain something", "Explain how AI agents work, simply"],
  ["Brainstorm", "Give me 5 startup ideas using AI agents"],
  ["Plan", "Help me make a study plan for a test on Friday"],
  ["Write", "Write a short, friendly message inviting friends to a game night"],
];

let chats = [];
let search = "";
let menuListener = false;

/* Shows Grante's reply word by word as it arrives, each word softly fading in. The AI sends words
   in bursts; this lets them out at a steady pace (faster when it falls behind) so it reads smoothly. */
function typewriter(dots, onGrow) {
  let target = "", ended = false, used = 0, box = null, timer = null, done = null;
  const pieces = () => target.slice(used).match(/\s*\S+\s*/g) || [];
  const tick = () => {
    let ready = pieces();
    if (!ended && ready.length && !/\s$/.test(ready[ready.length - 1])) ready = ready.slice(0, -1);   // wait for the word to finish
    if (!ready.length) { timer = null; if (ended && done) { setTimeout(done, 450); done = null; } return; }   // let the last words finish fading
    if (!box) { box = h("div", { class: "prose typing" }); dots.replaceWith(box); }
    const n = Math.max(1, Math.ceil(ready.length / 6));
    for (const piece of ready.slice(0, n)) { box.append(h("span", { class: "word-in" }, piece)); used += piece.length; }
    onGrow();
    timer = setTimeout(tick, 45);
  };
  const kick = () => { if (!timer) timer = setTimeout(tick, 0); };
  return {
    update(text) { target = text.replace(/^\s+/, ""); kick(); },
    finish() { ended = true; return new Promise((resolve) => { done = resolve; kick(); }); },
    stop() { clearTimeout(timer); timer = null; },
  };
}

export async function renderChat(view) {
  const list = h("div", { class: "chat-list", role: "list" });
  const thread = h("div", { class: "thread" });
  const textarea = h("textarea", { rows: 1, placeholder: "Message Grante…", "aria-label": "Message Grante", maxlength: 8000 });
  const sendBtn = h("button", { class: "btn send-btn", type: "submit", "aria-label": "Send" }, icon("send"));
  const form = h("form", { class: "card composer chat-composer" }, textarea, sendBtn);
  const searchBox = h("input", { type: "search", placeholder: "Search chats", "aria-label": "Search chats", value: search });

  const grow = () => { textarea.style.height = "auto"; textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`; };
  textarea.addEventListener("input", grow);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  searchBox.addEventListener("input", () => { search = searchBox.value; drawList(); });

  function message(role, content) {
    const isUser = role === "user";
    const body = isUser ? h("div", { class: "prose" }, content) : markdown(content);
    const tools = isUser ? null : h("div", { class: "msg-tools" },
      h("button", { class: "icon-btn", title: "Copy", "aria-label": "Copy reply", onclick: async () => {
        try { await navigator.clipboard.writeText(content); toast("Copied"); } catch { toast("Couldn't copy"); }
      } }, icon("copy")));
    const node = h("div", { class: `card msg ${isUser ? "user" : "grante"}` }, h("div", { class: "who" }, isUser ? "You" : "Grante"), body, tools);
    thread.append(node);
    return node;
  }

  function empty() {
    thread.replaceChildren(h("div", { class: "chat-empty" },
      h("div", { class: "card empty" },
        h("div", { class: "empty-icon" }, icon("sparkle")),
        h("h3", {}, `How can I help, ${app.user.display_name.split(" ")[0]}?`),
        h("p", { class: "muted" }, "Ask me anything: ideas, explanations, plans, or just a chat.")),
      h("div", { class: "suggestions" }, ...SUGGESTIONS.map(([title, text]) =>
        h("button", { class: "card suggestion", onclick: () => { textarea.value = text; grow(); textarea.focus(); } },
          h("strong", {}, title), h("span", { class: "muted" }, text))))));
  }

  function drawList() {
    const q = search.trim().toLowerCase();
    const shown = chats.filter((c) => !q || c.title.toLowerCase().includes(q));
    if (!shown.length) return list.replaceChildren(h("p", { class: "muted small pad" }, q ? "No chats match." : "Your chats will show up here."));
    const today = new Date().toDateString();
    const groups = { Today: [], Earlier: [] };
    shown.forEach((c) => groups[new Date(c.updated).toDateString() === today ? "Today" : "Earlier"].push(c));
    list.replaceChildren(...Object.entries(groups).filter(([, items]) => items.length).flatMap(([name, items]) => [
      h("div", { class: "list-group" }, name),
      ...items.map((c) => chatRow(c)),
    ]));
  }

  function chatRow(c) {
    const menu = h("div", { class: "row-menu", hidden: true },
      h("button", { onclick: (e) => { e.stopPropagation(); rename(c); } }, "Rename"),
      h("button", { class: "danger", onclick: (e) => { e.stopPropagation(); remove(c); } }, "Delete"));
    const more = h("button", { class: "icon-btn more", "aria-label": `Options for ${c.title}`, onclick: (e) => {
      e.stopPropagation();
      document.querySelectorAll(".row-menu").forEach((m) => { if (m !== menu) m.hidden = true; });
      menu.hidden = !menu.hidden;
    } }, icon("more"));
    return h("div", { class: `chat-item ${c.id === app.chatId ? "active" : ""}`, role: "listitem" },
      h("button", { class: "chat-open", title: c.title, onclick: () => open(c.id) },
        h("span", { class: "chat-title" }, c.title), h("span", { class: "chat-time" }, timeAgo(c.updated))),
      more, menu);
  }

  async function loadList() {
    try { chats = await api("/chats?kind=chat"); } catch (e) { toast(e.message, "bad"); }
    drawList();
  }

  async function open(id) {
    try {
      const chat = await api(`/chats/${id}`);
      app.chatId = id;
      thread.replaceChildren();
      chat.messages.forEach((m) => message(m.role, m.content));
      thread.scrollTop = thread.scrollHeight;
      drawList();
    } catch (e) { toast(e.message, "bad"); }
  }

  async function rename(c) {
    const input = h("input", { type: "text", value: c.title, maxlength: 80 });
    await modal({ title: "Rename chat", body: input, confirm: "Save", onConfirm: async () => {
      const r = await api(`/chats/${c.id}`, { method: "PATCH", body: { title: input.value } });
      c.title = r.title; drawList();
    } });
  }

  async function remove(c) {
    const ok = await modal({ title: "Delete chat?", body: `“${c.title}” will be deleted for good.`, confirm: "Delete", danger: true,
      onConfirm: () => api(`/chats/${c.id}`, { method: "DELETE" }) });
    if (!ok) return;
    chats = chats.filter((x) => x.id !== c.id);
    if (app.chatId === c.id) { app.chatId = null; empty(); }
    drawList();
    toast("Chat deleted");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = textarea.value.trim();
    if (!text || app.busy) return;
    textarea.value = ""; grow();
    if (thread.querySelector(".chat-empty")) thread.replaceChildren();
    message("user", text);
    const dots = thinking();
    const wait = h("div", { class: "card msg grante" }, h("div", { class: "who" }, "Grante"), dots);
    thread.append(wait);
    thread.scrollTop = thread.scrollHeight;
    app.busy = true; sendBtn.disabled = true;
    const typing = typewriter(dots, () => {   // keep the newest words in view, unless you scrolled up to read
      if (thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120) thread.scrollTop = thread.scrollHeight;
    });
    try {
      const r = await api("/chat", { method: "POST", body: { message: text, chat_id: app.chatId, onText: typing.update } });
      await typing.finish();
      wait.remove();
      message("assistant", r.reply);
      if (r.chat_id !== app.chatId) { app.chatId = r.chat_id; loadList(); }
    } catch (err) {
      typing.stop();
      wait.remove();
      thread.append(h("div", { class: "card msg grante" }, h("div", { class: "who" }, "Grante"), h("p", { class: "error" }, err.message)));
    } finally {
      app.busy = false; sendBtn.disabled = false;
      thread.scrollTop = thread.scrollHeight;
      textarea.focus();
    }
  });

  const newChat = () => { app.chatId = null; empty(); drawList(); textarea.focus(); };
  if (!menuListener) {
    document.addEventListener("click", () => document.querySelectorAll(".row-menu").forEach((m) => (m.hidden = true)));
    menuListener = true;
  }

  view.replaceChildren(h("div", { class: "chat-layout" },
    h("div", { class: "card chats-panel" },
      h("button", { class: "btn btn-block", onclick: newChat }, icon("plus"), "New chat"),
      h("div", { class: "search" }, icon("search"), searchBox),
      list),
    h("div", { class: "chat-main" }, thread,
      h("div", { class: "composer-wrap" }, form,
        h("p", { class: "fine-print" }, WEB ? "Replies can take up to a minute. Grante can make mistakes, so check important info."
          : "Enter to send, Shift + Enter for a new line. Grante can make mistakes, so check important info.")))));

  if (app.chatId) open(app.chatId); else empty();
  loadList();
  textarea.focus();
  if (app.pendingChatMessage) {   // asked from the Home screen
    textarea.value = app.pendingChatMessage;
    app.pendingChatMessage = null;
    form.requestSubmit();
  }
}
