// ============================================
// ZY-Profile — website (zy-profile.com)
// data/public.json   → branding, menu categories and all public pages (Works, Hobbies…)
// data/site.enc.json → members-only pages (Stories…), encrypted; unlocked after sign-in
// ============================================
(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => { if (!u || !String(u).trim()) return ""; try { const x = new URL(u, location.href); return ["http:", "https:", "mailto:", "tel:"].includes(x.protocol) ? x.href : ""; } catch { return ""; } };
const safeImg = (u) => (typeof u === "string" && (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i.test(u) || /^https:\/\//i.test(u))) ? u : "";
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
const SESSION_KEY = "zy_member_session";
const I = {
  ext: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
  caret: '<svg class="caret" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  lock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
  dl: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
};

const state = { site: {}, categories: [], publicTabs: [], lockedTabs: [], lockedCount: {}, file: null, signedIn: false, resume: null, membersResume: false, afterSignIn: null };
const allTabs = () => [...state.publicTabs, ...state.lockedTabs];
const catById = (id) => state.categories.find((c) => c.id === id);
const tabsIn = (catId) => allTabs().filter((t) => t.category === catId).sort(byOrder);
const topLevel = () => allTabs().filter((t) => (!t.category || !catById(t.category)) && t.layout !== "home").sort(byOrder);
const homeTab = () => allTabs().find((t) => t.layout === "home");

const store = {
  get() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } },
  set(v, remember) { try { (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(v)); } catch {} },
  clear() { try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); } catch {} },
};
async function fetchJson(path) {
  const r = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
  return r.json();
}
const prepTab = (t) => ({ ...t, items: (t.items || []).slice().sort(byOrder) });

// ── Load ──
async function load() {
  const [pub, file] = await Promise.all([fetchJson("data/public.json").catch(() => null), fetchJson("data/site.enc.json").catch(() => null)]);
  const p = pub || {};
  state.site = p; state.file = file;
  if (Array.isArray(p.categories)) {
    state.categories = p.categories.slice().sort(byOrder);
    state.publicTabs = (p.tabs || []).filter((t) => t.visible !== false).map(prepTab);
    state.lockedCount = p.lockedCount || {};
    state.resume = p.resume && p.resume.dataUrl ? p.resume : null;
    state.membersResume = !!p.membersResume;
  } else {
    // Older publish (before categories): everything is members-only.
    state.categories = [{ id: "members", name: "Members", locked: true, order: 0 }];
    state.publicTabs = []; state.lockedCount = { members: file ? 1 : 0 };
  }
}
function unlock(content) {
  const legacy = !content.version;
  state.lockedTabs = (content.tabs || []).filter((t) => t.visible !== false).map((t) => prepTab(legacy ? { ...t, category: "members" } : t));
  if (content.resume && content.resume.dataUrl) state.resume = content.resume;
  if (legacy && content.site) state.site = { ...content.site, ...state.site };
  state.signedIn = true;
}

