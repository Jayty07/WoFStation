// SkyWing sprite generator for WoF Dragon Station.
// Builds every SkyWing body part and marking (64x64, quadruped) from shapes and shades them in SS14's style.
// Sprites are greyscale and tinted in game by skin and marking colour. Run with Node from the repo root:
//   node Tools/_WoF/skywing_sprites.js [--preview out.png]
// No npm packages needed.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..', '..');
const TEX = path.join(ROOT, 'Resources', 'Textures');
const OUT_PARTS = path.join(TEX, '_WoF', 'Mobs', 'Species', 'SkyWing', 'parts.rsi');
const OUT_MARKS = path.join(TEX, '_WoF', 'Mobs', 'Customization', 'SkyWing', 'markings.rsi');
const DOC_PREVIEW = path.join(ROOT, 'Docs', '_WoF', 'skywing_preview.png');

// ---------------------------------------------------------------- PNG I/O (RGBA, non-interlaced)
function crc32(buf) {
  let t = crc32.t;
  if (!t) { t = crc32.t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } }
  let c = -1; for (const x of buf) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0;
}
function readPng(p) {
  const b = fs.readFileSync(p); let o = 8, w, h, bd, ct, pal, trns; const idat = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o), type = b.toString('ascii', o + 4, o + 8), d = b.slice(o + 8, o + 8 + len); o += 12 + len;
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; }
    else if (type === 'PLTE') pal = d; else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d);
  }
  if (bd === 16) throw new Error(`${p}: 16-bit PNGs not supported`);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct], bpp = Math.max(1, ch * bd / 8), stride = Math.ceil(w * ch * bd / 8), raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 4); let prev = Buffer.alloc(stride), ro = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[ro++], line = Buffer.from(raw.slice(ro, ro + stride)); ro += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, u = prev[i], c = i >= bpp ? prev[i - bpp] : 0; let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += u; else if (f === 3) v += (a + u) >> 1;
      else if (f === 4) { const pp = a + u - c, pa = Math.abs(pp - a), pb = Math.abs(pp - u), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const s = x * ch, k = (y * w + x) * 4; let r, g, bl, al = 255;
      if (bd < 8) { // packed palette or greyscale
        const per = 8 / bd, i = (line[Math.floor(x / per)] >> (8 - bd * (x % per + 1))) & ((1 << bd) - 1);
        if (ct === 3) { r = pal[i * 3]; g = pal[i * 3 + 1]; bl = pal[i * 3 + 2]; al = trns && i < trns.length ? trns[i] : 255; }
        else { r = g = bl = Math.round(i * 255 / ((1 << bd) - 1)); }
      }
      else if (ct === 6) { r = line[s]; g = line[s + 1]; bl = line[s + 2]; al = line[s + 3]; }
      else if (ct === 2) { r = line[s]; g = line[s + 1]; bl = line[s + 2]; }
      else if (ct === 4) { r = g = bl = line[s]; al = line[s + 1]; }
      else if (ct === 0) { r = g = bl = line[s]; }
      else { const i = line[s]; r = pal[i * 3]; g = pal[i * 3 + 1]; bl = pal[i * 3 + 2]; al = trns && i < trns.length ? trns[i] : 255; }
      out[k] = r; out[k + 1] = g; out[k + 2] = bl; out[k + 3] = al;
    }
    prev = line;
  }
  return { w, h, data: out };
}
function writePng(p, img) {
  const { w, h, data } = img, raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) data.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, 'ascii'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}
const blank = (w, h) => ({ w, h, data: Buffer.alloc(w * h * 4) });

// ---------------------------------------------------------------- painter
// SkyWings are drawn on a 64x64 canvas at SS14's normal pixel density (32 px per tile), so the dragon is a
// big ~2x2-tile creature. The sprite is centred on the mob: its tile spans pixels 16-47, so the feet sit
// near row 47 and the body rises above. Each part is built from shapes on a per-direction skeleton and
// shaded in SS14's style (dark outline, light from the top-left, three tones, a light scale texture).
const N = 64;
const T = { outlineLo: 100, outlineHi: 122, shade: 148, mid: 164, base: 182, light: 210, claw: 42, deep: 69 };

