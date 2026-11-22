#pragma once
#include <stdint.h>
// Non-blocking haptic pattern player. Same vocabulary as js/haptics.js.
void hapticsInit(void (*setMotors)(bool left, bool right));
void hapticsPlay(char code, uint32_t now);
void hapticsUpdate(uint32_t now);
bool hapticsBusy(uint32_t now);
void hapticsStop();
bool hapticsLeft();
bool hapticsRight();
char hapticsLastCode();
uint32_t hapticsLastAt();
