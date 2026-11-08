// 在无头 Chrome 里真玩一把（手指模式）：按住倒、左右摇、快速上划收尾，截图结果页。
// 用法：node dev/shot/game.mjs [heart|tulip|rosetta] [out.png]
import { chromium } from 'playwright-core';
const pid = process.argv[2] || 'heart', out = process.argv[3] || 'dev/shot/game.png';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.log('pageerror:', e.message, e.stack));
page.on('console', m => { if (m.type() !== 'log') console.log(m.type(), m.text()); });
await page.goto('http://127.0.0.1:5180/index.html?mode=touch&lang=en&debug=1' + (process.env.FP ? '&fp=' + encodeURIComponent(process.env.FP) : ''));
await page.evaluate(() => localStorage.clear());
await page.reload();
const names = { heart: 'Heart', tulip: 'Tulip', rosetta: 'Rosetta' };
await page.locator('.pcard', { hasText: names[pid] }).click();
await page.click('#startBtn');
await page.waitForTimeout(600);
const box = await page.locator('#cup').boundingBox();
const x0 = box.x + box.width / 2, y0 = box.y + box.height * 0.5;
const m = page.mouse;
await m.move(x0, y0); await m.down();
const t0 = Date.now(), T = () => (Date.now() - t0) / 1000;
let y = y0;
if (pid === 'heart') {
  while (T() < 4.8) { const t = T(); await m.move(x0 + (t > 0.9 ? Math.sin(t * 3.5 * 2 * Math.PI) * 9 : 0), y0); await page.waitForTimeout(16); }
} else if (pid === 'rosetta') {
  while (T() < 4.5) { const t = T(); await m.move(x0 + (t > 0.9 ? Math.sin(t * 4 * 2 * Math.PI) * 22 : 0), y0); await page.waitForTimeout(16); }
  const tb = T(); while (T() < tb + 1.6) { const t = T(); y = y0 + (t - tb) / 1.6 * 90; await m.move(x0 + Math.sin(t * 4 * 2 * Math.PI) * 22, y); await page.waitForTimeout(16); }
} else {
  // 郁金香：推一团，松手、往后挪、再按下推下一团
  const pushes = [[2.6, -50], [1.0, -15], [0.6, -8], [0.35, -4]];
  for (const [k, [dur, push]] of pushes.entries()) {
    if (k > 0) { await m.up(); await page.waitForTimeout(250); y += 30; await m.move(x0, y); await m.down(); }
    const ts = T(), ys = y; while (T() < ts + dur) { y = ys + push * (T() - ts) / dur; await m.move(x0, y); await page.waitForTimeout(16); }
  }
}
if (process.env.MID) { await page.screenshot({ path: 'dev/shot/mid.png' }); }
const ts = T(); while (T() < ts + 0.12) { await m.move(x0, y); await page.waitForTimeout(16); }
const t1 = T(), ys = y; while (T() < t1 + 0.25) { y = ys - (T() - t1) / 0.25 * 260; await m.move(x0, y); await page.waitForTimeout(16); }
await m.up();
await page.waitForTimeout(2500);
const st = await page.evaluate(() => ({ score: document.getElementById('scoreNum').textContent, tip: document.getElementById('tipLine').textContent, s: window.__game.debugState() }));
console.log(JSON.stringify(st));
await page.screenshot({ path: out });
await b.close();
