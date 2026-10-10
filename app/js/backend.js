/* Grante's "server", running inside the browser (website version only).

   The desktop app has a Python server that does this work. A website can't run Python, so this
   file does the same jobs in JavaScript and talks to the same services:
     - Firebase   accounts and the forum (the same accounts as the desktop app)
     - EmailJS    the 6-digit confirmation code
     - Open-Meteo checking that a town is real
     - your Hugging Face Space, which runs Grante's AI for the chat

   What stays in this browser only: who is signed in, and your chat history.
   What the website can't do at all: anything with files on your computer. */
import { CONFIG } from "./web-config.js";
import * as files from "./files.js";

const TEST = globalThis.__GRANTE_TEST__ || {};              // set only by automated tests
const via = (url) => (TEST.proxy && !url.startsWith("http://127.0.0.1") ? TEST.proxy + encodeURIComponent(url) : url);

const KEY = CONFIG.firebase.apiKey;
const AUTH_URL = "https://identitytoolkit.googleapis.com/v1/accounts";
const TOKEN_URL = "https://securetoken.googleapis.com/v1/token";
const DOCS = `projects/${CONFIG.firebase.projectId}/databases/(default)/documents`;
const FS_URL = `https://firestore.googleapis.com/v1/${DOCS}`;
const PLACES_URL = "https://geocoding-api.open-meteo.com/v1/search";
const EMAIL_URL = "https://api.emailjs.com/api/v1.0/email/send";
const SPACE = String(CONFIG.spaceUrl || "").replace(/\/+$/, "");

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const now = () => new Date().toISOString().replace(/\.\d+Z$/, "+00:00");
const seconds = () => Date.now() / 1000;

/* ======================================================================================
   Firebase
   ====================================================================================== */

class FirebaseError extends Error {
  constructor(message, code = "", status = 0) { super(message); this.code = code; this.status = status; }
}

const MESSAGES = {
  EMAIL_EXISTS: "There's already an account with that email.",
  EMAIL_NOT_FOUND: "That email or password isn't right.",
  INVALID_PASSWORD: "That email or password isn't right.",
  INVALID_LOGIN_CREDENTIALS: "That email or password isn't right.",
  INVALID_EMAIL: "Please enter a valid email address.",
  USER_DISABLED: "This account has been turned off.",
  TOO_MANY_ATTEMPTS_TRY_LATER: "Too many tries. Wait a few minutes and try again.",
  WEAK_PASSWORD: "That password is too weak.",
  OPERATION_NOT_ALLOWED: "Email sign-in isn't turned on in Firebase yet.",
  CONFIGURATION_NOT_FOUND: "Firebase Authentication isn't set up yet.",
  CREDENTIAL_TOO_OLD_LOGIN_AGAIN: "For your security, please sign out and sign in again, then retry.",
  TOKEN_EXPIRED: "Please sign in again.",
  INVALID_ID_TOKEN: "Please sign in again.",
  USER_NOT_FOUND: "Please sign in again.",
  INVALID_REFRESH_TOKEN: "Please sign in again.",
  PERMISSION_DENIED: "Firebase said no. If this keeps happening, the security rules (firestore.rules) may not be published yet.",
  NOT_FOUND: "That doesn't exist anymore.",
  ALREADY_EXISTS: "That already exists.",
};

async function fbHttp(method, url, body, token, form = false) {
  const headers = {};
  let data;
  if (body !== undefined && body !== null) {
    if (form) { data = new URLSearchParams(body).toString(); headers["Content-Type"] = "application/x-www-form-urlencoded"; }
    else { data = JSON.stringify(body); headers["Content-Type"] = "application/json"; }
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try { res = await fetch(via(url), { method, headers, body: data }); }
  catch { throw new FirebaseError("Can't reach Firebase. Check your internet connection.", "OFFLINE"); }
  const raw = await res.text();
  if (res.ok) return raw.trim() ? JSON.parse(raw) : {};
  let code = "", detail = "";
  try {
    let err = JSON.parse(raw);
    err = (Array.isArray(err) ? err[0] : err).error || {};
    code = String(err.status || err.message || "");
    detail = String(err.message || "");
  } catch { detail = raw.slice(0, 200); }
  if (/referr?er/i.test(detail) || /REFERRER_BLOCKED/.test(raw)) {   // the key is locked to other website addresses
    throw new FirebaseError(`Your Firebase key isn't allowed on this website address (${location.origin}). In Google Cloud \u2192 Credentials, add ${location.origin}/* to the key's website list.`, "REFERER_BLOCKED", res.status);
  }
  if (/are blocked|API_KEY_SERVICE_BLOCKED|has not been used|is disabled/i.test(detail + raw)) {   // the key isn't allowed to use this Google service
    const api = /identitytoolkit/.test(url) ? "Identity Toolkit API" : /securetoken/.test(url) ? "Token Service API" : "Cloud Firestore API";
    throw new FirebaseError(`Your Firebase key isn't allowed to use the ${api}. In Google Cloud \u2192 Credentials, open the key and add it under API restrictions (or choose "Don't restrict key").`, "API_BLOCKED", res.status);
  }
  let short = ((detail && (detail === detail.toUpperCase() || detail.includes(" : "))) ? detail : code).split(" : ")[0].trim();
  if (!(short in MESSAGES)) short = code;
  throw new FirebaseError(MESSAGES[short] || detail || `Firebase error ${res.status}`, short, res.status);
}

const fbAuth = (action, body) => fbHttp("POST", `${AUTH_URL}:${action}?key=${KEY}`, body);
const fb = {
  signUp: (email, password) => fbAuth("signUp", { email, password, returnSecureToken: true }),
  signIn: (email, password) => fbAuth("signInWithPassword", { email, password, returnSecureToken: true }),
  sendPasswordReset: (email) => fbAuth("sendOobCode", { requestType: "PASSWORD_RESET", email }),
  sendChangeEmail: (idToken, newEmail) => fbAuth("sendOobCode", { requestType: "VERIFY_AND_CHANGE_EMAIL", idToken, newEmail }),
  async lookup(idToken) {
    const users = (await fbAuth("lookup", { idToken })).users || [];
    if (!users.length) throw new FirebaseError("Please sign in again.", "USER_NOT_FOUND", 401);
    return users[0];
  },
  changePassword: (idToken, password) => fbAuth("update", { idToken, password, returnSecureToken: true }),
  deleteAccount: (idToken) => fbAuth("delete", { idToken }),
  refresh: (refreshToken) => fbHttp("POST", `${TOKEN_URL}?key=${KEY}`, { grant_type: "refresh_token", refresh_token: refreshToken }, null, true),

  // ---- Firestore: values to and from Firestore's format ----
  toValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === "boolean") return { booleanValue: v };
    if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(fb.toValue) } };
    if (typeof v === "object") return { mapValue: { fields: fb.fields(v) } };
    return { stringValue: String(v) };
  },
  fromValue(v) {
    if ("stringValue" in v) return v.stringValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("booleanValue" in v) return v.booleanValue;
    if ("doubleValue" in v) return v.doubleValue;
    if ("arrayValue" in v) return (v.arrayValue.values || []).map(fb.fromValue);
    if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fb.fromValue(x)]));
    if ("timestampValue" in v) return v.timestampValue;
    return null;
  },
  fields: (data) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fb.toValue(v)])),
  doc(raw) {
    const data = Object.fromEntries(Object.entries(raw.fields || {}).map(([k, v]) => [k, fb.fromValue(v)]));
    const path = raw.name.split("/documents/")[1];
    return { ...data, _id: path.slice(path.lastIndexOf("/") + 1), _path: path };
  },
  name: (path) => `${DOCS}/${path}`,
  url: (path) => `${FS_URL}/${path.split("/").map(encodeURIComponent).join("/")}`,

  // ---- Firestore: reading and writing ----
  async getDoc(path, token) {
    try { return fb.doc(await fbHttp("GET", fb.url(path), null, token)); }
    catch (e) { if (e instanceof FirebaseError && e.status === 404) return null; throw e; }
  },
  async createDoc(collection, id, data, token) {
    return fb.doc(await fbHttp("POST", `${fb.url(collection)}?documentId=${encodeURIComponent(id)}`, { fields: fb.fields(data) }, token));
  },
  async updateDoc(path, data, token) {
    const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
    return fb.doc(await fbHttp("PATCH", `${fb.url(path)}?${mask}&currentDocument.exists=true`, { fields: fb.fields(data) }, token));
  },
  deleteDoc: (path, token) => fbHttp("DELETE", fb.url(path), null, token),
  structuredQuery(collection, filters, limit, offset) {
    const q = { from: [{ collectionId: collection }], orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }] };
    const parts = Object.entries(filters).map(([k, v]) => ({ fieldFilter: { field: { fieldPath: k }, op: "EQUAL", value: fb.toValue(v) } }));
    if (parts.length === 1) q.where = parts[0];
    else if (parts.length) q.where = { compositeFilter: { op: "AND", filters: parts } };
    if (limit) q.limit = limit;
    if (offset) q.offset = offset;
    return q;
  },
  async query(collection, filters, token, { parent = "", limit, offset } = {}) {
    const rows = await fbHttp("POST", `${parent ? fb.url(parent) : FS_URL}:runQuery`,
      { structuredQuery: fb.structuredQuery(collection, filters, limit, offset) }, token);
    return rows.filter((r) => r.document).map((r) => fb.doc(r.document));
  },
  async count(collection, filters, token, parent = "") {
    const rows = await fbHttp("POST", `${parent ? fb.url(parent) : FS_URL}:runAggregationQuery`,
      { structuredAggregationQuery: { structuredQuery: fb.structuredQuery(collection, filters), aggregations: [{ alias: "n", count: {} }] } }, token);
    for (const r of rows) if (r.result) return Number(r.result.aggregateFields.n.integerValue);
    return 0;
  },
  commit: (writes, token) => fbHttp("POST", `${FS_URL}:commit`, { writes }, token),
  writeDelete: (path) => ({ delete: fb.name(path) }),
  writeArrayChange(path, add = {}, remove = {}) {
    const transforms = [];
    for (const [field, values] of Object.entries(add)) transforms.push({ fieldPath: field, appendMissingElements: { values: values.map(fb.toValue) } });
    for (const [field, values] of Object.entries(remove)) transforms.push({ fieldPath: field, removeAllFromArray: { values: values.map(fb.toValue) } });
    return { update: { name: fb.name(path), fields: {} }, updateMask: { fieldPaths: [] }, updateTransforms: transforms, currentDocument: { exists: true } };
  },
};

