'use strict';
// Wings of Fire Station ("WoFStation") logo generator.
//
// Regenerates every branding texture in Resources/Textures/Logo/ from the vector
// shapes defined in this file, using a small built-in rasterizer (Node only, no packages):
//
//   node Tools/_WoF/wof_logo.js                     write all logo files
//   node Tools/_WoF/wof_logo.js --preview out.png   also write a preview sheet (dark + light)
//   node Tools/_WoF/wof_logo.js --out some/dir      write the files somewhere else
//
// Original artwork for this server: a dragon head over wings of fire inside a ring of
// ten tribe colours, with custom faceted lettering. It does not copy or trace the
// Wings of Fire book logo, lettering or artwork.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..', '..');
const LOGO_DIR = path.join(ROOT, 'Resources', 'Textures', 'Logo');

// ================================================================ colour + paint helpers
function hex(c) {
  c = c.replace('#', '');
  const v = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
  v.push(c.length >= 8 ? parseInt(c.slice(6, 8), 16) / 255 : 1);
  return v;
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
function mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)]; }
function ramp(stops) {
  const s = stops.map(([t, c]) => [t, typeof c === 'string' ? hex(c) : c]);
  return t => {
    if (t <= s[0][0]) return s[0][1];
    for (let i = 1; i < s.length; i++) {
      if (t <= s[i][0]) return mix(s[i - 1][1], s[i][1], (t - s[i - 1][0]) / (s[i][0] - s[i - 1][0]));
    }
    return s[s.length - 1][1];
  };
}
function solid(c) { const v = typeof c === 'string' ? hex(c) : c; return () => v; }
function linear(x0, y0, x1, y1, stops) {
  const f = ramp(stops), dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
  return (x, y) => f(((x - x0) * dx + (y - y0) * dy) / l2);
}
function radial(cx, cy, r, stops) {
  const f = ramp(stops);
  return (x, y) => f(Math.hypot(x - cx, y - cy) / r);
}
function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3), 1];
}

// ================================================================ path building
// Contours are arrays of [x, y] points, implicitly closed.
class PathB {
  constructor() { this.cs = []; this.cur = null; }
  M(x, y) { this.cur = [[x, y]]; this.cs.push(this.cur); return this; }
  L(x, y) { this.cur.push([x, y]); return this; }
  Q(cx, cy, x, y, n = 14) {
    const [x0, y0] = this.cur[this.cur.length - 1];
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      this.cur.push([u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y]);
    }
    return this;
  }
  C(c1x, c1y, c2x, c2y, x, y, n = 18) {
    const [x0, y0] = this.cur[this.cur.length - 1];
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      this.cur.push([
        u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x,
        u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y,
      ]);
    }
    return this;
  }
}
const P = () => new PathB();
const area = c => { let a = 0; for (let i = 0; i < c.length; i++) { const p = c[i], q = c[(i + 1) % c.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const positive = cs => cs.map(c => (area(c) < 0 ? c.slice().reverse() : c));
const mapPts = (cs, f) => cs.map(c => c.map(p => f(p[0], p[1])));
const mirrorX = (cs, cx) => mapPts(cs, (x, y) => [2 * cx - x, y]).map(c => c.reverse());
const translate = (cs, dx, dy) => mapPts(cs, (x, y) => [x + dx, y + dy]);
const scaleAbout = (cs, cx, cy, s) => mapPts(cs, (x, y) => [cx + (x - cx) * s, cy + (y - cy) * s]);
function circle(cx, cy, r, n = 96) {
  const c = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; c.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return c;
}
// Annular sector between angles a0..a1 (radians, clockwise on screen from +x).
function sector(cx, cy, r0, r1, a0, a1, n = 24) {
  const c = [];
  for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); c.push([cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]); }
  for (let i = n; i >= 0; i--) { const a = lerp(a0, a1, i / n); c.push([cx + Math.cos(a) * r0, cy + Math.sin(a) * r0]); }
  return c;
}
// Tapered ribbon along a polyline (for wing bones): widths are half-widths per point.
function ribbon(pts, hws) {
  const L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l * hws[i], ny = dx / l * hws[i];
    L.push([pts[i][0] + nx, pts[i][1] + ny]);
    R.push([pts[i][0] - nx, pts[i][1] - ny]);
  }
  return [L.concat(R.reverse())];
}
function quadPts(p0, c, p1, n = 12) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]); }
  return out;
}
// A thick polyline as a union of convex pieces: one rectangle per segment plus a miter
// wedge on the outside of every joint. Ends are butt-cut. Used for the lettering.
function strokeParts(pts, hw, closed = false) {
  const out = [], n = pts.length, segs = closed ? n : n - 1;
  const dir = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return [dx / l, dy / l]; };
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n], [ux, uy] = dir(a, b), nx = -uy * hw, ny = ux * hw;
    out.push([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]);
  }
  const joints = [];
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) joints.push(i);
  for (const i of joints) {
    const p = pts[i], d1 = dir(pts[(i - 1 + n) % n], p), d2 = dir(p, pts[(i + 1) % n]);
    const cr = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(cr) < 1e-6) continue;
    const s = cr > 0 ? -1 : 1;
    const o1 = [p[0] - d1[1] * hw * s, p[1] + d1[0] * hw * s], o2 = [p[0] - d2[1] * hw * s, p[1] + d2[0] * hw * s];
    const t = ((o2[0] - o1[0]) * d2[1] - (o2[1] - o1[1]) * d2[0]) / cr;
    const m = [o1[0] + d1[0] * t, o1[1] + d1[1] * t];
    out.push(Math.hypot(m[0] - p[0], m[1] - p[1]) <= hw * 3 ? [p, o1, m, o2] : [p, o1, o2]);
  }
  return out;
}

