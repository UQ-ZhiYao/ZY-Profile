// ============================================
// ZY-Profile — member site (zy-profile.com)
// Content is published by the admin console as data/site.enc.json (encrypted).
// Members sign in with the username + password the admin gave them; the browser
// decrypts the content locally. Nothing readable is stored in the public repo.
// ============================================
(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => { if (!u || !String(u).trim()) return ""; try { const x = new URL(u, location.href); return ["http:", "https:", "mailto:", "tel:"].includes(x.protocol) ? x.href : ""; } catch { return ""; } };
const safeImg = (u) => (typeof u === "string" && (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i.test(u) || /^https:\/\//i.test(u))) ? u : "";
const ICON_EXT = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
const SESSION_KEY = "zy_member_session";
const state = { site: {}, tabs: [], resume: null, file: null };

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

// ── Branding ──
function applyBranding() {
  const site = state.site;
  if (site.accent && /^#[0-9a-f]{6}$/i.test(site.accent)) document.documentElement.style.setProperty("--accent", site.accent);
  const name = site.name || "Ng Zhi Yao";
  document.title = `${name} — Members`;
  $("#gateName").textContent = name;
  $("#gateTagline").textContent = site.tagline || "";
  $("#gateFooter").textContent = site.footer || "";
  const logo = safeImg(site.logo);
  if (logo) { $("#gateLogo").src = logo; $("#gateLogo").hidden = false; }
  const email = (site.requestEmail || "").trim();
  const req = $("#requestLink");
  if (email) {
    req.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("Access request — " + name)}&body=${encodeURIComponent("Hi,\n\nI'd like access to the members area.\n\nName:\nOrganisation / relationship:\n\nThanks")}`;
    req.hidden = false;
  } else req.hidden = true;
}

// ── Gate ──
function showGate(msg = "", ok = false) {
  $("#boot").hidden = true; $("#site").hidden = true; $("#gate").hidden = false;
  const m = $("#gateMsg"); m.textContent = msg; m.className = "form-msg" + (ok ? " ok" : msg ? " err" : "");
}

$("#signinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target; const btn = f.querySelector("button[type=submit]");
  if (!state.file) { showGate("The members area hasn't been published yet."); return; }
  btn.disabled = true; btn.textContent = "Signing in…";
  try {
    const res = await ZYCrypto.openSite(state.file, f.username.value, f.password.value);
    store.set({ id: res.id, kek: res.kek }, f.remember.checked);
    f.password.value = "";
    enterSite(res.content);
  } catch (err) { showGate(err.code === "bad-login" ? err.message : "Couldn't open the members area. " + (err.message || "")); }
  finally { btn.disabled = false; btn.textContent = "Sign in"; }
});

function signOut() { store.clear(); state.tabs = []; state.resume = null; location.hash = ""; showGate("You've been signed out.", true); }
$$("[data-action=signout]").forEach((b) => b.addEventListener("click", signOut));

// ── Site ──
function enterSite(content) {
  if (content.site) state.site = { ...state.site, ...content.site };
  state.tabs = (content.tabs || []).filter((t) => t.visible !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  state.tabs.forEach((t) => (t.items = (t.items || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))));
  state.resume = content.resume && content.resume.dataUrl ? content.resume : null;
  renderChrome();
  $("#gate").hidden = true; $("#boot").hidden = true; $("#site").hidden = false;
  route();
}

function renderChrome() {
  const s = state.site;
  const logo = safeImg(s.logo);
  $("#navLogo").innerHTML = (logo ? `<img src="${esc(logo)}" alt="" class="nav-logo-img"/>` : "") + `<span>${esc(s.logoText || s.name || "NG ZHI YAO")}</span>`;
  $("#navLinks").innerHTML = state.tabs.map((t) => `<li><a href="#/${esc(t.id)}" data-tab="${esc(t.id)}">${esc(t.title)}</a></li>`).join("")
    + `<li class="mobile-only"><a href="#" data-signout>Sign out</a></li>`;
  $("#footer").textContent = s.footer || "";
  $("#resumeBtn").hidden = !state.resume;
}

$("#navToggle").addEventListener("click", () => {
  const open = document.body.classList.toggle("nav-open");
  $("#navToggle").setAttribute("aria-expanded", String(open));
});
$("#navLinks").addEventListener("click", (e) => {
  document.body.classList.remove("nav-open");
  if (e.target.closest("[data-signout]")) { e.preventDefault(); signOut(); }
});

$("#resumeBtn").addEventListener("click", async () => {
  if (!state.resume) return;
  const blob = await (await fetch(state.resume.dataUrl)).blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: state.resume.fileName || "resume.pdf" });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
});

window.addEventListener("hashchange", () => { if (!$("#site").hidden) route(); });

function route() {
  const id = decodeURIComponent((location.hash.match(/^#\/([^?]*)/) || [])[1] || "");
  const tab = state.tabs.find((t) => t.id === id) || state.tabs[0];
  $$("#navLinks a").forEach((a) => a.classList.toggle("active", !!tab && a.dataset.tab === tab.id));
  const main = $("#main");
  if (!tab) { main.innerHTML = `<div class="page-header"><div class="container"><h1>Welcome</h1><p>Content is on its way.</p></div></div>`; return; }
  document.title = `${tab.heading || tab.title} — ${state.site.name || "Ng Zhi Yao"}`;
  main.innerHTML = tab.layout === "home" ? renderHome(tab) : renderPage(tab, tab.items);
  wireLogos(main);
  window.scrollTo(0, 0);
}

// ── Renderers ──
function renderHome(tab) {
  const h = tab.home || {};
  const photo = safeImg(h.photo);
  const buttons = (h.buttons || []).filter((b) => b.label).map((b) => {
    const href = state.tabs.some((t) => t.id === b.target) ? `#/${esc(b.target)}` : (safeUrl(b.target) || "#/");
    const ext = href.startsWith("http") ? ' target="_blank" rel="noopener"' : "";
    return `<a href="${esc(href)}"${ext} class="btn ${b.style === "outline" ? "btn-outline" : "btn-primary"}">${esc(b.label)}</a>`;
  }).join("");
  const contact = (h.contact || []).filter((r) => r.label || r.value)
    .map((r) => `<div class="contact-row"><span class="lbl">${esc(r.label)}</span><span class="val">${esc(r.value)}</span></div>`).join("");
  const stats = (h.stats || []).filter((s) => s.num || s.label)
    .map((s) => `<div class="stat-box"><div class="stat-num">${esc(s.num)}</div><div class="stat-lbl">${esc(s.label)}</div></div>`).join("");
  const others = state.tabs.filter((t) => t.id !== tab.id && t.layout !== "home");
  const overview = h.showOverview !== false && others.length ? `
    <section class="section"><div class="container">
      <h2 class="section-heading">${esc(h.overviewHeading || "Site Overview")}</h2>
      <div class="grid-3">${others.map((t) => `
        <a href="#/${esc(t.id)}" class="card-link fade-up"><div class="card">
          <div class="item-title">${esc(t.heading || t.title)}</div>
          ${t.summary ? `<div class="item-body" style="margin-top:0.3rem;">${esc(t.summary)}</div>` : ""}
          ${(t.summaryTags || []).length ? `<div class="tags">${t.summaryTags.map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</div>` : ""}
        </div></a>`).join("")}
      </div>
    </div></section>` : "";

  return `
  <section class="hero"><div class="container"><div class="hero-grid">
    <div>
      ${photo ? `<img src="${esc(photo)}" alt="" class="hero-photo"/>` : ""}
      <h1 class="hero-name">${esc(h.name || state.site.name || "")}</h1>
      ${h.titleLines ? `<p class="hero-title">${esc(h.titleLines).replace(/\n/g, "<br>")}</p>` : ""}
      ${h.bio ? `<p class="hero-bio">${esc(h.bio)}</p>` : ""}
      ${buttons ? `<div class="btn-row">${buttons}</div>` : ""}
    </div>
    ${contact || h.contactTitle ? `<div class="contact-card">
      <div class="contact-card-header"><p>${esc(h.contactTitle || "")}</p><small>${esc(h.contactSub || "")}</small></div>
      ${contact}
    </div>` : ""}
  </div></div></section>
  ${stats ? `<section class="stats-band"><div class="container"><div class="stat-row">${stats}</div></div></section>` : ""}
  ${overview}`;
}

function renderPage(tab, items) {
  const sections = tab.sections || [];
  const known = new Set(sections.map((s) => s.id));
  const groups = [];
  const loose = items.filter((i) => !i.section || !known.has(i.section));
  if (loose.length) groups.push({ title: "", items: loose });
  sections.forEach((s) => { const g = items.filter((i) => i.section === s.id); if (g.length) groups.push({ title: s.title, items: g }); });

  const body = groups.map((g, gi) => `
    ${gi > 0 ? '<hr class="divider"/>' : ""}
    ${g.title ? `<h2 class="section-heading">${esc(g.title)}</h2>` : ""}
    ${wrapItems(tab.layout, g.items)}`).join("");

  return `
  <div class="page-header"><div class="container">
    <h1>${esc(tab.heading || tab.title)}</h1>
    ${tab.intro ? `<p>${esc(tab.intro)}</p>` : ""}
  </div></div>
  <section class="section"><div class="container">
    ${body || '<p class="item-body">Nothing here yet.</p>'}
    ${tab.note ? `<hr class="divider"/><div class="info-box">${esc(tab.note)}</div>` : ""}
  </div></section>`;
}

function wrapItems(layout, items) {
  if (layout === "timeline") return `<div class="timeline">${items.map((i) => `<div class="timeline-item fade-up">${renderItem(i, true)}</div>`).join("")}</div>`;
  if (layout === "cards") return `<div class="grid-2">${items.map((i) => `<div class="card fade-up">${renderItem(i, false, true)}</div>`).join("")}</div>`;
  return items.map((i) => renderItem(i)).join("");
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

function renderItem(i, inTimeline = false, inCard = false) {
  const logo = logoSrc(i);
  const badge = i.badge?.text ? `<span class="badge badge-${esc(i.badge.tone || "neutral")}">${esc(i.badge.text)}</span>` : "";
  const rating = Number.isFinite(i.rating) && i.rating > 0
    ? `<div class="dots" title="${i.rating} / 5">${[1, 2, 3, 4, 5].map((n) => `<span class="dot${n > i.rating ? " off" : ""}"></span>`).join("")}</div>` : "";
  const link = safeUrl(i.link?.url);
  const left = `
    <div class="item-title">${esc(i.title)}${i.ticker ? `<span class="ticker">${esc(i.ticker)}</span>` : ""}</div>
    ${i.subtitle ? `<div class="item-sub">${esc(i.subtitle)}</div>` : ""}
    ${i.body ? `<div class="item-body">${esc(i.body).replace(/\n/g, "<br>")}</div>` : ""}
    ${(i.bullets || []).length ? `<ul class="exp-duties">${i.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
    ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener" class="item-link">${ICON_EXT}${esc(i.link.label || new URL(link).hostname)}</a>` : ""}
    ${i.tagsLabel && (i.tags || []).length ? `<div class="tags-label">${esc(i.tagsLabel)}</div>` : ""}
    ${(i.tags || []).length ? `<div class="tags">${i.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
    ${Number.isFinite(i.progress) && i.progress !== null ? `<div class="progress-line"><div class="progress-wrap"><div class="progress-fill" style="width:${Math.max(0, Math.min(100, i.progress))}%"></div></div><span>${Math.round(i.progress)}%</span></div>` : ""}`;
  const right = (badge || i.meta || i.meta2 || rating) ? `
    <div class="row-item-right">
      ${i.meta ? `<div class="item-meta">${esc(i.meta)}</div>` : ""}
      ${badge ? `<div class="right-gap">${badge}</div>` : ""}
      ${i.meta2 ? `<div class="item-meta right-gap">${esc(i.meta2)}</div>` : ""}
      ${rating ? `<div class="right-gap">${rating}</div>` : ""}
    </div>` : "";
  const logoHtml = logo ? `<div class="item-logo"><img src="${esc(logo.src)}" alt="" loading="lazy" ${logo.auto ? 'data-auto="1"' : ""}/></div>` : "";
  const cls = inTimeline ? "row-item in-timeline" : inCard ? "row-item in-card" : "row-item fade-up";
  return `<div class="${cls}">${logoHtml}<div class="row-item-left">${left}</div>${right}</div>`;
}

// Hide logos that fail to load, and auto (favicon) logos that come back as a generic placeholder.
function wireLogos(root) {
  $$(".item-logo img", root).forEach((img) => {
    const check = () => { if (img.dataset.auto && img.naturalWidth > 0 && img.naturalWidth <= 16) img.parentElement.remove(); else img.parentElement.classList.add("ok"); };
    img.addEventListener("error", () => img.parentElement.remove());
    if (img.complete) check(); else img.addEventListener("load", check);
  });
}

// ── Boot ──
(async () => {
  if (!window.ZYCrypto || !ZYCrypto.supported) { showGate("Please open this site over https:// in an up-to-date browser."); return; }
  try {
    const [pub, file] = await Promise.all([fetchJson("data/public.json").catch(() => null), fetchJson("data/site.enc.json")]);
    state.site = pub || {};
    state.file = file;
  } catch (e) { state.file = null; }
  applyBranding();
  if (!state.file) { showGate(); $("#gateMsg").className = "form-msg"; $("#gateMsg").textContent = "The members area is being set up. Please check back soon."; return; }
  const saved = store.get();
  if (saved && saved.id && saved.kek) {
    try { return enterSite(await ZYCrypto.openSiteWithKek(state.file, saved.id, saved.kek)); }
    catch { store.clear(); return showGate("Your sign-in has expired. Please sign in again."); }
  }
  showGate();
})();
})();
