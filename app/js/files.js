/* Grante's file tools, for the WEBSITE version (Chrome and Edge on a computer).

   A website can only touch folders the person has chosen and allowed. Each chosen folder
   becomes a "top folder" named after it, like "Downloads", and every path starts with one:
   "Downloads/School/notes.txt".

   Safety rules (same spirit as the desktop app):
     - Only folders the person added, and nothing on their "Keep Grante out" list.
     - "Delete" moves things into a folder called "Grante Trash" inside that top folder,
       because a website can't use the computer's Trash. Nothing is ever destroyed.
     - Nothing is ever overwritten.
     - Changes wait for the person's OK (that part lives in the agent, in backend.js). */

const TEST = globalThis.__GRANTE_TEST__ || {};   // set only by automated tests
export const TRASH = "Grante Trash";
const SKIP = new Set(["node_modules", "venv", ".venv", "__pycache__", "site-packages", "Library", TRASH]);
const SEARCH_DEPTH = 6, SEARCH_LIMIT = 20000;

export class ToolError extends Error {}
export class Ambiguous extends ToolError {
  constructor(name, matches, kind) {
    super(`There's more than one ${kind} called '${name}'. Which one did you mean?`);
    this.name_ = name; this.matches = matches; this.kind = kind;
  }
}

/* ---------------------------------------------------------------------------------------
   Can this browser do it at all?
   --------------------------------------------------------------------------------------- */
export const supported = !!(TEST.useOPFS || (typeof window !== "undefined" && window.showDirectoryPicker && window.isSecureContext));

/* ---------------------------------------------------------------------------------------
   The chosen folders, remembered in this browser (IndexedDB can store folder handles)
   --------------------------------------------------------------------------------------- */
