/* Welcome animation, sign in, create account, forgot password, and the legal pages. */
import { api, WEB } from "./api.js";
import { CAN_DO, PITCH, PITCH_WEB, PRIVACY, PRIVACY_WEB, RISKS, TAGLINE, TAGLINE_WEB, TERMS, TRUST, WEB_NOTE } from "./content.js";
import { locationFields, nameFields, usernameInput } from "./places.js";
import { h, icon, logo, passwordInput, passwordMeter } from "./ui.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function authPage(...cards) {
  return h("div", { class: "auth" },
    h("div", { class: "auth-inner" }, ...cards),
    h("footer", { class: "auth-foot" },
      h("span", {}, `© ${new Date().getFullYear()} NarSan`),
      h("a", { href: "#/terms" }, "Terms"),
      h("a", { href: "#/privacy" }, "Privacy")));
}

/* "What is Grante?" shown beside the sign-in and sign-up boxes, so new people know what it does */
function pitch() {
  return h("aside", { class: "pitch", "aria-label": "What Grante does" },
    h("p", { class: "pitch-kicker" }, "Grante, by NarSan"),
    h("h1", {}, WEB ? TAGLINE_WEB : TAGLINE),
    h("p", { class: "pitch-sub" }, WEB ? "Grante is an AI assistant by NarSan. This is the web version."
      : "Grante is an AI assistant that organizes the files on your computer when you ask it to."),
    h("ul", {}, ...(WEB ? PITCH_WEB : PITCH).map(([ic, title, text]) => h("li", {}, h("span", { class: "pitch-icon" }, icon(ic)),
      h("div", {}, h("strong", {}, title), h("span", {}, text))))),
    null);
}

function brandRow() {
  return h("div", { class: "auth-brand" }, logo(40), h("div", {}, h("div", { class: "brand-name" }, "Grante"), h("div", { class: "brand-by" }, "by NarSan")));
}

function field(label, input, hint) {
  const id = input.id || `f-${Math.random().toString(36).slice(2, 8)}`;
  const target = input.matches?.("input,select") ? input : input.querySelector("input,select");
  if (target) target.id = id;
  return h("div", { class: "field" }, h("label", { for: id }, label), input, hint ? h("p", { class: "hint" }, hint) : null);
}

function formError() {
  return h("p", { class: "form-error", role: "alert", hidden: true });
}
function showError(node, msg) { node.textContent = msg; node.hidden = !msg; }

/* ---------- Welcome (the sliding animation) ---------- */

export function renderWelcome(root, next) {
  const letters = [..."Welcome"].map((ch, i) => h("span", { class: "welcome-letter", style: null }, ch));
  letters.forEach((l, i) => { l.style.animationDelay = `${0.15 + i * 0.07}s`; });
  const card = h("div", { class: "card welcome-card" },
    logo(56),
    h("h1", { class: "welcome-word", "aria-label": "Welcome" }, ...letters),
    h("p", { class: "welcome-sub" }, "to Grante, by NarSan"));
  root.replaceChildren(h("div", { class: "welcome" }, card));
  const go = () => {
    card.classList.add("leave");
    setTimeout(next, reduceMotion ? 0 : 550);
  };
  setTimeout(go, reduceMotion ? 600 : 2300);
}

/* ---------- Sign in ---------- */

export function renderSignIn(root, { onSignedIn, usersExist }) {
  const login = h("input", { type: "email", autocomplete: "email", required: true, autofocus: true, autocapitalize: "none", spellcheck: false });
  const pw = passwordInput({ required: true });
  const remember = h("input", { type: "checkbox", checked: true });
  const error = formError();
  const submit = h("button", { class: "btn btn-block", type: "submit" }, "Sign in");
  const form = h("form", { class: "form-stack", novalidate: true },
    field("Email", login),
    field("Password", pw.field),
    h("div", { class: "row-between" },
      h("label", { class: "check-inline" }, remember, "Keep me signed in"),
      h("a", { href: "#/forgot", class: "link" }, "Forgot password?")),
    error, submit);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!login.value.trim() || !pw.input.value) return showError(error, "Enter your email and password.");
    submit.disabled = true;
    showError(error, "");
    try {
      const r = await api("/auth/login", { method: "POST", body: { email: login.value.trim(), password: pw.input.value, remember: remember.checked } });
      onSignedIn(r.user);
    } catch (err) {
      showError(error, err.message);
      submit.disabled = false;
    }
  });
  root.replaceChildren(authPage(pitch(), h("div", { class: "card auth-card slide-in" },
    brandRow(),
    h("h2", {}, "Sign in"),
    h("p", { class: "muted" }, usersExist ? "Welcome back! Sign in to keep going." : "Sign in, or create an account to get started."),
    form,
    h("div", { class: "divider" }, h("span", {}, "New to Grante?")),
    h("a", { class: "btn btn-ghost btn-block", href: "#/signup" }, "Create an account"))));
}