// ================================================================ rasterizer
// Shapes are scan-converted into a supersampled binary mask; coverage, outlines (dilation)
// and a signed distance field (for bevels) all come from that mask, so overlapping
// pieces union cleanly.
function rasterize(contours, W, H, rule) {
  const edges = [];
  for (const c of contours) {
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length];
      if (a[1] === b[1]) continue;
      edges.push(a[1] < b[1] ? [a[0], a[1], b[0], b[1], 1] : [b[0], b[1], a[0], a[1], -1]);
    }
  }
  edges.sort((p, q) => p[1] - q[1]);
  const mask = new Uint8Array(W * H);
  let ei = 0, active = [];
  const xs = [];
  for (let j = 0; j < H; j++) {
    const y = j + 0.5;
    while (ei < edges.length && edges[ei][1] <= y) active.push(edges[ei++]);
    active = active.filter(e => e[3] > y);
    xs.length = 0;
    for (const e of active) xs.push([e[0] + (y - e[1]) * (e[2] - e[0]) / (e[3] - e[1]), e[4]]);
    xs.sort((p, q) => p[0] - q[0]);
    let wind = 0;
    for (let k = 0; k < xs.length - 1; k++) {
      wind += xs[k][1];
      const inside = rule === 'evenodd' ? (k & 1) === 0 : wind !== 0;
      if (!inside) continue;
      const i0 = Math.max(0, Math.ceil(xs[k][0] - 0.5)), i1 = Math.min(W - 1, Math.ceil(xs[k + 1][0] - 0.5) - 1);
      if (i1 >= i0) mask.fill(1, j * W + i0, j * W + i1 + 1);
    }
  }
  return mask;
}
// Squared Euclidean distance transform (Felzenszwalb & Huttenlocher) to the nearest
// cell whose mask value equals `target`.
function edt(mask, W, H, target) {
  const INF = 1e20, g = new Float32Array(W * H);
  for (let i = 0; i < g.length; i++) g[i] = mask[i] === target ? 0 : INF;
  const n = Math.max(W, H), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const dt = len => {
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < len; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  };
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = g[y * W + x];
    dt(H);
    for (let y = 0; y < H; y++) g[y * W + x] = d[y];
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = g[y * W + x];
    dt(W);
    for (let x = 0; x < W; x++) g[y * W + x] = d[x];
  }
  return g;
}
function blur(map, w, h, radius) {
  const r = Math.max(1, Math.round(radius));
  let a = Float32Array.from(map), b = new Float32Array(map.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[y * w + x] = acc / (2 * r + 1);
        acc += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / (2 * r + 1);
        acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

class Canvas {
  constructor(w, h, ss) {
    this.w = w; this.h = h;
    this.ss = ss || (Math.max(w, h) > 600 ? 3 : 4);
    this.px = new Float32Array(w * h * 4); // premultiplied RGBA, 0..1
  }
  draw(cov, paint, opacity = 1) {
    const { w, h, px } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, c = cov[i];
        if (!(c > 0)) continue;
        const col = paint(x + 0.5, y + 0.5), a = Math.min(1, c) * opacity * col[3];
        if (a <= 0) continue;
        const j = i * 4, ia = 1 - a;
        px[j] = col[0] * a + px[j] * ia;
        px[j + 1] = col[1] * a + px[j + 1] * ia;
        px[j + 2] = col[2] * a + px[j + 2] * ia;
        px[j + 3] = a + px[j + 3] * ia;
      }
    }
  }
  // Composite another canvas (or straight-alpha RGBA bytes) onto this one at integer offset.
  blit(src, ox, oy) {
    for (let y = 0; y < src.h; y++) {
      const ty = y + oy; if (ty < 0 || ty >= this.h) continue;
      for (let x = 0; x < src.w; x++) {
        const tx = x + ox; if (tx < 0 || tx >= this.w) continue;
        const s = (y * src.w + x) * 4, d = (ty * this.w + tx) * 4, a = src.px[s + 3];
        if (a <= 0) continue;
        for (let k = 0; k < 3; k++) this.px[d + k] = src.px[s + k] + this.px[d + k] * (1 - a);
        this.px[d + 3] = a + this.px[d + 3] * (1 - a);
      }
    }
  }
  toRGBA() {
    const out = Buffer.alloc(this.w * this.h * 4);
    for (let i = 0; i < this.w * this.h; i++) {
      const a = this.px[i * 4 + 3];
      if (a <= 0.5 / 255) continue;
      for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.round(clamp01(this.px[i * 4 + k] / a) * 255);
      out[i * 4 + 3] = Math.round(clamp01(a) * 255);
    }
    return out;
  }
}

