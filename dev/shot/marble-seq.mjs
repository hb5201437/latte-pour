// 几何引擎一步步长出来的过程：在给定的几个时间点截图拼一排（只画液面）。
// 用法：NODE_PATH=dev/shot/node_modules node dev/shot/marble-seq.mjs '[3,3.5,4]' '{参数}' out.png [crop=x:y:w（400 图里的裁剪）] ['倒法 JSON']
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [tsArg, setArg = '{}', out = 'dev/shot/out/marble-seq.png', crop, segsArg] = process.argv.slice(2);
const ts = JSON.parse(tsArg);
mkdirSync('dev/shot/out/mk', { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true }); const page = await b.newPage();
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:5180/proto/marble.html?headless=1'); await page.waitForFunction(() => window.ready);
const imgs = await page.evaluate(([ts, set, segs]) => window.renderPour(segs ? JSON.parse(segs) : window.ROSETTA, set, ts, 400, { bare: true }).snaps.map(s => s.img), [ts, JSON.parse(setArg), segsArg]);
await b.close();
const ins = [];
imgs.forEach((u, i) => { const f = `dev/shot/out/mk/seq${i}.png`; writeFileSync(f, Buffer.from(u.split(',')[1], 'base64')); ins.push('-i', f); });
const [cx, cy, cw] = (crop || '0:0:400').split(':').map(Number);
const f = imgs.map((_, i) => `[${i}]crop=${cw}:${cw}:${cx}:${cy},scale=240:240[v${i}]`).join(';') + ';' + imgs.map((_, i) => `[v${i}]`).join('') + (imgs.length > 1 ? `hstack=${imgs.length}` : 'copy');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...ins, '-filter_complex', f, out]);
console.log('图：' + out);