class Mask {
  constructor() { this.a = new Uint8Array(N * N); }
  has(x, y) { return x >= 0 && y >= 0 && x < N && y < N && this.a[y * N + x] === 1; }
  set(x, y, v = 1) { if (x >= 0 && y >= 0 && x < N && y < N) this.a[y * N + x] = v; }
  each(f) { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (this.a[y * N + x]) f(x, y); }
  plot(test) { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (test(x + 0.5, y + 0.5)) this.a[y * N + x] = 1; return this; }
  ellipse(cx, cy, rx, ry) { return this.plot((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1); }
  capsule(x0, y0, r0, x1, y1, r1) {
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
    return this.plot((x, y) => { const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2)); return Math.hypot(x - x0 - t * dx, y - y0 - t * dy) <= r0 + (r1 - r0) * t; });
  }
  chain(pts) { for (let i = 0; i + 1 < pts.length; i++) this.capsule(...pts[i], ...pts[i + 1]); return this; }
  poly(pts) {
    return this.plot((x, y) => { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; } return inside; });
  }
  union(m) { m.each((x, y) => this.set(x, y)); return this; }
  minus(m) { m.each((x, y) => this.set(x, y, 0)); return this; }
  clone() { const m = new Mask(); m.a.set(this.a); return m; }
  mirrored() { const m = new Mask(); this.each((x, y) => m.set(N - 1 - x, y)); return m; }
  // Pixels whose 4-neighbours are all inside (the frame border counts as inside, so cut-off tails stay open).
  interior() { const m = new Mask(); this.each((x, y) => { const ok = (a, b) => a < 0 || b < 0 || a >= N || b >= N || this.has(a, b); if (ok(x - 1, y) && ok(x + 1, y) && ok(x, y - 1) && ok(x, y + 1)) m.set(x, y); }); return m; }
}
const M = () => new Mask();

// A Pic is a 64x64 greyscale+alpha frame.
class Pic {
  constructor() { this.v = new Int16Array(N * N).fill(-1); }
  get(x, y) { return x >= 0 && y >= 0 && x < N && y < N ? this.v[y * N + x] : -1; }
  set(x, y, v) { if (x >= 0 && y >= 0 && x < N && y < N) this.v[y * N + x] = v; }
  over(p) { for (let i = 0; i < N * N; i++) if (p.v[i] >= 0) this.v[i] = p.v[i]; return this; }
  mirrored() { const p = new Pic(); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) p.v[y * N + N - 1 - x] = this.v[y * N + x]; return p; }
  dot(pts, v) { for (const [x, y] of pts) this.set(x, y, v); return this; }
}

// Distance (in steps of `dir`) from p to the outside of mask m, up to `max`.
function stepsOut(m, x, y, dx, dy, max) {
  for (let k = 1; k <= max; k++) { const a = Math.round(x + dx * k), b = Math.round(y + dy * k); if (a < 0 || b < 0 || a >= N || b >= N) return 99; if (!m.has(a, b)) return k; }
  return 99;
}

// Shade a mask. opts: far (one tone darker), scales (texture), flat (no light/shadow bands), thin (lighter edges).
function shade(m, opts = {}) {
  const p = new Pic(), off = opts.far ? -18 : 0;
  const inside = (a, b) => a < 0 || b < 0 || a >= N || b >= N || m.has(a, b);
  m.each((x, y) => {
    let v;
    const outDown = !inside(x, y + 1) || !inside(x + 1, y), outUp = !inside(x, y - 1) || !inside(x - 1, y);
    // thin: for 1-3px structures like wing fingers, whose pixels are nearly all edge
    if (outDown) v = opts.thin ? T.outlineHi : T.outlineLo;
    else if (outUp) v = opts.thin ? T.base : T.outlineHi;
    else if (opts.flat) v = T.base;
    else {
      const toLight = stepsOut(m, x, y, -0.6, -0.8, 3), toShadow = stepsOut(m, x, y, 0.6, 0.8, 4);
      if (toShadow <= 2) v = T.shade;
      else if (toLight <= 1) v = T.light;
      else if (toShadow <= 3) v = T.mid;
      else v = T.base;
      if (opts.scales && v === T.base && y % 3 === 0 && (x + ((y / 3) & 1) * 2) % 4 === 0) v = T.mid;
    }
    p.set(x, y, Math.max(0, v + (v > T.outlineHi ? off : off / 2)));
  });
  return p;
}

