/* Starts the Grante app and decides which page to show. */
import { renderAbout, renderArchive, renderHelp, renderSafety, renderSettings } from "./account.js";
import { renderAgent, renderHome, resetAgent } from "./agent.js";
import { api, events, WEB } from "./api.js";
import { renderForgot, renderLegal, renderSignIn, renderSignUp, renderVerify, renderWelcome } from "./auth.js";
import { renderChat } from "./chat.js";
import { needsSetupScreen, renderSetupScreen } from "./helper-ui.js";
import { renderForum, renderPost } from "./forum.js";
import { app } from "./state.js";
import { $, h, icon, initials, logo, toast } from "./ui.js";

const root = $("#root");
const PUBLIC = ["welcome", "signin", "signup", "forgot", "terms", "privacy"];
let usersExist = true;
let signingUp = false;   // true while the create-account screens are open
let shell = null;
let setupChecked = false;   // the "let Grante into your folders" screen is checked once per visit
let inSetup = false;        // true while that screen is up

const NAV = [
  ["home", "Home", "home"],
  ["chat", "Ask Grante AI", "sparkle"],
  ["forum", "Forum", "forum"],
  ["archive", "Archive", "archive"],
  ["about", "About Us", "info"],
];
const NAV2 = [
  ["safety", "Safety", "shield"],
  ["help", "Help", "help"],
];

/* ---------- The app frame (sidebar + page area) ---------- */

function buildShell() {
  const status = h("div", { class: "status" }, h("span", { class: "dot" }), h("span", { class: "status-text" }, "Online"));
  const userName = h("strong", { class: "user-name" });
  const userHandle = h("span", { class: "user-handle muted" });
  const av = h("span", { class: "avatar" });
  const menu = h("div", { class: "card user-menu", hidden: true, role: "menu" },
    h("a", { href: "#/settings", role: "menuitem" }, icon("settings"), "Account Settings"),
    h("a", { href: "#/safety", role: "menuitem" }, icon("shield"), "Safety"),
    h("a", { href: "#/help", role: "menuitem" }, icon("help"), "Help"),
    h("button", { role: "menuitem", onclick: signOut }, icon("logout"), "Sign out"));
  const userBtn = h("button", { class: "user-btn", "aria-haspopup": "menu", onclick: (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; } },
    av, h("span", { class: "user-text" }, userName, userHandle), icon("more"));
  document.addEventListener("click", () => (menu.hidden = true));
  window.addEventListener("hashchange", () => (menu.hidden = true));

  const link = ([page, label, ic]) => h("a", { href: `#/${page}`, "data-page": page }, icon(ic), h("span", {}, label));
  const view = h("main", { class: "view", id: "view", tabindex: -1 });
  const frame = h("div", { class: "app" },
    h("aside", { class: "sidebar card" },
      h("a", { class: "brand", href: "#/home", "aria-label": "Grante home" }, logo(34), h("span", { class: "brand-text" }, h("span", { class: "brand-name" }, "Grante"), h("span", { class: "brand-by" }, "by NarSan"))),
      h("nav", { class: "nav", "aria-label": "Main" }, ...NAV.map(link)),
      h("nav", { class: "nav nav-secondary", "aria-label": "More" }, ...NAV2.map(link)),
      h("div", { class: "sidebar-foot" }, status, h("div", { class: "user-wrap" }, userBtn, menu))),
    h("div", { class: "main" }, view,
      h("footer", { class: "site-foot" },
        h("span", {}, `© ${new Date().getFullYear()} NarSan. All rights reserved.`),
        h("nav", {}, h("a", { href: "#/about" }, "About"), h("a", { href: "#/terms" }, "Terms"), h("a", { href: "#/privacy" }, "Privacy"), h("a", { href: "#/help" }, "Help")))));
  const paintUser = () => {
    av.textContent = initials(app.user.display_name);
    userName.textContent = app.user.display_name;
    userHandle.textContent = `@${app.user.username}`;
  };
  events.onOnline = (online) => {
    status.classList.toggle("offline", !online);
    status.querySelector(".status-text").textContent = online ? "Online" : "Offline";
  };
  return { frame, view, paintUser };
}

async function signOut() {
  try { await api("/auth/logout", { method: "POST" }); } catch { /* signing out locally anyway */ }
  signedOut();
  toast("Signed out");
}

function signedOut() {
  setupChecked = false; inSetup = false;
  signingUp = false;
  app.user = null; app.agentSession = null; app.chatId = null;
  resetAgent();
  shell = null;
  location.hash = "#/signin";
  route();
}
events.onSignedOut = () => { if (app.user) { toast("Please sign in again."); signedOut(); } };

