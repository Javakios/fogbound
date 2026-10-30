// Web Serial link to the real ESP32 (Chrome / Edge desktop only).
// Protocol (text lines, 115200 baud):
//   PC  -> ESP32   H:<code>                          play haptic pattern (L R U D W G)
//   PC  -> ESP32   S:<mode>,<moves>,<secs>,<last>,<won>   status for OLED/LEDs
//   ESP32 -> PC    J:<x>,<y>,<sw>,<btn1>,<btn2>           joystick + buttons, ~30 Hz
window.HM = window.HM || {};
(function (HM) {
  class ESP32Link {
    constructor() {
      this.port = null;
      this.reader = null;
      this.writer = null;
      this.connected = false;
      this.onStatus = () => {};
      this.onJoystick = () => {};
      this.onLine = () => {};
      this._onUnplug = (e) => { if (e.target === this.port) this.disconnect(); };
    }

    static supported() { return 'serial' in navigator; }

    async connect() {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      this.port = port;
      const encoder = new TextEncoderStream();
      this.writeDone = encoder.readable.pipeTo(port.writable).catch(() => {});
      this.writer = encoder.writable.getWriter();
      this.connected = true;
      navigator.serial.addEventListener('disconnect', this._onUnplug);
      this.onStatus(true);
      this._readLoop();
    }

    async _readLoop() {
      const decoder = new TextDecoderStream();
      this.readDone = this.port.readable.pipeTo(decoder.writable).catch(() => {});
      this.reader = decoder.readable.getReader();
      let buf = '';
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          buf += value;
          let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            this._handle(buf.slice(0, i).trim());
            buf = buf.slice(i + 1);
          }
          if (buf.length > 512) buf = '';
        }
      } catch (e) {
        // port lost (cable pulled, board reset)
      } finally {
        try { this.reader.releaseLock(); } catch (e) {}
      }
      if (this.connected) this.disconnect();
    }

    _handle(line) {
      if (line.startsWith('J:')) {
        const v = line.slice(2).split(',').map(Number);
        if (v.length === 5 && v.every(Number.isFinite)) {
          this.onJoystick({ x: v[0], y: v[1], sw: !!v[2], b1: !!v[3], b2: !!v[4] });
        }
      } else if (line) {
        this.onLine(line);
      }
    }

    send(line) {
      if (!this.writer) return;
      this.writer.write(line + '\n').catch(() => {});
    }

    async disconnect() {
      if (!this.port) return;
      this.connected = false;
      const port = this.port;
      this.port = null;
      try { await this.reader?.cancel(); } catch (e) {}
      try { await this.readDone; } catch (e) {}
      try { await this.writer?.close(); } catch (e) {}
      try { await this.writeDone; } catch (e) {}
      try { await port.close(); } catch (e) {}
      this.reader = null;
      this.writer = null;
      navigator.serial.removeEventListener('disconnect', this._onUnplug);
      this.onStatus(false);
    }
  }

  HM.ESP32Link = ESP32Link;
})(window.HM);
