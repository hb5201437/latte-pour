// 几何（大理石纹）拉花原型的截图：跑 rosetta 标准示范，存最终图 + 过程拼图。
// 用法：NODE_PATH=dev/shot/node_modules node dev/shot/marble.mjs [输出目录] '{"参数":值}' '[示范段]'
// 输出：final.png（原尺寸）、strip.png（摇完 / 后退一半 / 拉线前 / 最终）
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
const [outDir = 'dev/shot/out/marble', over = '{}', segs = ''] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true });
const page = await b.newPage();
page.on('pageerror', e => { console.log('pageerror:', e.message); process.exit(1); });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type() + ':', m.text()); });
await page.goto('http://127.0.0.1:5180/proto/marble.html?headless=1');
await page.waitForFunction(() => window.ready);
const r = await page.evaluate(async ({ over, segs }) => {
  const S = segs ? JSON.parse(segs) : window.ROSETTA;
  // 时间点：摇完、后退一半、拉线前、最终
  let acc = 0; const ends = S.map(s => (acc += s.t));
  const iw = S.findIndex(s => s.step === 'wiggle'), ib = S.findIndex(s => s.step === 'back'), ip = S.findIndex(s => s.lift);
  const ts = [ends[iw] ?? 3, (ends[ib] ?? 4.5) - (S[ib]?.t ?? 1.5) / 2, ends[ip - 1] ?? 4.65, acc];
  const res = window.renderPour(S, JSON.parse(over), ts, 512);
  const W = 360, g = document.createElement('canvas'); g.width = W * ts.length; g.height = W; const c = g.getContext('2d');
  for (const [k, sn] of res.snaps.entries()) {
    await new Promise(ok => { const im = new Image(); im.onload = () => { c.drawImage(im, k * W, 0, W, W); c.fillStyle = '#fff'; c.font = '14px sans-serif'; c.fillText(sn.t.toFixed(2) + 's  ' + sn.stats.polys + ' polys ' + sn.stats.verts + ' v', k * W + 8, 18); ok(); }; im.src = sn.img; });
  }
  return { final: res.final, strip: g.toDataURL('image/png'), stats: res.stats, snaps: res.snaps.map(s => s.img), snapStats: res.snaps.map(s => ({ t: s.t, ...s.stats })) };
}, { over, segs });
writeFileSync(outDir + '/final.png', Buffer.from(r.final.split(',')[1], 'base64'));
writeFileSync(outDir + '/strip.png', Buffer.from(r.strip.split(',')[1], 'base64'));
// 四个时间点分别存一张（给 dev/reftools/metrics.mjs 和参考关键帧比）
r.snaps.forEach((img, i) => writeFileSync(`${outDir}/k${i + 1}.png`, Buffer.from(img.split(',')[1], 'base64')));
console.log(JSON.stringify(r.stats));
for (const s of r.snapStats) console.log(`  t=${s.t.toFixed(2)} polys=${s.polys} verts=${s.verts}`);
await b.close();