async function signedIn(user) {
  app.user = user;
  usersExist = true;
  signingUp = false;
  if (!user.email_verified) { location.hash = "#/verify"; return route(); }
  // Website: right after signing in or finishing sign-up in the main tab, go to the welcome page
  // (the one with the Open Grante button). Inside Grante's own window, just carry on.
  if (WEB && window.name !== "grante-app" && !matchMedia("(display-mode: standalone)").matches) {
    location.href = "../";
    return;
  }
  try { app.settings = await api("/settings"); } catch { /* defaults are fine */ }
  location.hash = "#/home";
  route();
}

/* ---------- Pages ---------- */

function route() {
  const parts = (location.hash.replace(/^#\/?/, "") || (app.user ? "home" : "welcome")).split("/");
  const page = parts[0];

  if (!app.user) {
    if (!PUBLIC.includes(page)) { location.replace("#/welcome"); return route(); }
    shell = null;
    if (page === "welcome") {
      if (sessionStorage.getItem("grante.welcomed")) { location.replace(usersExist ? "#/signin" : "#/signup"); return route(); }
      sessionStorage.setItem("grante.welcomed", "1");
      return renderWelcome(root, () => { location.hash = usersExist ? "#/signin" : "#/signup"; });
    }
    if (page === "signin") return renderSignIn(root, { onSignedIn: signedIn, usersExist });
    if (page === "signup") { signingUp = true; return renderSignUp(root, { onSignedIn: signedIn, onSignOut: signOut }); }
    if (page === "forgot") return renderForgot(root);
    return renderLegal(root, page, false);
  }

  if (!app.user.email_verified) {   // signed in, but hasn't typed the code from their email yet
    shell = null;
    if (page === "signup" && signingUp) return;   // the sign-up screens are showing this step themselves
    if (page === "terms" || page === "privacy") return renderLegal(root, page, false);
    return renderVerify(root, { user: app.user, onVerified: signedIn, onSignOut: signOut });
  }
  if (["welcome", "signin", "signup", "forgot"].includes(page)) { location.replace("#/home"); return route(); }
  if (WEB && page === "setup") {   // opened from Account Settings: the folder setup, full screen
    shell = null; setupChecked = true; inSetup = true;
    return renderSetupScreen(root, () => { inSetup = false; location.hash = "#/agent"; });
  }
  if (inSetup) return;   // the setup screen (or the check for it) is showing: page changes wait
  if (WEB && !setupChecked && !signingUp) {   // first stop on a Mac: the folder setup screen, before anything else
    setupChecked = true; inSetup = true;
    const leave = () => { inSetup = false; route(); };
    return needsSetupScreen().then((show) => {
      if (!show) return leave();
      shell = null;
      renderSetupScreen(root, () => { inSetup = false; if (location.hash === "#/agent") route(); else location.hash = "#/agent"; });
    }).catch(leave);
  }
  if (!shell) { shell = buildShell(); root.replaceChildren(shell.frame); }
  shell.paintUser();
  const view = shell.view;
  const active = page === "agent" ? "home" : page;
  shell.frame.querySelectorAll("[data-page]").forEach((a) => a.classList.toggle("active", a.dataset.page === active));
  window.scrollTo(0, 0);

  const onUserChange = (user) => { app.user = user; shell.paintUser(); };
  switch (page) {
    case "home": return renderHome(view);
    case "agent": return renderAgent(view);
    case "chat": return renderChat(view);
    case "forum": return parts[1] === "post" ? renderPost(view, parts[2]) : renderForum(view);
    case "archive": return renderArchive(view);
    case "settings": return renderSettings(view, onUserChange, signedOut);
    case "safety": return renderSafety(view);
    case "help": return renderHelp(view);
    case "about": return renderAbout(view);
    case "terms": case "privacy": return view.replaceChildren(h("div", { class: "narrow" }, renderLegal(root, page, true)));
    default:
      return view.replaceChildren(h("div", { class: "narrow" }, h("div", { class: "card empty" },
        h("h3", {}, "Page not found"), h("p", { class: "muted" }, "That page doesn't exist."), h("a", { class: "btn", href: "#/home" }, "Go home"))));
  }
}

window.addEventListener("hashchange", route);

(async function start() {
  try {
    const s = await api("/auth/status");
    usersExist = s.users_exist;
    if (s.signed_in) {
      app.user = s.user;
      try { app.settings = await api("/settings"); } catch { /* defaults */ }
    }
  } catch (e) {
    root.replaceChildren(h("div", { class: "auth" }, h("div", { class: "card auth-card" }, logo(40), h("h2", {}, "Can't reach Grante"),
      h("p", { class: "muted" }, WEB ? (e.message || "Something went wrong while loading. Refresh the page to try again.")
        : "Start it in Terminal with python run_api.py, then refresh this page."))));
    return;
  }
  route();
})();
