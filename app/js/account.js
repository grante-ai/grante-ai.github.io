/* Account Settings, Archive, Safety, Help, and About pages. */
import { api, FILES, WEB } from "./api.js";
import { foldersCard, keepOutCard } from "./folders-ui.js";
import { CAN_DO, FOUNDER, RISKS, TAGLINE, TRUST, USES, WEB_NOTE } from "./content.js";
import { locationFields, nameFields } from "./places.js";
import { app } from "./state.js";
import { h, icon, modal, passwordInput, passwordMeter, timeAgo, toast } from "./ui.js";

const TOOL_LABELS = {
  move_file: "Moving files", rename_file: "Renaming files", create_folder: "Creating folders",
  delete_file: "Deleting files", sort_files: "Sorting folders", open_app: "Opening apps",
};

function pageHead(title, subtitle, extra) {
  return h("div", { class: "card page-head" }, h("div", {}, h("h2", {}, title), subtitle ? h("p", { class: "muted" }, subtitle) : null), extra || null);
}

function field(label, input, hint) {
  const id = `f-${Math.random().toString(36).slice(2, 8)}`;
  const target = input.matches?.("input,select,textarea") ? input : input.querySelector("input");
  if (target) target.id = id;
  return h("div", { class: "field" }, h("label", { for: id }, label), input, hint ? h("p", { class: "hint" }, hint) : null);
}

/* ---------- Archive ---------- */

export async function renderArchive(view) {
  if (WEB && !FILES.supported) {
    return view.replaceChildren(h("div", { class: "narrow" }, pageHead("Archive", "Everything you've asked Grante to do with your files."),
      h("div", { class: "card empty" }, h("div", { class: "empty-icon" }, icon("archive")), h("h3", {}, "The Archive is in the Mac app"),
        h("p", { class: "muted" }, "It lists the file jobs Grante has done for you, which need Chrome or Edge on a computer. Your chats are saved under Ask Grante AI."))));
  }
  const list = h("div", { class: "activity-list" }, h("div", { class: "card muted" }, "Loading…"));
  view.replaceChildren(h("div", { class: "narrow" }, pageHead("Archive", "Everything you've asked Grante to do, newest first."), list));
  try {
    const items = await api("/requests?limit=300");
    list.replaceChildren(...(items.length ? items.map(requestCard)
      : [h("div", { class: "card empty" }, h("div", { class: "empty-icon" }, icon("archive")), h("h3", {}, "Nothing here yet"),
          h("p", { class: "muted" }, "Everything you ask Grante to do will show up here."))]));
  } catch (e) { list.replaceChildren(h("div", { class: "card error" }, e.message)); }
}

function requestCard(r) {
  const worked = r.actions.filter((a) => a.success).length;
  const status = r.status !== "done" ? ["Not finished", "wait"]
    : !r.actions.length ? ["No changes", "plain"]
    : worked === r.actions.length ? ["Done", "good"]
    : worked ? ["Partly done", "wait"] : ["Not done", "bad"];
  const details = r.actions.length || r.reply ? h("details", { class: "request-more" },
    h("summary", {}, "What happened", icon("chevron", "chev")),
    r.actions.length ? h("div", { class: "actions" }, ...r.actions.map((a) =>
      h("div", { class: `action ${a.success ? "ok" : "no"}` }, h("span", { class: "dot-icon" }, icon(a.success ? "check" : "x")), h("span", {}, a.result)))) : null,
    r.reply ? h("p", { class: "muted small request-reply" }, `Grante: ${r.reply}`) : null) : null;
  return h("div", { class: "card request" },
    h("div", { class: "activity-top" }, h("span", { class: "muted small" }, timeAgo(r.time)), h("span", { class: `tag ${status[1]}` }, status[0])),
    h("p", { class: "request-text" }, `\u201c${r.text}\u201d`),
    details);
}

/* ---------- Account Settings ---------- */

