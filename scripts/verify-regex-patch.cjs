// Verifies the addSprite regex patch matches the installed game bundle.
const fs = require('fs');
const re = JSON.parse(fs.readFileSync('C:/Users/Jhoan/Downloads/Dof test/DofusTouch/DofuEmu-Client/packages/main/game-base/regex.json', 'utf8'));
const entry = re['build/script.js'].find((e) => String(e[1]).includes('cuervok'));
console.log('pattern:', entry[0]);
const js = fs.readFileSync('C:/Users/Jhoan/AppData/Roaming/DofEmu/game/build/script.js', 'utf8');
const re2 = new RegExp(entry[0], 'g');
let n = 0;
const out = js.replace(re2, (m, ...groups) => {
  n++;
  return String(entry[1]).replace(/\$(\d)/g, (_, d) => groups[+d - 1] ?? '');
});
console.log('matches:', n);
const idx = out.indexOf('__cuervokPrepareMapElement');
console.log(idx > 0 ? 'PATCHED OK' : 'NOT PATCHED');
if (idx > 0) console.log(out.slice(idx - 80, idx + 200));
