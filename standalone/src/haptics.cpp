#include "haptics.h"

struct Step { uint8_t left, right; uint16_t ms; };
static const Step P_LEFT[]  = {{1, 0, 170}};
static const Step P_RIGHT[] = {{0, 1, 170}};
static const Step P_UP[]    = {{1, 1, 90}};
static const Step P_DOWN[]  = {{1, 1, 80}, {0, 0, 110}, {1, 1, 80}};
static const Step P_WALL[]  = {{1, 1, 450}};
static const Step P_GOAL[]  = {{1, 0, 110}, {0, 0, 50}, {0, 1, 110}, {0, 0, 50},
                               {1, 0, 110}, {0, 0, 50}, {0, 1, 110}, {0, 0, 90}, {1, 1, 420}};
static const Step P_RUNE[]   = {{1, 0, 70}, {0, 1, 70}, {1, 1, 140}};
static const Step P_DANGER[] = {{1, 1, 30}, {0, 0, 30}, {1, 1, 30}, {0, 0, 30}, {1, 1, 30}, {0, 0, 30}, {1, 1, 30}};
static const Step P_CAUGHT[] = {{1, 1, 250}, {0, 0, 90}, {1, 1, 250}, {0, 0, 90}, {1, 1, 650}};

struct Pattern { char code; const Step* steps; uint8_t count; };
#define LEN(a) ((uint8_t)(sizeof(a) / sizeof(a[0])))
static const Pattern PATTERNS[] = {
  {'L', P_LEFT, LEN(P_LEFT)}, {'R', P_RIGHT, LEN(P_RIGHT)},
  {'U', P_UP, LEN(P_UP)},     {'D', P_DOWN, LEN(P_DOWN)},
  {'W', P_WALL, LEN(P_WALL)}, {'G', P_GOAL, LEN(P_GOAL)},
  {'K', P_RUNE, LEN(P_RUNE)}, {'E', P_DANGER, LEN(P_DANGER)},
  {'X', P_CAUGHT, LEN(P_CAUGHT)},
};

static void (*setMotorsFn)(bool, bool) = nullptr;
static const Step* cur = nullptr;
static uint8_t curCount = 0, curIndex = 0;
static uint32_t stepStart = 0, busyUntil = 0, lastAt = 0;
static bool mL = false, mR = false;
static char lastCode = 0;

void hapticsInit(void (*fn)(bool, bool)) { setMotorsFn = fn; if (fn) fn(false, false); }

static void motors(bool l, bool r) { mL = l; mR = r; if (setMotorsFn) setMotorsFn(l, r); }

void hapticsPlay(char code, uint32_t now) {
  for (const Pattern& p : PATTERNS) {
    if (p.code != code) continue;
    cur = p.steps; curCount = p.count; curIndex = 0; stepStart = now;
    lastCode = code; lastAt = now;
    uint32_t total = 0;
    for (uint8_t i = 0; i < p.count; i++) total += p.steps[i].ms;
    busyUntil = now + total;
    motors(cur[0].left, cur[0].right);
    return;
  }
}

void hapticsUpdate(uint32_t now) {
  if (!cur) return;
  if (now - stepStart < cur[curIndex].ms) return;
  curIndex++;
  if (curIndex >= curCount) { cur = nullptr; motors(false, false); return; }
  stepStart = now;
  motors(cur[curIndex].left, cur[curIndex].right);
}

bool hapticsBusy(uint32_t now) { return cur != nullptr && now < busyUntil; }

bool hapticsLeft() { return mL; }
bool hapticsRight() { return mR; }
char hapticsLastCode() { return lastCode; }
uint32_t hapticsLastAt() { return lastAt; }

void hapticsStop() { cur = nullptr; busyUntil = 0; motors(false, false); }
