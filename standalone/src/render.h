#pragma once
#include <stdint.h>
#include "game.h"
// Software raycaster into an RGB565 framebuffer (FB_W x FB_H).
struct HapticView { bool left, right; char code; uint32_t codeAt; };
extern uint32_t (*renderClock)();   // optional: microsecond clock for per-stage timing
extern uint32_t renderProf[8];      // us per stage: walls, floor, wallcols, sprites, effects, hud
void renderInit();
void renderFrame(const Game& g, uint32_t now, uint16_t* fb, const HapticView& hv);
