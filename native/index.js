// Fonctions natives Android (Capacitor), chargées uniquement dans l'APK : la WebView n'a ni
// Web Bluetooth, ni synthèse vocale, ni Wake Lock, ni téléchargement de fichier.
import { BleClient, numberToUUID } from '@capacitor-community/bluetooth-le';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { TreadmillBase, UUID } from '../src/ftms.js';

const FTMS = numberToUUID(UUID.service), DATA = numberToUUID(UUID.treadmillData);
const CP = numberToUUID(UUID.controlPoint), STATUS = numberToUUID(UUID.status);

export class NativeTreadmill extends TreadmillBase {
  up = false;

  get connected() { return this.up; }

  async pick() {
    await BleClient.initialize({ androidNeverForLocation: true });
    if (!(await BleClient.isEnabled())) await BleClient.requestEnable();
    this.device = await BleClient.requestDevice({ services: [FTMS] }).catch((e) => {
      if (/cancel/i.test(e.message)) throw e;
      // Certains Domyos n'annoncent pas FTMS dans l'advertising.
      this.log('Filtre FTMS sans résultat, recherche par nom : ' + e.message);
      return BleClient.requestDevice({ namePrefix: 'Domyos', optionalServices: [FTMS] });
    });
    this.device.name ??= 'Tapis';
  }

  async setup() {
    const id = this.device.deviceId;
    this.up = false;
    await BleClient.connect(id, () => { this.up = false; this.lost(); }, { timeout: 15000 });
    await BleClient.startNotifications(id, FTMS, DATA, (v) => this.handleData(v));
    await BleClient.startNotifications(id, FTMS, STATUS, (v) => this.handleStatus(v)).catch(() => this.log('Pas de caractéristique Statut'));
    await BleClient.startNotifications(id, FTMS, CP, (v) => this.handleCp(v));
    this.up = true;
  }

  send(bytes) { return BleClient.write(this.device.deviceId, FTMS, CP, new DataView(bytes.buffer)); }

  drop() {
    this.up = false;
    BleClient.disconnect(this.device.deviceId).catch(() => {});
    this.onDisconnect();
  }
}

export const speak = (text) => TextToSpeech.speak({ text, lang: 'fr-FR', queueStrategy: 0 }).catch(() => {});
export const keepAwake = () => KeepAwake.keepAwake().catch(() => {});
export const allowSleep = () => KeepAwake.allowSleep().catch(() => {});

// Écrit le fichier dans le cache de l'appli puis ouvre la feuille de partage Android.
export async function shareFile(name, text) {
  const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title: name, files: [uri] });
}
