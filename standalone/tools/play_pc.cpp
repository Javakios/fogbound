// Plays the standalone game on the PC at full speed, using the SAME game core and
// renderer as the ESP32 firmware (src/game.cpp, src/render.cpp, src/haptics.cpp).
// Keyboard stands in for the controller; the two motor icons show the vibration.
//   W/S or Up/Down  = forward/back     A/D or Left/Right = turn
//   Space = repeat hint (joystick SW)   M = Visual/Haptic (BTN1)
//   R = restart (BTN2)                  1/2/3 = difficulty     Esc = quit
//   T = switch the ESP32 model (frame pacing like the real board) on/off. Default: ON.
// Build: see standalone/README.md  (g++ ... -mwindows -lgdi32)
#include <windows.h>
#include <mmsystem.h>
#include <stdio.h>
#include <string.h>
#include "../src/config.h"
#include "../src/game.h"
#include "../src/haptics.h"
#include "../src/render.h"

static uint16_t fb[FB_W * FB_H];
static uint32_t pixels[FB_W * FB_H];
static Game game;
static bool quit = false;

static uint32_t millisNow() { return (uint32_t)GetTickCount64(); }
static void setMotors(bool, bool) {}
static void onHaptic(char code, uint32_t now) { if (!code) hapticsStop(); else hapticsPlay(code, now); }

static LRESULT CALLBACK wndProc(HWND h, UINT m, WPARAM w, LPARAM l) {
  if (m == WM_DESTROY || (m == WM_KEYDOWN && w == VK_ESCAPE)) { quit = true; PostQuitMessage(0); return 0; }
  return DefWindowProc(h, m, w, l);
}

static bool down(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }
static char readDir() {
  if (down('W') || down(VK_UP)) return 'U';
  if (down('S') || down(VK_DOWN)) return 'D';
  if (down('A') || down(VK_LEFT)) return 'L';
  if (down('D') || down(VK_RIGHT)) return 'R';
  return 0;
}

static char lastDir = 0; static uint32_t repeatAt = 0;
static bool pT = false;
static bool pSpace = false, pM = false, pR = false, p1 = false, p2 = false, p3 = false;

static void updateInput(uint32_t now) {
  const char dir = readDir();
  const bool turn = dir == 'L' || dir == 'R';
  if (dir && dir != lastDir) { game.move(dir, now); repeatAt = now + (turn ? 480 : 330); }
  else if (dir && now >= repeatAt) { game.move(dir, now); repeatAt = now + (turn ? 380 : 210); }
  lastDir = dir;
  const bool sp = down(VK_SPACE), mm = down('M'), rr = down('R'), k1 = down('1'), k2 = down('2'), k3 = down('3');
  if (sp && !pSpace) game.hint(now);
  if (mm && !pM) game.setMode(!game.hapticMode);
  if (rr && !pR) game.reset(now);
  if (k1 && !p1) game.newMaze(game.seed, game.cells, 0, now);
  if (k2 && !p2) game.newMaze(game.seed, game.cells, 1, now);
  if (k3 && !p3) game.newMaze(game.seed, game.cells, 2, now);
  pSpace = sp; pM = mm; pR = rr; p1 = k1; p2 = k2; p3 = k3;
}

static void frame(uint32_t now) {
  hapticsUpdate(now);
  game.tick(now);
  game.updateCamera(now);
  const HapticView hv = {hapticsLeft(), hapticsRight(), hapticsLastCode(), hapticsLastAt()};
  renderFrame(game, now, fb, hv);
}