let uid = null;
let roots = [];          // [{ id, name, handle }]
let keepOut = [];        // paths, like "Documents/Private"

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("grante-files", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("folders", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbAll() {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction("folders").objectStore("folders").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
async function dbPut(record) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("folders", "readwrite");
    tx.objectStore("folders").put(record);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
}
async function dbDelete(id) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("folders", "readwrite");
    tx.objectStore("folders").delete(id);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
}
const keepKey = () => `grante.keepout.${uid}`;

/* Load this person's folders and keep-out list. Called when they sign in. */
let loading = Promise.resolve();
export const whenReady = () => loading;
export function useAccount(accountId) {
  loading = load(accountId);
  return loading;
}
async function load(accountId) {
  uid = accountId;
  roots = [];
  try { keepOut = JSON.parse(localStorage.getItem(keepKey())) || []; } catch { keepOut = []; }
  if (!supported || !uid) return;
  try { roots = (await dbAll()).filter((r) => r.uid === uid).sort((a, b) => a.added - b.added); }
  catch { roots = []; }
}

export const folders = () => roots.map((r) => ({ id: r.id, name: r.name }));
export const keepOutList = () => [...keepOut];

/* Ask the person to choose a folder. startIn: "downloads", "desktop", "documents", "pictures", "music", "videos", or undefined. */
export async function addFolder(startIn) {
  if (!supported) throw new ToolError("Choosing folders works in Chrome or Edge on a computer.");
  let handle;
  if (TEST.useOPFS) {   // automated tests can't click a real folder picker
    const top = await navigator.storage.getDirectory();
    handle = await top.getDirectoryHandle(TEST.nextFolder || ({ downloads: "Downloads", desktop: "Desktop", documents: "Documents" }[startIn] || "Folder"), { create: true });
  } else {
    try {
      handle = await window.showDirectoryPicker({ id: `grante-${startIn || "other"}`, mode: "readwrite", ...(startIn ? { startIn } : {}) });
    } catch (e) {
      if (e && e.name === "AbortError") return null;   // they closed the picker
      throw new ToolError("That folder can't be used. Your browser keeps some folders (like your whole home folder or system folders) off-limits to websites. Open it and pick a folder inside it instead.");
    }
    if ((await handle.requestPermission({ mode: "readwrite" })) !== "granted") {
      throw new ToolError("Grante needs your OK to change files in that folder. Try again and click Allow.");
    }
  }
  for (const r of roots) if (await r.handle.isSameEntry(handle)) return { id: r.id, name: r.name, already: true };
  let name = handle.name || "Folder", n = 2;
  while (roots.some((r) => r.name.toLowerCase() === name.toLowerCase())) name = `${handle.name} (${n++})`;
  const record = { id: `${uid}:${Date.now()}`, uid, name, handle, added: Date.now() };
  await dbPut(record);
  roots.push(record);
  return { id: record.id, name };
}

export async function removeFolder(id) {
  roots = roots.filter((r) => r.id !== id);
  try { await dbDelete(id); } catch { /* fine */ }
  keepOut = keepOut.filter((k) => roots.some((r) => k.toLowerCase().startsWith(r.name.toLowerCase() + "/")));
  saveKeepOut();
}

/* Folders whose permission has to be given again (browsers ask again on later visits). */
export async function needsPermission() {
  if (TEST.useOPFS) return [];
  const out = [];
  for (const r of roots) {
    try { if ((await r.handle.queryPermission({ mode: "readwrite" })) !== "granted") out.push(r.name); }
    catch { out.push(r.name); }
  }
  return out;
}
/* Must be called straight from a click, because browsers only show this question after a click. */
export async function askPermission() {
  if (TEST.useOPFS) return true;
  let all = true;
  for (const r of roots) {
    try {
      if ((await r.handle.queryPermission({ mode: "readwrite" })) === "granted") continue;
      if ((await r.handle.requestPermission({ mode: "readwrite" })) !== "granted") all = false;
    } catch { all = false; }
  }
  return all;
}

/* ---- The "Keep Grante out" list ---- */
function saveKeepOut() { try { localStorage.setItem(keepKey(), JSON.stringify(keepOut)); } catch { /* fine */ } }
export function addKeepOut(path) {
  path = clean(path);
  if (!path || !roots.some((r) => path.toLowerCase() === r.name.toLowerCase() || path.toLowerCase().startsWith(r.name.toLowerCase() + "/"))) {
    throw new ToolError("Choose something inside one of your folders.");
  }
  if (!keepOut.some((k) => k.toLowerCase() === path.toLowerCase())) keepOut.push(path);
  saveKeepOut();
}
export function removeKeepOut(path) { keepOut = keepOut.filter((k) => k !== path); saveKeepOut(); }
export const isKeptOut = (path) => keepOut.some((k) => { const a = path.toLowerCase(), b = k.toLowerCase(); return a === b || a.startsWith(b + "/"); });

/* Folder paths a couple of levels deep, to suggest in the keep-out box. */
export async function folderSuggestions(limit = 300) {
  const out = [];
  for (const r of roots) {
    out.push(r.name);
    for await (const e of walk(r, 3)) { if (e.kind === "directory") out.push(e.path); if (out.length >= limit) return out; }
  }
  return out;
}

/* ---------------------------------------------------------------------------------------
   Paths
   --------------------------------------------------------------------------------------- */
const cleanRaw = (p) => String(p ?? "").trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
/* The usual places on a computer. Chrome never lets a website have one of these whole, only folders inside them. */
const PLACES = { downloads: ["Downloads", "downloads"], desktop: ["Desktop", "desktop"], documents: ["Documents", "documents"],
  pictures: ["Pictures", "pictures"], music: ["Music", "music"], movies: ["Movies", "videos"], videos: ["Videos", "videos"] };
const placeOf = (word) => PLACES[String(word || "").toLowerCase()] || null;
const isRootName = (word) => roots.some((r) => r.name.toLowerCase() === String(word || "").toLowerCase());
/* "Desktop/Projects/a.txt" becomes "Projects/a.txt" when Projects was shared but Desktop itself can't be. */
const clean = (p) => {
  const c = cleanRaw(p), parts = c.split("/");
  return parts.length > 1 && placeOf(parts[0]) && !isRootName(parts[0]) ? parts.slice(1).join("/") : c;
};
const isTop = (p) => ["", "."].includes(clean(p));
const hidden = (name) => name.startsWith(".");
const parentOf = (path) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const rootFor = (path) => roots.find((r) => r.name.toLowerCase() === clean(path).split("/")[0].toLowerCase());
const where = () => roots.map((r) => r.name).join(", ");

function noFolders() {
  if (!roots.length) throw new ToolError("Grante doesn't have any folders yet. Tell it which folder to use, like \"Sort my Projects folder\", or add one in Account Settings.");
}

/* The entry at an exact path ("Downloads/School"), or null. */
async function resolve(path) {
  const parts = clean(path).split("/");
  const root = rootFor(path);
  if (!root) return null;
  let dir = root.handle, curPath = root.name, parent = null;
  if (parts.length === 1) return { kind: "directory", handle: dir, parent: null, name: root.name, path: root.name, root };
  for (let i = 1; i < parts.length; i++) {
    const name = parts[i], last = i === parts.length - 1;
    let found = null;
    for await (const [n, h] of dir.entries()) if (n.toLowerCase() === name.toLowerCase()) { found = [n, h]; break; }
    if (!found) return null;
    const [realName, h] = found;
    curPath += "/" + realName;
    if (last) return { kind: h.kind, handle: h, parent: dir, name: realName, path: curPath, root };
    if (h.kind !== "directory") return null;
    parent = dir; dir = h;
  }
  return null;
}

/* Everything inside a top folder, breadth first, skipping hidden, trash, and keep-out. */
async function* walk(root, depthLimit = SEARCH_DEPTH) {
  const queue = [{ handle: root.handle, path: root.name, depth: 0 }];
  let seen = 0;
  while (queue.length) {
    const { handle, path, depth } = queue.shift();
    let entries = [];
    try { for await (const [n, h] of handle.entries()) entries.push([n, h]); } catch { continue; }
    entries.sort((a, b) => (a[1].kind === b[1].kind ? a[0].localeCompare(b[0]) : a[1].kind === "directory" ? -1 : 1));
    for (const [name, h] of entries) {
      if (hidden(name) || SKIP.has(name)) continue;
      const p = `${path}/${name}`;
      if (isKeptOut(p)) continue;
      if (++seen > SEARCH_LIMIT) return;
      yield { kind: h.kind, handle: h, parent: handle, name, path: p, root };
      if (h.kind === "directory" && depth + 1 < depthLimit) queue.push({ handle: h, path: p, depth: depth + 1 });
    }
  }
}
async function search(match, limit = 50) {
  const out = [];
  for (const r of roots) for await (const e of walk(r)) { if (match(e)) { out.push(e); if (out.length >= limit) return out; } }
  return out;
}

/* A file or folder by its path, or just by its name anywhere in the shared folders. */
async function findExisting(name) {
  noFolders();
  const p = clean(name);
  if (!p || isTop(p)) throw new ToolError("Which file or folder do you mean?");
  if (rootFor(p)) {
    const exact = await resolve(p);
    if (exact) { if (isKeptOut(exact.path)) throw keptOutError(exact.path); return exact; }
  }
  if (p.includes("/")) {   // a path without the top folder, like "School/notes.txt"
    const hits = [];
    for (const r of roots) { const e = await resolve(`${r.name}/${p}`); if (e && !isKeptOut(e.path)) hits.push(e); }
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) throw new Ambiguous(p.split("/").pop(), hits, hits.every((h) => h.kind === "directory") ? "folder" : "item");
  }
  const target = p.split("/").pop().toLowerCase();
  const matches = await search((e) => e.name.toLowerCase() === target);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Ambiguous(target, matches, matches.every((m) => m.kind === "directory") ? "folder" : "item");
  throw new ToolError(`I couldn't find '${name}' in your folders (${where()}).`);
}