/* ---------- Create account (4 steps) ---------- */

export function renderSignUp(root, { onSignedIn, onSignOut }) {
  const data = { display_name: "", username: "", email: "", password: "", town: "", state: "", country: "United States" };
  let step = 1;
  const card = h("div", { class: "card auth-card wide slide-in" });
  root.replaceChildren(authPage(pitch(), card));

  const steps = ["Account", "Location", "Safety", "Confirm", "Done"];
  const progress = () => h("ol", { class: "steps", "aria-label": "Sign-up progress" },
    ...steps.map((s, i) => h("li", { class: i + 1 < step ? "done" : i + 1 === step ? "current" : "" },
      h("span", { class: "step-dot" }, i + 1 < step ? icon("check") : String(i + 1)), h("span", { class: "step-name" }, s))));

  function show(content, direction = "forward") {
    card.classList.remove("slide-in", "slide-back");
    void card.offsetWidth; // restart the animation
    card.classList.add(direction === "back" ? "slide-back" : "slide-in");
    card.replaceChildren(brandRow(), progress(), content);
    card.querySelector("input")?.focus();
  }

  /* Step 1: account */
  function stepAccount(direction) {
    step = 1;
    const name = nameFields(data.display_name);
    const username = usernameInput(data.username);
    const email = h("input", { type: "email", autocomplete: "email", value: data.email, autocapitalize: "none", spellcheck: false });
    const pw = passwordInput({ autocomplete: "new-password", value: data.password });
    const pw2 = passwordInput({ autocomplete: "new-password", value: data.password });
    const meter = passwordMeter(pw.input, () => ({ username: username.value, email: email.value }));
    [username, email].forEach((n) => n.addEventListener("input", () => meter.isValid()));
    const error = formError();
    const form = h("form", { class: "form-stack", novalidate: true },
      h("h2", {}, "Create your account"),
      h("p", { class: "muted" }, "It only takes a minute."),
      name.node,
      field("Username", username, "3-20 lowercase letters, numbers, or _"),
      field("Email", email),
      field("Password", pw.field),
      meter.node,
      field("Confirm password", pw2.field),
      error,
      h("button", { class: "btn btn-block", type: "submit" }, "Continue"),
      h("p", { class: "center muted small" }, "Already have an account? ", h("a", { href: "#/signin", class: "link" }, "Sign in")));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      let displayName;
      try { displayName = name.values(); } catch (err) { return showError(error, err.message); }
      if (!/^[a-z0-9_]{3,20}$/.test(username.value.trim())) return showError(error, "Usernames are 3-20 lowercase letters, numbers, or underscores.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) return showError(error, "Please enter a valid email address.");
      if (!meter.isValid()) return showError(error, "Your password needs to pass every check in the list.");
      if (pw.input.value !== pw2.input.value) return showError(error, "The two passwords don't match.");
      const server = await api("/auth/check-password", { method: "POST", body: { password: pw.input.value, username: username.value, email: email.value } }).catch((err) => ({ problems: [err.message] }));
      if (server.problems.length) return showError(error, server.problems.join(" "));
      Object.assign(data, { display_name: displayName, username: username.value.trim(), email: email.value.trim(), password: pw.input.value });
      const free = await api(`/auth/username-available?username=${encodeURIComponent(data.username)}`).catch((err) => ({ available: false, reason: err.message }));
      if (!free.available) return showError(error, free.reason);
      stepLocation();
    });
    show(form, direction);
  }

  /* Step 2: location */
  function stepLocation(direction) {
    step = 2;
    const place = locationFields(data);
    const age = h("input", { type: "checkbox", checked: data.age_ok || false });
    const error = formError();
    const form = h("form", { class: "form-stack", novalidate: true },
      h("h2", {}, "Where are you?"),
      h("p", { class: "muted" }, "This puts you in your Town and Country forums. Other people only see which forum you posted in, never your address or email."),
      place.node,
      h("label", { class: "check-box" }, age, h("span", {}, "I'm 13 years old or older.")),
      error,
      h("div", { class: "row-between" },
        h("button", { class: "btn btn-ghost", type: "button", onclick: () => stepAccount("back") }, "Back"),
        h("button", { class: "btn", type: "submit" }, "Continue")));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      let where;
      try { where = place.values(); } catch (err) { return showError(error, err.message); }
      if (!age.checked) return showError(error, "You must be 13 or older to use Grante.");
      Object.assign(data, { ...where, age_ok: true });
      stepSafety();
    });
    show(form, direction);
  }

  /* Step 3: what Grante can do, and why you can trust it */
  function stepSafety() {
    step = 3;
    const boxes = [
      WEB ? "I understand that in the Mac app, Grante can move, rename, sort, and delete files in my home folder, and open apps."
        : "I understand Grante can move, rename, sort, and delete files anywhere in my home folder, and open apps.",
      "I understand Grante can make mistakes, and I'll keep backups of files I care about.",
      "I agree to the Terms of Service and Privacy Policy.",
    ].map((text, i) => {
      const cb = h("input", { type: "checkbox" });
      const label = i === 2
        ? h("span", {}, "I agree to the ", h("a", { href: "#/terms", target: "_blank", class: "link" }, "Terms of Service"),
            " and ", h("a", { href: "#/privacy", target: "_blank", class: "link" }, "Privacy Policy"), ".")
        : h("span", {}, text);
      return { cb, node: h("label", { class: "check-box" }, cb, label) };
    });
    const error = formError();
    const submit = h("button", { class: "btn", type: "submit" }, "I understand, create my account");
    const form = h("form", { class: "form-stack", novalidate: true },
      h("h2", {}, "Before you start: what Grante can do"),
      WEB ? h("p", { class: "form-note" }, WEB_NOTE) : null,
      h("div", { class: "warn-box" },
        h("div", { class: "warn-head" }, icon("warn"), h("strong", {}, "Grante can change real files on this computer")),
        h("ul", { class: "can-do" }, ...CAN_DO.map(([a, b]) => h("li", {}, h("strong", {}, a), " ", b))),
        h("div", { class: "warn-head second" }, icon("warn"), h("strong", {}, "Please read these risks")),
        h("ul", { class: "risk-list" }, ...RISKS.map((r) => h("li", {}, r)))),
      h("div", { class: "trust-box" },
        h("div", { class: "trust-head" }, icon("shield"), h("strong", {}, "Why you can trust Grante")),
        h("div", { class: "trust-grid" }, ...TRUST.map(([a, b]) => h("div", { class: "trust-item" }, h("strong", {}, a), h("p", {}, b))))),
      ...boxes.map((b) => b.node),
      error,
      h("div", { class: "row-between" },
        h("button", { class: "btn btn-ghost", type: "button", onclick: () => stepLocation("back") }, "Back"),
        submit));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!boxes.every((b) => b.cb.checked)) return showError(error, "Please check all three boxes to continue.");
      submit.disabled = true;
      showError(error, "");
      try {
        const r = await api("/auth/signup", { method: "POST", body: { ...data, age_ok: true, agree_terms: true, agent_ack: true } });
        data.password = "";
        stepConfirm(r.user);
      } catch (err) {
        showError(error, err.message);
        submit.disabled = false;
      }
    });
    show(form);
    card.scrollIntoView({ block: "start" });
  }

  /* Step 4: type the 6-digit code from the confirmation email */
  function stepConfirm(user) {
    step = 4;
    show(verifyPanel({ email: user.email, onVerified: stepDone, onSignOut }));
  }

  /* Step 5: done */
  function stepDone(user) {
    step = 5;
    show(h("div", { class: "form-stack center" },
      h("div", { class: "done-badge" }, icon("check")),
      h("h2", {}, `You're all set, ${user.display_name.split(" ")[0]}!`),
      h("p", { class: "muted" }, `Your account @${user.username} is ready. You're in the ${user.town}, ${user.country}, and Global forums.`),
      h("button", { class: "btn btn-block", onclick: () => onSignedIn(user) }, "Start using Grante")));
  }

  stepAccount();
}

