// 某个图案示范倒法的过程：在几个时间点截图（走游戏同一条路径）。用法：node dev/shot/seq.mjs rosetta '[1.5,2.5,3.5,4.5,5]' '{"参数":值}'
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const [id = 'rosetta', ts = '[1.5,2.5,3.5,4.5]', over = '{}', segs = ''] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await b.newPage();
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:5180/dev/shot/regress.html');
await page.waitForFunction(() => window.ready);
const url = await page.evaluate(async ({ id, ts, over, segs }) => {
  window.FPover = JSON.parse(over);
  if (segs) window.SEGS = JSON.parse(segs);
  const P = window.PATTERNS_BY_ID[id], demo = window.SEGS || P.fluid?.demo || P.demo;
  const cut = T => { const out = []; let acc = 0; for (const sg of demo) { if (acc >= T) break; const t = Math.min(sg.t, T - acc); const f = t / sg.t; out.push({ ...sg, t, y1: sg.y0 + (sg.y1 - sg.y0) * f }); acc += sg.t; } return out; };
  const S = 300, g = document.createElement('canvas'); g.width = S * ts.length; g.height = S; const c = g.getContext('2d');
  for (const [k, T] of ts.entries()) {
    const r = window.runSegs(cut(T), id);
    await new Promise(res => { const im = new Image(); im.onload = () => { c.drawImage(im, k * S, 0, S, S); c.fillStyle = '#fff'; c.font = '13px sans-serif'; c.fillText(T + 's', k * S + 6, 16); res(); }; im.src = r.img; });
  }
  return g.toDataURL('image/png');
}, { id, ts: JSON.parse(ts), over, segs });
writeFileSync('dev/shot/seq.png', Buffer.from(url.split(',')[1], 'base64'));
await b.close();