int main(int argc, char** argv) {
  renderInit();
  hapticsInit(setMotors);
  game.hooks.haptic = onHaptic;
  game.hooks.hapticBusy = hapticsBusy;
  game.hooks.log = [](const char* l) { printf("%s\n", l); };
  game.visibility = GAME_VISIBILITY;
  game.newMaze(GAME_SEED, GAME_CELLS, GAME_DIFFICULTY, millisNow());

  if (argc > 1 && !strcmp(argv[1], "--selftest")) {          // no window: just measure speed
    const uint32_t t0 = millisNow(); uint32_t n = 0, now = t0;
    while (millisNow() - t0 < 2000) { now = millisNow(); frame(now); n++; }
    printf("selftest: %u frames in 2 s = %.0f fps (full-quality 160x120)\n", n, n / 2.0);
    return 0;
  }

  if (argc > 1 && !strcmp(argv[1], "--model-report")) {      // headless: 60 s of auto-play with the ESP32 cost model
    double renderMs = 4.0, spiMhz = 40.0;
    for (int i = 2; i < argc; i++) {
      if (!strncmp(argv[i], "--render-ms=", 12)) renderMs = atof(argv[i] + 12);
      else if (!strncmp(argv[i], "--spi-mhz=", 10)) spiMhz = atof(argv[i] + 10);
    }
    static uint16_t prev[FB_W * FB_H]; bool havePrev = false;
    double vnow = 1000, lastDraw = 0, nextMove = 1500, movingTime = 0, worst = 0, idleTime = 0;
    int movingFrames = 0, idleFrames = 0;
    game.newMaze(GAME_SEED, GAME_CELLS, 1, (uint32_t)vnow);
    while (vnow < 61000) {
      const uint32_t now = (uint32_t)vnow;
      if (vnow >= nextMove && !game.won) {                    // the player follows the hints: one step every 300 ms
        game.hint(now);
        const char h = hapticsLastCode();
        if (h == 'L' || h == 'R' || h == 'U' || h == 'D') game.move(h, now);
        game.shade.pausedUntil = now + 100000;
        nextMove = vnow + 300;
      }
      frame(now);
      const bool settled = game.settled(now);
      if (settled && vnow - lastDraw < 100) { vnow += 2; continue; }
      lastDraw = vnow;
      int rows = 0;
      for (int y = 0; y < FB_H; y++) if (!havePrev || memcmp(fb + y * FB_W, prev + y * FB_W, FB_W * 2)) rows++;
      memcpy(prev, fb, sizeof(fb)); havePrev = true;
      const double spiMs = (double)rows * PRESENT_SCALE * (FB_W * PRESENT_SCALE) * 2 * 8.0 / (spiMhz * 1e6) * 1000.0 * 1.25;
      const double cost = renderMs + spiMs;
      if (settled) { idleTime += cost; idleFrames++; } else { movingTime += cost; movingFrames++; if (cost > worst) worst = cost; }
      vnow += cost;
    }
    printf("render %.0f ms, SPI %.0f MHz: moving %.1f fps (avg frame %.0f ms, worst %.0f ms, %d frames), idle frames %d\n",
           renderMs, spiMhz, movingFrames ? movingFrames * 1000.0 / movingTime : 0.0, movingFrames ? movingTime / movingFrames : 0.0,
           worst, movingFrames, idleFrames);
    return 0;
  }

  HINSTANCE hi = GetModuleHandle(nullptr);
  WNDCLASS wc = {}; wc.lpfnWndProc = wndProc; wc.hInstance = hi; wc.lpszClassName = "fogbound"; wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
  RegisterClass(&wc);
  RECT r = {0, 0, 960, 720}; AdjustWindowRect(&r, WS_OVERLAPPEDWINDOW & ~WS_THICKFRAME & ~WS_MAXIMIZEBOX, FALSE);
  HWND hwnd = CreateWindow("fogbound", "Fogbound - standalone (PC preview of the ESP32 build)", WS_OVERLAPPEDWINDOW & ~WS_THICKFRAME & ~WS_MAXIMIZEBOX,
                           CW_USEDEFAULT, CW_USEDEFAULT, r.right - r.left, r.bottom - r.top, nullptr, nullptr, hi, nullptr);
  ShowWindow(hwnd, SW_SHOW);
  BITMAPINFO bi = {}; bi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER); bi.bmiHeader.biWidth = FB_W; bi.bmiHeader.biHeight = -FB_H;
  bi.bmiHeader.biPlanes = 1; bi.bmiHeader.biBitCount = 32; bi.bmiHeader.biCompression = BI_RGB;

  // ---- ESP32 model: paces the frame rate like the real board would.
  // cost = render time + time to push the CHANGED rows over SPI (same row-diff as main.cpp).
  // The numbers are ESTIMATES (see README), tune them with --render-ms / --spi-mhz.
  static uint16_t prev[FB_W * FB_H]; bool havePrev = false;
  bool model = true; double renderMs = 4.0, spiMhz = 40.0;
  for (int i = 1; i < argc; i++) {
    if (!strncmp(argv[i], "--render-ms=", 12)) renderMs = atof(argv[i] + 12);
    else if (!strncmp(argv[i], "--spi-mhz=", 10)) spiMhz = atof(argv[i] + 10);
    else if (!strcmp(argv[i], "--no-model")) model = false;
  }
  timeBeginPeriod(1);
  LARGE_INTEGER qf, qa; QueryPerformanceFrequency(&qf);
  auto nowMs = [&]() { QueryPerformanceCounter(&qa); return 1000.0 * qa.QuadPart / qf.QuadPart; };
  double lastTitle = 0, lastDraw = 0, fpsAcc = 0; int fpsN = 0, costShown = 0;

  MSG msg;
  while (!quit) {
    const double t0 = nowMs();
    while (PeekMessage(&msg, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&msg); DispatchMessage(&msg); }
    const uint32_t now = millisNow();
    if (GetForegroundWindow() == hwnd) { if (down('T') && !pT) model = !model; pT = down('T'); updateInput(now); }
    frame(now);

    if (model && game.settled(now) && t0 - lastDraw < 100) { Sleep(2); continue; }   // like main.cpp: idle = ~10 redraws/s
    lastDraw = t0;

    int changedRows = 0;
    for (int y = 0; y < FB_H; y++) if (!havePrev || memcmp(fb + y * FB_W, prev + y * FB_W, FB_W * 2)) changedRows++;
    memcpy(prev, fb, sizeof(fb)); havePrev = true;
    const double spiBytes = (double)changedRows * PRESENT_SCALE * (FB_W * PRESENT_SCALE) * 2;
    const double spiMs = spiBytes * 8.0 / (spiMhz * 1e6) * 1000.0 * 1.25;            // x1.25: command/driver overhead (assumed)
    const double costMs = renderMs + spiMs;

    for (int i = 0; i < FB_W * FB_H; i++) {
      const uint16_t p = fb[i];
      pixels[i] = ((p & 0xF800) << 8) | ((p & 0x07E0) << 5) | ((p & 0x001F) << 3);
    }
    HDC dc = GetDC(hwnd);
    StretchDIBits(dc, 0, 0, 960, 720, 0, 0, FB_W, FB_H, pixels, &bi, DIB_RGB_COLORS, SRCCOPY);
    ReleaseDC(hwnd, dc);

    double used = nowMs() - t0;
    const double target = model ? costMs : 8.0;
    while (used < target) { const double rest = target - used; if (rest > 1.5) Sleep((DWORD)(rest - 1)); used = nowMs() - t0; }

    fpsAcc += 1000.0 / (nowMs() - t0); fpsN++; costShown = (int)costMs;
    if (nowMs() - lastTitle > 500) {
      char t[200];
      snprintf(t, sizeof t, "Fogbound standalone | %s | %.0f fps | modelled cost: render %.0f ms + SPI %.0f ms (T = toggle model)",
               model ? "ESP32 MODEL" : "PC full speed", fpsAcc / (fpsN ? fpsN : 1), renderMs, (double)(costShown - renderMs));
      SetWindowText(hwnd, t); fpsAcc = 0; fpsN = 0; lastTitle = nowMs();
    }
  }
  return 0;
}
