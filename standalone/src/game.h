#pragma once
// Portable game core (no Arduino dependencies): maze, BFS guidance, runes,
// the Shade, haptic hints. A C++ port of js/maze.js, js/navigation.js, js/game.js.
#include <stdint.h>
#include <stddef.h>

constexpr int MAX_CELLS = 15;
constexpr int MAX_SIZE = MAX_CELLS * 2 + 1;
constexpr int MAX_TILES = MAX_SIZE * MAX_SIZE;
constexpr int MAX_RUNES = 3;

struct Pt { int x, y; };

// mulberry32, identical to the JS version so a seed gives the same maze.
struct Rng {
  uint32_t a;
  explicit Rng(uint32_t s = 1) : a(s) {}
  double next();
  int below(int n) { return (int)(next() * n); }
};

struct Maze {
  int size = 0, cells = 0;
  uint32_t seed = 0;
  uint8_t grid[MAX_TILES];
  Pt start{1, 1}, exit{1, 1};
  bool isWall(int x, int y) const {
    return x < 0 || y < 0 || x >= size || y >= size || grid[y * size + x] == 1;
  }
};

void generateMaze(Maze& m, int cells, uint32_t seed, double loopChance = 0.06);
void bfs(const Maze& m, Pt target, int16_t* dist);
int nextDir(const Maze& m, const int16_t* dist, Pt pos);   // 0..3 = N E S W, -1 = none

struct Difficulty { const char* label; int runes; int shadeStepMs; int shadeChase; };
extern const Difficulty DIFFICULTY[3];

struct Shade { int x, y, px, py; uint32_t movedAt, nextAt, pausedUntil; int lastDir; };

struct GameHooks {
  void (*haptic)(char code, uint32_t now) = nullptr;
  bool (*hapticBusy)(uint32_t now) = nullptr;
  void (*log)(const char* line) = nullptr;
};

class Game {
 public:
  GameHooks hooks;
  Maze maze;
  int cells = 15, difficulty = 1, visibility = 1;
  bool hapticMode = false;
  uint32_t seed = 1;

  Pt pos{1, 1};
  int facing = 1;
  float angle = 0;
  struct { float x, y, a; } cam{1.5f, 1.5f, 0};
  float bobPhase = 0, bobAmp = 0, camH = 0.5f;
  uint32_t lastFrame = 0;

  Pt runeSpots[MAX_RUNES]; int runeSpotCount = 0;
  Pt runes[MAX_RUNES];     int runeCount = 0;
  int runesGot = 0;
  Pt target{1, 1};
  int16_t dist[MAX_TILES], pdist[MAX_TILES];

  bool hasShade = false;
  Shade shade{};
  Pt shadeSpawn{1, 1};
  float dangerLevel = 0;
  uint32_t dangerNextAt = 0;

  int moves = 0, turns = 0, wrong = 0, collisions = 0, hints = 0, caught = 0;
  bool started = false, won = false;
  uint32_t startedAt = 0, endedAt = 0;
  int optimalTotal = 0;
  uint32_t hitAt = 0, pickupAt = 0, caughtAt = 0;
  bool hitValid = false, pickupValid = false, caughtValid = false;
  Pt hitVec{0, 0};

  char msg[28] = "";
  uint16_t msgColor = 0xFFFF;
  uint32_t msgAt = 0, msgDur = 0;

  void newMaze(uint32_t seed, int cells, int difficulty, uint32_t now);
  void reset(uint32_t now);
  void setMode(bool haptic);
  void move(char dir, uint32_t now);            // 'U' 'D' 'L' 'R'
  void hint(uint32_t now);
  void tick(uint32_t now);
  void updateCamera(uint32_t now);
  float elapsed(uint32_t now) const;
  bool settled(uint32_t now) const;   // camera at rest, nothing fast is animating
  void resultLine(char* buf, size_t n, uint32_t now) const;
  int runesTotal() const { return runeSpotCount; }

 private:
  Rng rng{1};
  void placePlayerAtStart();
  void retarget();
  int distAt(Pt p) const { return dist[p.y * maze.size + p.x]; }
  char relativeHint() const;
  void playHint(uint32_t now);
  bool checkCaught(uint32_t now);
  void stepShade(uint32_t now);
  void say(const char* text, uint16_t color, uint32_t dur, uint32_t now);
  void play(char code, uint32_t now) { if (hooks.haptic) hooks.haptic(code, now); }
};