/* Turn a Firebase problem into an error the screens can show. */
function fbFail(e) {
  if (!(e instanceof FirebaseError)) throw e;
  let status = { OFFLINE: 503, EMAIL_EXISTS: 409, TOO_MANY_ATTEMPTS_TRY_LATER: 429, PERMISSION_DENIED: 403, NOT_FOUND: 404 }[e.code] || 400;
  if (["EMAIL_NOT_FOUND", "INVALID_PASSWORD", "INVALID_LOGIN_CREDENTIALS"].includes(e.code)) status = 401;
  fail(status, e.message);
}
const badLogin = (e) => e instanceof FirebaseError && e.status === 400 && e.code !== "OFFLINE";

/* ======================================================================================
   Who is signed in (kept in this browser)
   ====================================================================================== */

const SESSION_KEY = "grante.session";
let session = null;
let sessionStore = null;

function readSession() {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const raw = store.getItem(SESSION_KEY);
      if (raw) { session = JSON.parse(raw); sessionStore = store; return; }
    } catch { /* storage blocked or damaged: treated as signed out */ }
  }
}
function writeSession() {
  try { sessionStore.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* still works until the tab closes */ }
}
function startSession(tokens, user, remember) {
  clearSession();
  sessionStore = remember ? localStorage : sessionStorage;   // "Keep me signed in" off = forget when the tab closes
  session = { idToken: tokens.idToken, refreshToken: tokens.refreshToken,
    idExpires: seconds() + Number(tokens.expiresIn || 3600), user };
  writeSession();
  files.useAccount(user.uid);
  try { localStorage.setItem("grante.known", "1"); } catch { /* fine */ }
}
function clearSession() {
  session = null;
  files.useAccount(null);
  agentSessions.clear();
  for (const store of [localStorage, sessionStorage]) { try { store.removeItem(SESSION_KEY); } catch { /* fine */ } }
}
const agentSessions = new Map();   // the file agent's conversations while this page is open
readSession();
if (session) files.useAccount(session.user.uid);

const publicUser = (u) => ({ username: u.username, email: u.email, display_name: u.display_name, town: u.town,
  state: u.state, country: u.country, created_at: u.created_at, email_verified: !!u.email_verified });

function requireUser() {
  if (!session) fail(401, "Please sign in.");
  return session.user;
}
function requireVerified() {
  const user = requireUser();
  if (!user.email_verified) fail(403, "Please confirm your email first.");
  return user;
}
function setUser(changes) { Object.assign(session.user, changes); writeSession(); return session.user; }

/* A Firebase sign-in token, refreshed if it's about to run out. */
async function idToken() {
  if (session.idExpires - seconds() > 300) return session.idToken;
  let fresh;
  try { fresh = await fb.refresh(session.refreshToken); }
  catch (e) {
    if (e instanceof FirebaseError && e.code === "OFFLINE") fail(503, e.message);
    clearSession();   // the sign-in was ended (password changed, account deleted...)
    fail(401, "Please sign in again.");
  }
  session.idToken = fresh.id_token; session.refreshToken = fresh.refresh_token;
  session.idExpires = seconds() + Number(fresh.expires_in || 3600);
  writeSession();
  return session.idToken;
}

/* ======================================================================================
   Accounts
   ====================================================================================== */

const SPECIAL = "!@#$%^&*()_+-=[]{};':\"\\|,.<>/?`~";
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const USERNAME_HELP = "Usernames are 3-20 lowercase letters, numbers, or underscores.";

function passwordProblems(password) {
  const p = password || "", problems = [];
  if (p.length < 10) problems.push("Use at least 10 characters.");
  if (p.length > 128) problems.push("Use 128 characters or fewer.");
  if (!/[a-z]/.test(p)) problems.push("Add a lowercase letter.");
  if (!/[A-Z]/.test(p)) problems.push("Add an uppercase letter.");
  if (!/\d/.test(p)) problems.push("Add a number.");
  if (![...p].some((ch) => SPECIAL.includes(ch))) problems.push("Add a special character, like ! @ # or $.");
  return problems;
}

const norm = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
const forumKeys = (town, state, country) => ({
  town_forum: `town:${norm(town)}|${norm(state)}|${norm(country)}`, country_forum: `country:${norm(country)}` });

function cleanPlace(value, field) {
  value = (value || "").trim().replace(/\s+/g, " ");
  if (value.length < 2 || value.length > 60) fail(422, `Please enter your ${field}.`);
  return value;
}
function cleanName(name) {
  name = (name || "").trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 40) fail(422, "Please enter your name (up to 40 characters).");
  return name;
}
function cleanEmail(email) {
  email = (email || "").trim();
  if (!EMAIL_RE.test(email) || email.length > 254) fail(422, "Please enter a valid email address.");
  return email;
}

const failures = {};   // wrong passwords, per email (Firebase also has its own limit)
function tooMany(key) {
  failures[key] = (failures[key] || []).filter((t) => seconds() - t < 600);
  return failures[key].length >= 5;
}

function profileToUser(uid, email, verified, profile) {
  return { uid, email, username: profile.username, display_name: profile.display_name, town: profile.town,
    state: profile.state, country: profile.country, created_at: profile.created_at || now(), email_verified: !!verified };
}

