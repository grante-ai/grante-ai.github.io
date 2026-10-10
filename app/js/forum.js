/* The NarSan forum: Town, Country, and Global. */
import { api } from "./api.js";
import { GUIDELINES } from "./content.js";
import { app } from "./state.js";
import { h, icon, initials, modal, timeAgo, toast } from "./ui.js";

const SCOPE_INFO = {
  town: { name: "Town", icon: "pin" },
  country: { name: "Country", icon: "flagc" },
  global: { name: "Global", icon: "globe" },
};

let current = { scope: "town", sort: "new" };

function avatar(name) { return h("span", { class: "avatar small" }, initials(name)); }

/* Like / dislike buttons that update in place */
function voteBar(type, item, postId) {
  const likeBtn = h("button", { class: "vote like", "aria-label": "Like", "aria-pressed": String(item.my_vote === 1) }, icon("up"), h("span", {}, item.likes));
  const dislikeBtn = h("button", { class: "vote dislike", "aria-label": "Dislike", "aria-pressed": String(item.my_vote === -1) }, icon("down"), h("span", {}, item.dislikes));
  const paint = () => {
    likeBtn.classList.toggle("on", item.my_vote === 1);
    dislikeBtn.classList.toggle("on", item.my_vote === -1);
    likeBtn.setAttribute("aria-pressed", String(item.my_vote === 1));
    dislikeBtn.setAttribute("aria-pressed", String(item.my_vote === -1));
    likeBtn.querySelector("span:last-child").textContent = item.likes;
    dislikeBtn.querySelector("span:last-child").textContent = item.dislikes;
  };
  const cast = async (e, value) => {
    e.stopPropagation();
    const next = item.my_vote === value ? 0 : value;
    try {
      const r = await api("/forum/vote", { method: "POST", body: { target_type: type, post_id: postId || item.id,
        reply_id: type === "reply" ? item.id : null, value: next } });
      Object.assign(item, r);
      paint();
    } catch (err) { toast(err.message, "bad"); }
  };
  likeBtn.addEventListener("click", (e) => cast(e, 1));
  dislikeBtn.addEventListener("click", (e) => cast(e, -1));
  paint();
  return h("div", { class: "votes" }, likeBtn, dislikeBtn);
}

async function report(type, postId, replyId = null) {
  const reason = h("input", { type: "text", maxlength: 500, placeholder: "What's wrong with it?" });
  const ok = await modal({ title: "Report this", body: h("div", { class: "form-stack" }, h("p", { class: "muted" }, "Tell us why this breaks the community rules."), reason),
    confirm: "Report", onConfirm: () => api("/forum/report", { method: "POST", body: { target_type: type, post_id: postId, reply_id: replyId, reason: reason.value } }) });
  if (ok) toast("Thanks. We got your report.");
}

function sideCard() {
  return h("aside", { class: "forum-side" },
    h("div", { class: "card" },
      h("h3", {}, "Community rules"),
      h("ul", { class: "rules" }, ...GUIDELINES.map((g) => h("li", {}, g)))),
    h("div", { class: "card muted small" },
      icon("lock"), " Your email and address are never shown. People only see your name, @username, and which forum you posted in. Posts are stored online so everyone in the forum can see them."));
}

/* ---------- Forum list ---------- */

