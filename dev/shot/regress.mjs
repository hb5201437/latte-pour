// GPU 奶泡的回归测试：无头 Chrome 跑 dev/regress.mjs 里的全部用例，打分并拼一张结果图。
// 用法：node dev/shot/regress.mjs [out.png]（先起服务器：python3 dev/serve.py . 5180）
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const out = process.argv[2] || 'dev/shot/regress.png';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const page = await b.newPage();
page.on('pageerror', e => console.log('pageerror:', e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text()); });
await page.goto('http://127.0.0.1:5180/dev/shot/regress.html');
await page.waitForFunction(() => window.ready);
const cases = await page.evaluate(() => window.CASES);
const t0 = Date.now();
let fail = 0;
const imgs = [];
for (let i = 0; i < cases.length; i++) {
  const r = await page.evaluate(i => window.runCase(i), i);
  const ok = r.score >= r.lo && r.score <= r.hi;
  if (!ok) fail++;
  console.log(`${ok ? '  ok ' : 'FAIL '} ${r.name.padEnd(14, '　')} ${r.pid.padEnd(8)} ${String(r.score).padStart(3)}  (期望 ${r.lo}–${r.hi})  iou ${r.iou} 线/片 ${r.layers} 提示 ${r.tip}`);
  imgs.push({ img: r.img, label: `${r.name} ${r.pid} ${r.score}` });
}
const url = await page.evaluate(imgs => new Promise(res => {
  const S = 220, cols = 6, rows = Math.ceil(imgs.length / cols);
  const g = document.createElement('canvas'); g.width = S * cols; g.height = S * rows;
  const c = g.getContext('2d'); let left = imgs.length;
  imgs.forEach(({ img, label }, k) => { const im = new Image(); im.onload = () => {
    c.drawImage(im, (k % cols) * S, Math.floor(k / cols) * S, S, S);
    c.fillStyle = '#fff'; c.font = '12px sans-serif'; c.fillText(label, (k % cols) * S + 6, Math.floor(k / cols) * S + 16);
    if (--left === 0) res(g.toDataURL('image/png'));
  }; im.src = img; });
}), imgs);
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log(`\n${fail ? fail + ' 项不通过' : '全部通过'}（${((Date.now() - t0) / 1000).toFixed(1)}s） 图：${out}`);
await b.close();
