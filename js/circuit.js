// Virtual circuit: an interactive schematic of the whole controller.
// Everything here mirrors the real wiring in README.md / firmware.ino.
window.HM = window.HM || {};
(function (HM) {
  const P = (a) => a.map((p) => p.join(',')).join(' ');

  function wire(net, type, points) {
    const p = P(points);
    return `<polyline class="wire t-${type}" data-net="${net}" points="${p}"/>` +
      `<polyline class="flow" data-net="${net}" points="${p}"/>`;
  }
  function gnd(x, y) {
    return `<g class="sym-gnd"><line x1="${x}" y1="${y}" x2="${x}" y2="${y + 10}"/>` +
      `<line x1="${x - 10}" y1="${y + 10}" x2="${x + 10}" y2="${y + 10}"/>` +
      `<line x1="${x - 6}" y1="${y + 14}" x2="${x + 6}" y2="${y + 14}"/>` +
      `<line x1="${x - 2}" y1="${y + 18}" x2="${x + 2}" y2="${y + 18}"/></g>`;
  }
  function vcc(x, y, labelRight) {
    const label = labelRight
      ? `<text x="${x + 13}" y="${y - 7}">3V3</text>`
      : `<text x="${x}" y="${y - 15}" text-anchor="middle">3V3</text>`;
    return `<g class="sym-vcc"><line x1="${x}" y1="${y}" x2="${x}" y2="${y - 10}"/>` +
      `<line x1="${x - 9}" y1="${y - 10}" x2="${x + 9}" y2="${y - 10}"/>${label}</g>`;
  }
  const dot = (x, y) => `<circle class="junction" cx="${x}" cy="${y}" r="3.2"/>`;
  function resistor(x, y, net, type, label) {
    const zz = [[x, y], [x + 6, y], [x + 10, y - 7], [x + 17, y + 7], [x + 24, y - 7], [x + 31, y + 7], [x + 38, y - 7], [x + 44, y], [x + 50, y]];
    return wire(net, type, zz) + `<text class="val" x="${x + 25}" y="${y - 12}" text-anchor="middle">${label}</text>`;
  }

  const LEFT_PINS = ['EN', 'VP', 'VN', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'D13', 'GND', 'VIN'];
  const RIGHT_PINS = ['D23', 'D22', 'TX0', 'RX0', 'D21', 'D19', 'D18', 'D5', 'TX2·17', 'RX2·16', 'D4', 'D2', 'D15', 'GND', '3V3'];
  const pinY = (i) => 120 + i * 25;

  function legend() {
    const items = [['analog', 'Αναλογικό'], ['din', 'Ψηφ. είσοδος'], ['out', 'Έξοδος GPIO'], ['i2c', 'I²C'], ['pwr', '3V3 / ρεύμα μοτέρ'], ['gnd', 'GND'], ['fly', 'Flyback']];
    let x = 20, s = '';
    for (const [type, label] of items) {
      s += `<line class="wire legend t-${type}" x1="${x}" y1="22" x2="${x + 18}" y2="22"/><text x="${x + 24}" y="26">${label}</text>`;
      x += 24 + label.length * 6.3 + 18;
    }
    return s;
  }

  function joystick() {
    let s = `<g id="joy" data-info="joystick"><rect class="module" x="40" y="100" width="190" height="180" rx="10"/>` +
      `<text class="mod-title" x="52" y="118">KY-023</text>` +
      `<circle class="joy-base" cx="125" cy="195" r="58"/>` +
      `<circle class="joy-ring" cx="125" cy="195" r="40"/>` +
      `<line class="joy-cross" x1="85" y1="195" x2="165" y2="195"/><line class="joy-cross" x1="125" y1="155" x2="125" y2="235"/>` +
      `<g id="joy-knob"><circle class="knob-outer" cx="125" cy="195" r="27"/><circle class="knob-inner" cx="125" cy="195" r="18"/></g>`;
    [['GND', 120], ['+5V', 150], ['VRx', 195], ['VRy', 220], ['SW', 245]].forEach(([name, y]) => {
      s += `<rect class="hdr" x="224" y="${y - 4}" width="8" height="8"/><text class="pin-lbl" x="219" y="${y + 3.5}" text-anchor="end">${name}</text>`;
    });
    return s + '</g>';
  }

  function pushButton(cx, cy, id, label) {
    return `<g class="pushbtn" id="${id}" data-info="${id}">` +
      `<line class="part-line" x1="${cx - 35}" y1="${cy}" x2="${cx - 22}" y2="${cy}"/>` +
      `<line class="part-line" x1="${cx + 22}" y1="${cy}" x2="${cx + 35}" y2="${cy}"/>` +
      `<rect class="btn-body" x="${cx - 22}" y="${cy - 22}" width="44" height="44" rx="6"/>` +
      `<circle class="btn-cap" cx="${cx}" cy="${cy}" r="13"/>` +
      `<text class="lbl-strong" x="${cx}" y="${cy + 38}" text-anchor="middle">${label}</text></g>`;
  }

  function esp32() {
    let s = `<g id="esp32" data-info="esp32"><rect class="pcb" x="400" y="70" width="160" height="440" rx="8"/>` +
      `<path class="antenna" d="M440 80 h10 v16 h10 v-16 h10 v16 h10 v-16 h10 v16 h10 v-16 h10 v16 h10"/>` +
      `<rect class="shield" x="440" y="104" width="80" height="96" rx="3"/>` +
      `<text class="chip-lbl" x="480" y="148" text-anchor="middle">ESP32</text>` +
      `<text class="chip-sub" x="480" y="163" text-anchor="middle">WROOM-32</text>` +
      `<text class="board-lbl" x="480" y="330" text-anchor="middle" transform="rotate(-90 480 330)">ESP32 DEVKIT V1</text>` +
      `<rect class="ic" x="462" y="408" width="36" height="28" rx="2"/><text class="chip-sub light" x="480" y="425" text-anchor="middle">CP2102</text>` +
      `<rect class="tact" x="414" y="484" width="16" height="12" rx="2"/><rect class="tact" x="530" y="484" width="16" height="12" rx="2"/>` +
      `<g data-info="usb"><rect class="usb" id="usb" x="458" y="504" width="44" height="22" rx="3"/></g>`;
    LEFT_PINS.forEach((name, i) => {
      s += `<circle class="pin" data-pin="L-${name}" cx="400" cy="${pinY(i)}" r="4.5"/>` +
        `<text class="pin-lbl" x="410" y="${pinY(i) + 3.5}">${name}</text>`;
    });
    RIGHT_PINS.forEach((name, i) => {
      s += `<circle class="pin" data-pin="R-${name}" cx="560" cy="${pinY(i)}" r="4.5"/>` +
        `<text class="pin-lbl" x="550" y="${pinY(i) + 3.5}" text-anchor="end">${name}</text>`;
    });
    return s + '</g>' +
      `<text class="val" x="480" y="544" text-anchor="middle">USB ⇄ PC · Web Serial 115200</text>`;
  }

  function oled() {
    let s = `<g id="oled" data-info="oled"><rect class="oled-pcb" x="690" y="50" width="260" height="150" rx="8"/>`;
    [['GND', 80], ['VCC', 105], ['SCL', 145], ['SDA', 170]].forEach(([name, y]) => {
      s += `<rect class="hdr" x="686" y="${y - 4}" width="8" height="8"/><text class="pin-lbl" x="699" y="${y + 3.5}">${name}</text>`;
    });
    s += `<rect class="oled-screen" x="728" y="64" width="212" height="118" rx="3"/>`;
    for (let i = 0; i < 5; i++) s += `<text class="oled-text" id="oled-${i}" x="738" y="${88 + i * 21}"></text>`;
    return s + `<text class="val" x="940" y="195" text-anchor="end">SSD1306 128×64 · I²C 0x3C</text></g>`;
  }

  function motor(x, y, side, n, title) {
    return `<g class="motor" id="motor-${side}" data-info="motor${n}">` +
      `<g class="motor-shake"><circle class="part motor-body" cx="${x}" cy="${y}" r="18"/>` +
      `<path class="rotor" style="transform-origin:${x}px ${y}px" d="M${x} ${y} L${x + 12} ${y} A12 12 0 0 1 ${x} ${y + 12} Z"/>` +
      `<text class="motor-m" x="${x}" y="${y + 4.5}">M</text></g>` +
      `<text class="lbl-strong" x="${x - 26}" y="${y - 2}" text-anchor="end">M${n}</text>` +
      `<text class="val" x="${x - 26}" y="${y + 11}" text-anchor="end">${title}</text>` +
      `<text class="val amp" id="amp-${n}" x="${x - 26}" y="${y + 24}" text-anchor="end"></text></g>`;
  }

  // NPN low-side switch: GPIO -> 1k -> base, motor between 3V3 and collector,
  // flyback diode across the motor.
  function driver(x0, B, n, gpioNet, side, title) {
    const cx = x0 + 90, bx = cx + 8, mot = 'mot' + n, fly = 'fly' + n;
    return `<g data-info="driver${n}">` +
      resistor(x0, B, gpioNet, 'out', `R${n} 1kΩ`) +
      wire(gpioNet, 'out', [[x0 + 50, B], [cx - 12, B]]) +
      `<circle class="part q-body" id="q-${n}" cx="${cx}" cy="${B}" r="20"/>` +
      `<line class="part-line thick" x1="${cx - 12}" y1="${B - 13}" x2="${cx - 12}" y2="${B + 13}"/>` +
      wire(mot, 'pwr', [[cx - 12, B - 6], [bx, B - 18], [bx, B - 58]]) +
      wire(mot, 'pwr', [[cx - 12, B + 6], [bx, B + 18], [bx, B + 45]]) +
      `<polygon class="arrow" points="${cx + 4},${B + 15.6} ${cx - 3.8},${B + 15} ${cx - 0.2},${B + 9}"/>` +
      gnd(bx, B + 45) +
      wire(mot, 'pwr', [[bx, B - 112], [bx, B - 94]]) + vcc(bx, B - 112, true) +
      wire(fly, 'fly', [[bx, B - 40], [bx + 40, B - 40], [bx + 40, B - 58]]) +
      `<polygon class="diode" points="${bx + 32},${B - 58} ${bx + 48},${B - 58} ${bx + 40},${B - 74}"/>` +
      `<line class="part-line" x1="${bx + 31}" y1="${B - 74}" x2="${bx + 49}" y2="${B - 74}"/>` +
      wire(fly, 'fly', [[bx + 40, B - 74], [bx + 40, B - 104], [bx, B - 104]]) +
      dot(bx, B - 40) + dot(bx, B - 104) +
      `<text class="val" x="${bx + 52}" y="${B - 63}">D${n}</text>` +
      `<text class="val" x="${cx - 24}" y="${B + 36}" text-anchor="end">Q${n} PN2222</text>` +
      `<text class="q-state" id="q-state-${n}" x="${cx - 24}" y="${B + 50}" text-anchor="end">OFF</text>` +
      `</g>` + motor(bx, B - 76, side, n, title);
  }

  function ledRow(x, y, net, label, color, n) {
    return `<g data-info="${net}" id="${net}-row">` +
      resistor(x, y, net, 'out', `R${n} 220Ω`) +
      wire(net, 'out', [[x + 50, y], [x + 80, y]]) +
      `<circle class="led-glow" cx="${x + 90}" cy="${y}" r="17" fill="${color}"/>` +
      `<polygon class="led-body" points="${x + 80},${y - 10} ${x + 80},${y + 10} ${x + 100},${y}"/>` +
      `<line class="part-line" x1="${x + 100}" y1="${y - 10}" x2="${x + 100}" y2="${y + 10}"/>` +
      `<path class="part-line thin" d="M${x + 90} ${y - 13} l7 -9 M${x + 97} ${y - 22} l-4 1 M${x + 97} ${y - 22} l0 4 M${x + 98} ${y - 11} l7 -9 M${x + 105} ${y - 20} l-4 1 M${x + 105} ${y - 20} l0 4"/>` +
      wire(net, 'out', [[x + 100, y], [x + 150, y]]) + gnd(x + 150, y) +
      `<text class="lbl-strong" x="${x + 172}" y="${y + 4}">${label}</text></g>`;
  }

  function buildSVG() {
    let s = `<svg class="circuit-svg" viewBox="0 0 1000 620" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Σχηματικό κυκλώματος του Haptic Maze Controller">` +
      `<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.6" result="b"/>` +
      `<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>` +
      legend();

    // joystick
    s += wire('pwr', 'pwr', [[230, 150], [285, 150], [285, 115]]) + vcc(285, 115);
    s += wire('gnd', 'gnd', [[230, 120], [250, 120]]) + gnd(250, 120);
    s += wire('vrx', 'analog', [[230, 195], [400, 195]]);
    s += wire('vry', 'analog', [[230, 220], [400, 220]]);
    s += wire('sw', 'din', [[230, 245], [400, 245]]);
    s += `<text class="adc" id="adc-x" x="300" y="189" text-anchor="middle"></text>`;
    s += `<text class="adc" id="adc-y" x="300" y="214" text-anchor="middle"></text>`;
    s += `<text class="adc" id="sw-lvl" x="300" y="239" text-anchor="middle"></text>`;

    // buttons
    s += wire('btn1', 'din', [[185, 350], [340, 350], [340, 295], [400, 295]]);
    s += wire('btn2', 'din', [[185, 440], [360, 440], [360, 320], [400, 320]]);
    s += wire('gnd', 'gnd', [[115, 350], [95, 350]]) + gnd(95, 350);
    s += wire('gnd', 'gnd', [[115, 440], [95, 440]]) + gnd(95, 440);
    s += wire('gnd', 'gnd', [[400, 445], [380, 445]]) + gnd(380, 445);

    // OLED
    s += wire('gnd', 'gnd', [[690, 80], [655, 80]]) + gnd(655, 80);
    s += wire('pwr', 'pwr', [[690, 105], [620, 105]]) + vcc(620, 105);
    s += wire('scl', 'i2c', [[560, 145], [690, 145]]);
    s += wire('sda', 'i2c', [[560, 220], [600, 220], [600, 170], [690, 170]]);

    // motor drivers
    s += wire('m18', 'out', [[560, 270], [590, 270], [590, 380], [610, 380]]);
    s += wire('m19', 'out', [[560, 245], [780, 245], [780, 380], [800, 380]]);
    s += driver(610, 380, 1, 'm18', 'L', 'ΑΡΙΣΤΕΡΟ');
    s += driver(800, 380, 2, 'm19', 'R', 'ΔΕΞΙ');

    // LEDs
    s += wire('led2', 'out', [[560, 320], [582, 320], [582, 510], [620, 510]]);
    s += ledRow(620, 510, 'led2', 'LED2 · HAPTIC MODE', '#60a5fa', 4);
    s += wire('led1', 'out', [[560, 345], [570, 345], [570, 570], [620, 570]]);
    s += ledRow(620, 570, 'led1', 'LED1 · LINK', '#34d399', 3);

    s += joystick();
    s += pushButton(150, 350, 'btn1', 'BTN1 · MODE');
    s += pushButton(150, 440, 'btn2', 'BTN2 · RESTART');
    s += esp32();
    s += oled();

    s += `<text class="note" x="24" y="532">Κουμπιά/SW: INPUT_PULLUP → ελεύθερο = HIGH, πατημένο = LOW</text>`;
    s += `<text class="note" x="24" y="550">Όλα τα GND ενώνονται (κοινή γείωση)</text>`;
    return s + '</svg>';
  }

  const fmtV = (adc) => (adc / 4095 * 3.3).toFixed(2) + ' V';

  const INFO = {
    default: {
      t: 'Πώς διαβάζεται το σχηματικό',
      b: 'Κάθε χρώμα καλωδίου είναι διαφορετικός τύπος σήματος. Όταν ένα σήμα είναι ενεργό, το καλώδιο φωτίζεται και «ρέει». Σύρε το καπάκι του joystick, πάτα τα κουμπιά ή παίξε με WASD. Πέρνα το ποντίκι πάνω από ένα εξάρτημα για εξήγηση.',
      live: (hw) => `VRx=${hw.adcX} VRy=${hw.adcY} · M1 ${hw.motorL ? 'ON' : 'off'} · M2 ${hw.motorR ? 'ON' : 'off'}`,
    },
    esp32: {
      t: 'ESP32 DevKit V1',
      b: 'Ο «εγκέφαλος». Διαβάζει joystick και κουμπιά, ανοίγει/κλείνει τα μοτέρ μέσω transistor, γράφει στην OLED και μιλάει με τον browser μέσω USB (Web Serial). Λογική 3.3 V — ποτέ 5 V σε GPIO.',
      live: (hw) => `Είσοδοι: 34, 35 (ADC) · 32, 25, 26 (pull-up) | Έξοδοι: 18, 19, 16, 17 | I²C: 21, 22`,
    },
    usb: {
      t: 'USB ⇄ PC',
      b: 'Το ίδιο καλώδιο δίνει ρεύμα (5 V → regulator → 3.3 V) και δεδομένα. Ο CP2102 μετατρέπει USB σε σειριακή. Ο browser στέλνει H:L, H:W κ.λπ. και λαμβάνει J:x,y,sw,b1,b2 ~30 φορές/δευτ.',
      live: (hw) => hw.usb ? 'Συνδεδεμένο με πραγματικό ESP32' : 'Προσομοίωση (κανένα πραγματικό ESP32)',
    },
    joystick: {
      t: 'Joystick KY-023',
      b: 'Δύο ποτενσιόμετρα 10 kΩ (X, Y) + διακόπτης όταν πατάς το καπάκι. Το pin λέει +5V αλλά το συνδέουμε στο 3V3, ώστε VRx/VRy να μένουν 0–3.3 V (όριο του ADC). Σύρε το καπάκι· σκέτο κλικ = πάτημα SW.',
      live: (hw) => `VRx → GPIO34 = ${hw.adcX} (${fmtV(hw.adcX)}) · VRy → GPIO35 = ${hw.adcY} (${fmtV(hw.adcY)}) · SW = ${hw.sw ? 'LOW (πατημένο)' : 'HIGH'}`,
    },
    btn1: {
      t: 'BTN1 · αλλαγή Visual/Haptic',
      b: 'Push button ανάμεσα σε GPIO25 και GND. Με INPUT_PULLUP το pin «τραβιέται» εσωτερικά στα 3.3 V, οπότε ελεύθερο = HIGH και πατημένο = LOW. Δεν χρειάζεται εξωτερική αντίσταση.',
      live: (hw) => `GPIO25 = ${hw.b1 ? 'LOW (πατημένο)' : 'HIGH (ελεύθερο)'}`,
    },
    btn2: {
      t: 'BTN2 · restart',
      b: 'Ίδια συνδεσμολογία με το BTN1, στο GPIO26.',
      live: (hw) => `GPIO26 = ${hw.b2 ? 'LOW (πατημένο)' : 'HIGH (ελεύθερο)'}`,
    },
    driver1: {
      t: 'Οδηγός μοτέρ 1 · R1 + Q1 + D1',
      b: 'Ένα GPIO δίνει άνετα ~12 mA, το μοτέρ θέλει ~60–90 mA. Το GPIO λοιπόν ανοίγει μόνο το transistor (σαν διακόπτη) και το ρεύμα του μοτέρ περνά από το transistor στη γείωση. Η R1 περιορίζει το ρεύμα βάσης. Η D1 (flyback) απορροφά την ανάστροφη τάση όταν το μοτέρ σβήνει.',
      live: (hw) => hw.motorL
        ? 'GPIO18 HIGH → I_B ≈ (3.3−0.7)/1kΩ ≈ 2.6 mA → Q1 σε κορεσμό → ~75 mA μέσα από το M1'
        : 'GPIO18 LOW → I_B = 0 → Q1 κομμένο → M1 σβηστό',
    },
    driver2: {
      t: 'Οδηγός μοτέρ 2 · R2 + Q2 + D2',
      b: 'Ίδιο κύκλωμα με τον οδηγό 1, ελεγχόμενο από το GPIO19 για το δεξί μοτέρ. Πρόσεξε το ροζ καλώδιο: φωτίζεται για μια στιγμή όταν το μοτέρ σβήνει — αυτό είναι το ρεύμα flyback μέσα από τη δίοδο.',
      live: (hw) => hw.motorR
        ? 'GPIO19 HIGH → I_B ≈ 2.6 mA → Q2 σε κορεσμό → ~75 mA μέσα από το M2'
        : 'GPIO19 LOW → Q2 κομμένο → M2 σβηστό',
    },
    motor1: {
      t: 'M1 · coin vibration motor (αριστερό)',
      b: 'Μοτεράκι 3 V με έκκεντρη μάζα: όταν γυρίζει, δονείται. Μπαίνει στην αριστερή πλευρά του χειριστηρίου ώστε η δόνηση να δείχνει κατεύθυνση.',
      live: (hw) => hw.motorL ? 'ON · ~3.1 V στα άκρα του · ~75 mA' : 'OFF',
    },
    motor2: {
      t: 'M2 · coin vibration motor (δεξί)',
      b: 'Ίδιο μοτέρ στη δεξιά πλευρά. «Μπροστά» και «πίσω σου» κωδικοποιούνται με ταυτόχρονους παλμούς και των δύο.',
      live: (hw) => hw.motorR ? 'ON · ~3.1 V στα άκρα του · ~75 mA' : 'OFF',
    },
    led1: {
      t: 'LED1 · σύνδεση (GPIO16)',
      b: 'Ανάβει όσο ο υπολογιστής «μιλάει» με το ESP32. Η 220 Ω περιορίζει το ρεύμα: I ≈ (3.3 − 2.0) / 220 ≈ 6 mA.',
      live: (hw) => `GPIO16 = ${hw.led1 ? 'HIGH → LED ON' : 'LOW → LED OFF'}`,
    },
    led2: {
      t: 'LED2 · haptic mode (GPIO17)',
      b: 'Ανάβει όταν το παιχνίδι είναι σε Haptic mode. Ίδιος υπολογισμός αντίστασης με το LED1.',
      live: (hw) => `GPIO17 = ${hw.led2 ? 'HIGH → LED ON' : 'LOW → LED OFF'}`,
    },
    oled: {
      t: 'OLED SSD1306 0.96″',
      b: 'Οθόνη 128×64 με δίαυλο I²C: μόνο δύο καλώδια δεδομένων (SDA = GPIO21, SCL = GPIO22) + τροφοδοσία 3V3/GND. Το πράσινο καλώδιο αναβοσβήνει κάθε φορά που αλλάζει το περιεχόμενο.',
      live: (hw) => hw.oled.filter(Boolean).join(' | '),
    },
  };

  const PIN_ROWS = [
    ['GPIO34', 'Joystick VRx', 'IN · ADC', (hw) => `${hw.adcX} · ${fmtV(hw.adcX)}`],
    ['GPIO35', 'Joystick VRy', 'IN · ADC', (hw) => `${hw.adcY} · ${fmtV(hw.adcY)}`],
    ['GPIO32', 'Joystick SW', 'IN · pull-up', (hw) => (hw.sw ? 'LOW' : 'HIGH')],
    ['GPIO25', 'BTN1 · mode', 'IN · pull-up', (hw) => (hw.b1 ? 'LOW' : 'HIGH')],
    ['GPIO26', 'BTN2 · restart', 'IN · pull-up', (hw) => (hw.b2 ? 'LOW' : 'HIGH')],
    ['GPIO18', 'Q1 → M1 αριστερό', 'OUT', (hw) => (hw.motorL ? 'HIGH' : 'LOW')],
    ['GPIO19', 'Q2 → M2 δεξί', 'OUT', (hw) => (hw.motorR ? 'HIGH' : 'LOW')],
    ['GPIO16', 'LED1 · link', 'OUT', (hw) => (hw.led1 ? 'HIGH' : 'LOW')],
    ['GPIO17', 'LED2 · haptic', 'OUT', (hw) => (hw.led2 ? 'HIGH' : 'LOW')],
    ['GPIO21', 'OLED SDA', 'I²C', () => 'data'],
    ['GPIO22', 'OLED SCL', 'I²C', () => 'clock'],
  ];

  class Circuit {
    constructor(container, hw, input, infoEl, tableEl) {
      this.hw = hw;
      this.input = input;
      this.infoEl = infoEl;
      container.innerHTML = buildSVG();
      this.svg = container.querySelector('svg');

      this.nets = {};
      this.svg.querySelectorAll('[data-net]').forEach((el) => {
        (this.nets[el.dataset.net] = this.nets[el.dataset.net] || []).push(el);
      });
      this.netState = {};
      this.pins = {};
      this.svg.querySelectorAll('[data-pin]').forEach((el) => { this.pins[el.dataset.pin] = el; });

      const q = (sel) => this.svg.querySelector(sel);
      this.el = {
        knob: q('#joy-knob'), joy: q('#joy'), adcX: q('#adc-x'), adcY: q('#adc-y'), swLvl: q('#sw-lvl'),
        motorL: q('#motor-L'), motorR: q('#motor-R'), amp1: q('#amp-1'), amp2: q('#amp-2'),
        q1: q('#q-state-1'), q2: q('#q-state-2'), led1: q('#led1-row'), led2: q('#led2-row'),
        btn1: q('#btn1'), btn2: q('#btn2'), usb: q('#usb'),
        oled: [0, 1, 2, 3, 4].map((i) => q('#oled-' + i)),
      };
      this.text = new Map();

      this.buildTable(tableEl);
      this.infoKey = 'default';
      this.renderInfo();
      this.bind();
    }

    buildTable(table) {
      table.innerHTML = '<thead><tr><th>GPIO</th><th>Εξάρτημα</th><th>Τύπος</th><th>Τιμή</th></tr></thead><tbody>' +
        PIN_ROWS.map(([g, part, type]) => `<tr><td>${g}</td><td>${part}</td><td>${type}</td><td class="pv"></td></tr>`).join('') +
        '</tbody>';
      this.pinCells = [...table.querySelectorAll('.pv')];
    }

    svgPoint(e) {
      const pt = this.svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      return pt.matrixTransform(this.svg.getScreenCTM().inverse());
    }

    bind() {
      const { joy } = this.el;
      let drag = null;
      joy.addEventListener('pointerdown', (e) => {
        const p = this.svgPoint(e);
        if (Math.hypot(p.x - 125, p.y - 195) > 62) return;
        e.preventDefault();
        joy.setPointerCapture(e.pointerId);
        drag = { sx: p.x, sy: p.y, moved: false };
        joy.classList.add('grabbing');
      });
      joy.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const p = this.svgPoint(e);
        let dx = p.x - drag.sx, dy = p.y - drag.sy;
        if (Math.hypot(dx, dy) > 4) drag.moved = true;
        if (!drag.moved) return;
        const len = Math.hypot(dx, dy);
        if (len > 40) { dx = dx / len * 40; dy = dy / len * 40; }
        this.input.drag = { x: Math.round(2048 + dx / 40 * 2047), y: Math.round(2048 + dy / 40 * 2047) };
      });
      const end = () => {
        if (!drag) return;
        if (!drag.moved) {
          this.input.vsw = true;
          setTimeout(() => { this.input.vsw = false; }, 160);
        }
        drag = null;
        this.input.drag = null;
        joy.classList.remove('grabbing');
      };
      joy.addEventListener('pointerup', end);
      joy.addEventListener('pointercancel', end);

      for (const id of ['btn1', 'btn2']) {
        const el = this.el[id], key = id === 'btn1' ? 'vb1' : 'vb2';
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); this.input[key] = true; });
        const up = () => { this.input[key] = false; };
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
      }

      this.svg.addEventListener('pointerover', (e) => {
        const host = e.target.closest('[data-info]');
        const key = host ? host.dataset.info : 'default';
        if (key !== this.infoKey) { this.infoKey = key; this.renderInfo(); }
      });
      this.svg.addEventListener('pointerleave', () => { this.infoKey = 'default'; this.renderInfo(); });
    }

    renderInfo() {
      const info = INFO[this.infoKey] || INFO.default;
      this.infoEl.innerHTML = `<h3></h3><p></p><div class="live"></div>`;
      this.infoEl.querySelector('h3').textContent = info.t;
      this.infoEl.querySelector('p').textContent = info.b;
      this.liveEl = this.infoEl.querySelector('.live');
      this.lastLive = '';
      this.updateLive();
    }

    updateLive() {
      const info = INFO[this.infoKey] || INFO.default;
      const txt = '▶ ' + info.live(this.hw);
      if (txt !== this.lastLive) { this.liveEl.textContent = txt; this.lastLive = txt; }
    }

    setNet(net, on) {
      if (this.netState[net] === on) return;
      this.netState[net] = on;
      (this.nets[net] || []).forEach((el) => el.classList.toggle('on', on));
    }

    setText(el, txt) {
      if (this.text.get(el) === txt) return;
      this.text.set(el, txt);
      el.textContent = txt;
    }

    update(now) {
      const hw = this.hw, el = this.el;
      const dx = Math.max(-1, Math.min(1, (hw.adcX - 2048) / 2047));
      const dy = Math.max(-1, Math.min(1, (hw.adcY - 2048) / 2047));
      const i2c = now - hw.i2cAt < 160;
      const states = {
        vrx: Math.abs(dx) > 0.08, vry: Math.abs(dy) > 0.08,
        sw: hw.sw, btn1: hw.b1, btn2: hw.b2,
        m18: hw.motorL, mot1: hw.motorL, m19: hw.motorR, mot2: hw.motorR,
        fly1: now - hw.flyL < 220, fly2: now - hw.flyR < 220,
        led1: hw.led1, led2: hw.led2, scl: i2c, sda: i2c,
      };
      for (const net in states) this.setNet(net, states[net]);

      el.knob.setAttribute('transform', `translate(${(dx * 40).toFixed(1)} ${(dy * 40).toFixed(1)})`);
      el.knob.classList.toggle('sw', hw.sw);
      this.setText(el.adcX, `VRx ${hw.adcX}`);
      this.setText(el.adcY, `VRy ${hw.adcY}`);
      this.setText(el.swLvl, hw.sw ? 'SW LOW' : 'SW HIGH');

      const pinAct = {
        'L-D34': states.vrx, 'L-D35': states.vry, 'L-D32': hw.sw, 'L-D25': hw.b1, 'L-D26': hw.b2,
        'R-D18': hw.motorL, 'R-D19': hw.motorR, 'R-RX2·16': hw.led1, 'R-TX2·17': hw.led2,
        'R-D21': i2c, 'R-D22': i2c,
      };
      for (const k in pinAct) this.pins[k].classList.toggle('act', !!pinAct[k]);

      el.motorL.classList.toggle('on', hw.motorL);
      el.motorR.classList.toggle('on', hw.motorR);
      this.setText(el.amp1, hw.motorL ? '≈75 mA' : '');
      this.setText(el.amp2, hw.motorR ? '≈75 mA' : '');
      this.setText(el.q1, hw.motorL ? 'ON · κορεσμός' : 'OFF · αποκοπή');
      this.setText(el.q2, hw.motorR ? 'ON · κορεσμός' : 'OFF · αποκοπή');
      el.q1.classList.toggle('on', hw.motorL);
      el.q2.classList.toggle('on', hw.motorR);
      el.led1.classList.toggle('on', hw.led1);
      el.led2.classList.toggle('on', hw.led2);
      el.btn1.classList.toggle('pressed', hw.b1);
      el.btn2.classList.toggle('pressed', hw.b2);
      el.usb.classList.toggle('on', hw.usb);
      hw.oled.forEach((line, i) => this.setText(el.oled[i], line));

      if (!this.lastSlow || now - this.lastSlow > 120) {
        this.lastSlow = now;
        this.updateLive();
        PIN_ROWS.forEach((row, i) => {
          const v = row[3](hw);
          const cell = this.pinCells[i];
          if (cell.textContent !== v) cell.textContent = v;
          cell.classList.toggle('hot', (row[2] === 'OUT' && v === 'HIGH') || (row[2].includes('pull-up') && v === 'LOW'));
        });
      }
    }
  }

  HM.Circuit = Circuit;
})(window.HM);