async function signup(body) {
  if (!body.age_ok) fail(422, "You must be 13 or older to use Grante.");
  if (!body.agree_terms) fail(422, "Please agree to the Terms of Service and Privacy Policy.");
  if (!body.agent_ack) fail(422, "Please confirm you understand what Grante can do on your computer.");
  const username = (body.username || "").trim().toLowerCase();
  if (!USERNAME_RE.test(username)) fail(422, USERNAME_HELP);
  const displayName = cleanName(body.display_name), email = cleanEmail(body.email);
  const problems = passwordProblems(body.password);
  if (problems.length) fail(422, problems.join(" "));
  const town = cleanPlace(body.town, "town or city"), state = cleanPlace(body.state, "state or region"),
    country = cleanPlace(body.country, "country");
  const profile = { username, display_name: displayName, town, state, country, created_at: now(), verified: false,
    ...forumKeys(town, state, country) };
  let tokens;
  try {
    const holder = await fb.getDoc(`usernames/${username}`);
    if (holder) {
      // Taken... unless it's held by this same person's unfinished sign-up from an earlier try.
      let mine = false;
      try { mine = (await fb.signIn(email, body.password)).localId === holder.uid; } catch { mine = false; }
      if (!mine) fail(409, "Username already in use.");
    }
    try { tokens = await fb.signUp(email, body.password); }
    catch (e) {
      if (!(e instanceof FirebaseError) || e.code !== "EMAIL_EXISTS") throw e;
      // A half-made account from an earlier try (same password, no profile yet): pick up where it left off.
      let unfinished = false;
      try {
        tokens = await fb.signIn(email, body.password);
        unfinished = (await fb.getDoc(`users/${tokens.localId}`, tokens.idToken)) === null;
      } catch { unfinished = false; }
      if (!unfinished) fail(409, "There's already an account with that email. Go back and choose \"Sign in\" instead.");
    }
    const uid = tokens.localId, token = tokens.idToken;
    let claimed = false, doing = "username";
    try {
      const mine = await fb.getDoc(`usernames/${username}`, token);
      if (!mine) { await fb.createDoc("usernames", username, { uid }, token); claimed = true; }
      else if (mine.uid !== uid) fail(409, "Username already in use.");
      doing = "profile";
      await fb.createDoc("users", uid, profile, token);
    } catch (e) {
      if (!(e instanceof FirebaseError)) throw e;
      try {   // don't leave a half-made account (or a claimed username) behind
        if (claimed) await fb.deleteDoc(`usernames/${username}`, token);
        await fb.deleteAccount(token);
      } catch { /* best effort */ }
      if (e.status === 409) fail(409, "Username already in use.");
      if (e.code === "PERMISSION_DENIED") fail(403, `Firebase refused to save your ${doing}. The newest security rules may not be published yet.`);
      throw e;
    }
  } catch (e) { fbFail(e); }
  const user = profileToUser(tokens.localId, email, false, profile);
  startSession(tokens, user, true);
  return { user: publicUser(user) };
}

async function login(body) {
  const email = (body.email || "").trim(), key = email.toLowerCase();
  if (tooMany(key)) fail(429, "Too many wrong tries. Wait 10 minutes and try again.");
  let tokens, account, profile;
  try { tokens = await fb.signIn(email, body.password); }
  catch (e) {
    if (e instanceof FirebaseError && ["EMAIL_NOT_FOUND", "INVALID_PASSWORD", "INVALID_LOGIN_CREDENTIALS", "INVALID_EMAIL"].includes(e.code)) {
      failures[key].push(seconds());
      fail(401, "That email or password isn't right.");
    }
    fbFail(e);
  }
  try {
    [account, profile] = await Promise.all([fb.lookup(tokens.idToken), fb.getDoc(`users/${tokens.localId}`, tokens.idToken)]);
  } catch (e) { fbFail(e); }
  if (!profile) fail(409, "This account's setup didn't finish. Choose \"Create an account\" and sign up again with the same email and password to finish it.");
  let verified = !!profile.verified;
  if (!verified && account.emailVerified) {   // confirmed the old way (a link): carry it over
    try { await fb.updateDoc(`users/${tokens.localId}`, { verified: true }, tokens.idToken); verified = true; } catch { /* next time */ }
  }
  const user = profileToUser(tokens.localId, account.email || email, verified, profile);
  startSession(tokens, user, !!body.remember);
  return { user: publicUser(user) };
}

