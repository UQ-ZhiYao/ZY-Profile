// ============================================
// ZY-Profile — dotted globe with location pins (canvas, no libraries)
// Orthographic projection of Natural Earth land dots + coastlines (globe-data.js).
// ============================================
(function () {
"use strict";
const RAD = Math.PI / 180;

window.ZYGlobe = function (canvas, opts) {
  const data = window.ZY_GLOBE; if (!data || !canvas.getContext) return () => {};
  const ctx = canvas.getContext("2d");
  const clean = (list) => (list || []).filter((p) => p.lat !== "" && p.lon !== "" && Number.isFinite(+p.lat) && Number.isFinite(+p.lon)).map((p) => ({ label: p.label || "", lat: +p.lat, lon: +p.lon }));
  let pins = clean(opts.pins);
  let arcs = opts.arcs !== false;
  const accent = opts.accent || "#2563eb";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const avgLon = pins.length ? pins.reduce((s, p) => s + p.lon, 0) / pins.length : 115;
  const avgLat = pins.length ? pins.reduce((s, p) => s + p.lat, 0) / pins.length : 5;
  let lon0 = avgLon, lat0 = Math.max(-45, Math.min(45, avgLat - 20)), drift = 0, dragging = null, visible = true, raf = 0, t0 = performance.now();

  // precompute dot unit vectors
  const D = data.d, N = D.length / 2;
  const dLon = new Float32Array(N), dLat = new Float32Array(N);
  for (let i = 0; i < N; i++) { dLon[i] = D[2 * i] / 10 * RAD; dLat[i] = D[2 * i + 1] / 10 * RAD; }

  let W = 0, H = 0, R = 0, cx = 0, cy = 0, dpr = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect(); W = r.width * dpr; H = r.height * dpr;
    canvas.width = W; canvas.height = H;
    if (opts.fit === "full") { R = Math.min(W, H) / 2 * 0.86; cx = W / 2; cy = H / 2; }
    else { R = Math.min(W, H * 1.6) / 2 * 0.92; cx = W / 2; cy = R + 40 * dpr; }
  }
  function project(lon, lat, l0, p0) {
    const cosc = Math.sin(p0) * Math.sin(lat) + Math.cos(p0) * Math.cos(lat) * Math.cos(lon - l0);
    const x = Math.cos(lat) * Math.sin(lon - l0);
    const y = Math.cos(p0) * Math.sin(lat) - Math.sin(p0) * Math.cos(lat) * Math.cos(lon - l0);
    return [cx + R * x, cy - R * y, cosc];
  }
  function slerp(a, b, t) {   // great-circle interpolation in lon/lat (radians)
    const va = [Math.cos(a[1]) * Math.cos(a[0]), Math.cos(a[1]) * Math.sin(a[0]), Math.sin(a[1])];
    const vb = [Math.cos(b[1]) * Math.cos(b[0]), Math.cos(b[1]) * Math.sin(b[0]), Math.sin(b[1])];
    const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
    const om = Math.acos(dot); if (om < 1e-6) return a;
    const s1 = Math.sin((1 - t) * om) / Math.sin(om), s2 = Math.sin(t * om) / Math.sin(om);
    const v = [s1 * va[0] + s2 * vb[0], s1 * va[1] + s2 * vb[1], s1 * va[2] + s2 * vb[2]];
    return [Math.atan2(v[1], v[0]), Math.asin(v[2])];
  }

  function draw(now) {
    const time = (now - t0) / 1000;
    if (!dragging && !reduce) drift = Math.sin(time * 0.12) * 18;
    const l0 = (lon0 + drift) * RAD, p0 = lat0 * RAD; view.l0 = l0; view.p0 = p0;
    ctx.clearRect(0, 0, W, H);

    // sphere
    const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.45, R * 0.1, cx, cy, R);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.65, "#f4f4f6"); g.addColorStop(1, "#e7e7ec");
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1 * dpr; ctx.strokeStyle = "rgba(24,24,27,.10)"; ctx.stroke();

    // land dots
    const dr = 1.5 * dpr;
    for (let i = 0; i < N; i++) {
      const [x, y, c] = project(dLon[i], dLat[i], l0, p0);
      if (c <= 0.02) continue;
      ctx.globalAlpha = Math.min(1, 0.12 + c * 0.7);
      ctx.fillStyle = "#52525b";
      ctx.fillRect(x - dr / 2, y - dr / 2, dr, dr);
    }
    ctx.globalAlpha = 1;

    // coastlines
    ctx.lineWidth = 0.8 * dpr; ctx.strokeStyle = "rgba(39,39,42,.38)"; ctx.lineJoin = "round";
    for (const line of data.c) {
      ctx.beginPath(); let pen = false;
      for (let k = 0; k < line.length; k += 2) {
        const [x, y, c] = project(line[k] / 10 * RAD, line[k + 1] / 10 * RAD, l0, p0);
        if (c > 0) { pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true; } else pen = false;
      }
      ctx.stroke();
    }

    // arcs between pins
    const pr = pins.map((p) => [p.lon * RAD, p.lat * RAD]);
    for (let k = 0; arcs && k + 1 < pr.length; k++) {
      ctx.beginPath(); let pen = false; const steps = 48;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps; const [lo, la] = slerp(pr[k], pr[k + 1], t);
        const lift = 1 + Math.sin(Math.PI * t) * 0.12;
        const [x, y, c] = project(lo, la, l0, p0);
        const X = cx + (x - cx) * lift, Y = cy + (y - cy) * lift;
        if (c > -0.05) { pen ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); pen = true; } else pen = false;
      }
      ctx.setLineDash([5 * dpr, 6 * dpr]); ctx.lineDashOffset = -time * 18 * dpr;
      ctx.strokeStyle = accent; ctx.globalAlpha = 0.75; ctx.lineWidth = 1.4 * dpr; ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }

    // pins: red spike out of the surface + pulsing base + label
    const placed = [];
    pins.forEach((p, k) => {
      const [x, y, c] = project(p.lon * RAD, p.lat * RAD, l0, p0);
      const crowded = placed.some(([px, py]) => Math.hypot(px - x, py - y) < 60 * dpr); placed.push([x, y]);
      if (c <= 0) return;
      const len = 0.16 + 0.04 * Math.sin(time * 2 + k);
      const X = cx + (x - cx) * (1 + len), Y = cy + (y - cy) * (1 + len) - 18 * dpr * c;
      const sg = ctx.createLinearGradient(x, y, X, Y);
      sg.addColorStop(0, accent); sg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.beginPath(); ctx.moveTo(x - 2.2 * dpr, y); ctx.lineTo(X, Y); ctx.lineTo(x + 2.2 * dpr, y); ctx.closePath();
      ctx.fillStyle = sg; ctx.fill();
      const pulse = (time * 0.8 + k * 0.3) % 1;
      ctx.beginPath(); ctx.arc(x, y, (3 + pulse * 12) * dpr, 0, Math.PI * 2);
      ctx.strokeStyle = accent; ctx.globalAlpha = (1 - pulse) * 0.6 * c; ctx.lineWidth = 1.2 * dpr; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(x, y, 3.2 * dpr, 0, Math.PI * 2); ctx.fillStyle = accent; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 1.3 * dpr, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
      if (p.label && c > 0.25) {
        ctx.font = `600 ${11.5 * dpr}px Inter, system-ui, sans-serif`;
        const tw = ctx.measureText(p.label).width, padX = 8 * dpr, h = 22 * dpr;
        const lx = crowded ? x - 10 * dpr - (tw + padX * 2) : x + 10 * dpr, ly = crowded ? y + 8 * dpr : y - 30 * dpr;
        ctx.globalAlpha = Math.min(1, c * 1.4);
        ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.strokeStyle = "rgba(24,24,27,.10)"; ctx.lineWidth = 1 * dpr;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(lx, ly, tw + padX * 2, h, h / 2) : ctx.rect(lx, ly, tw + padX * 2, h); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#18181b"; ctx.textBaseline = "middle"; ctx.fillText(p.label, lx + padX, ly + h / 2 + 0.5 * dpr);
        ctx.globalAlpha = 1;
      }
    });

    if (!reduce && visible) raf = requestAnimationFrame(draw);
  }

  // drag to spin
  const view = { l0: 0, p0: 0 };
  let downAt = null;
  canvas.addEventListener("pointerdown", (e) => { downAt = { x: e.clientX, y: e.clientY }; dragging = { x: e.clientX, y: e.clientY, lon: lon0 + drift, lat: lat0 }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    lon0 = dragging.lon - (e.clientX - dragging.x) * 0.35; drift = 0;
    lat0 = Math.max(-60, Math.min(60, dragging.lat + (e.clientY - dragging.y) * 0.25));
    if (reduce) draw(performance.now());
  });
  const end = (e) => {
    if (dragging) { t0 = performance.now(); }
    dragging = null;
    // a click (not a drag) → report the lat/lon under the pointer
    if (opts.onPick && downAt && e && e.type === "pointerup" && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5) {
      const r = canvas.getBoundingClientRect();
      const X = ((e.clientX - r.left) * dpr - cx) / R, Y = -((e.clientY - r.top) * dpr - cy) / R, rho = Math.hypot(X, Y);
      if (rho <= 1) {
        const c = Math.asin(rho), p0 = view.p0, l0 = view.l0;
        const lat = rho < 1e-9 ? p0 : Math.asin(Math.cos(c) * Math.sin(p0) + Y * Math.sin(c) * Math.cos(p0) / rho);
        const lon = l0 + Math.atan2(X * Math.sin(c), rho * Math.cos(c) * Math.cos(p0) - Y * Math.sin(c) * Math.sin(p0));
        opts.onPick(+(lat / RAD).toFixed(3), +((((lon / RAD) + 540) % 360) - 180).toFixed(3));
      }
    }
    downAt = null;
  };
  canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);

  resize();
  const ro = new ResizeObserver(() => { resize(); if (reduce) draw(performance.now()); }); ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; cancelAnimationFrame(raf); if (visible) raf = requestAnimationFrame(draw); });
  io.observe(canvas);
  raf = requestAnimationFrame(draw);
  const stop = () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  stop.setPins = (list, focus) => {
    pins = clean(list);
    if (focus && pins.length) { const p = pins[pins.length - 1]; lon0 = p.lon; lat0 = Math.max(-45, Math.min(45, p.lat - 10)); drift = 0; t0 = performance.now(); }
    if (reduce) draw(performance.now());
  };
  stop.setArcs = (on) => { arcs = !!on; if (reduce) draw(performance.now()); };
  return stop;
};
})();
