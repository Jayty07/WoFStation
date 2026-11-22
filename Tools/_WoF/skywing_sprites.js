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

// Shade a mask. opts: far (one tone darker), scales (texture), flat (no light/shadow bands).
function shade(m, opts = {}) {
  const p = new Pic(), off = opts.far ? -18 : 0;
  const inside = (a, b) => a < 0 || b < 0 || a >= N || b >= N || m.has(a, b);
  m.each((x, y) => {
    let v;
    const outDown = !inside(x, y + 1) || !inside(x + 1, y), outUp = !inside(x, y - 1) || !inside(x - 1, y);
    if (outDown) v = T.outlineLo;
    else if (outUp) v = T.outlineHi;
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
// Coordinates are in pixel space (pixel centres at +0.5). W frames mirror E with left/right swapped.

// ---- Head
function head(dir) {
  if (dir === 'W') return head('E').mirrored();
  const m = M();
  if (dir === 'S') {
    m.ellipse(32, 12, 6.5, 5.5).ellipse(32, 18, 4.5, 3.8).ellipse(32, 15, 5.5, 4);
    const p = shade(m, { scales: false });
    return p.dot([[30, 20], [33, 20]], T.deep).dot([[28, 9], [29, 9], [34, 9], [35, 9]], T.outlineHi); // nostrils, brow
  }
  if (dir === 'N') {
    m.ellipse(32, 12, 6.5, 5.5).ellipse(32, 15.5, 5, 3.5);
    return shade(m);
  }
  m.ellipse(46, 13, 6, 5).chain([[48, 13.5, 4], [57, 16, 2.6]]).chain([[46, 17, 3], [55, 18.5, 2]]);
  const p = shade(m);
  p.dot([[57, 15]], T.deep);                                   // nostril
  p.dot([[49, 18], [50, 18], [51, 18], [52, 19], [53, 19], [54, 19]], T.outlineLo); // mouth line
  p.dot([[47, 10], [48, 10], [49, 10], [50, 10]], T.outlineHi); // brow ridge
  return p;
}

function eyes(dir) {
  const p = new Pic();
  if (dir === 'S') return p.dot([[28, 12], [29, 12], [34, 12], [35, 12]], 255);
  if (dir === 'E') return p.dot([[49, 12], [50, 12]], 255);
  if (dir === 'W') return eyes('E').mirrored();
  return p;
}

// ---- Body and neck (Chest)
function torsoMask(dir) {
  if (dir === 'W') return torsoMask('E').mirrored();
  const m = M();
  if (dir === 'S') return m.chain([[32, 18, 5], [32, 26, 6]]).ellipse(32, 31, 10, 8).ellipse(32, 36, 8, 6);
  if (dir === 'N') return m.chain([[32, 16, 4.5], [32, 26, 6]]).ellipse(32, 33, 11, 9).ellipse(32, 37, 12, 7);
  return m.ellipse(27, 35, 15, 8.5).ellipse(38, 35, 7, 8.5).ellipse(16, 35, 6, 8).chain([[39, 31, 6.5], [43, 24, 5], [45, 18, 4]]);
}
const torso = dir => shade(torsoMask(dir), { scales: true });

// ---- Limbs. Each returns the mask for one side; `near` limbs are lit normally, far ones a tone darker.
// E view: the dragon's LEFT side faces the camera, so L limbs are near and R limbs are far.
const LIMB = {
  // forelegs (arms)
  armS: () => M().chain([[24.5, 32, 4.5], [24, 41, 3.2], [24, 45.5, 2.8]]),
  armE_near: () => M().chain([[39, 37, 5], [41, 43, 3.2], [42, 46, 2.6]]),
  armE_far: () => M().chain([[33, 39, 3.8], [34, 44, 2.8], [34, 46, 2.4]]),
  // front talons (hands)
  handS: () => M().ellipse(24, 47, 3.8, 2),
  handE_near: () => M().ellipse(44, 47.5, 3.6, 1.9),
  handE_far: () => M().ellipse(36, 47.5, 3, 1.6),
  // hind legs
  legS: () => M().ellipse(15, 36, 4, 6).chain([[15, 40, 3.2], [15.5, 44, 2.4]]),
  legN: () => M().ellipse(41, 38, 5, 6.5).chain([[41, 42, 3.6], [41.5, 46, 2.8]]),
  legE_near: () => M().ellipse(18, 36, 6.5, 7.5).chain([[17, 41, 4], [15, 44, 2.8], [17, 46.5, 2.4]]),
  legE_far: () => M().chain([[12, 40, 3.6], [9, 44, 2.6], [10, 46.5, 2.2]]),
  // hind feet
  footS: () => M().ellipse(15.5, 45.5, 3, 1.6),
  footN: () => M().ellipse(41.5, 48, 3.6, 2),
  footE_near: () => M().ellipse(19.5, 47.5, 3.5, 1.8),
  footE_far: () => M().ellipse(12, 47.5, 3, 1.6),
};

// Claws: dark pixels along the front/bottom of a paw.
const CLAWS = {
  handS: [[21, 48], [23, 49], [25, 49], [27, 48]],
  handE_near: [[47, 48], [48, 48], [46, 49]],
  handE_far: [[38, 48], [39, 48]],
  footS: [[13, 47], [15, 47], [17, 47]],
  footE_near: [[22, 48], [23, 48], [21, 49]],
  footE_far: [[14, 48], [15, 48]],
};

function limbPic(key, far) {
  const p = shade(LIMB[key](), { far, scales: !key.startsWith('hand') && !key.startsWith('foot') });
  if (CLAWS[key]) p.dot(CLAWS[key], T.claw);
  return p;
}

// side = 'r' | 'l'. S: R limb is on the viewer's left; L mirrors it. N: R is on the viewer's right.
function limb(kind, side, dir) {
  const lOf = p => p.mirrored();
  if (dir === 'S') { const p = limbPic(kind + 'S', false); return side === 'r' ? p : lOf(p); }
  if (dir === 'N') {
    if (kind === 'arm' || kind === 'hand') return new Pic(); // forelegs are hidden behind the body from the back
    const p = limbPic(kind + 'N', false); return side === 'r' ? p : lOf(p);
  }
  if (dir === 'E') return limbPic(kind + 'E_' + (side === 'l' ? 'near' : 'far'), side === 'r');
  // W: right side is near; mirror the east frame of the opposite side.
  return limb(kind, side === 'r' ? 'l' : 'r', 'E').mirrored();
}

// ---- Wings (RArm marking, folded at rest). Two layers: bone (skin-coloured) and membrane.
// SkyWings have the biggest wings of any tribe, so even folded the wrists stand well above the shoulders.
function wingParts(dir) {
  const bone = M(), mem = M();
  const side = (sh, wr, tip, trail, fingers) => {
    mem.poly([wr, tip, ...trail, sh]);
    bone.capsule(...sh, 2.2, ...wr, 1.7).capsule(...wr, 1.7, ...tip, 0.9);
    for (const f of fingers) bone.capsule(...wr, 1.2, ...f, 0.6);
  };
  if (dir === 'E') {
    side([38, 28], [30, 10], [5, 17],
      [[6, 24], [10, 30], [15, 30.5], [20, 33], [25, 31], [30, 32], [35, 30]],
      [[10, 30], [20, 33], [30, 32]]);
  } else if (dir === 'S' || dir === 'N') {
    const L = dir === 'S'
      ? { sh: [23, 24], wr: [15, 4], tip: [7, 20], trail: [[6, 26], [8, 32], [12, 30], [16, 33], [20, 28]], f: [[8, 32], [16, 33]] }
      : { sh: [27, 24], wr: [17, 6], tip: [9, 22], trail: [[9, 30], [13, 38], [17, 36], [21, 40], [26, 36]], f: [[13, 38], [21, 40]] };
    side(L.sh, L.wr, L.tip, L.trail, L.f);
    const rb = bone.mirrored(), rm = mem.mirrored(); bone.union(rb); mem.union(rm);
  } else {
    const e = wingParts('E'); return { bone: e.bone.mirrored(), mem: e.mem.mirrored() };
  }
  mem.minus(bone);
  return { bone, mem };
}
function wings(dir) {
  const { bone, mem } = wingParts(dir);
  const memPic = shade(mem, { flat: false });
  // Membrane reads darker from behind and gets thin vein shading.
  if (dir === 'N') for (let i = 0; i < N * N; i++) if (memPic.v[i] > T.outlineHi) memPic.v[i] -= 18;
  return { bone: shade(bone), membrane: memPic };
}

// ---- Horns (HeadTop): long, swept back and up.
function horns(dir) {
  if (dir === 'W') return horns('E').mirrored();
  const m = M(), far = M();
  if (dir === 'E') {
    m.chain([[45, 9, 1.8], [41, 5, 1.3], [36, 2, 0.8]]);
    far.chain([[48, 8.5, 1.4], [45, 4, 1], [41, 1, 0.6]]);
    const p = shade(far, { far: true }).over(shade(m));
    return p.dot([[36, 1], [41, 0]], T.claw);
  }
  m.chain([[28, 8, 1.8], [24.5, 4, 1.3], [21.5, 0.8, 0.8]]);
  m.union(m.mirrored());
  const p = shade(m, { far: dir === 'N' });
  return p.dot([[21, 0], [42, 0]], T.claw);
}

// ---- Cheek spikes (HeadSide)
function cheeks(dir) {
  if (dir === 'W') return cheeks('E').mirrored();
  if (dir === 'E') return shade(spikes([[[41, 14], [36.5, 13], [41, 16.5]], [[42, 17.5], [38, 19.5], [42.5, 19.5]]]));
  const m = spikes([[[26.5, 13.5], [21.5, 12.5], [26.5, 16.5]], [[27, 17], [23, 19], [27.5, 19.5]]]);
  return shade(m.union(m.mirrored()), { far: dir === 'N' });
}

// ---- Tail (Tail): long and whip-thin, curling on the ground. Two layers: scales and underside.
function tailMask(dir) {
  if (dir === 'W') return tailMask('E').mirrored();
  const m = M();
  if (dir === 'E') return m.chain([[13, 33, 4.5], [7, 35, 3.8], [3, 40, 3], [4, 46, 2.4], [10, 50, 1.8], [18, 51, 1.3], [25, 50, 0.9]]);
  if (dir === 'S') return m.chain([[20, 49, 2.6], [12, 51, 2.4], [6, 50.5, 2], [3, 47, 1.5], [3.5, 43, 1], [6, 41, 0.7]]);
  return m.chain([[32, 40, 4], [32, 48, 3.4], [33, 54, 2.6], [37, 58, 1.8], [43, 59, 1.2], [48, 57.5, 0.8]]);
}
function tail(dir) {
  const m = tailMask(dir), pic = shade(m, { scales: true });
  const under = new Pic();
  if (dir !== 'N') {
    // underside: the band of the tail nearest its lower/shadow edge
    const inner = m.interior();
    inner.each((x, y) => { if (stepsOut(m, x, y, 0.3, 1, 2) <= 2) { under.set(x, y, pic.get(x, y) === T.shade ? T.shade : T.base); pic.set(x, y, -1); } });
  }
  return { scales: pic, under };
}

// ---- Underbelly plates (Chest): banded throat and belly scales.
function belly(dir) {
  const p = new Pic();
  if (dir === 'N') return p;
  if (dir === 'W') return belly('E').mirrored();
  const t = torsoMask(dir), inner = t.interior();
  if (dir === 'S') {
    const region = M().ellipse(32, 31, 5.5, 7.5).chain([[32, 21, 2.5], [32, 26, 3.5]]);
    inner.each((x, y) => { if (region.has(x, y)) p.set(x, y, (y % 3 === 0) ? T.mid : (Math.abs(x - 31.5) > 4 ? T.shade : T.base)); });
    return p;
  }
  inner.each((x, y) => {
    const bottom = y > 35 && stepsOut(t, x, y, 0, 1, 5) <= 5;          // underside of the barrel
    const throat = x > 38 && y < 34 && stepsOut(t, x, y, 1, 0.2, 3) <= 3; // front of the neck
    if (bottom) p.set(x, y, x % 3 === 0 ? T.mid : T.base);
    else if (throat) p.set(x, y, y % 3 === 0 ? T.mid : T.base);
  });
  return p;
}

// ---- Back spines (Chest): a ridge down the neck and spine.
function spinesPic(dir) {
  if (dir === 'S') return new Pic();
  if (dir === 'W') return spinesPic('E').mirrored();
  if (dir === 'E') {
    const s = [[42, 20], [40, 24], [37, 27.5], [31, 27], [25, 26.5], [19, 27], [13, 27.5]];
    return shade(spikes(s.map(([x, y]) => [[x - 1.5, y + 1], [x - 2.5, y - 2.5], [x + 1.5, y + 0.5]])), { flat: true });
  }
  const list = [];
  for (let y = 19; y <= 41; y += 5) list.push([[29, y + 2.5], [32, y - 2.5], [35, y + 2.5]]);
  return shade(spikes(list));
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
  ['hind_near', 'skin'], ['front_near', 'skin'], ['head', 'skin'], ['eyes', 'eyes'], ['cheek_spikes', 'skin'], ['horns', 'horns'],
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
    cheek_spikes: sheet(cheeks),
    underbelly: sheet(belly),
    back_spines: sheet(spinesPic),
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
