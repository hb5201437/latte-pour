// 无头 Chrome（真 GPU）跑流体原型的示范倒法，把几个时间点拼成一张图。
// 用法：node dev/shot/shot.mjs heart,tulip,rosetta [out.png] [JSON 参数覆盖]
// 先在仓库根目录起服务器：python3 dev/serve.py . 5180
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const ids = (process.argv[2] || 'heart').split(',');
const out = process.argv[3] || 'dev/shot/out.png';
const over = JSON.parse(process.argv[4] || '{}');
const fracs = [0.35, 0.6, 0.85, 1];

const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const page = await b.newPage({ viewport: { width: 800, height: 900 } });
page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:5180/proto/fluid.html?static&n=' + (process.env.N || 256));
await page.waitForFunction(() => window.proto);
const t0 = Date.now();
const url = await page.evaluate(async ({ ids, fracs, over }) => {
  Object.assign(window.proto.P, over);
  const S = 300, g = document.createElement('canvas');
  g.width = S * fracs.length; g.height = S * ids.length;
  const c = g.getContext('2d');
  const src = document.getElementById('c');
  for (const [row, id] of ids.entries()) {
    const total = window.proto.runDemo(id, 0);
    for (const [col, f] of fracs.entries()) {
      window.proto.runDemo(id, f >= 1 ? Infinity : Math.round(total * f));
      window.proto.gl.finish();
      c.drawImage(src, col * S, row * S, S, S);
      c.fillStyle = '#fff'; c.font = '14px sans-serif'; c.fillText(`${id} ${f >= 1 ? 'end' : Math.round(f * 100) + '%'}`, col * S + 8, row * S + 18);
    }
  }
  return g.toDataURL('image/png');
}, { ids, fracs, over });
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote', out, ((Date.now() - t0) / 1000).toFixed(1) + 's');
await b.close();