// Small solid triangle spikes, outlined.
function spikes(list) { const m = M(); for (const t of list) m.poly(t); return m; }

const flipPts = pts => pts.map(([x, y, ...r]) => [N - x, y, ...r]);

// ================================================================= SKELETON + PARTS
// SkyWing anatomy, from the tribe's canon description and general Western-dragon build:
//   - largest wings of any tribe: when folded the long finger bones rise far above the back, each finger
//     ending in a hooked claw, with scalloped membrane between them
//   - long S-curved neck holding the head high; thin, long snout with a nose spike; an extra horn on the jaw
//   - long curved horns that sweep back and then up
//   - slender body with a pale throat and belly, a ridge of small spines down the back
//   - long legs (digitigrade hind legs) and a long thin tail that curls at the end
// Coordinates are pixel space (centres at +0.5). Ground is row 48. W frames mirror E.

// Small helpers ---------------------------------------------------------------
const lerp = (a, b, t) => a + (b - a) * t;
// A hooked claw from (x,y) continuing along direction (dx,dy), then curling to one side.
function claw(p, x, y, dx, dy, curl = 1) {
  const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  const pts = [[x + ux, y + uy], [x + ux * 2, y + uy * 2], [x + ux * 2.5 - uy * curl, y + uy * 2.5 + ux * curl]];
  return p.dot(pts.map(([a, b]) => [Math.round(a), Math.round(b)]), T.claw);
}
// Spikes along the outside of a mask: every `step` contour pixels whose outside neighbour is in direction
// (dx,dy), grow a 2-pixel spike that way. Optional region filter.
function ridge(m, p, dx, dy, step, filter = () => true) {
  let n = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!m.has(x, y) || m.has(x + dx, y + dy) || !filter(x, y)) continue;
    if (n++ % step) continue;
    p.set(x + dx, y + dy, T.outlineHi); p.set(x + 2 * dx, y + 2 * dy, T.outlineLo);
  }
  return p;
}

// ---- Head (Head layer): thin long snout, nose spike, jaw horn, brow ridge.
function headMask(dir) {
  const m = M();
  if (dir === 'S') return m.ellipse(32, 11, 4, 3.6).ellipse(32, 15, 2.7, 2.6).ellipse(32, 13, 3.4, 2.6);
  if (dir === 'N') return m.ellipse(32, 11, 4, 3.6).ellipse(32, 13.5, 3, 2.2);
  return m.ellipse(47.5, 10, 3.8, 3.3).chain([[49.5, 10.5, 2.8], [58, 12, 1.5]]).chain([[47.5, 13, 2.3], [56, 13.6, 1.1]]);
}
function head(dir) {
  if (dir === 'W') return head('E').mirrored();
  const m = headMask(dir);
  if (dir === 'S') {
    const jaw = spikes([[[29, 13], [25, 17], [29.5, 15]], [[35, 13], [39, 17], [34.5, 15]]]);
    const p = shade(jaw, { far: true }).over(shade(m));
    return p.dot([[31, 16], [33, 16]], T.deep).dot([[30, 9], [34, 9]], T.outlineHi).dot([[32, 13]], T.light); // nostrils, brow, nose spike
  }
  if (dir === 'N') {
    const jaw = spikes([[[29, 12.5], [25, 16], [29.5, 14.5]], [[35, 12.5], [39, 16], [34.5, 14.5]]]);
    return shade(jaw).over(shade(m));
  }
  const jaw = spikes([[[46, 12.5], [41.5, 15.5], [46.5, 14.5]]]);   // jaw horn, swept back
  const nose = spikes([[[55, 10.6], [56.5, 8.4], [57.5, 10.8]]]);  // nose spike
  const p = shade(jaw).over(shade(m.clone().union(nose)));
  p.dot([[58, 11]], T.deep);                                                      // nostril
  p.dot([[49, 13], [50, 13], [51, 13], [52, 13], [53, 14], [54, 14]], T.outlineLo); // mouth line
  p.dot([[47, 8], [48, 8], [49, 8], [50, 8]], T.outlineHi);                      // brow ridge
  return p;
}