/* ---------- Confirm your email (a 6-digit code, sent with EmailJS) ---------- */

/* Posts the code email to EmailJS from this window (EmailJS only accepts browser requests). */
async function sendCodeEmail(mail) {
  let res;
  try {
    res = await fetch(mail.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mail.body) });
  } catch {
    throw new Error("The confirmation email couldn't be sent. Check your internet connection, then press \"Send it again\".");
  }
  if (res.ok) return;
  const said = (await res.text().catch(() => "")).slice(0, 160);
  if (/recipients? address is empty/i.test(said)) throw new Error("EmailJS doesn't know who to send to. In your EmailJS template, set the \"To Email\" box to {{to_email}}.");
  if (/public key|user id/i.test(said)) throw new Error("EmailJS didn't accept Grante's public key. Check EMAILJS in grante_api/config.py.");
  if (/template|service/i.test(said) && res.status === 400) throw new Error(`EmailJS couldn't find the template or service (${said}). Check EMAILJS in grante_api/config.py.`);
  if (/gmail|insufficient authentication|invalid grant/i.test(said)) throw new Error("EmailJS lost its connection to your email account. In EmailJS open Email Services and reconnect it.");
  if (res.status === 429 || /limit|quota/i.test(said)) throw new Error("Grante has sent all the emails it can for now. Please try again later.");
  throw new Error(`The confirmation email couldn't be sent (EmailJS said: ${said || res.status}).`);
}