/* ---- The 6-digit email code ---- */
const CODE_MINUTES = 15, CODE_TRIES = 5, RESEND_WAIT = 60;
const codeKey = (uid) => `grante.code.${uid}`;
function codeRow(uid) { try { return JSON.parse(localStorage.getItem(codeKey(uid))); } catch { return null; } }
function saveCodeRow(uid, row) {
  try { if (row) localStorage.setItem(codeKey(uid), JSON.stringify(row)); else localStorage.removeItem(codeKey(uid)); } catch { /* fine */ }
}
async function sha256(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function newCode(user) {
  const number = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  const code = String(number).padStart(6, "0");
  saveCodeRow(user.uid, { hash: await sha256(`${user.uid}:${code}`), expires: seconds() + CODE_MINUTES * 60, attempts: 0, sent: seconds() });
  const until = new Date(Date.now() + CODE_MINUTES * 60000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const name = user.display_name.split(" ")[0], e = CONFIG.emailjs;
  return { url: EMAIL_URL, body: { service_id: e.serviceId, template_id: e.templateId, user_id: e.publicKey, template_params: {
    passcode: code, code, otp: code, verification_code: code,
    email: user.email, to_email: user.email, user_email: user.email,
    name, to_name: name, user_name: name,
    time: until, minutes: String(CODE_MINUTES), app_name: "Grante", company: "NarSan", from_name: e.fromName, signature: e.signature } } };
}
async function verifyStart() {
  const user = requireUser();
  if (user.email_verified) return { mail: null };
  const row = codeRow(user.uid);
  if (row && row.expires > seconds()) return { mail: null, wait: Math.max(0, Math.floor(RESEND_WAIT - (seconds() - row.sent))) };
  return { mail: await newCode(user), wait: RESEND_WAIT };
}
async function verifyResend() {
  const user = requireUser();
  if (user.email_verified) return { mail: null };
  const row = codeRow(user.uid);
  const wait = row ? RESEND_WAIT - (seconds() - row.sent) : 0;
  if (wait > 0) fail(429, `Please wait ${Math.floor(wait) + 1} seconds before asking for another code.`);
  return { mail: await newCode(user) };
}
async function verifyCode(body) {
  const user = requireUser();
  if (user.email_verified) return { user: publicUser(user) };
  const code = String(body.code || "").replace(/\D/g, "");
  const row = codeRow(user.uid);
  if (!row || row.expires < seconds()) fail(410, "That code has run out. Press \"Send it again\" to get a new one.");
  if (row.attempts >= CODE_TRIES) fail(429, "Too many wrong tries. Press \"Send it again\" to get a new code.");
  if (code.length !== 6 || (await sha256(`${user.uid}:${code}`)) !== row.hash) {
    row.attempts += 1; saveCodeRow(user.uid, row);
    const left = CODE_TRIES - row.attempts;
    fail(422, "That code isn't right. " + (left > 0 ? `You have ${left} more ${left === 1 ? "try" : "tries"}.` : "Press \"Send it again\" to get a new code."));
  }
  try { await fb.updateDoc(`users/${user.uid}`, { verified: true }, await idToken()); } catch (e) { fbFail(e); }
  saveCodeRow(user.uid, null);
  return { user: publicUser(setUser({ email_verified: true })) };
}

async function updateProfile(body) {
  const user = requireVerified();
  const display_name = body.display_name != null ? cleanName(body.display_name) : user.display_name;
  const town = body.town != null ? cleanPlace(body.town, "town or city") : user.town;
  const state = body.state != null ? cleanPlace(body.state, "state or region") : user.state;
  const country = body.country != null ? cleanPlace(body.country, "country") : user.country;
  try { await fb.updateDoc(`users/${user.uid}`, { display_name, town, state, country, ...forumKeys(town, state, country) }, await idToken()); }
  catch (e) { fbFail(e); }
  return { user: publicUser(setUser({ display_name, town, state, country })) };
}
async function changeEmail(body) {
  const user = requireVerified();
  const email = cleanEmail(body.email);
  if (email.toLowerCase() === user.email.toLowerCase()) fail(422, "That's already your email.");
  let tokens;
  try { tokens = await fb.signIn(user.email, body.password); }   // proves it's really you
  catch (e) { if (badLogin(e)) fail(401, "Your password isn't right."); fbFail(e); }
  try { await fb.sendChangeEmail(tokens.idToken, email); } catch (e) { fbFail(e); }
  return { sent: true, email };
}
async function changePassword(body) {
  const user = requireVerified();
  const problems = passwordProblems(body.new);
  if (problems.length) fail(422, problems.join(" "));
  let tokens, fresh;
  try { tokens = await fb.signIn(user.email, body.current); }
  catch (e) { if (badLogin(e)) fail(401, "Your current password isn't right."); fbFail(e); }
  try { fresh = await fb.changePassword(tokens.idToken, body.new); } catch (e) { fbFail(e); }
  session.idToken = fresh.idToken || tokens.idToken; session.refreshToken = fresh.refreshToken || tokens.refreshToken;
  session.idExpires = seconds() + Number(fresh.expiresIn || 3600);
  writeSession();
  return { changed: true };
}
async function deleteAccount(body) {
  const user = requireUser();
  if ((body.confirm_username || "").trim().toLowerCase() !== user.username.toLowerCase()) fail(422, "Type your username exactly to confirm.");
  let tokens;
  try { tokens = await fb.signIn(user.email, body.password); }
  catch (e) { if (badLogin(e)) fail(401, "That password isn't right."); fbFail(e); }
  const token = tokens.idToken;
  try {
    for (const post of await fb.query("posts", { uid: user.uid }, token, { limit: 500 })) await deletePostAndReplies(post._id, token);
    for (const path of [`usernames/${user.username.toLowerCase()}`, `users/${user.uid}`]) {
      try { await fb.deleteDoc(path, token); } catch (e) { if (e instanceof FirebaseError && e.code === "OFFLINE") throw e; }
    }
    await fb.deleteAccount(token);
  } catch (e) { fbFail(e); }
  try { localStorage.removeItem(chatsKey(user.uid)); localStorage.removeItem(codeKey(user.uid)); } catch { /* fine */ }
  clearSession();
  return { deleted: true };
}

/* ======================================================================================
   The forum
   ====================================================================================== */

const SCOPES = ["town", "country", "global"];
const PAGE_SIZE = 20, TOP_POOL = 100;
const ID_RE = /^[0-9a-f]{21}$/;
const lastPost = {};

const forumFor = (user, scope) => (scope === "global" ? "global" : forumKeys(user.town, user.state, user.country)[`${scope}_forum`]);
const labelFor = (user, scope) => ({ town: user.town, country: user.country, global: "Everyone" }[scope]);
const canSee = (user, post) => ["global", ...Object.values(forumKeys(user.town, user.state, user.country))].includes(post.forum);
function checkScope(scope) { if (!SCOPES.includes(scope)) fail(404, "That forum doesn't exist."); }
function slowDown(uid, kind = "post", wait = 15) {
  const key = `${uid}:${kind}`, last = lastPost[key] || 0;
  if (seconds() - last < wait) fail(429, `You're posting fast! Wait ${Math.floor(wait - (seconds() - last)) + 1} seconds.`);
  lastPost[key] = seconds();
}
function cleanText(text, low, high, what) {
  text = (text || "").trim().replace(/\n{3,}/g, "\n\n");
  if (text.length < low || text.length > high) fail(422, `${what} must be ${low}-${high} characters.`);
  return text;
}
/* IDs that sort by time, so no extra database index is needed. Posts: newest first. Replies: oldest first. */
function newId(newestFirst) {
  const ms = Date.now();
  const rand = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return String(newestFirst ? 1e13 - ms : ms).padStart(13, "0") + rand;
}
function votes(doc, uid) {
  const likes = doc.liked_by || [], dislikes = doc.disliked_by || [];
  return { likes: likes.length, dislikes: dislikes.length, my_vote: likes.includes(uid) ? 1 : dislikes.includes(uid) ? -1 : 0 };
}
function postJson(doc, user, replyCount = 0, full = false) {
  return { id: doc._id, scope: doc.scope, title: doc.title,
    body: full ? doc.body : doc.body.slice(0, 220) + (doc.body.length > 220 ? "…" : ""),
    author: doc.author, author_name: doc.author_name, created_at: doc.created_at,
    reply_count: replyCount, ...votes(doc, user.uid), mine: doc.uid === user.uid };
}
async function fetchPost(id, user, token) {
  if (!ID_RE.test(id)) fail(404, "That post doesn't exist.");
  const doc = await fb.getDoc(`posts/${id}`, token);
  if (!doc || !canSee(user, doc)) fail(404, "That post doesn't exist or isn't in your forums.");
  return doc;
}
async function replyCount(id, token) {
  try { return await fb.count("replies", { deleted: false }, token, `posts/${id}`); } catch { return 0; }
}
async function deletePostAndReplies(id, token) {
  const replies = await fb.query("replies", {}, token, { parent: `posts/${id}`, limit: 500 });
  const writes = [...replies.map((r) => fb.writeDelete(r._path)), fb.writeDelete(`posts/${id}`)];
  for (let i = 0; i < writes.length; i += 400) await fb.commit(writes.slice(i, i + 400), token);
}

async function listPosts(scope, q) {
  const user = requireVerified();
  checkScope(scope);
  const page = Math.max(1, Number(q.get("page")) || 1), token = await idToken();
  try {
    let docs, hasMore;
    if (q.get("sort") === "top") {
      docs = await fb.query("posts", { forum: forumFor(user, scope) }, token, { limit: TOP_POOL });
      docs.sort((a, b) => ((a.disliked_by || []).length - (a.liked_by || []).length) - ((b.disliked_by || []).length - (b.liked_by || []).length));
      hasMore = docs.length > page * PAGE_SIZE;
      docs = docs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    } else {
      docs = await fb.query("posts", { forum: forumFor(user, scope) }, token, { limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE });
      hasMore = docs.length > PAGE_SIZE;
      docs = docs.slice(0, PAGE_SIZE);
    }
    const counts = await Promise.all(docs.map((d) => replyCount(d._id, token)));
    return { label: labelFor(user, scope), has_more: hasMore, posts: docs.map((d, i) => postJson(d, user, counts[i])) };
  } catch (e) { fbFail(e); }
}
async function createPost(scope, body) {
  const user = requireVerified();
  checkScope(scope);
  const title = cleanText(body.title, 3, 120, "Titles"), text = cleanText(body.body, 1, 5000, "Posts");
  slowDown(user.uid);
  try {
    const doc = await fb.createDoc("posts", newId(true), { uid: user.uid, author: user.username, author_name: user.display_name,
      forum: forumFor(user, scope), scope, title, body: text, created_at: now(), liked_by: [], disliked_by: [] }, await idToken());
    return postJson(doc, user, 0, true);
  } catch (e) { fbFail(e); }
}
async function getPost(id) {
  const user = requireVerified(), token = await idToken();
  let post, rows;
  try {
    post = await fetchPost(id, user, token);
    rows = await fb.query("replies", {}, token, { parent: `posts/${id}`, limit: 500 });
  } catch (e) { fbFail(e); }
  const replies = rows.map((r) => ({ id: r._id, parent_id: r.parent_id ?? null, body: r.deleted ? "" : r.body, deleted: !!r.deleted,
    author: r.deleted ? null : r.author, author_name: r.deleted ? null : r.author_name, created_at: r.created_at,
    ...votes(r, user.uid), mine: r.uid === user.uid && !r.deleted }));
  return { post: postJson(post, user, replies.filter((r) => !r.deleted).length, true), replies };
}
async function createReply(id, body) {
  const user = requireVerified();
  const text = cleanText(body.body, 1, 2000, "Replies"), token = await idToken(), parent = body.parent_id ?? null;
  try {
    await fetchPost(id, user, token);
    if (parent !== null && (!ID_RE.test(parent) || !(await fb.getDoc(`posts/${id}/replies/${parent}`, token)))) {
      fail(404, "The reply you're answering doesn't exist.");
    }
    slowDown(user.uid, "reply", 5);
    await fb.createDoc(`posts/${id}/replies`, newId(false), { uid: user.uid, author: user.username, author_name: user.display_name,
      parent_id: parent, body: text, deleted: false, created_at: now(), liked_by: [], disliked_by: [] }, token);
  } catch (e) { fbFail(e); }
  return getPost(id);
}
async function vote(body) {
  const user = requireVerified();
  if (!["post", "reply"].includes(body.target_type) || ![-1, 0, 1].includes(body.value)) fail(422, "That vote doesn't make sense.");
  const token = await idToken(), uid = user.uid;
  let doc;
  try {
    await fetchPost(body.post_id, user, token);
    let path = `posts/${body.post_id}`;
    if (body.target_type === "reply") {
      if (!body.reply_id || !ID_RE.test(body.reply_id)) fail(404, "That reply doesn't exist.");
      path += `/replies/${body.reply_id}`;
    }
    const add = {}, remove = {};
    (body.value === 1 ? add : remove).liked_by = [uid];
    (body.value === -1 ? add : remove).disliked_by = [uid];
    await fb.commit([fb.writeArrayChange(path, add, remove)], token);
    doc = await fb.getDoc(path, token);
  } catch (e) { fbFail(e); }
  if (!doc) fail(404, "That doesn't exist anymore.");
  return votes(doc, uid);
}
async function deletePost(id) {
  const user = requireVerified(), token = await idToken();
  try {
    const post = await fetchPost(id, user, token);
    if (post.uid !== user.uid) fail(403, "You can only delete your own posts.");
    await deletePostAndReplies(id, token);
  } catch (e) { fbFail(e); }
  return { deleted: id };
}
async function deleteReply(postId, replyId) {
  const user = requireVerified(), token = await idToken();
  try {
    await fetchPost(postId, user, token);
    const path = `posts/${postId}/replies/${replyId}`;
    const row = ID_RE.test(replyId) ? await fb.getDoc(path, token) : null;
    if (!row || row.uid !== user.uid || row.deleted) fail(404, "You can only delete your own replies.");
    await fb.updateDoc(path, { deleted: true, body: "" }, token);   // keeps a "[deleted]" placeholder
  } catch (e) { fbFail(e); }
  return { deleted: replyId };
}
async function report(body) {
  const user = requireVerified();
  if (!["post", "reply"].includes(body.target_type)) fail(422, "You can report posts and replies.");
  const reason = cleanText(body.reason, 3, 500, "Reasons");
  try {
    await fb.createDoc("reports", newId(true), { uid: user.uid, target_type: body.target_type, post_id: body.post_id,
      reply_id: body.reply_id ?? null, reason, created_at: now() }, await idToken());
  } catch (e) { fbFail(e); }
  return { reported: true };
}

/* ======================================================================================
   Checking that a town is real
   ====================================================================================== */

const CODES = { "Afghanistan": "AF", "Albania": "AL", "Algeria": "DZ", "Andorra": "AD", "Angola": "AO", "Antigua and Barbuda": "AG",
  "Argentina": "AR", "Armenia": "AM", "Australia": "AU", "Austria": "AT", "Azerbaijan": "AZ", "Bahamas": "BS", "Bahrain": "BH",
  "Bangladesh": "BD", "Barbados": "BB", "Belarus": "BY", "Belgium": "BE", "Belize": "BZ", "Benin": "BJ", "Bhutan": "BT", "Bolivia": "BO",
  "Bosnia and Herzegovina": "BA", "Botswana": "BW", "Brazil": "BR", "Brunei": "BN", "Bulgaria": "BG", "Burkina Faso": "BF", "Burundi": "BI",
  "Cambodia": "KH", "Cameroon": "CM", "Canada": "CA", "Cape Verde": "CV", "Central African Republic": "CF", "Chad": "TD", "Chile": "CL",
  "China": "CN", "Colombia": "CO", "Comoros": "KM", "Costa Rica": "CR", "Croatia": "HR", "Cuba": "CU", "Cyprus": "CY", "Czechia": "CZ",
  "Democratic Republic of the Congo": "CD", "Denmark": "DK", "Djibouti": "DJ", "Dominica": "DM", "Dominican Republic": "DO", "Ecuador": "EC",
  "Egypt": "EG", "El Salvador": "SV", "Equatorial Guinea": "GQ", "Eritrea": "ER", "Estonia": "EE", "Eswatini": "SZ", "Ethiopia": "ET",
  "Fiji": "FJ", "Finland": "FI", "France": "FR", "Gabon": "GA", "Gambia": "GM", "Georgia": "GE", "Germany": "DE", "Ghana": "GH", "Greece": "GR",
  "Grenada": "GD", "Guatemala": "GT", "Guinea": "GN", "Guinea-Bissau": "GW", "Guyana": "GY", "Haiti": "HT", "Honduras": "HN", "Hungary": "HU",
  "Iceland": "IS", "India": "IN", "Indonesia": "ID", "Iran": "IR", "Iraq": "IQ", "Ireland": "IE", "Israel": "IL", "Italy": "IT",
  "Ivory Coast": "CI", "Jamaica": "JM", "Japan": "JP", "Jordan": "JO", "Kazakhstan": "KZ", "Kenya": "KE", "Kiribati": "KI", "Kosovo": "XK",
  "Kuwait": "KW", "Kyrgyzstan": "KG", "Laos": "LA", "Latvia": "LV", "Lebanon": "LB", "Lesotho": "LS", "Liberia": "LR", "Libya": "LY",
  "Liechtenstein": "LI", "Lithuania": "LT", "Luxembourg": "LU", "Madagascar": "MG", "Malawi": "MW", "Malaysia": "MY", "Maldives": "MV",
  "Mali": "ML", "Malta": "MT", "Marshall Islands": "MH", "Mauritania": "MR", "Mauritius": "MU", "Mexico": "MX", "Micronesia": "FM",
  "Moldova": "MD", "Monaco": "MC", "Mongolia": "MN", "Montenegro": "ME", "Morocco": "MA", "Mozambique": "MZ", "Myanmar": "MM", "Namibia": "NA",
  "Nauru": "NR", "Nepal": "NP", "Netherlands": "NL", "New Zealand": "NZ", "Nicaragua": "NI", "Niger": "NE", "Nigeria": "NG", "North Korea": "KP",
  "North Macedonia": "MK", "Norway": "NO", "Oman": "OM", "Pakistan": "PK", "Palau": "PW", "Palestine": "PS", "Panama": "PA",
  "Papua New Guinea": "PG", "Paraguay": "PY", "Peru": "PE", "Philippines": "PH", "Poland": "PL", "Portugal": "PT", "Qatar": "QA",
  "Republic of the Congo": "CG", "Romania": "RO", "Russia": "RU", "Rwanda": "RW", "Saint Kitts and Nevis": "KN", "Saint Lucia": "LC",
  "Saint Vincent and the Grenadines": "VC", "Samoa": "WS", "San Marino": "SM", "Sao Tome and Principe": "ST", "Saudi Arabia": "SA",
  "Senegal": "SN", "Serbia": "RS", "Seychelles": "SC", "Sierra Leone": "SL", "Singapore": "SG", "Slovakia": "SK", "Slovenia": "SI",
  "Solomon Islands": "SB", "Somalia": "SO", "South Africa": "ZA", "South Korea": "KR", "South Sudan": "SS", "Spain": "ES", "Sri Lanka": "LK",
  "Sudan": "SD", "Suriname": "SR", "Sweden": "SE", "Switzerland": "CH", "Syria": "SY", "Taiwan": "TW", "Tajikistan": "TJ", "Tanzania": "TZ",
  "Thailand": "TH", "Timor-Leste": "TL", "Togo": "TG", "Tonga": "TO", "Trinidad and Tobago": "TT", "Tunisia": "TN", "Turkey": "TR",
  "Turkmenistan": "TM", "Tuvalu": "TV", "Uganda": "UG", "Ukraine": "UA", "United Arab Emirates": "AE", "United Kingdom": "GB",
  "United States": "US", "Uruguay": "UY", "Uzbekistan": "UZ", "Vanuatu": "VU", "Vatican City": "VA", "Venezuela": "VE", "Vietnam": "VN",
  "Yemen": "YE", "Zambia": "ZM", "Zimbabwe": "ZW" };
const STATE_ALIASES = { "washington, d.c.": "district of columbia", "washington d.c.": "district of columbia",
  "mexico": "mexico state", "estado de mexico": "mexico state", "ciudad de mexico": "mexico city" };
const townCache = new Map();

const plain = (text) => (text || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/\bst\.?\s/g, "saint ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const plainState = (text) => { const p = plain(text); return STATE_ALIASES[(text || "").trim().toLowerCase()] || STATE_ALIASES[p] || p; };
/* How alike two names are, 0 to 1 (so "Freemont" still suggests "Fremont"). */
function alike(a, b) {
  if (a === b) return 1;
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return 1 - rows[a.length][b.length] / Math.max(a.length, b.length, 1);
}
async function townLookup(q) {
  const name = (q.get("name") || "").trim().replace(/\s+/g, " ");
  const state = (q.get("state") || "").trim(), country = (q.get("country") || "United States").trim();
  if (name.length < 2 || name.length > 60) fail(422, "Please enter your town or city.");
  const code = country === "United States" && state === "Puerto Rico" ? "PR" : CODES[country];
  const unchecked = { checked: false, matches: [], others: [] };
  if (!code) return unchecked;
  const key = `${plain(name)}|${code}`;
  let raw = townCache.get(key);
  if (!raw) {
    try {
      const params = new URLSearchParams({ name, count: "50", language: "en", format: "json", countryCode: code });
      const res = await fetch(via(`${PLACES_URL}?${params}`));
      if (!res.ok) return unchecked;
      raw = (await res.json()).results || [];
      townCache.set(key, raw);
    } catch { return unchecked; }
  }
  const wantName = plain(name), wantState = plainState(state), seen = new Set(), towns = [];
  for (const r of raw) {
    if (!String(r.feature_code || "").startsWith("PPL")) continue;   // towns and cities only
    const rState = code === "PR" ? "Puerto Rico" : (r.admin1 || "");
    const exact = plain(r.name) === wantName;
    if (!exact && alike(plain(r.name), wantName) < 0.8) continue;      // matched on an old or alternate name
    const id = `${plain(r.name)}|${plainState(rState)}|${plain(r.admin2 || "")}`;
    if (seen.has(id)) continue;
    seen.add(id);
    towns.push({ name: r.name || "", state: rState, county: r.admin2 || "", population: Number(r.population) || 0, country,
      in_state: plainState(rState) === wantState || code === "PR", exact });
  }
  const rank = (t) => [!(t.exact && t.in_state), !t.exact, !t.in_state].map(Number).join("") ;
  towns.sort((a, b) => rank(a).localeCompare(rank(b)) || b.population - a.population);
  return { checked: true, matches: towns.filter((t) => t.exact && t.in_state).slice(0, 6),
    others: towns.filter((t) => !(t.exact && t.in_state)).slice(0, 6) };
}

/* ======================================================================================
   Ask Grante AI (the model runs on your Hugging Face Space; chats are saved in this browser)
   ====================================================================================== */

const chatsKey = (uid) => `grante.chats.${uid}`;
function loadChats(uid) { try { return JSON.parse(localStorage.getItem(chatsKey(uid))) || {}; } catch { return {}; } }
function saveChats(uid, chats) {
  const ids = Object.keys(chats).sort((a, b) => (chats[a].updated < chats[b].updated ? 1 : -1));
  for (const old of ids.slice(60)) delete chats[old];   // keep the newest 60 so the browser's storage doesn't fill up
  try { localStorage.setItem(chatsKey(uid), JSON.stringify(chats)); } catch { /* storage full or blocked: this chat just isn't kept */ }
}
const newChatId = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, "0")).join("");

async function askSpace(messages, token) {
  if (!/^https?:\/\//.test(SPACE)) fail(503, "Grante's AI isn't connected to the website yet.");
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 240000);
  let res;
  try {
    res = await fetch(via(`${SPACE}/chat`), { method: "POST", signal: stop.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ messages }) });
  } catch {
    fail(503, "Grante's AI isn't answering right now. If nobody has used it for a while it goes to sleep and takes a minute or two to wake up, so please try again shortly.");
  } finally { clearTimeout(timer); }
  const data = await res.json().catch(() => ({}));
  if (res.ok && typeof data.reply === "string") return data.reply;
  const said = typeof data.detail === "string" ? data.detail : "";
  if (res.status === 401) fail(401, "Please sign in again.");
  if (res.status === 429) fail(429, said || "You're asking fast! Wait a moment and try again.");
  fail(503, said || "Grante's AI is waking up. Please try again in a minute.");
}