function eyes(dir) {
  const p = new Pic();
  if (dir === 'S') return p.dot([[30, 10], [34, 10]], 255);
  if (dir === 'E') return p.dot([[50, 9], [51, 9]], 255);
  if (dir === 'W') return eyes('E').mirrored();
  return p;
}

// ---- Body and neck (Chest): slender barrel, deep chest, S-curved neck, dorsal ridge.
function torsoMask(dir) {
  if (dir === 'W') return torsoMask('E').mirrored();
  const m = M();
  if (dir === 'S') return m.chain([[32, 15, 2.8], [32, 22, 3.6], [32, 26, 4.6]]).ellipse(32, 31, 7.5, 6.5).ellipse(32, 35, 6.5, 4.5);
  if (dir === 'N') return m.chain([[32, 13, 2.8], [32, 22, 3.6], [32, 27, 5]]).ellipse(32, 33, 8, 7).ellipse(32, 37, 8.5, 5.5);
  return m.ellipse(27, 33, 13, 5.5).ellipse(36, 33, 6, 6.5).ellipse(17, 32.5, 5.5, 5.5)
    .chain([[38, 29, 5], [42.5, 23, 3.6], [43, 17, 3], [46, 12, 2.6]]);
}
function torso(dir) {
  if (dir === 'W') return torso('E').mirrored();
  const m = torsoMask(dir), p = shade(m, { scales: true });
  if (dir === 'E') {
    ridge(m, p, 0, -1, 4, (x, y) => x < 37);            // along the back
    ridge(m, p, -1, 0, 4, (x, y) => x > 38 && y < 27);  // up the back of the neck
  }
  if (dir === 'N') for (let y = 15; y <= 43; y++) p.set(31, y, [T.light, T.mid, T.outlineHi, T.outlineLo][y % 4]);
  return p;
}

// ---- Legs. E view: the dragon's LEFT side faces the camera (near); right side is far (darker).
const LIMB = {
  armS: () => M().chain([[26.5, 31, 3.2], [26, 40, 2.2], [26, 45.5, 1.9]]),
  armE_near: () => M().chain([[37, 33, 4], [38, 40, 2.6], [39, 45, 2]]),
  armE_far: () => M().chain([[33, 35, 3.2], [33.5, 41, 2.2], [34, 45.5, 1.8]]),
  handS: () => M().ellipse(26, 47.2, 2.6, 1.4),
  handE_near: () => M().ellipse(40.5, 47.4, 2.7, 1.4),
  handE_far: () => M().ellipse(35.5, 47.4, 2.3, 1.2),
  legS: () => M().ellipse(21, 35, 3.4, 4.5).chain([[21, 38, 2.4], [20.5, 42, 1.8], [21, 44.5, 1.5]]),
  legN: () => M().ellipse(38.5, 37, 3.6, 5).chain([[38.5, 40, 2.6], [39, 44, 2], [39, 46, 1.8]]),
  legE_near: () => M().ellipse(18, 34, 5, 6).chain([[19, 38, 3.2], [15.5, 42.5, 2.2], [17, 46, 1.8]]),
  legE_far: () => M().chain([[14, 37, 3], [11, 42.5, 2], [12.5, 46, 1.6]]),
  footS: () => M().ellipse(21, 45.8, 2.2, 1.1),
  footN: () => M().ellipse(39, 47.5, 2.6, 1.4),
  footE_near: () => M().ellipse(19, 47.6, 2.8, 1.3),
  footE_far: () => M().ellipse(14, 47.6, 2.4, 1.1),
};
const CLAWS = {
  handS: [[24, 48], [26, 48], [28, 48]],
  handE_near: [[43, 48], [44, 48], [42, 48]],
  handE_far: [[37, 48], [38, 48]],
  footS: [[19, 46], [21, 47], [23, 46]],
  footE_near: [[21, 48], [22, 48], [20, 48]],
  footE_far: [[16, 48], [17, 48]],
};
function limbPic(key, far) {
  const p = shade(LIMB[key](), { far, scales: !key.startsWith('hand') && !key.startsWith('foot') });
  if (CLAWS[key]) p.dot(CLAWS[key], T.claw);
  return p;
}
function limb(kind, side, dir) {
  if (dir === 'S') { const p = limbPic(kind + 'S', false); return side === 'r' ? p : p.mirrored(); }
  if (dir === 'N') {
    if (kind === 'arm' || kind === 'hand') return new Pic();
    const p = limbPic(kind + 'N', false); return side === 'r' ? p : p.mirrored();
  }
  if (dir === 'E') return limbPic(kind + 'E_' + (side === 'l' ? 'near' : 'far'), side === 'r');
  return limb(kind, side === 'r' ? 'l' : 'r', 'E').mirrored();
}

