# Graph Report - fogbound  (2026-11-22)

## Corpus Check
- Corpus is ~17,676 words - fits in a single context window. You may not need a graph.

## Summary
- 185 nodes · 273 edges · 16 communities (9 shown, 7 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Docs & Web UI
- Game Logic
- Raycaster Renderer
- Main Controller
- Circuit Diagram Builder
- Haptics Engine
- ESP32 Serial Link
- Circuit Panel
- ESP32 Hardware Schematic
- Brazier Screenshot
- Portal Screenshot
- Rune Screenshot
- Shade Screenshot
- Oscilloscope
- Navigation (BFS)
- Maze Generation

## God Nodes (most connected - your core abstractions)
1. `Game` - 24 edges
2. `buildSVG()` - 12 edges
3. `ESP32Link` - 12 edges
4. `Raycaster` - 11 edges
5. `Circuit` - 10 edges
6. `HapticEngine` - 8 edges
7. `driver()` - 7 edges
8. `Fogbound project` - 7 edges
9. `ESP32 DevKit V1 (WROOM-32)` - 7 edges
10. `Haptic vocabulary (L R U D W K E X G)` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Threat channel (Greek)` --semantically_similar_to--> `Threat haptic channel (Shade proximity purr)`  [INFERRED] [semantically similar]
  docs/README.el.md → README.md
- `Serial protocol (Greek)` --semantically_similar_to--> `Serial protocol (H:, S:, J:)`  [INFERRED] [semantically similar]
  docs/README.el.md → README.md
- `Greek haptic vocabulary` --semantically_similar_to--> `Haptic vocabulary (L R U D W K E X G)`  [INFERRED] [semantically similar]
  docs/README.el.md → README.md
- `Joystick calibration panel` --semantically_similar_to--> `Joystick calibration`  [INFERRED] [semantically similar]
  index.html → docs/README.el.md
- `Difficulty levels (Easy/Normal/Hard)` --conceptually_related_to--> `The Shade enemy`  [INFERRED]
  docs/README.el.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Haptic vocabulary documented and implemented** — readme_haptic_vocabulary, js_haptics, readme_firmware, docs_readme_el_haptic_vocabulary [EXTRACTED 0.90]
- **Brazier screenshot view, minimap and HUD** — docs_img_brazier_first_person_corridor, docs_img_brazier_minimap, docs_img_brazier_hud_poynoi [INFERRED 0.75]
- **Haptic Maze ESP32 peripherals** — docs_img_circuit_ky023_joystick, docs_img_circuit_ssd1306_oled, docs_img_circuit_buttons, docs_img_circuit_haptic_motors, docs_img_circuit_leds [EXTRACTED 0.95]

## Communities (16 total, 7 thin omitted)

### Community 0 - "Docs & Web UI"
Cohesion: 0.08
Nodes (34): Difficulty levels (Easy/Normal/Hard), Fogbound Greek guide, Greek haptic vocabulary, Joystick calibration, Relative-to-facing hints, Serial protocol (Greek), Threat channel (Greek), Wiring table (+26 more)

### Community 2 - "Raycaster Renderer"
Cohesion: 0.17
Nodes (7): brazierFrame(), makeGrain(), makePortal(), makeSprite(), makeTexture(), Raycaster, vnoise()

### Community 3 - "Main Controller"
Cohesion: 0.21
Nodes (10): addResult(), computeInputs(), frame(), readDir(), renderLog(), setMode(), setStatus(), updateController() (+2 more)

### Community 4 - "Circuit Diagram Builder"
Cohesion: 0.35
Nodes (13): buildSVG(), driver(), esp32(), gnd(), joystick(), ledRow(), legend(), motor() (+5 more)

### Community 8 - "ESP32 Hardware Schematic"
Cohesion: 0.25
Nodes (8): Haptic Maze circuit schematic (ESP32), BTN1 Mode and BTN2 Restart buttons (INPUT_PULLUP), ESP32 DevKit V1 (WROOM-32), Vibration motors M1 (left) and M2 (right) driven by PN2222 transistors with flyback diodes, KY-023 joystick (VRx, VRy, SW), LED1 Link and LED2 Haptic Mode indicators, SSD1306 128x64 I2C OLED display (0x3C), USB to PC Web Serial 115200

### Community 9 - "Brazier Screenshot"
Cohesion: 0.33
Nodes (6): Lit brazier torch at corridor end, First-person brick dungeon corridor view, Hanging chains on back wall, HUD label POYNOI with diamond icon, Top-right maze minimap with player marker, Fogbound brazier corridor screenshot

### Community 10 - "Portal Screenshot"
Cohesion: 0.50
Nodes (5): First-person pixelated 3D raycast corridor view with CRT scanline look, Glowing green ring portal at corridor end, Top-right maze minimap with player and goal markers, POYNOI HUD label with diamond icon (bottom-left), Fogbound portal screenshot

### Community 11 - "Rune Screenshot"
Cohesion: 0.50
Nodes (4): Top-right maze minimap with player and goal markers, POYNOI rune counter HUD (bottom-left), Glowing blue rune crystal at corridor end, Fogbound rune screenshot (first-person dungeon corridor with minimap)

### Community 12 - "Shade Screenshot"
Cohesion: 0.50
Nodes (4): First-person pixelated brick corridor with ceiling light, POYNOI HUD label with diamond icon, Shade: hooded dark figure with glowing red eyes, Shade game screenshot (hooded figure in corridor)

## Knowledge Gaps
- **22 isolated node(s):** `BFS shortest-path navigation hints`, `Runes and exit portal`, `Raycaster renderer (320x240)`, `Seeded maze (recursive backtracker)`, `Stereo buzz audio simulation` (+17 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 53 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Haptic vocabulary (L R U D W K E X G)` connect `Docs & Web UI` to `Haptics Engine`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **What connects `BFS shortest-path navigation hints`, `Runes and exit portal`, `Raycaster renderer (320x240)` to the rest of the system?**
  _22 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Docs & Web UI` be split into smaller, more focused modules?**
  _Cohesion score 0.0784313725490196 - nodes in this community are weakly interconnected._