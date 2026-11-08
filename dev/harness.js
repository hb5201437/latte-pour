// 本地调参用：脚本模拟倒奶路径，一次画多张结果。不部署。
import { FoamSim } from '../sim.js';
import { Pour } from '../pour.js';
import { config } from '../config.js';

export function runPour(o = {}) {
  const n = config.gridSize, sim = new FoamSim(n), pour = new Pour(), dt = 1 / 60, c = n / 2;
  const T1 = o.hold ?? 3.0, T2 = o.pull ?? 0.3, wig = o.wig ?? 0.08, hz = o.hz ?? 3.5;
  const start = o.start ?? 0.3, end = o.end ?? -0.85, back = o.back ?? 0;
  const path = [];
  for (let t = 0; t < T1; t += dt) {
    path.push([c + Math.sin(t * hz * 2 * Math.PI) * wig * c * Math.min(1, t / 0.5), c + start * c - back * c * t / T1]);
  }
  // 陀螺仪收尾：先原地抬高 raise 秒
  const raise = o.tilt ? (o.raise ?? config.liftRaiseMs / 1000) : 0;
  const raiseStart = path.length;
  for (let t = 0; t < raise; t += dt) path.push(path[path.length - 1].slice());
  const pullStart = path.length;
  const ly = path[path.length - 1][1], ye = c + end * c;
  for (let t = 0; t < T2; t += dt) path.push([c, ly + (ye - ly) * (t / T2)]);
  pour.start(path[0][0], path[0][1]);
  const snaps = [];
  const want = (o.snaps || []).slice();
  let t = 0;
  for (let k = 0; k < path.length; k++) {
    const [x, y] = path[k];
    // o.tilt：模拟陀螺仪模式，收尾时直接抬高
    const lift = !o.tilt || k < raiseStart ? null : k >= pullStart ? 1 : (k - raiseStart) * dt / raise;
    sim.step(dt, pour.update(dt, x, y, o.flow ?? 1, lift));
    t += dt;
    while (want.length && t >= want[0]) { want.shift(); snaps.push(draw(sim, n, x, y)); }
  }
  if (o.returnSim) return sim;
  return o.snaps ? snaps : draw(sim, n);
}

function draw(sim, n, sx, sy) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d');
  const im = g.createImageData(n, n);
  sim.render(im.data);
  g.putImageData(im, 0, 0);
  if (sx != null) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(sx, sy, 3, 0, 7); g.fill(); }
  return cv;
}

// 一次倒奶的过程快照，一行排开
export function showSequence(o, times, cols = 6) {
  const host = getHost(cols);
  for (const cv of runPour({ ...o, snaps: times })) {
    cv.style.cssText = 'width:100%;aspect-ratio:1;border-radius:50%';
    host.appendChild(cv);
  }
}

function getHost(cols) {
  let host = document.getElementById('testhost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'testhost';
    document.body.appendChild(host);
  }
  host.style.cssText = `position:fixed;inset:0;z-index:99;background:#222;display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:4px;align-content:start`;
  host.innerHTML = '';
  return host;
}

export function showPours(list, cfgVariants = []) {
  const host = getHost(2);
  list.forEach((o, i) => {
    const v = cfgVariants[i] || {}, save = {};
    for (const k in v) { save[k] = config[k]; config[k] = v[k]; }
    const cv = runPour(o);
    Object.assign(config, save);
    cv.style.cssText = 'width:100%;aspect-ratio:1;border-radius:50%';
    host.appendChild(cv);
  });
}
