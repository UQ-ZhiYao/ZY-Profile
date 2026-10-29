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
  upRight: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="8 7 17 7 17 16"/></svg>',
  left: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
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
  const legacyDefaults = ["#d6132a", "#1e3a5f", "#3967ac"];
  if ((s.version || 0) >= 3 && s.accent && /^#[0-9a-f]{6}$/i.test(s.accent) && !legacyDefaults.includes(s.accent.toLowerCase())) document.documentElement.style.setProperty("--accent", s.accent);
  const logo = safeImg(s.logo);
  $("#brand").innerHTML = (logo ? `<img src="${esc(logo)}" alt="" class="brand-logo"/>` : `<span class="brand-mark">${esc(s.monogram || (s.name || "Zhi Yao").trim().split(/\s+/).slice(-2).map((w) => w[0]).join("").toUpperCase())}</span>`)
    + `<span class="brand-text">${esc(s.logoText || s.name || "NG ZHI YAO")}</span>`;
  $("#footer").innerHTML = `<div class="container">
    <div class="foot-top">
      <div class="foot-brand"><span class="brand-mark">${esc(s.monogram || (s.name || "Zhi Yao").trim().split(/\s+/).slice(-2).map((w) => w[0]).join("").toUpperCase())}</span>
        <p>${esc(s.name || "")}</p><p class="muted">${esc((s.footer || "").replace(/^©\s*\d{4}\s*/, "").replace(/^[^·]*·\s*/, ""))}</p></div>
      ${state.categories.map((c) => `<div class="foot-col"><h4 class="mono">${esc(c.name)}</h4>
        ${c.locked && !state.signedIn ? `<a href="#/c/${esc(c.id)}">Members only</a>` : tabsIn(c.id).map((t) => `<a href="#/${esc(t.id)}">${esc(t.title)}</a>`).join("")}</div>`).join("")}
    </div>
    <div class="foot-word" aria-hidden="true">${esc(s.logoText || s.name || "")}</div>
    <div class="foot-bottom mono"><span>${esc(s.footer || "")}</span><a href="#/">Back to top ↑</a></div>
  </div>`;
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

// ── Navigation (mega-menu) ──
function renderNav() {
  const cur = currentRoute();
  const catBtn = (c, ci) => {
    const pages = tabsIn(c.id);
    const lockedOut = c.locked && !state.signedIn;
    const active = (cur.type === "cat" && cur.id === c.id) || (cur.tab && cur.tab.category === c.id);
    const n = lockedOut ? (state.lockedCount[c.id] || 0) : pages.length;
    const intro = `
      <div class="mm-intro">
        <span class="mono">${pad(ci + 1)} / ${pad(state.categories.length)}</span>
        <div class="mm-name">${esc(c.name)}</div>
        <p>${esc(c.description || defaultCatDesc(c))}</p>
        <a class="mm-all" href="#/c/${esc(c.id)}">${lockedOut ? "About" : "View all"} ${esc(c.name.toLowerCase())} ${I.arrow}</a>
      </div>`;
    const grid = lockedOut ? `
      <div class="mm-locked">
        <span class="icon-tile">${I.lock}</span>
        <div><div class="mm-title">Shared with members</div><div class="mm-sub">${n ? `${n} page${n === 1 ? "" : "s"} · ` : ""}sign in with the details you were given</div></div>
        <div class="mm-locked-actions"><button class="btn btn-red btn-sm" data-signin="#/c/${esc(c.id)}">Sign in</button><a class="link" data-request hidden>Request access</a></div>
      </div>`
      : `<div class="mm-grid">${pages.map((t) => `
        <a class="mm-item" href="#/${esc(t.id)}" role="menuitem">
          <span class="icon-tile">${iconFor(t)}</span>
          <span class="mm-text"><span class="mm-title">${esc(t.title)}</span>${t.summary ? `<span class="mm-sub">${esc(t.summary)}</span>` : ""}</span>
          <span class="mm-go">${I.upRight}</span>
        </a>`).join("") || `<div class="mm-sub">Nothing here yet.</div>`}</div>`;
    return `<li class="nav-cat${active ? " active" : ""}">
      <button class="nav-tab" aria-expanded="false" aria-haspopup="true" data-cat="${esc(c.id)}">${esc(c.name)}${c.locked ? `<span class="nav-lock" title="Members only">${I.lock}</span>` : ""}${I.caret}</button>
      <div class="dropdown" role="menu"><div class="mm">${intro}${grid}</div></div>
    </li>`;
  };
  const plain = topLevel().map((t) => `<li class="nav-cat${cur.tab === t ? " active" : ""}"><a class="nav-tab" href="#/${esc(t.id)}">${esc(t.title)}</a></li>`).join("");
  $("#navCats").innerHTML = state.categories.map(catBtn).join("") + plain;
  const showResume = !!state.resume || (state.membersResume && !state.signedIn);
  $("#resumeBtn").hidden = !showResume;
  $("#resumeBtn").innerHTML = `${state.resume ? I.dl : I.lock} Resume`;
  $("#authBtn").innerHTML = state.signedIn ? "Sign out" : "Member sign in";
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
  wireLogos(main); wireRequest(); wireSliders(main); wireReveal(main); mountGlobe(main); mountPixels(main);
  window.scrollTo(0, 0);
}
function setTitle(t) { const n = state.site.name || "Ng Zhi Yao"; document.title = t ? `${t} — ${n}` : n; }

// ── Views ──
const pad = (n) => String(n).padStart(2, "0");
const defaultCatDesc = (c) => ({ works: "Career, education, skills and credentials.", hobbies: "Investing and the interests outside work.", stories: "Letters, notes and updates shared with members." }[c.id] || (c.locked ? "Shared with members." : "Pages in this section."));
const svg = (d) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  education: svg('<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>'),
  experience: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 12h18"/>'),
  skills: svg('<path d="M12 3l2.4 5 5.6.8-4 3.9.9 5.5L12 15.6 7.1 18.2 8 12.7 4 8.8 9.6 8z"/>'),
  certificates: svg('<circle cx="12" cy="9" r="5"/><path d="M9 13.5L8 21l4-2 4 2-1-7.5"/>'),
  clubs: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.5 3-5.5 6-5.5s5.4 2 6 5.5"/><path d="M16 4.5a3 3 0 0 1 0 6M21 20c-.4-2.6-1.8-4.4-3.8-5.1"/>'),
  investment: svg('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
  coin: svg('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>'),
  story: svg('<path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z"/><path d="M8 7h6M8 11h6"/>'),
  letter: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  travel: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>'),
  page: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>'),
};
function iconKey(t) {
  const s = `${t.id} ${t.title}`.toLowerCase();
  const rules = [["educat|degree|study|school", "education"], ["experien|work|career|job", "experience"], ["skill", "skills"], ["certif|licen", "certificates"],
    ["club|associat|member|volunt", "clubs"], ["invest|portfolio|fund|stock|equit", "investment"], ["coin|numism|collect", "coin"],
    ["letter|update|sharehold|news", "letter"], ["travel|trip|diary", "travel"], ["story|stories|journal|blog|note", "story"]];
  for (const [re, k] of rules) if (new RegExp(re).test(s)) return k;
  return "page";
}
const iconFor = (t) => ICONS[iconKey(t)] || ICONS.page;

// Zetrix-style split section: heading + card grid on the left, live pixel animation on the right.
function miniCard(i, tab) {
  const logo = logoSrc(i);
  const desc = i.subtitle || i.body || (i.bullets || [])[0] || "";
  const badge = i.badge?.text ? `<span class="badge badge-${esc(i.badge.tone || "neutral")}">${esc(i.badge.text)}</span>` : "";
  return `<a class="mini" href="#/${esc(tab.id)}">
    ${logo ? `<span class="mini-icon item-logo"><img src="${esc(logo.src)}" alt="" loading="lazy" ${logo.auto ? 'data-auto="1"' : ""}/></span>` : `<span class="mini-icon">${iconFor(tab)}</span>`}
    <span class="mini-text">
      <span class="mini-title">${esc(i.title)}</span>
      ${desc ? `<span class="mini-desc">${esc(desc)}</span>` : ""}
      ${i.meta || badge ? `<span class="mini-foot">${i.meta ? `<span class="mono">${esc(i.meta)}</span>` : ""}${badge}</span>` : ""}
    </span>
    <span class="mini-go">${I.upRight}</span>
  </a>`;
}
const MAX_MINI = 6;
const SECTION_COLORS = ["#2563eb", "#0891b2", "#4f46e5", "#0284c7", "#1d4ed8", "#0e7490", "#6366f1", "#0ea5e9"];
function storyBlock(tab, cat, k, color) {
  const items = tab.items || [];
  const shown = items.slice(0, MAX_MINI), more = items.length - shown.length;
  return `<section class="story-block" id="s-${esc(tab.id)}" data-k="${k}" data-icon="${esc(iconKey(tab))}" data-color="${color}" data-title="${esc(tab.title)}" data-fig="Fig. ${figNo(tab)} — ${esc(cat ? cat.name : "Profile")}" style="--sec:${color}">
    <span class="plus" aria-hidden="true">+</span>
    <p class="kicker">Fig. ${figNo(tab)} — ${esc(cat ? cat.name : "Profile")}</p>
    <h2 class="h2">${esc(tab.heading || tab.title)}</h2>
    ${tab.intro ? `<p class="lead-p">${esc(tab.intro)}</p>` : ""}
    <div class="mini-grid">${shown.map((i) => miniCard(i, tab)).join("")}
      ${more > 0 ? `<a class="mini mini-more" href="#/${esc(tab.id)}"><span class="mini-more-num">+${more}</span><span class="mini-text"><span class="mini-title">More in ${esc(tab.title)}</span></span><span class="mini-go">${I.upRight}</span></a>` : ""}
    </div>
    <a class="split-link" href="#/${esc(tab.id)}">Open ${esc(tab.title)} ${I.arrow}</a>
  </section>`;
}
function scrollySection(list) {
  if (!list.length) return "";
  const n = list.length;
  const blocks = list.map(([t, c], k) => storyBlock(t, c, k, SECTION_COLORS[k % SECTION_COLORS.length])).join("");
  const first = list[0][0];
  return `<section class="scrolly">
    <div class="container scrolly-grid">
      <div class="scrolly-left">${blocks}</div>
      <aside class="stage" style="--sec:${SECTION_COLORS[0]}">
        <canvas class="stage-canvas" aria-hidden="true"></canvas>
        <div class="stage-cap">
          <span class="stage-count mono"><b>01</b> / ${pad(n)}</span>
          <span class="stage-fig mono">Fig. ${figNo(first)} — ${esc(first.title)}</span>
          <span class="stage-dots">${list.map(([t], k) => `<button class="stage-dot${k ? "" : " on"}" data-go="${k}" aria-label="Go to ${esc(t.title)}" title="${esc(t.title)}"></button>`).join("")}</span>
        </div>
      </aside>
    </div>
  </section>`;
}
let stageStop = null, stageScroll = null;
function mountPixels(root) {
  if (stageStop) { stageStop(); stageStop = null; }
  if (stageScroll) { window.removeEventListener("scroll", stageScroll); stageScroll = null; }
  const blocks = $$(".story-block", root), stage = $(".stage", root);
  if (!blocks.length || !stage || !window.ZYStage) return;
  const progress = () => {
    const mid = innerHeight * 0.5; let idx = 0;
    blocks.forEach((b, k) => { if (b.getBoundingClientRect().top <= mid) idx = k; });
    const next = blocks[idx + 1]; if (!next) return idx;
    const top = blocks[idx].getBoundingClientRect().top, span = next.getBoundingClientRect().top - top;
    const into = (mid - top) / Math.max(1, span);
    return idx + Math.max(0, Math.min(1, (into - 0.5) / 0.5));    // hold the shape, then morph in the second half
  };
  const shapes = blocks.map((b, k) => ({ formation: k, color: b.dataset.color }));
  stageStop = window.ZYStage($(".stage-canvas", stage), shapes, progress);
  let cur = -1, ticking = false;
  const update = () => {
    ticking = false;
    const k = Math.min(blocks.length - 1, Math.round(progress())); if (k === cur) return; cur = k;
    const b = blocks[k];
    stage.style.setProperty("--sec", b.dataset.color);
    $(".stage-fig", stage).textContent = b.dataset.fig.replace(/ — .*/, "") + " — " + b.dataset.title;
    $(".stage-count b", stage).textContent = pad(k + 1);
    const ff = $(".stage-fig", stage); ff.classList.remove("swap"); void ff.offsetWidth; ff.classList.add("swap");
    $$(".stage-dot", stage).forEach((d, j) => d.classList.toggle("on", j === k));
    blocks.forEach((x, j) => x.classList.toggle("is-active", j === k));
  };
  stageScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener("scroll", stageScroll, { passive: true });
  stage.addEventListener("click", (e) => { const d = e.target.closest("[data-go]"); if (d) blocks[+d.dataset.go].scrollIntoView({ behavior: "smooth", block: "start" }); });
  update();
}

const crumbs = (parts) => `<nav class="crumbs mono" aria-label="Breadcrumb"><a href="#/">Home</a>${parts.map((p) => `<span>/</span>${p.href ? `<a href="${p.href}">${esc(p.label)}</a>` : `<span class="here">${esc(p.label)}</span>`}`).join("")}</nav>`;
const figNo = (tab) => { const i = allTabs().filter((t) => t.layout !== "home").sort((a, b) => catIndex(a) - catIndex(b) || byOrder(a, b)).indexOf(tab); return pad(i + 2); };
const catIndex = (t) => { const i = state.categories.findIndex((c) => c.id === t.category); return i < 0 ? 99 : i; };

function pageCard(t) {
  return `<a class="pcard" href="#/${esc(t.id)}">
    <span class="pcard-top"><span class="icon-tile">${iconFor(t)}</span><span class="mono pcard-count">${(t.items || []).length} item${(t.items || []).length === 1 ? "" : "s"}</span></span>
    <span class="pcard-title">${esc(t.heading || t.title)}</span>
    ${t.summary || t.intro ? `<span class="pcard-sub">${esc(t.summary || t.intro)}</span>` : ""}
    <span class="pcard-go">Open ${I.arrow}</span>
  </a>`;
}
function lockedCard(c, after) {
  const n = state.lockedCount[c.id] || 0;
  return `<div class="pcard pcard-locked">
    <span class="icon-tile">${I.lock}</span>
    <span class="pcard-title">${esc(c.name)} are shared with members</span>
    <span class="pcard-sub">${n ? `${n} page${n === 1 ? "" : "s"} waiting. ` : ""}Sign in with the details you were given.</span>
    <span class="pcard-actions"><button class="btn btn-red btn-sm" data-signin="${esc(after || `#/c/${c.id}`)}">Sign in</button><a class="link" data-request hidden>Request access</a></span>
  </div>`;
}

function slideCard(i, tab) {
  const logo = logoSrc(i);
  const badge = i.badge?.text ? `<span class="badge badge-${esc(i.badge.tone || "neutral")}">${esc(i.badge.text)}</span>` : "";
  const desc = i.body || (i.bullets || [])[0] || "";
  return `<a class="slide" href="#/${esc(tab.id)}">
    <span class="slide-top">
      ${logo ? `<span class="item-logo slide-logo"><img src="${esc(logo.src)}" alt="" loading="lazy" ${logo.auto ? 'data-auto="1"' : ""}/></span>` : `<span class="icon-tile">${iconFor(tab)}</span>`}
      ${badge}
    </span>
    <span class="slide-title">${esc(i.title)}</span>
    ${i.subtitle ? `<span class="slide-sub">${esc(i.subtitle)}</span>` : ""}
    ${desc ? `<span class="slide-body">${esc(desc)}</span>` : ""}
    <span class="slide-foot"><span class="mono">${esc(i.meta || i.meta2 || "")}</span><span class="slide-go">${I.upRight}</span></span>
  </a>`;
}
function sliderSection(tab, cat) {
  const items = tab.items || [];
  if (!items.length) return "";
  return `<section class="band slider-band" id="s-${esc(tab.id)}">
    <div class="container">
      <div class="band-head">
        <div>
          <p class="mono kicker">Fig. ${figNo(tab)} — ${esc(cat ? cat.name : "Profile")}</p>
          <h2 class="h2">${esc(tab.heading || tab.title)}</h2>
          ${tab.intro ? `<p class="lead-p">${esc(tab.intro)}</p>` : ""}
        </div>
        <div class="slider-ctrl" data-for="${esc(tab.id)}">
          <span class="mono counter"><b>01</b> / ${pad(items.length)}</span>
          <button class="round" data-dir="-1" aria-label="Previous">${I.left}</button>
          <button class="round" data-dir="1" aria-label="Next">${I.arrow}</button>
          <a class="btn btn-outline btn-sm" href="#/${esc(tab.id)}">View page</a>
        </div>
      </div>
      <div class="track" data-track="${esc(tab.id)}" tabindex="0" aria-label="${esc(tab.title)} highlights">${items.map((i) => slideCard(i, tab)).join("")}</div>
    </div>
  </section>`;
}

function logoStrip() {
  const seen = new Set(); const logos = [];
  allTabs().forEach((t) => (t.items || []).forEach((i) => {
    const l = logoSrc(i); if (!l) return;
    const key = l.src; if (seen.has(key)) return; seen.add(key);
    logos.push({ l, name: (i.subtitle || "").split("·").map((x) => x.trim()).find((x) => /univers|bursa|institut|foundation|commission|cambridge|federation|association/i.test(x) && !/^(member|managed|founder)/i.test(x)) || i.title });
  }));
  if (logos.length < 3) return "";
  const row = logos.map(({ l, name }) => `<span class="logo-chip"><span class="item-logo"><img src="${esc(l.src)}" alt="" loading="lazy" ${l.auto ? 'data-auto="1"' : ""}/></span><span>${esc(name)}</span></span>`).join("");
  return `<section class="band logos-band"><div class="container"><p class="mono kicker center">Organisations along the way</p></div>
    <div class="marquee"><div class="marquee-row">${row}${row}</div></div></section>`;
}

const DEFAULT_PINS = [
  { label: "Singapore", lat: 1.352, lon: 103.82 },
  { label: "Kuala Lumpur", lat: 3.139, lon: 101.687 },
  { label: "Brisbane", lat: -27.47, lon: 153.03 },
];
let globeStop = null;
function mountGlobe(root) {
  if (globeStop) { globeStop(); globeStop = null; }
  const cv = $("#globe", root); if (!cv || !window.ZYGlobe) return;
  const h = homeTab()?.home || {};
  const pins = Array.isArray(h.pins) && h.pins.length ? h.pins : DEFAULT_PINS;
  globeStop = window.ZYGlobe(cv, { pins, accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2563eb" });
}
const ART = ["art-a", "art-b", "art-c", "art-d"];

function renderHome(tab) {
  const h = tab.home || {};
  const photo = safeImg(h.photo);
  const buttons = (h.buttons || []).filter((b) => b.label).map((b) => {
    const target = allTabs().find((t) => t.id === b.target);
    const href = target ? `#/${esc(b.target)}` : (safeUrl(b.target) || "#/");
    const ext = href.startsWith("http") ? ' target="_blank" rel="noopener"' : "";
    return `<a href="${esc(href)}"${ext} class="btn ${b.style === "outline" ? "btn-outline" : "btn-red"} btn-lg">${esc(b.label)}</a>`;
  }).join("");
  const contact = (h.contact || []).filter((r) => r.label || r.value);
  const stats = (h.stats || []).filter((s) => s.num || s.label)
    .map((s) => `<div class="stat"><div class="stat-num">${esc(s.num)}</div><div class="stat-lbl">${esc(s.label)}</div></div>`).join("");
  const pins = Array.isArray(h.pins) && h.pins.length ? h.pins : DEFAULT_PINS;

  const catsHtml = state.categories.map((c, k) => {
    const lockedOut = c.locked && !state.signedIn;
    const pages = tabsIn(c.id);
    return `<a class="eco-card" href="#/c/${esc(c.id)}">
      <span class="eco-art ${ART[k % ART.length]}"><span class="eco-icon">${c.locked ? I.lock : iconFor(pages[0] || { id: c.id, title: c.name })}</span><span class="eco-count">${pad(k + 1)} / ${pad(state.categories.length)}</span></span>
      <span class="eco-body">
        <span class="eco-name">${esc(c.name)}${c.locked ? '<span class="pill-red">Members</span>' : ""}</span>
        <span class="eco-desc">${esc(c.description || defaultCatDesc(c))}</span>
        <span class="eco-pages">${lockedOut ? `<span class="chip">${state.lockedCount[c.id] || 0} for members</span>` : pages.slice(0, 5).map((t) => `<span class="chip">${esc(t.title)}</span>`).join("")}</span>
        <span class="eco-go">${lockedOut ? "Sign in to read" : "Explore"} ${I.arrow}</span>
      </span>
    </a>`;
  }).join("");

  const sectionTabs = [];
  state.categories.forEach((c) => { if (!(c.locked && !state.signedIn)) tabsIn(c.id).forEach((t) => sectionTabs.push([t, c])); });
  topLevel().forEach((t) => sectionTabs.push([t, null]));
  const sliders = scrollySection(sectionTabs.filter(([t]) => (t.items || []).length));

  const lockedCat = state.categories.find((c) => c.locked);
  const cta = lockedCat ? `<section class="band band-plain"><div class="container"><div class="cta">
      <div class="cta-glow" aria-hidden="true"></div>
      <p class="cta-tag">#${esc(lockedCat.name.toUpperCase())}</p>
      <h2 class="h2">${state.signedIn ? `Welcome back. New ${esc(lockedCat.name.toLowerCase())} are waiting.` : `${esc(lockedCat.name)} are shared with members.`}</h2>
      <p class="lead-p">${state.signedIn ? "Pick up where you left off." : esc(state.site.tagline || "Sign in with the details you were given, or ask for access.")}</p>
      <div class="btn-row center">${state.signedIn ? `<a class="btn btn-white btn-lg" href="#/c/${esc(lockedCat.id)}">Read ${esc(lockedCat.name.toLowerCase())}</a>`
        : `<button class="btn btn-white btn-lg" data-signin="#/c/${esc(lockedCat.id)}">Sign in</button><a class="btn btn-ghost-white btn-lg" data-request hidden>Request access</a>`}</div>
    </div></div></section>` : "";

  return `
  <section class="hero">
    <div class="hero-glow" aria-hidden="true"></div>
    <div class="container hero-inner">
      ${h.contactSub ? `<p class="hero-pill"><span class="pulse"></span>${esc(h.contactSub)}</p>` : ""}
      <h1 class="hero-h1">${esc(h.headline || h.name || state.site.name || "")}</h1>
      ${h.titleLines ? `<p class="hero-sub">${esc(h.titleLines).replace(/\n/g, "<br>")}</p>` : ""}
      ${buttons ? `<div class="btn-row center">${buttons}</div>` : ""}
    </div>
    <div class="globe-wrap">
      <canvas id="globe" class="globe" aria-label="Globe showing ${esc(pins.map((p) => p.label).filter(Boolean).join(", "))}" role="img"></canvas>
      <ul class="globe-legend">${pins.map((p, k) => `<li><span class="mono">${pad(k + 1)}</span>${esc(p.label)}</li>`).join("")}</ul>
    </div>
  </section>

  <section class="band band-plain about">
    <div class="container about-grid">
      <div>
        <p class="kicker">About</p>
        <div class="about-who">${photo ? `<img src="${esc(photo)}" alt="" class="about-photo"/>` : ""}<h2 class="h2">${esc(h.name || state.site.name || "")}</h2></div>
      </div>
      <div>${h.bio ? `<p class="about-bio">${esc(h.bio)}</p>` : ""}</div>
    </div>
    ${stats ? `<div class="container"><div class="stats">${stats}</div></div>` : ""}
  </section>

  ${h.showOverview === false ? "" : `<section class="band band-tint"><div class="container">
    <div class="band-head center"><div><p class="kicker">${esc(h.overviewHeading || "Overview")}</p><h2 class="h2">One profile. Built in ${state.categories.length} layers.</h2>
    <p class="lead-p">Everything in one place: what I do, what I enjoy, and the stories I share with members.</p></div></div>
    <div class="eco-grid">${catsHtml}</div></div></section>`}
  ${logoStrip()}
  ${sliders}
  ${cta}
  ${contact.length || h.contactTitle ? `<section class="band band-plain"><div class="container contact-wrap">
      <div><p class="kicker">Contact</p><h2 class="h2">${esc(h.contactTitle || "Get in touch")}</h2>${h.contactSub ? `<p class="lead-p">${esc(h.contactSub)}</p>` : ""}</div>
      <div class="contact-grid">${contact.map((r) => `<div class="contact-cell"><span class="mono">${esc(r.label)}</span><span>${esc(r.value)}</span></div>`).join("")}</div>
    </div></section>` : ""}`;
}

