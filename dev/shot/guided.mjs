// 引导式模拟：同一种倒法（当成玩家输入）在不同辅助强度下各跑一遍，打分并拼图对比。
// 用法：node dev/shot/guided.mjs '<倒法 JSON>' rosetta '[0,0.4,1]' out.png ['[{流体参数},...]']（给了参数就每组参数各跑一遍）
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const [segsJson, pid, assists, out, fpJson] = process.argv.slice(2);
const sets = fpJson ? JSON.parse(fpJson) : [{}];
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await b.newPage();
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:5180/dev/shot/regress.html');
await page.waitForFunction(() => window.ready);
const imgs = [];
const base = await page.evaluate(() => ({ ...window.FP }));
for (const set of sets) for (const a of JSON.parse(assists)) {
  const r = await page.evaluate(([s, p, a, set, base]) => { window.FPover = set; const x = window.runGuidedSegs(JSON.parse(s), p, a); delete x.meas; return x; }, [segsJson, pid, a, set, base]);
  console.log(JSON.stringify(set), a, r.score, 'step', r.stepScore, 'shape', r.shapeScore, 'cov', r.coverage, r.tip, JSON.stringify(r.steps));
  imgs.push(r.img);
  // FULL=前缀：每张原尺寸另存一份（看细节用）
  if (process.env.FULL) writeFileSync(`${process.env.FULL}${imgs.length}.png`, Buffer.from(r.img.split(',')[1], 'base64'));
}
const url = await page.evaluate(imgs => new Promise(res => { const S = 300; const g = document.createElement('canvas'); g.width = S * imgs.length; g.height = S; const c = g.getContext('2d'); let n = imgs.length;
  imgs.forEach((u, k) => { const im = new Image(); im.onload = () => { c.drawImage(im, k * S, 0, S, S); if (--n === 0) res(g.toDataURL('image/png')); }; im.src = u; }); }), imgs);
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
await b.close();
