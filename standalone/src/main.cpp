/*
  Fogbound — standalone ESP32 build
  ---------------------------------
  Everything runs on the ESP32: no PC, no browser.
  Display:  2.8" ILI9341 SPI TFT, 320x240 (scene rendered at 160x120, doubled)
  Input:    KY-023 analog joystick + 2 buttons
  Haptics:  2 coin vibration motors (via NPN transistors)

  Controls
    joystick up / down     step forward / back
    joystick left / right  turn 90 degrees
    joystick press (SW)    repeat the haptic hint
    BTN1                   Visual <-> Haptic mode
    BTN2                   restart  (hold 1 s = next difficulty)
*/
#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>

#include "config.h"
#include "game.h"
#include "haptics.h"
#include "render.h"

Adafruit_ILI9341 tft(PIN_TFT_CS, PIN_TFT_DC, PIN_TFT_RST);
static uint16_t fb[FB_W * FB_H];
static uint16_t* prevFb = nullptr;   // heap: static DRAM on the ESP32 is too small for two frame buffers
static bool havePrev = false;
static uint16_t lineBuf[FB_W * PRESENT_SCALE];   // one output line
static Game game;

// ---------------------------------------------------------------- haptics glue
static void setMotors(bool left, bool right) {
  digitalWrite(PIN_MOTOR_L, left ? HIGH : LOW);
  digitalWrite(PIN_MOTOR_R, right ? HIGH : LOW);
}
static void onHaptic(char code, uint32_t now) {
  if (code == 0) { hapticsStop(); return; }
  hapticsPlay(code, now);
  Serial.printf("[haptic] %c\n", code);
}
static void onLog(const char* line) { Serial.println(line); }

// ---------------------------------------------------------------- display
// Only the rows that changed since the last frame are sent over SPI. When the
// player stands still almost nothing changes, so this is much faster.
static bool rowSame(int y) { return havePrev && prevFb && memcmp(fb + y * FB_W, prevFb + y * FB_W, FB_W * 2) == 0; }

static void present() {
  const int S = PRESENT_SCALE, outW = FB_W * S;
  const int ox = (320 - outW) / 2, oy = (240 - FB_H * S) / 2;
  tft.startWrite();
  int y = 0;
  while (y < FB_H) {
    if (rowSame(y)) { y++; continue; }
    const int y0 = y;
    while (y < FB_H && !rowSame(y)) y++;
    tft.setAddrWindow(ox, oy + y0 * S, outW, (y - y0) * S);
    for (int r = y0; r < y; r++) {
      const uint16_t* src = fb + r * FB_W;
      for (int x = 0; x < FB_W; x++) for (int s = 0; s < S; s++) lineBuf[x * S + s] = src[x];
      for (int s = 0; s < S; s++) tft.writePixels(lineBuf, outW, true, false);
    }
  }
  tft.endWrite();
  if (prevFb) { memcpy(prevFb, fb, sizeof(fb)); havePrev = true; }
}

// ---------------------------------------------------------------- input
struct Btn { uint8_t pin; bool state = false, prev = false; uint32_t changedAt = 0, pressedAt = 0; };
static Btn bSw{PIN_SW}, b1{PIN_BTN1}, b2{PIN_BTN2};

static void readBtn(Btn& b, uint32_t now) {
  b.prev = b.state;
  const bool raw = digitalRead(b.pin) == LOW;     // pressed = LOW (INPUT_PULLUP)
  if (raw != b.state && now - b.changedAt > 25) { b.state = raw; b.changedAt = now; if (raw) b.pressedAt = now; }
}

static char readDir() {
  float dx = (analogRead(PIN_VRX) - 2048) / 2048.0f;
  float dy = (analogRead(PIN_VRY) - 2048) / 2048.0f;
  if (JOY_INVERT_X) dx = -dx;
  if (JOY_INVERT_Y) dy = -dy;
  const float ax = fabsf(dx), ay = fabsf(dy);
  if (fmaxf(ax, ay) < 0.45f) return 0;
  return ax > ay ? (dx < 0 ? 'L' : 'R') : (dy < 0 ? 'U' : 'D');
}

static char lastDir = 0;
static uint32_t repeatAt = 0;

static void updateInput(uint32_t now) {
  readBtn(bSw, now); readBtn(b1, now); readBtn(b2, now);

  const char dir = readDir();
  const bool turn = dir == 'L' || dir == 'R';
  if (dir && dir != lastDir) { game.move(dir, now); repeatAt = now + (turn ? 480 : 330); }
  else if (dir && now >= repeatAt) { game.move(dir, now); repeatAt = now + (turn ? 380 : 210); }
  lastDir = dir;

  if (bSw.state && !bSw.prev) game.hint(now);
  if (b1.state && !b1.prev) { game.setMode(!game.hapticMode); Serial.println(game.hapticMode ? "[mode] haptic" : "[mode] visual"); }
  if (!b2.state && b2.prev) {                      // act on release: short = restart, long = difficulty
    if (now - b2.pressedAt > 1000) {
      game.newMaze(game.seed, game.cells, (game.difficulty + 1) % 3, now);
      Serial.printf("[difficulty] %s\n", DIFFICULTY[game.difficulty].label);
    } else {
      game.reset(now);
    }
  }
}