function verifyPanel({ email, onVerified, onSignOut }) {
  const error = formError();
  const notice = h("p", { class: "notice", hidden: true });
  const lead = h("p", { class: "muted" });
  const say = (before, after) => lead.replaceChildren(before, h("strong", { class: "ink" }, email), after);   // only claims "emailed" once it really was
  say("Getting a 6-digit code ready for ", "...");
  const code = h("input", { type: "text", class: "code-single", inputmode: "numeric", autocomplete: "one-time-code",
    maxlength: 6, placeholder: "000000", "aria-label": "6-digit code" });
  const check = h("button", { class: "btn btn-block", type: "submit" }, "Confirm");
  const resend = h("button", { class: "text-btn", type: "button" }, "Send it again");
  let timer;
  const cooldown = (seconds) => {
    clearInterval(timer);
    let left = seconds;
    const tick = () => {
      resend.disabled = left > 0;
      resend.textContent = left > 0 ? `Send it again (${left}s)` : "Send it again";
      if (left-- <= 0) clearInterval(timer);
    };
    tick();
    timer = setInterval(tick, 1000);
  };
  const submit = async () => {
    showError(error, "");
    if (code.value.length !== 6) return showError(error, "Type the 6-digit code from the email.");
    check.disabled = true;
    try {
      const r = await api("/auth/verify/code", { method: "POST", body: { code: code.value } });
      clearInterval(timer);
      return onVerified(r.user);
    } catch (err) {
      showError(error, err.message);
      code.value = ""; code.focus();
    }
    check.disabled = false;
  };
  code.addEventListener("input", () => {
    code.value = code.value.replace(/\D/g, "").slice(0, 6);
    if (code.value.length === 6) submit();   // no need to press the button
  });
  resend.addEventListener("click", async () => {
    showError(error, "");
    notice.hidden = true;
    try {
      const r = await api("/auth/verify/resend", { method: "POST" });
      if (r.mail) await deliver(r.mail);
      notice.textContent = "A new code is on its way. The old one no longer works."; notice.hidden = false;
      cooldown(60);
      code.value = ""; code.focus();
    } catch (err) { showError(error, err.message); }
  });
  // Send through EmailJS; if that fails, tell the server so "Send it again" works straight away
  async function deliver(mail) {
    say("Sending a 6-digit code to ", "...");
    try { await sendCodeEmail(mail); say("We emailed a 6-digit code to ", ". Type it here to confirm it's really you."); }
    catch (err) { say("We couldn't email a code to ", " yet."); await api("/auth/verify/failed", { method: "POST" }).catch(() => {}); cooldown(0); throw err; }
  }
  // When this screen opens: send the code, unless one that still works is already in their inbox
  cooldown(60);
  (async () => {
    try {
      const r = await api("/auth/verify/start", { method: "POST" });
      if (r.mail) await deliver(r.mail);
      else { cooldown(r.wait || 0); say("We already emailed a 6-digit code to ", ". Type it here, or send a new one."); }
    } catch (err) { showError(error, err.message); }
  })();
  setTimeout(() => code.focus(), 50);
  return h("form", { class: "form-stack center", onsubmit: (e) => { e.preventDefault(); submit(); } },
    h("div", { class: "done-badge soft" }, icon("mail")),
    h("h2", {}, "Confirm your email"),
    lead,
    code, notice, error, check,
    h("div", { class: "row-between" },
      h("button", { class: "text-btn", type: "button", onclick: () => { clearInterval(timer); onSignOut(); } }, icon("back"), "Use a different account"),
      resend),
    h("p", { class: "muted small" }, "The code works for 15 minutes. Can't find the email? Check your spam or junk folder."));
}