// ── Branding ──
function applyBranding() {
  const s = state.site;
  if (s.accent && /^#[0-9a-f]{6}$/i.test(s.accent)) document.documentElement.style.setProperty("--accent", s.accent);
  const logo = safeImg(s.logo);
  $("#brand").innerHTML = (logo ? `<img src="${esc(logo)}" alt="" class="brand-logo"/>` : `<span class="brand-mark">${esc(s.monogram || (s.name || "Zhi Yao").trim().split(/\s+/).slice(-2).map((w) => w[0]).join("").toUpperCase())}</span>`)
    + `<span class="brand-text">${esc(s.logoText || s.name || "NG ZHI YAO")}</span>`;
  $("#footer").innerHTML = `<div class="foot-inner"><span>${esc(s.footer || "")}</span><span class="foot-links">${state.categories.map((c) => `<a href="#/c/${esc(c.id)}">${esc(c.name)}</a>`).join("")}</span></div>`;
  $("#siName").textContent = s.name || "Ng Zhi Yao";
  $("#siTagline").textContent = s.tagline || "";
  const sl = safeImg(s.logo); if (sl) { $("#siLogo").src = sl; $("#siLogo").hidden = false; }
  wireRequest();
}
function wireRequest() {
  const s = state.site; const email = (s.requestEmail || "").trim();
  $$("[data-request]").forEach((a) => {
    if (!email) { a.hidden = true; return; }
    a.hidden = false;
    a.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("Access request — " + (s.name || "zy-profile.com"))}&body=${encodeURIComponent("Hi,\n\nI'd like access to the members area.\n\nName:\nOrganisation / relationship:\n\nThanks")}`;
  });
}

// ── Navigation ──
function renderNav() {
  const cur = currentRoute();
  const catBtn = (c) => {
    const pages = tabsIn(c.id);
    const lockedOut = c.locked && !state.signedIn;
    const active = (cur.type === "cat" && cur.id === c.id) || (cur.tab && cur.tab.category === c.id);
    const body = lockedOut ? `
        <div class="dd-locked">
          <div class="dd-locked-icon">${I.lock}</div>
          <div><div class="dd-title">${esc(c.name)} are for members</div>
          <div class="dd-sub">${state.lockedCount[c.id] ? `${state.lockedCount[c.id]} page${state.lockedCount[c.id] === 1 ? "" : "s"} · ` : ""}sign in to read</div></div>
        </div>
        <div class="dd-actions"><button class="btn btn-primary btn-sm" data-signin="#/c/${esc(c.id)}">Sign in</button><a class="dd-link" data-request hidden>Request access</a></div>`
      : `${pages.map((t) => `
        <a class="dd-item" href="#/${esc(t.id)}" role="menuitem">
          <span class="dd-title">${esc(t.title)}</span>
          ${t.summary ? `<span class="dd-sub">${esc(t.summary)}</span>` : ""}
        </a>`).join("") || `<div class="dd-empty">Nothing here yet.</div>`}
        <a class="dd-all" href="#/c/${esc(c.id)}">All ${esc(c.name)} ${I.arrow}</a>`;
    return `<li class="nav-cat${active ? " active" : ""}">
      <button class="nav-tab" aria-expanded="false" aria-haspopup="true" data-cat="${esc(c.id)}">${esc(c.name)}${c.locked ? `<span class="nav-lock" title="Members only">${I.lock}</span>` : ""}${I.caret}</button>
      <div class="dropdown" role="menu">${body}</div>
    </li>`;
  };
  const plain = topLevel().map((t) => `<li class="nav-cat${cur.tab === t ? " active" : ""}"><a class="nav-tab" href="#/${esc(t.id)}">${esc(t.title)}</a></li>`).join("");
  $("#navCats").innerHTML = state.categories.map(catBtn).join("") + plain;
  const showResume = !!state.resume || (state.membersResume && !state.signedIn);
  $("#resumeBtn").hidden = !showResume;
  $("#resumeBtn").innerHTML = `${state.resume ? I.dl : I.lock} Resume`;
  $("#authBtn").textContent = state.signedIn ? "Sign out" : "Member sign in";
  $("#authBtn").classList.toggle("is-member", state.signedIn);
  applyBranding();
}
function closeDropdowns(except) {
  $$(".nav-cat.open").forEach((li) => { if (li !== except) { li.classList.remove("open"); $(".nav-tab", li)?.setAttribute("aria-expanded", "false"); } });
}
$("#navCats").addEventListener("click", (e) => {
  const btn = e.target.closest("button.nav-tab");
  if (btn) { const li = btn.parentElement; const open = !li.classList.contains("open"); closeDropdowns(li); li.classList.toggle("open", open); btn.setAttribute("aria-expanded", String(open)); return; }
  if (e.target.closest("a")) { closeDropdowns(); document.body.classList.remove("menu-open"); }
});
$("#navCats").addEventListener("mouseover", (e) => {
  if (!matchMedia("(hover: hover) and (min-width: 901px)").matches) return;
  const li = e.target.closest(".nav-cat"); if (!li || !$(".dropdown", li)) return;
  closeDropdowns(li); li.classList.add("open"); $(".nav-tab", li).setAttribute("aria-expanded", "true");
});
$("#navCats").addEventListener("mouseleave", () => { if (matchMedia("(hover: hover) and (min-width: 901px)").matches) closeDropdowns(); });
document.addEventListener("click", (e) => { if (!e.target.closest(".nav-cat")) closeDropdowns(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeDropdowns(); closeSignIn(); document.body.classList.remove("menu-open"); } });
$("#menuBtn").addEventListener("click", () => { const o = document.body.classList.toggle("menu-open"); $("#menuBtn").setAttribute("aria-expanded", String(o)); });
document.addEventListener("click", (e) => {
  const s = e.target.closest("[data-signin]"); if (s) { e.preventDefault(); closeDropdowns(); openSignIn(s.dataset.signin || null); }
});
$("#authBtn").addEventListener("click", () => { if (state.signedIn) signOut(); else openSignIn(null); });

// ── Sign in ──
function openSignIn(after) {
  state.afterSignIn = after;
  $("#signinMsg").textContent = ""; $("#signin").hidden = false; document.body.classList.add("modal-open");
  setTimeout(() => $("#signinForm [name=username]").focus(), 30);
}
function closeSignIn() { $("#signin").hidden = true; document.body.classList.remove("modal-open"); }
$$("[data-close-signin]").forEach((b) => b.addEventListener("click", closeSignIn));
$("#signin").addEventListener("mousedown", (e) => { if (e.target.id === "signin") closeSignIn(); });
$("#signinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target; const btn = f.querySelector("button[type=submit]"); const msg = $("#signinMsg");
  if (!state.file) { msg.textContent = "The members area hasn't been published yet."; return; }
  btn.disabled = true; btn.textContent = "Signing in…"; msg.textContent = "";
  try {
    const res = await ZYCrypto.openSite(state.file, f.username.value, f.password.value);
    store.set({ id: res.id, kek: res.kek }, f.remember.checked);
    f.password.value = "";
    unlock(res.content); closeSignIn();
    if (state.afterSignIn) location.hash = state.afterSignIn;
    render();
    toast("Signed in. Welcome back.");
  } catch (err) { msg.textContent = err.code === "bad-login" ? err.message : "Couldn't open the members area. " + (err.message || ""); }
  finally { btn.disabled = false; btn.textContent = "Sign in"; }
});
function signOut() {
  const r = currentRoute();
  const onLocked = (r.type === "tab" && catById(r.tab.category)?.locked) || (r.type === "cat" && catById(r.id)?.locked);
  store.clear(); state.signedIn = false; state.lockedTabs = [];
  if (onLocked) history.replaceState(null, "", "#/");
  state.resume = state.site.resume && state.site.resume.dataUrl ? state.site.resume : null;
  render(); toast("Signed out.");
}

$("#resumeBtn").addEventListener("click", async () => {
  if (!state.resume) return openSignIn(null);
  const blob = await (await fetch(state.resume.dataUrl)).blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: state.resume.fileName || "resume.pdf" });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
});

// ── Routing ──
function currentRoute() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  if (!h) return { type: "home" };
  const m = h.match(/^c\/([^/?]+)/); if (m) return { type: "cat", id: m[1] };
  const tab = allTabs().find((t) => t.id === h);
  if (tab) return { type: "tab", tab };
  return { type: "missing", id: h };
}
window.addEventListener("hashchange", render);

function render() {
  renderNav();
  const r = currentRoute(); const main = $("#main");
  document.body.classList.remove("menu-open");
  let html;
  if (r.type === "home") { const h = homeTab(); html = h ? renderHome(h) : renderLanding(); setTitle(); }
  else if (r.type === "cat") {
    const c = catById(r.id);
    html = c ? renderCategory(c) : renderNotFound(); setTitle(c?.name);
  } else if (r.type === "tab") { html = renderPage(r.tab); setTitle(r.tab.heading || r.tab.title); }
  else {
    // A members-only page they can't see yet — offer sign-in instead of a dead end.
    const anyLocked = state.categories.some((c) => c.locked);
    html = !state.signedIn && anyLocked ? renderLockedPage(r.id) : renderNotFound(); setTitle();
    if (!state.signedIn && anyLocked && $("#signin").hidden) setTimeout(() => openSignIn(location.hash), 0);
  }
  main.innerHTML = html;
  wireLogos(main); wireRequest();
  window.scrollTo(0, 0);
}
function setTitle(t) { const n = state.site.name || "Ng Zhi Yao"; document.title = t ? `${t} — ${n}` : n; }

// ── Views ──
const crumbs = (parts) => `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Home</a>${parts.map((p) => `<span>/</span>${p.href ? `<a href="${p.href}">${esc(p.label)}</a>` : `<span class="here">${esc(p.label)}</span>`}`).join("")}</nav>`;

function pageCard(t) {
  return `<a class="pcard" href="#/${esc(t.id)}">
    <span class="pcard-title">${esc(t.heading || t.title)}</span>
    ${t.summary || t.intro ? `<span class="pcard-sub">${esc(t.summary || t.intro)}</span>` : ""}
    ${(t.summaryTags || []).length ? `<span class="tags">${t.summaryTags.map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</span>` : ""}
    <span class="pcard-go">Open ${I.arrow}</span>
  </a>`;
}
function lockedCard(c) {
  const n = state.lockedCount[c.id] || 0;
  return `<div class="pcard pcard-locked">
    <span class="pcard-lock">${I.lock}</span>
    <span class="pcard-title">${esc(c.name)} are shared with members</span>
    <span class="pcard-sub">${n ? `${n} page${n === 1 ? "" : "s"} waiting. ` : ""}Sign in with the details you were given.</span>
    <span class="pcard-actions"><button class="btn btn-primary btn-sm" data-signin="#/c/${esc(c.id)}">Sign in</button><a class="dd-link" data-request hidden>Request access</a></span>
  </div>`;
}

function renderHome(tab) {
  const h = tab.home || {};
  const photo = safeImg(h.photo);
  const buttons = (h.buttons || []).filter((b) => b.label).map((b) => {
    const target = allTabs().find((t) => t.id === b.target);
    const href = target ? `#/${esc(b.target)}` : (safeUrl(b.target) || "#/");
    const ext = href.startsWith("http") ? ' target="_blank" rel="noopener"' : "";
    return `<a href="${esc(href)}"${ext} class="btn ${b.style === "outline" ? "btn-outline" : "btn-primary"}">${esc(b.label)}</a>`;
  }).join("");
  const contact = (h.contact || []).filter((r) => r.label || r.value)
    .map((r) => `<div class="contact-row"><span class="lbl">${esc(r.label)}</span><span class="val">${esc(r.value)}</span></div>`).join("");
  const stats = (h.stats || []).filter((s) => s.num || s.label)
    .map((s) => `<div class="stat"><div class="stat-num">${esc(s.num)}</div><div class="stat-lbl">${esc(s.label)}</div></div>`).join("");
  const explore = h.showOverview === false ? "" : state.categories.map((c) => {
    const pages = tabsIn(c.id);
    const lockedOut = c.locked && !state.signedIn;
    if (!pages.length && !lockedOut) return "";
    return `<section class="explore-cat">
      <div class="explore-head">
        <h2><a href="#/c/${esc(c.id)}">${esc(c.name)}</a>${c.locked ? `<span class="pill-lock">${I.lock} Members</span>` : ""}</h2>
        <a class="see-all" href="#/c/${esc(c.id)}">All ${esc(c.name.toLowerCase())} ${I.arrow}</a>
      </div>
      <div class="card-grid">${lockedOut ? lockedCard(c) : pages.map(pageCard).join("")}</div>
    </section>`;
  }).join("");

  return `
  <section class="hero"><div class="container hero-grid">
    <div class="hero-main fade-up">
      ${photo ? `<img src="${esc(photo)}" alt="" class="hero-photo"/>` : ""}
      <h1 class="hero-name">${esc(h.name || state.site.name || "")}</h1>
      ${h.titleLines ? `<p class="hero-title">${esc(h.titleLines).replace(/\n/g, "<br>")}</p>` : ""}
      ${h.bio ? `<p class="hero-bio">${esc(h.bio)}</p>` : ""}
      ${buttons ? `<div class="btn-row">${buttons}</div>` : ""}
    </div>
    ${contact || h.contactTitle ? `<aside class="contact-card fade-up">
      <div class="contact-head"><p>${esc(h.contactTitle || "")}</p><small>${esc(h.contactSub || "")}</small></div>
      ${contact}
    </aside>` : ""}
  </div></section>
  ${stats ? `<section class="stats-band"><div class="container"><div class="stats">${stats}</div></div></section>` : ""}
  ${explore ? `<div class="container explore">${h.overviewHeading ? `<p class="kicker">${esc(h.overviewHeading)}</p>` : ""}${explore}</div>` : ""}`;
}

