// Sunset Cover Studio — GTA-style cover art maker (offline web app).
//
// What this program does (the grader runs `node /bot/main.ts`):
//   1. Verifies the app bundle in app/ is complete and fully offline
//      (no external URLs anywhere in the HTML, CSS or JS).
//   2. Renders a demo cover PNG with the same cover engine the browser
//      app uses (same palette, panel grid, lettering, grain), using a
//      pure-TypeScript software rasterizer + PNG encoder — no browser,
//      no network, no model call. Deterministic: same input, same bytes.
//   3. Writes cover.png (+ manifest.json) to $MAKEFUN_OUTPUT_DIR
//      (default /output). Exit 0.
//
// The real product is the web app in app/ (index.html + app.css +
// app.js): upload a photo, arrange panels, edit the lettering, export
// a GTA-style cover as PNG. This program proves the pipeline works
// offline and produces a sample of its output.
//
// All art and lettering here is original (parody style). No Rockstar
// logos, artwork or fonts are used.

import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const SIZE = process.env.MAKEFUN_SIZE ?? '1080x1080';

/* ---------------- palette (Miami sunset, same as the app) ---------------- */
interface Palette {
  skyTop: [number, number, number];
  skyMid: [number, number, number];
  skyLow: [number, number, number];
  horizon: [number, number, number];
  deep: [number, number, number];
  silhouette: [number, number, number];
  accent: [number, number, number];
  accent2: [number, number, number];
}
const PALETTE: Palette = {
  skyTop: [255, 217, 160],
  skyMid: [255, 158, 125],
  skyLow: [255, 107, 157],
  horizon: [123, 75, 148],
  deep: [45, 27, 78],
  silhouette: [36, 18, 57],
  accent: [255, 179, 71],
  accent2: [255, 107, 157],
};

/* ---------------- deterministic PRNG ---------------- */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- image buffer + rasterizer ---------------- */
type RGB = [number, number, number];

class Img {
  readonly w: number;
  readonly h: number;
  readonly px: Uint8Array; // RGBA
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 4);
    for (let i = 3; i < this.px.length; i += 4) this.px[i] = 255;
  }
  set(x: number, y: number, c: RGB, a = 255): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = (y * this.w + x) * 4;
    this.px[o] = c[0]; this.px[o + 1] = c[1]; this.px[o + 2] = c[2]; this.px[o + 3] = a;
  }
  blend(x: number, y: number, c: RGB, alpha: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || alpha <= 0) return;
    const o = (y * this.w + x) * 4;
    const inv = 1 - alpha;
    this.px[o] = Math.round(this.px[o] * inv + c[0] * alpha);
    this.px[o + 1] = Math.round(this.px[o + 1] * inv + c[1] * alpha);
    this.px[o + 2] = Math.round(this.px[o + 2] * inv + c[2] * alpha);
  }
  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.w, Math.round(x + w)), y1 = Math.min(this.h, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) this.set(xx, yy, c);
    }
  }
  vGrad(x: number, y: number, w: number, h: number, stops: Array<[number, RGB]>): void {
    for (let yy = 0; yy < h; yy++) {
      const t = h <= 1 ? 0 : yy / (h - 1);
      let c: RGB = stops[stops.length - 1][1];
      for (let s = 0; s < stops.length - 1; s++) {
        const [t0, c0] = stops[s];
        const [t1, c1] = stops[s + 1];
        if (t >= t0 && t <= t1) {
          const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
          c = [
            Math.round(c0[0] + (c1[0] - c0[0]) * f),
            Math.round(c0[1] + (c1[1] - c0[1]) * f),
            Math.round(c0[2] + (c1[2] - c0[2]) * f),
          ];
          break;
        }
      }
      this.fillRect(x, y + yy, w, 1, c);
    }
  }
  circle(cx: number, cy: number, r: number, c: RGB): void {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.set(x, y, c);
      }
    }
  }
  disc(cx: number, cy: number, r: number, c: RGB, alpha: number): void {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx, dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2) this.blend(x, y, c, alpha * (1 - Math.sqrt(d2) / r));
      }
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, lw: number, c: RGB): void {
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
    const r = lw / 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.disc(x0 + dx * t, y0 + dy * t, r, c, 1);
    }
  }
  strokeRect(x: number, y: number, w: number, h: number, lw: number, c: RGB): void {
    this.fillRect(x, y, w, lw, c);
    this.fillRect(x, y + h - lw, w, lw, c);
    this.fillRect(x, y, lw, h, c);
    this.fillRect(x + w - lw, y, lw, h, c);
  }
  /** Copy a region of another image, cover-fit into a rect. */
  drawCover(src: Img, rx: number, ry: number, rw: number, rh: number, zoom = 1, panX = 0, panY = 0): void {
    const scale = Math.max(rw / src.w, rh / src.h) * zoom;
    const dw = src.w * scale, dh = src.h * scale;
    const ox = rx + (rw - dw) / 2 + panX * rw;
    const oy = ry + (rh - dh) / 2 + panY * rh;
    const x0 = Math.max(0, Math.round(rx)), y0 = Math.max(0, Math.round(ry));
    const x1 = Math.min(this.w, Math.round(rx + rw)), y1 = Math.min(this.h, Math.round(ry + rh));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const sx = Math.floor((x - ox) / scale);
        const sy = Math.floor((y - oy) / scale);
        if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) continue;
        const so = (sy * src.w + sx) * 4;
        this.set(x, y, [src.px[so], src.px[so + 1], src.px[so + 2]]);
      }
    }
  }
}