/* Shown when someone signs in but hasn't confirmed their email yet */
export function renderVerify(root, { user, onVerified, onSignOut }) {
  root.replaceChildren(authPage(h("div", { class: "card auth-card slide-in" }, brandRow(),
    verifyPanel({ email: user.email, onVerified, onSignOut }))));
}

/* ---------- Forgot password ---------- */

export function renderForgot(root) {
  const email = h("input", { type: "email", autocomplete: "email", autofocus: true });
  const error = formError();
  const submit = h("button", { class: "btn btn-block", type: "submit" }, "Email me a reset link");
  const form = h("form", { class: "form-stack", novalidate: true },
    h("h2", {}, "Forgot your password?"),
    h("p", { class: "muted" }, "Enter your email and we'll send you a link to choose a new password."),
    field("Email", email), error, submit,
    h("a", { class: "link center", href: "#/signin" }, "Back to sign in"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) return showError(error, "Please enter a valid email address.");
    submit.disabled = true;
    showError(error, "");
    try {
      await api("/auth/password/reset", { method: "POST", body: { email: email.value.trim() } });
      form.replaceChildren(
        h("div", { class: "done-badge soft" }, icon("mail")),
        h("h2", { class: "center" }, "Check your email"),
        h("p", { class: "muted center" }, "If there's a Grante account for ", h("strong", { class: "ink" }, email.value.trim()), ", a reset link is on its way. Check spam too."),
        h("a", { class: "btn btn-block", href: "#/signin" }, "Back to sign in"));
    } catch (err) { showError(error, err.message); submit.disabled = false; }
  });
  root.replaceChildren(authPage(h("div", { class: "card auth-card slide-in" }, brandRow(), form)));
}

/* ---------- Terms and Privacy ---------- */

export function legalPage(title, sections) {
  return h("div", { class: "card legal" },
    h("h2", {}, title),
    h("p", { class: "muted small" }, "Last updated September 2026"),
    ...sections.map(([head, text]) => h("section", {}, h("h3", {}, head), h("p", {}, text))));
}

export function renderLegal(root, which, signedIn) {
  const page = legalPage(which === "terms" ? "Terms of Service" : "Privacy Policy",
    which === "terms" ? TERMS : (WEB ? [PRIVACY[0], PRIVACY_WEB, ...PRIVACY.slice(1)] : PRIVACY));
  if (signedIn) return page;
  root.replaceChildren(authPage(h("div", { class: "legal-wrap" },
    h("a", { class: "link back-link", href: "#/signin" }, icon("back"), "Back"), page)));
  return null;
}
