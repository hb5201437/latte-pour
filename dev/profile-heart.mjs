// 量心形示范倒法的轮廓：每一列奶泡的前后边界（心有凹口，不能按行量半宽）
// 用法：node --experimental-default-type=module dev/profile-heart.mjs
import { PATTERNS } from '../patterns.js';
import { run, CASES } from './regress.mjs';
const segs = process.argv[2] === 'white' ? CASES[0][1] : PATTERNS.find(q => q.id === 'heart').demo;
const sim = run(segs);
const n = 256, G = 128, step = 2;
const m = new Uint8Array(G * G);
for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) m[y * G + x] = sim.d[(y * step + 1) * n + x * step + 1] > 0.45 ? 1 : 0;
let area = 0, sx = 0, sy = 0; for (let i = 0; i < G * G; i++) if (m[i]) { area++; sx += i % G; sy += (i / G) | 0; }
const cx = sx / area, cy = sy / area, sc = Math.sqrt(area);
const cols = [];
for (let x = 0; x < G; x += 2) {
  let y0 = -1, y1 = -1;
  for (let y = 0; y < G; y++) if (m[y * G + x]) { if (y0 < 0) y0 = y; y1 = y; }
  // 局部坐标：+y 朝前（屏幕上方）
  if (y0 >= 0) cols.push([+((x - cx) / sc).toFixed(2), +(-(y1 - cy) / sc).toFixed(2), +(-(y0 - cy) / sc).toFixed(2)]);
}
for (let y = 0; y < G; y += 3) { let s = ''; for (let x = 0; x < G; x += 2) s += m[y * G + x] ? '#' : '.'; if (s.includes('#')) console.log(s); }
console.log(JSON.stringify(cols));