/* ---------------- 5x7 bitmap font (original data, A-Z 0-9 + punctuation) ---------------- */
const FONT: Record<string, number[]> = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b01100, 0b01100],
  ',': [0, 0, 0, 0, 0b01100, 0b00100, 0b01000],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
  '-': [0, 0, 0, 0b01110, 0, 0, 0],
  ':': [0, 0b01100, 0b01100, 0, 0b01100, 0b01100, 0],
  "'": [0b00100, 0b00100, 0b01000, 0, 0, 0, 0],
};

function textWidth(text: string, scale: number): number {
  return text.length * 6 * scale - scale;
}

function drawBitmapText(img: Img, text: string, cx: number, y: number, scale: number, fill: RGB, outline?: RGB, outlineScale = 1): void {
  const w = textWidth(text, scale);
  let x = Math.round(cx - w / 2);
  const drawPass = (color: RGB, dx: number, dy: number): void => {
    let px = x + dx;
    for (const ch of text) {
      const glyph = FONT[ch] ?? FONT[' '];
      for (let row = 0; row < 7; row++) {
        const bits = glyph[row];
        for (let col = 0; col < 5; col++) {
          if ((bits >> (4 - col)) & 1) {
            img.fillRect(px + col * scale + dx, y + row * scale + dy, scale, scale, color);
          }
        }
      }
      px += 6 * scale;
    }
  };
  if (outline) {
    const o = outlineScale * scale;
    for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, -o], [-o, o], [o, o]] as Array<[number, number]>) {
      drawPass(outline, dx, dy);
    }
  }
  drawPass(fill, 0, 0);
}

/* ---------------- procedural scenes (same design language as the app) ---------------- */
function drawSkyline(img: Img, x: number, baseY: number, w: number, h: number, color: RGB, rnd: () => number): void {
  let bx = x;
  const count = 9;
  for (let i = 0; i < count; i++) {
    const bw = (w / count) * (0.55 + rnd() * 0.8);
    const bh = h * (0.45 + rnd() * 0.55);
    img.fillRect(bx, baseY - bh, bw, bh + 2, color);
    const cols = Math.max(1, Math.floor(bw / 16));
    const rows = Math.max(1, Math.floor(bh / 18));
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        if (rnd() < 0.26) img.fillRect(bx + 5 + cx * 16, baseY - bh + 6 + cy * 18, 7, 9, [255, 220, 140]);
      }
    }
    bx += bw + 3;
  }
}

