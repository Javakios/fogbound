// Haptic vocabulary + a pattern player. The same patterns live in
// esp32/firmware/firmware.ino so the virtual and real motors behave identically.
window.HM = window.HM || {};
(function (HM) {
  // Each step: [leftMotor, rightMotor, durationMs]
  const PATTERNS = {
    L: { name: 'Στρίψε αριστερά', short: 'LEFT', desc: 'Αριστερό μοτέρ · 1 παλμός', steps: [[1, 0, 170]] },
    R: { name: 'Στρίψε δεξιά', short: 'RIGHT', desc: 'Δεξί μοτέρ · 1 παλμός', steps: [[0, 1, 170]] },
    U: { name: 'Μπροστά', short: 'FORWARD', desc: 'Και τα δύο · 1 σύντομος παλμός', steps: [[1, 1, 90]] },
    D: { name: 'Πίσω σου', short: 'BEHIND', desc: 'Και τα δύο · 2 σύντομοι παλμοί', steps: [[1, 1, 80], [0, 0, 110], [1, 1, 80]] },
    W: { name: 'Τοίχος', short: 'WALL', desc: 'Και τα δύο · 1 μακρύς παλμός', steps: [[1, 1, 450]] },
    G: {
      name: 'Έξοδος!', short: 'GOAL', desc: 'Εναλλαγή αριστερά/δεξιά + μακρύς',
      steps: [[1, 0, 110], [0, 0, 50], [0, 1, 110], [0, 0, 50], [1, 0, 110], [0, 0, 50], [0, 1, 110], [0, 0, 90], [1, 1, 420]],
    },
    K: { name: 'Ρούνος', short: 'RUNE', desc: 'Αριστερά → δεξιά → και τα δύο', steps: [[1, 0, 70], [0, 1, 70], [1, 1, 140]] },
    E: {
      name: 'Κίνδυνος · Σκιά', short: 'DANGER', desc: 'Γρήγορο «γουργούρισμα» · πυκνώνει όσο πλησιάζει',
      steps: [[1, 1, 30], [0, 0, 30], [1, 1, 30], [0, 0, 30], [1, 1, 30], [0, 0, 30], [1, 1, 30]],
    },
    X: {
      name: 'Σε έπιασε', short: 'CAUGHT', desc: '2 μεσαίοι + 1 πολύ μακρύς',
      steps: [[1, 1, 250], [0, 0, 90], [1, 1, 250], [0, 0, 90], [1, 1, 650]],
    },
  };

  class HapticEngine {
    constructor() {
      this.l = false;
      this.r = false;
      this.timers = [];
      this.listeners = [];
      this.busyUntil = 0;
    }
    busy(now = performance.now()) { return now < this.busyUntil; }
    on(fn) { this.listeners.push(fn); }
    emit(type, data) { this.listeners.forEach((fn) => fn(type, data)); }

    setMotors(l, r) {
      l = !!l; r = !!r;
      if (l === this.l && r === this.r) return;
      const prev = { l: this.l, r: this.r };
      this.l = l; this.r = r;
      this.emit('motors', { l, r, prev });
    }

    // A new pattern interrupts the current one (same as the firmware).
    play(code) {
      const p = PATTERNS[code];
      if (!p) return;
      this.stop();
      this.emit('pattern', code);
      let t = 0;
      for (const [l, r, ms] of p.steps) {
        this.timers.push(setTimeout(() => this.setMotors(l, r), t));
        t += ms;
      }
      this.timers.push(setTimeout(() => this.setMotors(0, 0), t));
      this.busyUntil = performance.now() + t;
    }

    stop() {
      this.timers.forEach(clearTimeout);
      this.timers = [];
      this.busyUntil = 0;
      this.setMotors(0, 0);
    }
  }

  // Sonified motors: left motor = buzz in the left ear, right = right ear.
  // With headphones this is a decent stand-in for the real controller.
  class BuzzAudio {
    constructor() { this.ctx = null; this.gains = null; }

    unlock() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        const ctx = new AC();
        const master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
        this.gains = [-1, 1].map((pan, i) => {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.value = i ? 185 : 165;
          const wobble = ctx.createOscillator();
          wobble.frequency.value = 38;
          const wobbleDepth = ctx.createGain();
          wobbleDepth.gain.value = 40;
          wobble.connect(wobbleDepth).connect(osc.frequency);
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 700;
          const g = ctx.createGain();
          g.gain.value = 0;
          const panner = ctx.createStereoPanner();
          panner.pan.value = pan * 0.9;
          osc.connect(lp).connect(g).connect(panner).connect(master);
          osc.start();
          wobble.start();
          return g;
        });
        this.ctx = ctx;
      } catch (e) {
        this.ctx = null;
      }
    }

    set(l, r) {
      if (!this.gains) return;
      const t = this.ctx.currentTime;
      this.gains[0].gain.setTargetAtTime(l ? 0.22 : 0, t, 0.006);
      this.gains[1].gain.setTargetAtTime(r ? 0.22 : 0, t, 0.006);
    }
  }

  HM.PATTERNS = PATTERNS;
  HM.HapticEngine = HapticEngine;
  HM.BuzzAudio = BuzzAudio;
})(window.HM);
