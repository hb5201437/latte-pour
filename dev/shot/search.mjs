// 自动搜流体参数：按 dev/shot/keyframes.mjs 的量法（四个关键帧和参考视频比指标），随机搜 + 在最好的附近细搜。
// 用法：NODE_PATH=dev/shot/node_modules node dev/shot/search.mjs [图案=rosetta] [次数=40] [assist=0.4] [基础参数 JSON] [out.json]
// 每试一组打印一行；结束时把排名写进 out.json（默认 dev/shot/out/search.json），最好的一组可以直接放进 patterns.js 的 fluid.fp
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { analyze, load, compare } from '../reftools/metrics.mjs';

const [pid = 'rosetta', nArg = '40', assistArg = '0.4', baseArg = '{}', out = 'dev/shot/out/search.json'] = process.argv.slice(2);
const N = Number(nArg), assist = Number(assistArg), base = JSON.parse(baseArg);
// 搜索范围：[最小, 最大, 是否按对数取]
const RANGE = {
  upArea: [0.08, 0.3, true], jet: [4, 40, true], plunge: [0.02, 0.25, true], spread: [0.1, 0.6, false],
  aheadLow: [0, 0.04, false], wigGain: [0.25, 0.7, false], foamR: [0.004, 0.012, true], damp: [1.5, 4, false],
  jetSwing: [0.2, 0.9, false],
};
mkdirSync('dev/shot/out/kf', { recursive: true });
const refs = ['k1', 'k2', 'k3', 'k4'].map(k => analyze(load(`dev/ref/keys/${k}.png`)));

const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await b.newPage();
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:5180/dev/shot/regress.html');
await page.waitForFunction(() => window.ready);
const demo = await page.evaluate(id => window.PATTERNS_BY_ID[id].fluid.demo, pid);
const steps = demo.map(s => s.step), backAt = steps.indexOf('back');
const cuts = [
  demo.slice(0, steps.lastIndexOf('wiggle') + 1),
  [...demo.slice(0, backAt), { ...demo[backAt], t: demo[backAt].t / 2, y1: (demo[backAt].y0 + demo[backAt].y1) / 2 }],
  demo.slice(0, steps.indexOf('pull')),
  demo,
];

async function evaluate(set) {
  let dist = 0, iou = 0, tex = 0;
  for (let i = 0; i < 4; i++) {
    const img = await page.evaluate(([segs, pid, a, set]) => { window.FPover = set; return window.runGuidedSegs(segs, pid, a).img; }, [cuts[i], pid, assist, set]);
    const f = `dev/shot/out/kf/search_${i}.png`; writeFileSync(f, Buffer.from(img.split(',')[1], 'base64'));
    const c = compare(refs[i], analyze(load(f)));
    dist += c.dist / 4; iou += c.iou / 4; tex += c.texture / 4;
  }
  // 总分：形状和纹路的平均差距 + 轮廓重合度（越小越好）；纹路差距单独再加一份，防止"大白饼"靠轮廓刷分
  return { set, dist: +dist.toFixed(3), tex: +tex.toFixed(3), iou: +iou.toFixed(3), score: +(dist + tex + (1 - iou)).toFixed(3) };
}

const rnd = ([lo, hi, log]) => log ? Math.exp(Math.log(lo) + Math.random() * (Math.log(hi) - Math.log(lo))) : lo + Math.random() * (hi - lo);
const round = s => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, +v.toPrecision(3)]));
const results = [];
const log = r => console.log(`${String(results.length).padStart(3)} 分 ${r.score} 差距 ${r.dist} 纹路 ${r.tex} 重合 ${r.iou}  ${JSON.stringify(r.set)}`);

results.push(await evaluate({ ...base })); log(results[0]);
for (let n = 1; n < N; n++) {
  let set;
  if (n < N * 0.6) set = round({ ...base, ...Object.fromEntries(Object.entries(RANGE).map(([k, r]) => [k, rnd(r)])) });
  else {
    // 细搜：在目前最好的一组附近，每个参数乘一个 0.75~1.33 的随机因子
    const best = results.slice().sort((a, b) => a.score - b.score)[0].set;
    set = round(Object.fromEntries(Object.entries(best).map(([k, v]) => [k, RANGE[k] ? Math.min(RANGE[k][1], Math.max(RANGE[k][0], v * Math.exp((Math.random() - 0.5) * 0.6))) : v])));
  }
  const r = await evaluate(set); results.push(r); log(r);
}
await b.close();
results.sort((a, b) => a.score - b.score);
writeFileSync(out, JSON.stringify(results, null, 1));
console.log('最好的 5 组：'); results.slice(0, 5).forEach(r => console.log(r.score, r.dist, r.iou, JSON.stringify(r.set)));
