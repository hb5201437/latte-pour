// 几何（大理石纹）引擎的参数搜索：和 dev/shot/search.mjs 一样的分数（四个关键帧对参考视频的指标），随机搜 + 细搜。
// 用法：NODE_PATH=dev/shot/node_modules node dev/shot/marble-search.mjs [次数=60] [基础参数 JSON] [out.json] [只看 JSON：'{"show":{参数}}' 时只出一张对照图]
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { analyze, load, compare, overlay } from '../reftools/metrics.mjs';

const [nArg = '60', baseArg = '{}', out = 'dev/shot/out/marble-search.json', showArg] = process.argv.slice(2);
const N = Number(nArg), base = JSON.parse(baseArg);
// [最小, 最大, 按对数取]
const RANGE = {
  rate: [0.15, 0.5, true], taper: [0, 0.8, false], ahead: [0.03, 0.14, false], sink: [0.2, 0.9, false], sinkBackMul: [0.1, 1, false],
  swing: [0.1, 0.6, false], trans: [0.1, 0.6, false], brownThr: [0.3, 0.8, false], brownRate: [0.4, 1.6, true],
  swingBack: [2, 6, false], aheadBack: [0.03, 0.12, false], backEndThr: [0.4, 0.85, false], backBrown: [0.2, 1.5, true],
  sinkBack: [0, 0.04, false],
};
// 开关类参数：从列表里挑
const CHOICE = { backEnds: [0, 1], folds: [1, 2] };
mkdirSync('dev/shot/out/mk', { recursive: true });
const refs = ['k1', 'k2', 'k3', 'k4'].map(k => analyze(load(`dev/ref/keys/${k}.png`)));
const b = await chromium.launch({ channel: 'chrome', headless: true });
const page = await b.newPage();
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:5180/proto/marble.html?headless=1');
await page.waitForFunction(() => window.ready);

async function evaluate(set, keep = false) {
  const r = await page.evaluate(set => {
    const S = window.ROSETTA; let acc = 0; const ends = S.map(s => (acc += s.t));
    const iw = S.findIndex(s => s.step === 'wiggle'), ib = S.findIndex(s => s.step === 'back'), ip = S.findIndex(s => s.lift);
    const ts = [ends[iw], ends[ib] - S[ib].t / 2, ends[ip - 1], acc - 1e-3];
    return window.renderPour(S, set, ts, 256, { bare: true }).snaps.map(s => s.img);
  }, set);
  let dist = 0, iou = 0, tex = 0; const files = [];
  for (let i = 0; i < 4; i++) {
    const f = `dev/shot/out/mk/${keep ? 'show' : 's'}_${i}.png`; writeFileSync(f, Buffer.from(r[i].split(',')[1], 'base64')); files.push(f);
    const sim = analyze(load(f)), c = compare(refs[i], sim);
    if (keep) overlay(refs[i], sim, `dev/shot/out/mk/o_${i}.png`);
    dist += c.dist / 4; iou += c.iou / 4; tex += c.texture / 4;
  }
  return { set, dist: +dist.toFixed(3), tex: +tex.toFixed(3), iou: +iou.toFixed(3), score: +(dist + tex + (1 - iou)).toFixed(3), files };
}

if (showArg) {
  const r = await evaluate(JSON.parse(showArg).show, true);
  console.log(`分 ${r.score} 差距 ${r.dist} 纹路 ${r.tex} 重合 ${r.iou}`);
  const ins = [], f = [];
  ['k1', 'k2', 'k3', 'k4'].forEach(k => ins.push('-i', `dev/ref/keys/${k}.png`)); r.files.forEach(x => ins.push('-i', x)); [0, 1, 2, 3].forEach(i => ins.push('-i', `dev/shot/out/mk/o_${i}.png`));
  for (let i = 0; i < 12; i++) f.push(`[${i}]scale=240:240[v${i}]`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...ins, '-filter_complex', f.join(';') + ';[v0][v1][v2][v3]hstack=4[a];[v4][v5][v6][v7]hstack=4[b];[v8][v9][v10][v11]hstack=4[c];[a][b][c]vstack=3', out]);
  console.log('图：' + out);
  await b.close(); process.exit(0);
}
const rnd = ([lo, hi, log]) => log ? Math.exp(Math.log(lo) + Math.random() * (Math.log(hi) - Math.log(lo))) : lo + Math.random() * (hi - lo);
const round = s => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, +v.toPrecision(3)]));
const results = [];
const log = r => console.log(`${String(results.length).padStart(3)} 分 ${r.score} 差距 ${r.dist} 纹路 ${r.tex} 重合 ${r.iou}  ${JSON.stringify(r.set)}`);
results.push(await evaluate({ ...base })); log(results[0]);
for (let n = 1; n < N; n++) {
  let set;
  if (n < N * 0.5) set = round({ ...base, ...Object.fromEntries(Object.entries(RANGE).map(([k, r]) => [k, rnd(r)])), ...Object.fromEntries(Object.entries(CHOICE).map(([k, c]) => [k, c[Math.floor(Math.random() * c.length)]])) });
  else {
    const best = results.slice().sort((a, b) => a.score - b.score)[0].set;
    const keys = Object.keys(RANGE);
    set = round({ ...Object.fromEntries(keys.map(k => [k, best[k] ?? (base[k] ?? null)]).filter(([, v]) => v != null)), ...best });
    for (const k of keys) if (set[k] != null && Math.random() < 0.5) set[k] = Math.min(RANGE[k][1], Math.max(RANGE[k][0], set[k] * Math.exp((Math.random() - 0.5) * 0.5)));
    for (const [k, c] of Object.entries(CHOICE)) if (Math.random() < 0.15) set[k] = c[Math.floor(Math.random() * c.length)];
    set = round(set);
  }
  const r = await evaluate(set); results.push(r); log(r);
}
await b.close();
results.sort((a, b) => a.score - b.score);
writeFileSync(out, JSON.stringify(results.map(({ files, ...r }) => r), null, 1));
console.log('最好的 5 组：'); results.slice(0, 5).forEach(r => console.log(r.score, r.dist, r.tex, r.iou, JSON.stringify(r.set)));