class Shape {
  // contours in canvas pixels; margin = how far outlines may grow, in pixels
  constructor(cv, contours, rule = 'nonzero', margin = 4) {
    this.cv = cv;
    const ss = cv.ss;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of contours) for (const [x, y] of c) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const m = Math.ceil(margin) + 2;
    this.X0 = Math.max(-m, Math.floor(x0) - m); this.Y0 = Math.max(-m, Math.floor(y0) - m);
    this.X1 = Math.min(cv.w + m, Math.ceil(x1) + m); this.Y1 = Math.min(cv.h + m, Math.ceil(y1) + m);
    this.rw = Math.max(1, this.X1 - this.X0); this.rh = Math.max(1, this.Y1 - this.Y0);
    this.W = this.rw * ss; this.H = this.rh * ss;
    const local = contours.map(c => c.map(([x, y]) => [(x - this.X0) * ss, (y - this.Y0) * ss]));
    this.mask = rasterize(local, this.W, this.H, rule);
  }
  _down(test) {
    const { cv, W, X0, Y0, rw, rh } = this, ss = cv.ss, out = new Float32Array(cv.w * cv.h), inv = 1 / (ss * ss);
    for (let py = 0; py < rh; py++) {
      const cy = py + Y0; if (cy < 0 || cy >= cv.h) continue;
      for (let px = 0; px < rw; px++) {
        const cx = px + X0; if (cx < 0 || cx >= cv.w) continue;
        let n = 0;
        for (let sy = 0; sy < ss; sy++) { const row = (py * ss + sy) * W + px * ss; for (let sx = 0; sx < ss; sx++) n += test(row + sx); }
        if (n) out[cy * cv.w + cx] = n * inv;
      }
    }
    return out;
  }
  cov() { return this._cov || (this._cov = this._down(i => this.mask[i])); }
  grow(r) {
    if (r <= 0) return this.cov();
    this._out = this._out || edt(this.mask, this.W, this.H, 1);
    const lim = (r * this.cv.ss) ** 2, o = this._out;
    return this._down(i => (o[i] <= lim ? 1 : 0));
  }
  // Inner band of width r (an inset "stroke" along the inside of the edge).
  inner(r) {
    this._in = this._in || edt(this.mask, this.W, this.H, 0);
    const lim = (r * this.cv.ss) ** 2, o = this._in, m = this.mask;
    return this._down(i => (m[i] && o[i] <= lim ? 1 : 0));
  }
  sdf() {
    if (this._sdf) return this._sdf;
    this._out = this._out || edt(this.mask, this.W, this.H, 1);
    this._in = this._in || edt(this.mask, this.W, this.H, 0);
    const { cv, W, X0, Y0, rw, rh, mask } = this, ss = cv.ss, out = new Float32Array(cv.w * cv.h).fill(1e3);
    for (let py = 0; py < rh; py++) {
      const cy = py + Y0; if (cy < 0 || cy >= cv.h) continue;
      for (let px = 0; px < rw; px++) {
        const cx = px + X0; if (cx < 0 || cx >= cv.w) continue;
        let s = 0;
        for (let sy = 0; sy < ss; sy++) {
          const row = (py * ss + sy) * W + px * ss;
          for (let sx = 0; sx < ss; sx++) { const i = row + sx; s += mask[i] ? -(Math.sqrt(this._in[i]) - 0.5) : Math.sqrt(this._out[i]) - 0.5; }
        }
        out[cy * cv.w + cx] = s / (ss * ss * ss);
      }
    }
    return (this._sdf = out);
  }
}
const mulCov = (a, b) => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] * b[i]; return o; };
const subCov = (a, b) => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = Math.max(0, a[i] - b[i]); return o; };

// A View maps design units onto a canvas: px = o + k * unit. All paints are in design units.
class View {
  constructor(cv, k, ox = 0, oy = 0) { this.cv = cv; this.k = k; this.ox = ox; this.oy = oy; }
  shape(cs, { rule = 'nonzero', margin = 8 } = {}) {
    const px = cs.map(c => c.map(([x, y]) => [this.ox + x * this.k, this.oy + y * this.k]));
    return new Shape(this.cv, px, rule, margin * this.k + 1);
  }
  paint(p) {
    const f = typeof p === 'function' ? p : solid(p), { k, ox, oy } = this;
    return (x, y) => f((x - ox) / k, (y - oy) / k);
  }
  fill(cov, p, op = 1) { this.cv.draw(cov.mask ? cov.cov() : cov, this.paint(p), op); }
  // outline of `r` design units, never thinner than `minPx` pixels
  outline(s, r, p, op = 1, minPx = 1) { this.cv.draw(s.grow(Math.max(r * this.k, minPx)), this.paint(p), op); }
  glow(s, r, p, op = 1, grow = 0) {
    const base = grow ? s.grow(grow * this.k) : s.cov();
    this.cv.draw(blur(base, this.cv.w, this.cv.h, Math.max(1, r * this.k / 2)), this.paint(p), op);
  }
  // Directional bevel: lightens edges facing the light and darkens the others.
  bevel(s, width, strength = 0.5, light = [-0.45, -0.89], hi = '#ffffff', lo = '#000000', clip = null) {
    const { cv } = this, sd = s.sdf(), cov = clip || s.cov(), bw = Math.max(1, width * this.k);
    const H = new Float32Array(cv.w * cv.h), L = new Float32Array(cv.w * cv.h);
    for (let y = 1; y < cv.h - 1; y++) {
      for (let x = 1; x < cv.w - 1; x++) {
        const i = y * cv.w + x, d = -sd[i];
        if (cov[i] <= 0 || d > bw) continue;
        const gx = sd[i + 1] - sd[i - 1], gy = sd[i + cv.w] - sd[i - cv.w], gl = Math.hypot(gx, gy);
        if (gl < 1e-4 || gl > 50) continue;
        const sh = (gx * light[0] + gy * light[1]) / gl, f = (1 - clamp01(d / bw)) ** 1.3 * cov[i] * strength;
        if (sh > 0) H[i] = sh * f; else L[i] = -sh * f;
      }
    }
    cv.draw(H, solid(hi)); cv.draw(L, solid(lo));
  }
}

