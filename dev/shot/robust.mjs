// 稳健性测试：同一个图案，十种"倒得不标准"的倒法（逐帧生成，节奏可以不均匀），看成品和参考视频差多少。
// 目标：平均分好、最差的也不能太差（"不怕倒乱"）。
// 用法：NODE_PATH=dev/shot/node_modules node dev/shot/robust.mjs [图案=rosetta] [assist=0.4] ['[{流体/几何参数覆盖},...]'] [out.png]
//   搜参数：ROBUST_SEARCH=次数 ... robust.mjs rosetta 0.4 '[{"marble":{基础参数}}]' out.json  （几何引擎参数，按"平均 + 最差/2"排名）
//   几何引擎的参数覆盖写成 {"marble":{...}}，流体的直接写
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { analyze, load, compare } from '../reftools/metrics.mjs';

const [pid = 'rosetta', assistArg = '0.4', setsArg = '[{}]', out = 'dev/shot/out/robust.png'] = process.argv.slice(2);
const sets = JSON.parse(setsArg), assist = assistArg === 'none' ? null : Number(assistArg);
mkdirSync('dev/shot/out/rb', { recursive: true });
const ref = analyze(load('dev/ref/keys/k4.png'));

// 伪随机（每次一样，方便比较）
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
// 生成一种倒法：o = { entry, lat, inT, hz, amp, backT, back, jitter（节奏/幅度乱的程度） }
function pourFrames(o) {
  const DT = 1 / 60, f = [];
  let ph = 0, hz = o.hz, amp = o.amp;
  const push = (y, w, lift = null) => {
    if (o.jitter) { hz += (o.hz * (1 + (rnd() - 0.5) * 2 * o.jitter) - hz) * 0.05; amp += (o.amp * (1 + (rnd() - 0.5) * 2 * o.jitter) - amp) * 0.05; }
    ph += 2 * Math.PI * hz * DT;
    f.push({ x: (o.lat || 0) + w * amp * Math.sin(ph), y, lift });
  };
  for (let t = 0; t < 0.9; t += DT) push(o.entry, 0);
  for (let t = 0; t < o.inT; t += DT) push(o.entry, 1);
  for (let t = 0; t < o.backT; t += DT) push(o.entry + o.back * t / o.backT, 1);
  const end = o.entry + o.back;
  for (let t = 0; t < 0.15; t += DT) f.push({ x: o.lat || 0, y: end, lift: 1 });
  for (let t = 0; t < 0.3; t += DT) f.push({ x: o.lat || 0, y: end - 1.2 * t / 0.3, lift: 1 });
  return f;
}
const S = { entry: 0.05, inT: 2.1, hz: 3, amp: 0.14, backT: 1.5, back: 0.6 };
const VARIANTS = [
  ['标准', S],
  ['手指', { ...S, inT: 2.4, amp: 0.166, backT: 1.3 }],
  ['摇太快', { ...S, hz: 4.5 }],
  ['摇太慢', { ...S, hz: 2.2 }],
  ['摇太大', { ...S, amp: 0.22 }],
  ['摇太小', { ...S, amp: 0.08 }],
  ['节奏乱', { ...S, jitter: 0.5 }],
  ['退太短', { ...S, backT: 0.9, back: 0.4 }],
  ['原地太久', { ...S, inT: 3.0, backT: 1.2 }],
  ['入点偏', { ...S, entry: 0.2, lat: 0.1 }],
];

const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await b.newPage();
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:5180/dev/shot/regress.html');
await page.waitForFunction(() => window.ready);

const rows = [];
const tot = r => r.dist + r.tex + 1 - r.iou;
async function bench(set, si) {
  const res = [];
  for (const [vi, [name, o]] of VARIANTS.entries()) {
    seed = 7 + vi;
    const frames = pourFrames(o);
    const r = await page.evaluate(([frames, pid, a, set]) => {
      const p = window.PATTERNS_BY_ID[pid], saved = p.marble;
      if (set.marble) p.marble = { ...saved, ...set.marble };
      const { marble, ...fp } = set; window.FPover = fp;
      const r = window.runFrames(frames, pid, a);
      p.marble = saved;
      return r;
    }, [frames, pid, assist, set]);
    const f = `dev/shot/out/rb/${si}_${vi}.png`; writeFileSync(f, Buffer.from(r.img.split(',')[1], 'base64'));
    const c = compare(ref, analyze(load(f)));
    res.push({ name, score: r.score, dist: c.dist, tex: c.texture, iou: c.iou, f });
  }
  const avg = res.reduce((s, r) => s + tot(r), 0) / res.length, worst = Math.max(...res.map(tot));
  return { res, avg, worst, obj: avg + worst / 2 };
}

