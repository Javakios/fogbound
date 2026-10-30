// Glue: inputs (keyboard / virtual joystick / real ESP32) -> game -> haptics
// -> virtual circuit + real ESP32.
(function () {
  const HM = window.HM;
  const $ = (s) => document.querySelector(s);

  // Single source of truth for every pin of the (virtual) controller.
  const hw = {
    adcX: 2048, adcY: 2048, sw: false, b1: false, b2: false,
    motorL: false, motorR: false, led1: true, led2: false,
    flyL: -1e9, flyR: -1e9, i2cAt: -1e9, usb: false,
    oled: ['', '', '', '', ''],
  };
  const input = { drag: null, keys: [], vsw: false, vb1: false, vb2: false, real: null };
  const calib = { invX: false, invY: false, swap: false };

  const haptics = new HM.HapticEngine();
  const buzz = new HM.BuzzAudio();
  const link = new HM.ESP32Link();
  const game = new HM.Game($('#maze'), haptics);
  const circuit = new HM.Circuit($('#circuit'), hw, input, $('#info'), $('#pin-table'));
  const scope = new HM.Scope($('#scope'));

  let lastPattern = null;

  // ---------- haptics -> hardware ----------
  haptics.on((type, data) => {
    if (type === 'motors') {
      const now = performance.now();
      if (data.prev.l && !data.l) hw.flyL = now;
      if (data.prev.r && !data.r) hw.flyR = now;
      hw.motorL = data.l;
      hw.motorR = data.r;
      if ($('#opt-sound').checked) buzz.set(data.l, data.r);
    } else if (type === 'pattern') {
      lastPattern = data;
      link.send('H:' + data);
      flashPattern(data);
    }
  });

  // ---------- keyboard ----------
  const KEYMAP = {
    ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D',
    ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R',
  };
  const typing = (e) => e.target instanceof Element && e.target.matches('input[type=text], input[type=number], select, textarea');

  window.addEventListener('keydown', (e) => {
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    buzz.unlock();
    const dir = KEYMAP[e.code];
    if (dir) {
      e.preventDefault();
      if (!input.keys.includes(dir)) input.keys.push(dir);
    } else if (e.code === 'Space') { e.preventDefault(); input.vsw = true; }
    else if (e.code === 'KeyM') input.vb1 = true;
    else if (e.code === 'KeyR') input.vb2 = true;
    else if (e.code === 'KeyF') toggleFullscreen();
  });
  window.addEventListener('keyup', (e) => {
    const dir = KEYMAP[e.code];
    if (dir) input.keys = input.keys.filter((k) => k !== dir);
    else if (e.code === 'Space') { e.preventDefault(); input.vsw = false; }
    else if (e.code === 'KeyM') input.vb1 = false;
    else if (e.code === 'KeyR') input.vb2 = false;
  });
  window.addEventListener('blur', () => {
    input.keys = []; input.vsw = input.vb1 = input.vb2 = false; input.drag = null;
  });
  window.addEventListener('pointerdown', () => buzz.unlock());

  // ---------- inputs -> virtual pins ----------
  function computeInputs() {
    let x = 2048, y = 2048;
    if (input.drag) {
      x = input.drag.x; y = input.drag.y;
    } else if (input.keys.length) {
      const k = input.keys[input.keys.length - 1];
      x = k === 'L' ? 0 : k === 'R' ? 4095 : 2048;
      y = k === 'U' ? 0 : k === 'D' ? 4095 : 2048;
    } else if (input.real) {
      let rx = input.real.x, ry = input.real.y;
      if (calib.swap) [rx, ry] = [ry, rx];
      if (calib.invX) rx = 4095 - rx;
      if (calib.invY) ry = 4095 - ry;
      x = rx; y = ry;
    }
    hw.adcX = x;
    hw.adcY = y;
    const real = input.real || {};
    hw.sw = input.vsw || !!real.sw;
    hw.b1 = input.vb1 || !!real.b1;
    hw.b2 = input.vb2 || !!real.b2;
  }

  // ---------- controller logic (same thresholds for real & virtual) ----------
  const DEADZONE = 0.45;
  const ctl = { lastDir: null, repeatAt: 0, prev: { sw: false, b1: false, b2: false } };

  function readDir() {
    const dx = (hw.adcX - 2048) / 2048, dy = (hw.adcY - 2048) / 2048;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.max(ax, ay) < DEADZONE) return null;
    return ax > ay ? (dx < 0 ? 'L' : 'R') : (dy < 0 ? 'U' : 'D');
  }

  function updateController(now) {
    const dir = readDir();
    // turning auto-repeats slower than walking, so one tap = one 90° turn
    const turn = dir === 'L' || dir === 'R';
    if (dir && dir !== ctl.lastDir) { game.move(dir); ctl.repeatAt = now + (turn ? 480 : 330); }
    else if (dir && now >= ctl.repeatAt) { game.move(dir); ctl.repeatAt = now + (turn ? 380 : 210); }
    ctl.lastDir = dir;

    if (hw.sw && !ctl.prev.sw) game.hint();
    if (hw.b1 && !ctl.prev.b1) setMode(game.mode === 'visual' ? 'haptic' : 'visual');
    if (hw.b2 && !ctl.prev.b2) game.reset();
    ctl.prev = { sw: hw.sw, b1: hw.b1, b2: hw.b2 };
  }

  // ---------- OLED + status to the real ESP32 ----------
  let lastStatus = '', lastStatusAt = 0;
  function updateOled(now) {
    const secs = Math.floor(game.elapsed(now));
    const vib = lastPattern ? HM.PATTERNS[lastPattern].short : '-';
    const lines = [
      `HAPTIC MAZE      ${link.connected ? 'USB' : 'SIM'}`,
      `MODE: ${game.mode === 'haptic' ? 'HAPTIC' : 'VISUAL'}`,
      `MOVES ${String(game.moves).padEnd(4)} T ${secs}s`,
      `VIB: ${vib}`,
      game.won ? '*** EXIT FOUND ***'
        : `${game.runesTotal ? `RUNES ${game.runesGot}/${game.runesTotal}` : ''}${game.dangerLevel > 0 ? '  !! SHADE' : ''}`,
    ];
    if (lines.some((l, i) => l !== hw.oled[i])) {
      hw.oled = lines;
      hw.i2cAt = now;
    }
    hw.led1 = true; // the virtual board is always "linked" to the game
    hw.led2 = game.mode === 'haptic';

    const status = `S:${game.mode === 'haptic' ? 'H' : 'V'},${game.moves},${secs},${lastPattern || '-'},${game.won ? 1 : 0}`;
    if (link.connected && (status !== lastStatus || now - lastStatusAt > 1000)) {
      link.send(status);
      lastStatus = status;
      lastStatusAt = now;
    }
  }

  // ---------- UI ----------
  const statEls = {
    time: $('#st-time'), moves: $('#st-moves'), wrong: $('#st-wrong'),
    coll: $('#st-coll'), runes: $('#st-runes'), caught: $('#st-caught'),
  };
  function updateStats(now) {
    statEls.time.textContent = game.elapsed(now).toFixed(1);
    statEls.moves.textContent = game.moves;
    statEls.wrong.textContent = game.wrong;
    statEls.coll.textContent = game.collisions;
    statEls.runes.textContent = game.runesTotal ? `${game.runesGot}/${game.runesTotal}` : '–';
    statEls.caught.textContent = game.shade ? game.caught : '–';
  }

  function setStatus() {
    let msg;
    if (game.won) msg = 'Βρήκες την έξοδο! Πάτα BTN2 (R) για restart ή φτιάξε νέο λαβύρινθο.';
    else {
      const goal = game.runes.length
        ? `Στόχος: ${game.runes.length === 1 ? 'ο ρούνος' : `${game.runes.length} ρούνοι`}, μετά η πύλη.`
        : 'Στόχος: η πράσινη πύλη.';
      const shade = game.shade ? ' Πρόσεχε τη Σκιά.' : '';
      msg = game.mode === 'haptic'
        ? `Haptic: χωρίς χάρτη, ακολούθησε τις δονήσεις (Space = υπόδειξη). ${goal}${shade}`
        : `Visual: χάρτης στη γωνία. ${goal}${shade}`;
    }
    $('#status').textContent = msg;
  }

  function setMode(mode) {
    game.setMode(mode);
    document.querySelectorAll('#mode-seg button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    setStatus();
  }

  game.on('change', () => {
    setStatus();
    if (!game.won) $('#banner').hidden = true;
  });
  game.on('win', (r) => {
    const banner = $('#banner');
    const caught = game.shade ? ` · σε έπιασε ${r.caught}×` : '';
    banner.innerHTML = `<strong>Έξοδος!</strong><span>${r.time.toFixed(1)} s · ${r.moves} βήματα · ${r.wrong} λάθη · ${r.collisions} τοίχοι${caught}</span><span class="sub">BTN2 / R = restart</span>`;
    banner.hidden = false;
    addResult(r);
  });

  document.querySelectorAll('#mode-seg button').forEach((b) => {
    b.addEventListener('click', () => { setMode(b.dataset.mode); b.blur(); });
  });

  const randomSeed = () => 1 + Math.floor(Math.random() * 99999);
  function loadMaze(seed) {
    $('#seed').value = seed;
    game.newMaze(seed, +$('#size').value, $('#diff').value);
  }
  $('#diff').addEventListener('change', () => loadMaze(+$('#seed').value || randomSeed()));
  $('#btn-new').addEventListener('click', (e) => { loadMaze(randomSeed()); e.currentTarget.blur(); });
  $('#btn-restart').addEventListener('click', (e) => { game.reset(); e.currentTarget.blur(); });
  $('#seed').addEventListener('change', () => {
    const s = Math.max(1, Math.min(99999, parseInt($('#seed').value, 10) || 1));
    loadMaze(s);
  });
  $('#size').addEventListener('change', () => loadMaze(+$('#seed').value || randomSeed()));
  $('#vis').addEventListener('change', () => { game.visibility = +$('#vis').value; });
  $('#opt-bfs').addEventListener('change', (e) => { game.showBfs = e.target.checked; });
  $('#opt-hints').addEventListener('change', (e) => { game.hintEveryMove = e.target.checked; });
  $('#opt-sound').addEventListener('change', (e) => { if (!e.target.checked) buzz.set(false, false); });
  for (const [id, key] of [['#cal-invx', 'invX'], ['#cal-invy', 'invY'], ['#cal-swap', 'swap']]) {
    $(id).addEventListener('change', (e) => { calib[key] = e.target.checked; });
  }
  window.addEventListener('resize', () => game.resize());
  document.addEventListener('fullscreenchange', () => requestAnimationFrame(() => game.resize()));

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else $('#view').requestFullscreen?.().catch(() => {});
  }
  $('#btn-full').addEventListener('click', (e) => { toggleFullscreen(); e.currentTarget.blur(); });

  // ---------- haptic vocabulary ----------
  const patternRows = {};
  function patternSVG(steps) {
    const total = steps.reduce((s, st) => s + st[2], 0);
    const W = 300, scale = W / 1400;
    let t = 0, bars = '';
    for (const [l, r, ms] of steps) {
      const x = t * scale, w = ms * scale;
      if (l) bars += `<rect x="${x}" y="2" width="${w}" height="9" rx="2" fill="#f59e0b"/>`;
      if (r) bars += `<rect x="${x}" y="15" width="${w}" height="9" rx="2" fill="#fb7185"/>`;
      t += ms;
    }
    return `<svg viewBox="0 0 ${W} 26" preserveAspectRatio="none" aria-label="${total} ms">` +
      `<rect x="0" y="2" width="${W}" height="9" fill="rgba(148,163,184,.08)"/>` +
      `<rect x="0" y="15" width="${W}" height="9" fill="rgba(148,163,184,.08)"/>${bars}</svg>`;
  }
  const list = $('#pattern-list');
  for (const code of Object.keys(HM.PATTERNS)) {
    const p = HM.PATTERNS[code];
    const total = p.steps.reduce((s, st) => s + st[2], 0);
    const row = document.createElement('div');
    row.className = 'pattern';
    row.innerHTML = `<button class="play" title="Δοκιμή μοτίβου">▶</button>` +
      `<div class="name">${p.name}<small>H:${code} · ${total} ms</small></div>` +
      `<div class="desc">${p.desc}</div>${patternSVG(p.steps)}`;
    row.querySelector('.play').addEventListener('click', (e) => { buzz.unlock(); haptics.play(code); e.currentTarget.blur(); });
    list.appendChild(row);
    patternRows[code] = row;
  }
  const legend = document.createElement('p');
  legend.className = 'sub';
  legend.innerHTML = '<span style="color:#f59e0b">■</span> αριστερό μοτέρ (GPIO18) &nbsp; <span style="color:#fb7185">■</span> δεξί μοτέρ (GPIO19) &nbsp;· κλίμακα 0–1.4 s';
  list.after(legend);

  let flashTimer = null;
  function flashPattern(code) {
    Object.values(patternRows).forEach((r) => r.classList.remove('flash'));
    patternRows[code]?.classList.add('flash');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => patternRows[code]?.classList.remove('flash'), 500);
  }

  // ---------- experiment log ----------
  const LOG_KEY = 'haptic-maze-log-v1';
  let log = [];
  try { log = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch (e) { log = []; }
  const saveLog = () => { try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch (e) {} };

  function addResult(r) {
    log.push({ participant: $('#participant').value.trim() || 'P?', ...r, date: new Date().toISOString() });
    saveLog();
    renderLog();
  }

  function renderLog() {
    const tbody = $('#log-table tbody');
    if (!log.length) {
      tbody.innerHTML = '<tr><td colspan="13" class="empty">Δεν υπάρχουν ακόμη αποτελέσματα — λύσε έναν λαβύρινθο.</td></tr>';
    } else {
      tbody.innerHTML = log.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.participant)}</td>` +
        `<td><span class="tag ${r.mode}">${r.mode}</span></td><td>${DIFF_LABEL[r.difficulty] || '–'}</td><td>${r.visibility}</td><td>${r.seed}</td>` +
        `<td>${r.time.toFixed(1)} s</td><td>${r.moves}</td><td>${r.wrong}</td><td>${r.collisions}</td><td>${r.caught ?? '–'}</td>` +
        `<td>${r.hints}</td><td>${Math.round(r.efficiency * 100)}%</td></tr>`).reverse().join('');
    }
    const sum = $('#log-summary');
    sum.innerHTML = ['visual', 'haptic'].map((mode) => {
      const rows = log.filter((r) => r.mode === mode);
      if (!rows.length) return `<div class="box"><b>${mode}</b> · —</div>`;
      const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
      return `<div class="box"><b>${mode}</b> · n=${rows.length} · χρόνος ${avg('time').toFixed(1)} s · ` +
        `λάθη ${avg('wrong').toFixed(1)} · τοίχοι ${avg('collisions').toFixed(1)} · πιάστηκε ${(rows.reduce((s, r) => s + (r.caught || 0), 0) / rows.length).toFixed(1)} · αποδοτ. ${Math.round(avg('efficiency') * 100)}%</div>`;
    }).join('');
  }
  const DIFF_LABEL = Object.fromEntries(Object.entries(HM.DIFFICULTY).map(([k, v]) => [k, v.label]));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  $('#btn-export').addEventListener('click', () => {
    const cols = ['participant', 'mode', 'difficulty', 'visibility', 'seed', 'cells', 'time', 'moves', 'turns', 'wrong', 'collisions', 'caught', 'runes', 'hints', 'optimal', 'efficiency', 'date'];
    const csv = [cols.join(',')].concat(log.map((r) => cols.map((c) => `"${String(r[c]).replace(/"/g, '""')}"`).join(','))).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = 'haptic-maze-results.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#btn-clear').addEventListener('click', () => {
    if (!log.length || !confirm('Διαγραφή όλων των αποτελεσμάτων;')) return;
    log = [];
    saveLog();
    renderLog();
  });

  // ---------- real ESP32 ----------
  const btnConnect = $('#btn-connect'), pill = $('#link-pill');
  if (!HM.ESP32Link.supported()) {
    btnConnect.disabled = true;
    btnConnect.title = 'Το Web Serial υπάρχει μόνο σε Chrome / Edge για desktop';
    pill.textContent = '● Εικονικό hardware (χωρίς Web Serial)';
  }
  link.onJoystick = (s) => { input.real = s; };
  link.onStatus = (connected) => {
    hw.usb = connected;
    if (!connected) input.real = null;
    pill.textContent = connected ? '● ESP32 συνδεδεμένο · mirror' : '● Εικονικό hardware';
    pill.classList.toggle('live', connected);
    btnConnect.textContent = connected ? 'Αποσύνδεση ESP32' : 'Σύνδεση ESP32 (USB)';
    $('#calib').hidden = !connected;
    lastStatus = '';
  };
  btnConnect.addEventListener('click', async () => {
    btnConnect.blur();
    if (link.connected) { await link.disconnect(); return; }
    try {
      await link.connect();
    } catch (e) {
      if (e.name !== 'NotFoundError') {
        alert('Δεν άνοιξε η θύρα: ' + e.message + '\n\nΚλείσε το Serial Monitor του Arduino IDE και δοκίμασε ξανά.');
      }
    }
  });

  // ---------- main loop ----------
  let lastUi = 0;
  function frame(now) {
    computeInputs();
    updateController(now);
    game.tick(now);
    updateOled(now);
    circuit.update(now);
    scope.push(now, { l: hw.motorL, r: hw.motorR, x: hw.adcX, y: hw.adcY });
    scope.draw(now);
    game.render(now);
    if (now - lastUi > 100) { updateStats(now); lastUi = now; }
    requestAnimationFrame(frame);
  }

  HM.app = { game, hw, haptics, link }; // handy from the DevTools console

  loadMaze(randomSeed());
  setMode('visual');
  renderLog();
  requestAnimationFrame(frame);
})();
