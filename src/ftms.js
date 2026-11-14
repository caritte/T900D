// Client FTMS (Fitness Machine Service) via Web Bluetooth.
const UUID = {
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

export class Treadmill {
  constructor({ onData, onLog, onDisconnect } = {}) {
    this.onData = onData || (() => {});
    this.log = onLog || (() => {});
    this.onDisconnect = onDisconnect || (() => {});
    this.queue = Promise.resolve(); // le Control Point n'accepte qu'une écriture à la fois
  }

  async connect() {
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [UUID.service] }],
      optionalServices: [UUID.service],
    }).catch(async (e) => {
      // Certains Domyos n'annoncent pas FTMS dans l'advertising : on liste tout.
      this.log('Filtre FTMS sans résultat, scan ouvert : ' + e.message);
      return navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [UUID.service] });
    });
    this.device.addEventListener('gattserverdisconnected', () => this.onDisconnect());
    this.server = await this.device.gatt.connect();
    this.log('Connecté à ' + this.device.name);

    const services = await this.server.getPrimaryServices();
    this.log('Services : ' + services.map((s) => s.uuid).join(', '));

    const svc = await this.server.getPrimaryService(UUID.service); // échoue si pas FTMS
    const data = await svc.getCharacteristic(UUID.treadmillData);
    data.addEventListener('characteristicvaluechanged', (e) => {
      this.log('RX ' + [...new Uint8Array(e.target.value.buffer)].map((b) => b.toString(16).padStart(2, '0')).join(' '));
      this.onData(parseTreadmillData(e.target.value));
    });
    await data.startNotifications();

    this.cp = await svc.getCharacteristic(UUID.controlPoint);
    this.cp.addEventListener('characteristicvaluechanged', (e) => {
      const v = new Uint8Array(e.target.value.buffer); // [0x80, opcode, résultat]
      this.log(`CP réponse op=0x${v[1]?.toString(16)} résultat=${v[2]} (1=OK)`);
    });
    await this.cp.startNotifications();
    await this.write(cmd.requestControl());

    for (const [name, uuid] of [['vitesse', UUID.speedRange], ['inclinaison', UUID.inclineRange]]) {
      try {
        const v = await (await svc.getCharacteristic(uuid)).readValue();
        this.log(`Plage ${name} : min=${v.getUint16(0, true)} max=${v.getUint16(2, true)} pas=${v.getUint16(4, true)}`);
      } catch { /* optionnel */ }
    }
  }

  write(bytes) {
    this.queue = this.queue.then(async () => {
      this.log('TX ' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' '));
      await this.cp.writeValueWithResponse(bytes);
    }).catch((e) => this.log('Erreur écriture : ' + e.message));
    return this.queue;
  }

  start() { return this.write(cmd.start()); }
  stop() { return this.write(cmd.stop()); }
  pause() { return this.write(cmd.pause()); }
  setSpeed(kmh) { return this.write(cmd.speed(kmh)); }
  setIncline(pct) { return this.write(cmd.incline(pct)); }
  disconnect() { this.device?.gatt?.disconnect(); }
}
