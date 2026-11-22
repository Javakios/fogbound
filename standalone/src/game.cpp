#include "game.h"
#include <math.h>
#include <string.h>
#include <stdio.h>

static const Pt FACING[4] = {{0, -1}, {1, 0}, {0, 1}, {-1, 0}};   // N E S W
static const char REL_CODE[4] = {'U', 'R', 'D', 'L'};
static const float QUARTER = 1.57079633f;
static const int DANGER_RANGE = 6;

const Difficulty DIFFICULTY[3] = {{"EASY", 0, 0, 0}, {"NORMAL", 1, 720, 6}, {"HARD", 3, 470, 10}};

double Rng::next() {
  a += 0x6d2b79f5u;
  uint32_t t = a;
  t = (t ^ (t >> 15)) * (t | 1u);
  t ^= t + (t ^ (t >> 7)) * (t | 61u);
  return (double)(t ^ (t >> 14)) / 4294967296.0;
}

// ------------------------------------------------------------------ maze
void generateMaze(Maze& m, int cells, uint32_t seed, double loopChance) {
  Rng rand(seed);
  const int size = cells * 2 + 1;
  m.size = size; m.cells = cells; m.seed = seed;
  memset(m.grid, 1, sizeof(m.grid));
  uint8_t visited[MAX_CELLS * MAX_CELLS];
  memset(visited, 0, sizeof(visited));
  static const int dirs[4][2] = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
  int stack[MAX_CELLS * MAX_CELLS][2];
  int sp = 0;
  stack[sp][0] = 0; stack[sp][1] = 0; sp++;
  visited[0] = 1;
  m.grid[1 * size + 1] = 0;
  while (sp) {
    const int cx = stack[sp - 1][0], cy = stack[sp - 1][1];
    int opt[4][4], n = 0;
    for (int d = 0; d < 4; d++) {
      const int nx = cx + dirs[d][0], ny = cy + dirs[d][1];
      if (nx >= 0 && ny >= 0 && nx < cells && ny < cells && !visited[ny * cells + nx]) {
        opt[n][0] = nx; opt[n][1] = ny; opt[n][2] = dirs[d][0]; opt[n][3] = dirs[d][1]; n++;
      }
    }
    if (!n) { sp--; continue; }
    const int* o = opt[rand.below(n)];
    visited[o[1] * cells + o[0]] = 1;
    m.grid[(cy * 2 + 1 + o[3]) * size + (cx * 2 + 1 + o[2])] = 0;
    m.grid[(o[1] * 2 + 1) * size + (o[0] * 2 + 1)] = 0;
    stack[sp][0] = o[0]; stack[sp][1] = o[1]; sp++;
  }
  // a few loops, so a wrong turn is a real choice
  for (int y = 1; y < size - 1; y++) {
    for (int x = 1; x < size - 1; x++) {
      if (m.grid[y * size + x] != 1) continue;
      const bool between = (x % 2 == 0 && y % 2 == 1) || (x % 2 == 1 && y % 2 == 0);
      if (between && rand.next() < loopChance) m.grid[y * size + x] = 0;
    }
  }
  m.start = {1, 1};
  m.exit = {size - 2, size - 2};
}

void bfs(const Maze& m, Pt target, int16_t* dist) {
  const int n = m.size;
  static int16_t queue[MAX_TILES];
  for (int i = 0; i < n * n; i++) dist[i] = -1;
  int head = 0, tail = 0;
  dist[target.y * n + target.x] = 0;
  queue[tail++] = target.y * n + target.x;
  while (head < tail) {
    const int cur = queue[head++];
    const int cx = cur % n, cy = cur / n;
    for (int k = 0; k < 4; k++) {
      const int nx = cx + FACING[k].x, ny = cy + FACING[k].y;
      if (m.isWall(nx, ny)) continue;
      const int ni = ny * n + nx;
      if (dist[ni] != -1) continue;
      dist[ni] = dist[cur] + 1;
      queue[tail++] = ni;
    }
  }
}

int nextDir(const Maze& m, const int16_t* dist, Pt pos) {
  static const int order[4] = {0, 2, 3, 1};   // U D L R, like the JS tie-break
  const int n = m.size;
  int best = -1, bestDist = dist[pos.y * n + pos.x];
  for (int i = 0; i < 4; i++) {
    const int k = order[i];
    const int nx = pos.x + FACING[k].x, ny = pos.y + FACING[k].y;
    if (m.isWall(nx, ny)) continue;
    const int d = dist[ny * n + nx];
    if (d >= 0 && d < bestDist) { best = k; bestDist = d; }
  }
  return best;
}

