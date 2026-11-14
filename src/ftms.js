// Protocole FTMS (Fitness Machine Service) : décodage, commandes, et client Web Bluetooth.
// Le client natif Android (native/index.js) réutilise TreadmillBase.
export const UUID = {
  service: 0x1826,
  treadmillData: 0x2acd,
  controlPoint: 0x2ad9,
  speedRange: 0x2ad4,
  inclineRange: 0x2ad5,
  status: 0x2ada,
};

// Décodage de la caractéristique Treadmill Data (0x2ACD). Pur, testable.
export function parseTreadmillData(dv) {
  let o = 0;
  const flags = dv.getUint16(o, true); o += 2;
  const out = {};
  if (!(flags & 0x0001)) { out.speed = dv.getUint16(o, true) / 100; o += 2; } // km/h
  if (flags & 0x0002) o += 2;                                                  // vitesse moyenne
  if (flags & 0x0004) { out.distance = dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getUint8(o + 2) << 16); o += 3; } // m
  if (flags & 0x0008) { out.incline = dv.getInt16(o, true) / 10; o += 4; }     // % (+ ramp angle ignoré)
  if (flags & 0x0010) o += 4;                                                  // dénivelé +/-
  if (flags & 0x0020) o += 1;                                                  // allure instantanée
  if (flags & 0x0040) o += 1;                                                  // allure moyenne
  if (flags & 0x0080) { out.energy = dv.getUint16(o, true); o += 5; }          // kcal
  if (flags & 0x0100) { out.hr = dv.getUint8(o); o += 1; }
  if (flags & 0x0200) o += 1;                                                  // METs
  if (flags & 0x0400) { out.elapsed = dv.getUint16(o, true); o += 2; }         // s
  return out;
}

export const cmd = {
  requestControl: () => new Uint8Array([0x00]),
  start: () => new Uint8Array([0x07]),
  stop: () => new Uint8Array([0x08, 0x01]),
  pause: () => new Uint8Array([0x08, 0x02]),
  speed: (kmh) => { const v = Math.round(kmh * 100); return new Uint8Array([0x02, v & 0xff, v >> 8]); },
  incline: (pct) => { const v = Math.round(pct * 10) & 0xffff; return new Uint8Array([0x03, v & 0xff, v >> 8]); },
};

const hex = (dv) => [...new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength)].map((b) => b.toString(16).padStart(2, '0')).join(' ');

// Partie commune aux transports : file d'écriture, commandes, traitement des notifications,
// reconnexion automatique. Une sous-classe fournit connected, pick(), setup(), send(bytes), drop().
export class TreadmillBase {
  constructor({ onData, onLog, onDisconnect, onReconnect, onStatus } = {}) {
    const nop = () => {};
    this.onData = onData || nop; this.log = onLog || nop; this.onDisconnect = onDisconnect || nop;
    this.onReconnect = onReconnect || nop; this.onStatus = onStatus || nop;
    this.rx = 0;
    this.queue = Promise.resolve(); // le Control Point n'accepte qu'une écriture à la fois
  }

  async connect() {
    await this.pick();
    this.manual = false;
    await this.setup();
    this.log('Connecté à ' + this.device.name);
    await this.write(cmd.requestControl());
  }

  disconnect() { this.manual = true; this.drop(); }

  // Perte de liaison : on réessaie indéfiniment, sauf déconnexion demandée.
  lost() {
    this.onDisconnect();
    if (!this.manual && !this.reconnecting) this.#retry(0);
  }

  async #retry(n) {
    if (this.manual) { this.reconnecting = false; return; }
    this.reconnecting = true;
    try {
      await this.setup();
      this.reconnecting = false;
      this.log('Reconnecté');
      await this.write(cmd.requestControl());
      this.onReconnect();
    } catch (e) {
      this.log('Reconnexion échouée : ' + e.message);
      setTimeout(() => this.#retry(n + 1), Math.min(10000, 1000 * 2 ** n));
    }
  }

  handleData(dv) {
    if (this.rx++ % 40 === 0) this.log('RX ' + hex(dv));
    this.onData(parseTreadmillData(dv));
  }
  handleCp(dv) { // [0x80, opcode, résultat]
    this.log(`CP réponse op=0x${dv.getUint8(1).toString(16)} résultat=${dv.getUint8(2)} (1=OK)`);
  }
  handleStatus(dv) { // signale notamment les appuis Start/Stop sur la console
    this.log('Statut ' + hex(dv));
    this.onStatus(dv.getUint8(0), dv.byteLength > 1 ? dv.getUint8(1) : undefined);
  }

  write(bytes) {
    if (!this.connected) return Promise.resolve();
    this.queue = this.queue.then(async () => {
      this.log('TX ' + hex(new DataView(bytes.buffer)));
      await this.send(bytes);
    }).catch((e) => this.log('Erreur écriture : ' + e.message));
    return this.queue;
  }

  start() { return this.write(cmd.start()); }
  stop() { return this.write(cmd.stop()); }
  pause() { return this.write(cmd.pause()); }
  setSpeed(kmh) { return this.write(cmd.speed(kmh)); }
  setIncline(pct) { return this.write(cmd.incline(pct)); }
}

// Transport Web Bluetooth (navigateur / PWA).
export class Treadmill extends TreadmillBase {
  listened = new WeakSet();

  get connected() { return !!this.server?.connected && !!this.cp; }

  async pick() {
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [UUID.service] }],
      optionalServices: [UUID.service],
    }).catch(async (e) => {
      // Certains Domyos n'annoncent pas FTMS dans l'advertising : on liste tout.
      this.log('Filtre FTMS sans résultat, scan ouvert : ' + e.message);
      return navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [UUID.service] });
    });
    // Un seul écouteur par appareil, même après une déconnexion manuelle suivie d'une reconnexion.
    if (!this.listened.has(this.device)) {
      this.listened.add(this.device);
      this.device.addEventListener('gattserverdisconnected', () => this.lost());
    }
  }

  async setup() {
    this.cp = null;
    this.server = await this.device.gatt.connect();
    const svc = await this.server.getPrimaryService(UUID.service); // échoue si pas FTMS
    const listen = async (uuid, fn) => {
      const c = await svc.getCharacteristic(uuid);
      c.addEventListener('characteristicvaluechanged', (e) => fn(e.target.value));
      await c.startNotifications();
      return c;
    };
    await listen(UUID.treadmillData, (v) => this.handleData(v));
    await listen(UUID.status, (v) => this.handleStatus(v)).catch(() => this.log('Pas de caractéristique Statut'));
    this.cp = await listen(UUID.controlPoint, (v) => this.handleCp(v));
  }

  send(bytes) { return this.cp.writeValueWithResponse(bytes); }
  drop() { this.device?.gatt?.disconnect(); }
}