export async function renderSettings(view, onUserChange, onSignedOut) {
  const u = app.user;

  // Profile
  const name = nameFields(u.display_name);
  const profile = h("form", { class: "card form-stack" },
    h("h3", {}, "Profile"),
    name.node,
    field("Username", h("input", { type: "text", value: `@${u.username}`, disabled: true }), "Usernames can't be changed."),
    h("div", { class: "row-end" }, h("button", { class: "btn", type: "submit" }, "Save profile")));
  profile.addEventListener("submit", async (e) => {
    e.preventDefault();
    try { const r = await api("/account", { method: "PATCH", body: { display_name: name.values() } }); onUserChange(r.user); toast("Profile saved"); }
    catch (err) { toast(err.message, "bad"); }
  });

  // Email
  const emailCard = h("div", { class: "card form-stack" },
    h("h3", {}, "Email"),
    h("p", { class: "muted" }, "You sign in with ", h("strong", { class: "ink" }, u.email), "."),
    h("div", { class: "row-end" }, h("button", { class: "btn btn-ghost", onclick: async () => {
      const newEmail = h("input", { type: "email", autocomplete: "email", placeholder: "new@example.com" });
      const pw = passwordInput({ autocomplete: "current-password" });
      const ok = await modal({ title: "Change your email", confirm: "Send confirmation link",
        body: h("div", { class: "form-stack" },
          h("p", { class: "muted" }, "We'll email a link to your new address. Your email changes once you click it, and then you'll sign in again."),
          field("New email", newEmail), field("Your password", pw.field)),
        onConfirm: () => api("/account/email", { method: "POST", body: { email: newEmail.value, password: pw.input.value } }) });
      if (ok) toast(`Check ${newEmail.value.trim()} for the link.`);
    } }, "Change email")));

  // Location
  const place = locationFields(u);
  const location_ = h("form", { class: "card form-stack" },
    h("h3", {}, "Location"),
    h("p", { class: "muted" }, "Decides which Town and Country forums you're in."),
    place.node,
    h("div", { class: "row-end" }, h("button", { class: "btn", type: "submit" }, "Save location")));
  location_.addEventListener("submit", async (e) => {
    e.preventDefault();
    try { const r = await api("/account", { method: "PATCH", body: place.values() }); onUserChange(r.user); toast("Location saved"); }
    catch (err) { toast(err.message, "bad"); }
  });

  // Password
  const current = passwordInput({ autocomplete: "current-password" });
  const next = passwordInput({ autocomplete: "new-password" });
  const meter = passwordMeter(next.input, () => ({ username: u.username, email: u.email }));
  const pwForm = h("form", { class: "card form-stack" },
    h("h3", {}, "Password"),
    field("Current password", current.field),
    field("New password", next.field), meter.node,
    h("div", { class: "row-end" }, h("button", { class: "btn", type: "submit" }, "Change password")));
  pwForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!meter.isValid()) return toast("Your new password needs to pass every check.", "bad");
    try {
      await api("/account/password", { method: "POST", body: { current: current.input.value, new: next.input.value } });
      current.input.value = next.input.value = ""; meter.isValid();
      toast("Password changed.");
    } catch (err) { toast(err.message, "bad"); }
  });

  // Permissions
  const checks = h("div", { class: "checks" });
  const perms = h("div", { class: "card form-stack" },
    h("h3", {}, "Grante permissions"),
    h("p", { class: "muted" }, "Checked actions wait for you to click Allow. Unchecked ones happen right away."),
    checks,
    h("p", { class: "muted small" }, "Grante can reach: ", h("strong", { id: "reach" }, "…")));
  if (!WEB || FILES.supported) try {
    const s = await api("/settings");
    app.settings = s;
    checks.replaceChildren(...Object.entries(TOOL_LABELS).filter(([tool]) => !(WEB && tool === "open_app")).map(([tool, label]) => {
      const cb = h("input", { type: "checkbox", checked: s.ask_before.includes(tool) });
      cb.addEventListener("change", async () => {
        const ask = [...checks.querySelectorAll("input")].map((c, i) => c.checked ? Object.keys(TOOL_LABELS)[i] : null).filter(Boolean);
        if (!ask.includes("delete_file") && tool === "delete_file" && !cb.checked) {
          const sure = await modal({ title: "Stop asking before deleting?", danger: true, confirm: "Yes, stop asking",
            body: "Grante will send files to the Trash without asking you first. Mistakes will happen faster." });
          if (!sure) { cb.checked = true; return; }
        }
        try { app.settings = await api("/settings", { method: "POST", body: { ask_before: ask } }); toast("Saved"); }
        catch (err) { toast(err.message, "bad"); }
      });
      return h("label", { class: "check-box" }, cb, h("span", {}, label));
    }));
    perms.querySelector("#reach").textContent = WEB ? "only the folders you added above, minus anything on your Keep Grante out list."
      : s.workspace === "Home"
      ? "your whole home folder, except Grante's own files and your Library folder." : "only the Grante Workspace test folder.";
  } catch (e) { checks.replaceChildren(h("p", { class: "error" }, e.message)); }

  // Danger zone
  const danger = h("div", { class: "card form-stack danger-zone" },
    h("h3", {}, "Delete account"),
    h("p", { class: "muted" }, "Permanently deletes your account, your forum posts, and your chats and Archive on this computer. Your files are not touched. Replies you wrote on other people's posts stay unless you delete them first."),
    h("div", { class: "row-end" }, h("button", { class: "btn btn-danger", onclick: async () => {
      const confirmName = h("input", { type: "text", placeholder: u.username, autocomplete: "off" });
      const pw = passwordInput({ autocomplete: "current-password" });
      if (await modal({ title: "Delete your account?", danger: true, confirm: "Delete forever",
        body: h("div", { class: "form-stack" }, h("p", { class: "muted" }, "This can't be undone."),
          field(`Type your username (${u.username})`, confirmName), field("Password", pw.field)),
        onConfirm: () => api("/account/delete", { method: "POST", body: { password: pw.input.value, confirm_username: confirmName.value } }) })) {
        toast("Your account was deleted.");
        onSignedOut();
      }
    } }, "Delete my account")));

  view.replaceChildren(h("div", { class: "narrow" }, pageHead("Account Settings", "Manage your profile, security, and what Grante is allowed to do."),
    profile, emailCard, location_, pwForm,
    ...(WEB && FILES.supported ? [foldersCard(), keepOutCard()] : []),
    WEB && !FILES.supported ? null : perms, danger));
}

