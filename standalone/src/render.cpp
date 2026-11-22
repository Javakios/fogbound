#include "render.h"
#include "config.h"
#include <math.h>
#include <stdio.h>
#include <string.h>

#ifdef HOST_PROFILE
#include <chrono>
double g_prof[8];
#define PSTART auto _t0 = std::chrono::high_resolution_clock::now();
#define PEND(i) { auto _t1 = std::chrono::high_resolution_clock::now(); g_prof[i] += std::chrono::duration<double, std::micro>(_t1 - _t0).count(); _t0 = _t1; }
#else
uint32_t (*renderClock)() = nullptr;      // set by main.cpp (micros) to time each stage
uint32_t renderProf[8] = {0};
#define PSTART uint32_t _t0 = renderClock ? renderClock() : 0;
#define PEND(i) { if (renderClock) { uint32_t _t1 = renderClock(); renderProf[i] += _t1 - _t0; _t0 = _t1; } }
#endif
static const int W = FB_W, H = FB_H;
static const int TS = 32;
static const float TANH = 0.6494f;   // tan(66deg / 2)

static uint8_t texWall[TS * TS * 3], texFloor[TS * TS * 3], texCeil[TS * TS * 3];
static float zbuf[FB_W];

static inline uint16_t pack(int r, int g, int b) {
  return (uint16_t)(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3));
}
static inline void unpack(uint16_t p, int& r, int& g, int& b) {
  r = (p >> 8) & 0xF8; g = (p >> 3) & 0xFC; b = (p << 3) & 0xF8;
}
static inline int clampi(int v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : v; }

static float hashf(int x, int y, int s) {
  uint32_t h = (uint32_t)x * 374761393u + (uint32_t)y * 668265263u + (uint32_t)s * 1442695041u;
  h = (h ^ (h >> 13)) * 1274126177u;
  h ^= h >> 16;
  return (float)h / 4294967296.0f;
}

// ---------------------------------------------------------------- textures
static void setTex(uint8_t* t, int x, int y, float r, float g, float b) {
  uint8_t* p = t + (y * TS + x) * 3;
  p[0] = (uint8_t)clampi((int)r, 0, 255); p[1] = (uint8_t)clampi((int)g, 0, 255); p[2] = (uint8_t)clampi((int)b, 0, 255);
}

void renderInit() {
  for (int y = 0; y < TS; y++) {
    for (int x = 0; x < TS; x++) {
      // mossy bricks: 8 px rows, 16 px bricks, every other row shifted
      const int row = y >> 3, off = (row & 1) * 8;
      const int lx = (x + off) & 15, ly = y & 7, id = ((x + off) >> 4) & 1;
      const float grit = hashf(x, y, 5) * 0.2f;
      if (lx < 1 || ly < 1) {
        const float k = 0.5f + grit;
        setTex(texWall, x, y, 36 * k, 32 * k, 36 * k);
      } else {
        float k = (0.75f + hashf(id, row, 7) * 0.35f) + grit - 0.1f;
        if (ly == 1) k *= 1.15f;
        float r = 100 * k, g = 80 * k, b = 70 * k;
        const float moss = hashf(x >> 2, y >> 2, 11);
        if (moss > 0.72f) { r = r * 0.5f + 20; g = g * 0.8f + 34; b = b * 0.5f + 14; }
        setTex(texWall, x, y, r, g, b);
      }
      // floor: 16 px flagstones
      const int fx = x & 15, fy = y & 15;
      const float fk = 0.7f + hashf(x >> 4, y >> 4, 3) * 0.4f + hashf(x, y, 9) * 0.12f;
      if (fx == 0 || fy == 0) setTex(texFloor, x, y, 22, 20, 24);
      else setTex(texFloor, x, y, 70 * fk, 64 * fk, 62 * fk);
      // ceiling: dark rough stone
      const float ck = 0.5f + hashf(x, y, 21) * 0.35f;
      setTex(texCeil, x, y, 44 * ck, 40 * ck, 46 * ck);
    }
  }
}

