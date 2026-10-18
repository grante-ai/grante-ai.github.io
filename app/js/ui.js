/* Small building blocks used by every page. */

/* h("div", { class: "card", onclick: fn }, "text", child, ...) -> element */
export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === false || value === null || value === undefined) continue;
    if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;           // only ever used with our own trusted strings
    else if (key in node && typeof value !== "string") node[key] = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);

/* ---------- Icons (simple line icons) ---------- */

const ICONS = {
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5v.5"/>',
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  archive: '<path d="M3 4h18v4H3z"/><path d="M5 8v12h14V8"/><path d="M10 12h4"/>',
  forum: '<path d="M4 5h11v8H8l-4 3z"/><path d="M15 9h5v8l-3-2h-6v-2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><path d="M12 17h.01"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5"/><path d="M12 18h.01"/>',
  up: '<path d="M7 11v9H4v-9z"/><path d="M7 11l4-8c1.5 0 2.5 1 2.5 2.5V9h5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.3 20H7"/>',
  down: '<path d="M17 13V4h3v9z"/><path d="M17 13l-4 8c-1.5 0-2.5-1-2.5-2.5V15h-5a2 2 0 0 1-2-2.3l1.2-7A2 2 0 0 1 6.7 4H17"/>',
  reply: '<path d="M10 8L4 13l6 5"/><path d="M4 13h10a6 6 0 0 1 6 6"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  send: '<path d="M4 12l16-8-6 16-2-6z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  folder: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 16l-4-4 4-4"/><path d="M6 12h10"/>',
  pin: '<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-6-3.5-9s1-6.5 3.5-9z"/>',
  flagc: '<path d="M5 21V4"/><path d="M5 4c3-2 6 2 9 0s4-1 5 0v9c-1-1-2-2-5 0s-6-2-9 0"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
};

export function icon(name, cls = "") {
  const span = document.createElement("span");
  span.className = `icon ${cls}`.trim();
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[name] || ""}</svg>`;
  return span;
}

export function logo(size = 34) {
  const span = document.createElement("span");
  span.className = "logo";
  span.style.width = span.style.height = `${size}px`;
  span.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2l12 7v14l-12 7-12-7V9z" fill="currentColor"/><path d="M16 9l6 3.5v7L16 23l-6-3.5v-7z" fill="#fff"/></svg>';
  return span;
}

/* ---------- Text helpers ---------- */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* Grante's Markdown (## headers, **bold**, - bullets, ``` code) -> safe HTML */
export function renderMarkdown(text) {
  const inline = (s) => escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  let html = "", list = null, inCode = false, code = [];
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of String(text).replace(/\r/g, "").split("\n")) {
    const t = raw.trim();
    if (t.startsWith("```")) {
      if (inCode) { html += `<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`; code = []; inCode = false; }
      else { closeList(); inCode = true; }
      continue;
    }
    if (inCode) { code.push(raw); continue; }
    let m;
    if (!t) { closeList(); continue; }
    if ((m = t.match(/^(#{1,4})\s+(.*)$/))) { closeList(); const l = Math.min(m[1].length + 1, 4); html += `<h${l}>${inline(m[2])}</h${l}>`; }
    else if ((m = t.match(/^[-*•]\s+(.*)$/))) { if (list !== "ul") { closeList(); html += "<ul>"; list = "ul"; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = t.match(/^\d+[.)]\s+(.*)$/))) { if (list !== "ol") { closeList(); html += "<ol>"; list = "ol"; } html += `<li>${inline(m[1])}</li>`; }
    else { closeList(); html += `<p>${inline(t)}</p>`; }
  }
  if (inCode) html += `<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`;
  closeList();
  return html;
}

export function markdown(text) {
  const div = h("div", { class: "prose" });
  div.innerHTML = renderMarkdown(text);
  return div;
}

export function timeAgo(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "?";
}

/* ---------- Feedback ---------- */

export function toast(text, kind = "") {
  const t = h("div", { class: `toast ${kind}`, role: "status" }, text);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2800);
}

/* A pop-up box. Returns a promise with true (confirm) or false (cancel). */
export function modal({ title, body, confirm = "OK", cancel = "Cancel", danger = false, onConfirm }) {
  return new Promise((resolve) => {
    const error = h("p", { class: "form-error", hidden: true });
    const ok = h("button", { class: `btn ${danger ? "btn-danger" : ""}` }, confirm);
    const no = h("button", { class: "btn btn-ghost" }, cancel);
    const box = h("div", { class: "card modal", role: "dialog", "aria-modal": "true", "aria-label": title },
      h("h3", {}, title), body instanceof Node ? body : h("p", { class: "muted" }, body), error,
      h("div", { class: "modal-buttons" }, cancel ? no : null, ok));
    const shade = h("div", { class: "shade" }, box);
    const close = (value) => { shade.classList.remove("show"); setTimeout(() => shade.remove(), 200); resolve(value); };
    ok.addEventListener("click", async () => {
      if (!onConfirm) return close(true);
      ok.disabled = true;
      try { await onConfirm(); close(true); }
      catch (e) { error.textContent = e.message; error.hidden = false; ok.disabled = false; }
    });
    no.addEventListener("click", () => close(false));
    shade.addEventListener("click", (e) => { if (e.target === shade) close(false); });
    shade.addEventListener("keydown", (e) => { if (e.key === "Escape") close(false); });
    document.body.append(shade);
    requestAnimationFrame(() => shade.classList.add("show"));
    (box.querySelector("input") || ok).focus();
  });
}

export function thinking() {
  return h("div", { class: "thinking", "aria-label": "Grante is thinking" }, h("span"), h("span"), h("span"));
}

/* A password box with a show/hide button */
export function passwordInput(attrs = {}) {
  const input = h("input", { type: "password", autocomplete: "current-password", ...attrs });
  const toggle = h("button", { type: "button", class: "peek", "aria-label": "Show password" }, icon("eye"));
  toggle.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.replaceChildren(icon(show ? "eyeoff" : "eye"));
    toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });
  return { input, field: h("div", { class: "pw-field" }, input, toggle) };
}