// ================================================================ PNG / ICO / ICNS writers
function crc32(buf) {
  let t = crc32.t;
  if (!t) { t = crc32.t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const stride = w * 4, raw = Buffer.alloc((stride + 1) * h), prev = Buffer.alloc(stride), cand = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const row = rgba.subarray(y * stride, (y + 1) * stride), up = y ? rgba.subarray((y - 1) * stride, y * stride) : prev;
    let best = null, bestSum = Infinity, bestF = 0;
    for (let f = 0; f < 5; f++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? row[x - 4] : 0, b = up[x], c = x >= 4 ? up[x - 4] : 0;
        let p;
        if (f === 0) p = 0; else if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
        else { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        const v = (row[x] - p) & 0xff;
        cand[x] = v; sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; bestF = f; best = Buffer.from(cand); }
    }
    raw[y * (stride + 1)] = bestF;
    best.copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = ihdr[11] = ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const pngOf = cv => encodePng(cv.w, cv.h, cv.toRGBA());
function encodeIco(entries /* [{size, png}] */) {
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
  let off = head.length;
  entries.forEach((e, i) => {
    const o = 6 + 16 * i;
    head[o] = e.size >= 256 ? 0 : e.size; head[o + 1] = e.size >= 256 ? 0 : e.size;
    head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(e.png.length, o + 8); head.writeUInt32LE(off, o + 12);
    off += e.png.length;
  });
  return Buffer.concat([head, ...entries.map(e => e.png)]);
}
function encodeIcns(entries /* [{type, png}] */) {
  const parts = entries.map(e => { const h = Buffer.alloc(8); h.write(e.type, 0, 'ascii'); h.writeUInt32BE(e.png.length + 8, 4); return Buffer.concat([h, e.png]); });
  const head = Buffer.alloc(8); head.write('icns', 0, 'ascii');
  head.writeUInt32BE(8 + parts.reduce((s, p) => s + p.length, 0), 4);
  return Buffer.concat([head, ...parts]);
}

// ================================================================ the design
// Ten tribes around the ring, clockwise from the top. Colours are our own picks from
// each tribe's general theme (sky/fire, mud, desert, hive, forest, rainforest, ice, sea,
// night, silk); `hi`/`lo` are the outer/inner shades of the ring segment.
const TRIBES = [
  { name: 'SkyWing', hi: '#ff7a45', lo: '#b61f19' },
  { name: 'MudWing', hi: '#b98352', lo: '#5e3519' },
  { name: 'SandWing', hi: '#f8e3a0', lo: '#c4933a' },
  { name: 'HiveWing', hi: '#ffd84a', lo: '#d07a00', stripes: true },
  { name: 'LeafWing', hi: '#8be062', lo: '#246b2a' },
  { name: 'RainWing', rainbow: true },
  { name: 'IceWing', hi: '#ffffff', lo: '#8fc8e8' },
  { name: 'SeaWing', hi: '#5cc0ff', lo: '#123f99' },
  { name: 'NightWing', hi: '#5b4aa6', lo: '#160f30', stars: true },
  { name: 'SilkWing', iridescent: true },
];

const FIRE = [[0, '#fff6c2'], [0.28, '#ffd04a'], [0.55, '#ff8a1f'], [0.8, '#e2401c'], [1, '#9e1420']];
const OUTLINE = '#160a12';

// ---------------------------------------------------------------- emblem (256 x 256 units)
const EC = 128; // emblem centre
const RING_OUT = 123, RING_IN = 103;

function leftWing() {
  const W = [68, 70]; // wrist: every finger bone starts here
  const T = [62, 34], F1 = [32, 66], F2 = [27, 108], F3 = [46, 148], R2 = [114, 166], R1 = [121, 116];
  const scallop = (a, b, f) => { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; return [m[0] + (W[0] - m[0]) * f, m[1] + (W[1] - m[1]) * f]; };
  const membrane = P().M(...R1).Q(98, 76, ...W).L(...T);
  const s1 = scallop(T, F1, 0.38), s2 = scallop(F1, F2, 0.36), s3 = scallop(F2, F3, 0.36), s4 = scallop(F3, R2, 0.3);
  membrane.Q(...s1, ...F1).Q(...s2, ...F2).Q(...s3, ...F3).Q(...s4, ...R2).L(124, 150);
  const bones = [
    ribbon(quadPts(R1, [98, 76], W), [5.5, 5, 4.6, 4.3, 4, 3.8, 3.6, 3.5, 3.4, 3.3, 3.2, 3.1, 3]),
    ribbon([W, T], [3, 1]),
    ribbon([W, F1], [2.8, 0.9]),
    ribbon([W, F2], [2.8, 0.9]),
    ribbon([W, F3], [2.8, 0.9]),
  ].flat();
  const claw = [[[W[0] - 3, W[1] - 1], [W[0] - 1, W[1] - 13], [W[0] + 3, W[1] - 2]]];
  return { membrane: membrane.cs, bones, claw, W };
}

function headShapes() {
  const R = [[128, 76], [140, 77], [151, 87], [157, 101], [171, 104], [160, 112], [158, 123], [151, 139], [146, 155], [138, 164], [128, 167]];
  const head = [R.concat(R.slice(1, -1).reverse().map(([x, y]) => [256 - x, y]))];
  const hornR = P().M(139, 82).Q(156, 58, 173, 36).Q(163, 64, 153, 91).cs;
  const hornR2 = P().M(155, 97).Q(170, 84, 187, 79).Q(175, 94, 160, 108).cs;
  const horns = [...hornR, ...hornR2, ...mirrorX(hornR, EC), ...mirrorX(hornR2, EC)];
  const eyeR = [[[134, 107], [151, 99], [153, 104], [140, 113]]];
  const eyes = [...eyeR, ...mirrorX(eyeR, EC)];
  const nosR = [[[133, 156], [139, 149], [141, 151], [135, 158]]];
  const nostrils = [...nosR, ...mirrorX(nosR, EC)];
  // a ridge down the snout and brow plates, drawn as darker facets
  const ridge = [[[128, 84], [133, 96], [131, 140], [128, 150], [125, 140], [123, 96]]];
  // neck and chest rising out of the flames
  const neckR = [[128, 140], [144, 146], [152, 178], [166, 212], [176, 250]];
  const neck = [neckR.concat(neckR.slice().reverse().map(([x, y]) => [256 - x, y]))];
  const chestR = [[[128, 176], [140, 182], [146, 204], [128, 214]], [[128, 216], [146, 210], [152, 232], [128, 242]]];
  const chest = [...chestR, ...mirrorX(chestR, EC)];
  return { head, horns, eyes, nostrils, ridge, neck, chest };
}

// One flame tongue: base centre (cx, base), height h, half-width w, tip leaning by `lean`.
function tongue(cx, base, h, w, lean = 0) {
  const tip = [cx + lean, base - h];
  // S-curved sides so each tongue flickers instead of looking like a spike
  return P().M(cx - w, base)
    .C(cx - w * 1.1, base - h * 0.35, cx - w * 0.1 - lean * 0.6, base - h * 0.55, cx - w * 0.15 + lean * 0.4, base - h * 0.75)
    .C(cx - w * 0.2 + lean * 0.8, base - h * 0.88, cx + lean * 0.7, base - h * 0.93, ...tip)
    .C(cx + w * 0.35 + lean * 0.5, base - h * 0.8, cx + w * 0.55 - lean * 0.2, base - h * 0.62, cx + w * 0.7, base - h * 0.48)
    .C(cx + w * 1.0, base - h * 0.3, cx + w * 1.05, base - h * 0.15, cx + w, base).cs;
}
function flames(scale = 1) {
  const outer = [], inner = [];
  // [cx, height, half-width, lean]
  for (const [x, h, w, l] of [[40, 52, 26, -8], [70, 78, 24, -6], [98, 70, 20, 4], [128, 64, 26, 0], [158, 70, 20, -4], [186, 78, 24, 6], [216, 52, 26, 8]]) {
    outer.push(...tongue(x, 252, h * scale, w, l));
  }
  for (const [x, h, w, l] of [[58, 38, 18, -4], [92, 44, 16, 3], [128, 34, 20, 0], [164, 44, 16, -3], [198, 38, 18, 4]]) {
    inner.push(...tongue(x, 252, h * scale, w, l));
  }
  return { outer, inner };
}

function drawEmblem(cv, k, ox, oy, opt = {}) {
  const v = new View(cv, k, ox, oy);
  const px = k; // pixels per unit
  const small = 256 * k <= 40;
  const disc = v.shape([circle(EC, EC, 127.5, 160)], { margin: 2 });

  // backing disc + rim
  v.fill(disc, radial(EC, EC, 128, [[0.79, '#1d1230'], [0.8, OUTLINE], [1, OUTLINE]]));

  // ring of tribes
  const gap = (small ? 4.5 : 2.6) * Math.PI / 180, seg = (Math.PI * 2) / TRIBES.length;
  TRIBES.forEach((t, i) => {
    const a0 = -Math.PI / 2 - seg / 2 + i * seg + gap / 2, a1 = a0 + seg - gap;
    const s = v.shape([sector(EC, EC, RING_IN, RING_OUT, a0, a1, 28)], { margin: 2 });
    let paint;
    if (t.rainbow) {
      paint = (x, y) => {
        let a = Math.atan2(y - EC, x - EC); while (a < a0) a += Math.PI * 2;
        const f = (a - a0) / (a1 - a0), r = (Math.hypot(x - EC, y - EC) - RING_IN) / (RING_OUT - RING_IN);
        return hsl(f * 300 - 10, 0.9, 0.42 + 0.18 * r);
      };
    } else if (t.iridescent) {
      const g = ramp([[0, '#d9b8ff'], [0.5, '#9fe8f0'], [1, '#f6b8e4']]);
      paint = (x, y) => {
        let a = Math.atan2(y - EC, x - EC); while (a < a0) a += Math.PI * 2;
        const r = (Math.hypot(x - EC, y - EC) - RING_IN) / (RING_OUT - RING_IN);
        return mix(g((a - a0) / (a1 - a0)), hex('#7d5fc4'), 0.45 * (1 - r));
      };
    } else {
      paint = radial(EC, EC, RING_OUT, [[RING_IN / RING_OUT, t.lo], [1, t.hi]]);
    }
    v.fill(s, paint);
    if (t.stripes && !small) {
      for (const f of [0.3, 0.7]) {
        const a = lerp(a0, a1, f);
        v.fill(v.shape([sector(EC, EC, RING_IN, RING_OUT, a - 0.035, a + 0.035, 4)], { margin: 1 }), '#2a1606');
      }
    }
    if (t.stars && !small) {
      for (const [f, rr, sz] of [[0.25, 0.62, 1.6], [0.55, 0.35, 1.2], [0.78, 0.7, 1.4]]) {
        const a = lerp(a0, a1, f), r = lerp(RING_IN, RING_OUT, rr);
        v.fill(v.shape([circle(EC + Math.cos(a) * r, EC + Math.sin(a) * r, sz, 12)], { margin: 1 }), '#f4f0ff');
      }
    }
    if (!small) v.bevel(s, 5, 0.35);
  });

  // night sky inside the ring
  const sky = v.shape([circle(EC, EC, RING_IN - 2.5, 140)], { margin: 2 });
  v.fill(sky, radial(EC, 96, 112, [[0, '#3b2364'], [0.55, '#1c1236'], [1, '#0a0614']]));
  if (!small) {
    for (const [x, y, s] of [[96, 44, 3.2], [168, 52, 2.4], [208, 112, 2.2], [52, 150, 2], [186, 190, 2.6], [72, 196, 2.2], [128, 34, 2.4]]) {
      const star = P().M(x, y - s * 2).L(x + s * 0.5, y - s * 0.5).L(x + s * 2, y).L(x + s * 0.5, y + s * 0.5).L(x, y + s * 2).L(x - s * 0.5, y + s * 0.5).L(x - s * 2, y).L(x - s * 0.5, y - s * 0.5).cs;
      v.fill(v.shape(star, { margin: 1 }), '#fff4d6', 0.9);
    }
  }

  const skyCov = sky.cov();
  const hs0 = headShapes();
  const hs = small ? Object.fromEntries(Object.entries(hs0).map(([n, cs]) => [n, scaleAbout(cs, EC, 112, 1.22)])) : hs0;
  if (small) {
    // Tiny icons: a fire-filled disc behind a bold head silhouette reads better than detail.
    v.fill(sky, radial(EC, 150, 120, [[0, '#ffe58a'], [0.35, '#ffad2e'], [0.7, '#f0561c'], [1, '#a8161c']]));
  }

  // wings of fire
  const wl = leftWing();
  const both = cs => [...cs, ...mirrorX(cs, EC)];
  const mem = v.shape(positive(both(wl.membrane)), { margin: 6 });
  const bones = v.shape(positive(both([...wl.bones, ...wl.claw])), { margin: 3 });
  if (small) {
    v.fill(mem, '#6e0f16');
  } else {
    v.cv.draw(mulCov(blur(mem.grow(3 * px), cv.w, cv.h, 5 * px), skyCov), v.paint('#ff6a1a'), 0.55);
    v.outline(mem, 2.6, OUTLINE, 1);
    v.fill(mem, (x, y) => ramp(FIRE)(Math.hypot(x - EC, y - 150) / 112));
    v.bevel(mem, 7, 0.28, [-0.45, -0.89], '#fff7d0', '#5a0a10');
    v.outline(bones, 0.9, '#5a0d12', 0.9);
    v.fill(bones, linear(0, 30, 0, 170, [[0, '#ffe7a0'], [0.5, '#f08a2a'], [1, '#b8301a']]));

    // neck rising from a bed of flames
    const neck = v.shape(positive(hs.neck), { margin: 4 });
    const neckCov = mulCov(neck.cov(), skyCov);
    v.cv.draw(mulCov(neck.grow(3.2 * px), skyCov), v.paint(OUTLINE));
    v.cv.draw(mulCov(neck.grow(1.6 * px), skyCov), v.paint('#e9a944'));
    v.cv.draw(neckCov, v.paint(linear(0, 140, 0, 250, [[0, '#2a1726'], [1, '#12080f']])));
    v.cv.draw(mulCov(v.shape(positive(hs.chest), { margin: 2 }).cov(), skyCov), v.paint(linear(0, 176, 0, 242, [[0, '#5a3446'], [1, '#2a1520']])), 0.9);
    const fl = flames();
    const fo = v.shape(positive(fl.outer), { margin: 6 }), fi = v.shape(positive(fl.inner), { margin: 2 });
    v.cv.draw(mulCov(blur(fo.cov(), cv.w, cv.h, 6 * px), skyCov), v.paint('#ff7a1a'), 0.7);
    v.cv.draw(mulCov(fo.grow(1.2 * px), skyCov), v.paint('#8e1420'));
    v.cv.draw(mulCov(fo.cov(), skyCov), v.paint(linear(0, 170, 0, 252, [[0, '#e8341c'], [0.45, '#ff7a1f'], [1, '#ffc23a']])));
    v.cv.draw(mulCov(fi.cov(), skyCov), v.paint(linear(0, 200, 0, 252, [[0, '#ffb52e'], [0.5, '#ffe27a'], [1, '#fff8d8']])));
  }

  // dragon head
  const head = v.shape(positive(hs.head), { margin: 6 });
  const horns = v.shape(positive(hs.horns), { margin: 6 });
  const headAll = v.shape(positive([...hs.head, ...hs.horns]), { margin: 6 });
  v.glow(headAll, 8, '#000000', 0.45, 2);
  v.outline(headAll, 3.4, OUTLINE, 1, small ? 0.8 : 1);
  v.outline(headAll, 1.7, '#f2b84b', 1, small ? 0.5 : 0.8);
  v.fill(horns, linear(0, 36, 0, 100, [[0, '#f7e2b0'], [1, '#9a7a52']]));
  v.fill(head, linear(0, 76, 0, 167, [[0, '#4a2a3e'], [0.5, '#2a1726'], [1, '#170b14']]));
  if (!small) {
    v.bevel(head, 6, 0.35, [-0.45, -0.89], '#ffcf8a', '#000000');
    v.bevel(horns, 4, 0.4);
    v.fill(v.shape(hs.ridge, { margin: 1 }), '#120810', 0.55);
    v.fill(v.shape(hs.nostrils, { margin: 1 }), '#ff9a3a', 0.9);
  }
  const eyes = v.shape(hs.eyes, { margin: 6 });
  v.glow(eyes, 6, '#ffb020', 0.9, 1.5);
  v.fill(eyes, linear(0, 99, 0, 113, [[0, '#fffbe0'], [1, '#ffc23a']]));
  return v;
}

// ---------------------------------------------------------------- lettering
// Custom faceted capitals, cap height 100 units, baseline at y = 100.
const HW = 10;
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const st = (pts, closed) => strokeParts(pts, HW, closed);
const GLYPHS = {
  A: { w: 88, p: () => [[[32, 0], [52, 0], [22, 100], [0, 100]], [[36, 0], [56, 0], [88, 100], [66, 100]], rect(18, 62, 70, 79)] },
  E: { w: 60, p: () => [rect(0, 0, 60, 20), rect(0, 0, 20, 100), rect(0, 80, 60, 100), rect(0, 41, 52, 59)] },
  F: { w: 60, p: () => [rect(0, 0, 60, 20), rect(0, 0, 20, 100), rect(0, 43, 50, 61)] },
  G: { w: 78, p: () => st([[78, 10], [28, 10], [10, 28], [10, 72], [28, 90], [50, 90], [68, 72], [68, 52], [42, 52]]) },
  I: { w: 20, p: () => [rect(0, 0, 20, 100)] },
  N: { w: 78, p: () => [rect(0, 0, 20, 100), rect(58, 0, 78, 100), [[0, 0], [22, 0], [78, 100], [56, 100]]] },
  O: { w: 80, p: () => st([[28, 10], [52, 10], [70, 28], [70, 72], [52, 90], [28, 90], [10, 72], [10, 28]], true) },
  R: { w: 76, p: () => [...st([[10, 100], [10, 10], [50, 10], [66, 26], [66, 36], [52, 50], [10, 50]]), [[30, 50], [52, 50], [76, 100], [54, 100]]] },
  S: { w: 70, p: () => st([[60, 32], [60, 10], [26, 10], [10, 26], [10, 36], [24, 50], [46, 50], [60, 64], [60, 74], [44, 90], [10, 90], [10, 68]]) },
  T: { w: 72, p: () => [rect(0, 0, 72, 20), rect(26, 0, 46, 100)] },
  W: { w: 120, p: () => [[[0, 0], [24, 0], [38, 64], [52, 20], [68, 20], [82, 64], [96, 0], [120, 0], [98, 100], [76, 100], [60, 44], [44, 100], [22, 100]]] },
};
// Lay out a string; returns contours in text units and the total width.
function layout(str, { tracking = 8, space = 36 } = {}) {
  let x = 0;
  const cs = [];
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === ' ') { x += space - tracking; continue; }
    const g = GLYPHS[ch];
    if (!g) throw new Error(`no glyph for '${ch}'`);
    cs.push(...translate(positive(g.p()), x, 0));
    x += g.w + tracking;
  }
  return { cs, w: x - tracking };
}