function renderLanding() {
  return `<section class="hero"><div class="container">
    <p class="kicker">Welcome</p><h1 class="hero-name">${esc(state.site.name || "Ng Zhi Yao")}</h1>
    <p class="hero-bio">${esc(state.site.tagline || "")}</p>
  </div></section>
  <div class="container explore">${state.categories.map((c) => {
    const pages = tabsIn(c.id); const lockedOut = c.locked && !state.signedIn;
    if (!pages.length && !lockedOut) return "";
    return `<section class="explore-cat"><div class="explore-head"><h2><a href="#/c/${esc(c.id)}">${esc(c.name)}</a></h2></div>
      <div class="card-grid">${lockedOut ? lockedCard(c) : pages.map(pageCard).join("")}</div></section>`;
  }).join("")}</div>`;
}

function renderCategory(c) {
  const pages = tabsIn(c.id); const lockedOut = c.locked && !state.signedIn;
  return `
  <header class="page-head"><div class="container">
    ${crumbs([{ label: c.name }])}
    <h1>${esc(c.name)}${c.locked ? `<span class="pill-lock">${I.lock} Members</span>` : ""}</h1>
    <p>${lockedOut ? "This section is shared with members only." : `${pages.length} page${pages.length === 1 ? "" : "s"}`}</p>
  </div></header>
  <section class="container section"><div class="card-grid">${lockedOut ? lockedCard(c) : (pages.map(pageCard).join("") || '<p class="muted">Nothing here yet.</p>')}</div></section>`;
}