async function chat(body) {
  const user = requireVerified();
  const message = (body.message || "").trim();
  if (message.length < 1 || message.length > 8000) fail(422, "Messages must be 1-8000 characters.");
  const chats = loadChats(user.uid);
  const saved = body.chat_id ? chats[body.chat_id] : null;
  const id = saved ? saved.id : newChatId();
  const messages = saved ? saved.messages : [];
  messages.push({ role: "user", content: message });
  const reply = (await askSpace(messages.slice(-12), await idToken())).trim();
  messages.push({ role: "assistant", content: reply });
  const again = loadChats(user.uid);   // re-read, in case another tab saved something meanwhile
  again[id] = { id, kind: "chat", title: saved ? saved.title : message.slice(0, 60), updated: now(), messages };
  saveChats(user.uid, again);
  return { chat_id: id, reply };
}
function listChats(kind) {
  const user = requireVerified();
  return Object.values(loadChats(user.uid)).filter((c) => !kind || c.kind === kind).sort((a, b) => (a.updated < b.updated ? 1 : -1))
    .map(({ id, kind, title, updated }) => ({ id, kind, title, updated }));
}
function oneChat(id) {
  const user = requireVerified(), chats = loadChats(user.uid);
  if (!chats[id]) fail(404, "Chat not found.");
  return { user, chats, chat: chats[id] };
}