// ---- Wings (Wings layer, behind the body). Folded upright: a short arm from the shoulder to the wrist,
// then five long finger bones fanning up and back, each ending in a hooked claw. The membrane between
// fingertips is scalloped (pulled in toward the wrist) and its trailing edge runs back down to the hips.
// Two layers: bone (scale coloured) and membrane.
function wingSide(sh, wr, tips, trail) {
  const bone = M(), mem = M(), claws = [];
  const poly = [sh, wr, tips[0]];
  for (let i = 1; i < tips.length; i++) {
    const a = tips[i - 1], b = tips[i];
    poly.push([lerp(lerp(a[0], b[0], 0.5), wr[0], 0.1), lerp(lerp(a[1], b[1], 0.5), wr[1], 0.1)], b);
  }
  mem.poly([...poly, ...trail]);
  bone.capsule(...sh, 2.2, ...wr, 1.7);
  tips.forEach((t, i) => { bone.capsule(...wr, i === 0 ? 1.3 : 0.95, ...t, i === 0 ? 0.65 : 0.5); claws.push([t, [t[0] - wr[0], t[1] - wr[1]]]); });
  return { bone, mem, claws };
}
const WING_E = { sh: [35, 28], wr: [30, 21], tips: [[27, 0.5], [21, 1], [15, 3], [10, 7], [6, 13]], trail: [[9, 18], [14, 23], [21, 26], [28, 27]] };
const WING_S = { sh: [27, 26], wr: [22, 19], tips: [[21, 0.5], [16, 1], [11, 4], [7, 9], [5, 16]], trail: [[9, 21], [13, 26], [19, 28], [25, 28]] };
const WING_N = { sh: [27, 26], wr: [22, 19], tips: [[21, 0.5], [16, 1], [11, 4], [7, 9], [5, 16]], trail: [[9, 22], [13, 28], [19, 31], [26, 30]] };