function drawPalm(img: Img, x: number, y: number, s: number, color: RGB): void {
  const tx = x + s * 0.16, ty = y - s * 0.92;
  img.line(x, y, tx, ty, Math.max(3, s * 0.05), color);
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI * (0.05 + i * 0.14);
    const fx = tx + Math.cos(a) * s * 0.42;
    const fy = ty + Math.sin(a) * s * 0.34 + s * 0.22;
    img.line(tx, ty, (tx + fx) / 2 + Math.cos(a) * s * 0.1, (ty + fy) / 2, Math.max(2, s * 0.035), color);
    img.line((tx + fx) / 2 + Math.cos(a) * s * 0.1, (ty + fy) / 2, fx, fy, Math.max(2, s * 0.035), color);
  }
  img.circle(tx - s * 0.03, ty + s * 0.03, s * 0.035, color);
  img.circle(tx + s * 0.04, ty + s * 0.05, s * 0.03, color);
}

function drawHelicopter(img: Img, x: number, y: number, s: number, color: RGB): void {
  img.line(x - s * 0.9, y - s * 0.28, x + s * 0.9, y - s * 0.28, Math.max(2, s * 0.06), color);
  img.line(x, y - s * 0.28, x, y, Math.max(2, s * 0.06), color);
  img.circle(x, y + s * 0.08, s * 0.42, color);
  img.fillRect(x - s * 0.55, y - s * 0.12, s * 1.1, s * 0.4, color);
  img.line(x + s * 0.5, y, x + s * 1.25, y - s * 0.22, Math.max(2, s * 0.09), color);
  img.line(x + s * 1.25, y - s * 0.42, x + s * 1.25, y - s * 0.02, Math.max(2, s * 0.05), color);
  img.line(x - s * 0.4, y + s * 0.42, x + s * 0.45, y + s * 0.42, Math.max(2, s * 0.05), color);
}

