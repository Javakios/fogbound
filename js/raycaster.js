// First-person raycaster: low-res software renderer with coloured distance fog,
// procedural textures, dynamic point lights and billboard sprites (props,
// runes, the Shade, the exit portal). Drawn at 320×240 and scaled up without
// smoothing for the chunky late-90s look.
window.HM = window.HM || {};
(function (HM) {
  const TS = 64;            // texture size
  const W = 320, H = 240;   // internal resolution
  const FOV = 66 * Math.PI / 180;
  const MAX_LIGHTS = 8;
  const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

  function hash(x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // Periodic value noise so textures tile seamlessly.
  function vnoise(x, y, s, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const w = (v) => ((v % period) + period) % period;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(w(xi), w(yi), s), b = hash(w(xi + 1), w(yi), s);
    const c = hash(w(xi), w(yi + 1), s), d = hash(w(xi + 1), w(yi + 1), s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const fbm = (x, y, s, p) => vnoise(x, y, s, p) * 0.6 + vnoise(x * 2, y * 2, s + 1, p * 2) * 0.3 + vnoise(x * 4, y * 4, s + 2, p * 4) * 0.1;

  // ---------------------------------------------------------------- walls/floor
  function makeTexture(fn) {
    const t = new Uint8Array(TS * TS * 3);
    for (let y = 0; y < TS; y++) {
      for (let x = 0; x < TS; x++) {
        const [r, g, b] = fn(x, y);
        const i = (y * TS + x) * 3;
        t[i] = clamp255(r); t[i + 1] = clamp255(g); t[i + 2] = clamp255(b);
      }
    }
    return t;
  }

  // Mossy stone bricks
  const brick = (x, y) => {
    const row = y >> 4, off = (row & 1) * 16;
    const lx = (x + off) & 31, ly = y & 15, id = ((x + off) & 63) >> 5;
    const n = fbm(x / 8, y / 8, 3, 8), grit = hash(x, y, 5) * 0.18;
    if (lx < 2 || ly < 2) { const k = 0.55 + n * 0.4 + grit; return [36 * k, 32 * k, 36 * k]; }
    let k = (0.7 + hash(id, row, 7) * 0.35) * (0.75 + n * 0.45) + grit - 0.09;
    if (ly === 2) k *= 1.18;
    if (ly === 15 || lx === 31) k *= 0.7;
    let r = 96 * k, g = 78 * k, b = 68 * k;
    const moss = fbm(x / 16, y / 16, 11, 4);
    if (moss > 0.58) {
      const a = Math.min(1, (moss - 0.58) * 4);
      r = r * (1 - a) + 50 * a * k * 1.3; g = g * (1 - a) + 84 * a * k * 1.3; b = b * (1 - a) + 44 * a * k * 1.3;
    }
    return [r, g, b];
  };

  // Riveted metal panels with a thin glowing strip
  const tech = (x, y) => {
    const lx = x & 31, ly = y & 31;
    if ((y === 41 || y === 42) && lx > 3 && lx < 28) return [70, 190, 170];
    let k = 0.8 + fbm(x / 8, y / 8, 21, 8) * 0.35 + hash(x, y, 22) * 0.08;
    if (lx === 0 || ly === 0) k *= 0.45;
    else if (lx === 1 || ly === 1) k *= 1.25;
    else if (lx === 31 || ly === 31) k *= 0.6;
    const near = (a) => Math.abs(a - 5) <= 1 || Math.abs(a - 26) <= 1;
    if (near(lx) && near(ly)) k *= 1.5;
    let r = 62, g = 64, b = 78;
    const rust = fbm(x / 8, y / 16, 30, 8);
    if (rust > 0.6 && ly > 6) { const a = (rust - 0.6) * 3; r += 50 * a; g += 12 * a; b -= 10 * a; }
    return [r * k, g * k, b * k];
  };

  const floorTex = (x, y) => {
    const lx = x & 31, ly = y & 31;
    let k = 0.65 + fbm(x / 8, y / 8, 41, 8) * 0.5 + hash(x, y, 42) * 0.12;
    if (lx === 0 || ly === 0) k *= 0.4;
    else if (lx === 1 || ly === 1) k *= 1.15;
    let r = 60 * k, g = 54 * k, b = 58 * k;
    const stain = fbm(x / 16, y / 16, 43, 4);
    if (stain > 0.6) { const a = (stain - 0.6) * 2.5; r *= 1 - a * 0.3; g *= 1 - a * 0.5; b *= 1 - a * 0.5; }
    return [r, g, b];
  };

  const ceilTex = (x, y) => {
    let k = 0.6 + fbm(x / 8, y / 8, 51, 8) * 0.4;
    if ((x & 63) < 2 || (y & 63) < 2) k *= 0.5;
    return [40 * k, 38 * k, 50 * k];
  };

  const lampTex = (x, y) => {
    const cx = Math.abs(x - 31.5), cy = Math.abs(y - 31.5);
    if (cx < 7 && cy < 7) return [220, 210, 170];
    if (cx < 9 && cy < 9) return [30, 30, 36];
    const base = ceilTex(x, y);
    const glow = Math.max(0, 1 - Math.hypot(cx, cy) / 30) * 50;
    return [base[0] + glow, base[1] + glow * 0.9, base[2] + glow * 0.6];
  };

  // ---------------------------------------------------------------- sprites
  // fn returns [r, g, b, alpha, emissive?]; emissive pixels ignore fog/light.
  function makeSprite(fn) {
    const rgba = new Uint8Array(TS * TS * 4), em = new Uint8Array(TS * TS);
    for (let y = 0; y < TS; y++) {
      for (let x = 0; x < TS; x++) {
        const px = fn(x, y);
        if (!px) continue;
        const i = y * TS + x;
        rgba[i * 4] = clamp255(px[0]); rgba[i * 4 + 1] = clamp255(px[1]);
        rgba[i * 4 + 2] = clamp255(px[2]); rgba[i * 4 + 3] = clamp255(px[3]);
        em[i] = px[4] ? 1 : 0;
      }
    }
    return { rgba, em };
  }

  const barrel = (x, y) => {
    const u = (x - 31.5) / 15;
    if (Math.abs(u) > 1 || y < 12) return null;
    const round = Math.sqrt(1 - u * u);
    if (y < 19) { // toxic lid
      const e = Math.abs((y - 15.5) / 3.5);
      if (u * u + e * e > 1) return null;
      const glow = 0.7 + 0.3 * fbm(x / 8, y / 4, 71, 8);
      return [70 * glow, 220 * glow, 60 * glow, 255, 1];
    }
    const shade = (0.35 + 0.65 * round) * (1 - 0.25 * u);
    const band = (y >= 22 && y <= 25) || (y >= 54 && y <= 57) || y >= 62;
    if (band) return [52 * shade, 50 * shade, 56 * shade, 255];
    const n = 0.75 + fbm(x / 8, y / 8, 72, 8) * 0.5;
    let r = 122 * n, g = 48 * n, b = 36 * n;
    if (y > 19 && y < 34 && hash(x, 0, 73) > 0.55 && hash(x, y >> 2, 74) > 0.25) { r = 70; g = 180; b = 60; } // drips
    return [r * shade, g * shade, b * shade, 255];
  };

  const crate = (x, y) => {
    if (x < 9 || x > 54 || y < 20) return null;
    const lx = x - 9, ly = y - 20, w = 45, h = 43;
    const n = 0.75 + fbm(x / 8, y / 4, 81, 8) * 0.45;
    const border = lx < 4 || lx > w - 4 || ly < 4 || ly > h - 4;
    const diag = Math.abs(lx * h / w - ly) < 3 || Math.abs((w - lx) * h / w - ly) < 3;
    if (border || diag) return [92 * n, 60 * n, 32 * n, 255];
    const plank = ly % 8 === 0 ? 0.55 : 1;
    return [128 * n * plank, 90 * n * plank, 52 * n * plank, 255];
  };

  const chains = (x, y) => {
    if (y > 54) return null;
    for (const cx of [22, 42]) {
      const len = cx === 22 ? 54 : 40;
      if (y > len) continue;
      const link = Math.floor(y / 6), ly = y % 6;
      const rx = link % 2 ? 1.2 : 2.6;
      const dx = Math.abs(x - cx);
      const ring = ly === 0 || ly === 5 ? dx <= rx : Math.abs(dx - rx) < 0.9;
      if (ring) { const k = 0.6 + 0.4 * hash(x, y, 91); return [118 * k, 116 * k, 126 * k, 255]; }
    }
    return null;
  };

  function brazierFrame(frame) {
    return (x, y) => {
      const dx = x - 31.5;
      if (y >= 60 && Math.abs(dx) < 11) return [60, 56, 60, 255];                 // feet
      if (y >= 40 && Math.abs(dx) < 2.5) return [74, 70, 76, 255];                 // stand
      if (y >= 31 && y < 40) {                                                     // bowl
        const half = 15 - (y - 31) * 0.9;
        if (Math.abs(dx) < half) { const k = 0.6 + 0.4 * (1 - Math.abs(dx) / half); return [96 * k, 84 * k, 80 * k, 255]; }
        return null;
      }
      if (y < 31) {                                                                // fire
        const h = (31 - y) / 27;
        const width = (1 - h) * 13 * (0.55 + 0.75 * vnoise(x / 5, y / 5 + frame * 1.7, 101 + frame, 64));
        if (Math.abs(dx) < width) {
          const t = Math.min(1, h + Math.abs(dx) / 20);
          return [255, 230 - 170 * t, 120 - 110 * t, 255, 1];
        }
      }
      return null;
    };
  }

  const rune = (x, y) => {
    const dx = Math.abs(x - 31.5) / 11, dy = Math.abs(y - 31.5) / 20;
    const d = dx + dy;
    if (d < 1) {
      const facet = x < 32 ? 0.75 : 1;
      const k = (1 - d * 0.5) * facet;
      return [140 * k, 170 * k, 255 * k, 255, 1];
    }
    const glow = Math.max(0, 1 - (d - 1) / 0.9);
    return glow > 0 ? [90, 120, 255, glow * glow * 150, 1] : null;
  };

  const shade = (x, y) => {
    const dx = x - 31.5;
    for (const ex of [27.5, 35.5]) if (Math.hypot(x - ex, y - 17) < 1.8) return [255, 50, 30, 255, 1];  // eyes
    const head = Math.hypot(dx, (y - 17) * 1.1) < 10;
    const halfW = 10 + (y - 22) * 0.55;
    const ragged = y > 54 ? hash(x, 0, 111) * 10 > 64 - y : true;
    const body = y >= 22 && Math.abs(dx) < halfW && ragged;
    if (!head && !body) return null;
    const edge = head ? 1 - Math.hypot(dx, (y - 17) * 1.1) / 10 : 1 - Math.abs(dx) / halfW;
    const n = fbm(x / 8, y / 8, 112, 8);
    const rim = edge < 0.18 ? 1 : 0;
    return [16 + 30 * rim + n * 10, 10 + 8 * rim, 22 + 40 * rim + n * 10, 225 + n * 30];
  };

  // Exit portal: a ring + a swirling core (separate so the core can animate).
  function makePortal() {
    const ring = new Float32Array(TS * TS), core = new Float32Array(TS * TS);
    for (let y = 0; y < TS; y++) {
      for (let x = 0; x < TS; x++) {
        const dx = (x - 31.5) / 19, dy = (y - 33) / 28;
        const r = Math.sqrt(dx * dx + dy * dy);
        ring[y * TS + x] = Math.min(1, Math.exp(-Math.pow((r - 0.86) * 6, 2)) * 1.1 + Math.max(0, 1 - r) * 0.15);
        core[y * TS + x] = r < 0.86 ? (0.25 + 0.75 * fbm(x / 8, y / 8, 61, 8)) * (1 - r) * 0.8 : 0;
      }
    }
    return { ring, core };
  }

  function makeGrain() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d'), img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // Sprite catalogue: world size (fraction of wall height) and how it blends.
  const SPRITES = {
    barrel: { size: 0.5, mode: 'alpha' },
    crate: { size: 0.5, mode: 'alpha' },
    chains: { size: 0.62, mode: 'alpha' },
    brazier: { size: 0.7, mode: 'alpha', frames: 4 },
    rune: { size: 0.44, mode: 'add', gain: 1.8 },
    shade: { size: 0.95, mode: 'alpha', unlit: true },
  };

  class Raycaster {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.buf = document.createElement('canvas');
      this.buf.width = W;
      this.buf.height = H;
      this.bctx = this.buf.getContext('2d');
      this.img = this.bctx.createImageData(W, H);
      this.pix = new Uint32Array(this.img.data.buffer);
      this.zbuf = new Float32Array(W);
      this.tex = {
        brick: makeTexture(brick), tech: makeTexture(tech),
        floor: makeTexture(floorTex), ceil: makeTexture(ceilTex), lamp: makeTexture(lampTex),
      };
      this.sprites = {
        barrel: [makeSprite(barrel)], crate: [makeSprite(crate)], chains: [makeSprite(chains)],
        brazier: [0, 1, 2, 3].map((f) => makeSprite(brazierFrame(f))),
        rune: [makeSprite(rune)], shade: [makeSprite(shade)],
      };
      this.portal = makePortal();
      // light buffers (struct of arrays for speed)
      this.L = { x: new Float32Array(MAX_LIGHTS), y: new Float32Array(MAX_LIGHTS), r: new Float32Array(MAX_LIGHTS),
        g: new Float32Array(MAX_LIGHTS), b: new Float32Array(MAX_LIGHTS), rad2: new Float32Array(MAX_LIGHTS), inv: new Float32Array(MAX_LIGHTS), n: 0 };

      const scan = document.createElement('canvas');
      scan.width = 1; scan.height = 3;
      const sg = scan.getContext('2d');
      sg.fillStyle = '#000';
      sg.fillRect(0, 2, 1, 1);
      this.scanPat = this.ctx.createPattern(scan, 'repeat');
      this.grainPat = this.ctx.createPattern(makeGrain(), 'repeat');
    }

    resize(w, h) {
      this.cw = w;
      this.ch = h;
      const g = this.ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.58);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.7)');
      this.vignette = g;
    }

    // keep only the lights close to the camera
    loadLights(lights, px, py) {
      const L = this.L;
      const near = lights
        .map((l) => ({ l, d: Math.hypot(l.x - px, l.y - py) }))
        .filter((o) => o.d < 9 + o.l.radius)
        .sort((a, b) => a.d - b.d)
        .slice(0, MAX_LIGHTS);
      L.n = near.length;
      near.forEach(({ l }, i) => {
        L.x[i] = l.x; L.y[i] = l.y;
        L.r[i] = l.color[0]; L.g[i] = l.color[1]; L.b[i] = l.color[2];
        L.rad2[i] = l.radius * l.radius; L.inv[i] = 1 / l.radius;
      });
    }

    // s: { maze, x, y, a, h, fog, density, light, lights[], sprites[], portal{} , time, hit, win }
    render(s) {
      const { pix, zbuf, tex, L } = this;
      const n = s.maze.size, grid = s.maze.grid;
      const px = s.x, py = s.y, h = s.h;
      const dirX = Math.cos(s.a), dirY = Math.sin(s.a);
      const pl = Math.tan(FOV / 2), plX = -dirY * pl, plY = dirX * pl;
      const half = H / 2, dens = s.density, light = s.light;
      const [fr, fg, fb] = s.fog;
      this.loadLights(s.lights, px, py);
      const nl = L.n, LX = L.x, LY = L.y, LRr = L.r, LGg = L.g, LBb = L.b, LR2 = L.rad2, LINV = L.inv;

      // ---- floor & ceiling (one distance per screen row) ----
      const rdx0 = dirX - plX, rdy0 = dirY - plY, rdx1 = dirX + plX, rdy1 = dirY + plY;
      for (let y = 0; y < H; y++) {
        const isFloor = y >= half;
        const p = isFloor ? y - half + 0.5 : half - y - 0.5;
        const dist = (isFloor ? h : 1 - h) * H / p;
        const f = 1 - Math.exp(-dist * dens), vis = 1 - f, visL = Math.sqrt(vis);
        const lit = vis * light * (1 + 0.5 * Math.exp(-dist * 1.2)) * (isFloor ? 0.95 : 0.8);
        const fR = fr * f, fG = fg * f, fB = fb * f;
        const sx = dist * (rdx1 - rdx0) / W, sy = dist * (rdy1 - rdy0) / W;
        let wx = px + dist * rdx0, wy = py + dist * rdy0;
        let o = y * W;
        for (let x = 0; x < W; x++, wx += sx, wy += sy) {
          const cx = Math.floor(wx), cy = Math.floor(wy);
          const t = isFloor ? tex.floor : hash(cx, cy, 9) < 0.2 ? tex.lamp : tex.ceil;
          const i = ((((wy - cy) * TS) & 63) * TS + (((wx - cx) * TS) & 63)) * 3;
          let lr = 0, lg = 0, lb = 0;
          for (let k = 0; k < nl; k++) {
            const dx = wx - LX[k], dy = wy - LY[k], d2 = dx * dx + dy * dy;
            if (d2 < LR2[k]) { const q = 1 - Math.sqrt(d2) * LINV[k], w = q * q * visL; lr += w * LRr[k]; lg += w * LGg[k]; lb += w * LBb[k]; }
          }
          const r = t[i] * (lit + lr) + fR + lr * 14, g = t[i + 1] * (lit + lg) + fG + lg * 14, b = t[i + 2] * (lit + lb) + fB + lb * 14;
          pix[o++] = 0xff000000 | (clamp255(b) << 16) | (clamp255(g) << 8) | clamp255(r);
        }
      }

      // ---- walls (DDA per column) ----
      for (let x = 0; x < W; x++) {
        const camX = 2 * (x + 0.5) / W - 1;
        const rdx = dirX + plX * camX, rdy = dirY + plY * camX;
        let mx = Math.floor(px), my = Math.floor(py);
        const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx), ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
        let stepX, stepY, sdx, sdy;
        if (rdx < 0) { stepX = -1; sdx = (px - mx) * ddx; } else { stepX = 1; sdx = (mx + 1 - px) * ddx; }
        if (rdy < 0) { stepY = -1; sdy = (py - my) * ddy; } else { stepY = 1; sdy = (my + 1 - py) * ddy; }
        let side = 0, hit = false;
        for (let i = 0; i < 160; i++) {
          if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
          if (mx < 0 || my < 0 || mx >= n || my >= n || grid[my * n + mx] === 1) { hit = true; break; }
        }
        const perp = Math.max(1e-4, side === 0 ? sdx - ddx : sdy - ddy);
        zbuf[x] = perp;
        if (!hit) continue;

        let wallX = side === 0 ? py + perp * rdy : px + perp * rdx;
        wallX -= Math.floor(wallX);
        let tx = (wallX * TS) | 0;
        if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) tx = TS - 1 - tx;
        const t = hash(mx, my, 3) < 0.18 ? tex.tech : tex.brick;

        const f = 1 - Math.exp(-perp * dens), vis = 1 - f, visL = Math.sqrt(vis);
        const lit = vis * light * (1 + 0.5 * Math.exp(-perp * 1.2)) * (side ? 0.68 : 1);
        const fR = fr * f, fG = fg * f, fB = fb * f;
        // light at the hit point, nudged off the wall so it isn't half inside
        const hx = px + perp * rdx - (side === 0 ? stepX : 0) * 0.02, hy = py + perp * rdy - (side === 1 ? stepY : 0) * 0.02;
        let lr = 0, lg = 0, lb = 0;
        for (let k = 0; k < nl; k++) {
          const dx = hx - LX[k], dy = hy - LY[k], d2 = dx * dx + dy * dy;
          if (d2 < LR2[k]) { const q = 1 - Math.sqrt(d2) * LINV[k], w = q * q * visL * (side ? 0.75 : 1); lr += w * LRr[k]; lg += w * LGg[k]; lb += w * LBb[k]; }
        }

        const top = half + (h - 1) * H / perp, bot = half + h * H / perp;
        const y0 = Math.max(0, Math.ceil(top - 0.5)), y1 = Math.min(H, Math.ceil(bot - 0.5));
        const zStep = perp / H;
        for (let y = y0; y < y1; y++) {
          const z = h - (y + 0.5 - half) * zStep;
          const i = ((((1 - z) * TS) & 63) * TS + tx) * 3;
          const r = t[i] * (lit + lr) + fR + lr * 14, g = t[i + 1] * (lit + lg) + fG + lg * 14, b = t[i + 2] * (lit + lb) + fB + lb * 14;
          pix[y * W + x] = 0xff000000 | (clamp255(b) << 16) | (clamp255(g) << 8) | clamp255(r);
        }
      }

      // ---- billboards, far to near ----
      const invDet = 1 / (plX * dirY - dirX * plY);
      const cam = { px, py, h, dirX, dirY, plX, plY, invDet, dens, light, fog: s.fog };
      const list = [];
      for (const sp of s.sprites) {
        const sx = sp.x - px, sy = sp.y - py;
        const tY = invDet * (-plY * sx + plX * sy);
        if (tY > 0.18) list.push({ sp, tX: invDet * (dirY * sx - dirX * sy), tY });
      }
      if (s.portal) {
        const sx = s.portal.x - px, sy = s.portal.y - py;
        const tY = invDet * (-plY * sx + plX * sy);
        if (tY > 0.18) list.push({ portal: s.portal, tX: invDet * (dirY * sx - dirX * sy), tY });
      }
      list.sort((a, b) => b.tY - a.tY);
      for (const item of list) {
        if (item.portal) this.drawPortal(item, cam, s);
        else this.drawSprite(item, cam);
      }

      this.present(s);
    }

    lightAt(x, y, vis) {
      const L = this.L;
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < L.n; k++) {
        const dx = x - L.x[k], dy = y - L.y[k], d2 = dx * dx + dy * dy;
        if (d2 < L.rad2[k]) { const q = 1 - Math.sqrt(d2) * L.inv[k], w = q * q * vis; r += w * L.r[k]; g += w * L.g[k]; b += w * L.b[k]; }
      }
      return [r, g, b];
    }

    drawSprite({ sp, tX, tY }, c) {
      const def = SPRITES[sp.type];
      const frames = this.sprites[sp.type];
      const { rgba, em } = frames[(sp.frame || 0) % frames.length];
      const size = def.size * (sp.scale || 1);
      const scr = size * H / tY;
      const scrX = (W / 2) * (1 + tX / tY), left = scrX - scr / 2;
      const top = H / 2 + (c.h - ((sp.z || 0) + size)) * H / tY;
      const x0 = Math.max(0, Math.floor(left)), x1 = Math.min(W, Math.ceil(left + scr));
      const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(H, Math.ceil(top + scr));
      if (x0 >= x1 || y0 >= y1) return;

      const f = 1 - Math.exp(-tY * c.dens), vis = 1 - f;
      const lit = vis * c.light * (1 + 0.5 * Math.exp(-tY * 1.2));
      const [lr, lg, lb] = def.unlit ? [0, 0, 0] : this.lightAt(sp.x, sp.y, Math.sqrt(vis));
      const fR = c.fog[0] * f, fG = c.fog[1] * f, fB = c.fog[2] * f;
      const add = def.mode === 'add';
      const alphaMul = sp.alpha ?? 1;
      const pix = this.pix, zbuf = this.zbuf;

      for (let x = x0; x < x1; x++) {
        if (tY >= zbuf[x]) continue;
        const u = ((x + 0.5 - left) / scr * TS) | 0;
        if (u < 0 || u >= TS) continue;
        for (let y = y0; y < y1; y++) {
          const v = ((y + 0.5 - top) / scr * TS) | 0;
          if (v < 0 || v >= TS) continue;
          const ti = v * TS + u, a = rgba[ti * 4 + 3] * alphaMul;
          if (a < 12) continue;
          const o = y * W + x, p = pix[o];
          const pr = p & 255, pg = (p >> 8) & 255, pb = (p >> 16) & 255;
          let r, g, b;
          if (add) {
            const k = (a / 255) * (1 - f * 0.55) * (def.gain || 1);
            r = pr + rgba[ti * 4] * k; g = pg + rgba[ti * 4 + 1] * k; b = pb + rgba[ti * 4 + 2] * k;
          } else {
            if (em[ti]) {  // emissive: cuts through the fog
              const k = 1 - f * 0.45;
              r = rgba[ti * 4] * k + fR * 0.45; g = rgba[ti * 4 + 1] * k + fG * 0.45; b = rgba[ti * 4 + 2] * k + fB * 0.45;
            } else {
              r = rgba[ti * 4] * (lit + lr) + fR; g = rgba[ti * 4 + 1] * (lit + lg) + fG; b = rgba[ti * 4 + 2] * (lit + lb) + fB;
            }
            if (a < 250) { const al = a / 255; r = r * al + pr * (1 - al); g = g * al + pg * (1 - al); b = b * al + pb * (1 - al); }
          }
          pix[o] = 0xff000000 | (clamp255(b) << 16) | (clamp255(g) << 8) | clamp255(r);
        }
      }
    }

    drawPortal({ portal, tX, tY }, c, s) {
      const scr = 0.95 * H / tY;
      const scrX = (W / 2) * (1 + tX / tY), left = scrX - scr / 2;
      const top = H / 2 + (c.h - 0.47) * H / tY - scr / 2;
      const x0 = Math.max(0, Math.floor(left)), x1 = Math.min(W, Math.ceil(left + scr));
      const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(H, Math.ceil(top + scr));
      const f = 1 - Math.exp(-tY * c.dens), k = (1 - f * 0.7) * portal.strength;
      const [cr, cg, cb] = portal.color;
      const shift = (s.time * 0.02) | 0;
      const { ring, core } = this.portal;
      const pix = this.pix, zbuf = this.zbuf;
      for (let x = x0; x < x1; x++) {
        if (tY >= zbuf[x]) continue;
        const u = ((x + 0.5 - left) / scr * TS) | 0;
        if (u < 0 || u >= TS) continue;
        for (let y = y0; y < y1; y++) {
          const v = ((y + 0.5 - top) / scr * TS) | 0;
          if (v < 0 || v >= TS) continue;
          const inside = core[v * TS + u] > 0 ? 1 : 0;
          const a = (ring[v * TS + u] + core[((v + shift) & 63) * TS + u] * inside) * k;
          if (a < 0.02) continue;
          const o = y * W + x, p = pix[o];
          pix[o] = 0xff000000 | (clamp255(((p >> 16) & 255) + cb * a) << 16) |
            (clamp255(((p >> 8) & 255) + cg * a) << 8) | clamp255((p & 255) + cr * a);
        }
      }
    }

    present(s) {
      const ctx = this.ctx, w = this.cw, h = this.ch;
      this.bctx.putImageData(this.img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.buf, 0, 0, w, h);

      ctx.globalAlpha = 0.16;
      ctx.fillStyle = this.scanPat;
      ctx.fillRect(0, 0, w, h);

      ctx.globalAlpha = 0.06;
      ctx.save();
      ctx.translate(-Math.random() * 128, -Math.random() * 128);
      ctx.fillStyle = this.grainPat;
      ctx.fillRect(0, 0, w + 128, h + 128);
      ctx.restore();
      ctx.globalAlpha = 1;

      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, w, h);

      if (s.danger > 0) {  // red heartbeat at the screen edges when the Shade is near
        const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.55);
        g.addColorStop(0, 'rgba(120,0,0,0)');
        g.addColorStop(1, `rgba(150,0,10,${0.55 * s.danger})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      if (s.hit > 0) { ctx.fillStyle = `rgba(190, 20, 20, ${0.38 * s.hit})`; ctx.fillRect(0, 0, w, h); }
      if (s.win > 0) { ctx.fillStyle = `rgba(60, 230, 140, ${0.3 * s.win})`; ctx.fillRect(0, 0, w, h); }
      if (s.pickup > 0) { ctx.fillStyle = `rgba(110, 140, 255, ${0.28 * s.pickup})`; ctx.fillRect(0, 0, w, h); }
    }

    // Top-down map in the corner (Visual mode only).
    drawMinimap(s) {
      const ctx = this.ctx, m = s.maze, n = m.size;
      const size = Math.min(this.cw * 0.3, 200), t = size / n;
      const ox = this.cw - size - 10, oy = 10;
      ctx.fillStyle = 'rgba(6, 6, 12, 0.72)';
      ctx.fillRect(ox - 5, oy - 5, size + 10, size + 10);
      ctx.fillStyle = 'rgba(120, 104, 150, 0.85)';
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if (m.grid[y * n + x] === 1) ctx.fillRect(ox + x * t, oy + y * t, Math.ceil(t), Math.ceil(t));
        }
      }
      if (s.path) {
        ctx.strokeStyle = 'rgba(253, 224, 71, 0.9)';
        ctx.lineWidth = Math.max(1.5, t * 0.35);
        ctx.beginPath();
        s.path.forEach((p, i) => {
          const X = ox + (p.x + 0.5) * t, Y = oy + (p.y + 0.5) * t;
          if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
        });
        ctx.stroke();
      }
      ctx.fillStyle = s.portal && s.portal.open ? '#34d399' : '#b91c1c';
      ctx.fillRect(ox + m.exit.x * t, oy + m.exit.y * t, t, t);
      ctx.fillStyle = '#93a5ff';
      for (const r of s.runes || []) ctx.fillRect(ox + (r.x + 0.2) * t, oy + (r.y + 0.2) * t, t * 0.6, t * 0.6);
      if (s.shadePos) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(ox + s.shadePos.x * t, oy + s.shadePos.y * t, Math.max(2.5, t * 0.45), 0, Math.PI * 2);
        ctx.fill();
      }

      const X = ox + s.x * t, Y = oy + s.y * t, r = Math.max(4, t * 0.9);
      ctx.save();
      ctx.translate(X, Y);
      ctx.rotate(s.a);
      ctx.fillStyle = '#fca5a5';
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.7, r * 0.65);
      ctx.lineTo(-r * 0.7, -r * 0.65);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // In-view HUD: rune counter + centred messages.
    drawHud(hud) {
      const ctx = this.ctx, w = this.cw, h = this.ch;
      const scale = Math.max(0.8, w / 760);
      ctx.save();
      ctx.font = `700 ${Math.round(15 * scale)}px ui-monospace, Consolas, monospace`;
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 4;
      if (hud.runesTotal > 0) {
        const y = h - 22 * scale;
        let x = 16 * scale;
        ctx.fillStyle = '#c7d2fe';
        ctx.fillText('ΡΟΥΝΟΙ', x, y);
        x += ctx.measureText('ΡΟΥΝΟΙ ').width;
        for (let i = 0; i < hud.runesTotal; i++) {
          const got = i < hud.runesGot, cx = x + i * 20 * scale + 7 * scale, s = 7 * scale;
          ctx.beginPath();
          ctx.moveTo(cx, y - s * 1.3); ctx.lineTo(cx + s * 0.8, y); ctx.lineTo(cx, y + s * 1.3); ctx.lineTo(cx - s * 0.8, y);
          ctx.closePath();
          if (got) { ctx.fillStyle = '#93a5ff'; ctx.fill(); }
          else { ctx.strokeStyle = 'rgba(199,210,254,0.6)'; ctx.lineWidth = 1.5; ctx.stroke(); }
        }
      }
      if (hud.message) {
        ctx.textAlign = 'center';
        ctx.font = `800 ${Math.round(20 * scale)}px ui-monospace, Consolas, monospace`;
        ctx.globalAlpha = hud.messageAlpha;
        ctx.fillStyle = hud.messageColor || '#f1f5f9';
        ctx.fillText(hud.message, w / 2, h * 0.7);
      }
      ctx.restore();
    }
  }

  HM.Raycaster = Raycaster;
})(window.HM);
