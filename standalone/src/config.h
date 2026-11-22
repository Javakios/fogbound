#pragma once
// ---------------- Pins (ESP32 DevKit V1, 30 pins) ----------------
// ILI9341 TFT on the default VSPI bus
#define PIN_TFT_CS    5
#define PIN_TFT_DC    21
#define PIN_TFT_RST   22
// MOSI = 23, SCK = 18, MISO = 19 (hardware VSPI, not remappable here)

#define PIN_VRX       34   // joystick X (ADC, input only)
#define PIN_VRY       35   // joystick Y (ADC, input only)
#define PIN_SW        32   // joystick button -> GND
#define PIN_BTN1      27   // mode button     -> GND
#define PIN_BTN2      14   // restart button  -> GND (hold = next difficulty)
#define PIN_MOTOR_L   25   // 1k -> base of NPN (left motor)
#define PIN_MOTOR_R   26   // 1k -> base of NPN (right motor)
#define PIN_LED_MODE  4    // LED + 220R: lit in Haptic mode (LED2 of the schematic)

// Flip if "forward" feels like "back" on your joystick module.
#define JOY_INVERT_X  0
#define JOY_INVERT_Y  0

// ---------------- Rendering ----------------
// Real board: the scene is rendered at 160x120 and doubled to the 320x240 panel.
// Simulator (-DSIM_PROFILE): the Wokwi CPU is ~80x slower than a real ESP32, so
// the scene is rendered at 80x60 and tripled (240x180 window) to stay playable.
#ifdef SIM_PROFILE
constexpr int FB_W = 80;
constexpr int FB_H = 60;
constexpr int PRESENT_SCALE = 3;
#else
constexpr int FB_W = 160;
constexpr int FB_H = 120;
constexpr int PRESENT_SCALE = 2;
#endif

// ---------------- Game ----------------
#define GAME_SEED        7
#define GAME_CELLS       15
#define GAME_DIFFICULTY  1     // 0 easy, 1 normal, 2 hard
#define GAME_VISIBILITY  1     // haptic-mode fog: 0 blind, 1 thick, 2 medium
