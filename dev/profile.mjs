// 量一个示范倒法的整体轮廓（闭合缝隙后每一行的半宽），给评分模板用
// 用法：node --experimental-default-type=module dev/profile.mjs rosetta
import { PATTERNS } from '../patterns.js';
import { run } from './regress.mjs';
const p = PATTERNS.find(q => q.id === process.argv[2]);
const sim = run(p.demo);
const n = 256, G = 128, step = 2, r = 3;
let m = new Uint8Array(G * G);
for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) m[y * G + x] = sim.d[(y * step + 1) * n + x * step + 1] > 0.45 ? 1 : 0;
const grow = (src, val) => { const out = new Uint8Array(G * G); for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) { let hit = !val; for (let dy = -r; dy <= r && hit !== val; dy++) for (let dx = -r; dx <= r; dx++) { if (dx * dx + dy * dy > r * r) continue; const xx = x + dx, yy = y + dy; const v = xx >= 0 && yy >= 0 && xx < G && yy < G ? src[yy * G + xx] : 0; if (!!v === val) { hit = val; break; } } out[y * G + x] = hit ? 1 : 0; } return out; };
m = grow(grow(m, true), false);
let area = 0, sx = 0, sy = 0; for (let i = 0; i < G * G; i++) if (m[i]) { area++; sx += i % G; sy += (i / G) | 0; }
const cx = sx / area, cy = sy / area, sc = Math.sqrt(area);
const prof = [];
for (let y = 0; y < G; y += 3) { let x0 = -1, x1 = -1; for (let x = 0; x < G; x++) if (m[y * G + x]) { if (x0 < 0) x0 = x; x1 = x; } if (x0 >= 0 && x1 - x0 > 2) prof.push([+((y - cy) / sc).toFixed(2), +(((x1 - x0) / 2) / sc).toFixed(2)]); }
// 文字画看一眼形状
for (let y = 0; y < G; y += 4) { let s = ''; for (let x = 0; x < G; x += 2) s += m[y * G + x] ? '#' : '.'; if (s.includes('#')) console.log(s); }
console.log(JSON.stringify(prof));
