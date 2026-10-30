// Game state and rules for the first-person maze.
// Joystick: up = step forward, down = step back, left/right = turn 90°.
// Haptic hints are RELATIVE to where the player is facing:
//   L = turn left, R = turn right, U = go forward, D = it's behind you.
// Challenge: collect the runes to unseal the portal while the Shade roams the
// maze. When it gets close, a "danger" pattern pulses faster and faster.
window.HM = window.HM || {};
(function (HM) {
  const FACING = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]; // N E S W
  const ABS_INDEX = { U: 0, R: 1, D: 2, L: 3 };
  const REL_CODE = ['U', 'R', 'D', 'L'];
  const QUARTER = Math.PI / 2;
  const DANGER_RANGE = 6;

  const FOG = {
    visual: { color: [58, 50, 80], density: 0.26 },
    haptic: [
      { color: [22, 18, 30], density: 1.5 },   // almost blind
      { color: [26, 22, 36], density: 0.75 },  // thick fog
      { color: [32, 28, 46], density: 0.42 },  // medium fog
    ],
  };

  const DIFFICULTY = {
    easy: { label: 'Εύκολο', runes: 0, shade: null },
    normal: { label: 'Κανονικό', runes: 1, shade: { stepMs: 720, chase: 6 } },
    hard: { label: 'Δύσκολο', runes: 3, shade: { stepMs: 470, chase: 10 } },
  };

  class Game {
    constructor(canvas, haptics) {
      this.canvas = canvas;
      this.haptics = haptics;
      this.view = new HM.Raycaster(canvas);
      this.mode = 'visual';
      this.visibility = 1;
      this.showBfs = false;
      this.hintEveryMove = true;
      this.cells = 15;
      this.difficulty = 'normal';
      this.listeners = {};
      this.lastFrame = 0;
      this.resize();
    }

    on(evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); }
    emit(evt, data) { (this.listeners[evt] || []).forEach((fn) => fn(data)); }

    get cfg() { return DIFFICULTY[this.difficulty]; }
    get runesTotal() { return this.runeSpots.length; }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = this.canvas.clientWidth || 760;
      const h = this.canvas.clientHeight || Math.round(w * 0.75);
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.view.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.view.resize(w, h);
    }

    // ------------------------------------------------------------ level setup
    newMaze(seed, cells, difficulty) {
      if (cells) this.cells = cells;
      if (difficulty) this.difficulty = difficulty;
      this.seed = seed;
      const m = this.maze = HM.generateMaze(this.cells, seed);
      const n = m.size;
      const startDist = HM.bfs(m, m.start);
      const isStartOrExit = (x, y) => (x === m.start.x && y === m.start.y) || (x === m.exit.x && y === m.exit.y);
      const openSides = (x, y) => FACING.filter((v) => !m.isWall(x + v.x, y + v.y)).length;

      // runes go into far-away dead ends
      const rng = HM.rng(seed * 7 + 13);
      const cellsList = [];
      for (let y = 1; y < n; y += 2) for (let x = 1; x < n; x += 2) if (!isStartOrExit(x, y)) cellsList.push({ x, y });
      const deadEnds = cellsList.filter((c) => openSides(c.x, c.y) === 1 && startDist[c.y * n + c.x] >= 8);
      for (let i = deadEnds.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [deadEnds[i], deadEnds[j]] = [deadEnds[j], deadEnds[i]]; }
      const far = cellsList.slice().sort((a, b) => startDist[b.y * n + b.x] - startDist[a.y * n + a.x]);
      this.runeSpots = deadEnds.slice(0, this.cfg.runes);
      for (const c of far) {
        if (this.runeSpots.length >= this.cfg.runes) break;
        if (!this.runeSpots.includes(c)) this.runeSpots.push(c);
      }
      const isRune = (x, y) => this.runeSpots.some((r) => r.x === x && r.y === y);

      // props hug the walls so the corridor centre stays free
      const prng = HM.rng(seed * 31 + 7);
      this.props = [];
      for (const c of cellsList) {
        if (isRune(c.x, c.y) || prng() > 0.17) continue;
        const walls = FACING.filter((v) => m.isWall(c.x + v.x, c.y + v.y));
        if (!walls.length) continue;
        const v = walls[Math.floor(prng() * walls.length)];
        const q = prng();
        const type = walls.length === 3
          ? (q < 0.6 ? 'brazier' : q < 0.8 ? 'barrel' : 'crate')
          : (q < 0.3 ? 'barrel' : q < 0.55 ? 'crate' : q < 0.78 ? 'chains' : 'brazier');
        const off = type === 'chains' ? 0.22 : 0.3;
        this.props.push({
          type, x: c.x + 0.5 + v.x * off, y: c.y + 0.5 + v.y * off,
          z: type === 'chains' ? 0.38 : 0, phase: prng() * 10,
        });
      }

      // the Shade starts as far from the player as possible
      const spawn = far.find((c) => !isRune(c.x, c.y)) || m.exit;
      this.shadeSpawn = { x: spawn.x, y: spawn.y };

      // shortest tour: nearest rune each time, then the exit
      let pos = m.start, total = 0;
      const left = this.runeSpots.slice();
      while (left.length) {
        const d = HM.bfs(m, pos);
        left.sort((a, b) => d[a.y * n + a.x] - d[b.y * n + b.x]);
        total += d[left[0].y * n + left[0].x];
        pos = left.shift();
      }
      this.optimalTotal = total + HM.bfs(m, pos)[m.exit.y * n + m.exit.x];

      this.reset();
    }

    reset() {
      this.runes = this.runeSpots.map((r) => ({ ...r }));
      this.runesGot = 0;
      this.placePlayerAtStart();
      this.retarget();
      this.bobPhase = 0;
      this.bobAmp = 0;
      this.moves = 0;
      this.turns = 0;
      this.wrong = 0;
      this.collisions = 0;
      this.hints = 0;
      this.caught = 0;
      this.startedAt = null;
      this.endedAt = null;
      this.won = false;
      this.hitAt = this.pickupAt = this.caughtAt = -1e9;
      this.msg = null;
      this.optimal = this.optimalTotal;
      this.dangerLevel = 0;
      this.dangerNextAt = 0;
      this.shade = this.cfg.shade ? {
        x: this.shadeSpawn.x, y: this.shadeSpawn.y, px: this.shadeSpawn.x, py: this.shadeSpawn.y,
        movedAt: 0, nextAt: 0, pausedUntil: 0, lastDir: -1,
      } : null;
      this.haptics.stop();
      if (this.runes.length) this.say(`Βρες ${this.runes.length === 1 ? 'τον ρούνο' : `${this.runes.length} ρούνους`} για να ανοίξει η πύλη`, '#c7d2fe', 2600);
      this.emit('change');
    }

    placePlayerAtStart() {
      const m = this.maze;
      this.pos = { ...m.start };
      // face the first open corridor so the player doesn't start staring at a wall
      this.facing = [1, 2, 0, 3].find((f) => !m.isWall(m.start.x + FACING[f].x, m.start.y + FACING[f].y));
      this.angle = (this.facing - 1) * QUARTER;
      this.cam = { x: this.pos.x + 0.5, y: this.pos.y + 0.5, a: this.angle };
      this.pdist = HM.bfs(m, this.pos);
    }

    // guidance target: the nearest remaining rune, otherwise the exit
    retarget() {
      const n = this.maze.size;
      let target = this.maze.exit;
      if (this.runes.length) {
        target = this.runes.reduce((best, r) => (this.pdist[r.y * n + r.x] < this.pdist[best.y * n + best.x] ? r : best));
      }
      this.target = target;
      this.dist = HM.bfs(this.maze, target);
    }

    distAt(p) { return this.dist[p.y * this.maze.size + p.x]; }

    elapsed(now = performance.now()) {
      if (!this.startedAt) return 0;
      return ((this.endedAt ?? now) - this.startedAt) / 1000;
    }

    setMode(mode) {
      this.mode = mode;
      this.emit('change');
    }

    say(text, color = '#f1f5f9', dur = 1600) {
      this.msg = { text, color, at: performance.now(), dur };
    }

    // ------------------------------------------------------------ player input
    // dir comes straight from the joystick: U / D / L / R
    move(dir) {
      if (this.won) return;
      const now = performance.now();
      if (!this.startedAt) this.startedAt = now;

      if (dir === 'L' || dir === 'R') {
        const turn = dir === 'R' ? 1 : -1;
        this.facing = (this.facing + turn + 4) % 4;
        this.angle += turn * QUARTER;
        this.turns++;
        if (this.hintEveryMove) this.playHint();
        this.emit('change');
        return;
      }

      const v = FACING[dir === 'U' ? this.facing : (this.facing + 2) % 4];
      const nx = this.pos.x + v.x, ny = this.pos.y + v.y;
      if (this.maze.isWall(nx, ny)) {
        this.collisions++;
        this.hitAt = now;
        this.hitVec = v;
        this.haptics.play('W');
        this.emit('change');
        return;
      }

      const before = this.distAt(this.pos);
      this.pos = { x: nx, y: ny };
      this.moves++;
      if (this.distAt(this.pos) > before) this.wrong++;
      this.pdist = HM.bfs(this.maze, this.pos);
      if (this.checkCaught(now)) return;

      const ri = this.runes.findIndex((r) => r.x === nx && r.y === ny);
      if (ri >= 0) {
        this.runes.splice(ri, 1);
        this.runesGot++;
        this.pickupAt = now;
        this.haptics.play('K');
        this.say(this.runes.length ? `ΡΟΥΝΟΣ! Απομένουν ${this.runes.length}` : 'Η ΠΥΛΗ ΑΝΟΙΞΕ', '#a5b4fc');
        this.retarget();
        this.emit('change');
        return;
      }

      if (nx === this.maze.exit.x && ny === this.maze.exit.y) {
        if (!this.runes.length) {
          this.won = true;
          this.endedAt = now;
          this.haptics.play('G');
          this.emit('change');
          this.emit('win', this.result());
          return;
        }
        this.say('Η ΠΥΛΗ ΕΙΝΑΙ ΣΦΡΑΓΙΣΜΕΝΗ', '#fca5a5');
      }

      if (this.hintEveryMove) this.playHint();
      this.emit('change');
    }

    // Translate the BFS step (absolute N/E/S/W) into "relative to my nose".
    relativeHint() {
      const abs = HM.nextDir(this.maze, this.dist, this.pos);
      return abs ? REL_CODE[(ABS_INDEX[abs] - this.facing + 4) % 4] : null;
    }

    playHint() {
      const code = this.relativeHint();
      if (code) this.haptics.play(code);
    }

    hint() {
      if (this.won) return;
      this.hints++;
      this.playHint();
      this.emit('change');
    }

    // ------------------------------------------------------------ the Shade
    checkCaught(now) {
      const s = this.shade;
      if (!s || s.x !== this.pos.x || s.y !== this.pos.y || now < s.pausedUntil) return false;
      this.caught++;
      this.caughtAt = now;
      this.haptics.play('X');
      this.say('Σε έπιασε η Σκιά!', '#f87171', 2000);
      this.placePlayerAtStart();
      this.retarget();
      Object.assign(s, { x: this.shadeSpawn.x, y: this.shadeSpawn.y, px: this.shadeSpawn.x, py: this.shadeSpawn.y, pausedUntil: now + 2500, lastDir: -1 });
      this.emit('change');
      return true;
    }

    stepShade(now) {
      const s = this.shade, m = this.maze, n = m.size, d = this.pdist;
      const here = d[s.y * n + s.x];
      const open = FACING.map((v, i) => ({ v, i })).filter(({ v }) => !m.isWall(s.x + v.x, s.y + v.y));
      let pick = null;
      if (here >= 0 && here <= this.cfg.shade.chase) {
        pick = open.find(({ v }) => d[(s.y + v.y) * n + s.x + v.x] < here);     // hunt
      } else {
        const forward = open.filter(({ i }) => i !== (s.lastDir + 2) % 4);      // wander
        const opts = forward.length ? forward : open;
        pick = opts[Math.floor(Math.random() * opts.length)];
      }
      if (!pick) return;
      s.px = s.x; s.py = s.y;
      s.x += pick.v.x; s.y += pick.v.y;
      s.lastDir = pick.i;
      s.movedAt = now;
      this.checkCaught(now);
    }

    // called every frame
    tick(now) {
      const s = this.shade;
      if (!s || this.won || !this.startedAt) { this.dangerLevel = 0; return; }
      if (now >= s.nextAt && now >= s.pausedUntil) {
        this.stepShade(now);
        s.nextAt = now + this.cfg.shade.stepMs;
      }
      const d = this.pdist[s.y * this.maze.size + s.x];
      this.shadeDist = d;
      this.dangerLevel = d >= 0 && d <= DANGER_RANGE && now >= s.pausedUntil ? 1 - d / (DANGER_RANGE + 1) : 0;
      // Danger waits for the current pattern to finish, but a fast-moving player
      // keeps the motors busy with hints, so after 500 ms it cuts in anyway.
      if (this.dangerLevel > 0 && now >= this.dangerNextAt && (!this.haptics.busy(now) || now - this.dangerNextAt > 500)) {
        this.haptics.play('E');
        this.dangerNextAt = now + 380 + d * 230;  // closer = faster heartbeat
      }
    }

    result() {
      return {
        mode: this.mode,
        difficulty: this.difficulty,
        visibility: this.mode === 'haptic' ? this.visibility : '-',
        seed: this.seed,
        cells: this.cells,
        time: +this.elapsed().toFixed(2),
        moves: this.moves,
        turns: this.turns,
        wrong: this.wrong,
        collisions: this.collisions,
        hints: this.hints,
        caught: this.caught,
        runes: this.runesGot,
        optimal: this.optimal,
        efficiency: this.moves ? +Math.min(1, this.optimal / this.moves).toFixed(2) : 0,
      };
    }

    // ------------------------------------------------------------ rendering
    render(now) {
      const dt = Math.min(100, now - (this.lastFrame || now));
      this.lastFrame = now;

      // smooth the camera towards the logical grid position / heading
      const k = 1 - Math.exp(-dt / 55);
      const tx = this.pos.x + 0.5, ty = this.pos.y + 0.5;
      const moving = Math.hypot(tx - this.cam.x, ty - this.cam.y);
      this.cam.x += (tx - this.cam.x) * k;
      this.cam.y += (ty - this.cam.y) * k;
      this.cam.a += (this.angle - this.cam.a) * k;
      this.bobAmp += ((moving > 0.03 ? 1 : 0) - this.bobAmp) * Math.min(1, dt / 120);
      this.bobPhase += dt * 0.018;

      // little shove into the wall on collision
      const fade = (t0, ms) => { const e = now - t0; return e < ms ? 1 - e / ms : 0; };
      const hit = fade(this.hitAt, 260);
      const shove = hit * hit * 0.12;
      const cx = this.cam.x + (this.hitVec ? this.hitVec.x * shove : 0);
      const cy = this.cam.y + (this.hitVec ? this.hitVec.y * shove : 0);

      const haptic = this.mode === 'haptic';
      const fog = haptic ? FOG.haptic[this.visibility] : FOG.visual;
      const open = this.runes.length === 0;

      // props, runes, the Shade + the lights they cast
      const sprites = [], lights = [];
      for (const p of this.props) {
        if (p.type === 'brazier') {
          const fl = 0.8 + 0.2 * Math.sin(now * 0.021 + p.phase) * Math.sin(now * 0.013 + p.phase * 2);
          sprites.push({ type: 'brazier', x: p.x, y: p.y, z: 0, frame: (now / 90 + p.phase * 7) | 0 });
          lights.push({ x: p.x, y: p.y, radius: 3, color: [2.2 * fl, 1.0 * fl, 0.3 * fl] });
        } else {
          sprites.push({ type: p.type, x: p.x, y: p.y, z: p.z });
        }
      }
      for (const r of this.runes) {
        const rx = r.x + 0.5, ry = r.y + 0.5;
        sprites.push({ type: 'rune', x: rx, y: ry, z: 0.24 + Math.sin(now / 380 + r.x) * 0.04 });
        lights.push({ x: rx, y: ry, radius: 2.3, color: [0.7, 0.85, 2.3] });
      }
      let shadePos = null;
      if (this.shade) {
        const s = this.shade, t = Math.min(1, (now - s.movedAt) / 260);
        shadePos = { x: s.px + (s.x - s.px) * t + 0.5, y: s.py + (s.y - s.py) * t + 0.5 };
        const resting = now < s.pausedUntil;
        sprites.push({ type: 'shade', x: shadePos.x, y: shadePos.y, z: 0.02 + Math.sin(now / 300) * 0.02, alpha: resting ? 0.35 : 0.95 });
        lights.push({ x: shadePos.x, y: shadePos.y, radius: 1.7, color: [1.2, 0.05, 0.05] });
      }
      const ex = this.maze.exit.x + 0.5, ey = this.maze.exit.y + 0.5;
      lights.push(open
        ? { x: ex, y: ey, radius: 3.2, color: [0.25, 1.5, 0.75] }
        : { x: ex, y: ey, radius: 2.4, color: [1.0, 0.12, 0.15] });

      const winSince = this.won ? now - this.endedAt : 1e9;
      const beat = 0.55 + 0.45 * Math.abs(Math.sin(now / 170));
      const state = {
        maze: this.maze,
        x: cx, y: cy, a: this.cam.a,
        h: 0.5 + Math.sin(this.bobPhase) * 0.022 * this.bobAmp + Math.sin(now / 900) * 0.003,
        fog: fog.color,
        density: fog.density,
        light: 1 + 0.05 * Math.sin(now * 0.013) * Math.sin(now * 0.0071),
        lights,
        sprites,
        portal: {
          x: ex, y: ey, open,
          color: open ? [70, 255, 150] : [255, 40, 50],
          strength: open ? 0.75 + 0.25 * Math.sin(now / 280) : 0.45 + 0.1 * Math.sin(now / 500),
        },
        time: now,
        hit: Math.max(hit, fade(this.caughtAt, 900)),
        win: winSince < 900 ? 1 - winSince / 900 : 0,
        pickup: fade(this.pickupAt, 500),
        danger: haptic ? 0 : this.dangerLevel * beat,  // in Haptic mode danger is felt, not seen
      };
      this.view.render(state);

      if (!haptic) {
        state.x = this.cam.x;
        state.y = this.cam.y;
        state.path = this.showBfs ? HM.pathFrom(this.maze, this.dist, this.pos) : null;
        state.runes = this.runes;
        state.shadePos = shadePos;
        this.view.drawMinimap(state);
      }

      const msg = this.msg;
      const msgAge = msg ? now - msg.at : 1e9;
      this.view.drawHud({
        runesTotal: this.runesTotal,
        runesGot: this.runesGot,
        message: msg && msgAge < msg.dur ? msg.text : null,
        messageColor: msg && msg.color,
        messageAlpha: msg ? Math.min(1, (msg.dur - msgAge) / 400) : 0,
      });
    }
  }

  HM.Game = Game;
  HM.DIFFICULTY = DIFFICULTY;
})(window.HM);
