// 拿模拟器的标准倒法和参考视频的关键帧比指标（dev/reftools/metrics.mjs）。
// 关键帧按步骤对齐：k1 原地摇结束、k2 往后退到一半、k3 收尾之前、k4 成品。参考帧在 dev/ref/keys/（rectify.mjs 生成，不提交）。
// 用法：NODE_PATH=dev/shot/node_modules node dev/shot/keyframes.mjs [图案=rosetta] [assist=0.4] ['[{流体参数},...]'] [out.png]
//   每组参数一行：参考帧 / 模拟 / 轮廓叠图；打印每个关键帧的差距分和轮廓重合度，最后一列是四帧平均
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { analyze, load, compare, overlay } from '../reftools/metrics.mjs';

const [pid = 'rosetta', assistArg = '0.4', setsArg = '[{}]', out = 'dev/shot/keyframes.png'] = process.argv.slice(2);
const sets = JSON.parse(setsArg), assist = Number(assistArg);
const tmp = 'dev/shot/out/kf'; mkdirSync(tmp, { recursive: true });
const refs = ['k1', 'k2', 'k3', 'k4'].map(k => analyze(load(`dev/ref/keys/${k}.png`)));

const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await b.newPage();
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:5180/dev/shot/regress.html');
await page.waitForFunction(() => window.ready);
const demo = await page.evaluate(id => window.PATTERNS_BY_ID[id].fluid.demo, pid);

// 按步骤切出四个时刻
const steps = demo.map(s => s.step);
const endOf = id => steps.lastIndexOf(id) + 1;
const backAt = steps.indexOf('back');
const cuts = [
  demo.slice(0, endOf('wiggle') || endOf('grow')),
  backAt >= 0 ? [...demo.slice(0, backAt), { ...demo[backAt], t: demo[backAt].t / 2, y1: (demo[backAt].y0 + demo[backAt].y1) / 2 }] : demo.slice(0, endOf('grow')),
  demo.slice(0, steps.indexOf('pull')),
  demo,
];

const rows = [];
const all = [];
for (const set of sets) {
  const ds = [], files = [];
  for (let i = 0; i < 4; i++) {
    const img = await page.evaluate(([segs, pid, a, set]) => { window.FPover = set; const r = window.runGuidedSegs(segs, pid, a); return r.img; }, [cuts[i], pid, assist, set]);
    const f = `${tmp}/s${rows.length}_${i}.png`; writeFileSync(f, Buffer.from(img.split(',')[1], 'base64'));
    const sim = analyze(load(f));
    const c = compare(refs[i], sim);
    overlay(refs[i], sim, `${tmp}/o${rows.length}_${i}.png`);
    ds.push(c); files.push(f);
  }
  const avg = +(ds.reduce((x, c) => x + c.dist, 0) / 4).toFixed(2), iou = +(ds.reduce((x, c) => x + c.iou, 0) / 4).toFixed(3);
  const tex = +(ds.reduce((x, c) => x + c.texture, 0) / 4).toFixed(2);
  console.log(`${JSON.stringify(set)}  平均差距 ${avg}（纹路 ${tex}）  平均轮廓重合 ${iou}  总分 ${(avg + tex + 1 - iou).toFixed(2)}  |  ` + ds.map((c, i) => `k${i + 1} ${c.shape}+${c.texture}/${c.iou}`).join('  '));
  console.log('   最大差：' + ds.map((c, i) => `k${i + 1} ` + Object.entries(c.per).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(',')).join(' | '));
  all.push({ set, avg, iou, ds });
  rows.push(files);
}
await b.close();

// 拼图：每组参数三行（参考、模拟、叠图），四列（k1~k4）
const S = 200, inputs = [], filters = [];
let n = 0;
const add = (f, label) => { inputs.push('-i', f); filters.push(`[${n}]scale=${S}:${S}[v${n}]`); return `[v${n++}]`; };
const lines = [];
for (let r = 0; r < rows.length; r++) {
  const ref = ['k1', 'k2', 'k3', 'k4'].map(k => add(`dev/ref/keys/${k}.png`)).join('');
  const sim = rows[r].map(f => add(f)).join('');
  const ov = [0, 1, 2, 3].map(i => add(`${tmp}/o${r}_${i}.png`)).join('');
  lines.push(`${ref}hstack=4[r${r}a];${sim}hstack=4[r${r}b];${ov}hstack=4[r${r}c];[r${r}a][r${r}b][r${r}c]vstack=3[r${r}]`);
}
const fc = filters.join(';') + ';' + lines.join(';') + (rows.length > 1 ? ';' + rows.map((_, r) => `[r${r}]`).join('') + `hstack=${rows.length}` : '');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', fc, ...(rows.length > 1 ? [] : ['-map', '[r0]']), out]);
console.log('图：' + out);