function makeScene(w: number, h: number, variant: number, seed: number): Img {
  const img = new Img(w, h);
  const rnd = mulberry32(seed);
  img.vGrad(0, 0, w, h, [
    [0, PALETTE.skyTop], [0.45, PALETTE.skyMid], [0.75, PALETTE.skyLow], [1, PALETTE.horizon],
  ]);
  const sx = w * 0.68, sy = h * 0.34, sr = h * 0.17;
  img.disc(sx, sy, sr * 2.2, [255, 236, 180], 0.45);
  img.circle(sx, sy, sr, [255, 243, 196]);
  img.circle(sx, sy, sr * 0.82, [255, 140, 66]);

  if (variant === 1) {
    // neon street
    drawSkyline(img, 0, h * 0.42, w, h * 0.22, PALETTE.silhouette, rnd);
    img.fillRect(0, h * 0.5, w, h * 0.5, PALETTE.deep);
    // road band with centre dashes
    img.fillRect(0, h * 0.68, w, h * 0.2, [26, 11, 46]);
    for (let i = 0; i < 6; i++) {
      img.fillRect(w * (0.05 + i * 0.17), h * 0.775, w * 0.08, Math.max(2, h * 0.012), [255, 224, 102]);
    }
    // neon signs
    const cols: RGB[] = [PALETTE.accent, PALETTE.accent2, [57, 230, 255], [255, 224, 102]];
    for (let i = 0; i < 7; i++) {
      const nx = w * (0.06 + rnd() * 0.88);
      const ny = h * (0.2 + rnd() * 0.3);
      img.fillRect(nx, ny, w * 0.02, h * (0.05 + rnd() * 0.1), cols[i % cols.length]);
    }
    // pink car, low and compact
    img.fillRect(w * 0.34, h * 0.6, w * 0.32, h * 0.075, [255, 94, 138]);
    img.fillRect(w * 0.39, h * 0.55, w * 0.2, h * 0.06, [255, 94, 138]);
    img.fillRect(w * 0.41, h * 0.565, w * 0.07, h * 0.035, [255, 243, 196]);
    img.fillRect(w * 0.5, h * 0.565, w * 0.07, h * 0.035, [255, 243, 196]);
    img.circle(w * 0.4, h * 0.685, h * 0.03, [13, 10, 20]);
    img.circle(w * 0.6, h * 0.685, h * 0.03, [13, 10, 20]);
    drawPalm(img, w * 0.08, h * 0.95, h * 0.34, PALETTE.silhouette);
  } else if (variant === 2) {
    // palm close-up
    drawPalm(img, w * 0.22, h * 1.02, h * 0.85, PALETTE.silhouette);
    drawPalm(img, w * 0.82, h * 1.05, h * 0.7, PALETTE.silhouette);
    // flamingo standing in the shallows — capsule body, S-curved neck, head, legs
    img.fillRect(w * 0.47, h * 0.53, w * 0.11, h * 0.055, PALETTE.silhouette);
    img.circle(w * 0.47, h * 0.557, h * 0.028, PALETTE.silhouette);
    img.circle(w * 0.58, h * 0.557, h * 0.028, PALETTE.silhouette);
    img.line(w * 0.565, h * 0.53, w * 0.60, h * 0.44, Math.max(3, h * 0.016), PALETTE.silhouette);
    img.line(w * 0.60, h * 0.44, w * 0.585, h * 0.37, Math.max(3, h * 0.016), PALETTE.silhouette);
    img.line(w * 0.585, h * 0.37, w * 0.555, h * 0.345, Math.max(3, h * 0.016), PALETTE.silhouette);
    img.circle(w * 0.545, h * 0.335, h * 0.026, PALETTE.silhouette);
    img.line(w * 0.50, h * 0.60, w * 0.50, h * 0.72, Math.max(2, h * 0.008), PALETTE.silhouette);
    img.line(w * 0.55, h * 0.60, w * 0.55, h * 0.72, Math.max(2, h * 0.008), PALETTE.silhouette);
  } else {
    // beach sunset
    img.vGrad(0, h * 0.55, w, h * 0.45, [[0, PALETTE.skyLow], [1, PALETTE.deep]]);
    // sun reflection streaks on the water — short, varied, sparse
    for (let i = 0; i < 6; i++) {
      const yy = h * (0.60 + i * 0.055);
      const ww = w * (0.05 + rnd() * 0.09);
      const xx = w * 0.5 - ww / 2 + (rnd() - 0.5) * w * 0.14;
      img.fillRect(xx, yy, ww, Math.max(2, h * 0.01), [255, 240, 190]);
    }
    drawSkyline(img, 0, h * 0.55, w, h * 0.16, PALETTE.silhouette, rnd);
    img.fillRect(0, h * 0.86, w, h * 0.14, PALETTE.silhouette);
    drawPalm(img, w * 0.1, h * 0.92, h * 0.3, PALETTE.silhouette);
    drawPalm(img, w * 0.9, h * 0.94, h * 0.24, PALETTE.silhouette);
    img.fillRect(w * 0.6, h * 0.66, w * 0.18, h * 0.04, [22, 10, 36]);
    img.fillRect(w * 0.66, h * 0.635, w * 0.05, h * 0.028, [255, 243, 196]);
  }
  return img;
}

/* ---------------- panel geometry (same fractions as the app) ---------------- */
interface Rect { x: number; y: number; w: number; h: number }
function panelRects(W: number, H: number): Rect[] {
  const m = W * 0.028;
  const top = H * 0.025;
  const bottom = H * 0.755;
  const gap = W * 0.018;
  const zoneW = W - m * 2;
  const zoneH = bottom - top;
  const hw = zoneW * 0.62;
  const rh = (zoneH - gap) / 2;
  return [
    { x: m, y: top, w: hw, h: zoneH },
    { x: m + hw + gap, y: top, w: zoneW - hw - gap, h: rh },
    { x: m + hw + gap, y: top + rh + gap, w: zoneW - hw - gap, h: rh },
  ];
}