/* A destination folder: an existing one with that name, or a new one to create.
   A new folder given as a plain name goes next to `near` (like in Finder). */
async function folderPath(name, near = null) {
  noFolders();
  const p = clean(name);
  if (rootFor(p)) {
    const exact = await resolve(p);
    if (exact) {
      if (exact.kind !== "directory") throw new ToolError(`'${name}' is a file, not a folder.`);
      return { exists: true, entry: exact, path: exact.path };
    }
    return { exists: false, path: p };
  }
  if (!p.includes("/")) {
    const matches = await search((e) => e.kind === "directory" && e.name.toLowerCase() === p.toLowerCase());
    if (matches.length === 1) return { exists: true, entry: matches[0], path: matches[0].path };
    if (matches.length > 1) throw new Ambiguous(p, matches, "folder");
    if (near) return { exists: false, path: `${near}/${p}` };
  } else {
    for (const r of roots) { const e = await resolve(`${r.name}/${p}`); if (e && e.kind === "directory") return { exists: true, entry: e, path: e.path }; }
  }
  if (roots.length === 1) return { exists: false, path: `${roots[0].name}/${p}` };
  throw new ToolError(`Which of your folders should '${name}' go in? You have: ${where()}.`);
}

async function makeDirs(path) {
  const root = rootFor(path);
  if (!root) throw new ToolError(`'${path}' isn't inside one of your folders.`);
  let dir = root.handle;
  for (const part of clean(path).split("/").slice(1)) {
    let next = null;
    for await (const [n, h] of dir.entries()) if (n.toLowerCase() === part.toLowerCase() && h.kind === "directory") { next = h; break; }
    dir = next || await dir.getDirectoryHandle(part, { create: true });
  }
  return dir;
}
async function has(dirHandle, name) {
  for await (const [n] of dirHandle.entries()) if (n.toLowerCase() === name.toLowerCase()) return true;
  return false;
}

