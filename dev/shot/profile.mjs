// 按 GPU 奶泡量示范倒法的轮廓，输出 patterns.js 用的剖面。
// 用法：node dev/shot/profile.mjs heart|tulip|rosetta
import { chromium } from 'playwright-core';
const id = process.argv[2];
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await b.newPage();
await page.goto('http://127.0.0.1:5180/dev/shot/regress.html');
await page.waitForFunction(() => window.ready);
const d = await page.evaluate(id => window.demoMask(id), id);
await b.close();
const n = 256, G = 128, step = 2, r = 3;
let m = new Uint8Array(G * G);
for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) m[y * G + x] = d[(y * step + 1) * n + x * step + 1] > 0.45 ? 1 : 0;
const grow = (src, val) => { const out = new Uint8Array(G * G); for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) { let hit = !val; for (let dy = -r; dy <= r && hit !== val; dy++) for (let dx = -r; dx <= r; dx++) { if (dx * dx + dy * dy > r * r) continue; const xx = x + dx, yy = y + dy; const v = xx >= 0 && yy >= 0 && xx < G && yy < G ? src[yy * G + xx] : 0; if (!!v === val) { hit = val; break; } } out[y * G + x] = hit ? 1 : 0; } return out; };
m = grow(grow(m, true), false);
let area = 0, sx = 0, sy = 0; for (let i = 0; i < G * G; i++) if (m[i]) { area++; sx += i % G; sy += (i / G) | 0; }
const cx = sx / area, cy = sy / area, sc = Math.sqrt(area);
for (let y = 0; y < G; y += 4) { let s = ''; for (let x = 0; x < G; x += 2) s += m[y * G + x] ? '#' : '.'; if (s.includes('#')) console.log(s); }
if (id === 'heart') {
  // 心形按列量前后边界（有凹口），左右对称取平均
  const cols = {};
  for (let x = 0; x < G; x++) { let y0 = -1, y1 = -1; for (let y = 0; y < G; y++) if (m[y * G + x]) { if (y0 < 0) y0 = y; y1 = y; } if (y0 < 0) continue;
    const k = Math.round(Math.abs((x - cx) / sc) / 0.04) * 0.04; (cols[k.toFixed(2)] ||= []).push([-(y1 - cy) / sc, -(y0 - cy) / sc]); }
  const out = Object.entries(cols).map(([k, v]) => [+k, +(v.reduce((a, b) => a + b[0], 0) / v.length).toFixed(2), +(v.reduce((a, b) => a + b[1], 0) / v.length).toFixed(2)]).sort((a, b) => a[0] - b[0]);
  console.log(JSON.stringify(out));
} else {
  const prof = [];
  for (let y = 0; y < G; y += 3) { let x0 = -1, x1 = -1; for (let x = 0; x < G; x++) if (m[y * G + x]) { if (x0 < 0) x0 = x; x1 = x; } if (x0 >= 0 && x1 - x0 > 2) prof.push([+((y - cy) / sc).toFixed(2), +(((x1 - x0) / 2) / sc).toFixed(2)]); }
  console.log(JSON.stringify(prof));
}