/* The same password rules the server uses (auth.py), so people see them as they type */
const SPECIAL = "!@#$%^&*()_+-=[]{};':\"\\|,.<>/?`~";
export function passwordChecks(p, username = "", email = "") {
  return [
    { label: "At least 10 characters", ok: p.length >= 10 && p.length <= 128 },
    { label: "An uppercase letter (A-Z)", ok: /[A-Z]/.test(p) },
    { label: "A lowercase letter (a-z)", ok: /[a-z]/.test(p) },
    { label: "A number (0-9)", ok: /\d/.test(p) },
    { label: "A special character (! @ # $ …)", ok: [...p].some((c) => SPECIAL.includes(c)) },
  ];
}

export function passwordMeter(input, getContext = () => ({})) {
  const bar = h("div", { class: "meter-fill" });
  const word = h("span", { class: "meter-word" }, "");
  const list = h("ul", { class: "checklist" });
  const update = () => {
    const { username = "", email = "" } = getContext();
    const checks = passwordChecks(input.value, username, email);
    const passed = checks.filter((c) => c.ok).length;
    const bonus = input.value.length >= 14 ? 1 : 0;
    const score = input.value ? Math.min(passed + bonus, 6) : 0;
    const levels = ["", "Very weak", "Very weak", "Weak", "Okay", "Strong", "Very strong"];
    bar.style.width = `${(score / 6) * 100}%`;
    bar.dataset.level = score >= 5 ? "strong" : score >= 4 ? "ok" : "weak";
    word.textContent = levels[score];
    list.replaceChildren(...checks.map((c) => h("li", { class: c.ok ? "ok" : "" }, icon(c.ok ? "check" : "x"), c.label)));
    return checks.every((c) => c.ok);
  };
  input.addEventListener("input", update);
  update();
  return { node: h("div", { class: "pw-help" }, h("div", { class: "meter" }, bar), word, list), isValid: update };
}

/* Makes the words in an element fade in one after another, like Grante is saying them. */
export function fadeInWords(el, { step = 35, max = 1400 } = {}) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return el;
  const texts = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) if (walk.currentNode.nodeValue.trim()) texts.push(walk.currentNode);
  const words = texts.reduce((n, t) => n + (t.nodeValue.match(/\S+/g) || []).length, 0);
  const gap = Math.min(step, max / Math.max(1, words));
  let i = 0;
  for (const t of texts) {
    const frag = document.createDocumentFragment();
    for (const part of t.nodeValue.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { frag.append(part); continue; }
      const span = document.createElement("span");
      span.className = "word-in"; span.textContent = part; span.style.animationDelay = `${Math.round(i++ * gap)}ms`;
      frag.append(span);
    }
    t.replaceWith(frag);
  }
  return el;
}
