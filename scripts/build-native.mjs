// Prépare www/ pour Capacitor : copie de l'appli web + bundle des plugins natifs.
import { build } from 'esbuild';
import { cpSync, rmSync, mkdirSync } from 'node:fs';

rmSync('www', { recursive: true, force: true });
mkdirSync('www');
for (const f of ['index.html', 'style.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'src']) cpSync(f, `www/${f}`, { recursive: true });
await build({ entryPoints: ['native/index.js'], bundle: true, format: 'esm', outfile: 'www/native.bundle.js', logLevel: 'info' });