// ---------------------------------------------------------------- tiny 3x5 font
static const uint8_t FONT_DIGITS[10][5] = {
  {7,5,5,5,7},{2,6,2,2,7},{7,1,7,4,7},{7,1,7,1,7},{5,5,7,1,1},
  {7,4,7,1,7},{7,4,7,5,7},{7,1,1,1,1},{7,5,7,5,7},{7,5,7,1,7}};
static const uint8_t FONT_ALPHA[26][5] = {
  {2,5,7,5,5},{6,5,6,5,6},{7,4,4,4,7},{6,5,5,5,6},{7,4,6,4,7},{7,4,6,4,4},{7,4,5,5,7},
  {5,5,7,5,5},{7,2,2,2,7},{1,1,1,5,7},{5,5,6,5,5},{4,4,4,4,7},{5,7,7,5,5},{7,5,5,5,5},
  {7,5,5,5,7},{7,5,7,4,4},{7,5,5,7,1},{6,5,6,5,5},{7,4,7,1,7},{7,2,2,2,2},{5,5,5,5,7},
  {5,5,5,5,2},{5,5,7,7,5},{5,5,2,5,5},{5,5,2,2,2},{7,1,2,4,7}};

static const uint8_t* glyph(char c) {
  static const uint8_t slash[5] = {1,1,2,4,4}, bang[5] = {2,2,2,0,2}, colon[5] = {0,2,0,2,0},
                       dash[5] = {0,0,7,0,0}, dot[5] = {0,0,0,0,2}, blank[5] = {0,0,0,0,0};
  if (c >= '0' && c <= '9') return FONT_DIGITS[c - '0'];
  if (c >= 'A' && c <= 'Z') return FONT_ALPHA[c - 'A'];
  if (c >= 'a' && c <= 'z') return FONT_ALPHA[c - 'a'];
  if (c == '/') return slash;
  if (c == '!') return bang;
  if (c == ':') return colon;
  if (c == '-') return dash;
  if (c == '.') return dot;
  return blank;
}

static inline void putPix(uint16_t* fb, int x, int y, uint16_t c) {
  if ((unsigned)x < (unsigned)W && (unsigned)y < (unsigned)H) fb[y * W + x] = c;
}
static void fillRect(uint16_t* fb, int x, int y, int w, int h, uint16_t c) {
  for (int j = 0; j < h; j++) for (int i = 0; i < w; i++) putPix(fb, x + i, y + j, c);
}
static int textWidth(const char* s) { int n = (int)strlen(s); return n ? n * 4 - 1 : 0; }
static void drawText(uint16_t* fb, int x, int y, const char* s, uint16_t color, uint16_t shadow = 0x0000) {
  for (int pass = 0; pass < 2; pass++) {
    const int ox = pass == 0 ? 1 : 0, oy = pass == 0 ? 1 : 0;
    const uint16_t c = pass == 0 ? shadow : color;
    int cx = x;
    for (const char* p = s; *p; p++, cx += 4) {
      const uint8_t* g = glyph(*p);
      for (int r = 0; r < 5; r++)
        for (int b = 0; b < 3; b++)
          if (g[r] & (4 >> b)) putPix(fb, cx + b + ox, y + r + oy, c);
    }
  }
}

static const char* codeName(char c) {
  switch (c) {
    case 'L': return "LEFT";   case 'R': return "RIGHT";  case 'U': return "FORWARD";
    case 'D': return "BEHIND"; case 'W': return "WALL";   case 'G': return "GOAL";
    case 'K': return "RUNE";   case 'E': return "DANGER"; case 'X': return "CAUGHT";
    default: return "";
  }
}