/* ======================================================================================
   The file agent (Chrome and Edge on a computer): the AI picks a tool, files.js does it
   ====================================================================================== */

const MAX_AGENT_STEPS = 6;
const ACTION_WORDS = ["move", "delete", "remove", "trash", "rename", "sort", "organize", "open", "create", "make",
  "list", "find", "put", "show", "folder", "file"];
const NUDGE = "(Reminder: to actually do this, you must call a tool. Reply with the tool call now. If no tool fits, say so honestly.)";
const LOCATIONS = ["Downloads", "Desktop", "Documents", "Pictures", "Music", "Movies"];
const DEFAULT_ASK = ["delete_file"];

const store = (name) => `grante.${name}.${session.user.uid}`;
function readList(name) { try { return JSON.parse(localStorage.getItem(store(name))) || []; } catch { return []; } }
function writeList(name, list, keep = 300) { try { localStorage.setItem(store(name), JSON.stringify(list.slice(0, keep))); } catch { /* fine */ } }
const askBefore = () => { try { return JSON.parse(localStorage.getItem(store("ask"))) || DEFAULT_ASK; } catch { return DEFAULT_ASK; } };

function agentPrompt() {
  const names = files.shared();
  return "You are Grante, NarSan's assistant. You can manage files and folders in the folders the user shared with you"
    + (names.length ? `: ${names.join(", ")}. Paths start with one of those folder names, like "${names[0]}/notes.txt"; a plain file name is searched for automatically. `
      : ". No folders are shared yet: call the tool anyway, and Grante will ask the user for the folder. ")
    + "When the user asks you to do something, call the right tool right away. Use file and folder names exactly as the user wrote them. "
    + "If the user says where (like Downloads or Desktop), always include that location in the tool call. "
    + "Never say you did something unless a tool result confirms it, and describe it exactly as the tool result says. "
    + "After the tools finish, tell the user what happened in one or two short sentences.";
}

