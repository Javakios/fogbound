// Host-side test: runs the real game core + renderer on the PC and dumps frames
// as PPM files (no ESP32 needed). Also checks the maze can be solved by following hints.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../src/game.h"
#include "../src/render.h"
#include "../src/config.h"

static uint16_t fb[FB_W * FB_H];
static char lastHaptic = 0;
static void onHaptic(char c, uint32_t) { if (c) lastHaptic = c; }
static void onLog(const char* l) { printf("%s\n", l); }

static void dump(const char* path, uint32_t scale) {
  FILE* f = fopen(path, "wb");
  fprintf(f, "P6\n%d %d\n255\n", FB_W * scale, FB_H * scale);
  for (int y = 0; y < FB_H * scale; y++)
    for (int x = 0; x < FB_W * scale; x++) {
      const uint16_t p = fb[(y / scale) * FB_W + (x / scale)];
      fputc((p >> 8) & 0xF8, f); fputc((p >> 3) & 0xFC, f); fputc((p << 3) & 0xF8, f);
    }
  fclose(f);
}

int main(int argc, char** argv) {
  const char* outDir = argc > 1 ? argv[1] : ".";
  renderInit();
  Game g;
  g.hooks.haptic = onHaptic; g.hooks.log = onLog;
  uint32_t now = 1000;
  g.newMaze(GAME_SEED, GAME_CELLS, 2, now);
  printf("maze %dx%d, runes=%d, optimal=%d\n", g.maze.size, g.maze.size, g.runesTotal(), g.optimalTotal);

  // 1) solve it by obeying the haptic hints only (this is what the player does by feel)
  int steps = 0;
  while (!g.won && steps < 2000) {
    lastHaptic = 0;
    g.hint(now);
    const char h = lastHaptic;
    if (!h) { printf("no hint at step %d\n", steps); return 1; }
    g.move(h == 'D' ? 'D' : h, now);   // L/R turn, U forward, D step back
    now += 400; steps++;
    // keep the Shade out of the way: this test is about the maze + hints
    g.shade.pausedUntil = now + 100000;
    if (steps == 25) { g.updateCamera(now); g.updateCamera(now + 500); renderFrame(g, now, fb, HapticView{true, false, 'L', now}); char p[256]; snprintf(p, sizeof p, "%s/frame_visual.ppm", outDir); dump(p, 2); }
    if (steps == 25) { g.setMode(true); g.updateCamera(now + 600); renderFrame(g, now, fb, HapticView{true, true, 'W', now}); char p[256]; snprintf(p, sizeof p, "%s/frame_haptic.ppm", outDir); dump(p, 2); g.setMode(false); }
  }
  printf("solved=%d steps=%d moves=%d caught=%d\n", g.won, steps, g.moves, g.caught);
  g.updateCamera(now + 50); renderFrame(g, now + 100, fb, HapticView{});
  { char p[256]; snprintf(p, sizeof p, "%s/frame_win.ppm", outDir); dump(p, 2); }

  // 2) a frame with the Shade in view
  g.newMaze(GAME_SEED, GAME_CELLS, 2, now);
  g.move('U', now);
  g.shade.x = g.pos.x + 3; g.shade.y = g.pos.y; g.shade.px = g.shade.x; g.shade.py = g.shade.y; g.shade.pausedUntil = 0;
  g.runes[0] = {g.pos.x + 1, g.pos.y};
  for (int i = 0; i < 20; i++) { now += 30; g.updateCamera(now); }
  renderFrame(g, now, fb, HapticView{false, true, 'R', now});
  { char p[256]; snprintf(p, sizeof p, "%s/frame_shade.ppm", outDir); dump(p, 2); }

  // 3) timing of the renderer on the PC (not representative of the ESP32)
  return 0;
}
