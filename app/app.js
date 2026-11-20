'use strict';
/* Sunset Cover Studio — offline GTA-style cover maker.
   Every photo is processed locally in the browser; nothing is uploaded.
   All art and lettering here is original (parody style). No Rockstar
   logos, artwork or fonts are used. */

(function () {
  var canvas = document.getElementById('preview');
  var ctx = canvas.getContext('2d');

  /* ---------- deterministic PRNG (grain + skyline) ---------- */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------- palettes ---------- */
  var PALETTES = {
    sunset: {
      skyTop: '#ffd9a0', skyMid: '#ff9e7d', skyLow: '#ff6b9d', horizon: '#7b4b94',
      deep: '#2d1b4e', silhouette: '#241239', accent: '#ffb347', accent2: '#ff6b9d',
      titleFill: '#ffffff', titleStroke: '#14081f', panelLine: '#0d0a14'
    },
    neon: {
      skyTop: '#1b1035', skyMid: '#3b1d5e', skyLow: '#7b2d8b', horizon: '#ff2e88',
      deep: '#12082a', silhouette: '#0d0518', accent: '#39e6ff', accent2: '#ff2e88',
      titleFill: '#ffffff', titleStroke: '#05010d', panelLine: '#05010d'
    }
  };

  /* ---------- state ---------- */
  var state = {
    layout: 'hero3',       // 'hero3' | 'hero2' | 'grid4'
    palette: 'sunset',
    size: '1080x1080',
    title: 'GRAND SUNSET',
    numeral: 'VI',
    tagline: 'A SUNSET CITY STORY',
    location: 'SUNSET CITY',
    photos: [null, null, null, null],   // {kind:'img'|'canvas', el, name}
    zoom: [1, 1, 1, 1],
    pan: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
    selected: 0
  };

  var PANEL_NAMES = ['Hero', 'Side 1', 'Side 2', 'Side 3'];

  /* ---------- demo scenes (procedural, drawn on canvas) ---------- */
  function makeDemoCanvas(w, h, variant, seed) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    drawDemoScene(g, w, h, variant, seed);
    return c;
  }

  function drawDemoScene(g, w, h, variant, seed) {
    var rnd = mulberry32(seed);
    var pal = PALETTES[state.palette];
    // sky
    var sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, pal.skyTop);
    sky.addColorStop(0.45, pal.skyMid);
    sky.addColorStop(0.75, pal.skyLow);
    sky.addColorStop(1, pal.horizon);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    // sun + glow
    var sx = w * 0.68, sy = h * 0.34, sr = h * 0.17;
    var glow = g.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr * 2.4);
    glow.addColorStop(0, 'rgba(255, 236, 180, 0.9)');
    glow.addColorStop(1, 'rgba(255, 236, 180, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff3c4';
    g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255, 140, 66, 0.55)';
    g.beginPath(); g.arc(sx, sy, sr * 0.82, 0, Math.PI * 2); g.fill();

    if (variant === 1) {
      drawStreet(g, w, h, rnd, pal);
    } else if (variant === 2) {
      drawPalmCloseup(g, w, h, rnd, pal);
    } else {
      drawBeach(g, w, h, rnd, pal);
    }
  }

  function drawBeach(g, w, h, rnd, pal) {
    // sea
    var sea = g.createLinearGradient(0, h * 0.55, 0, h);
    sea.addColorStop(0, pal.skyLow);
    sea.addColorStop(1, pal.deep);
    g.fillStyle = sea;
    g.fillRect(0, h * 0.55, w, h * 0.45);
    // sun reflection streaks
    g.fillStyle = 'rgba(255, 240, 190, 0.5)';
    for (var i = 0; i < 9; i++) {
      var yy = h * (0.58 + i * 0.045);
      var ww = w * (0.10 + rnd() * 0.16);
      g.fillRect(w * 0.5 - ww / 2 + (rnd() - 0.5) * w * 0.05, yy, ww, h * 0.012);
    }
    // skyline
    drawSkyline(g, 0, h * 0.55, w, h * 0.16, pal.silhouette, rnd, 11);
    // sand foreground
    g.fillStyle = pal.silhouette;
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, h * 0.86);
    g.quadraticCurveTo(w * 0.5, h * 0.78, w, h * 0.88);
    g.lineTo(w, h);
    g.closePath();
    g.fill();
    // palms on the sand
    drawPalm(g, w * 0.10, h * 0.92, h * 0.30, pal.silhouette);
    drawPalm(g, w * 0.90, h * 0.94, h * 0.24, pal.silhouette);
    // speedboat
    g.fillStyle = '#160a24';
    g.beginPath();
    g.moveTo(w * 0.60, h * 0.66); g.lineTo(w * 0.78, h * 0.66);
    g.lineTo(w * 0.74, h * 0.70); g.lineTo(w * 0.63, h * 0.70);
    g.closePath(); g.fill();
    g.fillStyle = '#fff3c4';
    g.fillRect(w * 0.66, h * 0.635, w * 0.05, h * 0.028);
  }

  function drawStreet(g, w, h, rnd, pal) {
    // neon street: buildings both sides, wet road, neon signs
    g.fillStyle = pal.deep;
    g.fillRect(0, h * 0.5, w, h * 0.5);
    drawSkyline(g, 0, h * 0.42, w, h * 0.22, pal.silhouette, rnd, 8);
    // road perspective
    g.fillStyle = '#1a0b2e';
    g.beginPath();
    g.moveTo(w * 0.32, h); g.lineTo(w * 0.46, h * 0.52);
    g.lineTo(w * 0.54, h * 0.52); g.lineTo(w * 0.68, h);
    g.closePath(); g.fill();
    // neon signs
    var cols = [pal.accent, pal.accent2, '#39e6ff', '#ffe066'];
    for (var i = 0; i < 7; i++) {
      var x = w * (0.06 + rnd() * 0.88);
      var y = h * (0.20 + rnd() * 0.30);
      g.fillStyle = cols[i % cols.length];
      g.globalAlpha = 0.85;
      g.fillRect(x, y, w * 0.02, h * (0.05 + rnd() * 0.10));
      g.globalAlpha = 0.25;
      g.fillRect(x - w * 0.015, y - h * 0.01, w * 0.05, h * (0.07 + rnd() * 0.10));
      g.globalAlpha = 1;
    }
    // pink car silhouette
    g.fillStyle = '#ff5e8a';
    g.beginPath();
    g.moveTo(w * 0.30, h * 0.86); g.lineTo(w * 0.34, h * 0.80);
    g.lineTo(w * 0.62, h * 0.80); g.lineTo(w * 0.70, h * 0.86);
    g.lineTo(w * 0.68, h * 0.90); g.lineTo(w * 0.32, h * 0.90);
    g.closePath(); g.fill();
    g.fillStyle = '#0d0a14';
    g.beginPath(); g.arc(w * 0.38, h * 0.90, h * 0.035, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(w * 0.62, h * 0.90, h * 0.035, 0, Math.PI * 2); g.fill();
    // palm
    drawPalm(g, w * 0.08, h * 0.95, h * 0.34, pal.silhouette);
  }

  function drawPalmCloseup(g, w, h, rnd, pal) {
    // big palm fronds against the sunset
    g.fillStyle = pal.silhouette;
    drawPalm(g, w * 0.22, h * 1.02, h * 0.85, pal.silhouette);
    drawPalm(g, w * 0.82, h * 1.05, h * 0.70, pal.silhouette);
    // flamingo silhouette
    g.strokeStyle = pal.silhouette;
    g.lineWidth = h * 0.02; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(w * 0.55, h * 0.55);
    g.quadraticCurveTo(w * 0.62, h * 0.42, w * 0.58, h * 0.34);
    g.stroke();
    g.fillStyle = pal.silhouette;
    g.beginPath(); g.ellipse(w * 0.52, h * 0.56, w * 0.09, h * 0.035, -0.3, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(w * 0.585, h * 0.325, h * 0.028, 0, Math.PI * 2); g.fill();
    // distant birds
    g.strokeStyle = 'rgba(20, 8, 31, 0.8)';
    g.lineWidth = Math.max(2, h * 0.006);
    for (var i = 0; i < 4; i++) {
      var bx = w * (0.35 + rnd() * 0.3), by = h * (0.15 + rnd() * 0.12);
      g.beginPath();
      g.moveTo(bx - w * 0.02, by); g.quadraticCurveTo(bx, by - h * 0.012, bx, by);
      g.quadraticCurveTo(bx + w * 0.01, by - h * 0.012, bx + w * 0.02, by);
      g.stroke();
    }
  }

  function drawSkyline(g, x, baseY, w, h, color, rnd, count) {
    g.fillStyle = color;
    var bx = x;
    for (var i = 0; i < count; i++) {
      var bw = w / count * (0.55 + rnd() * 0.8);
      var bh = h * (0.45 + rnd() * 0.55);
      g.fillRect(bx, baseY - bh, bw, bh + 2);
      // lit windows
      g.fillStyle = 'rgba(255, 220, 140, 0.85)';
      var cols = Math.floor(bw / 14);
      var rows = Math.floor(bh / 16);
      for (var cx = 0; cx < cols; cx++) {
        for (var cy = 0; cy < rows; cy++) {
          if (rnd() < 0.28) g.fillRect(bx + 4 + cx * 14, baseY - bh + 5 + cy * 16, 6, 8);
        }
      }
      g.fillStyle = color;
      bx += bw + 2;
    }
  }

  function drawPalm(g, x, y, s, color) {
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineCap = 'round';
    // trunk
    g.lineWidth = Math.max(3, s * 0.05);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + s * 0.06, y - s * 0.55, x + s * 0.16, y - s * 0.92);
    g.stroke();
    var tx = x + s * 0.16, ty = y - s * 0.92;
    // fronds
    g.lineWidth = Math.max(2, s * 0.035);
    for (var i = 0; i < 7; i++) {
      var a = -Math.PI * (0.05 + i * 0.14);
      var fx = tx + Math.cos(a) * s * 0.42;
      var fy = ty + Math.sin(a) * s * 0.34 + s * 0.22;
      g.beginPath();
      g.moveTo(tx, ty);
      g.quadraticCurveTo(tx + Math.cos(a) * s * 0.25, ty + Math.sin(a) * s * 0.16, fx, fy);
      g.stroke();
    }
    // coconuts
    g.beginPath(); g.arc(tx - s * 0.03, ty + s * 0.03, s * 0.035, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(tx + s * 0.04, ty + s * 0.05, s * 0.03, 0, Math.PI * 2); g.fill();
  }

  function drawHelicopter(g, x, y, s, color) {
    g.fillStyle = color;
    g.strokeStyle = color;
    g.lineCap = 'round';
    // rotor
    g.lineWidth = Math.max(2, s * 0.06);
    g.beginPath(); g.moveTo(x - s * 0.9, y - s * 0.28); g.lineTo(x + s * 0.9, y - s * 0.28); g.stroke();
    g.beginPath(); g.moveTo(x, y - s * 0.28); g.lineTo(x, y); g.stroke();
    // body
    g.beginPath(); g.ellipse(x, y + s * 0.08, s * 0.55, s * 0.26, 0, 0, Math.PI * 2); g.fill();
    // tail
    g.lineWidth = Math.max(2, s * 0.09);
    g.beginPath(); g.moveTo(x + s * 0.5, y); g.lineTo(x + s * 1.25, y - s * 0.22); g.stroke();
    // tail rotor
    g.lineWidth = Math.max(2, s * 0.05);
    g.beginPath(); g.moveTo(x + s * 1.25, y - s * 0.42); g.lineTo(x + s * 1.25, y - s * 0.02); g.stroke();
    // skids
    g.lineWidth = Math.max(2, s * 0.05);
    g.beginPath(); g.moveTo(x - s * 0.4, y + s * 0.42); g.lineTo(x + s * 0.45, y + s * 0.42); g.stroke();
  }

  /* ---------- panel geometry ---------- */
  function panelRects(layout, W, H) {
    var m = W * 0.028;              // outer margin
    var top = H * 0.025;
    var bottom = H * 0.755;         // panels end here; title zone below
    var gap = W * 0.018;
    var zoneW = W - m * 2;
    var zoneH = bottom - top;
    if (layout === 'hero2') {
      var heroW = zoneW * 0.62;
      return [
        { x: m, y: top, w: heroW, h: zoneH },
        { x: m + heroW + gap, y: top, w: zoneW - heroW - gap, h: zoneH }
      ];
    }
    if (layout === 'grid4') {
      var cw = (zoneW - gap) / 2, ch = (zoneH - gap) / 2;
      return [
        { x: m, y: top, w: cw, h: ch },
        { x: m + cw + gap, y: top, w: cw, h: ch },
        { x: m, y: top + ch + gap, w: cw, h: ch },
        { x: m + cw + gap, y: top + ch + gap, w: cw, h: ch }
      ];
    }
    // hero3 (default)
    var hw = zoneW * 0.62;
    var rh = (zoneH - gap) / 2;
    return [
      { x: m, y: top, w: hw, h: zoneH },
      { x: m + hw + gap, y: top, w: zoneW - hw - gap, h: rh },
      { x: m + hw + gap, y: top + rh + gap, w: zoneW - hw - gap, h: rh }
    ];
  }

  function visiblePanels() {
    return state.layout === 'grid4' ? 4 : state.layout === 'hero2' ? 2 : 3;
  }

  /* ---------- photo drawing (cover-fit + zoom/pan) ---------- */
  function drawPhotoInto(g, photo, rect, zoom, pan) {
    var iw = photo.el.naturalWidth || photo.el.width;
    var ih = photo.el.naturalHeight || photo.el.height;
    if (!iw || !ih) return;
    var scale = Math.max(rect.w / iw, rect.h / ih) * zoom;
    var dw = iw * scale, dh = ih * scale;
    var dx = rect.x + (rect.w - dw) / 2 + pan.x * rect.w;
    var dy = rect.y + (rect.h - dh) / 2 + pan.y * rect.h;
    g.save();
    g.beginPath();
    g.rect(rect.x, rect.y, rect.w, rect.h);
    g.clip();
    g.drawImage(photo.el, dx, dy, dw, dh);
    // subtle top shade so panel edges read as comic frames
    var sh = g.createLinearGradient(0, rect.y, 0, rect.y + rect.h * 0.25);
    sh.addColorStop(0, 'rgba(0,0,0,0.18)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh;
    g.fillRect(rect.x, rect.y, rect.w, rect.h * 0.25);
    g.restore();
  }

  /* ---------- outlined text ---------- */
  function outlinedText(g, text, x, y, font, fill, stroke, lw) {
    g.font = font;
    g.lineJoin = 'round';
    g.miterLimit = 2;
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.strokeText(text, x, y);
    g.fillStyle = fill;
    g.fillText(text, x, y);
  }

  /* ---------- the cover ---------- */
  function drawCover(g, W, H) {
    var pal = PALETTES[state.palette];
    // background sunset
    var bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, pal.skyTop);
    bg.addColorStop(0.4, pal.skyMid);
    bg.addColorStop(0.7, pal.skyLow);
    bg.addColorStop(1, pal.deep);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // sun glow top-right
    var sx = W * 0.78, sy = H * 0.16, sr = H * 0.13;
    var glow = g.createRadialGradient(sx, sy, 0, sx, sy, sr * 2.2);
    glow.addColorStop(0, 'rgba(255, 236, 180, 0.55)');
    glow.addColorStop(1, 'rgba(255, 236, 180, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);

    var rects = panelRects(state.layout, W, H);
    var n = visiblePanels();
    var i, r;
    // panels
    for (i = 0; i < n; i++) {
      r = rects[i];
      var photo = state.photos[i];
      if (photo) {
        drawPhotoInto(g, photo, r, state.zoom[i], state.pan[i]);
      } else {
        var dc = makeDemoCanvas(Math.max(320, Math.round(r.w)), Math.max(240, Math.round(r.h)), i % 3, 1000 + i * 77);
        g.drawImage(dc, r.x, r.y, r.w, r.h);
      }
      // comic frame: white gutter + thick black outline
      g.lineWidth = Math.max(3, W * 0.004);
      g.strokeStyle = '#ffffff';
      g.strokeRect(r.x - W * 0.004, r.y - W * 0.004, r.w + W * 0.008, r.h + W * 0.008);
      g.lineWidth = Math.max(4, W * 0.006);
      g.strokeStyle = pal.panelLine;
      g.strokeRect(r.x, r.y, r.w, r.h);
      // selected panel highlight (preview only, not on export)
      if (g === ctx && i === state.selected) {
        g.save();
        g.setLineDash([14, 10]);
        g.lineWidth = 4;
        g.strokeStyle = pal.accent;
        g.strokeRect(r.x - 8, r.y - 8, r.w + 16, r.h + 16);
        g.restore();
      }
    }

    // helicopter silhouette over the hero panel sky
    var hr = rects[0];
    drawHelicopter(g, hr.x + hr.w * 0.20, hr.y + hr.h * 0.16, Math.min(hr.w, hr.h) * 0.085, 'rgba(16, 6, 26, 0.92)');

    // foreground palms framing the cover (before the stamp, so they never cover text)
    drawPalm(g, W * 0.015, H * 0.99, H * 0.30, 'rgba(16, 6, 26, 0.95)');
    drawPalm(g, W * 0.985, H * 1.0, H * 0.24, 'rgba(16, 6, 26, 0.95)');

    // location stamp on hero panel (on top of the palms)
    var stamp = state.location || 'SUNSET CITY';
    g.font = '700 ' + Math.max(13, Math.round(W * 0.016)) + 'px Arial, sans-serif';
    var sw = g.measureText(stamp).width + W * 0.03;
    var sh2 = H * 0.032;
    g.fillStyle = 'rgba(13, 6, 20, 0.88)';
    g.fillRect(hr.x + W * 0.012, hr.y + hr.h - sh2 - W * 0.012, sw, sh2);
    g.fillStyle = '#ffe9b0';
    g.textBaseline = 'middle';
    g.fillText(stamp, hr.x + W * 0.027, hr.y + hr.h - sh2 / 2 - W * 0.012);
    g.textBaseline = 'alphabetic';

    // ---- title zone ----
    var tzTop = H * 0.775;
    // dark band for legibility
    var band = g.createLinearGradient(0, tzTop - H * 0.03, 0, H);
    band.addColorStop(0, 'rgba(13, 6, 20, 0)');
    band.addColorStop(0.35, 'rgba(13, 6, 20, 0.55)');
    band.addColorStop(1, 'rgba(13, 6, 20, 0.88)');
    g.fillStyle = band;
    g.fillRect(0, tzTop - H * 0.03, W, H - tzTop + H * 0.03);

    var title = (state.title || 'GRAND SUNSET').toUpperCase();
    var baseSize = W * 0.088;
    g.font = '900 ' + Math.round(baseSize) + 'px "Arial Black", Arial, sans-serif';
    var tw = g.measureText(title).width;
    var maxW = W * 0.66; // kept clear of the numeral badge on the right
    var size = baseSize;
    if (tw > maxW) { size = baseSize * maxW / tw; }
    if (size > H * 0.11) { size = H * 0.11; } // cap by height so wide canvases stay balanced
    var font = '900 ' + Math.round(size) + 'px "Arial Black", Arial, sans-serif';
    var titleY = tzTop + H * 0.115;
    g.save();
    g.translate(W * 0.40, titleY);
    g.rotate(-0.02);
    g.textAlign = 'center';
    outlinedText(g, title, 0, 0, font, pal.titleFill, pal.titleStroke, Math.max(6, size * 0.13));
    g.restore();

    // numeral badge
    var num = (state.numeral || 'VI').toUpperCase();
    var ns = W * 0.062;
    var nx = W * 0.865, ny = tzTop + H * 0.105;
    g.save();
    g.translate(nx, ny);
    g.rotate(-0.1);
    g.fillStyle = '#14081f';
    g.strokeStyle = pal.accent;
    g.lineWidth = Math.max(3, W * 0.004);
    var bw = ns * 1.5, bh = ns * 1.15;
    g.fillRect(-bw / 2, -bh / 2, bw, bh);
    g.strokeRect(-bw / 2, -bh / 2, bw, bh);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 ' + Math.round(ns) + 'px "Arial Black", Arial, sans-serif';
    g.fillStyle = pal.accent;
    g.fillText(num, 0, bh * 0.04);
    g.restore();

    // tagline
    var tag = (state.tagline || '').toUpperCase();
    if (tag) {
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      var tsize = Math.max(13, Math.round(W * 0.021));
      g.font = '700 ' + tsize + 'px Arial, sans-serif';
      g.fillStyle = '#ffe9b0';
      var spaced = tag.split('').join(' ');
      g.fillText(spaced, W * 0.5, H * 0.955);
    }

    // grain (deterministic)
    var rnd = mulberry32(20261120);
    g.save();
    for (var k = 0; k < 1400; k++) {
      var gx = rnd() * W, gy = rnd() * H;
      g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
      g.fillRect(gx, gy, Math.max(1, W * 0.0012), Math.max(1, W * 0.0012));
    }
    g.restore();

    // vignette
    var vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(10,4,18,0.28)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  /* ---------- demo photos ---------- */
  function loadDemoPhotos() {
    var defs = [
      { variant: 0, seed: 20261120, name: 'Demo · Beach sunset' },
      { variant: 1, seed: 20261121, name: 'Demo · Neon street' },
      { variant: 2, seed: 20261122, name: 'Demo · Palm close-up' },
      { variant: 0, seed: 20261123, name: 'Demo · Beach sunset 2' }
    ];
    for (var i = 0; i < 4; i++) {
      if (!state.photos[i]) {
        var c = makeDemoCanvas(900, 700, defs[i].variant, defs[i].seed);
        state.photos[i] = { kind: 'canvas', el: c, name: defs[i].name };
      }
    }
  }

  /* ---------- preview ---------- */
  var previewW = 1080, previewH = 1080;
  function renderPreview() {
    var dims = state.size.split('x');
    previewW = parseInt(dims[0], 10);
    previewH = parseInt(dims[1], 10);
    canvas.width = previewW;
    canvas.height = previewH;
    drawCover(ctx, previewW, previewH);
  }

  /* ---------- export ---------- */
  function exportPNG() {
    var status = document.getElementById('export-status');
    var dims = state.size.split('x');
    var W = parseInt(dims[0], 10), H = parseInt(dims[1], 10);
    var off = document.createElement('canvas');
    off.width = W; off.height = H;
    var g = off.getContext('2d');
    drawCover(g, W, H);
    status.textContent = 'Rendering ' + W + ' × ' + H + '…';
    off.toBlob(function (blob) {
      if (!blob) { status.textContent = 'Export failed in this browser.'; return; }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'gta-cover-' + state.size + '.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 4000);
      status.textContent = 'Saved gta-cover-' + state.size + '.png (' + (blob.size / 1024).toFixed(0) + ' KB).';
    }, 'image/png');
  }

  /* ---------- UI: photo rows ---------- */
  var rowsEl = document.getElementById('photo-rows');
  function thumbURL(photo) {
    if (!photo) return '';
    if (photo.kind === 'canvas') return photo.el.toDataURL('image/png');
    return photo.el.src || '';
  }
  function buildPhotoRows() {
    rowsEl.innerHTML = '';
    for (var i = 0; i < 4; i++) {
      (function (idx) {
        var row = document.createElement('div');
        row.className = 'photo-row' + (state.selected === idx ? ' selected' : '');
        row.title = 'Select panel ' + PANEL_NAMES[idx];
        var img = document.createElement('img');
        img.className = 'thumb';
        img.alt = PANEL_NAMES[idx];
        if (state.photos[idx]) img.src = thumbURL(state.photos[idx]);
        var name = document.createElement('span');
        name.className = 'name';
        name.textContent = (idx + 1) + ' · ' + PANEL_NAMES[idx] + ' — ' + (state.photos[idx] ? state.photos[idx].name : 'empty');
        var up = document.createElement('button');
        up.className = 'mini'; up.type = 'button'; up.textContent = 'Upload';
        var dm = document.createElement('button');
        dm.className = 'mini'; dm.type = 'button'; dm.textContent = 'Demo';
        up.addEventListener('click', function (e) { e.stopPropagation(); state.selected = idx; openFilePicker(idx); });
        dm.addEventListener('click', function (e) {
          e.stopPropagation();
          state.selected = idx;
          var c = makeDemoCanvas(900, 700, idx % 3, 20261120 + idx);
          state.photos[idx] = { kind: 'canvas', el: c, name: 'Demo · panel ' + (idx + 1) };
          state.zoom[idx] = 1; state.pan[idx] = { x: 0, y: 0 };
          syncUI(); renderPreview();
        });
        row.addEventListener('click', function () { state.selected = idx; syncUI(); renderPreview(); });
        row.appendChild(img); row.appendChild(name); row.appendChild(up); row.appendChild(dm);
        rowsEl.appendChild(row);
      })(i);
    }
    document.getElementById('selected-label').textContent =
      'Selected panel: ' + PANEL_NAMES[state.selected] + ' (' + (state.selected + 1) + ')';
  }

  var pendingPanel = 0;
  var fileInput = document.getElementById('file-input');
  function openFilePicker(idx) { pendingPanel = idx; fileInput.click(); }
  fileInput.addEventListener('change', function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        state.photos[pendingPanel] = { kind: 'img', el: img, name: f.name };
        state.zoom[pendingPanel] = 1;
        state.pan[pendingPanel] = { x: 0, y: 0 };
        syncUI(); renderPreview();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
    fileInput.value = '';
  });

  document.getElementById('btn-clear-photos').addEventListener('click', function () {
    for (var i = 0; i < 4; i++) { state.photos[i] = null; state.zoom[i] = 1; state.pan[i] = { x: 0, y: 0 }; }
    loadDemoPhotos();
    syncUI(); renderPreview();
  });
  document.getElementById('btn-demo').addEventListener('click', function () {
    loadDemoPhotos();
    syncUI(); renderPreview();
  });

  /* ---------- UI: segmented controls ---------- */
  function wireSeg(id, key, cb) {
    var seg = document.getElementById(id);
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var btns = seg.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
      b.classList.add('active');
      state[key] = b.getAttribute('data-' + (key === 'size' ? 'size' : key === 'layout' ? 'layout' : 'palette'));
      if (cb) cb();
      renderPreview();
    });
  }
  wireSeg('layout-seg', 'layout');
  wireSeg('palette-seg', 'palette');
  wireSeg('size-seg', 'size');

  /* ---------- UI: text inputs ---------- */
  function wireInput(id, key) {
    document.getElementById(id).addEventListener('input', function (e) {
      state[key] = e.target.value;
      renderPreview();
    });
  }
  wireInput('in-title', 'title');
  wireInput('in-numeral', 'numeral');
  wireInput('in-tagline', 'tagline');
  wireInput('in-location', 'location');

  /* ---------- UI: zoom ---------- */
  var zoomEl = document.getElementById('zoom');
  zoomEl.addEventListener('input', function () {
    state.zoom[state.selected] = zoomEl.value / 100;
    document.getElementById('zoom-val').textContent = zoomEl.value + '%';
    renderPreview();
  });

  /* ---------- canvas pan / zoom ---------- */
  var dragging = false, lastX = 0, lastY = 0;
  function canvasPoint(e) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  }
  function panelAt(px, py) {
    var rects = panelRects(state.layout, canvas.width, canvas.height);
    var n = visiblePanels();
    for (var i = 0; i < n; i++) {
      var r = rects[i];
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i;
    }
    return -1;
  }
  canvas.addEventListener('pointerdown', function (e) {
    var p = canvasPoint(e);
    var idx = panelAt(p.x, p.y);
    if (idx >= 0) {
      state.selected = idx;
      syncUI();
      dragging = true; lastX = p.x; lastY = p.y;
      canvas.setPointerCapture(e.pointerId);
      renderPreview();
    }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var p = canvasPoint(e);
    var r = panelRects(state.layout, canvas.width, canvas.height)[state.selected];
    state.pan[state.selected].x = clamp(state.pan[state.selected].x + (p.x - lastX) / r.w, -0.5, 0.5);
    state.pan[state.selected].y = clamp(state.pan[state.selected].y + (p.y - lastY) / r.h, -0.5, 0.5);
    lastX = p.x; lastY = p.y;
    renderPreview();
  });
  canvas.addEventListener('pointerup', function () { dragging = false; });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    var z = state.zoom[state.selected] * (e.deltaY < 0 ? 1.08 : 0.92);
    state.zoom[state.selected] = clamp(z, 1, 3);
    zoomEl.value = Math.round(state.zoom[state.selected] * 100);
    document.getElementById('zoom-val').textContent = zoomEl.value + '%';
    renderPreview();
  }, { passive: false });

  /* ---------- export buttons ---------- */
  document.getElementById('btn-export').addEventListener('click', exportPNG);
  document.getElementById('btn-export-2').addEventListener('click', exportPNG);

  function syncUI() {
    buildPhotoRows();
    zoomEl.value = Math.round(state.zoom[state.selected] * 100);
    document.getElementById('zoom-val').textContent = zoomEl.value + '%';
  }

  /* ---------- boot ---------- */
  loadDemoPhotos();
  syncUI();
  renderPreview();
})();