async function askSpaceAgent(messages) {
  if (!/^https?:\/\//.test(SPACE)) fail(503, "Grante's AI isn't connected to the website yet.");
  const token = await idToken();
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 240000);
  let res;
  try {
    res = await fetch(via(`${SPACE}/agent`), { method: "POST", signal: stop.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages, tools: files.TOOL_SCHEMAS }) });
  } catch {
    fail(503, "Grante's AI isn't answering right now. If nobody has used it for a while it goes to sleep and takes a minute or two to wake up, so please try again shortly.");
  } finally { clearTimeout(timer); }
  const data = await res.json().catch(() => ({}));
  if (res.ok && typeof data.reply === "string") return data.reply;
  const said = typeof data.detail === "string" ? data.detail : "";
  if (res.status === 401) fail(401, "Please sign in again.");
  if (res.status === 429) fail(429, said || "You're asking fast! Wait a moment and try again.");
  fail(503, said || "Grante's AI is waking up. Please try again in a minute.");
}

function agentSession(id) {
  if (id && agentSessions.has(id)) return agentSessions.get(id);
  const s = { id: newChatId(), messages: [{ role: "system", content: agentPrompt() }], queue: [], pending: null, choice: null,
    needFolder: null, asked: new Set(), actions: [], focus: null, requestId: null };
  agentSessions.set(s.id, s);
  return s;
}

function saveRequest(s, reply, done) {
  const list = readList("requests");
  const row = list.find((r) => r.id === s.requestId);
  if (!row) return;
  row.actions = s.actions; row.status = done ? "done" : "working";
  if (reply) row.reply = reply;
  writeList("requests", list);
}

async function agentResponse(s, status, reply = null, error = null) {
  if (s.requestId) saveRequest(s, reply, status === "done");
  const body = { session_id: s.id, status, reply, actions: s.actions, tree: await files.tree(s.focus) };
  if (s.pending) body.approval = { tool: s.pending.name, arguments: s.pending.arguments, description: files.describe(s.pending.name, s.pending.arguments) };
  if (s.choice) body.choice = s.choice;
  if (s.needFolder) body.need_folder = s.needFolder;
  if (error) body.error = error;
  return body;
}

async function execute(s, call) {
  const focus = await files.focusFor(call.name, call.arguments);
  const [ok, result] = await files.runTool(call.name, call.arguments);
  if (ok && !files.READ_ONLY.has(call.name) && focus) s.focus = focus;
  s.actions.push({ action: files.describe(call.name, call.arguments), success: ok, result });
  s.messages.push({ role: "tool", content: result });
  if (ok && !files.READ_ONLY.has(call.name)) {
    const list = readList("activity");
    list.unshift({ time: now(), kind: call.name, text: result.split("\n")[0].split(". ")[0].replace(/[.:]+$/, "") + "." });
    writeList("activity", list, 200);
  }
}

function fillMissingLocation(call, s) {
  if (call.name !== "create_folder") return;
  const a = call.arguments;
  if (!["", ".", undefined, null].includes(a.inside) || String(a.name || "").includes("/")) return;
  const lastUser = [...s.messages].reverse().find((m) => m.role === "user")?.content || "";
  const said = [...files.shared(), ...LOCATIONS].filter((loc, i, all) => all.indexOf(loc) === i && new RegExp(`\\b${loc}\\b`, "i").test(lastUser));
  if (said.length === 1 && said[0].toLowerCase() !== String(a.name || "").toLowerCase()) a.inside = said[0];
}

async function agentContinue(s) {
  let steps = 0;
  for (;;) {
    while (s.queue.length) {
      const call = s.queue[0];
      const said = [...s.messages].reverse().find((m) => m.role === "user")?.content || "";
      const need = await files.missingFolder(call.name, call.arguments, said, s.asked);
      if (need) { s.needFolder = need; return agentResponse(s, "needs_folder"); }
      const question = await files.checkAmbiguity(call.name, call.arguments);
      if (question) { s.choice = question; return agentResponse(s, "needs_choice"); }
      const blocked = files.READ_ONLY.has(call.name) ? null : await files.blockedReason(call.name, call.arguments);
      if (!blocked && !files.READ_ONLY.has(call.name) && askBefore().includes(call.name)) { s.pending = call; return agentResponse(s, "needs_approval"); }
      s.queue.shift();
      await execute(s, call);
    }
    if (steps >= MAX_AGENT_STEPS) return agentFinish(s, "I stopped after a few steps to be safe. Want me to keep going?");
    s.messages[0] = { role: "system", content: agentPrompt() };
    let reply = await askSpaceAgent(s.messages);
    steps++;
    let calls = files.parseToolCalls(reply);
    const lastUser = [...s.messages].reverse().find((m) => m.role === "user")?.content.toLowerCase() || "";
    if (!calls.length && !s.actions.length && ACTION_WORDS.some((w) => lastUser.includes(w))) {
      reply = await askSpaceAgent([...s.messages, { role: "user", content: NUDGE }]);   // remind it once to use a tool
      calls = files.parseToolCalls(reply);
    }
    s.messages.push({ role: "assistant", content: reply });
    for (const c of calls) fillMissingLocation(c, s);
    if (!calls.length) return agentFinish(s, reply.replace(/<tool_call>[\s\S]*?(<\/tool_call>|$)/g, "").trim() || "Done!");
    s.queue = calls;
  }
}

function agentFinish(s, reply) {
  const chats = loadChats(session.user.uid);
  const first = s.messages.find((m) => m.role === "user")?.content || "File task";
  chats[s.id] = { id: s.id, kind: "agent", title: chats[s.id]?.title || first.slice(0, 60), updated: now(), messages: s.messages };
  saveChats(session.user.uid, chats);
  return agentResponse(s, "done", reply);
}

async function agentSend(body) {
  requireVerified();
  if (!files.supported) fail(400, "Grante's file tools work in Chrome or Edge on a computer.");
  await files.whenReady();
  const message = (body.message || "").trim();
  if (message.length < 1 || message.length > 2000) fail(422, "Requests must be 1-2000 characters.");
  const s = agentSession(body.session_id);
  if (s.pending) return agentResponse(s, "needs_approval", null, "Please approve or decline the waiting action first.");
  if (s.choice) return agentResponse(s, "needs_choice", null, "Please pick one of the options first.");
  if (s.needFolder) return agentResponse(s, "needs_folder", null, "Please choose the folder or press Cancel first.");
  s.actions = []; s.focus = null;
  s.requestId = newChatId();
  const list = readList("requests");
  list.unshift({ id: s.requestId, session_id: s.id, time: now(), text: message, status: "working", actions: [], reply: null });
  writeList("requests", list);
  s.messages.push({ role: "user", content: message });
  return agentContinue(s);
}