const TEXT_FIRE = [[0, '#fff8d2'], [0.3, '#ffd552'], [0.62, '#ff8a22'], [1, '#c4231c']];
function drawTitle(cv, str, cx, top, capPx, opt = {}) {
  const t = layout(str, opt);
  const k = capPx / 100, v = new View(cv, k, Math.round(cx - (t.w * k) / 2), top);
  const s = v.shape(t.cs, { margin: 12 });
  v.glow(s, 16, '#ff5a14', 0.55, 2);
  v.outline(s, 6, OUTLINE);
  v.outline(s, 2.6, '#7a1a10');
  v.fill(s, linear(0, 0, 0, 100, TEXT_FIRE));
  v.bevel(s, 7, 0.55, [-0.45, -0.89], '#fffbe8', '#4a0808');
  return { v, w: t.w * k };
}
function drawSub(cv, str, cx, top, capPx, opt = {}) {
  const t = layout(str, opt);
  const k = capPx / 100, v = new View(cv, k, Math.round(cx - (t.w * k) / 2), top);
  const s = v.shape(t.cs, { margin: 12 });
  v.outline(s, 8, OUTLINE);
  v.fill(s, linear(0, 0, 0, 100, [[0, '#ffffff'], [0.45, '#d5dbe8'], [0.55, '#9aa5bd'], [1, '#c8d0e0']]));
  v.bevel(s, 8, 0.5);
  return { v, w: t.w * k };
}
// Ten tribe gems (diamonds) in a row; split = gap in the middle for a word.
function drawGems(cv, cx, cy, size, spacing, split) {
  const v = new View(cv, 1, 0, 0);
  const xs = [];
  for (let i = 0; i < 5; i++) { xs.push(cx - split / 2 - i * spacing - size / 2); xs.push(cx + split / 2 + i * spacing + size / 2); }
  // left side: Pyrrhia-ish order outward; just keep ring order left-to-right
  const order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const pos = xs.slice().sort((a, b) => a - b);
  order.forEach((ti, i) => {
    const t = TRIBES[ti], x = pos[i], hw = size / 2, hh = size * 0.68;
    const gem = v.shape([[[x, cy - hh], [x + hw, cy], [x, cy + hh], [x - hw, cy]]], { margin: 4 });
    v.outline(gem, Math.max(1.5, size * 0.16), OUTLINE);
    let p;
    if (t.rainbow) p = (px, py) => hsl(((px - (x - hw)) / size) * 300 - 10, 0.9, 0.5);
    else if (t.iridescent) p = linear(x - hw, 0, x + hw, 0, [[0, '#d9b8ff'], [0.5, '#9fe8f0'], [1, '#f6b8e4']]);
    else p = linear(0, cy - hh, 0, cy + hh, [[0, t.hi], [1, t.lo]]);
    v.fill(gem, p);
    v.bevel(gem, size * 0.3, 0.5);
  });
  // thin rules from the gems outward
  return v;
}