function wingParts(dir) {
  if (dir === 'W') { const e = wingParts('E'); return { bone: e.bone.mirrored(), mem: e.mem.mirrored() }; }
  const spec = dir === 'E' ? WING_E : dir === 'S' ? WING_S : WING_N;
  const s = wingSide(spec.sh, spec.wr, spec.tips, spec.trail);
  let bone = s.bone, mem = s.mem, claws = s.claws;
  if (dir !== 'E') {
    bone = bone.clone().union(s.bone.mirrored()); mem = mem.clone().union(s.mem.mirrored());
    claws = claws.concat(s.claws.map(([t, d]) => [[N - t[0], t[1]], [-d[0], d[1]]]));
  }
  mem.minus(bone);
  const bonePic = shade(bone, { thin: true });
  for (const [t, d] of claws) claw(bonePic, Math.round(t[0] - 0.5), Math.round(t[1] - 0.5), d[0], d[1], d[0] < 0 ? 1 : -1);
  return { bone: bonePic, mem };
}
function wings(dir) {
  const { bone, mem } = wingParts(dir);
  const memPic = shade(mem, { flat: true });
  const boneMask = M(); for (let i = 0; i < N * N; i++) if (bone.v[i] >= 0) boneMask.a[i] = 1;
  mem.interior().each((x, y) => {
    const nearBone = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]].some(([a, b]) => boneMask.has(x + a, y + b));
    if (nearBone) memPic.set(x, y, T.base);
    else if (stepsOut(mem, x, y, 0, 1, 3) <= 1) memPic.set(x, y, 234);
    else memPic.set(x, y, T.light);
  });
  if (dir === 'N') for (let i = 0; i < N * N; i++) if (memPic.v[i] > T.outlineHi) memPic.v[i] -= 18; // seen from behind
  return { bone, membrane: memPic };
}

// ---- Horns (HeadTop): long, curved, sweeping back and then up.
function horns(dir) {
  if (dir === 'W') return horns('E').mirrored();
  if (dir === 'E') {
    const near = M().chain([[47, 7.5, 1.5], [43.5, 5.8, 1.2], [40.5, 5.2, 1], [38, 3.4, 0.8], [37.8, 1.2, 0.5]]);
    const far = M().chain([[49, 7, 1.2], [46, 4.8, 1], [43.5, 3.8, 0.8], [41.8, 2, 0.6], [42, 0.5, 0.4]]);
    return shade(far, { far: true }).over(shade(near)).dot([[37, 0], [41, 0]], T.claw);
  }
  const m = M().chain([[29.5, 8, 1.4], [26.5, 6.2, 1.1], [24.5, 4.2, 0.9], [24, 1.5, 0.6]]);
  m.union(m.mirrored());
  return shade(m, { far: dir === 'N' }).dot([[23, 0], [40, 0]], T.claw);
}

// ---- Tail (Tail layer, behind the body): long, thin, curling at the tip. Scales + underside layers.
function tailMask(dir) {
  if (dir === 'W') return tailMask('E').mirrored();
  const m = M();
  if (dir === 'E') return m.chain([[13, 31, 3.4], [8, 33, 2.8], [4, 37, 2.3], [2.5, 42, 1.9], [4, 46.5, 1.6], [8.5, 48.6, 1.3], [12.5, 47.5, 1], [12.6, 44.6, 0.8], [10.3, 43.6, 0.6]]);
  if (dir === 'S') return m.chain([[24, 44, 2], [16, 47.5, 1.8], [9, 48, 1.5], [5, 45.5, 1.2], [5.8, 42.2, 0.9], [8.6, 41.6, 0.6]]);
  return m.chain([[32, 40, 2.6], [32, 47, 2.2], [33.5, 52, 1.8], [37, 55.5, 1.4], [41, 55, 1], [42, 52, 0.7], [40, 50.5, 0.5]]);
}
function tail(dir) {
  const m = tailMask(dir), pic = shade(m, { scales: true }), under = new Pic();
  if (dir !== 'N') {
    m.interior().each((x, y) => { if (stepsOut(m, x, y, 0.3, 1, 2) <= 2) { under.set(x, y, pic.get(x, y) === T.shade ? T.shade : T.base); pic.set(x, y, -1); } });
  }
  return { scales: pic, under };
}

// ---- Underbelly (Chest marking, default on): pale banded throat and belly plates.
function belly(dir) {
  const p = new Pic();
  if (dir === 'N') return p;
  if (dir === 'W') return belly('E').mirrored();
  const t = torsoMask(dir), inner = t.interior();
  if (dir === 'S') {
    const region = M().chain([[32, 17, 1.6], [32, 26, 2.6]]).ellipse(32, 31, 4, 5.5);
    inner.each((x, y) => { if (region.has(x, y)) p.set(x, y, y % 2 === 0 ? T.mid : T.base); });
    return p;
  }
  inner.each((x, y) => {
    const bottom = y > 34 && stepsOut(t, x, y, 0, 1, 3) <= 3;           // underside of the barrel
    const throat = x > 39 && y < 32 && stepsOut(t, x, y, 1, 0.3, 3) <= 2; // front of the neck
    if (bottom) p.set(x, y, x % 2 === 0 ? T.mid : T.base);
    else if (throat) p.set(x, y, y % 2 === 0 ? T.mid : T.base);
  });
  return p;
}

