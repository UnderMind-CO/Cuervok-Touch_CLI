#!/usr/bin/env node
/**
 * sync-server-game.mjs — paridad de juego PC ↔ web/móvil.
 *
 * El cliente PC extrae/parchea el juego en
 *   %APPDATA%/cuervok-touch/game  (AppData/Roaming/cuervok-touch/game)
 * con processGame + fixes.js/fixes.css de packages/main/game-base. El
 * servidor que sirve el juego a los clientes web y la app móvil
 * (TouchEmu-Cuervok/data/game — GameServeModule.cs) era una copia manual
 * que se quedó vieja: a cada parche nuevo del juego de PC el cliente
 * web/móvil quedaba atrás.
 *
 * Este script sincroniza LO QUE CAMBIA, respetando la variante propia:
 *   • fixes.js / fixes.css  ← packages/main/game-base (fuente de verdad)
 *   • build/script.js       ← la copia parcheada del PC (AppData); el
 *                             servidor re-normaliza los literales
 *                             localhost → origin por cliente en
 *                             GetPatchedScript, así que sirve tal cual
 *   • build/styles-native.css / primus.js / keymaster2.js ← PC, si difieren
 *   • index.html ¡NO se toca! — data/game tiene su propio bootstrap
 *     same-origin para el WebView móvil (difiere del del PC a propósito).
 *
 * Idolatría: cada lanzamiento del servidor (o este script tras un parche)
 *   node scripts/sync-server-game.mjs [opciones]
 *     --client <dir>  root del juego instalado PC (default AppData)
 *     --server <dir>  data/game destino del servidor (default repo vecino)
 *     --dry-run       solo reportar
 * Without dnd/core deps: plain node.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}
const DRY = args.includes('--dry-run');

const clientRoot = arg('--client') || path.join(os.homedir(), 'AppData', 'Roaming', 'cuervok-touch', 'game');
const repoRoot = process.cwd().toLowerCase().replace(/\\/g, '/').includes('/dofuemu-client')
  ? process.cwd()
  : arg('--repo') || process.cwd();
const serverRoot = arg('--server')
  || path.join(repoRoot, '..', 'TouchEmu-Cuervok', 'data', 'game');

function sha(p) {
  return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
}

const plan = [
  // [archivo destino, fuente preferente, fallback]
  ['fixes.js', [path.join(repoRoot, 'packages', 'main', 'game-base', 'fixes.js'), path.join(clientRoot, 'fixes.js')]],
  ['fixes.css', [path.join(repoRoot, 'packages', 'main', 'game-base', 'fixes.css'), path.join(clientRoot, 'fixes.css')]],
  ['build/script.js', [path.join(clientRoot, 'build', 'script.js')]],
  ['build/styles-native.css', [path.join(clientRoot, 'build', 'styles-native.css')]],
  ['build/primus.js', [path.join(clientRoot, 'build', 'primus.js')]],
  ['keymaster2.js', [path.join(clientRoot, 'keymaster2.js')]],
];

if (!fs.existsSync(serverRoot)) {
  console.error(`ERROR: destino del servidor no existe: ${serverRoot}`);
  console.error('  Pasa --server <ruta de TouchEmu-Cuervok/data/game>');
  process.exit(1);
}
if (!fs.existsSync(clientRoot)) {
  console.error(`ERROR: root del juego PC no existe: ${clientRoot}`);
  console.error('  Lanza el cliente una vez para instalarlo, o pasa --client <dir>');
  process.exit(1);
}

let changed = 0, same = 0, missing = 0;
for (const [rel, sources] of plan) {
  const src = sources.find((p) => fs.existsSync(p));
  if (!src) {
    console.warn(`  SKIP  ${rel}: ninguna fuente existe (${sources.join(', ')})`);
    missing++;
    continue;
  }
  const dst = path.join(serverRoot, rel);
  const fsDir = path.dirname(dst);
  if (!fs.existsSync(fsDir)) fs.mkdirSync(fsDir, { recursive: true });

  const dstExists = fs.existsSync(dst);
  const equal = dstExists && sha(src) === sha(dst);
  if (equal) {
    same++;
    continue;
  }
  const srcSize = fs.statSync(src).size;
  const dstSize = dstExists ? fs.statSync(dst).size : -1;
  console.log(`${DRY ? 'PLAN' : 'COPY'}  ${rel}  ← ${path.relative(repoRoot, src) || src}  (${dstSize} → ${srcSize} bytes)`);
  if (!DRY) fs.copyFileSync(src, dst);
  changed++;
}

console.log(`\nSincronizado: ${changed} cambiados, ${same} idénticos, ${missing} sin fuente${DRY ? ' (dry-run, nada escrito)' : ''}.`);
console.log('index.html se deja intacto: el servidor usa su bootstrapping mobile own-origin (data/game/index.html).');
console.log('El servidor no cachea fixes/script (mtime-aware, no-store): aplica al recargar, sin restart.');

// Recordatorio de integridad del script servido: el mtime de build/script.js
// cambia al copiarlo → la cache per-origin de GetPatchedScript invalida sola.
