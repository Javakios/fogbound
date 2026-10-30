// Tiny "oscilloscope": last 4 s of the motor GPIOs and joystick ADC values.
window.HM = window.HM || {};
(function (HM) {
  const LANES = [
    { name: 'GPIO18 · M1 αριστερό', idx: 1, color: '#f59e0b', digital: true },
    { name: 'GPIO19 · M2 δεξί', idx: 2, color: '#fb7185', digital: true },
    { name: 'GPIO34 · VRx', idx: 3, color: '#a78bfa' },
    { name: 'GPIO35 · VRy', idx: 4, color: '#67e8f9' },
  ];

  class Scope {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.buf = [];
      this.span = 4000;
    }

    push(now, s) {
      this.buf.push([now, s.l ? 1 : 0, s.r ? 1 : 0, s.x / 4095, s.y / 4095]);
      const cut = now - this.span - 200;
      let i = 0;
      while (i < this.buf.length && this.buf[i][0] < cut) i++;
      if (i) this.buf.splice(0, i);
    }

    draw(now) {
      const c = this.canvas, dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth, h = c.clientHeight;
      if (!w || !h) return;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // time grid (1 s)
      ctx.strokeStyle = 'rgba(148,163,184,0.08)';
      ctx.lineWidth = 1;
      for (let s = 1; s < 4; s++) {
        const x = w - (s * 1000 / this.span) * w;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }

      const lh = h / LANES.length;
      LANES.forEach((lane, k) => {
        const top = k * lh + 15, bot = (k + 1) * lh - 4;
        ctx.strokeStyle = 'rgba(148,163,184,0.12)';
        ctx.beginPath(); ctx.moveTo(0, bot + 2); ctx.lineTo(w, bot + 2); ctx.stroke();

        ctx.fillStyle = 'rgba(203,213,225,0.7)';
        ctx.font = '10.5px ui-monospace, Consolas, monospace';
        ctx.fillText(lane.name, 6, k * lh + 11);

        ctx.strokeStyle = lane.color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        let prevY = null;
        for (const smp of this.buf) {
          const x = w - ((now - smp[0]) / this.span) * w;
          const y = bot - (bot - top) * smp[lane.idx];
          if (prevY === null) ctx.moveTo(x, y);
          else if (lane.digital) { ctx.lineTo(x, prevY); ctx.lineTo(x, y); }
          else ctx.lineTo(x, y);
          prevY = y;
        }
        if (prevY !== null) ctx.lineTo(w, prevY);
        ctx.stroke();
      });
    }
  }

  HM.Scope = Scope;
})(window.HM);