// ================================================================= BUILD
const DIRS = ['S', 'N', 'E', 'W']; // RSI order: south, north, east, west

function sheet(fn) {
  const img = blank(N * 2, N * 2);
  DIRS.forEach((d, i) => {
    const p = fn(d), ox = (i % 2) * N, oy = Math.floor(i / 2) * N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = p.v[y * N + x]; if (v < 0) continue;
      const k = ((oy + y) * N * 2 + ox + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255;
    }
  });
  return img;
}

function meta(states, copyright) {
  return JSON.stringify({
    version: 1,
    license: 'CC-BY-SA-3.0',
    copyright,
    size: { x: N, y: N },
    states: states.map(s => s === 'full' ? { name: s } : { name: s, directions: 4 }),
  }, null, 4) + '\n';
}

function compositeInto(dst, src, ox, oy, sx, sy, size, tint) {
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sk = ((sy + y) * src.w + sx + x) * 4, a = src.data[sk + 3] / 255; if (!a) continue;
    const dk = ((oy + y) * dst.w + ox + x) * 4;
    for (let c = 0; c < 3; c++) dst.data[dk + c] = Math.round(dst.data[dk + c] * (1 - a) + (src.data[sk + c] * tint[c] / 255) * a);
    dst.data[dk + 3] = 255;
  }
}
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

// Draw order of WoFMobSkyWing's sprite layers (bottom to top), with markings on their category's layer.
// See Docs/_WoF/DRAGON_SPRITES.md. Second value = which colour tints it in previews and the icon.
const DRAW = [
  ['wings_membrane', 'membrane'], ['wings_bone', 'skin'], ['tail', 'skin'], ['tail_underside', 'under'],
  ['hind_far', 'skin'], ['front_far', 'skin'], ['body', 'skin'], ['underbelly', 'belly'],
  ['hind_near', 'skin'], ['front_near', 'skin'], ['head', 'skin'], ['eyes', 'eyes'], ['horns', 'horns'],
];
// Default colours: keep in sync with Resources/Prototypes/_WoF/Species/skywing.yml.
const COL = { skin: '#c8402a', membrane: '#f39c12', belly: '#f2c14e', horns: '#d4a056', under: '#f2c14e', spines: '#7a1c10', eyes: '#ffd23a' };

const join = (...pics) => pics.reduce((a, p) => a.over(p), new Pic());

// Legs per direction. Each state holds the whole leg including its paw.
//   E: the dragon's left side faces the camera, so its left legs are "near". W mirrors E.
//   S: both forelegs stand in front of the chest (front_near) and both hind legs are behind it (hind_far).
//   N: both hind legs are nearest the camera (hind_near); the forelegs are hidden by the body.
function legState(state, dir) {
  if (dir === 'W') return legState(state, 'E').mirrored();
  const front = state.startsWith('front'), near = state.endsWith('near');
  const [upper, lower] = front ? ['arm', 'hand'] : ['leg', 'foot'];
  if (dir === 'E') { const side = near ? 'l' : 'r'; return join(limb(upper, side, 'E'), limb(lower, side, 'E')); }
  const both = () => join(limb(upper, 'r', dir), limb(upper, 'l', dir), limb(lower, 'r', dir), limb(lower, 'l', dir));
  if (dir === 'S') return (front && near) || (!front && !near) ? both() : new Pic();
  return !front && near ? both() : new Pic(); // N
}

function renderInto(dst, all, dirIndex, ox, oy) {
  const sx = (dirIndex % 2) * N, sy = Math.floor(dirIndex / 2) * N;
  for (const [n, c] of DRAW) compositeInto(dst, all[n], ox, oy, sx, sy, N, hex(COL[c]));
}

