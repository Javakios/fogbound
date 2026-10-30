/*
  Haptic Maze Controller — ESP32 firmware
  ----------------------------------------
  Board:     ESP32 Dev Module (ESP32 DevKit V1, 30 pins)
  Libraries: Adafruit SSD1306, Adafruit GFX (Library Manager)

  Protocol (115200 baud, one command per line):
    PC  -> ESP32   H:<code>                              play pattern L R U D W G K E X
    PC  -> ESP32   S:<mode>,<moves>,<secs>,<last>,<won>  status for OLED + LEDs
    ESP32 -> PC    J:<x>,<y>,<sw>,<btn1>,<btn2>          ~30 times per second

  The haptic patterns are identical to js/haptics.js in the web app.
  Everything is non-blocking (millis), so reading the joystick never stops
  while a motor is vibrating.
*/

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ---------- Pins (same as the virtual circuit) ----------
const int PIN_VRX = 34;      // joystick X  (ADC, input only)
const int PIN_VRY = 35;      // joystick Y  (ADC, input only)
const int PIN_SW = 32;       // joystick button -> GND
const int PIN_BTN1 = 25;     // mode button     -> GND
const int PIN_BTN2 = 26;     // restart button  -> GND
const int PIN_MOTOR_L = 18;  // 1k -> base of Q1
const int PIN_MOTOR_R = 19;  // 1k -> base of Q2
const int PIN_LED1 = 16;     // link LED   (220R)
const int PIN_LED2 = 17;     // haptic LED (220R)
// OLED: SDA = 21, SCL = 22

const unsigned long TELEMETRY_MS = 33;
const unsigned long LINK_TIMEOUT_MS = 2500;

Adafruit_SSD1306 display(128, 64, &Wire, -1);
bool oledOk = false;

// ---------- Haptic patterns: {left, right, duration ms} ----------
struct Step { uint8_t left; uint8_t right; uint16_t ms; };

const Step P_LEFT[]  = {{1, 0, 170}};
const Step P_RIGHT[] = {{0, 1, 170}};
const Step P_UP[]    = {{1, 1, 90}};
const Step P_DOWN[]  = {{1, 1, 80}, {0, 0, 110}, {1, 1, 80}};
const Step P_WALL[]  = {{1, 1, 450}};
const Step P_GOAL[]  = {{1, 0, 110}, {0, 0, 50}, {0, 1, 110}, {0, 0, 50},
                        {1, 0, 110}, {0, 0, 50}, {0, 1, 110}, {0, 0, 90}, {1, 1, 420}};
const Step P_RUNE[]   = {{1, 0, 70}, {0, 1, 70}, {1, 1, 140}};
const Step P_DANGER[] = {{1, 1, 30}, {0, 0, 30}, {1, 1, 30}, {0, 0, 30}, {1, 1, 30}, {0, 0, 30}, {1, 1, 30}};
const Step P_CAUGHT[] = {{1, 1, 250}, {0, 0, 90}, {1, 1, 250}, {0, 0, 90}, {1, 1, 650}};

struct Pattern { char code; const Step* steps; uint8_t count; };
#define LEN(a) (sizeof(a) / sizeof(a[0]))
const Pattern PATTERNS[] = {
  {'L', P_LEFT, LEN(P_LEFT)}, {'R', P_RIGHT, LEN(P_RIGHT)},
  {'U', P_UP, LEN(P_UP)},     {'D', P_DOWN, LEN(P_DOWN)},
  {'W', P_WALL, LEN(P_WALL)}, {'G', P_GOAL, LEN(P_GOAL)},
  {'K', P_RUNE, LEN(P_RUNE)}, {'E', P_DANGER, LEN(P_DANGER)},
  {'X', P_CAUGHT, LEN(P_CAUGHT)},
};

const Step* curSteps = nullptr;
uint8_t curCount = 0, curIndex = 0;
unsigned long stepStart = 0;

// ---------- Game status received from the PC ----------
char gMode = 'V', gLast = '-';
int gMoves = 0, gSecs = 0;
bool gWon = false;
unsigned long lastHostMsg = 0;
bool oledDirty = true;
unsigned long lastOled = 0;

char lineBuf[64];
uint8_t lineLen = 0;

void setMotors(bool left, bool right) {
  digitalWrite(PIN_MOTOR_L, left ? HIGH : LOW);
  digitalWrite(PIN_MOTOR_R, right ? HIGH : LOW);
}

void playPattern(char code) {
  for (const Pattern& p : PATTERNS) {
    if (p.code != code) continue;
    curSteps = p.steps;
    curCount = p.count;
    curIndex = 0;
    stepStart = millis();
    setMotors(curSteps[0].left, curSteps[0].right);
    return;
  }
}

void updatePattern() {
  if (!curSteps) return;
  if (millis() - stepStart < curSteps[curIndex].ms) return;
  curIndex++;
  if (curIndex >= curCount) {
    curSteps = nullptr;
    setMotors(false, false);
    return;
  }
  stepStart = millis();
  setMotors(curSteps[curIndex].left, curSteps[curIndex].right);
}