// ------------------------------------------------------------------ level
void Game::newMaze(uint32_t s, int c, int diff, uint32_t now) {
  seed = s; cells = c; difficulty = diff;
  generateMaze(maze, cells, seed);
  const int n = maze.size;
  static int16_t startDist[MAX_TILES], d2[MAX_TILES];
  bfs(maze, maze.start, startDist);
  const Difficulty& cfg = DIFFICULTY[difficulty];

  auto isStartOrExit = [&](int x, int y) {
    return (x == maze.start.x && y == maze.start.y) || (x == maze.exit.x && y == maze.exit.y);
  };
  auto openSides = [&](int x, int y) {
    int k = 0;
    for (int i = 0; i < 4; i++) if (!maze.isWall(x + FACING[i].x, y + FACING[i].y)) k++;
    return k;
  };

  static Pt cellsList[MAX_CELLS * MAX_CELLS], far[MAX_CELLS * MAX_CELLS], dead[MAX_CELLS * MAX_CELLS];
  int nc = 0, nd = 0;
  for (int y = 1; y < n; y += 2)
    for (int x = 1; x < n; x += 2)
      if (!isStartOrExit(x, y)) cellsList[nc++] = {x, y};
  Rng r(seed * 7 + 13);
  for (int i = 0; i < nc; i++) {
    const Pt c2 = cellsList[i];
    if (openSides(c2.x, c2.y) == 1 && startDist[c2.y * n + c2.x] >= 8) dead[nd++] = c2;
  }
  for (int i = nd - 1; i > 0; i--) { const int j = (int)(r.next() * (i + 1)); const Pt t = dead[i]; dead[i] = dead[j]; dead[j] = t; }
  // farthest-first (stable insertion sort, same order as JS)
  for (int i = 0; i < nc; i++) far[i] = cellsList[i];
  for (int i = 1; i < nc; i++) {
    const Pt cur = far[i];
    const int cd = startDist[cur.y * n + cur.x];
    int j = i - 1;
    while (j >= 0 && startDist[far[j].y * n + far[j].x] < cd) { far[j + 1] = far[j]; j--; }
    far[j + 1] = cur;
  }
  runeSpotCount = 0;
  for (int i = 0; i < nd && runeSpotCount < cfg.runes; i++) runeSpots[runeSpotCount++] = dead[i];
  auto isRune = [&](int x, int y) {
    for (int i = 0; i < runeSpotCount; i++) if (runeSpots[i].x == x && runeSpots[i].y == y) return true;
    return false;
  };
  for (int i = 0; i < nc && runeSpotCount < cfg.runes; i++)
    if (!isRune(far[i].x, far[i].y)) runeSpots[runeSpotCount++] = far[i];

  shadeSpawn = maze.exit;
  for (int i = 0; i < nc; i++) if (!isRune(far[i].x, far[i].y)) { shadeSpawn = far[i]; break; }

  // shortest tour: nearest rune each time, then the exit
  Pt p = maze.start, left[MAX_RUNES];
  int nl = runeSpotCount, total = 0;
  for (int i = 0; i < nl; i++) left[i] = runeSpots[i];
  while (nl) {
    bfs(maze, p, d2);
    int bi = 0;
    for (int i = 1; i < nl; i++) if (d2[left[i].y * n + left[i].x] < d2[left[bi].y * n + left[bi].x]) bi = i;
    total += d2[left[bi].y * n + left[bi].x];
    p = left[bi];
    left[bi] = left[--nl];
  }
  bfs(maze, p, d2);
  optimalTotal = total + d2[maze.exit.y * n + maze.exit.x];
  reset(now);
}