// ---------------------------------------------------------------- setup / loop
// Boot benchmark: tells how fast this CPU (or the simulator) really is.
// Reference for a real ESP32 @240 MHz: roughly 4-10 ms per line below.
static void benchmark() {
  volatile int32_t si = 0; volatile float sf = 1.0f; volatile float sg = 0.0f;
  uint32_t t = micros();
  for (int i = 0; i < 1000000; i++) si = si + i;
  const uint32_t ti = micros() - t;
  t = micros();
  for (int i = 0; i < 1000000; i++) sf = sf * 1.0000001f + 0.5f;
  const uint32_t tf = micros() - t;
  t = micros();
  for (int i = 0; i < 100000; i++) sg = sg + floorf(sf * 0.001f + i);
  const uint32_t tfl = micros() - t;
  Serial.printf("[bench] 1M int adds: %lu us | 1M float mul+add: %lu us | 100k floorf: %lu us | CPU %d MHz\n",
                (unsigned long)ti, (unsigned long)tf, (unsigned long)tfl, (int)getCpuFrequencyMhz());
}

void setup() {
  Serial.begin(115200);
  benchmark();
  pinMode(PIN_MOTOR_L, OUTPUT);
  pinMode(PIN_MOTOR_R, OUTPUT);
  pinMode(PIN_LED_MODE, OUTPUT);
  pinMode(PIN_SW, INPUT_PULLUP);
  pinMode(PIN_BTN1, INPUT_PULLUP);
  pinMode(PIN_BTN2, INPUT_PULLUP);
  analogReadResolution(12);
  hapticsInit(setMotors);

  tft.begin(40000000);
  tft.setRotation(1);                              // landscape 320x240
  tft.fillScreen(ILI9341_BLACK);
  tft.setTextColor(ILI9341_WHITE);
  tft.setTextSize(3);
  tft.setCursor(86, 100);
  tft.print("FOGBOUND");

  // power-on self test: left motor, then right motor
  setMotors(true, false);  delay(150);
  setMotors(false, false); delay(120);
  setMotors(false, true);  delay(150);
  setMotors(false, false);

  prevFb = (uint16_t*)malloc(sizeof(fb));
  renderClock = micros;
  renderInit();
  game.hooks.haptic = onHaptic;
  game.hooks.hapticBusy = hapticsBusy;
  game.hooks.log = onLog;
  game.visibility = GAME_VISIBILITY;
  game.newMaze(GAME_SEED, GAME_CELLS, GAME_DIFFICULTY, millis());
  Serial.printf("Fogbound ready: maze %dx%d, %d runes, optimal %d steps\n",
                game.maze.size, game.maze.size, game.runesTotal(), game.optimalTotal);
}

void loop() {
  const uint32_t now = millis();
  hapticsUpdate(now);
  updateInput(now);
  game.tick(now);
  game.updateCamera(now);
  digitalWrite(PIN_LED_MODE, game.hapticMode ? HIGH : LOW);

  // Standing still: redraw only ~10x per second. Moving: as fast as possible.
  static uint32_t lastDraw = 0;
  if (game.settled(now) && now - lastDraw < 100) { delay(2); return; }
  lastDraw = now;

  const HapticView hv = {hapticsLeft(), hapticsRight(), hapticsLastCode(), hapticsLastAt()};
  const uint32_t t0 = micros();
  renderFrame(game, now, fb, hv);
  const uint32_t t1 = micros();
  present();
  const uint32_t t2 = micros();

  static uint32_t frames = 0, lastReport = 0, renderUs = 0, presentUs = 0;
  frames++; renderUs += t1 - t0; presentUs += t2 - t1;
  if (now - lastReport >= 2000) {
    Serial.printf("[perf] %.1f fps  render %lu us  present %lu us | walls %lu floor %lu cols %lu sprites %lu fx %lu hud %lu\n",
                  frames * 1000.0f / (now - lastReport),
                  (unsigned long)(renderUs / frames), (unsigned long)(presentUs / frames),
                  (unsigned long)(renderProf[0] / frames), (unsigned long)(renderProf[1] / frames), (unsigned long)(renderProf[2] / frames),
                  (unsigned long)(renderProf[3] / frames), (unsigned long)(renderProf[4] / frames), (unsigned long)(renderProf[5] / frames));
    frames = renderUs = presentUs = 0; lastReport = now;
    for (int i = 0; i < 8; i++) renderProf[i] = 0;
  }
}
