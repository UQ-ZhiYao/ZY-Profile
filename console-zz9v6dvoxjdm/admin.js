// ============================================
// ZY-Profile — admin console (GitHub edition)
// Installable desktop app (PWA) served from an unlisted path on zy-profile.com.
// Edits are kept in an encrypted working copy and published to your GitHub repo in
// one commit: data/public.json, data/site.enc.json (members) and data/admin.enc.json.
// GitHub Actions (static.yml) then redeploys zy-profile.com.
// ============================================
(function () {
"use strict";
const SITE_URL = /^https?:/.test(location.protocol) ? new URL("../", location.href).href : "https://zy-profile.com/";
const DEFAULT_CATEGORIES = [
  { id: "works", name: "Works", locked: false, order: 0 },
  { id: "hobbies", name: "Hobbies", locked: false, order: 1 },
  { id: "stories", name: "Stories", locked: true, order: 2 },
];
const DEFAULT_CAT_OF = { education: "works", experience: "works", skills: "works", certificates: "works", investment: "hobbies", clubs: "hobbies" };
const OLD_TAGLINE = "Members-only profile. Sign in to view portfolio, experience and investment updates.";
const DEFAULT_REPO = "UQ-ZhiYao/ZY-Profile";
const RESERVED_IDS = ["admin", "login", "api", "assets", "data"];
const LAYOUTS = [
  ["list", "List — rows with optional logo, badge and date"],
  ["timeline", "Timeline — vertical line, good for experience"],
  ["cards", "Cards — two-column grid"],
  ["home", "Home — hero, contact card, stats and page overview"],
];
const TONES = [["neutral", "Grey"], ["active", "Green (active)"], ["inactive", "Red (inactive/expired)"], ["pending", "Amber (in progress)"], ["planned", "Blue (planned)"]];
const FILES = { pub: "data/public.json", site: "data/site.enc.json", vault: "data/admin.enc.json" };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slugify = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const splitList = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
const splitLines = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);
const numOrNull = (v) => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
const newId = () => ZYCrypto.b64(crypto.getRandomValues(new Uint8Array(9))).replace(/[+/=]/g, "x");
const clone = (o) => JSON.parse(JSON.stringify(o));

// S.V is the decrypted working copy ("vault"): { version, public, content: { tabs, resume }, members }
const S = { V: null, gh: null, key: null, salt: null, iter: null, vaultSha: null, view: "site", tabId: null, dirty: false, unpublished: false };
const tabs = () => S.V.content.tabs;
const findTab = (id) => tabs().find((t) => t.id === id);
const cats = () => S.V.categories.slice().sort(byOrder);
const catOf = (t) => S.V.categories.find((c) => c.id === t.category);
const isLocked = (t) => !!catOf(t)?.locked;
const catOptions = () => [...cats().map((c) => [c.id, `${c.name}${c.locked ? " (members only)" : " (public)"}`]), ["", "Top level — its own tab in the menu (public)"]];

// Bring older data up to the categories model. Returns true if anything changed.
function migrate(V) {
  let touched = false;
  if (!Array.isArray(V.categories)) { V.categories = clone(DEFAULT_CATEGORIES); touched = true; }
  V.content.tabs.forEach((t) => {
    if (t.category === undefined) { t.category = t.layout === "home" ? "" : (DEFAULT_CAT_OF[t.id] ?? "stories"); touched = true; }
  });
  if (V.content.resumeAccess === undefined) { V.content.resumeAccess = "public"; touched = true; }
  if (!V.version || V.version < 2) {
    V.version = 2; touched = true;
    if (V.public.tagline === OLD_TAGLINE) V.public.tagline = "Stories are shared with members. Sign in to read them.";
    const lockedIds = V.categories.filter((c) => c.locked).map((c) => c.id);
    if (lockedIds.length && !V.content.tabs.some((t) => lockedIds.includes(t.category)) && !V.content.tabs.some((t) => t.id === "journal")) {
      V.content.tabs.push({ id: "journal", title: "Journal", category: lockedIds[0], layout: "cards", visible: true,
        order: Math.max(-1, ...V.content.tabs.map((t) => t.order ?? 0)) + 1, heading: "Journal", intro: "Personal stories and updates for members.",
        summary: "Notes, letters and updates", summaryTags: [], note: "", sections: [], items: [] });
    }
  }
  if (V.version < 3) {
    V.version = 3; touched = true;
    V.public.accent = "#d6132a";
    const home = V.content.tabs.find((t) => t.layout === "home");
    if (home) { home.home ||= {}; if (!Array.isArray(home.home.pins) || !home.home.pins.length) home.home.pins = clone(DEFAULT_PINS); }
  }
  if (V.version < 4) {
    V.version = 4; touched = true;
    if (["#d6132a", "#1e3a5f", "#3967ac", ""].includes(String(V.public.accent || "").toLowerCase())) V.public.accent = "#2563eb";
  }
  return touched;
}
const DEFAULT_PINS = [{ label: "Singapore", lat: "1.352", lon: "103.82" }, { label: "Kuala Lumpur", lat: "3.139", lon: "101.687" }, { label: "Brisbane", lat: "-27.47", lon: "153.03" }];
// ─────────────────────────── UI helpers ───────────────────────────
function toast(msg, kind = "") {
  const t = Object.assign(document.createElement("div"), { className: "toast " + kind, textContent: msg });
  $("#toastRoot").append(t); setTimeout(() => t.remove(), 3200);
}
function errText(e) {
  if (e?.code === "bad-login") return e.message;
  return e?.message || String(e);
}
async function busy(btn, fn) {
  const label = btn?.textContent; if (btn) { btn.disabled = true; btn.textContent = "Working…"; }
  try { return await fn(); } catch (e) { console.error(e); toast(errText(e), "err"); }
  finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
}

function modal({ title, body, okText = "Save", danger = false, wide = false, onOk }) {
  return new Promise((resolve) => {
    const root = $("#modalRoot");
    const wrap = document.createElement("div");
    wrap.className = "modal-wrap";
    wrap.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-x aria-label="Close">✕</button></div>
      <div class="modal-body"></div>
      <div class="modal-foot"><button class="btn ghost" data-x>Cancel</button><button class="btn ${danger ? "danger" : "primary"}" data-ok>${esc(okText)}</button></div>
    </div>`;
    const bodyEl = $(".modal-body", wrap);
    if (typeof body === "string") bodyEl.innerHTML = body; else if (body) bodyEl.append(body);
    const close = (v) => { wrap.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") close(false); };
    document.addEventListener("keydown", onKey);
    $$("[data-x]", wrap).forEach((b) => b.addEventListener("click", () => close(false)));
    wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) close(false); });
    $("[data-ok]", wrap).addEventListener("click", async (e) => {
      if (!onOk) return close(true);
      const btn = e.currentTarget; btn.disabled = true;
      try { const r = await onOk(bodyEl); if (r !== false) close(r ?? true); }
      catch (err) { console.error(err); toast(errText(err), "err"); }
      finally { btn.disabled = false; }
    });
    root.append(wrap);
    setTimeout(() => { if (!wrap.contains(document.activeElement)) $("input, textarea, select", bodyEl)?.focus(); }, 30);
  });
}
const confirmBox = (title, text, okText = "Delete") => modal({ title, body: `<p>${esc(text)}</p>`, okText, danger: true });

// Image field: upload (auto-resized), paste URL, or remove.
function imageField({ label, value = "", max = 160, hint = "" }) {
  const el = document.createElement("div");
  el.className = "field img-field";
  let current = value || "";
  el.innerHTML = `<span class="lbl">${esc(label)}</span>
    <div class="img-row">
      <div class="img-preview"></div>
      <div class="img-actions">
        <label class="btn ghost small">Upload image<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden/></label>
        <button type="button" class="btn ghost small" data-url>Use URL</button>
        <button type="button" class="btn ghost small" data-rm>Remove</button>
      </div>
    </div>
    ${hint ? `<div class="hint">${esc(hint)}</div>` : ""}`;
  const prev = $(".img-preview", el);
  const paint = () => {
    prev.innerHTML = current ? `<img src="${esc(current)}" alt=""/>` : `<span class="muted small">None</span>`;
    $("[data-rm]", el).hidden = !current;
  };
  paint();
  $("input[type=file]", el).addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { current = await fileToImage(f, max); paint(); el.dispatchEvent(new Event("input", { bubbles: true })); }
    catch (err) { toast(err.message, "err"); }
    e.target.value = "";
  });
  $("[data-url]", el).addEventListener("click", async () => {
    const r = await modal({ title: "Image URL", body: `<label class="field"><span class="lbl">https:// address of the image</span><input id="imgUrl" placeholder="https://…" value="${esc(current.startsWith("http") ? current : "")}"/></label>`, okText: "Use",
      onOk: (b) => { const v = $("#imgUrl", b).value.trim(); if (v && !/^https:\/\//i.test(v)) { toast("URL must start with https://", "err"); return false; } return v || ""; } });
    if (r !== false) { current = r === true ? "" : r; paint(); el.dispatchEvent(new Event("input", { bubbles: true })); }
  });
  $("[data-rm]", el).addEventListener("click", () => { current = ""; paint(); el.dispatchEvent(new Event("input", { bubbles: true })); });
  el.getValue = () => current;
  return el;
}

function fileToImage(file, max) {
  return new Promise((resolve, reject) => {
    if (file.size > 8 * 1024 * 1024) return reject(new Error("Image is larger than 8 MB."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const dataUrl = reader.result;
      if (file.type === "image/svg+xml") {
        if (dataUrl.length > 80000) return reject(new Error("SVG is too large (keep it under ~60 KB)."));
        return resolve(dataUrl);
      }
      const img = new Image();
      img.onerror = () => reject(new Error("That file isn't a readable image."));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
        const c = Object.assign(document.createElement("canvas"), { width: w, height: h });
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        let out = c.toDataURL("image/webp", 0.9);
        if (!out.startsWith("data:image/webp")) out = c.toDataURL("image/png");
        resolve(out);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

// Repeatable rows editor (sections, contact rows, stats, buttons).
function rowsEditor({ label, rows = [], fields, addText = "Add row", hint = "" }) {
  const el = document.createElement("div");
  el.className = "field rows-field";
  let data = rows.map((r) => ({ ...r }));
  const draw = () => {
    el.innerHTML = `<span class="lbl">${esc(label)}</span>${hint ? `<div class="hint">${esc(hint)}</div>` : ""}
      <div class="rows">${data.map((r, i) => `
        <div class="row-ed" data-i="${i}">
          ${fields.map((f) => f.type === "select"
            ? `<select data-k="${f.key}" aria-label="${esc(f.label)}">${f.options().map(([v, t]) => `<option value="${esc(v)}" ${String(r[f.key] ?? "") === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`
            : `<input data-k="${f.key}" placeholder="${esc(f.label)}" aria-label="${esc(f.label)}" value="${esc(r[f.key] ?? "")}" style="flex:${f.flex || 1}"/>`).join("")}
          <button type="button" class="icon-btn" data-up title="Move up" ${i === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="icon-btn" data-down title="Move down" ${i === data.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" class="icon-btn danger" data-del title="Remove">✕</button>
        </div>`).join("")}</div>
      <button type="button" class="btn ghost small" data-add>＋ ${esc(addText)}</button>`;
  };
  draw();
  el.addEventListener("input", (e) => { const row = e.target.closest(".row-ed"); if (row && e.target.dataset.k) data[+row.dataset.i][e.target.dataset.k] = e.target.value; });
  el.addEventListener("change", (e) => { const row = e.target.closest(".row-ed"); if (row && e.target.dataset.k) data[+row.dataset.i][e.target.dataset.k] = e.target.value; });
  el.addEventListener("click", (e) => {
    const row = e.target.closest(".row-ed"); const i = row ? +row.dataset.i : -1;
    if (e.target.closest("[data-add]")) { const blank = {}; fields.forEach((f) => (blank[f.key] = f.type === "select" ? f.options()[0][0] : "")); data.push(blank); draw(); $$(".row-ed input", el).at(-1)?.focus(); }
    else if (e.target.closest("[data-del]")) { data.splice(i, 1); draw(); }
    else if (e.target.closest("[data-up]") && i > 0) { [data[i - 1], data[i]] = [data[i], data[i - 1]]; draw(); }
    else if (e.target.closest("[data-down]") && i < data.length - 1) { [data[i + 1], data[i]] = [data[i], data[i + 1]]; draw(); }
    else return;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  el.getValue = () => data.map((r) => ({ ...r }));
  return el;
}

const field = (label, html, hint = "") => `<label class="field"><span class="lbl">${esc(label)}</span>${html}${hint ? `<span class="hint">${esc(hint)}</span>` : ""}</label>`;
const input = (name, value = "", attrs = "") => `<input name="${name}" value="${esc(value)}" ${attrs}/>`;
const textarea = (name, value = "", rows = 3, attrs = "") => `<textarea name="${name}" rows="${rows}" ${attrs}>${esc(value)}</textarea>`;
const select = (name, opts, value) => `<select name="${name}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(value ?? "") ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;


// ─────────────────────────── GitHub ───────────────────────────
function ghError(status, body) {
  let msg = body?.message || `GitHub error ${status}`;
  if (status === 401) msg = "GitHub rejected the token. Check it hasn't expired and was copied fully.";
  if (status === 403 && /rate limit/i.test(msg)) msg = "GitHub rate limit reached. Try again in a few minutes.";
  else if (status === 403) msg = "The token doesn't have permission to write to this repository (needs Contents: Read and write).";
  if (status === 404) msg = "Repository not found — check the name, and that the token has access to it.";
  return Object.assign(new Error(msg), { status });
}
async function gh(method, path, body, { allow404 = false } = {}) {
  const r = await fetch(`https://api.github.com/repos/${S.gh.owner}/${S.gh.repo}${path}`, {
    method, cache: "no-store",
    headers: { Authorization: `Bearer ${S.gh.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 404 && allow404) return null;
  const data = r.status === 204 ? null : await r.json().catch(() => ({}));
  if (!r.ok) throw ghError(r.status, data);
  return data;
}
const utf8 = (b64s) => new TextDecoder().decode(ZYCrypto.unb64(b64s.replace(/\n/g, "")));
async function readRepoFile(path) {
  const meta = await gh("GET", `/contents/${path}?ref=${encodeURIComponent(S.gh.branch)}`, null, { allow404: true });
  if (!meta) return null;
  let text;
  if (meta.content && meta.encoding === "base64") text = utf8(meta.content);
  else { const blob = await gh("GET", `/git/blobs/${meta.sha}`); text = utf8(blob.content); } // files > 1 MB
  return { sha: meta.sha, text };
}
async function commitFiles(files, message) {
  for (let attempt = 0; ; attempt++) {
    const ref = await gh("GET", `/git/ref/heads/${encodeURIComponent(S.gh.branch)}`);
    const base = ref.object.sha;
    const head = await gh("GET", `/git/commits/${base}`);
    const entries = [];
    for (const f of files) {
      const blob = await gh("POST", "/git/blobs", { content: f.text, encoding: "utf-8" });
      entries.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const tree = await gh("POST", "/git/trees", { base_tree: head.tree.sha, tree: entries });
    const commit = await gh("POST", "/git/commits", { message, tree: tree.sha, parents: [base] });
    try { await gh("PATCH", `/git/refs/heads/${encodeURIComponent(S.gh.branch)}`, { sha: commit.sha }); return { commit, entries }; }
    catch (e) { if (e.status === 422 && attempt < 2) continue; throw e; }
  }
}

// ─────────────────────────── Working copy, draft, publish ───────────────────────────
const draftKey = () => `zy_admin_draft:${S.gh.owner}/${S.gh.repo}`;
let draftTimer = null;
function changed() {
  S.unpublished = true; paintPublishBar();
  clearTimeout(draftTimer);
  draftTimer = setTimeout(async () => {
    if (!S.unpublished) return;
    try { const sealed = await ZYCrypto.sealVault(S.V, S.key, S.salt, S.iter); localStorage.setItem(draftKey(), JSON.stringify({ savedAt: Date.now(), baseSha: S.vaultSha, sealed })); } catch {}
  }, 400);
}
function paintPublishBar() {
  $("#publishBar").hidden = !S.unpublished;
  const n = S.V.members.filter((m) => m.status === "active").length;
  $("#publishNote").textContent = S.unpublished ? `Unpublished changes · ${n} active member${n === 1 ? "" : "s"} can read members-only pages` : "";
}
function cleanTab(t) {
  const { createdAt, ...rest } = clone(t);
  rest.items = (rest.items || []).sort(byOrder).map(({ id, ...i }) => i);
  return rest;
}
const visibleTabs = () => tabs().filter((t) => t.visible).sort(byOrder);
const resumePublic = () => !!S.V.content.resume && S.V.content.resumeAccess === "public";
// data/public.json — readable by anyone: branding, categories, public pages.
function publicBuild() {
  const lockedCount = {};
  visibleTabs().filter(isLocked).forEach((t) => (lockedCount[t.category] = (lockedCount[t.category] || 0) + 1));
  return { ...S.V.public, version: 3, updated: new Date().toISOString(), categories: cats(),
    tabs: visibleTabs().filter((t) => !isLocked(t)).map(cleanTab), lockedCount,
    resume: resumePublic() ? S.V.content.resume : null, membersResume: !!S.V.content.resume && !resumePublic() };
}
// data/site.enc.json — encrypted: members-only pages (+ resume if members-only).
function memberBuild() {
  return { version: 2, tabs: visibleTabs().filter(isLocked).map(cleanTab), resume: resumePublic() ? null : (S.V.content.resume || null) };
}
async function publish(btn) {
  const active = S.V.members.filter((m) => m.status === "active");
  if (!active.length && visibleTabs().some(isLocked) && !(await modal({ title: "No active members", body: "<p>Nobody will be able to open members-only pages until you add at least one member (you can add yourself). Publish anyway?</p>", okText: "Publish anyway" }))) return;
  clearTimeout(draftTimer);
  await busy(btn, async () => {
    const current = await gh("GET", `/contents/${FILES.vault}?ref=${encodeURIComponent(S.gh.branch)}`, null, { allow404: true });
    if (current && S.vaultSha && current.sha !== S.vaultSha) {
      if (!(await modal({ title: "Newer version on GitHub", body: "<p>The admin data on GitHub changed since you signed in (maybe from another computer). Publishing will overwrite those changes.</p>", okText: "Overwrite", danger: true }))) return;
    }
    const pub = publicBuild();
    const site = await ZYCrypto.sealSite(memberBuild(), active.map((m) => ({ id: m.id, salt: m.salt, iter: m.iter, kek: m.kek })));
    const vault = await ZYCrypto.sealVault(S.V, S.key, S.salt, S.iter);
    const res = await commitFiles([
      { path: FILES.pub, text: JSON.stringify(pub, null, 1) },
      { path: FILES.site, text: JSON.stringify(site) },
      { path: FILES.vault, text: JSON.stringify(vault) },
    ], `Update site content (${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC)`);
    S.vaultSha = res.entries.find((e) => e.path === FILES.vault).sha;
    S.unpublished = false; paintPublishBar(); S.lastPublished = new Date().toISOString();
    try { localStorage.removeItem(draftKey()); } catch {}
    toast("Published — zy-profile.com updates in about a minute.", "ok");
  });
}

// ─────────────────────────── Shell ───────────────────────────
function drawSidebar() {
  const link = (t) => `
    <button class="side-link sub ${S.view === "tab" && S.tabId === t.id ? "active" : ""}" data-tab="${esc(t.id)}">
      <span class="ell">${esc(t.title || t.id)}</span>${t.visible ? "" : '<span class="pill grey" title="Hidden — not published">hidden</span>'}
    </button>`;
  const all = tabs().slice().sort(byOrder);
  const known = new Set(S.V.categories.map((c) => c.id));
  const top = all.filter((t) => !t.category || !known.has(t.category));
  $("#tabList").innerHTML = (top.length ? `<div class="side-cat">Top level</div>${top.map(link).join("")}` : "")
    + cats().map((c) => `<div class="side-cat">${esc(c.name)}${c.locked ? ' <span title="Members only">🔒</span>' : ""}</div>`
      + (all.filter((t) => t.category === c.id).map(link).join("") || '<div class="muted small pad side-empty">No pages</div>')).join("");
  $$(".side-link[data-view]").forEach((b) => b.classList.toggle("active", S.view === b.dataset.view));
  const n = S.V.members.filter((m) => m.status === "active").length;
  $("#memberCount").textContent = n; $("#memberCount").hidden = false;
}
async function go(view, tabId = null) {
  if (S.dirty && !(await modal({ title: "Discard changes?", body: "<p>You have unsaved changes on this screen.</p>", okText: "Discard", danger: true }))) return;
  S.dirty = false; S.view = view; S.tabId = tabId;
  document.body.classList.remove("side-open");
  drawSidebar();
  const v = $("#view"); v.onclick = null; v.innerHTML = "";
  try {
    if (S.cleanup) { try { S.cleanup(); } catch {} S.cleanup = null; }
    if (view === "overview") overviewView(v);
    else if (view === "globe") globeView(v);
    else if (view === "site") siteView(v);
    else if (view === "categories") categoriesView(v);
    else if (view === "tab") tabView(v, tabId);
    else if (view === "members") membersView(v);
    else if (view === "backup") backupView(v);
  } catch (e) { console.error(e); v.innerHTML = `<div class="panel"><p class="msg err">${esc(errText(e))}</p></div>`; }
  window.scrollTo(0, 0);
}
function trackDirty(root) { root.addEventListener("input", () => (S.dirty = true)); root.addEventListener("change", () => (S.dirty = true)); }

$(".side-nav").addEventListener("click", (e) => {
  const b = e.target.closest("[data-view],[data-tab]"); if (!b) return;
  if (b.dataset.tab) go("tab", b.dataset.tab); else go(b.dataset.view);
});
$("#sideToggle").addEventListener("click", () => document.body.classList.toggle("side-open"));
$("#newTabBtn").addEventListener("click", newTabDialog);
$("#publishBtn").addEventListener("click", (e) => publish(e.currentTarget));
$("#lockBtn").addEventListener("click", async () => {
  if (S.unpublished && !(await modal({ title: "Lock with unpublished changes?", body: "<p>Your changes are kept as an encrypted draft on this computer and offered again next time you sign in.</p>", okText: "Lock" }))) return;
  location.reload();
});
window.addEventListener("beforeunload", (e) => { if (S.dirty || S.unpublished) { e.preventDefault(); e.returnValue = ""; } });

// ─────────────────────────── Site settings ───────────────────────────
function siteView(v) {
  const s = S.V.public;
  const resume = S.V.content.resume;
  v.innerHTML = `
    <header class="view-head"><div><h1>Site settings</h1><p class="muted">Branding and footer. These are public, so keep anything private out of them.</p></div>
      <button class="btn primary" id="saveSite">Save settings</button></header>
    <form class="panel grid2" id="siteForm" onsubmit="return false">
      ${field("Site name", input("name", s.name, 'maxlength="80"'))}
      ${field("Nav logo text", input("logoText", s.logoText, 'maxlength="40"'), "Shown next to the logo in the top bar.")}
      <div class="span2" id="logoSlot"></div>
      <div class="span2">${field("Sign-in message", textarea("tagline", s.tagline, 2, 'maxlength="300"'), "Shown when a visitor opens a members-only page.")}</div>
      ${field("Footer text", input("footer", s.footer, 'maxlength="160"'))}
      ${field("Brand colour", `<input name="accent" type="color" value="${esc(/^#[0-9a-f]{6}$/i.test(s.accent || "") ? s.accent : "#2563eb")}"/>`, "Buttons, glow, highlights. Tech blue by default.")}
      <div class="span2">${field("“Request access” email (optional)", input("requestEmail", s.requestEmail, 'type="email" placeholder="you@example.com"'), "If set, the sign-in page shows a Request access link that opens an email to this address. It will be visible publicly.")}</div>
    </form>
    <section class="panel">
      <h2>Resume (PDF)</h2>
      <p class="muted small">Shown as a Resume button in the top bar. Max 700 KB.</p>
      <label class="field" style="max-width:360px;margin-bottom:.75rem"><span class="lbl">Who can download it</span>${select("resumeAccess", [["public", "Everyone"], ["members", "Signed-in members only (encrypted)"]], S.V.content.resumeAccess || "public")}</label>
      <div class="resume-row">
        <div>${resume?.dataUrl ? `<b>${esc(resume.fileName || "resume.pdf")}</b> <span class="muted small">· ${Math.round(resume.dataUrl.length * 0.75 / 1024)} KB</span>` : '<span class="muted">No resume uploaded.</span>'}</div>
        <label class="btn ghost small">${resume?.dataUrl ? "Replace PDF" : "Upload PDF"}<input type="file" id="resumeFile" accept="application/pdf" hidden/></label>
        ${resume?.dataUrl ? '<button class="btn ghost small danger-text" id="resumeRm">Remove</button>' : ""}
      </div>
    </section>`;
  const logo = imageField({ label: "Logo image", value: s.logo, max: 240, hint: "PNG, SVG or WebP with a transparent background works best. Resized automatically." });
  $("#logoSlot", v).append(logo);
  trackDirty($("#siteForm", v));
  $("#saveSite", v).addEventListener("click", () => {
    const f = $("#siteForm", v);
    const email = f.requestEmail.value.trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast("That email address doesn't look right.", "err");
    Object.assign(S.V.public, { name: f.name.value.trim(), logoText: f.logoText.value.trim(), logo: logo.getValue(), tagline: f.tagline.value.trim(), footer: f.footer.value.trim(), accent: f.accent.value, requestEmail: email });
    S.dirty = false; changed(); toast("Settings saved — publish to make them live", "ok");
  });
  $("[name=resumeAccess]", v).addEventListener("change", (e) => { S.V.content.resumeAccess = e.target.value; changed(); toast("Resume access updated — publish to apply", "ok"); });
  $("#resumeFile", v).addEventListener("change", (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (file.type !== "application/pdf") return toast("Please choose a PDF.", "err");
    if (file.size > 700 * 1024) return toast("PDF is larger than 700 KB. Compress it first.", "err");
    const reader = new FileReader();
    reader.onload = () => { S.V.content.resume = { fileName: file.name, dataUrl: reader.result }; changed(); toast("Resume added", "ok"); S.dirty = false; go("site"); };
    reader.readAsDataURL(file);
  });
  $("#resumeRm", v)?.addEventListener("click", async () => {
    if (!(await confirmBox("Remove resume?", "Members will no longer see the Resume button."))) return;
    S.V.content.resume = null; changed(); S.dirty = false; go("site");
  });
}

// ─────────────────────────── Pages (tabs) ───────────────────────────
async function newTabDialog() {
  const wrap = document.createElement("form"); wrap.onsubmit = () => false;
  wrap.innerHTML = `
    ${field("Page name (shown in the menu)", input("title", "", 'maxlength="40" required placeholder="e.g. Shareholder Updates"'))}
    ${field("Web address", `<div class="prefix"><span>zy-profile.com/#/</span>${input("id", "", 'maxlength="40" placeholder="shareholder-updates"')}</div>`, "Lowercase letters, numbers and dashes. Can't be changed later.")}
    ${field("Category (menu dropdown)", select("category", catOptions(), cats()[0]?.id || ""))}
    ${field("Layout", select("layout", LAYOUTS.filter(([k]) => k !== "home"), "list"))}
    <label class="check"><input type="checkbox" name="visible"/> Publish straight away (otherwise kept as a hidden draft)</label>`;
  const idIn = $("[name=id]", wrap); let touched = false;
  idIn.addEventListener("input", () => (touched = true));
  $("[name=title]", wrap).addEventListener("input", (e) => { if (!touched) idIn.value = slugify(e.target.value); });
  const created = await modal({
    title: "New page", body: wrap, okText: "Create page",
    onOk: () => {
      const title = $("[name=title]", wrap).value.trim();
      const id = slugify(idIn.value || title);
      if (!title) { toast("Give the page a name.", "err"); return false; }
      if (!id || RESERVED_IDS.includes(id)) { toast("Choose a different web address.", "err"); return false; }
      if (findTab(id)) { toast("A page with that address already exists.", "err"); return false; }
      const order = Math.max(-1, ...tabs().map((t) => t.order ?? 0)) + 1;
      tabs().push({ id, title, category: $("[name=category]", wrap).value, layout: $("[name=layout]", wrap).value, visible: $("[name=visible]", wrap).checked, order,
        heading: title, intro: "", summary: "", summaryTags: [], note: "", sections: [], items: [] });
      changed();
      return id;
    }
  });
  if (created) { toast("Page created", "ok"); go("tab", created); }
}

function tabView(v, tabId) {
  const tab = findTab(tabId);
  if (!tab) { v.innerHTML = `<div class="panel">That page no longer exists.</div>`; return; }
  const isHome = tab.layout === "home";
  const ordered = tabs().slice().sort(byOrder);
  const idx = ordered.indexOf(tab);
  const h = tab.home || {};
  tab.items ||= [];

  v.innerHTML = `
    <header class="view-head">
      <div><div class="crumb">${esc(catOf(tab)?.name || "Top level")}${isLocked(tab) ? " 🔒" : ""} / <code>#/${esc(tab.id)}</code></div><h1>${esc(tab.title)}</h1></div>
      <div class="head-actions">
        <button class="btn ghost small" id="moveL" ${idx === 0 ? "disabled" : ""} title="Move earlier in the menu">← Move</button>
        <button class="btn ghost small" id="moveR" ${idx === ordered.length - 1 ? "disabled" : ""} title="Move later in the menu">Move →</button>
        <button class="btn primary" id="saveTab">Save page</button>
      </div>
    </header>

    <form class="panel grid2" id="tabForm" onsubmit="return false">
      <h2 class="span2">Page details</h2>
      ${field("Menu name", input("title", tab.title, 'maxlength="40"'))}
      ${field("Layout", select("layout", LAYOUTS, tab.layout))}
      <div class="span2">${field("Category (menu dropdown)", select("category", catOptions(), tab.category ?? ""), "Pages in a members-only category are encrypted and need a sign-in.")}</div>
      <label class="check span2"><input type="checkbox" name="visible" ${tab.visible ? "checked" : ""}/> Published <span class="muted small">(untick to keep as a hidden draft — hidden pages are not published at all)</span></label>
      ${isHome ? "" : `
        ${field("Page heading", input("heading", tab.heading, 'maxlength="80"'))}
        ${field("Intro line", input("intro", tab.intro, 'maxlength="200"'))}
        <div class="span2">${field("Note at bottom of page (optional)", textarea("note", tab.note, 2), "Shown in a grey box, e.g. a disclaimer.")}</div>
        ${field("Home overview summary", input("summary", tab.summary, 'maxlength="140"'), "Short line on this page's card on the Home page.")}
        ${field("Home overview tags", input("summaryTags", (tab.summaryTags || []).join(", ")), "Comma separated.")}
        <div class="span2" id="sectionsSlot"></div>`}
    </form>

    ${isHome ? `
    <form class="panel grid2" id="homeForm" onsubmit="return false">
      <h2 class="span2">Hero</h2>
      ${field("Name", input("name", h.name))}
      ${field("Big headline (optional)", input("headline", h.headline, 'maxlength="80" placeholder="Leave empty to show your name"'), "The large centred text at the top.")}
      <div id="photoSlot"></div>
      <div class="span2">${field("Title lines", textarea("titleLines", h.titleLines, 2), "One line per row.")}</div>
      <div class="span2">${field("Bio", textarea("bio", h.bio, 4))}</div>
      <div class="span2" id="buttonsSlot"></div>
      <h2 class="span2">Globe</h2>
      <div class="span2 globe-link"><button type="button" class="btn" data-goto-globe>🌐 Edit globe places (${(h.pins || DEFAULT_PINS).length})</button> <span class="hint">Search cities or click on the globe to add places.</span></div>
      <h2 class="span2">Contact card</h2>
      ${field("Card title", input("contactTitle", h.contactTitle))}
      ${field("Card subtitle", input("contactSub", h.contactSub))}
      <div class="span2" id="contactSlot"></div>
      <h2 class="span2">Stats &amp; overview</h2>
      <div class="span2" id="statsSlot"></div>
      ${field("Overview heading", input("overviewHeading", h.overviewHeading || "Site Overview"))}
      <label class="check"><input type="checkbox" name="showOverview" ${h.showOverview !== false ? "checked" : ""}/> Show overview cards for the other pages</label>
    </form>` : `
    <section class="panel">
      <div class="panel-head"><h2>Items <span class="muted small">(${tab.items.length})</span></h2><button class="btn primary small" id="addItem">＋ Add item</button></div>
      <div id="itemList"></div>
    </section>`}

    <section class="panel danger-zone">
      <h2>Delete page</h2>
      <p class="muted small">Removes this page and all of its items (after you publish). Export a backup first if unsure.</p>
      <button class="btn danger small" id="delTab">Delete “${esc(tab.title)}”</button>
    </section>`;

  const form = $("#tabForm", v);
  trackDirty(form);
  let sections = null;
  if (!isHome) {
    sections = rowsEditor({ label: "Sections (optional groups inside the page)", rows: tab.sections || [], addText: "Add section",
      hint: "e.g. Active / Inactive / Planned. Items without a section appear first.", fields: [{ key: "title", label: "Section title", flex: 3 }] });
    $("#sectionsSlot", v).append(sections);
    drawItems(v, tab);
    $("#addItem", v).addEventListener("click", () => itemDialog(tab));
  }

  let home = null;
  if (isHome) {
    const hf = $("#homeForm", v); trackDirty(hf);
    const tabOpts = () => tabs().slice().sort(byOrder).map((t) => [t.id, `Page: ${t.title}`]);
    home = {
      form: hf,
      photo: imageField({ label: "Photo (optional)", value: h.photo, max: 320 }),
      buttons: rowsEditor({ label: "Buttons", rows: h.buttons || [], addText: "Add button", fields: [{ key: "label", label: "Label" }, { key: "target", label: "Links to", type: "select", options: tabOpts }, { key: "style", label: "Style", type: "select", options: () => [["primary", "Solid"], ["outline", "Outline"]] }] }),
      contact: rowsEditor({ label: "Contact rows", rows: h.contact || [], addText: "Add row", fields: [{ key: "label", label: "Label" }, { key: "value", label: "Value", flex: 2 }] }),
      stats: rowsEditor({ label: "Stats strip", rows: h.stats || [], addText: "Add stat", fields: [{ key: "num", label: "Number" }, { key: "label", label: "Label", flex: 2 }] }),
    };
    $("#photoSlot", v).append(home.photo); $("#buttonsSlot", v).append(home.buttons);
    $("#contactSlot", v).append(home.contact); $("#statsSlot", v).append(home.stats);
    $("[data-goto-globe]", v).addEventListener("click", () => go("globe"));
  }

  $("#saveTab", v).addEventListener("click", () => {
    const data = { title: form.title.value.trim() || tab.id, layout: form.layout.value, visible: form.visible.checked, category: form.category.value };
    if (!isHome) {
      Object.assign(data, { heading: form.heading.value.trim(), intro: form.intro.value.trim(), note: form.note.value.trim(), summary: form.summary.value.trim(), summaryTags: splitList(form.summaryTags.value) });
      const used = new Set();
      data.sections = sections.getValue().filter((s) => s.title.trim()).map((s) => {
        let id = s.id || slugify(s.title) || "section"; while (used.has(id)) id += "-2"; used.add(id);
        return { id, title: s.title.trim() };
      });
    } else {
      const hf = home.form;
      data.home = { headline: hf.headline.value.trim(), pins: h.pins || clone(DEFAULT_PINS), arcs: h.arcs !== false, name: hf.name.value.trim(), photo: home.photo.getValue(), titleLines: hf.titleLines.value.trim(), bio: hf.bio.value.trim(),
        buttons: home.buttons.getValue().filter((b) => b.label.trim()), contactTitle: hf.contactTitle.value.trim(), contactSub: hf.contactSub.value.trim(),
        contact: home.contact.getValue().filter((r) => r.label.trim() || r.value.trim()), stats: home.stats.getValue().filter((r) => r.num.trim() || r.label.trim()),
        overviewHeading: hf.overviewHeading.value.trim(), showOverview: hf.showOverview.checked };
    }
    Object.assign(tab, data); S.dirty = false; changed();
    toast("Page saved — publish to make it live", "ok");
    go("tab", tab.id);
  });

  const move = (dir) => {
    const j = idx + dir; if (!ordered[j]) return;
    [ordered[idx], ordered[j]] = [ordered[j], ordered[idx]];
    ordered.forEach((t, n) => (t.order = n));
    S.dirty = false; changed(); go("tab", tab.id);
  };
  $("#moveL", v).addEventListener("click", () => move(-1));
  $("#moveR", v).addEventListener("click", () => move(1));

  $("#delTab", v).addEventListener("click", async () => {
    if (!(await confirmBox(`Delete “${tab.title}”?`, "This page and all of its items will be removed."))) return;
    S.V.content.tabs = tabs().filter((t) => t !== tab); S.dirty = false; changed();
    toast("Page deleted"); const first = tabs().slice().sort(byOrder)[0]; go(first ? "tab" : "site", first?.id);
  });
}

function logoFor(i) {
  if (i.logo) return i.logo;
  let d = (i.logoDomain || "").trim();
  if (!d && i.link?.url) { try { d = new URL(i.link.url).hostname; } catch {} }
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  return d && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d) ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128` : "";
}

function drawItems(v, tab) {
  const items = tab.items.slice().sort(byOrder);
  const secs = tab.sections || [];
  const known = new Set(secs.map((s) => s.id));
  const groups = [{ id: "", title: secs.length ? "No section" : "", items: items.filter((i) => !i.section || !known.has(i.section)) },
    ...secs.map((s) => ({ id: s.id, title: s.title, items: items.filter((i) => i.section === s.id) }))].filter((g) => g.items.length || g.id);
  const list = $("#itemList", v);
  list.innerHTML = items.length ? groups.map((g) => `
    ${g.title ? `<div class="group-title">${esc(g.title)} <span class="muted small">${g.items.length}</span></div>` : ""}
    ${g.items.map((i) => {
      const pos = items.indexOf(i); const logo = logoFor(i);
      return `<div class="item-row" data-id="${esc(i.id)}">
        <div class="item-thumb">${logo ? `<img src="${esc(logo)}" alt="" onerror="this.remove()"/>` : ""}</div>
        <div class="item-main"><div class="item-t">${esc(i.title || "(untitled)")}</div><div class="item-s muted small">${esc([i.subtitle, i.meta, i.badge?.text].filter(Boolean).join(" · "))}</div></div>
        <div class="item-acts">
          <button class="icon-btn" data-act="up" title="Move up" ${pos === 0 ? "disabled" : ""}>↑</button>
          <button class="icon-btn" data-act="down" title="Move down" ${pos === items.length - 1 ? "disabled" : ""}>↓</button>
          <button class="btn ghost small" data-act="edit">Edit</button>
          <button class="icon-btn" data-act="dup" title="Duplicate">⧉</button>
          <button class="icon-btn danger" data-act="del" title="Delete">✕</button>
        </div></div>`;
    }).join("") || '<div class="muted small pad">Empty section.</div>'}`).join("")
    : `<div class="empty">No items yet. Click <b>Add item</b> to create the first one.</div>`;

  list.onclick = async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const id = b.closest(".item-row").dataset.id;
    const item = items.find((x) => x.id === id); const pos = items.indexOf(item);
    const act = b.dataset.act;
    const redraw = () => { changed(); drawItems(v, tab); $(".panel-head h2 .muted", v).textContent = `(${tab.items.length})`; };
    if (act === "edit") return itemDialog(tab, item);
    if (act === "dup") {
      const copy = { ...clone(item), id: newId(), title: `${item.title} (copy)`, order: Math.max(...items.map((x) => x.order ?? 0)) + 1 };
      tab.items.push(copy); redraw(); return toast("Duplicated", "ok");
    }
    if (act === "del") {
      if (!(await confirmBox("Delete item?", `“${item.title}” will be removed.`))) return;
      tab.items = tab.items.filter((x) => x.id !== id); redraw(); return toast("Item deleted");
    }
    if (act === "up" || act === "down") {
      const j = pos + (act === "up" ? -1 : 1); if (!items[j]) return;
      const arr = items.slice(); [arr[pos], arr[j]] = [arr[j], arr[pos]];
      arr.forEach((x, n) => (x.order = n)); redraw();
    }
  };
}

async function itemDialog(tab, item = null) {
  const i = item || { section: "", title: "", ticker: "", subtitle: "", body: "", bullets: [], tags: [], tagsLabel: "", badge: { text: "", tone: "neutral" }, meta: "", meta2: "", link: { url: "", label: "" }, logo: "", logoDomain: "", rating: null, progress: null };
  const secOpts = [["", "— No section —"], ...(tab.sections || []).map((s) => [s.id, s.title])];
  const f = document.createElement("form"); f.className = "grid2"; f.onsubmit = () => false;
  f.innerHTML = `
    <div class="span2">${field("Title *", input("title", i.title, 'required maxlength="140"'))}</div>
    ${field("Subtitle", input("subtitle", i.subtitle, 'maxlength="200"'), "e.g. Role · Organisation · Location")}
    ${field("Section", select("section", secOpts, i.section))}
    <div class="span2">${field("Description", textarea("body", i.body, 4))}</div>
    <div class="span2">${field("Bullet points", textarea("bullets", (i.bullets || []).join("\n"), 3), "One per line.")}</div>
    ${field("Tags", input("tags", (i.tags || []).join(", ")), "Comma separated.")}
    ${field("Tags heading (optional)", input("tagsLabel", i.tagsLabel, 'maxlength="40"'), "e.g. Capabilities, Modules")}
    ${field("Date / period", input("meta", i.meta, 'maxlength="60"'), "Shown top-right, e.g. Jan 2024 – Aug 2024")}
    ${field("Second line (right)", input("meta2", i.meta2, 'maxlength="60"'), "e.g. Second Class Honours, Target: 2027")}
    ${field("Badge text", input("badgeText", i.badge?.text, 'maxlength="30"'), "e.g. Active, Expired, Founder")}
    ${field("Badge colour", select("badgeTone", TONES, i.badge?.tone || "neutral"))}
    ${field("Link URL", input("linkUrl", i.link?.url, 'placeholder="https://…"'))}
    ${field("Link text", input("linkLabel", i.link?.label, 'maxlength="60"'), "Defaults to the website address.")}
    ${field("Ticker / code", input("ticker", i.ticker, 'maxlength="20"'), "Small grey label after the title, e.g. SGX: AIY")}
    ${field("Skill level", select("rating", [["", "None"], ["1", "●○○○○ 1"], ["2", "●●○○○ 2"], ["3", "●●●○○ 3"], ["4", "●●●●○ 4"], ["5", "●●●●● 5"]], i.rating ?? ""))}
    ${field("Progress %", input("progress", i.progress ?? "", 'type="number" min="0" max="100" placeholder="leave blank for none"'))}
    <div></div>
    <h3 class="span2 sub-h">Logo</h3>
    <div id="logoSlot" class="span2"></div>
    <div class="span2">${field("Auto logo from website", input("logoDomain", i.logoDomain, 'placeholder="e.g. uq.edu.au"'), "If no image is uploaded, the site's icon is fetched from this domain (or from the Link URL). Hidden automatically if none is found.")}</div>
    <div class="span2 auto-prev" id="autoPrev"></div>`;
  const logo = imageField({ label: "Upload logo (overrides auto logo)", value: i.logo, max: 160 });
  $("#logoSlot", f).append(logo);
  const none = "this.replaceWith(Object.assign(document.createElement('span'),{className:'muted small',textContent:'none found — will be hidden'}))";
  const paintAuto = () => {
    const src = logoFor({ logoDomain: f.logoDomain.value, link: { url: f.linkUrl.value } });
    $("#autoPrev", f).innerHTML = !logo.getValue() && src ? `<span class="muted small">Auto logo preview:</span> <img src="${esc(src)}" alt="" onload="if(this.naturalWidth<=16){${none}}" onerror="${none}"/>` : "";
  };
  paintAuto();
  f.logoDomain.addEventListener("change", paintAuto); f.linkUrl.addEventListener("change", paintAuto); logo.addEventListener("input", paintAuto);

  const ok = await modal({
    title: item ? "Edit item" : `New item in ${tab.title}`, body: f, wide: true, okText: item ? "Save item" : "Add item",
    onOk: () => {
      const title = f.title.value.trim();
      if (!title) { toast("Title is required.", "err"); f.title.focus(); return false; }
      const url = f.linkUrl.value.trim();
      if (url && !/^(https?:\/\/|mailto:|tel:)/i.test(url)) { toast("Link must start with https://", "err"); return false; }
      const data = {
        title, subtitle: f.subtitle.value.trim(), section: f.section.value, body: f.body.value.trim(), bullets: splitLines(f.bullets.value),
        tags: splitList(f.tags.value), tagsLabel: f.tagsLabel.value.trim(), meta: f.meta.value.trim(), meta2: f.meta2.value.trim(),
        badge: { text: f.badgeText.value.trim(), tone: f.badgeTone.value }, link: { url, label: f.linkLabel.value.trim() },
        ticker: f.ticker.value.trim(), rating: numOrNull(f.rating.value), progress: numOrNull(f.progress.value) === null ? null : Math.max(0, Math.min(100, Number(f.progress.value))),
        logo: logo.getValue(), logoDomain: f.logoDomain.value.trim(),
      };
      if (item) Object.assign(item, data);
      else tab.items.push({ id: newId(), order: Math.max(-1, ...tab.items.map((x) => x.order ?? 0)) + 1, ...data });
      changed();
      return true;
    }
  });
  if (ok) { toast(item ? "Item saved" : "Item added", "ok"); go("tab", tab.id); }
}

// ─────────────────────────── Overview ───────────────────────────
function ago(iso) {
  if (!iso) return "never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return "just now"; if (s < 3600) return `${Math.round(s / 60)} min ago`; if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}
function overviewView(v) {
  const all = tabs(), vis = all.filter((t) => t.visible), items = all.reduce((n, t) => n + (t.items || []).length, 0);
  const active = S.V.members.filter((m) => m.status === "active").length;
  const home = all.find((t) => t.layout === "home");
  const pins = home?.home?.pins || DEFAULT_PINS;
  const maxItems = Math.max(1, ...cats().map((c) => all.filter((t) => t.category === c.id).reduce((n, t) => n + (t.items || []).length, 0)));
  v.innerHTML = `
    <section class="hello">
      <h1>${new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening"}, ${esc((S.V.public.name || "").split(" ").slice(-1)[0] || "there")}.</h1>
      <p>${S.unpublished ? "You have unpublished changes. Publish when you're ready." : "Everything is published and live on zy-profile.com."}</p>
      <div class="btn-row">
        ${S.unpublished ? '<button class="btn white" data-q="publish">Publish now</button>' : ""}
        <a class="btn" href="${SITE_URL}" target="_blank" rel="noopener">View website ↗</a>
      </div>
    </section>
    <div class="stats">
      <div class="stat"><div class="k">Pages</div><div class="v">${vis.length}</div><div class="s">${all.length - vis.length} hidden draft${all.length - vis.length === 1 ? "" : "s"}</div></div>
      <div class="stat"><div class="k">Items</div><div class="v">${items}</div><div class="s">across all pages</div></div>
      <div class="stat"><div class="k">Members</div><div class="v">${active}</div><div class="s">can read members-only pages</div></div>
      <div class="stat"><div class="k">Last publish</div><div class="v" style="font-size:22px;padding:5px 0 3px">${esc(ago(S.lastPublished))}</div><div class="s">${S.unpublished ? "changes waiting" : "up to date"}</div></div>
    </div>
    <section class="panel"><h2>Quick actions</h2>
      <div class="quick">
        <button data-q="newtab"><span class="qi">＋</span><span><b>New page</b><small>Add a tab to the menu</small></span></button>
        <button data-q="globe"><span class="qi">🌐</span><span><b>Globe places</b><small>${pins.length} place${pins.length === 1 ? "" : "s"} on the globe</small></span></button>
        <button data-q="member"><span class="qi">👤</span><span><b>Add member</b><small>Give someone access to Stories</small></span></button>
        <button data-q="site"><span class="qi">🎨</span><span><b>Branding</b><small>Logo, colour, resume</small></span></button>
        <button data-q="categories"><span class="qi">◇</span><span><b>Categories</b><small>Works, Hobbies, Stories…</small></span></button>
        <button data-q="backup"><span class="qi">⤓</span><span><b>Backup</b><small>Download everything</small></span></button>
      </div>
    </section>
    <section class="panel"><h2>Content by category</h2>
      <div class="cat-bars">${cats().map((c) => {
        const ts = all.filter((t) => t.category === c.id), n = ts.reduce((k, t) => k + (t.items || []).length, 0);
        return `<div class="cat-bar"><b>${esc(c.name)}${c.locked ? " 🔒" : ""}</b><span class="track"><span style="width:${Math.round(n / maxItems * 100)}%"></span></span><span class="muted small">${ts.length} pg · ${n}</span></div>`;
      }).join("")}</div>
    </section>`;
  v.onclick = (e) => {
    const q = e.target.closest("[data-q]")?.dataset.q; if (!q) return;
    if (q === "publish") return publish(e.target.closest("button"));
    if (q === "newtab") return newTabDialog();
    if (q === "member") { go("members").then(() => addMemberDialog()); return; }
    go(q);
  };
}

// ─────────────────────────── Globe & places ───────────────────────────
async function geocode(q) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=en&q=${encodeURIComponent(q)}`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("Place search is busy. Try again in a moment.");
  return (await r.json()).map((x) => ({ label: x.name || String(x.display_name).split(",")[0], full: x.display_name, lat: (+x.lat).toFixed(3), lon: (+x.lon).toFixed(3) }));
}
async function reverseName(lat, lon) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=en&lat=${lat}&lon=${lon}`, { headers: { Accept: "application/json" } });
    const a = (await r.json()).address || {};
    return a.city || a.town || a.village || a.county || a.state || a.country || "New place";
  } catch { return "New place"; }
}
function globeView(v) {
  const home = tabs().find((t) => t.layout === "home");
  if (!home) { v.innerHTML = `<div class="panel"><h2>Globe & places</h2><p class="muted">The globe lives on your Home page. Create a page with the “Home” layout first.</p></div>`; return; }
  home.home ||= {};
  let pins = clone(home.home.pins && home.home.pins.length ? home.home.pins : DEFAULT_PINS).map((p) => ({ label: p.label || "", lat: String(p.lat), lon: String(p.lon) }));
  let arcs = home.home.arcs !== false;
  v.innerHTML = `
    <header class="view-head"><div><div class="crumb">Home page</div><h1>Globe &amp; places</h1>
      <p class="muted">These places appear as pins on the home-page globe${arcs ? ", joined by arcs in this order" : ""}. Search for a city, or click anywhere on the globe to drop a pin.</p></div>
      <button class="btn primary" id="saveGlobe">Save places</button></header>
    <div class="globe-layout">
      <div>
        <section class="panel">
          <h2>Add a place</h2>
          <form class="search-row" id="geoForm" onsubmit="return false"><input id="geoQ" placeholder="e.g. Tokyo, Hong Kong, London…" autocomplete="off"/><button class="btn primary" type="submit">Search</button></form>
          <div class="search-results" id="geoRes"></div>
          <p class="hint" style="margin-top:.6rem">Place search by OpenStreetMap.</p>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Places <span class="muted small" id="pinCount"></span></h2>
            <label class="check small"><input type="checkbox" id="arcsOn" ${arcs ? "checked" : ""}/> Connect with arcs</label></div>
          <div class="pin-list" id="pinList"></div>
          <p class="hint" style="margin-top:.7rem">Latitude: −90 (south) to 90 (north). Longitude: −180 (west) to 180 (east). Use ↑ ↓ to change the arc order.</p>
        </section>
      </div>
      <section class="panel globe-preview">
        <canvas id="globePrev" aria-label="Globe preview"></canvas>
        <div class="globe-tip"><b>Tip:</b> drag to spin · click a spot to add a pin there</div>
      </section>
    </div>`;
  const ctrl = window.ZYGlobe ? window.ZYGlobe($("#globePrev", v), { fit: "full", pins, arcs, accent: S.V.public.accent || "#2563eb",
    onPick: async (lat, lon) => { const label = await reverseName(lat, lon); add({ label, lat: String(lat), lon: String(lon) }); toast(`Added ${label} — rename it if you like`, "ok"); } }) : null;
  S.cleanup = () => ctrl && ctrl();
  const sync = (focus) => { $("#pinCount", v).textContent = `(${pins.length})`; ctrl && ctrl.setPins(pins, focus); };
  const draw = () => {
    $("#pinList", v).innerHTML = pins.map((p, i) => `<div class="pin-row" data-i="${i}">
      <span class="pin-no">${String(i + 1).padStart(2, "0")}</span>
      <input data-k="label" value="${esc(p.label)}" placeholder="Place name" aria-label="Place name"/>
      <input data-k="lat" value="${esc(p.lat)}" placeholder="Latitude" aria-label="Latitude" inputmode="decimal"/>
      <input data-k="lon" value="${esc(p.lon)}" placeholder="Longitude" aria-label="Longitude" inputmode="decimal"/>
      <span class="pin-acts"><button class="icon-btn" data-a="up" ${i ? "" : "disabled"} title="Earlier">↑</button><button class="icon-btn" data-a="down" ${i < pins.length - 1 ? "" : "disabled"} title="Later">↓</button><button class="icon-btn danger" data-a="del" title="Remove">✕</button></span>
    </div>`).join("") || '<div class="empty">No places yet. Search above or click on the globe.</div>';
    sync(false);
  };
  const add = (p) => { pins.push(p); S.dirty = true; draw(); sync(true); };
  draw();
  $("#pinList", v).addEventListener("input", (e) => { const row = e.target.closest(".pin-row"); if (!row) return; pins[+row.dataset.i][e.target.dataset.k] = e.target.value; S.dirty = true; sync(false); });
  $("#pinList", v).addEventListener("click", (e) => {
    const b = e.target.closest("[data-a]"); if (!b) return; const i = +b.closest(".pin-row").dataset.i;
    if (b.dataset.a === "del") pins.splice(i, 1);
    if (b.dataset.a === "up") [pins[i - 1], pins[i]] = [pins[i], pins[i - 1]];
    if (b.dataset.a === "down") [pins[i + 1], pins[i]] = [pins[i], pins[i + 1]];
    S.dirty = true; draw();
  });
  $("#arcsOn", v).addEventListener("change", (e) => { arcs = e.target.checked; S.dirty = true; ctrl && ctrl.setArcs(arcs); });
  $("#geoForm", v).addEventListener("submit", async () => {
    const q = $("#geoQ", v).value.trim(); if (!q) return;
    const res = $("#geoRes", v); res.innerHTML = '<span class="muted small">Searching…</span>';
    try {
      const list = await geocode(q);
      res.innerHTML = list.map((r, k) => `<button type="button" data-r="${k}"><span>📍</span><span><b>${esc(r.label)}</b><br/><span class="muted small">${esc(r.full)}</span></span><span class="add">Add</span></button>`).join("") || '<span class="muted small">No places found. Try a different spelling.</span>';
      res.onclick = (e) => { const b = e.target.closest("[data-r]"); if (!b) return; const r = list[+b.dataset.r]; add({ label: r.label, lat: r.lat, lon: r.lon }); res.innerHTML = ""; $("#geoQ", v).value = ""; toast(`Added ${r.label}`, "ok"); };
    } catch (err) { res.innerHTML = `<span class="msg err">${esc(err.message || "Search failed.")}</span>`; }
  });
  $("#saveGlobe", v).addEventListener("click", () => {
    const clean = pins.filter((p) => p.label.trim() || p.lat || p.lon);
    const bad = clean.find((p) => !(p.lat !== "" && p.lon !== "" && Math.abs(Number(p.lat)) <= 90 && Math.abs(Number(p.lon)) <= 180));
    if (bad) return toast(`Check the coordinates for “${bad.label || "a place"}”.`, "err");
    home.home.pins = clean.map((p) => ({ label: p.label.trim(), lat: String(Number(p.lat)), lon: String(Number(p.lon)) }));
    home.home.arcs = arcs;
    S.dirty = false; changed(); toast("Places saved — publish to update the website", "ok");
  });
}

// ─────────────────────────── Sign-in artwork ───────────────────────────
let loginArtStop = null;
function startLoginArt() {
  const cv = $("#loginArt"); if (!cv || !window.ZYStage || loginArtStop) return;
  const colors = ["#2563eb", "#0891b2", "#4f46e5", "#0284c7", "#1d4ed8", "#0e7490"];
  const n = 6, t0 = performance.now();
  loginArtStop = window.ZYStage(cv, colors.map((c, k) => ({ formation: k, color: c })), () => {
    const t = ((performance.now() - t0) / 1000) / 3.2;          // hold ~2 s, morph ~1 s, ping-pong through formations
    const cyc = t % (2 * (n - 1)); const x = cyc < n - 1 ? cyc : 2 * (n - 1) - cyc;
    const i = Math.floor(x), f = x - i; return i + Math.max(0, (f - 0.6) / 0.4);
  });
}
function stopLoginArt() { if (loginArtStop) { loginArtStop(); loginArtStop = null; } }

// ─────────────────────────── Categories ───────────────────────────
function categoriesView(v) {
  v.innerHTML = `
    <header class="view-head"><div><h1>Categories</h1><p class="muted">The dropdown tabs in the website's top menu. Pages inside a <b>members-only</b> category are encrypted and need a sign-in; the others are public.</p></div>
      <button class="btn primary" id="saveCats">Save categories</button></header>
    <section class="panel" id="catSlot"></section>
    <p class="muted small">A category can only be deleted once it has no pages. Move its pages to another category first (open the page → Category).</p>`;
  const ed = rowsEditor({ label: "Menu categories (in menu order)", rows: cats().map((c) => ({ ...c, locked: String(!!c.locked) })), addText: "Add category",
    fields: [{ key: "name", label: "Name", flex: 2 }, { key: "locked", label: "Access", type: "select", options: () => [["false", "Public — anyone"], ["true", "Members only (sign-in)"]] }] });
  $("#catSlot", v).append(ed); trackDirty(ed);
  $("#saveCats", v).addEventListener("click", () => {
    const rows = ed.getValue().filter((r) => r.name.trim());
    const used = new Set(); const next = rows.map((r, n) => {
      let id = r.id || slugify(r.name) || "category"; while (used.has(id)) id += "-2"; used.add(id);
      return { id, name: r.name.trim(), locked: r.locked === "true", order: n };
    });
    const orphan = tabs().find((t) => t.category && !next.some((c) => c.id === t.category) && S.V.categories.some((c) => c.id === t.category));
    if (orphan) return toast(`“${catOf(orphan).name}” still has pages (e.g. ${orphan.title}). Move them first.`, "err");
    S.V.categories = next; S.dirty = false; changed(); toast("Categories saved — publish to apply", "ok"); go("categories");
  });
}

// ─────────────────────────── Members ───────────────────────────
function membersView(v) {
  const ms = S.V.members;
  const row = (m) => `<tr data-u="${esc(m.username)}">
    <td><b>${esc(m.name || m.username)}</b><div class="muted small">@${esc(m.username)}${m.email ? " · " + esc(m.email) : ""}</div></td>
    <td class="acts">
      <button class="btn ghost small" data-m="show">Login details</button>
      <button class="btn ghost small" data-m="reset">New password</button>
      ${m.status === "active" ? '<button class="btn ghost small" data-m="suspend">Suspend</button>' : '<button class="btn primary small" data-m="activate">Reactivate</button>'}
      <button class="icon-btn danger" data-m="remove" title="Remove member">✕</button>
    </td></tr>`;
  const active = ms.filter((m) => m.status === "active"), susp = ms.filter((m) => m.status !== "active");
  v.innerHTML = `
    <header class="view-head"><div><h1>Members</h1><p class="muted">People who can sign in to read members-only pages (e.g. Stories). Each member gets their own username and password. Changes take effect when you publish.</p></div>
      <button class="btn primary" id="addMember">＋ Add member</button></header>
    <section class="panel"><h2>Active <span class="muted small">(${active.length})</span></h2>
      ${active.length ? `<table class="table"><tbody>${active.map(row).join("")}</tbody></table>` : '<p class="muted small">No members yet. Add yourself first so you can view the site.</p>'}</section>
    <section class="panel"><h2>Suspended <span class="muted small">(${susp.length})</span></h2>
      ${susp.length ? `<table class="table"><tbody>${susp.map(row).join("")}</tbody></table>` : '<p class="muted small">None.</p>'}</section>
    <p class="muted small">How it works: every publish re-encrypts the members' content with a brand-new key that only active members' passwords can unlock.
    Suspended or removed members can't open anything published after that.</p>`;

  v.onclick = async (e) => {
    const b = e.target.closest("[data-m]"); if (!b) return;
    const m = ms.find((x) => x.username === b.closest("tr").dataset.u); const act = b.dataset.m;
    if (act === "show") return showLogin(m);
    if (act === "reset") {
      if (!(await modal({ title: "Give a new password?", body: `<p>${esc(m.name || m.username)}'s current password stops working after you publish.</p>`, okText: "Generate new password" }))) return;
      await busy(null, async () => { const pw = ZYCrypto.randomPassword(); Object.assign(m, await ZYCrypto.makeCredential(m.username, pw), { password: pw }); changed(); showLogin(m); });
      return;
    }
    if (act === "remove") {
      if (!(await confirmBox("Remove member?", `${m.name || m.username} will lose access after you publish.`, "Remove"))) return;
      S.V.members = ms.filter((x) => x !== m); changed(); return go("members");
    }
    m.status = act === "activate" ? "active" : "suspended"; changed(); toast(act === "activate" ? "Reactivated" : "Suspended", "ok"); go("members");
  };
  $("#addMember", v).addEventListener("click", addMemberDialog);
}

function showLogin(m) {
  const text = `zy-profile.com members area\nUsername: ${m.username}\nPassword: ${m.password}`;
  const body = document.createElement("div");
  body.innerHTML = `<p class="muted small">Send these to ${esc(m.name || m.username)} privately. They work once you publish.</p>
    <pre class="cred">${esc(text)}</pre>`;
  return modal({ title: "Login details", body, okText: "Copy to clipboard",
    onOk: async () => { try { await navigator.clipboard.writeText(text); toast("Copied", "ok"); } catch { toast("Copy failed — select the text instead.", "err"); return false; } } });
}

async function addMemberDialog() {
  const f = document.createElement("form"); f.onsubmit = () => false;
  f.innerHTML = `${field("Full name", input("name", "", 'maxlength="80" required'))}
    ${field("Username", input("username", "", 'maxlength="40" required autocapitalize="none" spellcheck="false"'), "What they type to sign in. Letters, numbers, dot, dash, underscore.")}
    ${field("Email (optional, for your records)", input("email", "", 'type="email"'))}
    ${field("Password", input("password", ZYCrypto.randomPassword(), 'minlength="8" required'), "Auto-generated. You can change it, minimum 8 characters.")}`;
  let touched = false;
  f.username.addEventListener("input", () => (touched = true));
  f.name.addEventListener("input", () => { if (!touched) f.username.value = f.name.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 30); });
  const created = await modal({
    title: "Add member", body: f, okText: "Add member",
    onOk: async () => {
      const name = f.name.value.trim(), username = f.username.value.trim().toLowerCase(), pw = f.password.value;
      if (!name) { toast("Name is required.", "err"); return false; }
      if (!/^[a-z0-9._-]{3,40}$/.test(username)) { toast("Username: 3–40 letters, numbers, dot, dash or underscore.", "err"); return false; }
      if (S.V.members.some((m) => m.username === username)) { toast("That username is taken.", "err"); return false; }
      if (pw.length < 8) { toast("Password must be at least 8 characters.", "err"); return false; }
      const m = { username, name, email: f.email.value.trim(), status: "active", password: pw, createdAt: new Date().toISOString(), ...(await ZYCrypto.makeCredential(username, pw)) };
      S.V.members.push(m); changed();
      return m;
    }
  });
  if (created) { go("members"); showLogin(created); }
}

// ─────────────────────────── Backup & security ───────────────────────────
function backupView(v) {
  v.innerHTML = `
    <header class="view-head"><div><h1>Backup &amp; security</h1><p class="muted">Download everything as one file, restore from one, or change your admin password.</p></div></header>
    <section class="panel"><h2>Export</h2><p class="muted small">Site settings, all pages (including hidden drafts) and items with logos. Members and the resume aren't included. The file is <b>not encrypted</b> — store it somewhere private.</p>
      <button class="btn primary" id="exp">Download backup (.json)</button></section>
    <section class="panel"><h2>Import</h2><p class="muted small"><b>Replaces</b> all pages and items with the contents of the file, and updates site settings. Members are kept.</p>
      <label class="btn ghost">Choose backup file…<input type="file" id="imp" accept="application/json,.json" hidden/></label></section>
    <section class="panel"><h2>Starter content</h2><p class="muted small">Re-load the content from the original zy-profile.com pages (Home, Clubs, Education, Investment, Experience, Skills, Certificates). Replaces current pages.</p>
      <button class="btn ghost" id="starter">Load starter content</button></section>
    <section class="panel"><h2>Change admin password</h2>
      <form class="grid2" id="pwForm" onsubmit="return false">
        ${field("New admin password", input("p1", "", 'type="password" minlength="10" autocomplete="new-password"'))}
        ${field("Repeat", input("p2", "", 'type="password" minlength="10" autocomplete="new-password"'))}
        <div><button class="btn ghost" id="pwBtn">Change password</button></div>
      </form>
      <p class="muted small">Takes effect when you publish. There is no recovery if you forget it — keep it in a password manager, and keep a backup file.</p></section>
    <section class="panel"><h2>This computer</h2>
      <p class="muted small">Connected to <code>${esc(S.gh.owner)}/${esc(S.gh.repo)}</code> on branch <code>${esc(S.gh.branch)}</code>.</p>
      <button class="btn ghost small danger-text" id="forget">Forget GitHub token on this computer</button></section>`;

  $("#exp", v).addEventListener("click", () => {
    const out = { version: 2, exportedAt: new Date().toISOString(), site: S.V.public, categories: cats(),
      tabs: tabs().slice().sort(byOrder).map((t) => ({ ...clone(t), items: (t.items || []).slice().sort(byOrder).map(({ id, ...x }) => x) })) };
    const blob = new Blob([JSON.stringify(out, null, 1)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `zy-profile-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
  });
  $("#imp", v).addEventListener("change", async (e) => {
    const file = e.target.files[0]; e.target.value = ""; if (!file) return;
    let data; try { data = JSON.parse(await file.text()); } catch { return toast("That file isn't valid JSON.", "err"); }
    importData(data, file.name);
  });
  $("#starter", v).addEventListener("click", () => importData(clone(window.ZY_SEED), "starter content"));
  $("#pwBtn", v).addEventListener("click", (e) => busy(e.currentTarget, async () => {
    const f = $("#pwForm", v);
    if (f.p1.value.length < 10) return toast("Use at least 10 characters.", "err");
    if (f.p1.value !== f.p2.value) return toast("The two passwords don't match.", "err");
    const nv = await ZYCrypto.newVault(S.V, f.p1.value);
    Object.assign(S, { key: nv.key, salt: nv.salt, iter: nv.iter });
    f.reset(); changed(); toast("Admin password changed — publish to save it", "ok");
  }));
  $("#forget", v).addEventListener("click", () => { try { localStorage.removeItem("zy_admin_gh"); } catch {} toast("Token forgotten on this computer"); });
}

function tabsFromBackup(data) {
  return data.tabs.map((t, n) => {
    const { items = [], ...rest } = t;
    return { order: n, visible: true, sections: [], ...rest, items: items.map((it, k) => ({ order: k, ...it, id: newId() })) };
  });
}
async function importData(data, label) {
  if (!data || !Array.isArray(data.tabs)) return toast("Backup file is missing a 'tabs' list.", "err");
  const bad = data.tabs.find((t) => !t.id || slugify(t.id) !== t.id);
  if (bad) return toast(`Page id "${bad?.id}" is invalid.`, "err");
  if (tabs().length && !(await confirmBox(`Import ${label}?`, `This replaces all ${tabs().length} current pages with ${data.tabs.length} pages from the file.`, "Replace content"))) return;
  S.V.content.tabs = tabsFromBackup(data);
  if (Array.isArray(data.categories) && data.categories.length) S.V.categories = clone(data.categories);
  migrate(S.V);
  if (data.site) { const { resumeEnabled, updated, ...site } = data.site; Object.assign(S.V.public, site); }
  changed(); toast("Imported — review, then publish", "ok");
  const first = tabs().slice().sort(byOrder)[0]; go(first ? "tab" : "site", first?.id);
}

// ─────────────────────────── Sign in / setup ───────────────────────────
function loginMsg(t, ok = false) { const m = $("#loginMsg"); m.textContent = t; m.className = "msg" + (ok ? " ok" : t ? " err" : ""); }
function savedGh() { try { return JSON.parse(localStorage.getItem("zy_admin_gh") || "null"); } catch { return null; } }
(function prefill() {
  const g = savedGh(); const f = $("#loginForm");
  f.repo.value = g ? `${g.owner}/${g.repo}` : DEFAULT_REPO;
  f.branch.value = g?.branch || "main";
  if (g?.token) { f.token.value = g.token; f.remember.checked = true; $("#tokenRow").classList.add("has-token"); }
})();
$("#changeToken").addEventListener("click", (e) => { e.preventDefault(); $("#tokenRow").classList.remove("has-token"); $("#loginForm").token.value = ""; $("#loginForm").token.focus(); });

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault(); const f = e.target; const btn = f.querySelector("button[type=submit]");
  loginMsg("");
  const [owner, repo] = f.repo.value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").split("/");
  if (!owner || !repo) return loginMsg("Repository should look like owner/name.");
  S.gh = { owner, repo, branch: f.branch.value.trim() || "main", token: f.token.value.trim() };
  if (!S.gh.token) return loginMsg("Paste your GitHub token.");
  await busy(btn, async () => {
    try {
      const info = await gh("GET", "");
      if (!info.permissions?.push) throw new Error("This token can read the repository but can't write to it. Give it Contents: Read and write.");
      try { localStorage.setItem("zy_admin_gh", JSON.stringify(f.remember.checked ? S.gh : { owner, repo, branch: S.gh.branch })); } catch {}
      const file = await readRepoFile(FILES.vault);
      if (!file) return startSetup(f.password.value);
      const vf = JSON.parse(file.text);
      const opened = await ZYCrypto.openVault(vf, f.password.value);
      Object.assign(S, { V: opened.obj, key: opened.key, salt: opened.salt, iter: opened.iter, vaultSha: file.sha });
      f.password.value = "";
      S.lastPublished = vf.updated || null;
      await offerDraft(vf.updated);
      if (migrate(S.V)) { S.unpublished = true; setTimeout(() => toast("Updated to the new blue tech design. Review, then Publish."), 400); }
      enterApp();
    } catch (err) { loginMsg(err.message || String(err)); }
  });
});

async function offerDraft(remoteUpdated) {
  let d; try { d = JSON.parse(localStorage.getItem(draftKey()) || "null"); } catch { d = null; }
  if (!d?.sealed) return;
  let obj; try { obj = await ZYCrypto.openVaultWithKey(d.sealed, S.key); } catch { return; }
  const when = new Date(d.savedAt).toLocaleString();
  const stale = d.baseSha && d.baseSha !== S.vaultSha;
  const ok = await modal({ title: "Unpublished changes found", okText: "Restore draft",
    body: `<p>This computer has unpublished changes from <b>${esc(when)}</b>.</p>${stale ? '<p class="msg err">The site was published from somewhere else after this draft was made. Restoring will replace that newer version when you next publish.</p>' : ""}<p class="muted small">Cancel to discard the draft and use the published version.</p>` });
  if (ok) { S.V = obj; S.unpublished = true; }
  else try { localStorage.removeItem(draftKey()); } catch {}
}

function startSetup(typedPassword) {
  $("#loginForm").hidden = true; $("#setupForm").hidden = false;
  $("#setupForm").p1.value = typedPassword || ""; $("#setupForm").p1.focus();
}
$("#setupBack").addEventListener("click", (e) => { e.preventDefault(); $("#setupForm").hidden = true; $("#loginForm").hidden = false; });
$("#setupForm").addEventListener("submit", async (e) => {
  e.preventDefault(); const f = e.target;
  if (f.p1.value.length < 10) return toast("Use at least 10 characters for the admin password.", "err");
  if (f.p1.value !== f.p2.value) return toast("The two passwords don't match.", "err");
  await busy(f.querySelector("button[type=submit]"), async () => {
    const seed = clone(window.ZY_SEED);
    const { resumeEnabled, ...pub } = seed.site;
    const V = { version: 1, public: { ...pub, requestEmail: "" }, content: { tabs: tabsFromBackup(seed), resume: null }, members: [] };
    migrate(V);
    const nv = await ZYCrypto.newVault(V, f.p1.value);
    Object.assign(S, { V, key: nv.key, salt: nv.salt, iter: nv.iter, vaultSha: null });
    f.reset(); S.unpublished = true;
    enterApp();
    go("members");
    setTimeout(() => toast("Starter content loaded. Add yourself as a member, then Publish."), 300);
  });
});

function enterApp() {
  $("#login").hidden = true; $("#app").hidden = false;
  $("#whoami").textContent = `${S.gh.owner}/${S.gh.repo}`;
  $("#viewSite").href = SITE_URL;
  paintPublishBar();
  stopLoginArt();
  if (S.view === "site" && !S.tabId) go("overview");
}

// ── Desktop app (PWA) ──
let installEvt = null;
const paintInstall = () => $$("[data-install]").forEach((b) => (b.hidden = !installEvt));
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; paintInstall(); });
window.addEventListener("appinstalled", () => { installEvt = null; paintInstall(); toast("Installed — open it from your Start menu, Dock or desktop.", "ok"); });
$$("[data-install]").forEach((b) => b.addEventListener("click", async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; paintInstall(); }));
if ("serviceWorker" in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register("sw.js").catch(() => {});
if (matchMedia("(display-mode: standalone)").matches) document.body.classList.add("standalone");

if (!window.ZYCrypto || !ZYCrypto.supported) loginMsg("This browser can't run the console. Use a recent Chrome, Edge, Firefox or Safari.");
$("#boot").hidden = true; $("#login").hidden = false;
requestAnimationFrame(startLoginArt);
})();
