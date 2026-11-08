// 测游戏倒奶时的帧率和每帧耗时（手指模式按住倒 3 秒）。用法：node dev/shot/fps.mjs '额外的网址参数'
import { chromium } from 'playwright-core';
const extra = process.argv[2] || '';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: Number(process.env.DPR || 3) });
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:5180/index.html?mode=touch&lang=en&debug=1' + extra);
await page.evaluate(() => localStorage.setItem('latte-pour.pattern', 'heart'));
await page.waitForTimeout(Number(process.env.WAIT || 0));
await page.click('#startBtn');
await page.waitForTimeout(800);
const r = await page.evaluate(async () => {
  const cv = document.getElementById('cup'), b = cv.getBoundingClientRect();
  cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 5, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, bubbles: true }));
  let frames = 0, worst = 0, last = performance.now(); const t0 = last;
  await new Promise(done => { const f = now => { frames++; worst = Math.max(worst, now - last); last = now; if (now - t0 < 3000) requestAnimationFrame(f); else done(); }; requestAnimationFrame(f); });
  return { fps: +(frames / 3).toFixed(1), worstMs: +worst.toFixed(1), prof: window.__game.prof() };
});
console.log(extra || '(默认)', JSON.stringify(r));
await b.close();