void Game::reset(uint32_t now) {
  const Difficulty& cfg = DIFFICULTY[difficulty];
  runeCount = runeSpotCount;
  for (int i = 0; i < runeCount; i++) runes[i] = runeSpots[i];
  runesGot = 0;
  placePlayerAtStart();
  retarget();
  bobPhase = bobAmp = 0;
  moves = turns = wrong = collisions = hints = caught = 0;
  started = won = false;
  startedAt = endedAt = 0;
  hitValid = pickupValid = caughtValid = false;
  dangerLevel = 0; dangerNextAt = 0;
  hasShade = cfg.shadeStepMs > 0;
  if (hasShade) shade = {shadeSpawn.x, shadeSpawn.y, shadeSpawn.x, shadeSpawn.y, 0, 0, 0, -1};
  rng = Rng(seed * 3 + now);
  msg[0] = 0;
  if (hooks.haptic) hooks.haptic('\0', now);   // '\0' = stop
  if (runeCount) say(runeCount == 1 ? "FIND THE RUNE" : "FIND THE RUNES", 0xCE7F, 2600, now);
}

void Game::placePlayerAtStart() {
  pos = maze.start;
  static const int pref[4] = {1, 2, 0, 3};
  facing = 1;
  for (int i = 0; i < 4; i++) {
    const int f = pref[i];
    if (!maze.isWall(maze.start.x + FACING[f].x, maze.start.y + FACING[f].y)) { facing = f; break; }
  }
  angle = (facing - 1) * QUARTER;
  cam = {pos.x + 0.5f, pos.y + 0.5f, angle};
  bfs(maze, pos, pdist);
}

void Game::retarget() {
  const int n = maze.size;
  target = maze.exit;
  if (runeCount) {
    target = runes[0];
    for (int i = 1; i < runeCount; i++)
      if (pdist[runes[i].y * n + runes[i].x] < pdist[target.y * n + target.x]) target = runes[i];
  }
  bfs(maze, target, dist);
}

void Game::setMode(bool haptic) { hapticMode = haptic; }

void Game::say(const char* text, uint16_t color, uint32_t dur, uint32_t now) {
  strncpy(msg, text, sizeof(msg) - 1); msg[sizeof(msg) - 1] = 0;
  msgColor = color; msgAt = now; msgDur = dur;
}

float Game::elapsed(uint32_t now) const {
  if (!started) return 0;
  return ((won ? endedAt : now) - startedAt) / 1000.0f;
}

// ------------------------------------------------------------------ input
void Game::move(char d, uint32_t now) {
  if (won) return;
  if (!started) { started = true; startedAt = now; }

  if (d == 'L' || d == 'R') {
    const int turn = d == 'R' ? 1 : -1;
    facing = (facing + turn + 4) % 4;
    angle += turn * QUARTER;
    turns++;
    playHint(now);
    return;
  }

  const Pt v = FACING[d == 'U' ? facing : (facing + 2) % 4];
  const int nx = pos.x + v.x, ny = pos.y + v.y;
  if (maze.isWall(nx, ny)) {
    collisions++;
    hitAt = now; hitValid = true; hitVec = v;
    play('W', now);
    return;
  }

  const int before = distAt(pos);
  pos = {nx, ny};
  moves++;
  if (distAt(pos) > before) wrong++;
  bfs(maze, pos, pdist);
  if (checkCaught(now)) return;

  for (int i = 0; i < runeCount; i++) {
    if (runes[i].x != nx || runes[i].y != ny) continue;
    runes[i] = runes[--runeCount];
    runesGot++;
    pickupAt = now; pickupValid = true;
    play('K', now);
    say(runeCount ? "RUNE FOUND" : "THE PORTAL OPENS", 0xA51F, 1600, now);
    retarget();
    return;
  }

  if (nx == maze.exit.x && ny == maze.exit.y) {
    if (!runeCount) {
      won = true; endedAt = now;
      play('G', now);
      if (hooks.log) { char b[120]; resultLine(b, sizeof(b), now); hooks.log(b); }
      return;
    }
    say("PORTAL IS SEALED", 0xFD34, 1600, now);
  }
  playHint(now);
}

char Game::relativeHint() const {
  const int a = nextDir(maze, dist, pos);
  return a < 0 ? 0 : REL_CODE[(a - facing + 4) % 4];
}

void Game::playHint(uint32_t now) {
  const char c = relativeHint();
  if (c) play(c, now);
}

void Game::hint(uint32_t now) {
  if (won) return;
  hints++;
  playHint(now);
}