const char* codeName(char c) {
  switch (c) {
    case 'L': return "LEFT";
    case 'R': return "RIGHT";
    case 'U': return "FORWARD";
    case 'D': return "BEHIND";
    case 'W': return "WALL";
    case 'G': return "GOAL";
    case 'K': return "RUNE";
    case 'E': return "DANGER";
    case 'X': return "CAUGHT";
    default:  return "-";
  }
}

void drawOled(bool linked) {
  if (!oledOk) return;
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.print("HAPTIC MAZE");
  display.setCursor(104, 0);
  display.print(linked ? "USB" : "---");
  display.drawFastHLine(0, 10, 128, SSD1306_WHITE);

  if (!linked) {
    display.setCursor(0, 16);
    display.print("Waiting for PC...");
    display.setCursor(0, 30);
    display.printf("X:%4d  Y:%4d", analogRead(PIN_VRX), analogRead(PIN_VRY));
    display.setCursor(0, 44);
    display.print("Joystick L/R = test");
  } else {
    display.setCursor(0, 16);
    display.print("MODE: ");
    display.print(gMode == 'H' ? "HAPTIC" : "VISUAL");
    display.setCursor(0, 28);
    display.printf("MOVES %-4d T %ds", gMoves, gSecs);
    display.setCursor(0, 40);
    display.print("VIB: ");
    display.print(codeName(gLast));
    if (gWon) {
      display.setCursor(0, 54);
      display.print("*** EXIT FOUND ***");
    }
  }
  display.display();
}

void handleLine(char* line) {
  lastHostMsg = millis();
  if (line[0] == 'H' && line[1] == ':') {
    playPattern(line[2]);
  } else if (line[0] == 'S' && line[1] == ':') {
    char mode, last;
    int moves, secs, won;
    if (sscanf(line + 2, "%c,%d,%d,%c,%d", &mode, &moves, &secs, &last, &won) == 5) {
      gMode = mode; gMoves = moves; gSecs = secs; gLast = last; gWon = won;
      oledDirty = true;
    }
  }
}

void readSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (lineLen) {
        lineBuf[lineLen] = 0;
        handleLine(lineBuf);
        lineLen = 0;
      }
    } else if (lineLen < sizeof(lineBuf) - 1) {
      lineBuf[lineLen++] = c;
    }
  }
}

// Without a PC: push the joystick left/right to test each motor on its own.
void standaloneTest(int x) {
  static unsigned long lastBuzz = 0;
  if (curSteps || millis() - lastBuzz < 400) return;
  if (x < 800) { playPattern('L'); lastBuzz = millis(); }
  else if (x > 3300) { playPattern('R'); lastBuzz = millis(); }
}

void setup() {
  pinMode(PIN_MOTOR_L, OUTPUT);
  pinMode(PIN_MOTOR_R, OUTPUT);
  setMotors(false, false);
  pinMode(PIN_LED1, OUTPUT);
  pinMode(PIN_LED2, OUTPUT);
  pinMode(PIN_SW, INPUT_PULLUP);
  pinMode(PIN_BTN1, INPUT_PULLUP);
  pinMode(PIN_BTN2, INPUT_PULLUP);
  analogReadResolution(12);  // 0..4095

  Serial.begin(115200);
  Wire.begin(21, 22);
  oledOk = display.begin(SSD1306_SWITCHCAPVCC, 0x3C);

  // Power-on self test: left, then right
  setMotors(true, false);  delay(150);
  setMotors(false, false); delay(120);
  setMotors(false, true);  delay(150);
  setMotors(false, false);
  drawOled(false);
}

void loop() {
  unsigned long now = millis();
  readSerial();
  updatePattern();

  bool linked = lastHostMsg && now - lastHostMsg < LINK_TIMEOUT_MS;
  digitalWrite(PIN_LED1, linked ? HIGH : LOW);
  digitalWrite(PIN_LED2, linked && gMode == 'H' ? HIGH : LOW);

  static unsigned long lastTx = 0;
  if (now - lastTx >= TELEMETRY_MS) {
    lastTx = now;
    int x = analogRead(PIN_VRX);
    int y = analogRead(PIN_VRY);
    // Buttons are active LOW (INPUT_PULLUP), so invert: 1 = pressed
    Serial.printf("J:%d,%d,%d,%d,%d\n", x, y,
                  !digitalRead(PIN_SW), !digitalRead(PIN_BTN1), !digitalRead(PIN_BTN2));
    if (!linked) standaloneTest(x);
  }

  static bool wasLinked = false;
  if (linked != wasLinked) { wasLinked = linked; oledDirty = true; }
  if ((oledDirty || !linked) && now - lastOled > 200) {
    drawOled(linked);
    oledDirty = false;
    lastOled = now;
  }
}