export async function renderForum(view) {
  const tabs = h("div", { class: "tabs", role: "tablist" });
  const posts = h("div", { class: "post-list" }, h("div", { class: "card muted" }, "Loading…"));
  const sortNew = h("button", { class: "seg", onclick: () => { current.sort = "new"; load(); } }, "New");
  const sortTop = h("button", { class: "seg", onclick: () => { current.sort = "top"; load(); } }, "Top");
  const title = h("h2", {}, "Forum");
  const sub = h("p", { class: "muted" }, "");
  let page = 1;
  const more = h("button", { class: "btn btn-ghost btn-block", hidden: true, onclick: () => { page += 1; load(true); } }, "Load more");

  async function load(append = false) {
    if (!append) page = 1;
    sortNew.classList.toggle("on", current.sort === "new");
    sortTop.classList.toggle("on", current.sort === "top");
    tabs.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.scope === current.scope));
    try {
      const r = await api(`/forum/${current.scope}/posts?sort=${current.sort}&page=${page}`);
      const info = SCOPE_INFO[current.scope];
      title.textContent = current.scope === "global" ? "Global forum" : `${r.label} forum`;
      sub.textContent = current.scope === "global" ? "Talk with Grante users everywhere." : `For people in ${r.label}. ${info.name} forum.`;
      const cards = r.posts.map(postCard);
      if (append) posts.append(...cards);
      else posts.replaceChildren(...(cards.length ? cards : [h("div", { class: "card empty" },
        h("div", { class: "empty-icon" }, icon(info.icon)), h("h3", {}, "No posts yet"),
        h("p", { class: "muted" }, "Be the first to start a conversation here."))]));
      more.hidden = !r.has_more;
    } catch (e) { posts.replaceChildren(h("div", { class: "card error" }, e.message)); }
  }

  function postCard(p) {
    return h("article", { class: "card post-card", tabindex: 0,
      onclick: () => { location.hash = `#/forum/post/${p.id}`; },
      onkeydown: (e) => { if (e.key === "Enter") location.hash = `#/forum/post/${p.id}`; } },
      h("div", { class: "post-meta" }, avatar(p.author_name), h("strong", {}, p.author_name), h("span", { class: "muted" }, `@${p.author} · ${timeAgo(p.created_at)}`)),
      h("h3", { class: "post-title" }, p.title),
      h("p", { class: "post-excerpt" }, p.body),
      h("div", { class: "post-foot" }, voteBar("post", p),
        h("span", { class: "reply-count" }, icon("reply"), `${p.reply_count} ${p.reply_count === 1 ? "reply" : "replies"}`)));
  }

  async function newPost() {
    const t = h("input", { type: "text", maxlength: 120, placeholder: "Give it a title" });
    const b = h("textarea", { rows: 6, maxlength: 5000, placeholder: "What's on your mind?" });
    const where = h("select", {}, ...Object.entries(SCOPE_INFO).map(([k, v]) =>
      h("option", { value: k, selected: k === current.scope }, v.name === "Global" ? "Global (everyone)" : `${v.name}: ${forumLabels[k] || ""}`)));
    const ok = await modal({ title: "New post", confirm: "Post", body: h("div", { class: "form-stack" },
      h("div", { class: "field" }, h("label", {}, "Post in"), where),
      h("div", { class: "field" }, h("label", {}, "Title"), t),
      h("div", { class: "field" }, h("label", {}, "Post"), b),
      h("p", { class: "muted small" }, "Remember: never share personal info like your address or phone number.")),
      onConfirm: async () => {
        const p = await api(`/forum/${where.value}/posts`, { method: "POST", body: { title: t.value, body: b.value } });
        current.scope = where.value;
        location.hash = `#/forum/post/${p.id}`;
      } });
    if (ok) toast("Posted!");
  }

  let forumLabels = {};
  view.replaceChildren(h("div", { class: "forum" },
    h("div", { class: "forum-main" },
      h("div", { class: "card forum-head" },
        h("div", { class: "row-between wrap" }, h("div", {}, title, sub), h("button", { class: "btn", onclick: newPost }, icon("plus"), "New post")),
        tabs,
        h("div", { class: "row-between" }, h("div", { class: "segmented", role: "group", "aria-label": "Sort posts" }, sortNew, sortTop))),
      posts, more),
    sideCard()));

  try {
    const forums = await api("/forum");
    forumLabels = Object.fromEntries(forums.map((f) => [f.scope, f.label]));
    tabs.replaceChildren(...forums.map((f) => h("button", { class: "tab", role: "tab", "data-scope": f.scope,
      onclick: () => { current.scope = f.scope; load(); } },
      icon(SCOPE_INFO[f.scope].icon), h("span", { class: "tab-text" }, h("span", { class: "tab-kind" }, SCOPE_INFO[f.scope].name), h("span", { class: "tab-place" }, f.label)))));
  } catch (e) { tabs.replaceChildren(h("p", { class: "error" }, e.message)); }
  load();
}

/* ---------- One post and its replies ---------- */