async function agentDecide(id, body) {
  requireVerified(); await files.whenReady();
  const s = agentSessions.get(id);
  if (!s || !s.pending) return s ? agentResponse(s, "done", null, "There's nothing waiting for approval.") : fail(404, "That task has ended. Start a new one.");
  const call = s.pending;
  s.pending = null; s.queue.shift();
  if (body.approve) await execute(s, call);
  else {
    s.actions.push({ action: files.describe(call.name, call.arguments), success: false, result: "Declined by you." });
    s.messages.push({ role: "tool", content: "The user declined this action, so it was not done." });
  }
  return agentContinue(s);
}

async function agentChoose(id, body) {
  requireVerified(); await files.whenReady();
  const s = agentSessions.get(id);
  if (!s || !s.choice) return s ? agentResponse(s, "done", null, "There's nothing to choose right now.") : fail(404, "That task has ended. Start a new one.");
  const choice = s.choice, call = s.queue[0];
  s.choice = null;
  const index = Number(body.index);
  if (!(index >= 0 && index < choice.options.length)) {
    s.queue.shift();
    s.actions.push({ action: choice.action, success: false, result: "Cancelled by you." });
    s.messages.push({ role: "tool", content: "The user cancelled this action, so it was not done." });
  } else {
    call.arguments[choice.arg] = choice.options[index].path;   // now it's exact
  }
  return agentContinue(s);
}

/* The person chose a folder for Grante (or cancelled), so carry on. */
async function agentFolder(id, body) {
  requireVerified(); await files.whenReady();
  const s = agentSessions.get(id);
  if (!s || !s.needFolder) return s ? agentResponse(s, "done", null, "Grante isn't waiting for a folder.") : fail(404, "That task has ended. Start a new one.");
  const need = s.needFolder;
  s.needFolder = null;
  s.asked.add(need.key);   // don't ask about the same folder twice in one task
  if (!body.granted) {
    const call = s.queue.shift();
    s.actions.push({ action: files.describe(call.name, call.arguments), success: false, result: "Cancelled: no folder was shared." });
    s.messages.push({ role: "tool", content: "The user didn't share that folder, so nothing was done." });
    s.queue = [];
    return agentFinish(s, "Okay, I left it. Ask again any time.");
  }
  return agentContinue(s);
}

/* ======================================================================================
   Matching each request to the code above
   ====================================================================================== */


export async function handle(method, path, body = {}) {
  const url = new URL(path, "http://grante.local");
  const p = url.pathname, q = url.searchParams, seg = p.split("/").filter(Boolean);
  const is = (m, route) => method === m && p === route;

  // ---- accounts ----
  if (is("GET", "/auth/status")) {
    let known = false;
    try { known = localStorage.getItem("grante.known") === "1"; } catch { /* fine */ }
    return { signed_in: !!session, users_exist: known || !!session, user: session ? publicUser(session.user) : null };
  }
  if (is("POST", "/auth/check-password")) return { problems: passwordProblems(body.password) };
  if (is("GET", "/auth/username-available")) {
    const username = (q.get("username") || "").trim().toLowerCase();
    if (!USERNAME_RE.test(username)) return { available: false, reason: USERNAME_HELP };
    let taken;
    try { taken = (await fb.getDoc(`usernames/${username}`)) !== null; } catch (e) { fbFail(e); }
    return { available: !taken, reason: taken ? "Username already in use." : "" };
  }
  if (is("POST", "/auth/signup")) return signup(body);
  if (is("POST", "/auth/login")) return login(body);
  if (is("POST", "/auth/logout")) { clearSession(); return { signed_out: true }; }
  if (is("GET", "/auth/me")) return { user: publicUser(requireUser()) };
  if (is("POST", "/auth/verify/start")) return verifyStart();
  if (is("POST", "/auth/verify/resend")) return verifyResend();
  if (is("POST", "/auth/verify/code")) return verifyCode(body);
  if (is("POST", "/auth/verify/failed")) { saveCodeRow(requireUser().uid, null); return { cleared: true }; }
  if (is("POST", "/auth/password/reset")) {
    const email = cleanEmail(body.email);
    try { await fb.sendPasswordReset(email); }
    catch (e) {
      if (e instanceof FirebaseError && ["OFFLINE", "TOO_MANY_ATTEMPTS_TRY_LATER", "OPERATION_NOT_ALLOWED", "CONFIGURATION_NOT_FOUND"].includes(e.code)) fbFail(e);
      // Otherwise say nothing: we don't reveal whether an email has an account.
    }
    return { sent: true };
  }
  if (is("PATCH", "/account")) return updateProfile(body);
  if (is("POST", "/account/email")) return changeEmail(body);
  if (is("POST", "/account/password")) return changePassword(body);
  if (is("POST", "/account/delete")) return deleteAccount(body);

  // ---- forum ----
  if (is("GET", "/forum")) { const user = requireVerified(); return SCOPES.map((scope) => ({ scope, label: labelFor(user, scope) })); }
  if (is("POST", "/forum/vote")) return vote(body);
  if (is("POST", "/forum/report")) return report(body);
  if (seg[0] === "forum" && seg[1] === "posts" && seg.length === 3) {
    if (method === "GET") return getPost(seg[2]);
    if (method === "DELETE") return deletePost(seg[2]);
  }
  if (seg[0] === "forum" && seg[1] === "posts" && seg[3] === "replies") {
    if (method === "POST" && seg.length === 4) return createReply(seg[2], body);
    if (method === "DELETE" && seg.length === 5) return deleteReply(seg[2], seg[4]);
  }
  if (seg[0] === "forum" && seg[2] === "posts" && seg.length === 3) {
    if (method === "GET") return listPosts(seg[1], q);
    if (method === "POST") return createPost(seg[1], body);
  }

  // ---- places ----
  if (is("GET", "/places/town")) return townLookup(q);

  // ---- chat ----
  if (is("POST", "/chat")) return chat(body);
  if (is("GET", "/chats")) return listChats(q.get("kind"));
  if (seg[0] === "chats" && seg.length === 2) {
    const { user, chats, chat: c } = oneChat(seg[1]);
    if (method === "GET") return { ...c, messages: c.messages.filter((m) => ["user", "assistant"].includes(m.role)) };
    if (method === "PATCH") {
      const title = (body.title || "").trim().slice(0, 80);
      if (!title) fail(404, "Chat not found.");
      c.title = title; saveChats(user.uid, chats);
      return { id: c.id, title };
    }
    if (method === "DELETE") { delete chats[c.id]; saveChats(user.uid, chats); return { deleted: c.id }; }
  }

  // ---- the file agent ----
  if (is("POST", "/agent")) return agentSend(body);
  if (seg[0] === "agent" && seg.length === 3 && method === "POST") {
    if (seg[2] === "decision") return agentDecide(seg[1], body);
    if (seg[2] === "choice") return agentChoose(seg[1], body);
    if (seg[2] === "folder") return agentFolder(seg[1], body);
  }
  if (is("GET", "/files/tree")) { requireVerified(); await files.whenReady(); return { workspace: "Your folders", tree: await files.tree() }; }
  if (is("GET", "/home")) {
    const user = requireVerified();
    return { greeting: `Hey, ${user.display_name.split(" ")[0]}!`, subtitle: "What should we do?", recent_activity: readList("activity").slice(0, 5) };
  }
  if (is("GET", "/activity")) { requireVerified(); return readList("activity").slice(0, Math.min(500, Number(q.get("limit")) || 50)); }
  if (is("GET", "/requests")) { requireVerified(); return readList("requests").slice(0, Math.min(500, Number(q.get("limit")) || 200)); }
  if (is("GET", "/settings")) { requireVerified(); return { ask_before: askBefore(), workspace: "Your folders" }; }
  if (is("POST", "/settings")) {
    requireVerified();
    const ask = (body.ask_before || []).filter((t) => files.TOOLS[t]);
    try { localStorage.setItem(store("ask"), JSON.stringify(ask)); } catch { /* fine */ }
    return { ask_before: ask, workspace: "Your folders" };
  }

  fail(404, "Grante doesn't know how to do that here.");
}