const keptOutError = (path) => new ToolError(`'${path}' is on your "Keep Grante out" list, so I won't touch it.`);
function checkCanChange(entry) {
  if (!entry.parent) throw new ToolError(`I can't change the whole '${entry.name}' folder.`);
  if (isKeptOut(entry.path)) throw keptOutError(entry.path);
}

/* Move (or rename) a file or folder. Browsers can't always move directly, so if needed it
   copies first and only removes the original once the copy is complete. */
async function moveEntry(entry, destDir, newName) {
  if (entry.handle.move && !TEST.noMove) {
    try { await entry.handle.move(destDir, newName); return; }
    catch (e) { if (!["NotSupportedError", "TypeError", "InvalidModificationError", "NotAllowedError"].includes(e?.name)) throw e; }
  }
  try { await copyInto(entry.handle, destDir, newName); }
  catch (e) {
    try { await destDir.removeEntry(newName, { recursive: true }); } catch { /* nothing to clean up */ }
    throw new ToolError(`I couldn't move '${entry.name}', so I left it where it was.`);
  }
  await entry.parent.removeEntry(entry.name, { recursive: true });
}
async function copyInto(handle, destDir, name) {
  if (handle.kind === "file") {
    const target = await destDir.getFileHandle(name, { create: true });
    const writable = await target.createWritable();
    await (await handle.getFile()).stream().pipeTo(writable);
    return;
  }
  const dir = await destDir.getDirectoryHandle(name, { create: true });
  for await (const [n, h] of handle.entries()) await copyInto(h, dir, n);
}

/* ---------------------------------------------------------------------------------------
   The tools
   --------------------------------------------------------------------------------------- */
async function listFiles(folder = ".") {
  noFolders();
  if (isTop(folder)) return `Your folders:\n${roots.map((r) => `[folder] ${r.name}`).join("\n")}`;
  let e = rootFor(folder) ? await resolve(folder) : null;
  if (!e) e = await findExisting(folder);
  if (e.kind !== "directory") throw new ToolError(`'${folder}' is a file, not a folder.`);
  if (isKeptOut(e.path)) throw keptOutError(e.path);
  const items = [];
  for await (const [n, h] of e.handle.entries()) if (!hidden(n) && !isKeptOut(`${e.path}/${n}`)) items.push((h.kind === "directory" ? "[folder] " : "") + n);
  items.sort();
  return items.length ? `Inside '${e.path}':\n${items.join("\n")}` : `'${e.path}' is empty.`;
}

async function findFile(name) {
  noFolders();
  const target = String(name ?? "").trim().toLowerCase();
  if (!target) throw new ToolError("What should I search for?");
  const matches = await search((e) => e.name.toLowerCase().includes(target), 30);
  return matches.length ? `Found:\n${matches.map((m) => m.path).join("\n")}` : `No files or folders matching '${name}'.`;
}

async function moveFile(source, destination_folder) {
  const src = await findExisting(source);
  checkCanChange(src);
  const dst = await folderPath(destination_folder, parentOf(src.path));
  if (isKeptOut(dst.path)) throw keptOutError(dst.path);
  const s = src.path.toLowerCase(), d = dst.path.toLowerCase();
  if (d === s || d.startsWith(s + "/")) throw new ToolError("I can't move a folder into itself.");
  if (parentOf(src.path).toLowerCase() === d) return `'${src.name}' is already in '${dst.path}'.`;
  const dir = dst.exists ? dst.entry.handle : await makeDirs(dst.path);
  if (await has(dir, src.name)) throw new ToolError(`'${src.name}' already exists in '${dst.path}', so I left both alone.`);
  await moveEntry(src, dir, src.name);
  return `Moved '${src.name}' to '${dst.path}'.`;
}

async function renameFile(source, new_name) {
  const src = await findExisting(source);
  checkCanChange(src);
  let name = String(new_name ?? "").trim();
  if (!name || name.includes("/") || name.includes("\\") || name.startsWith(".")) throw new ToolError("The new name can't be empty, contain '/', or start with a dot.");
  const ext = src.name.includes(".") ? src.name.slice(src.name.lastIndexOf(".")) : "";
  if (src.kind === "file" && !name.includes(".") && ext) name += ext;   // keep the file type: photo -> photo.png
  if (name.toLowerCase() !== src.name.toLowerCase() && await has(src.parent, name)) throw new ToolError(`Something called '${name}' already exists there.`);
  await moveEntry(src, src.parent, name);
  return `Renamed '${src.name}' to '${name}'.`;
}