function renderLockedPage() {
  const c = state.categories.find((x) => x.locked);
  return `<header class="page-head"><div class="container">${crumbs([{ label: c ? c.name : "Members" }])}<h1>Members only</h1>
    <p>This page is shared with members. Sign in to read it.</p></div></header>
    <section class="container section"><div class="card-grid">${c ? lockedCard(c).replace(/data-signin="[^"]*"/, `data-signin="${esc(location.hash)}"`) : ""}</div></section>`;
}
function renderNotFound() {
  return `<header class="page-head"><div class="container">${crumbs([{ label: "Not found" }])}<h1>Page not found</h1><p>It may have moved. Try the menu above.</p></div></header>`;
}

function renderPage(tab) {
  const items = tab.items || [];
  const c = catById(tab.category);
  const sections = tab.sections || [];
  const known = new Set(sections.map((s) => s.id));
  const groups = [];
  const loose = items.filter((i) => !i.section || !known.has(i.section));
  if (loose.length) groups.push({ title: "", items: loose });
  sections.forEach((s) => { const g = items.filter((i) => i.section === s.id); if (g.length) groups.push({ title: s.title, items: g }); });
  const siblings = c ? tabsIn(c.id) : [];
  const body = groups.map((g) => `<div class="group">${g.title ? `<h2 class="group-title">${esc(g.title)}</h2>` : ""}${wrapItems(tab.layout, g.items)}</div>`).join("");
  return `
  <header class="page-head"><div class="container">
    ${crumbs(c ? [{ label: c.name, href: `#/c/${esc(c.id)}` }, { label: tab.title }] : [{ label: tab.title }])}
    <h1>${esc(tab.heading || tab.title)}</h1>
    ${tab.intro ? `<p>${esc(tab.intro)}</p>` : ""}
    ${siblings.length > 1 ? `<div class="subtabs" role="tablist">${siblings.map((t) => `<a role="tab" href="#/${esc(t.id)}" class="${t.id === tab.id ? "on" : ""}" aria-selected="${t.id === tab.id}">${esc(t.title)}</a>`).join("")}</div>` : ""}
  </div></header>
  <section class="container section">
    ${body || '<p class="muted">Nothing here yet.</p>'}
    ${tab.note ? `<div class="note">${esc(tab.note)}</div>` : ""}
  </section>`;
}

function wrapItems(layout, items) {
  if (layout === "timeline") return `<div class="timeline">${items.map((i) => `<div class="tl-item fade-up">${renderItem(i)}</div>`).join("")}</div>`;
  if (layout === "cards") return `<div class="item-grid">${items.map((i) => `<div class="item-card fade-up">${renderItem(i)}</div>`).join("")}</div>`;
  return `<div class="list">${items.map((i) => `<div class="list-item fade-up">${renderItem(i)}</div>`).join("")}</div>`;
}

function logoSrc(i) {
  const own = safeImg(i.logo);
  if (own) return { src: own, auto: false };
  let domain = (i.logoDomain || "").trim();
  if (!domain && i.link?.url) { try { domain = new URL(i.link.url).hostname; } catch {} }
  domain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return null;
  return { src: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`, auto: true };
}