// Big spread wings behind the emblem on the splash, like a winged insignia.
// Left wing in splash pixels; the right one is mirrored about the centre line.
function bigWing(cx) {
  const S = [cx - 70, 150], W = [cx - 236, 40], T = [cx - 492, 64];
  const F1 = [cx - 470, 150], F2 = [cx - 392, 206], F3 = [cx - 278, 232], R2 = [cx - 80, 222];
  const scallop = (a, b, f) => { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; return [m[0] + (W[0] - m[0]) * f, m[1] + (W[1] - m[1]) * f]; };
  const lead = [cx - 150, 34];
  const mem = P().M(...S).Q(...lead, ...W).Q(cx - 360, 18, ...T)
    .Q(...scallop(T, F1, 0.32), ...F1).Q(...scallop(F1, F2, 0.3), ...F2).Q(...scallop(F2, F3, 0.28), ...F3).Q(...scallop(F3, R2, 0.22), ...R2).cs;
  const tipC = [cx - 360, 18];
  const bones = [
    ribbon(quadPts(S, lead, W), [9, 8.5, 8, 7.6, 7.2, 6.9, 6.6, 6.4, 6.2, 6, 5.8, 5.6, 5.4]),
    ribbon(quadPts(W, tipC, T), [5.4, 5, 4.6, 4.2, 3.8, 3.4, 3.1, 2.8, 2.5, 2.2, 1.9, 1.6, 1.4]),
    ribbon([W, F1], [4.4, 1.4]), ribbon([W, F2], [4.4, 1.4]), ribbon([W, F3], [4.4, 1.4]),
  ].flat();
  const claw = [[[W[0] - 5, W[1] + 2], [W[0] - 2, W[1] - 22], [W[0] + 5, W[1] + 1]]];
  const bonePaths = [quadPts(S, lead, W), quadPts(W, tipC, T), [W, F1], [W, F2], [W, F3]];
  return { mem, bones: [...bones, ...claw], bonePaths };
}
function distToPaths(x, y, paths) {
  let best = Infinity;
  for (const p of paths) {
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, ay] = p[i], [bx, by] = p[i + 1], dx = bx - ax, dy = by - ay;
      const t = clamp01(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy));
      best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
  }
  return best;
}
function drawBigWings(cv, cx) {
  const v = new View(cv, 1, 0, 0);
  const l = bigWing(cx);
  const mem = v.shape(positive([...l.mem, ...mirrorX(l.mem, cx)]), { margin: 10 });
  const bones = v.shape(positive([...l.bones, ...mirrorX(l.bones, cx)]), { margin: 4 });
  v.glow(mem, 18, '#ff5a14', 0.45, 2);
  v.outline(mem, 4, OUTLINE);
  // membrane: bright where it meets the arm and wrist, burning down to deep red at the
  // scalloped trailing edge
  const memRamp = ramp([[0, '#ffd45a'], [0.18, '#ff9a26'], [0.42, '#e8501c'], [0.7, '#b32018'], [1, '#6a0b1a']]);
  const wx = cx - 236, wy = 40;
  v.fill(mem, (x, y) => {
    const lx = cx - Math.abs(x - cx);
    const dWrist = Math.hypot(lx - wx, (y - wy) * 1.15) / 340;
    const dBone = Math.min(1, distToPaths(lx, y, l.bonePaths) / 70);
    return memRamp(Math.min(1, 0.45 * dWrist + 0.75 * dBone));
  });
  v.fill(mem.inner(3), '#3a0610', 0.4);
  v.bevel(mem, 12, 0.3, [-0.45, -0.89], '#fff7d0', '#5a0a10');
  v.outline(bones, 1.6, '#5a0d12', 0.9);
  v.fill(bones, linear(0, 20, 0, 240, [[0, '#ffe7a0'], [0.5, '#f08a2a'], [1, '#b8301a']]));
}