// ------------------------------------------------------------------ the Shade
bool Game::checkCaught(uint32_t now) {
  if (!hasShade || shade.x != pos.x || shade.y != pos.y || now < shade.pausedUntil) return false;
  caught++;
  caughtAt = now; caughtValid = true;
  play('X', now);
  say("THE SHADE GOT YOU", 0xF986, 2000, now);
  placePlayerAtStart();
  retarget();
  shade.x = shade.px = shadeSpawn.x; shade.y = shade.py = shadeSpawn.y;
  shade.pausedUntil = now + 2500; shade.lastDir = -1;
  return true;
}

void Game::stepShade(uint32_t now) {
  const int n = maze.size;
  const int here = pdist[shade.y * n + shade.x];
  int open[4], no = 0;
  for (int i = 0; i < 4; i++) if (!maze.isWall(shade.x + FACING[i].x, shade.y + FACING[i].y)) open[no++] = i;
  int pick = -1;
  if (here >= 0 && here <= DIFFICULTY[difficulty].shadeChase) {
    for (int i = 0; i < no; i++) {
      const int k = open[i];
      if (pdist[(shade.y + FACING[k].y) * n + shade.x + FACING[k].x] < here) { pick = k; break; }
    }
  } else {
    int fwd[4], nf = 0;
    for (int i = 0; i < no; i++) if (open[i] != (shade.lastDir + 2) % 4) fwd[nf++] = open[i];
    if (nf) pick = fwd[rng.below(nf)];
    else if (no) pick = open[rng.below(no)];
  }
  if (pick < 0) return;
  shade.px = shade.x; shade.py = shade.y;
  shade.x += FACING[pick].x; shade.y += FACING[pick].y;
  shade.lastDir = pick;
  shade.movedAt = now;
  checkCaught(now);
}

void Game::tick(uint32_t now) {
  if (!hasShade || won || !started) { dangerLevel = 0; return; }
  if (now >= shade.nextAt && now >= shade.pausedUntil) {
    stepShade(now);
    shade.nextAt = now + DIFFICULTY[difficulty].shadeStepMs;
  }
  const int d = pdist[shade.y * maze.size + shade.x];
  dangerLevel = (d >= 0 && d <= DANGER_RANGE && now >= shade.pausedUntil) ? 1.0f - (float)d / (DANGER_RANGE + 1) : 0;
  const bool busy = hooks.hapticBusy && hooks.hapticBusy(now);
  if (dangerLevel > 0 && now >= dangerNextAt && (!busy || now - dangerNextAt > 500)) {
    play('E', now);
    dangerNextAt = now + 380 + d * 230;   // closer = faster heartbeat
  }
}

// ------------------------------------------------------------------ camera
void Game::updateCamera(uint32_t now) {
  const float dt = lastFrame ? fminf(100.0f, (float)(now - lastFrame)) : 16.0f;
  lastFrame = now;
  const float k = 1.0f - expf(-dt / 55.0f);
  const float tx = pos.x + 0.5f, ty = pos.y + 0.5f;
  const float moving = hypotf(tx - cam.x, ty - cam.y);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  cam.a += (angle - cam.a) * k;
  bobAmp += ((moving > 0.03f ? 1.0f : 0.0f) - bobAmp) * fminf(1.0f, dt / 120.0f);
  bobPhase += dt * 0.018f;
  camH = 0.5f + sinf(bobPhase) * 0.022f * bobAmp;
}

bool Game::settled(uint32_t now) const {
  if (fabsf(cam.x - (pos.x + 0.5f)) > 0.01f || fabsf(cam.y - (pos.y + 0.5f)) > 0.01f || fabsf(cam.a - angle) > 0.01f) return false;
  if (bobAmp > 0.02f || dangerLevel > 0) return false;
  if (hitValid && now - hitAt < 300) return false;
  if (pickupValid && now - pickupAt < 520) return false;
  if (caughtValid && now - caughtAt < 920) return false;
  if (won && now - endedAt < 920) return false;
  return true;
}

void Game::resultLine(char* buf, size_t n, uint32_t now) const {
  const float eff = moves ? fminf(1.0f, (float)optimalTotal / moves) : 0;
  snprintf(buf, n, "RESULT mode=%s diff=%s seed=%lu time=%.2f moves=%d wrong=%d walls=%d hints=%d caught=%d eff=%.2f",
           hapticMode ? "haptic" : "visual", DIFFICULTY[difficulty].label, (unsigned long)seed,
           elapsed(now), moves, wrong, collisions, hints, caught, eff);
}