function renderLanding() {
  return `<section class="hero"><div class="hero-glow" aria-hidden="true"></div><div class="container hero-inner">
    <h1 class="hero-h1">${esc(state.site.name || "Ng Zhi Yao")}</h1><p class="hero-sub">${esc(state.site.tagline || "")}</p></div>
    <div class="globe-wrap"><canvas id="globe" class="globe" role="img" aria-label="Globe"></canvas></div></section>
  <section class="band band-plain"><div class="container"><div class="card-grid">${state.categories.map((c) => c.locked && !state.signedIn ? lockedCard(c) : tabsIn(c.id).map(pageCard).join("")).join("")}</div></div></section>`;
}

function renderCategory(c) {
  const pages = tabsIn(c.id); const lockedOut = c.locked && !state.signedIn;
  const k = state.categories.indexOf(c);
  return `
  <header class="page-head"><div class="container">
    ${crumbs([{ label: c.name }])}
    <p class="mono kicker">${pad(k + 1)} / ${pad(state.categories.length)}${c.locked ? " · Members" : ""}</p>
    <h1 class="h1">${esc(c.name)}</h1>
    <p class="lead-p">${esc(c.description || defaultCatDesc(c))}</p>
  </div></header>
  <section class="band"><div class="container"><div class="card-grid">${lockedOut ? lockedCard(c) : (pages.map(pageCard).join("") || '<p class="muted">Nothing here yet.</p>')}</div></div></section>`;
}