const NS = Number(process.env.ROBUST_SEARCH || 0);
if (NS) {
  // 几何引擎参数的随机搜 + 细搜（只动 marble 里的参数）
  const RANGE = { rate: [0.2, 0.6, 1], ahead: [0.05, 0.22, 0], sink: [0.3, 0.95, 0], sinkBackMul: [0.2, 1, 0], swing: [0.2, 0.7, 0], trans: [0.15, 0.7, 0],
    brownRate: [0.5, 2, 1], swingBack: [2, 6, 0], aheadBack: [0.02, 0.1, 0], backBrown: [0.3, 1.5, 1], inW: [0.25, 0.9, 0], backW: [0.25, 0.9, 0] };
  const CHOICE = { backEnds: [0, 1] };
  const pick = ([lo, hi, log]) => log ? Math.exp(Math.log(lo) + Math.random() * Math.log(hi / lo)) : lo + Math.random() * (hi - lo);
  const r3 = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +(+v).toPrecision(3)]));
  const base = sets[0].marble || {}, all = [];
  const run = async m => { const r = await bench({ marble: m }, 0); all.push({ m, obj: r.obj, avg: r.avg, worst: r.worst }); console.log(`${String(all.length).padStart(3)} 目标 ${r.obj.toFixed(2)} 平均 ${r.avg.toFixed(2)} 最差 ${r.worst.toFixed(2)}  ${JSON.stringify(m)}`); };
  await run(base);
  for (let i = 1; i < NS; i++) {
    if (i < NS * 0.5) await run(r3({ ...base, ...Object.fromEntries(Object.entries(RANGE).map(([k, r]) => [k, pick(r)])), ...Object.fromEntries(Object.entries(CHOICE).map(([k, c]) => [k, c[Math.floor(Math.random() * c.length)]])) }));
    else {
      const best = all.slice().sort((a, b) => a.obj - b.obj)[0].m, m = { ...best };
      for (const k of Object.keys(RANGE)) if (m[k] != null && Math.random() < 0.4) m[k] = Math.min(RANGE[k][1], Math.max(RANGE[k][0], m[k] * Math.exp((Math.random() - 0.5) * 0.5)));
      for (const [k, c] of Object.entries(CHOICE)) if (Math.random() < 0.15) m[k] = c[Math.floor(Math.random() * c.length)];
      await run(r3(m));
    }
  }
  await b.close();
  all.sort((a, b) => a.obj - b.obj);
  writeFileSync(out, JSON.stringify(all, null, 1));
  console.log('最好的 3 组：'); all.slice(0, 3).forEach(r => console.log(r.obj.toFixed(2), r.avg.toFixed(2), r.worst.toFixed(2), JSON.stringify(r.m)));
  process.exit(0);
}
for (const [si, set] of sets.entries()) {
  const { res, avg, worst } = await bench(set, si);
  console.log(`${JSON.stringify(set)}\n  像不像（越小越好）：平均 ${avg.toFixed(2)}  最差 ${worst.toFixed(2)}  |  ` + res.map(r => `${r.name} ${tot(r).toFixed(2)}`).join('  '));
  console.log('  游戏分：' + res.map(r => `${r.name} ${r.score}`).join('  '));
  rows.push(res);
}
await b.close();
const ins = [], fl = []; let n = 0;
const lines = rows.map((res, ri) => { const l = res.map(r => { ins.push('-i', r.f); fl.push(`[${n}]scale=180:180[v${n}]`); return `[v${n++}]`; }).join('') + `hstack=${res.length}[r${ri}]`; return l; });
const fc = fl.join(';') + ';' + lines.join(';') + (rows.length > 1 ? ';' + rows.map((_, i) => `[r${i}]`).join('') + `vstack=${rows.length}` : '');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...ins, '-filter_complex', fc, ...(rows.length > 1 ? [] : ['-map', '[r0]']), out]);
console.log('图：' + out + '（每行一组参数，从左到右：' + VARIANTS.map(v => v[0]).join(' / ') + '）');