async function createFolder(name, inside = ".") {
  noFolders();
  let parentPath;
  if (!isTop(inside)) {
    const parent = await folderPath(inside);
    parentPath = parent.path;
  } else if (rootFor(name)) {
    parentPath = "";
  } else if (roots.length === 1) {
    parentPath = roots[0].name;
  } else {
    throw new ToolError(`Which of your folders should I create '${name}' in? You have: ${where()}.`);
  }
  const path = clean(parentPath ? `${parentPath}/${clean(name)}` : clean(name));
  if (isKeptOut(path)) throw keptOutError(path);
  const existing = await resolve(path);
  const shown = parentOf(path) || path;
  if (existing) return `The folder '${existing.name}' already exists in '${parentOf(existing.path) || existing.path}'.`;
  await makeDirs(path);
  return `Created the folder '${path.split("/").pop()}' in '${shown}'.`;
}

async function deleteFile(name) {
  const entry = await findExisting(name);
  checkCanChange(entry);
  const trash = await entry.root.handle.getDirectoryHandle(TRASH, { create: true });
  let target = entry.name, n = 1;
  const dot = entry.kind === "file" && entry.name.lastIndexOf(".") > 0 ? entry.name.lastIndexOf(".") : entry.name.length;
  while (await has(trash, target)) target = `${entry.name.slice(0, dot)} (${n++})${entry.name.slice(dot)}`;
  await moveEntry(entry, trash, target);
  return `Moved '${entry.name}' to the "${TRASH}" folder in '${entry.root.name}'. You can get it back from there if you change your mind.`;
}

const CATEGORIES = {
  Images: [".jpg", ".jpeg", ".png", ".gif", ".heic", ".webp", ".svg", ".bmp", ".tiff"],
  Documents: [".pdf", ".doc", ".docx", ".txt", ".md", ".rtf", ".pages", ".odt"],
  Spreadsheets: [".xls", ".xlsx", ".csv", ".numbers"],
  Presentations: [".ppt", ".pptx", ".key"],
  Music: [".mp3", ".wav", ".m4a", ".aac", ".flac"],
  Videos: [".mp4", ".mov", ".avi", ".mkv", ".m4v"],
  Code: [".py", ".js", ".html", ".css", ".java", ".c", ".cpp", ".json", ".ipynb"],
  Archives: [".zip", ".rar", ".7z", ".tar", ".gz", ".dmg"],
};

async function sortFiles(folder = ".") {
  noFolders();
  if (isTop(folder)) {
    if (roots.length > 1) throw new ToolError(`Which folder should I sort? You have: ${where()}.`);
    folder = roots[0].name;
  }
  let e = rootFor(folder) ? await resolve(folder) : null;
  if (!e) e = await findExisting(folder);
  if (e.kind !== "directory") throw new ToolError(`'${folder}' is a file, not a folder.`);
  if (isKeptOut(e.path)) throw keptOutError(e.path);
  const files = [];
  for await (const [n, h] of e.handle.entries()) if (h.kind === "file" && !hidden(n) && !isKeptOut(`${e.path}/${n}`)) files.push([n, h]);
  files.sort((a, b) => a[0].localeCompare(b[0]));
  const moved = []; let skipped = 0;
  for (const [n, h] of files) {
    const ext = n.includes(".") ? n.slice(n.lastIndexOf(".")).toLowerCase() : "";
    const category = Object.keys(CATEGORIES).find((c) => CATEGORIES[c].includes(ext)) || "Other";
    const dir = await e.handle.getDirectoryHandle(category, { create: true });
    if (await has(dir, n)) { skipped++; continue; }
    await moveEntry({ kind: "file", handle: h, parent: e.handle, name: n, path: `${e.path}/${n}` }, dir, n);
    moved.push(`${n} -> ${category}`);
  }
  if (!moved.length) return "There were no loose files to sort.";
  return `Sorted ${moved.length} files in '${e.path}':\n${moved.join("\n")}` + (skipped ? `\n(Skipped ${skipped} because a file with the same name was already there.)` : "");
}

async function openApp() {
  throw new ToolError("Opening apps only works in the Grante Mac app. A website isn't allowed to open apps.");
}

export const TOOLS = { list_files: listFiles, find_file: findFile, move_file: moveFile, rename_file: renameFile,
  create_folder: createFolder, delete_file: deleteFile, sort_files: sortFiles, open_app: openApp };
export const READ_ONLY = new Set(["list_files", "find_file"]);