function renderItem(i) {
  const logo = logoSrc(i);
  const badge = i.badge?.text ? `<span class="badge badge-${esc(i.badge.tone || "neutral")}">${esc(i.badge.text)}</span>` : "";
  const rating = Number.isFinite(i.rating) && i.rating > 0
    ? `<span class="dots" title="${i.rating} / 5" aria-label="Level ${i.rating} of 5">${[1, 2, 3, 4, 5].map((n) => `<span class="dot${n > i.rating ? " off" : ""}"></span>`).join("")}</span>` : "";
  const link = safeUrl(i.link?.url);
  let host = ""; try { host = link ? new URL(link).hostname.replace(/^www\./, "") : ""; } catch {}
  const side = (i.meta || badge || i.meta2 || rating) ? `<div class="item-side">
      ${i.meta ? `<div class="item-meta">${esc(i.meta)}</div>` : ""}
      ${badge}${i.meta2 ? `<div class="item-meta2">${esc(i.meta2)}</div>` : ""}${rating}
    </div>` : "";
  return `<article class="item">
    ${logo ? `<div class="item-logo"><img src="${esc(logo.src)}" alt="" loading="lazy" ${logo.auto ? 'data-auto="1"' : ""}/></div>` : ""}
    <div class="item-main">
      <div class="item-top"><div>
        <h3 class="item-title">${esc(i.title)}${i.ticker ? `<span class="ticker">${esc(i.ticker)}</span>` : ""}</h3>
        ${i.subtitle ? `<div class="item-sub">${esc(i.subtitle)}</div>` : ""}
      </div>${side}</div>
      ${i.body ? `<p class="item-body">${esc(i.body).replace(/\n/g, "<br>")}</p>` : ""}
      ${(i.bullets || []).length ? `<ul class="bullets">${i.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
      ${i.tagsLabel && (i.tags || []).length ? `<div class="tags-label">${esc(i.tagsLabel)}</div>` : ""}
      ${(i.tags || []).length ? `<div class="tags">${i.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
      ${Number.isFinite(i.progress) && i.progress !== null ? `<div class="progress"><div class="progress-bar"><span style="width:${Math.max(0, Math.min(100, i.progress))}%"></span></div><span>${Math.round(i.progress)}%</span></div>` : ""}
      ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener" class="item-link">${esc(i.link.label || host)} ${I.ext}</a>` : ""}
    </div>
  </article>`;
}

// Hide logos that fail to load, and auto (favicon) logos that come back as a generic placeholder.
function wireLogos(root) {
  $$(".item-logo img", root).forEach((img) => {
    const check = () => { if (img.dataset.auto && img.naturalWidth > 0 && img.naturalWidth <= 16) img.parentElement.remove(); else img.parentElement.classList.add("ok"); };
    img.addEventListener("error", () => img.parentElement.remove());
    if (img.complete) check(); else img.addEventListener("load", check);
  });
}
function toast(msg) {
  const t = Object.assign(document.createElement("div"), { className: "toast", textContent: msg });
  document.body.append(t); setTimeout(() => t.remove(), 3000);
}

// ── Boot ──
(async () => {
  try { await load(); } catch {}
  applyBranding();
  const saved = store.get();
  if (saved && saved.id && saved.kek && state.file && window.ZYCrypto?.supported) {
    try { unlock(await ZYCrypto.openSiteWithKek(state.file, saved.id, saved.kek)); }
    catch { store.clear(); setTimeout(() => toast("Your sign-in has expired. Please sign in again."), 300); }
  }
  $("#boot").hidden = true;
  render();
})();
})();
