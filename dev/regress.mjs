// 回归测试：跑每个图案的示范倒法和几种典型失败倒法，检查分数在预期范围内。
// 用法：node --experimental-default-type=module dev/regress.mjs
// 改奶泡模型或评分后跑一遍，防止调一个图案时把另一个改坏。
import { FoamSim } from '../sim.js';
import { Pour } from '../pour.js';
import { scorePour } from '../score.js';
import { PATTERNS } from '../patterns.js';

const N = 256, DT = 1 / 60;

// segs：每段 { t, y0, y1, flow, lift, wig, hz }，和 patterns.js 的示范倒法同一格式
export function run(segs) {
  const sim = new FoamSim(N), pour = new Pour(), c = N / 2;
  let started = false, tt = 0;
  for (const sg of segs) {
    for (let t = 0; t < sg.t; t += DT) {
      const f = t / sg.t;
      const y = c + (sg.y0 + (sg.y1 - sg.y0) * f) * c;
      const x = c + Math.sin(tt * (sg.hz || 0) * 2 * Math.PI) * (sg.wig || 0) * c;
      if (!started) { pour.start(x, y); started = true; }
      sim.step(DT, pour.update(DT, x, y, sg.flow ?? 1, sg.lift ?? null));
      tt += DT;
    }
  }
  return sim;
}

const P = Object.fromEntries(PATTERNS.map(p => [p.id, p]));
const pull = (from, raise = 0.15, t = 0.3) => [{ t: raise, y0: from, y1: from, lift: 1 }, { t, y0: from, y1: from - 1.2, lift: 1 }];
const pause = (a, b) => ({ t: 0.25, y0: a, y1: b, flow: 0 });
const tulipPour = (start, pieces, step) => {
  const segs = [{ t: 0.9, y0: start, y1: start }]; let y = start;
  pieces.forEach(([t, push], i) => { if (i > 0) { segs.push(pause(y, y + step)); y += step; } segs.push({ t, y0: y, y1: y - push }); y -= push; });
  return [...segs, ...pull(y)];
};

// [名称, 倒法, 关卡, 最低分, 最高分]
export const CASES = [
  ['大白心', [{ t: 0.9, y0: 0.4, y1: 0.4 }, { t: 3.4, y0: 0.4, y1: 0.4 }, ...pull(0.4)], 'heart', 60, 100],
  ['千层心（示范）', P.heart.demo, 'heart', 70, 100],
  ['心·没收尾', [{ t: 0.9, y0: 0.4, y1: 0.4 }, { t: 3.4, y0: 0.4, y1: 0.4 }], 'heart', 0, 45],
  // GPU 奶泡里大幅慢摇会出一颗歪扭但有纹路的心，算"有点像了"那一档，所以上限比旧模型宽
  ['心·乱晃', [{ t: 0.9, y0: 0.4, y1: 0.4 }, { t: 3.4, y0: 0.4, y1: 0.4, wig: 0.2, hz: 2 }, ...pull(0.4)], 'heart', 0, 60],
  ['心·倒太少', [{ t: 0.9, y0: 0.4, y1: 0.4 }, { t: 1.0, y0: 0.4, y1: 0.4 }, ...pull(0.4)], 'heart', 0, 60],
  ['郁金香（示范）', P.tulip.demo, 'tulip', 65, 100],
  ['郁金香·只推2片', tulipPour(0.3, [[2.6, 0.35], [1.0, 0.08]], 0.18), 'tulip', 0, 45],
  ['郁金香·退太多', tulipPour(0.35, [[1.4, 0.15], [0.8, 0.1], [0.55, 0.07], [0.4, 0.05]], 0.3), 'tulip', 0, 30],
  ['郁金香·没收尾', P.tulip.demo.slice(0, -2), 'tulip', 0, 55],
  ['千层心放到郁金香关', P.heart.demo, 'tulip', 0, 35],
  ['树叶（示范）', P.rosetta.demo, 'rosetta', 65, 100],
  ['树叶·不往后退', [{ t: 0.9, y0: 0.05, y1: 0.05 }, { t: 5.2, y0: 0.05, y1: 0.05, wig: 0.14, hz: 4 }, ...pull(0.05)], 'rosetta', 0, 55],
  ['树叶·不摆动', [{ t: 0.9, y0: 0.05, y1: 0.05 }, { t: 3.6, y0: 0.05, y1: 0.05 }, { t: 1.6, y0: 0.05, y1: 0.65 }, ...pull(0.65)], 'rosetta', 0, 45],
  ['树叶·没收尾', P.rosetta.demo.slice(0, -2), 'rosetta', 0, 55],
  ['千层心放到树叶关', P.heart.demo, 'rosetta', 0, 45],
  ['树叶放到心形关', P.rosetta.demo, 'heart', 0, 35],
  ['郁金香放到心形关', P.tulip.demo, 'heart', 0, 30],
];

export function check(extra = []) {
  let fail = 0;
  const rows = [];
  for (const [name, segs, pid, lo, hi] of [...CASES, ...extra]) {
    const r = scorePour(run(segs), P[pid]);
    const ok = r.score >= lo && r.score <= hi;
    if (!ok) fail++;
    rows.push(`${ok ? '  ok ' : 'FAIL '} ${name.padEnd(14, '　')} ${pid.padEnd(8)} ${String(r.score).padStart(3)}  (期望 ${lo}–${hi})`);
  }
  return { fail, rows };
}

if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  const { fail, rows } = check();
  console.log(rows.join('\n'));
  console.log(`\n${fail ? fail + ' 项不通过' : '全部通过'}（${((Date.now() - t0) / 1000).toFixed(1)}s）`);
  process.exit(fail ? 1 : 0);
}
