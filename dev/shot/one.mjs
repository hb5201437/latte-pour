// 跑一个示范倒法，存原尺寸（720px）的某一帧。用法：node dev/shot/one.mjs heart 0.85 out.png '{"参数":值}'
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const [id = 'heart', frac = '1', out = 'dev/shot/one.png', over = '{}'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const page = await b.newPage({ viewport: { width: 800, height: 900 } });
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:5180/proto/fluid.html?static&n=' + (process.env.N || 512));
await page.waitForFunction(() => window.proto);
const url = await page.evaluate(({ id, f, over }) => {
  Object.assign(window.proto.P, JSON.parse(over));
  const total = window.proto.runDemo(id, 0);
  window.proto.runDemo(id, f >= 1 ? Infinity : Math.round(total * f));
  return document.getElementById('c').toDataURL('image/png');
}, { id, f: Number(frac), over });
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
await b.close();