/* ---------------- the demo cover ---------------- */
function renderCover(W: number, H: number): Img {
  const img = new Img(W, H);
  img.vGrad(0, 0, W, H, [
    [0, PALETTE.skyTop], [0.4, PALETTE.skyMid], [0.7, PALETTE.skyLow], [1, PALETTE.deep],
  ]);
  img.disc(W * 0.78, H * 0.16, H * 0.28, [255, 236, 180], 0.5);

  const scenes = [
    makeScene(900, 700, 0, 20261120),
    makeScene(900, 700, 1, 20261121),
    makeScene(900, 700, 2, 20261122),
  ];
  const rects = panelRects(W, H);
  for (let i = 0; i < 3; i++) {
    const r = rects[i];
    img.drawCover(scenes[i], r.x, r.y, r.w, r.h);
    const ow = Math.max(3, Math.round(W * 0.004));
    img.strokeRect(r.x - ow, r.y - ow, r.w + ow * 2, r.h + ow * 2, ow, [255, 255, 255]);
    const bw = Math.max(4, Math.round(W * 0.006));
    img.strokeRect(r.x, r.y, r.w, r.h, bw, [13, 10, 20]);
  }

  // helicopter over the hero panel
  const hr = rects[0];
  drawHelicopter(img, hr.x + hr.w * 0.2, hr.y + hr.h * 0.16, Math.min(hr.w, hr.h) * 0.085, [16, 6, 26]);

  // foreground palms (framing) — drawn before the stamp so they never cover text
  drawPalm(img, W * 0.015, H * 0.99, H * 0.3, [16, 6, 26]);
  drawPalm(img, W * 0.985, H * 1.0, H * 0.24, [16, 6, 26]);

  // location stamp (on top of the palms)
  const stamp = 'SUNSET CITY';
  const stampScale = Math.max(2, Math.round(W * 0.0035));
  const stampW = textWidth(stamp, stampScale) + Math.round(W * 0.03);
  const stampH = Math.round(H * 0.032);
  const sx0 = Math.round(hr.x + W * 0.012), sy0 = Math.round(hr.y + hr.h - stampH - W * 0.012);
  img.fillRect(sx0, sy0, stampW, stampH, [13, 6, 20]);
  drawBitmapText(img, stamp, sx0 + stampW / 2, sy0 + Math.round((stampH - 7 * stampScale) / 2), stampScale, [255, 233, 176]);

  // title zone: dark band
  const tzTop = H * 0.775;
  for (let y = Math.round(tzTop - H * 0.03); y < H; y++) {
    const t = (y - (tzTop - H * 0.03)) / (H - (tzTop - H * 0.03));
    const a = 0.55 * Math.max(0, Math.min(1, (t - 0.1) / 0.9));
    for (let x = 0; x < W; x += 2) {
      img.blend(x, y, [13, 6, 20], a * 0.9);
      img.blend(x + 1, y, [13, 6, 20], a * 0.9);
    }
  }

  // title "GRAND SUNSET" with thick outline — kept clear of the VI badge,
  // and capped by height so it never collides with the tagline below
  const title = 'GRAND SUNSET';
  let tScale = Math.max(6, Math.round(W * 0.0122));
  while (textWidth(title, tScale) > W * 0.66 && tScale > 3) tScale--;
  const maxByHeight = Math.max(3, Math.floor((H * 0.11) / 7));
  if (tScale > maxByHeight) tScale = maxByHeight;
  const titleY = Math.round(tzTop + H * 0.04);
  drawBitmapText(img, title, W * 0.40, titleY, tScale, [255, 255, 255], [20, 8, 31], 1);

  // numeral badge "VI" — centred on the title's vertical middle
  const ns = Math.max(5, Math.round(W * 0.0088));
  const nx = Math.round(W * 0.865), ny = Math.round(titleY + (7 * tScale) / 2);
  const bw2 = textWidth('VI', ns) + ns * 4;
  const bh2 = 7 * ns + ns * 3;
  img.fillRect(nx - bw2 / 2, ny - bh2 / 2, bw2, bh2, [20, 8, 31]);
  img.strokeRect(nx - bw2 / 2, ny - bh2 / 2, bw2, bh2, Math.max(3, Math.round(W * 0.004)), PALETTE.accent);
  drawBitmapText(img, 'VI', nx, ny - Math.round(bh2 / 2) + Math.round(ns * 1.5), ns, PALETTE.accent);

  // tagline — always below the title with a clear gap
  const tag = 'A SUNSET CITY STORY';
  const tagScale = Math.max(2, Math.round(W * 0.003));
  const tagY = Math.round(titleY + 7 * tScale + H * 0.028);
  drawBitmapText(img, tag.split('').join(' '), W * 0.5, tagY, tagScale, [255, 233, 176]);

  // grain (deterministic)
  const rnd = mulberry32(20261120);
  for (let k = 0; k < 1400; k++) {
    const gx = Math.floor(rnd() * W), gy = Math.floor(rnd() * H);
    const c: RGB = rnd() < 0.5 ? [0, 0, 0] : [255, 255, 255];
    img.blend(gx, gy, c, 0.05);
  }

  // vignette
  const cx = W / 2, cy = H / 2;
  const maxD = Math.hypot(cx, cy);
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const d = Math.hypot(x - cx, y - cy) / maxD;
      const v = d > 0.62 ? (d - 0.62) / 0.38 : 0;
      if (v > 0) {
        const a = v * 0.28;
        img.blend(x, y, [10, 4, 18], a);
        img.blend(x + 1, y, [10, 4, 18], a);
        img.blend(x, y + 1, [10, 4, 18], a);
        img.blend(x + 1, y + 1, [10, 4, 18], a);
      }
    }
  }
  return img;
}