function renderLockedPage() {
  const c = state.categories.find((x) => x.locked);
  return `<header class="page-head"><div class="container">${crumbs([{ label: c ? c.name : "Members" }])}<p class="mono kicker">Members</p><h1 class="h1">Members only</h1>
    <p class="lead-p">This page is shared with members. Sign in to read it.</p></div></header>
    <section class="band"><div class="container"><div class="card-grid">${c ? lockedCard(c, location.hash) : ""}</div></div></section>`;
}
function renderNotFound() {
  return `<header class="page-head"><div class="container">${crumbs([{ label: "Not found" }])}<p class="mono kicker">404</p><h1 class="h1">Page not found</h1><p class="lead-p">It may have moved. Try the menu above.</p></div></header>`;
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
  const body = groups.map((g, gi) => `<div class="group">${g.title ? `<h2 class="group-title"><span class="mono">${pad(gi + 1)}</span>${esc(g.title)}</h2>` : ""}${wrapItems(tab.layout, g.items)}</div>`).join("");
  return `
  <header class="page-head"><div class="container">
    ${crumbs(c ? [{ label: c.name, href: `#/c/${esc(c.id)}` }, { label: tab.title }] : [{ label: tab.title }])}
    <div class="page-title-row">
      <span class="icon-tile icon-lg">${iconFor(tab)}</span>
      <div><p class="mono kicker">Fig. ${figNo(tab)} — ${esc(c ? c.name : "Profile")} · ${items.length} item${items.length === 1 ? "" : "s"}</p>
      <h1 class="h1">${esc(tab.heading || tab.title)}</h1></div>
    </div>
    ${tab.intro ? `<p class="lead-p">${esc(tab.intro)}</p>` : ""}
    ${siblings.length > 1 ? `<div class="subtabs" role="tablist">${siblings.map((t) => `<a role="tab" href="#/${esc(t.id)}" class="${t.id === tab.id ? "on" : ""}" aria-selected="${t.id === tab.id}">${esc(t.title)}</a>`).join("")}</div>` : ""}
  </div></header>
  <section class="band page-body"><div class="container">
    ${body || '<p class="muted">Nothing here yet.</p>'}
    ${tab.note ? `<div class="note">${esc(tab.note)}</div>` : ""}
  </div></section>`;
}

// Slider controls: arrows scroll one card; counter follows the scroll position.
function wireSliders(root) {
  $$(".slider-ctrl", root).forEach((ctrl) => {
    const track = $(`[data-track="${CSS.escape(ctrl.dataset.for)}"]`, root); if (!track) return;
    const cards = () => [...track.children];
    const counter = $(".counter b", ctrl);
    const [prev, next] = $$(".round", ctrl);
    const update = () => {
      const left = track.scrollLeft; const list = cards();
      let idx = 0; list.forEach((c, k) => { if (c.offsetLeft - track.offsetLeft <= left + 8) idx = k; });
      const scrollable = track.scrollWidth > track.clientWidth + 4;
      if (scrollable && track.scrollLeft + track.clientWidth >= track.scrollWidth - 4) idx = list.length - 1;
      ctrl.classList.toggle("static", !scrollable);
      counter.textContent = pad(idx + 1);
      prev.disabled = left <= 4; next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    };
    ctrl.addEventListener("click", (e) => {
      const b = e.target.closest(".round"); if (!b) return;
      const step = (cards()[0]?.getBoundingClientRect().width || 300) + 16;
      track.scrollBy({ left: step * Number(b.dataset.dir), behavior: "smooth" });
    });
    track.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
    update(); setTimeout(update, 300);
  });
}
// Fade sections in as they scroll into view.
function wireReveal(root) {
  if (!("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
  $$(".band, .stats-band", root).forEach((el) => { el.classList.add("reveal"); io.observe(el); });
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
