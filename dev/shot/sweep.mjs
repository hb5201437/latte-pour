// 参数对比：同几个用例，用不同的流体参数各跑一遍，拼成一张图（每行一组参数）。
// 用法：node dev/shot/sweep.mjs '用例下标,逗号分隔' '[{参数},{参数}]' [out.png]
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const idx = process.argv[2].split(',').map(Number);
const sets = JSON.parse(process.argv[3]);
const out = process.argv[4] || 'dev/shot/sweep.png';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const page = await b.newPage();
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:5180/dev/shot/regress.html');
await page.waitForFunction(() => window.ready);
const base = await page.evaluate(() => ({ ...window.FP }));
const imgs = [];
for (const set of sets) {
  for (const i of idx) {
    const r = await page.evaluate(({ i, set, base }) => { Object.assign(window.FP, base, set); return window.runCase(i); }, { i, set, base });
    imgs.push({ img: r.img, label: `${JSON.stringify(set)} ${r.name} ${r.score}` });
  }
}
const url = await page.evaluate(({ imgs, cols }) => new Promise(res => {
  const S = 260, rows = Math.ceil(imgs.length / cols);
  const g = document.createElement('canvas'); g.width = S * cols; g.height = S * rows;
  const c = g.getContext('2d'); let left = imgs.length;
  imgs.forEach(({ img, label }, k) => { const im = new Image(); im.onload = () => {
    c.drawImage(im, (k % cols) * S, Math.floor(k / cols) * S, S, S);
    c.fillStyle = '#fff'; c.font = '11px sans-serif'; c.fillText(label.slice(0, 48), (k % cols) * S + 4, Math.floor(k / cols) * S + 14);
    if (--left === 0) res(g.toDataURL('image/png'));
  }; im.src = img; });
}), { imgs, cols: idx.length });
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote', out);
await b.close();