static void drawMotor(uint16_t* fb, int x, int y, bool on, uint32_t now, const char* label) {
  const int j = on ? ((now / 35) & 1 ? 1 : -1) : 0;          // shake while running
  const uint16_t body = on ? pack(255, 150, 40) : pack(70, 72, 90);
  fillRect(fb, x - 1, y - 1, 12, 12, 0x0000);
  fillRect(fb, x + j, y + 1, 10, 8, body);
  fillRect(fb, x + 3 + j, y + 3, 4, 4, on ? pack(255, 230, 150) : pack(30, 30, 40));
  if (on) {                                                    // vibration marks
    const uint16_t c = pack(255, 190, 90);
    for (int k = 0; k < 2; k++) {
      putPix(fb, x - 3 - k, y + 2 + k, c); putPix(fb, x - 3 - k, y + 7 - k, c);
      putPix(fb, x + 12 + k, y + 2 + k, c); putPix(fb, x + 12 + k, y + 7 - k, c);
    }
  }
  drawText(fb, x + 3, y - 7, label, on ? pack(255, 190, 90) : pack(130, 135, 160));
}

// ---------------------------------------------------------------- fog helpers
struct Fog { int r, g, b; float density; };
static uint16_t g_fogLut[256];
static float g_lutDensity = -1.0f;
static inline int fogKfast(float dist) {
  const int i = (int)(dist * 16.0f);
  return g_fogLut[i > 255 ? 255 : i];
}
static inline uint16_t fogMix(int r, int g, int b, int k, const Fog& f) {
  if (k > 256) k = 256;
  return pack((r * (256 - k) + f.r * k) >> 8, (g * (256 - k) + f.g * k) >> 8, (b * (256 - k) + f.b * k) >> 8);
}

// ---------------------------------------------------------------- sprites
enum SpriteType { SP_RUNE, SP_SHADE, SP_PORTAL };
struct Sprite { SpriteType type; float x, y, zc, hs, ws, alpha; bool open; };

// Returns alpha 0..255 and fills rgb. emit = glows through the fog.
static int shapeAt(const Sprite& s, float u, float v, uint32_t now, int& r, int& g, int& b, bool& emit) {
  emit = false;
  const float cx = u - 0.5f, cy = v - 0.5f;
  if (s.type == SP_RUNE) {
    const float d = fabsf(cx) + fabsf(cy);
    if (d < 0.26f) { const float t = 1.0f - d / 0.26f; r = 110 + 120 * t; g = 150 + 90 * t; b = 255; emit = true; return 255; }
    const float rad = sqrtf(cx * cx + cy * cy);
    if (rad < 0.5f) {
      const float a = (1.0f - rad / 0.5f); r = 60; g = 100; b = 255; emit = true;
      return (int)(a * a * 140);
    }
    return 0;
  }
  if (s.type == SP_SHADE) {
    const float hx = cx, hy = v - 0.2f;
    const bool head = hx * hx + hy * hy < 0.0324f;
    const float halfw = 0.13f + 0.36f * clampi((int)((v - 0.2f) * 1000), 0, 800) / 800.0f;
    const float hem = 0.93f + 0.04f * sinf(u * 22.0f + now / 220.0f);
    const bool cloak = v >= 0.2f && v < hem && fabsf(cx) < halfw;
    if (!head && !cloak) return 0;
    r = 12; g = 9; b = 18;
    if (cloak && (fabsf(fabsf(cx) - halfw) < 0.05f)) { r = 30; g = 22; b = 40; }
    if (head && v < 0.3f) { r = 2; g = 1; b = 4; }
    const float ex = fabsf(fabsf(cx) - 0.075f), ey = v - 0.2f;
    if (ex * ex + ey * ey < 0.0016f) { r = 255; g = 40; b = 30; emit = true; }
    return (int)(255 * s.alpha);
  }
  // portal: glowing ring + swirling veil
  const float d = sqrtf(cx * cx + cy * cy);
  const float pulse = 0.75f + 0.25f * sinf(now / 280.0f);
  const float k = s.open ? pulse : 0.55f;
  if (d > 0.5f) return 0;
  emit = true;
  if (d > 0.36f) {
    const float edge = 1.0f - fabsf(d - 0.43f) / 0.07f;
    if (edge <= 0) { return 0; }
    if (s.open) { r = 70 * k; g = 255 * k; b = 150 * k; } else { r = 255 * k; g = 40 * k; b = 50 * k; }
    return (int)(edge * 255);
  }
  const float sw = 0.5f + 0.5f * sinf(atan2f(cy, cx) * 3.0f + d * 20.0f - now / 200.0f);
  if (s.open) { r = 20 * sw; g = 200 * sw * k; b = 100 * sw; } else { r = 120 * sw; g = 10; b = 20; }
  return (int)((0.25f + 0.2f * sw) * 255);
}