// ---------------------------------------------------------------- compositions
function renderIcon(size) {
  const cv = new Canvas(size, size);
  drawEmblem(cv, size / 256, 0, 0);
  return cv;
}
function renderSplash() {
  const cv = new Canvas(1073, 446);
  const D = 236;
  drawBigWings(cv, 536.5);
  drawEmblem(cv, D / 256, Math.round(536.5 - D / 2), 4);
  drawTitle(cv, 'WINGS OF FIRE', 536.5, 252, 92);
  drawSub(cv, 'STATION', 536.5, 372, 36, { tracking: 26 });
  drawGems(cv, 536.5, 390, 16, 30, 290);
  return cv;
}
function renderMenuLogo() {
  const cv = new Canvas(256, 256);
  const D = 182;
  drawEmblem(cv, D / 256, Math.round(128 - D / 2), 0);
  drawTitle(cv, 'WINGS OF FIRE', 128, 190, 25);
  drawSub(cv, 'STATION', 128, 226, 13, { tracking: 26 });
  drawGems(cv, 128, 232.5, 7, 9.5, 112);
  return cv;
}

// ---------------------------------------------------------------- preview sheet
function bg(w, h, c) { const cv = new Canvas(w, h, 1); const v = hex(c); for (let i = 0; i < w * h; i++) cv.px.set(v, i * 4); return cv; }
function zoom(src, f) {
  const cv = new Canvas(src.w * f, src.h * f, 1);
  for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) {
    const s = (Math.floor(y / f) * src.w + Math.floor(x / f)) * 4, d = (y * cv.w + x) * 4;
    for (let k = 0; k < 4; k++) cv.px[d + k] = src.px[s + k];
  }
  return cv;
}
function previewSheet(splash, menu, icons) {
  const W = 1073 + 256 + 60, rowIcons = 300;
  const H = (446 + 20 + rowIcons) * 2 + 40;
  const sheet = new Canvas(W, H, 1);
  [['#0d0a12', 0], ['#f3efe6', 1]].forEach(([c, i]) => {
    const y0 = i * (446 + 20 + rowIcons + 20);
    sheet.blit(bg(W, 446 + 20 + rowIcons + 20, c), 0, y0);
    sheet.blit(splash, 20, y0 + 10);
    sheet.blit(menu, 1073 + 40, y0 + 10 + 95);
    let x = 20;
    const iy = y0 + 446 + 30;
    for (const ic of icons) { sheet.blit(ic, x, iy + 256 - ic.h); x += ic.w + 16; }
    for (const [sz, f] of [[16, 8], [32, 4]]) {
      const z = zoom(icons.find(ic => ic.w === sz), f);
      sheet.blit(z, x, iy + 256 - z.h); x += z.w + 16;
    }
  });
  return sheet;
}