export function describe(name, a = {}) {
  return {
    list_files: `Look inside '${a.folder ?? "."}'`,
    find_file: `Search for '${a.name}'`,
    move_file: `Move '${a.source}' into the folder '${a.destination_folder}'`,
    rename_file: `Rename '${a.source}' to '${a.new_name}'`,
    create_folder: `Create a folder called '${a.name}'` + (!isTop(a.inside ?? "") ? ` in '${a.inside}'` : ""),
    delete_file: `Delete '${a.name}' (it goes to the "${TRASH}" folder)`,
    sort_files: `Sort the files in '${a.folder ?? "."}' into folders by type`,
    open_app: `Open the app '${a.app_name}'`,
  }[name] || `${name} ${JSON.stringify(a)}`;
}

const fn = (name, description, props, required = []) => ({ type: "function", function: { name, description,
  parameters: { type: "object", properties: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, { type: "string", description: v }])), required } } });
export const TOOL_SCHEMAS = [
  fn("list_files", "List what's inside a folder.", { folder: "Folder to look in, like \"Downloads\". Use \".\" to list the user's folders." }),
  fn("find_file", "Search the user's folders for files or folders whose name contains some text.", { name: "Part of the file or folder name to search for." }, ["name"]),
  fn("move_file", "Move a file or folder into another folder. Creates the folder if it doesn't exist.",
    { source: "The file to move, e.g. \"photo.png\".", destination_folder: "The folder to move it into, e.g. \"School\" or \"Downloads/School\". Include the location if the user said one." }, ["source", "destination_folder"]),
  fn("rename_file", "Rename a file or folder.", { source: "The current name.", new_name: "The new name." }, ["source", "new_name"]),
  fn("create_folder", "Create a new folder.", { name: "Name of the new folder, e.g. \"hello\".", inside: "The folder to create it in, e.g. \"Downloads\" or \"Desktop/School\". Always fill this in if the user said where." }, ["name"]),
  fn("delete_file", "Delete a file or folder (it goes to the Grante Trash folder, so it can be recovered).", { name: "The file or folder to delete." }, ["name"]),
  fn("sort_files", "Sort all loose files in a folder into subfolders by type (Images, Documents, Music, etc.).", { folder: "Folder to sort, e.g. \"Downloads\"." }),
];

/* Run a tool. Returns [success, message]. */
export async function runTool(name, args) {
  if (!TOOLS[name]) return [false, `There's no tool called '${name}'.`];
  const a = args || {};
  const order = { list_files: ["folder"], find_file: ["name"], move_file: ["source", "destination_folder"], rename_file: ["source", "new_name"],
    create_folder: ["name", "inside"], delete_file: ["name"], sort_files: ["folder"], open_app: ["app_name"] }[name];
  const required = { find_file: ["name"], move_file: ["source", "destination_folder"], rename_file: ["source", "new_name"], create_folder: ["name"], delete_file: ["name"] }[name] || [];
  if (required.some((k) => a[k] === undefined || a[k] === null || String(a[k]).trim() === "")) return [false, `The '${name}' action was missing some details, so nothing was done.`];
  try { return [true, await TOOLS[name](...order.map((k) => (a[k] === undefined ? undefined : String(a[k]))))]; }
  catch (e) {
    if (e instanceof ToolError) return [false, e.message];
    if (e?.name === "NotAllowedError") return [false, "Your browser needs your OK to use your folders again. Click \"Allow\" at the top of the Grante Agent page, then try again."];
    if (e?.name === "NotFoundError") return [false, "That file or folder isn't there anymore."];
    return [false, `Something went wrong: ${e?.message || e}`];
  }
}

/* If an action would touch something on the keep-out list, the reason why (so Grante refuses
   straight away instead of asking for an OK it can't use). Otherwise null. */
export async function blockedReason(name, a = {}) {
  try {
    const target = { move_file: a.source, rename_file: a.source, delete_file: a.name }[name];
    if (target) { await findExisting(target); }
    if (name === "move_file" && isKeptOut((await folderPath(a.destination_folder)).path)) return "kept out";
    if ((name === "sort_files") && !isTop(a.folder ?? "")) { const e = rootFor(a.folder) ? await resolve(a.folder) : await findExisting(a.folder); if (e && isKeptOut(e.path)) return "kept out"; }
  } catch (e) {
    if (e instanceof ToolError && !(e instanceof Ambiguous)) return e.message;   // not found, kept out, etc.: no point asking for an OK
  }
  return null;
}

/* ---------------------------------------------------------------------------------------
   Asking for a folder only when it's needed
   --------------------------------------------------------------------------------------- */
const FOLDER_ARGS = { list_files: ["folder"], sort_files: ["folder"], create_folder: ["inside"], move_file: ["source", "destination_folder"],
  rename_file: ["source"], delete_file: ["name"], find_file: [] };