export async function renderPost(view, postId) {
  view.replaceChildren(h("div", { class: "card muted" }, "Loading…"));
  let data;
  try { data = await api(`/forum/posts/${postId}`); }
  catch (e) {
    view.replaceChildren(h("div", { class: "narrow" }, h("a", { href: "#/forum", class: "link back-link" }, icon("back"), "Back to forum"),
      h("div", { class: "card empty" }, h("h3", {}, "Post not found"), h("p", { class: "muted" }, e.message))));
    return;
  }
  const p = data.post;
  current.scope = p.scope;

  const replyBox = (parentId, onDone) => {
    const ta = h("textarea", { rows: 3, maxlength: 2000, placeholder: parentId ? "Write a reply…" : "Add to the conversation…" });
    const btn = h("button", { class: "btn btn-small", type: "submit" }, "Reply");
    const form = h("form", { class: "reply-form" }, ta, h("div", { class: "reply-actions" },
      parentId ? h("button", { class: "btn btn-ghost btn-small", type: "button", onclick: () => form.remove() }, "Cancel") : null, btn));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!ta.value.trim()) return;
      btn.disabled = true;
      try {
        data = await api(`/forum/posts/${p.id}/replies`, { method: "POST", body: { body: ta.value, parent_id: parentId } });
        ta.value = "";
        btn.disabled = false;
        onDone?.();
        drawReplies();
        toast("Reply posted");
      } catch (err) { toast(err.message, "bad"); btn.disabled = false; }
    });
    return form;
  };

  const repliesBox = h("div", { class: "replies" });
  const countLabel = h("h3", {}, "");

  function replyNode(r, children, depth) {
    const body = r.deleted ? h("p", { class: "muted deleted" }, "[deleted]") : h("p", { class: "reply-body" }, r.body);
    const slot = h("div", {});
    const actions = r.deleted ? null : h("div", { class: "reply-tools" },
      voteBar("reply", r, p.id),
      h("button", { class: "text-btn", onclick: () => { if (!slot.firstChild) slot.append(replyBox(r.id, () => slot.replaceChildren())); slot.querySelector("textarea")?.focus(); } }, icon("reply"), "Reply"),
      r.mine ? h("button", { class: "text-btn danger", onclick: async () => {
        if (await modal({ title: "Delete reply?", body: "This can't be undone.", confirm: "Delete", danger: true,
          onConfirm: () => api(`/forum/posts/${p.id}/replies/${r.id}`, { method: "DELETE" }) })) {
          data = await api(`/forum/posts/${p.id}`); drawReplies();
        }
      } }, icon("trash"), "Delete")
        : h("button", { class: "text-btn", onclick: () => report("reply", p.id, r.id) }, icon("flag"), "Report"));
    return h("div", { class: `reply depth-${Math.min(depth, 3)}` },
      h("div", { class: "post-meta" }, r.deleted ? null : avatar(r.author_name),
        h("strong", {}, r.deleted ? "Deleted" : r.author_name),
        h("span", { class: "muted" }, `${r.deleted ? "" : `@${r.author} · `}${timeAgo(r.created_at)}`)),
      body, actions, slot,
      children.length ? h("div", { class: "reply-children" }, ...children) : null);
  }

  function drawReplies() {
    const byParent = {};
    data.replies.forEach((r) => (byParent[r.parent_id ?? "root"] ||= []).push(r));
    const build = (parent, depth) => (byParent[parent] || []).map((r) => replyNode(r, build(r.id, depth + 1), depth));
    const n = data.replies.filter((r) => !r.deleted).length;
    countLabel.textContent = `${n} ${n === 1 ? "reply" : "replies"}`;
    const nodes = build("root", 0);
    repliesBox.replaceChildren(...(nodes.length ? nodes : [h("p", { class: "muted" }, "No replies yet. Say something nice!")]));
  }

  const deleteBtn = p.mine ? h("button", { class: "text-btn danger", onclick: async () => {
    if (await modal({ title: "Delete post?", body: "Your post and all its replies will be deleted. This can't be undone.", confirm: "Delete", danger: true,
      onConfirm: () => api(`/forum/posts/${p.id}`, { method: "DELETE" }) })) {
      toast("Post deleted"); location.hash = "#/forum";
    }
  } }, icon("trash"), "Delete") : h("button", { class: "text-btn", onclick: () => report("post", p.id) }, icon("flag"), "Report");

  view.replaceChildren(h("div", { class: "forum" },
    h("div", { class: "forum-main" },
      h("a", { href: "#/forum", class: "link back-link" }, icon("back"), `Back to ${SCOPE_INFO[p.scope].name} forum`),
      h("article", { class: "card post-full" },
        h("div", { class: "post-meta" }, avatar(p.author_name), h("strong", {}, p.author_name), h("span", { class: "muted" }, `@${p.author} · ${timeAgo(p.created_at)}`),
          h("span", { class: "tag" }, SCOPE_INFO[p.scope].name)),
        h("h2", { class: "post-title" }, p.title),
        h("p", { class: "post-body" }, p.body),
        h("div", { class: "post-foot" }, voteBar("post", p), deleteBtn)),
      h("div", { class: "card" }, countLabel, replyBox(null), repliesBox)),
    sideCard()));
  drawReplies();
}
