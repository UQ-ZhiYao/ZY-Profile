// ============================================
// ZY-Profile — live pixel-art animation for the split sections
// A field of soft dots; an icon built from rounded red tiles (lit top-left,
// darker bottom-right) that assembles on scroll, shimmers, floats, and
// nudges away from the pointer. No libraries.
// ============================================
(function () {
"use strict";
const ART = {
  education: [
    ".......##.......",
    ".....######.....",
    "...##########...",
    ".##############.",
    "################",
    ".##############.",
    "...##########.#.",
    "....########..#.",
    "....########..#.",
    "....########..#.",
    ".....######..###",
    "..............#."],
  experience: [
    ".....######.....",
    ".....##..##.....",
    "################",
    "################",
    "################",
    "################",
    "#######..#######",
    "#######..#######",
    "################",
    "################",
    "################",
    ".##############."],
  skills: [
    ".......##.......",
    "......####......",
    "......####......",
    ".....######.....",
    "################",
    ".##############.",
    "...##########...",
    "....########....",
    "....########....",
    "...####..####...",
    "..###......###..",
    ".##..........##."],
  certificates: [
    "..###......###..",
    "...###....###...",
    "....###..###....",
    ".....######.....",
    "....########....",
    "...##########...",
    "..####....####..",
    "..###......###..",
    "..###......###..",
    "..####....####..",
    "...##########...",
    "....########...."],
  clubs: [
    "....###.....###.",
    "...#####...#####",
    "...#####...#####",
    "....###.....###.",
    "................",
    "..#######.######",
    ".#########.#####",
    ".##########.####",
    ".##########.####",
    ".##########.####",
    ".##########....."],
  investment: [
    ".........#######",
    "............####",
    "...........##.##",
    "..........##...#",
    ".........##.....",
    "............##..",
    ".........##.##..",
    "......##.##.##..",
    "...##.##.##.##..",
    "##.##.##.##.##..",
    "##.##.##.##.##..",
    "################"],
  coin: [
    "...##########...",
    ".##############.",
    "################",
    ".##############.",
    "...##########...",
    ".##############.",
    "################",
    ".##############.",
    "...##########...",
    ".##############.",
    "################",
    ".##############.",
    "...##########..."],
  letter: [
    "################",
    ".##############.",
    "#.############.#",
    "##.##########.##",
    "###.########.###",
    "####.######.####",
    "#####.####.#####",
    "######....######",
    "################",
    "################"],
  story: [
    ".######..######.",
    "#######..#######",
    "#######..#######",
    "#######..#######",
    "#######..#######",
    "#######..#######",
    "#######..#######",
    "#######..#######",
    ".######..######.",
    ".......##......."],
  travel: [
    ".....######.....",
    "...##########...",
    "..###.####.###..",
    ".####.####.####.",
    ".####.####.####.",
    "################",
    ".####.####.####.",
    ".####.####.####.",
    "..###.####.###..",
    "...##########...",
    ".....######....."],
  page: [
    "##########......",
    "##########.#....",
    "##########.##...",
    "##########.###..",
    "###############.",
    "###.........####",
    "################",
    "###.........####",
    "################",
    "###.........####",
    "################",
    "################"],
};

function hexToRgb(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim()); const n = parseInt(m ? m[1] : "d6132a", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const ease = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

window.ZYPixel = function (canvas, key, accentHex, seed = 1) {
  if (!canvas.getContext) return () => {};
  const ctx = canvas.getContext("2d");
  const art = ART[key] || ART.page;
  const rows = art.length, cols = Math.max(...art.map((r) => r.length));
  const base = hexToRgb(accentHex);
  const light = mix(base, [255, 255, 255], 0.28), dark = mix(base, [40, 10, 14], 0.5);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let rnd = seed * 9301 + 49297; const rand = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);

  const cells = [];
  art.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") cells.push({ x, y, sx: (rand() - 0.5) * 30, sy: (rand() - 0.5) * 30 + 10, d: rand() * 0.5 }); }));
  const sparks = Array.from({ length: 16 }, () => ({ x: Math.floor(rand() * (cols + 8)) - 4, y: Math.floor(rand() * (rows + 6)) - 3, p: rand() * 6, s: 2.5 + rand() * 3 }));

  let W = 0, H = 0, dpr = 1, cell = 20, gap = 3, ox = 0, oy = 0, raf = 0, visible = false, t0 = 0, started = false;
  let mx = -1e9, my = -1e9;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect(); W = Math.max(1, r.width * dpr); H = Math.max(1, r.height * dpr);
    canvas.width = W; canvas.height = H;
    cell = Math.max(8 * dpr, Math.min(W / (cols + 5), H / (rows + 6), 30 * dpr)); gap = Math.max(2, cell * 0.14);
    ox = (W - cols * cell) / 2; oy = (H - rows * cell) / 2;
  }
  function draw(now) {
    if (!started) { started = true; t0 = now; }
    const t = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);
    // background dot field, fading towards the edges
    const bc = cell * 0.9, s = bc - gap;
    for (let y = (oy % bc) - bc; y < H; y += bc) for (let x = (ox % bc) - bc; x < W; x += bc) {
      const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2); const f = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 0.95);
      if (f <= 0.02) continue; ctx.fillStyle = `rgba(24,24,27,${0.045 * f})`; rr(ctx, x, y, s, s, s * 0.22); ctx.fill();
    }
    // floating sparkles
    sparks.forEach((p) => {
      const a = Math.max(0, Math.sin(t * 0.7 + p.p)) * 0.35; if (a < 0.02) return;
      const x = ox + p.x * cell, y = oy + p.y * cell - ((t * p.s) % (cell * 3));
      ctx.fillStyle = rgba(mix(base, [255, 255, 255], 0.65), a); rr(ctx, x, y, cell - gap, cell - gap, (cell - gap) * 0.22); ctx.fill();
    });
    // the icon
    const float = reduce ? 0 : Math.sin(t * 1.1) * cell * 0.25;
    const sz = cell - gap;
    cells.forEach((c) => {
      const k = reduce ? 1 : ease((t - c.d) / 1.1);
      let x = ox + c.x * cell + c.sx * cell * (1 - k), y = oy + c.y * cell + c.sy * cell * (1 - k) + float;
      // pointer repel
      const ddx = x + sz / 2 - mx, ddy = y + sz / 2 - my, dist = Math.hypot(ddx, ddy), R = cell * 3;
      if (dist < R && dist > 0) { const push = (1 - dist / R) * cell * 0.6; x += ddx / dist * push; y += ddy / dist * push; }
      const diag = (c.x / cols + c.y / rows) / 2;                     // 0 top-left … 1 bottom-right
      const shimmer = reduce ? 0 : 0.12 * Math.sin(t * 2.2 - (c.x + c.y) * 0.45);
      const col = mix(light, dark, Math.max(0, Math.min(1, diag * 1.15 + shimmer)));
      ctx.globalAlpha = Math.min(1, k * 1.2);
      ctx.fillStyle = rgba(col, 1); rr(ctx, x, y, sz, sz, sz * 0.24); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.14)"; rr(ctx, x + sz * 0.12, y + sz * 0.1, sz * 0.5, sz * 0.22, sz * 0.1); ctx.fill();
    });
    ctx.globalAlpha = 1;
    if (!reduce && visible) raf = requestAnimationFrame(draw);
  }
  const host = canvas.parentElement || canvas;
  host.addEventListener("pointermove", (e) => { const r = canvas.getBoundingClientRect(); mx = (e.clientX - r.left) * dpr; my = (e.clientY - r.top) * dpr; });
  host.addEventListener("pointerleave", () => { mx = my = -1e9; });
  resize();
  const ro = new ResizeObserver(() => { resize(); if (reduce || !visible) draw(performance.now()); }); ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; cancelAnimationFrame(raf); if (visible) raf = requestAnimationFrame(draw); }, { threshold: 0.05 });
  io.observe(canvas);
  return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
};
window.ZYPixel.keys = Object.keys(ART);
})();