// ---------------------------------------------------------------- main
function main() {
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const outDir = path.resolve(opt('--out') || LOGO_DIR);
  const preview = opt('--preview');
  fs.mkdirSync(path.join(outDir, 'icon'), { recursive: true });

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const icons = sizes.map(renderIcon);
  const pngs = {};
  icons.forEach((cv, i) => { pngs[sizes[i]] = pngOf(cv); fs.writeFileSync(path.join(outDir, 'icon', `icon-${sizes[i]}x${sizes[i]}.png`), pngs[sizes[i]]); });
  for (const s of [512, 1024]) pngs[s] = pngOf(renderIcon(s));

  fs.writeFileSync(path.join(outDir, 'icon.ico'), encodeIco(sizes.map(s => ({ size: s, png: pngs[s] }))));
  fs.writeFileSync(path.join(outDir, 'logo.icns'), encodeIcns([
    ['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024],
    ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512],
  ].map(([type, s]) => ({ type, png: pngs[s] }))));

  const menu = renderMenuLogo();
  fs.writeFileSync(path.join(outDir, 'logo.png'), pngOf(menu));
  const splash = renderSplash();
  fs.writeFileSync(path.join(outDir, 'splashlogo.png'), pngOf(splash));

  if (preview) fs.writeFileSync(path.resolve(preview), pngOf(previewSheet(splash, menu, icons)));
  console.log(`wrote logo files to ${path.relative(ROOT, outDir) || outDir}`);
}

if (require.main === module) main();
module.exports = { renderIcon, renderSplash, renderMenuLogo, layout, GLYPHS, TRIBES };
