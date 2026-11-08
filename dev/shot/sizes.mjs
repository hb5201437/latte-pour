// 比较不同流量、出白量下大白心的大小。用法：node dev/shot/sizes.mjs '[{"flow":1,"fp":{}}]'
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const sets = JSON.parse(process.argv[2]);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await b.newPage();
await page.goto('http://127.0.0.1:5180/dev/shot/regress.html');
await page.waitForFunction(() => window.ready);
const base = await page.evaluate(() => ({ ...window.FP }));
const imgs = [];
for (const s of sets) {
  const r = await page.evaluate(({ s, base }) => {
    Object.assign(window.FP, base, s.fp || {});
    const f = s.flow;
    const segs = [{ t: 0.9, y0: 0.4, y1: 0.4, flow: f }, { t: s.t || 3.4, y0: 0.4, y1: 0.4, flow: f }, { t: 0.15, y0: 0.4, y1: 0.4, lift: 1 }, { t: 0.3, y0: 0.4, y1: -0.8, lift: 1 }];
    const res = window.runSegs(segs, 'heart');
    // 图案宽度占杯口直径的比例
    const d = window.lastD(); let x0 = 999, x1 = -1;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) if (d[y * 256 + x] > 0.5) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    return { img: res.img, score: res.score, width: +((x1 - x0) / 256).toFixed(2) };
  }, { s, base });
  console.log(JSON.stringify(s), '宽度', r.width, '分数', r.score);
  imgs.push({ img: r.img, label: `${JSON.stringify(s)} 宽${r.width}` });
}
const url = await page.evaluate(imgs => new Promise(res => {
  const S = 260, g = document.createElement('canvas'); g.width = S * imgs.length; g.height = S;
  const c = g.getContext('2d'); let left = imgs.length;
  imgs.forEach(({ img, label }, k) => { const im = new Image(); im.onload = () => { c.drawImage(im, k * S, 0, S, S); c.fillStyle = '#fff'; c.font = '11px sans-serif'; c.fillText(label.slice(0, 44), k * S + 4, 14); if (--left === 0) res(g.toDataURL('image/png')); }; im.src = img; });
}), imgs);
writeFileSync('dev/shot/sizes.png', Buffer.from(url.split(',')[1], 'base64'));
await b.close();