/* ---------- Safety ---------- */

export function renderSafety(view) {
  view.replaceChildren(h("div", { class: "narrow" },
    pageHead("How Grante keeps you safe", "What Grante can do on your computer, and the protections built in."),
    WEB ? h("div", { class: "card" }, h("p", { class: "muted", style: null }, WEB_NOTE)) : null,
    h("div", { class: "card warn-box" },
      h("div", { class: "warn-head" }, icon("warn"), h("strong", {}, "What Grante can do")),
      h("ul", { class: "can-do" }, ...CAN_DO.map(([a, b]) => h("li", {}, h("strong", {}, a), " ", b))),
      h("div", { class: "warn-head second" }, icon("warn"), h("strong", {}, "Risks")),
      h("ul", { class: "risk-list" }, ...RISKS.map((r) => h("li", {}, r)))),
    h("div", { class: "card trust-box" },
      h("div", { class: "trust-head" }, icon("shield"), h("strong", {}, "Why you can trust Grante")),
      h("div", { class: "trust-grid" }, ...TRUST.map(([a, b]) => h("div", { class: "trust-item" }, h("strong", {}, a), h("p", {}, b))))),
    h("div", { class: "card row-between wrap" }, h("p", {}, "Want Grante to ask before more actions?"), h("a", { class: "btn", href: "#/settings" }, "Open permissions"))));
}

/* ---------- Help ---------- */

const FAQ = [
  ["What can I ask Grante to do?", "Chat about anything in Ask Grante AI. On Home, you can ask it to move, rename, delete, or sort files, create folders, and open apps. For example: “Move report.pdf from Downloads to Documents.”"],
  ["Why didn't my confirmation code arrive?", "Check your spam or junk folder, then use \u201cSend it again\u201d on the confirmation screen. Each code works for 15 minutes."],
  ["Grante did something wrong. How do I fix it?", "Check your Archive to see exactly what you asked and what happened. Deleted files are in your Trash; drag them back out. Moved or renamed files can be moved or renamed back, by you or by asking Grante."],
  ["Does Grante send my files anywhere?", "No. Grante's AI runs on your computer, and your files and your chats with Grante stay here. Only your account details and your forum posts are stored online."],
  ["How do I make Grante ask before everything?", "Go to Account Settings → Grante permissions and check every box."],
  ["I forgot my password.", "On the sign-in screen, click “Forgot password?” for the steps."],
  ["Why can't I see posts from another town?", "The Town and Country forums only show posts from people in the same place as you. Change your location in Account Settings to switch."],
];

export function renderHelp(view) {
  view.replaceChildren(h("div", { class: "narrow" },
    pageHead("Help", "Answers to common questions."),
    ...FAQ.map(([q, a]) => h("details", { class: "card faq" }, h("summary", {}, q, icon("chevron", "chev")), h("p", {}, a)))));
}

/* ---------- About ---------- */

export function renderAbout(view) {
  view.replaceChildren(h("div", { class: "narrow" },
    pageHead("About Us", "The person and the company behind Grante."),
    founderCard(),
    h("div", { class: "card prose" },
      h("h3", {}, "NarSan"),
      h("p", {}, "NarSan is a new company building helpful, trustworthy AI. Its first product is Grante."),
      h("h3", {}, "Grante AI"),
      h("p", {}, "Grante is an AI assistant that chats with you and takes care of your files, right on your own computer. It comes with a community forum for your town, your country, and the whole world."),
      h("h3", {}, "What people use Grante for"),
      h("p", {}, TAGLINE),
      h("ul", {}, ...USES.map((u) => h("li", {}, h("strong", {}, `${u.title}. `), u.text))),
      h("h3", {}, "Our promise"),
      h("p", {}, "Your files stay on your computer. Grante asks before it deletes. And you can always see everything it did."))));
}

/* The founder box on the About page. The words come from FOUNDER in content.js. */
function founderCard() {
  const initials = FOUNDER.name.split(/\s+/).map((w) => w[0] || "").join("").slice(0, 2).toUpperCase();
  const face = h("div", { class: "founder-photo" }, initials);
  if (FOUNDER.photo) {
    const img = h("img", { src: new URL(`../img/${FOUNDER.photo}`, import.meta.url).href, alt: `Photo of ${FOUNDER.name}` });
    img.addEventListener("load", () => face.replaceChildren(img));   // no photo file yet? the initials stay
  }
  const bio = FOUNDER.bio.trim().split(/\n\s*\n/).filter(Boolean).map((para) => h("p", {}, para.trim()));
  return h("div", { class: "card founder" },
    face,
    h("div", { class: "founder-words" },
      h("h2", {}, FOUNDER.hello || FOUNDER.name),
      h("p", { class: "muted" }, FOUNDER.hello ? `${FOUNDER.name} · ${FOUNDER.title}` : FOUNDER.title),
      ...bio));
}