const MUST_EXIST = new Set(["list_files.folder", "sort_files.folder", "move_file.source", "rename_file.source", "delete_file.name"]);
const IS_FOLDER = new Set(["list_files.folder", "sort_files.folder", "create_folder.inside", "move_file.destination_folder"]);

/* If this action needs a folder Grante hasn't been given yet, what to ask for. Otherwise null.
   said = the person's request (to guess where the folder is), skip = keys already asked about. */
export async function missingFolder(name, args = {}, said = "", skip = new Set()) {
  if (!FOLDER_ARGS[name]) return null;
  const mentioned = Object.keys(PLACES).find((k) => new RegExp(`\\b${k}\\b`, "i").test(said));
  const guess = mentioned ? PLACES[mentioned] : null;
  const ask = (key, info) => (skip.has(key) ? null : { key, ...info });
  if (name === "find_file" && !roots.length) {
    return ask("any", { folder: null, place: guess?.[0] || null, start_in: guess?.[1] || "desktop",
      message: "Grante doesn't have any folders yet. Pick the folder it should search in." });
  }
  for (const arg of FOLDER_ARGS[name]) {
    const value = args[arg];
    if (value === undefined || value === null || isTop(value)) {
      if (!roots.length && (name === "sort_files" || name === "list_files" || name === "create_folder")) {
        return ask("any", { folder: null, place: guess?.[0] || null, start_in: guess?.[1] || "desktop",
          message: "Which folder should Grante use? Pick one and it'll carry on." });
      }
      continue;
    }
    const id = `${name}.${arg}`;
    const parts = cleanRaw(value).split("/");
    if (isRootName(parts[0])) continue;                       // already shared
    const place = placeOf(parts[0]);
    if (place) {
      const rest = parts.slice(1);
      if (rest.length && isRootName(rest[0])) continue;       // "Desktop/Projects" and Projects is shared
      if (!rest.length || (rest.length === 1 && !IS_FOLDER.has(id))) {
        // The whole Desktop (or a loose file right in it): Chrome won't allow that
        return ask(`whole:${place[0]}`, { folder: null, place: place[0], start_in: place[1],
          message: `Chrome doesn't let websites use your whole ${place[0]} folder. Pick a folder inside ${place[0]} for Grante to use.`
            + (rest.length ? ` If '${rest[0]}' is loose in ${place[0]}, move it into a folder first.` : "") });
      }
      const folder = rest[0];
      return ask(`folder:${folder.toLowerCase()}`, { folder, place: place[0], start_in: place[1],
        message: `Grante needs your permission to use the '${folder}' folder in ${place[0]}.` });
    }
    if (!MUST_EXIST.has(id) && roots.length) continue;        // a place to put things: it can be created
    let found = false;
    if (roots.length) {
      try { await findExisting(value); found = true; }
      catch (e) { found = e instanceof Ambiguous || !(e instanceof ToolError) || !/couldn't find/.test(e.message); }
    }
    if (found) continue;
    const folder = IS_FOLDER.has(id) || parts.length > 1 ? parts[0] : null;
    return ask(folder ? `folder:${folder.toLowerCase()}` : `item:${String(value).toLowerCase()}`, { folder, place: guess?.[0] || null,
      start_in: guess?.[1] || "desktop",
      message: folder ? `Grante needs your permission to use the '${folder}' folder.`
        : roots.length ? `I can't find '${value}' in the folders you've shared. Give Grante the folder it's in.`
          : `Give Grante the folder that '${value}' is in.` });
  }
  return null;
}

/* ---------------------------------------------------------------------------------------
   "Which one did you mean?" and the folder picture shown after each action
   --------------------------------------------------------------------------------------- */
async function optionFor(e) {
  const info = { path: e.path, name: e.name, location: parentOf(e.path) || e.path, is_folder: e.kind === "directory", contents: [] };
  try {
    if (e.kind === "directory") {
      const items = [];
      for await (const [n, h] of e.handle.entries()) if (!hidden(n)) items.push([n, h.kind]);
      items.sort((a, b) => (a[1] === b[1] ? a[0].localeCompare(b[0]) : a[1] === "directory" ? -1 : 1));
      info.contents = items.slice(0, 5).map(([n, k]) => n + (k === "directory" ? "/" : ""));
      info.count = items.length;
    } else {
      const size = (await e.handle.getFile()).size;
      info.detail = size < 1024 ? `${size} bytes` : size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(1)} MB`;
    }
  } catch { /* leave it short */ }
  return info;
}

const NAME_ARGS = { move_file: [["source", findExisting], ["destination_folder", folderPath]], rename_file: [["source", findExisting]],
  delete_file: [["name", findExisting]], create_folder: [["inside", folderPath]], sort_files: [["folder", findExisting]], list_files: [["folder", findExisting]] };

export async function checkAmbiguity(name, args) {
  for (const [arg, resolver] of NAME_ARGS[name] || []) {
    const value = args?.[arg];
    if (value === undefined || value === null || isTop(value)) continue;
    if ((name === "list_files" || name === "sort_files") && rootFor(value) && await resolve(value)) continue;
    try { await resolver(value); }
    catch (e) {
      if (e instanceof Ambiguous) {
        return { arg, name: e.name_, kind: e.kind, action: describe(name, args), options: await Promise.all(e.matches.slice(0, 6).map(optionFor)) };
      }
      return null;   // a different problem: the action itself will report it
    }
  }
  return null;
}

export async function focusFor(name, a = {}) {
  try {
    if (name === "create_folder") return isTop(a.inside ?? "") ? (roots.length === 1 ? roots[0].name : null) : (await folderPath(a.inside)).path;
    if (name === "move_file") { const s = await findExisting(a.source); return (await folderPath(a.destination_folder, parentOf(s.path))).path; }
    if (name === "rename_file" || name === "delete_file") return parentOf((await findExisting(a.source ?? a.name)).path);
    if (name === "sort_files" || name === "list_files") return isTop(a.folder ?? "") ? null : (rootFor(a.folder) ? clean(a.folder) : (await findExisting(a.folder)).path);
  } catch { return null; }
  return null;
}

export async function tree(focus = null, maxItems = 60) {
  if (!roots.length) return "(No folders shared yet)";
  let start = focus ? await resolve(focus) : null;
  if (start && start.kind !== "directory") start = null;
  const lines = [];
  let count = 0;
  async function draw(handle, path, prefix, depth, maxDepth) {
    const items = [];
    try { for await (const [n, h] of handle.entries()) if (!hidden(n) && !isKeptOut(`${path}/${n}`)) items.push([n, h]); } catch { return; }
    items.sort((a, b) => (a[1].kind === b[1].kind ? a[0].toLowerCase().localeCompare(b[0].toLowerCase()) : a[1].kind === "directory" ? -1 : 1));
    for (let i = 0; i < items.length; i++) {
      if (count >= maxItems) { lines.push(prefix + "└── ..."); return; }
      count++;
      const [n, h] = items[i], last = i === items.length - 1;
      lines.push(prefix + (last ? "└── " : "├── ") + n + (h.kind === "directory" ? "/" : ""));
      if (h.kind === "directory" && depth < maxDepth) await draw(h, `${path}/${n}`, prefix + (last ? "    " : "│   "), depth + 1, maxDepth);
    }
  }
  if (start) {
    lines.push(`${start.path}/`);
    await draw(start.handle, start.path, "", 1, 2);
    if (lines.length === 1) lines.push("└── (empty)");
  } else {
    lines.push("Your folders/");
    for (let i = 0; i < roots.length; i++) {
      const last = i === roots.length - 1;
      lines.push((last ? "└── " : "├── ") + roots[i].name + "/");
      await draw(roots[i].handle, roots[i].name, last ? "    " : "│   ", 1, 1);
    }
  }
  return lines.join("\n");
}

/* Find requests like <tool_call>{"name": ..., "arguments": {...}}</tool_call> in the AI's reply. */
export function parseToolCalls(text) {
  const calls = [];
  const blocks = [...String(text).matchAll(/<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/g)].map((m) => m[1]);
  for (const b of blocks) { const c = firstJson(b); if (c) calls.push(c); }
  if (!calls.length && String(text).includes('"name"')) { const c = firstJson(text); if (c) calls.push(c); }
  for (const c of calls) {
    let a = c.arguments ?? c.parameters ?? {};
    if (typeof a === "string") { try { a = JSON.parse(a); } catch { a = {}; } }
    c.arguments = a && typeof a === "object" && !Array.isArray(a) ? a : {};
  }
  return calls;
}
function firstJson(text) {
  text = String(text);
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    let depth = 0, inString = false, escaped = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (inString) { if (escaped) escaped = false; else if (ch === "\\") escaped = true; else if (ch === '"') inString = false; continue; }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        try { const obj = JSON.parse(text.slice(i, j + 1)); if (obj && TOOLS[obj.name]) return obj; } catch { /* keep looking */ }
        break;
      }
    }
  }
  return null;
}

export const shared = () => roots.map((r) => r.name);