// ---------------------------------------------------------------- main
static float fadeFx(bool valid, uint32_t t0, uint32_t now, uint32_t ms) {
  if (!valid) return 0;
  const uint32_t e = now - t0;
  return e < ms ? 1.0f - (float)e / ms : 0.0f;
}

void renderFrame(const Game& g, uint32_t now, uint16_t* fb, const HapticView& hv) {
  static const Fog VISUAL = {58, 50, 80, 0.26f};
  static const Fog HAPTIC[3] = {{22, 18, 30, 1.5f}, {26, 22, 36, 0.75f}, {32, 28, 46, 0.42f}};
  const Fog fog = g.hapticMode ? HAPTIC[g.visibility] : VISUAL;

  const float hit = fadeFx(g.hitValid, g.hitAt, now, 260);
  const float shove = hit * hit * 0.12f;
  const float px = g.cam.x + (g.hitValid ? g.hitVec.x * shove : 0);
  const float py = g.cam.y + (g.hitValid ? g.hitVec.y * shove : 0);
  const float dirX = cosf(g.cam.a), dirY = sinf(g.cam.a);
  const float planeX = -dirY * TANH, planeY = dirX * TANH;
  const float camH = g.camH;
  const Maze& m = g.maze;

  PSTART
  // fog lookup table: k(dist) in 0..256, dist in 1/16-tile steps (no expf per pixel)
  if (fog.density != g_lutDensity) {
    for (int i = 0; i < 256; i++) g_fogLut[i] = (uint16_t)((1.0f - expf(-fog.density * (i / 16.0f))) * 256.0f);
    g_lutDensity = fog.density;
  }
  const int fogR = fog.r, fogG = fog.g, fogB = fog.b;

  // ---- pass 1: walls (DDA). Only geometry is computed here.
  static int16_t colTop[FB_W], colY0[FB_W], colY1[FB_W];
  static uint8_t colTx[FB_W], colSide[FB_W];
  static int32_t colStep[FB_W];
  static uint16_t colK[FB_W];
  for (int x = 0; x < W; x++) {
    const float camX = 2.0f * x / W - 1.0f;
    const float rdx = dirX + planeX * camX, rdy = dirY + planeY * camX;
    int mx = (int)floorf(px), my = (int)floorf(py);
    const float ddx = rdx == 0 ? 1e30f : fabsf(1.0f / rdx), ddy = rdy == 0 ? 1e30f : fabsf(1.0f / rdy);
    int stepX, stepY; float sdx, sdy;
    if (rdx < 0) { stepX = -1; sdx = (px - mx) * ddx; } else { stepX = 1; sdx = (mx + 1.0f - px) * ddx; }
    if (rdy < 0) { stepY = -1; sdy = (py - my) * ddy; } else { stepY = 1; sdy = (my + 1.0f - py) * ddy; }
    int side = 0;
    for (int guard = 0; guard < 64; guard++) {
      if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
      if (m.isWall(mx, my)) break;
    }
    float perp = side == 0 ? sdx - ddx : sdy - ddy;
    if (perp < 0.05f) perp = 0.05f;
    zbuf[x] = perp;
    const float lineH = H / perp;
    const int top = (int)(H / 2 + (camH - 1.0f) * lineH), bot = (int)(H / 2 + camH * lineH);
    float wallX = side == 0 ? py + perp * rdy : px + perp * rdx;
    wallX -= floorf(wallX);
    colTop[x] = (int16_t)clampi(top, -2000, 2000);
    colY0[x] = (int16_t)clampi(top, 0, H);
    colY1[x] = (int16_t)clampi(bot, 0, H);
    colTx[x] = (uint8_t)clampi((int)(wallX * TS), 0, TS - 1);
    colSide[x] = (uint8_t)side;
    colStep[x] = (int32_t)((float)(TS << 16) / lineH);
    colK[x] = fogKfast(perp);
  }

  PEND(0)
  // ---- pass 2: floor + ceiling, only the pixels no wall covers (integer maths)
  const float rdLX = dirX - planeX, rdLY = dirY - planeY, rdRX = dirX + planeX, rdRY = dirY + planeY;
  for (int y = 0; y < H; y++) {
    const int p = y - H / 2;
    uint16_t* row = fb + y * W;
    if (p == 0) { const uint16_t c = pack(fogR, fogG, fogB); for (int x = 0; x < W; x++) row[x] = c; continue; }
    const bool isFloor = p > 0;
    const float rowDist = (isFloor ? camH : 1.0f - camH) * H / (float)(isFloor ? p : -p);
    const int k = fogKfast(rowDist);
    if (k >= 250) { const uint16_t c = pack(fogR, fogG, fogB); for (int x = 0; x < W; x++) row[x] = c; continue; }
    const uint8_t* tex = isFloor ? texFloor : texCeil;
    int32_t fx = (int32_t)((px + rowDist * rdLX) * 65536.0f), fy = (int32_t)((py + rowDist * rdLY) * 65536.0f);
    const int32_t sx = (int32_t)(rowDist * (rdRX - rdLX) / W * 65536.0f), sy = (int32_t)(rowDist * (rdRY - rdLY) / W * 65536.0f);
    const int wA = 256 - k, fr = fogR * k, fg = fogG * k, fb2 = fogB * k;
    for (int x = 0; x < W; x++, fx += sx, fy += sy) {
      if (y >= colY0[x] && y < colY1[x]) continue;               // hidden behind a wall
      const uint8_t* t = tex + ((((fy >> 11) & (TS - 1)) * TS + ((fx >> 11) & (TS - 1))) * 3);
      row[x] = pack((t[0] * wA + fr) >> 8, (t[1] * wA + fg) >> 8, (t[2] * wA + fb2) >> 8);
    }
  }

  // ---- pass 3: wall columns (integer maths)
  PEND(1)
  for (int x = 0; x < W; x++) {
    const int y0 = colY0[x], y1 = colY1[x];
    if (y0 >= y1) continue;
    const int k = colK[x];
    const int shade = colSide[x] ? 190 : 256;
    const int wA = (shade * (256 - k)) >> 8, fr = fogR * k, fg = fogG * k, fb2 = fogB * k;
    const int32_t step = colStep[x];
    int32_t tp = (int32_t)(y0 - colTop[x]) * step;
    const uint8_t* col = texWall + colTx[x] * 3;
    for (int y = y0; y < y1; y++, tp += step) {
      const uint8_t* t = col + ((tp >> 16) & (TS - 1)) * TS * 3;
      fb[y * W + x] = pack((t[0] * wA + fr) >> 8, (t[1] * wA + fg) >> 8, (t[2] * wA + fb2) >> 8);
    }
  }
  PEND(2)
  // ---- sprites (runes, the Shade, the exit portal), far to near
  Sprite sp[MAX_RUNES + 2];
  int ns = 0;
  const bool open = g.runeCount == 0;
  sp[ns++] = {SP_PORTAL, g.maze.exit.x + 0.5f, g.maze.exit.y + 0.5f, 0.5f, 0.95f, 0.95f, 1.0f, open};
  for (int i = 0; i < g.runeCount; i++)
    sp[ns++] = {SP_RUNE, g.runes[i].x + 0.5f, g.runes[i].y + 0.5f, 0.3f + sinf(now / 380.0f + g.runes[i].x) * 0.04f, 0.3f, 0.3f, 1.0f, false};
  if (g.hasShade) {
    const Shade& s = g.shade;
    const float t = fminf(1.0f, (now - s.movedAt) / 260.0f);
    const bool resting = now < s.pausedUntil;
    sp[ns++] = {SP_SHADE, s.px + (s.x - s.px) * t + 0.5f, s.py + (s.y - s.py) * t + 0.5f,
                0.42f + sinf(now / 300.0f) * 0.02f, 0.84f, 0.5f, resting ? 0.35f : 0.95f, false};
  }
  float depthOf[MAX_RUNES + 2];
  int order[MAX_RUNES + 2];
  const float invTan = 1.0f / TANH;
  for (int i = 0; i < ns; i++) {
    const float ddx = sp[i].x - px, ddy = sp[i].y - py;
    depthOf[i] = ddx * dirX + ddy * dirY;
    order[i] = i;
  }
  for (int i = 1; i < ns; i++) {  // insertion sort, farthest first
    const int o = order[i]; int j = i - 1;
    while (j >= 0 && depthOf[order[j]] < depthOf[o]) { order[j + 1] = order[j]; j--; }
    order[j + 1] = o;
  }
  for (int oi = 0; oi < ns; oi++) {
    const Sprite& s = sp[order[oi]];
    const float depth = depthOf[order[oi]];
    if (depth < 0.2f) continue;
    const float lateral = (s.x - px) * -dirY + (s.y - py) * dirX;
    const float sxc = W * 0.5f * (1.0f + lateral / depth * invTan);
    const float scale = H / depth;
    const int wpx = (int)(s.ws * scale), hpx = (int)(s.hs * scale);
    if (wpx < 1 || hpx < 1) continue;
    const int x0 = (int)(sxc - wpx * 0.5f);
    const int y0 = (int)(H / 2 + (camH - (s.zc + s.hs * 0.5f)) * scale);
    const int kf = fogKfast(depth);
    for (int x = x0; x < x0 + wpx; x++) {
      if (x < 0 || x >= W || depth >= zbuf[x]) continue;
      const float u = (float)(x - x0) / wpx;
      for (int y = y0; y < y0 + hpx; y++) {
        if (y < 0 || y >= H) continue;
        int r, gg, b; bool emit;
        const int a = shapeAt(s, u, (float)(y - y0) / hpx, now, r, gg, b, emit);
        if (a <= 4) continue;
        const int k = emit ? kf / 3 : kf;
        int dr, dg, db;
        unpack(fb[y * W + x], dr, dg, db);
        const int sr = (r * (256 - k) + fog.r * k) >> 8, sg = (gg * (256 - k) + fog.g * k) >> 8, sb = (b * (256 - k) + fog.b * k) >> 8;
        fb[y * W + x] = pack((dr * (255 - a) + sr * a) / 255, (dg * (255 - a) + sg * a) / 255, (db * (255 - a) + sb * a) / 255);
      }
    }
  }

  PEND(3)
  // ---- full-screen effects: damage flash, danger vignette, pickup, win
  const float caughtFx = fadeFx(g.caughtValid, g.caughtAt, now, 900);
  const float pickup = fadeFx(g.pickupValid, g.pickupAt, now, 500);
  const float redFlash = fmaxf(hit, caughtFx) * 0.45f;
  const float beat = 0.55f + 0.45f * fabsf(sinf(now / 170.0f));
  const float danger = g.hapticMode ? 0.0f : g.dangerLevel * beat;   // in Haptic mode danger is felt, not seen
  const float winFx = g.won ? fmaxf(0.0f, 1.0f - (now - g.endedAt) / 900.0f) : 0.0f;
  if (redFlash > 0.01f || danger > 0.01f || pickup > 0.01f || winFx > 0.01f) {
    for (int y = 0; y < H; y++) {
      const float ny = (y - H / 2) / (H * 0.5f);
      for (int x = 0; x < W; x++) {
        const float nx = (x - W / 2) / (W * 0.5f);
        const float edge = (nx * nx + ny * ny) * 0.5f;
        int r, gg, b;
        unpack(fb[y * W + x], r, gg, b);
        const float ar = redFlash + danger * edge * 0.8f;
        r += (int)((255 - r) * ar); gg -= (int)(gg * ar * 0.6f); b -= (int)(b * ar * 0.6f);
        r += (int)((120 - r) * pickup * 0.25f); gg += (int)((160 - gg) * pickup * 0.25f); b += (int)((255 - b) * pickup * 0.35f);
        gg += (int)((255 - gg) * winFx * 0.4f);
        fb[y * W + x] = pack(clampi(r, 0, 255), clampi(gg, 0, 255), clampi(b, 0, 255));
      }
    }
  }

  PEND(4)
  // ---- minimap (visual mode only)
  if (!g.hapticMode) {
    const int n = m.size;
    const int vw = W >= 160 ? n : 15;                                   // small frame: scroll a 15x15 window
    const int ox = W >= 160 ? 0 : clampi(g.pos.x - vw / 2, 0, n - vw), oy = W >= 160 ? 0 : clampi(g.pos.y - vw / 2, 0, n - vw);
    const int mx0 = W - vw - 3, my0 = 3;
    auto mark = [&](int tx, int ty, uint16_t c) {
      if (tx >= ox && tx < ox + vw && ty >= oy && ty < oy + vw) putPix(fb, mx0 + tx - ox, my0 + ty - oy, c);
    };
    fillRect(fb, mx0 - 1, my0 - 1, vw + 2, vw + 2, 0x0000);
    for (int y = oy; y < oy + vw; y++)
      for (int x = ox; x < ox + vw; x++)
        putPix(fb, mx0 + x - ox, my0 + y - oy, m.grid[y * n + x] ? pack(60, 56, 80) : pack(18, 16, 26));
    for (int i = 0; i < g.runeCount; i++) mark(g.runes[i].x, g.runes[i].y, pack(120, 160, 255));
    mark(m.exit.x, m.exit.y, open ? pack(70, 255, 150) : pack(255, 40, 50));
    if (g.hasShade) mark(g.shade.x, g.shade.y, pack(255, 30, 30));
    static const int FX[4] = {0, 1, 0, -1}, FY[4] = {-1, 0, 1, 0};
    mark(g.pos.x, g.pos.y, 0xFFFF);
    mark(g.pos.x + FX[g.facing], g.pos.y + FY[g.facing], pack(255, 220, 80));
  }

  // ---- HUD
  char buf[32];
  if (g.runesTotal() > 0) {
    snprintf(buf, sizeof(buf), "RUNES %d/%d", g.runesGot, g.runesTotal());
    drawText(fb, 3, 11, buf, pack(165, 180, 252));
  }
  // vibration motors M1 (left) / M2 (right): they shake and glow when driven
  drawMotor(fb, 4, H - 17, hv.left, now, "L");
  drawMotor(fb, W - 16, H - 17, hv.right, now, "R");
  if (hv.code && now - hv.codeAt < 700) {
    const char* nm = codeName(hv.code);
    drawText(fb, (W - textWidth(nm)) / 2, H - 8, nm, pack(255, 190, 90));
  }
  drawText(fb, 3, 3, g.hapticMode ? "HAPTIC" : "VISUAL", g.hapticMode ? pack(255, 180, 90) : pack(150, 200, 255));
  if (g.msg[0] && now - g.msgAt < g.msgDur)
    drawText(fb, (W - textWidth(g.msg)) / 2, H / 2 - 28, g.msg, g.msgColor);
  if (g.won) {
    const char* t1 = "EXIT FOUND";
    drawText(fb, (W - textWidth(t1)) / 2, H / 2 - 8, t1, pack(120, 255, 180));
    snprintf(buf, sizeof(buf), "%.1fS  %d MOVES", g.elapsed(now), g.moves);
    drawText(fb, (W - textWidth(buf)) / 2, H / 2 + 2, buf, 0xFFFF);
    const char* t2 = "BTN2 = AGAIN";
    drawText(fb, (W - textWidth(t2)) / 2, H / 2 + 14, t2, pack(200, 200, 220));
  }
  PEND(5)
}
