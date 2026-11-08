// 用游戏同一条路径（Pour → GPU 奶泡）跑某个图案的示范，存原尺寸画布。用法：node dev/shot/demo1.mjs rosetta out.png '{"参数":值}'
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const [id = 'rosetta', out = 'dev/shot/demo1.png', over = '{}'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await b.newPage();
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:5180/dev/shot/regress.html?q=' + (process.env.Q || 512));
await page.waitForFunction(() => window.ready);
const r = await page.evaluate(({ id, over }) => {
  Object.assign(window.FP, JSON.parse(over));
  const P = window.PATTERNS_BY_ID[id];
  return window.runSegs(P.fluid?.demo || P.demo, id);
}, { id, over });
writeFileSync(out, Buffer.from(r.img.split(',')[1], 'base64'));
console.log(id, r.score, r.iou, r.layers);
await b.close();