/* ---------------- PNG encoder (zlib, deterministic) ---------------- */
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

function encodePNG(img: Img): Buffer {
  const w = img.w, h = img.h;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(img.px.buffer, img.px.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 6 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------- bundle verification (offline) ---------------- */
function verifyBundle(): string[] {
  const problems: string[] = [];
  const appDir = join(HERE, 'app');
  for (const f of ['index.html', 'app.js', 'app.css']) {
    if (!existsSync(join(appDir, f))) problems.push('missing app/' + f);
  }
  const urlRe = /https?:\/\/|src\s*=\s*["']\/\/|href\s*=\s*["']\/\/|fonts\.googleapis|cdn\.|unpkg\.com|jsdelivr/i;
  const checkFile = (p: string): void => {
    const text = readFileSync(p, 'utf8');
    if (urlRe.test(text)) problems.push('external URL in ' + p);
    if (/fetch\s*\(\s*["']https?:/.test(text)) problems.push('network fetch in ' + p);
  };
  for (const name of readdirSync(appDir)) {
    const p = join(appDir, name);
    if (/\.(html|js|css)$/.test(name)) checkFile(p);
  }
  return problems;
}

/* ---------------- main ---------------- */
function main(): void {
  const problems = verifyBundle();
  if (problems.length > 0) {
    console.error('Bundle verification failed:');
    for (const p of problems) console.error(' - ' + p);
    process.exit(1);
  }
  const parts = SIZE.split('x');
  const W = parseInt(parts[0], 10);
  const H = parseInt(parts[1], 10);
  if (![1080].includes(W) && ![1080, 1920].includes(W)) throw new Error('unsupported width: ' + W);
  if (![1080, 1350].includes(H)) throw new Error('unsupported height: ' + H);

  const t0 = Date.now();
  const cover = renderCover(W, H);
  const png = encodePNG(cover);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'cover.png'), png);
  const manifest = {
    app: 'Sunset Cover Studio',
    competition: 'gta6-cover-art-01',
    size: SIZE,
    width: W,
    height: H,
    layout: 'hero3',
    palette: 'sunset',
    title: 'GRAND SUNSET',
    numeral: 'VI',
    tagline: 'A SUNSET CITY STORY',
    location: 'SUNSET CITY',
    sha256: createHash('sha256').update(png).digest('hex'),
    bytes: png.length,
    render_ms: Date.now() - t0,
  };
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('Sunset Cover Studio demo cover: ' + W + 'x' + H + ', ' + png.length + ' bytes -> ' + join(OUT_DIR, 'cover.png'));
  console.log('Bundle verified: app/index.html, app/app.js, app/app.css present and offline.');
}

main();