function scaleUp(img, s) {
  const big = blank(img.w * s, img.h * s);
  for (let y = 0; y < big.h; y++) for (let x = 0; x < big.w; x++) { const k = (Math.floor(y / s) * img.w + Math.floor(x / s)) * 4; img.data.copy(big.data, (y * big.w + x) * 4, k, k + 4); }
  return big;
}

// Preview: the four directions with default colours on a tile grid, plus a 32px human for scale.
function preview(all) {
  const pv = blank(4 * (N + 4) + 40, N + 8);
  for (let y = 0; y < pv.h; y++) for (let x = 0; x < pv.w; x++) {
    const k = (y * pv.w + x) * 4, alt = ((Math.floor((x - 4) / 32) + Math.floor((y - 4) / 32)) & 1) === 0 ? 6 : 0;
    pv.data[k] = 58 + alt; pv.data[k + 1] = 66 + alt; pv.data[k + 2] = 78 + alt; pv.data[k + 3] = 255;
  }
  DIRS.forEach((d, i) => renderInto(pv, all, i, 4 + i * (N + 4), 4));
  const HUMAN = path.join(TEX, 'Mobs', 'Species', 'Human', 'parts.rsi');
  for (const n of ['torso_m', 'head_m', 'r_arm', 'l_arm', 'r_leg', 'l_leg', 'r_foot', 'l_foot', 'r_hand', 'l_hand']) {
    const f = path.join(HUMAN, `${n}.png`);
    if (fs.existsSync(f)) compositeInto(pv, readPng(f), 4 * (N + 4) + 4, 4 + 16, 0, 0, 32, hex('#e8b59b'));
  }
  return pv;
}

function build(previewPath) {
  const wingCache = {}, tailCache = {};
  const W = d => wingCache[d] ??= wings(d), Tl = d => tailCache[d] ??= tail(d);
  const parts = {
    body: sheet(torso),
    head: sheet(head),
    front_near: sheet(d => legState('front_near', d)),
    front_far: sheet(d => legState('front_far', d)),
    hind_near: sheet(d => legState('hind_near', d)),
    hind_far: sheet(d => legState('hind_far', d)),
    eyes: sheet(eyes),
  };
  const marks = {
    wings_membrane: sheet(d => W(d).membrane),
    wings_bone: sheet(d => W(d).bone),
    tail: sheet(d => Tl(d).scales),
    tail_underside: sheet(d => Tl(d).under),
    horns: sheet(horns),
    underbelly: sheet(belly),
  };
  const all = { ...parts, ...marks };

  // Icon ("full"): one coloured, east-facing frame.
  const full = blank(N, N);
  renderInto(full, all, 2, 0, 0);
  parts.full = full;

  for (const dir of [OUT_PARTS, OUT_MARKS]) fs.rmSync(dir, { recursive: true, force: true });
  const credit = 'Original quadruped SkyWing sprites drawn for WoF Dragon Station (Tools/_WoF/skywing_sprites.js).';
  for (const [n, img] of Object.entries(parts)) writePng(path.join(OUT_PARTS, `${n}.png`), img);
  fs.writeFileSync(path.join(OUT_PARTS, 'meta.json'), meta(Object.keys(parts), credit));
  for (const [n, img] of Object.entries(marks)) writePng(path.join(OUT_MARKS, `${n}.png`), img);
  fs.writeFileSync(path.join(OUT_MARKS, 'meta.json'), meta(Object.keys(marks), credit));
  const pv = preview(all);
  writePng(DOC_PREVIEW, scaleUp(pv, 3));
  console.log(`wrote ${Object.keys(parts).length} part states, ${Object.keys(marks).length} marking states and ${path.relative(ROOT, DOC_PREVIEW)}`);
  if (previewPath) { writePng(previewPath, scaleUp(pv, 6)); console.log(`preview: ${previewPath}`); }
}

const pi = process.argv.indexOf('--preview');
build(pi > 0 ? process.argv[pi + 1] : null);
