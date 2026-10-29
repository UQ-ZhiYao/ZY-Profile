// ============================================
// ZY-Profile — scroll-driven voxel stage (abstract isometric pixel cubes)
// One frameless canvas beside the scrolling sections. Each section has a cube
// formation (stack, block, stairs, tower…). As you scroll, tiles dissolve and
// re-assemble into the next formation and colour. No libraries.
// ============================================
(function () {
"use strict";
const COLS = 36, ROWS = 44;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
function hexToRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim()); const n = parseInt(m ? m[1] : "2563eb", 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function inPoly(px, py, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c; } return c; }

// Formations: floating isometric cubes. c = [x, y, (size)] in units of the cube size a.
const FORMATIONS = [
  { a: 5.4, c: [[0, -2.45], [0, 0], [0, 2.45]] },                                   // stacked trio
  { a: 11, c: [[0, 0]] },                                                          // monolith
  { a: 5.2, c: [[0, -1.45], [-1.98, 1.1], [1.98, 1.1]] },                            // triad
  { a: 4.6, c: [[0, -2.5], [-1.98, 0], [1.98, 0], [0, 2.5]] },                      // diamond
  { a: 5, c: [[-1.25, -1.35, 1.45], [1.55, 1.75, 0.9]] },                           // pair (large + small)
  { a: 3.7, c: [[0, 0], [-2.0, -1.28], [2.0, -1.28], [-2.0, 1.28], [2.0, 1.28], [0, -2.56], [0, 2.56]] }, // hive
];

function buildFormation(F) {
  const cells = new Map();
  F.c.slice().sort((p, q) => p[1] - q[1]).forEach(([ux, uy, sc]) => {
    const a = F.a * (sc || 1), cx = ux * F.a, cy = uy * F.a, w = 0.866 * a;
    const T = [cx, cy - a], UR = [cx + w, cy - a / 2], LR = [cx + w, cy + a / 2], B = [cx, cy + a], LL = [cx - w, cy + a / 2], UL = [cx - w, cy - a / 2], C = [cx, cy];
    const faces = [[T, UR, C, UL], [UL, C, B, LL], [C, UR, LR, B]];   // top, left, right
    for (let y = Math.floor(cy - a) - 1; y <= Math.ceil(cy + a) + 1; y++) for (let x = Math.floor(cx - w) - 1; x <= Math.ceil(cx + w) + 1; x++) {
      const px = x + 0.5, py = y + 0.5;
      for (let f = 0; f < 3; f++) if (inPoly(px, py, faces[f])) { cells.set(`${x},${y}`, [x, y, f, clamp((py - (cy - a)) / (2 * a))]); break; }
    }
  });
  const pts = [...cells.values()];
  const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
  const dx = Math.round((COLS - (maxX - minX + 1)) / 2) - minX, dy = Math.round((ROWS - (maxY - minY + 1)) / 2) - minY;
  return pts.map(([x, y, f, t]) => [x + dx, y + dy, f, t]).sort((p, q) => p[1] - q[1] || p[0] - q[0]);
}
const BUILT = FORMATIONS.map(buildFormation);

// shapes: [{ formation:index, color }] ; progress(): continuous section index
window.ZYStage = function (canvas, shapes, progress) {
  if (!canvas.getContext || !shapes.length) return () => {};
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const S = shapes.map((s) => {
    const base = hexToRgb(s.color);
    return { cells: BUILT[s.formation % BUILT.length],
      top: mix(base, [255, 255, 255], 0.55), left: mix(base, [255, 255, 255], 0.08), right: mix(base, [8, 14, 40], 0.42),
      glow: base, dot: mix(base, [255, 255, 255], 0.82) };
  });
  const N = Math.max(...S.map((s) => s.cells.length));
  let seed = 11; const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const jit = Array.from({ length: N }, () => [(rand() - 0.5) * 2, (rand() - 0.5) * 2, rand()]);
  const sparks = Array.from({ length: 26 }, () => ({ x: Math.floor(rand() * (COLS + 8)) - 4, y: rand() * (ROWS + 10), p: rand() * 6, s: 0.5 + rand() }));

  let W = 0, H = 0, dpr = 1, cell = 16, gap = 2, ox = 0, oy = 0, raf = 0, visible = false, mx = -1e9, my = -1e9, shown = 0;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect(); W = Math.max(1, r.width * dpr); H = Math.max(1, r.height * dpr);
    canvas.width = W; canvas.height = H;
    cell = Math.max(4 * dpr, Math.min(W / (COLS + 2), H / (ROWS + 2), 20 * dpr)); gap = Math.max(1.5, cell * 0.13);
    ox = (W - COLS * cell) / 2; oy = (H - ROWS * cell) / 2;
  }
  const faceCol = (sh, f, t) => {
    const c = f === 0 ? sh.top : f === 1 ? sh.left : sh.right;
    return mix(c, f === 0 ? [255, 255, 255] : [8, 14, 40], f === 0 ? (1 - t) * 0.25 : t * 0.25);
  };
  function draw(now) {
    const t = now / 1000;
    shown += (clamp(progress(), 0, S.length - 1) - shown) * (reduce ? 1 : 0.1);
    const i0 = Math.floor(shown), i1 = Math.min(S.length - 1, i0 + 1), f = smooth(shown - i0);
    const A = S[i0], B = S[i1];
    const glow = mix(A.glow, B.glow, f), dotc = mix(A.dot, B.dot, f);
    const sp = (window.scrollY || 0) * 0.005;
    ctx.clearRect(0, 0, W, H);

    // soft glow behind the formation
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.min(W, H) * 0.55);
    g.addColorStop(0, rgb(glow, 0.13)); g.addColorStop(1, rgb(glow, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // background dot lattice (fades out to the edges, ripples with scroll)
    const s = cell - gap;
    for (let gy = -3; gy < ROWS + 3; gy++) for (let gx = -6; gx < COLS + 6; gx++) {
      const x = ox + gx * cell, y = oy + gy * cell; if (x < -cell || x > W || y < -cell || y > H) continue;
      const fall = clamp(1 - Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2)) * 0.92); if (fall < 0.04) continue;
      const w = 0.5 + 0.5 * Math.sin(sp * 2.2 + (gx - gy) * 0.3 + t * 0.5);
      ctx.fillStyle = rgb(dotc, (0.35 + 0.35 * w) * fall); rr(ctx, x, y, s, s, s * 0.26); ctx.fill();
    }
    // loose pixels drifting up
    sparks.forEach((k) => {
      const a = Math.max(0, Math.sin(t * k.s + k.p + sp)) * 0.5; if (a < 0.04) return;
      const yy = ((k.y - sp * 2 * k.s) % (ROWS + 10) + (ROWS + 10)) % (ROWS + 10) - 5;
      ctx.fillStyle = rgb(mix(glow, [255, 255, 255], 0.55), a); rr(ctx, ox + k.x * cell, oy + yy * cell, s, s, s * 0.26); ctx.fill();
    });
    // formation tiles
    const burst = Math.sin(Math.PI * f);
    const float = reduce ? 0 : Math.sin(t * 1.1) * cell * 0.3;
    for (let n = 0; n < N; n++) {
      const pa = A.cells[n % A.cells.length], pb = B.cells[n % B.cells.length];
      const on = (n < A.cells.length ? 1 : 0) * (1 - f) + (n < B.cells.length ? 1 : 0) * f; if (on < 0.02) continue;
      const j = jit[n];
      let gx = pa[0] + (pb[0] - pa[0]) * f + j[0] * burst * 5;
      let gy = pa[1] + (pb[1] - pa[1]) * f + j[1] * burst * 5;
      let x = ox + gx * cell, y = oy + gy * cell + float + (reduce ? 0 : Math.sin(sp * 3 + gx * 0.3) * cell * 0.12);
      const ddx = x + s / 2 - mx, ddy = y + s / 2 - my, dist = Math.hypot(ddx, ddy), Rr = cell * 4;
      if (dist < Rr && dist > 0) { const push = (1 - dist / Rr) * cell * 0.9; x += ddx / dist * push; y += ddy / dist * push; }
      const ca = faceCol(A, pa[2], pa[3]), cb = faceCol(B, pb[2], pb[3]);
      const tw = reduce ? 0 : 0.08 * Math.sin(t * 2.4 - (gx + gy) * 0.35);
      const col = mix(mix(ca, cb, f), [255, 255, 255], Math.max(0, tw));
      const sz = s * (1 - 0.35 * burst * j[2]);
      ctx.globalAlpha = on;
      ctx.fillStyle = rgb(col); rr(ctx, x + (s - sz) / 2, y + (s - sz) / 2, sz, sz, sz * 0.26); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (visible) raf = requestAnimationFrame(draw);
  }
  const host = canvas.parentElement || canvas;
  host.addEventListener("pointermove", (e) => { const r = canvas.getBoundingClientRect(); mx = (e.clientX - r.left) * dpr; my = (e.clientY - r.top) * dpr; });
  host.addEventListener("pointerleave", () => { mx = my = -1e9; });
  resize(); shown = clamp(progress(), 0, S.length - 1);
  const ro = new ResizeObserver(resize); ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; cancelAnimationFrame(raf); if (visible) raf = requestAnimationFrame(draw); }, { threshold: 0 });
  io.observe(canvas);
  return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
};
window.ZYStage.formations = FORMATIONS.length;
})();
