// 本地调参用：视频成品帧 vs 模拟成品，算白色区域的形状重合度。不部署。
import { runPour } from './harness.js';
import { config } from '../config.js';

const N = 256;

// 视频帧里杯口（液面）椭圆，单位为 400px 宽的帧像素
export const REFS = {
  white: { src: 'ref/white/f_085.jpg', cx: 194, cy: 301, rx: 157, ry: 150 },
  wave: { src: 'ref/wave/f_076.jpg', cx: 208, cy: 296, rx: 157, ry: 151 },
};

export const POURS = {
  white: { wig: 0, hold: 4.5, pull: 0.45, end: -0.75, tilt: true, start: 0.6 },
  wave: { hz: 3.5, wig: 0.05, hold: 5.5, pull: 0.45, end: -0.75, tilt: true, start: 0.6 },
};

function loadImg(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}

// 把椭圆杯口拉成 N×N 的正圆
export async function refCanvas(key) {
  const r = REFS[key];
  const im = await loadImg(r.src);
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.drawImage(im, r.cx - r.rx, r.cy - r.ry, 2 * r.rx, 2 * r.ry, 0, 0, N, N);
  return cv;
}

// 白色区域：先模糊（把千层纹的细线抹掉，只看轮廓），再按亮度阈值
export function foamMask(cv) {
  const g = cv.getContext('2d');
  const { data } = g.getImageData(0, 0, N, N);
  const w = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const r = data[i * 4], gg = data[i * 4 + 1], b = data[i * 4 + 2];
    // 奶泡偏白（蓝通道高），油脂偏棕（蓝通道低）
    w[i] = b > 135 && r > 170 ? 1 : 0;
  }
  const bl = blur(blur(w, 5), 5);
  const m = new Uint8Array(N * N);
  const c = N / 2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (Math.hypot(x - c, y - c) > c * 0.9) continue; // 去掉杯沿
    m[i] = bl[i] > 0.42 ? 1 : 0;
  }
  return m;
}

function blur(src, r) {
  const tmp = new Float32Array(N * N), out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0, n = 0;
    for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < N) { s += src[y * N + xx]; n++; } }
    tmp[y * N + x] = s / n;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0, n = 0;
    for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < N) { s += tmp[yy * N + x]; n++; } }
    out[y * N + x] = s / n;
  }
  return out;
}

function stats(m) {
  let a = 0, sx = 0, sy = 0, x0 = N, x1 = 0, y0 = N, y1 = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (m[y * N + x]) {
    a++; sx += x; sy += y;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { area: a, cx: sx / a, cy: sy / a, w: (x1 - x0) / N, h: (y1 - y0) / N, top: y0 / N, bottom: y1 / N };
}

function iou(a, b, dx = 0, dy = 0) {
  let inter = 0, uni = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const va = a[y * N + x];
    const xb = x - dx, yb = y - dy;
    const vb = xb >= 0 && xb < N && yb >= 0 && yb < N ? b[yb * N + xb] : 0;
    if (va && vb) inter++;
    if (va || vb) uni++;
  }
  return inter / uni;
}

function maskCanvas(m, other) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const im = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const a = m[i], b = other ? other[i] : 0;
    im.data[i * 4] = a ? 255 : 40;
    im.data[i * 4 + 1] = a && b ? 255 : b ? 160 : 40;
    im.data[i * 4 + 2] = b ? 255 : 40;
    im.data[i * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return cv;
}

// 跑一次对比，返回分数；show = true 时把图贴到页面上
export async function compare(key, { overrides = {}, pour = {}, show = true } = {}) {
  const save = {};
  for (const k in overrides) { save[k] = config[k]; config[k] = overrides[k]; }
  const sim = runPour({ ...POURS[key], ...pour });
  Object.assign(config, save);
  const ref = await refCanvas(key);
  const mr = foamMask(ref), ms = foamMask(sim);
  const sr = stats(mr), ss = stats(ms);
  const raw = iou(mr, ms);
  // 形状重合度：把模拟结果的重心对齐到视频再算，只看形状不看位置
  const shape = iou(mr, ms, Math.round(sr.cx - ss.cx), Math.round(sr.cy - ss.cy));
  const res = {
    key, raw: +raw.toFixed(3), shape: +shape.toFixed(3),
    ref: { w: +sr.w.toFixed(2), h: +sr.h.toFixed(2), top: +sr.top.toFixed(2), cy: +(sr.cy / N).toFixed(2), area: +(sr.area / (N * N)).toFixed(3) },
    sim: { w: +ss.w.toFixed(2), h: +ss.h.toFixed(2), top: +ss.top.toFixed(2), cy: +(ss.cy / N).toFixed(2), area: +(ss.area / (N * N)).toFixed(3) },
  };
  if (show) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div class="label">${key} · 位置+形状 IoU ${res.raw} · 只看形状 IoU ${res.shape} · ${JSON.stringify(overrides)}</div>`;
    for (const cv of [ref, sim, maskCanvas(mr, ms)]) row.appendChild(cv);
    document.getElementById('out').appendChild(row);
  }
  return res;
}

// 参数扫描：grid = { 参数名: [候选值...] }，按两颗心的平均形状 IoU 排序
export async function sweep(grid, keys = ['white', 'wave'], pour = {}) {
  const names = Object.keys(grid);
  const combos = [{}];
  for (const k of names) {
    const next = [];
    for (const c of combos) for (const v of grid[k]) next.push({ ...c, [k]: v });
    combos.splice(0, combos.length, ...next);
  }
  const results = [];
  for (const o of combos) {
    const r = {};
    // "pour.xxx" 是倒法参数（入点、时长等），其余是 config
    const ov = {}, pr = {};
    for (const k in o) { if (k.startsWith('pour.')) pr[k.slice(5)] = o[k]; else ov[k] = o[k]; }
    for (const k of keys) r[k] = await compare(k, { overrides: ov, pour: { ...(pour[k] || {}), ...pr }, show: false });
    const score = keys.reduce((s, k) => s + r[k].shape, 0) / keys.length;
    results.push({ o, score: +score.toFixed(3), ...Object.fromEntries(keys.map(k => [k, [r[k].shape, r[k].raw, r[k].sim.w, r[k].sim.h]])) });
  }
  return results.sort((a, b) => b.score - a.score);
}

// 按游戏里的画法放大渲染（加杯壁阴影），和视频并排看质感
export function gameLook(simCv, size = 300) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, 7); g.clip();
  g.drawImage(simCv, 0, 0, size, size);
  return cv;
}

export async function sideBySide(key, pour = {}) {
  const row = document.createElement('div');
  row.className = 'row';
  const ref = await refCanvas(key);
  const big = document.createElement('canvas'); big.width = big.height = 300;
  big.getContext('2d').drawImage(ref, 0, 0, 300, 300);
  const sim = gameLook(runPour({ ...POURS[key], ...pour }));
  for (const c of [big, sim]) { c.style.cssText = 'width:300px;height:300px;border-radius:50%'; row.appendChild(c); }
  document.getElementById('out').appendChild(row);
}

// 过程对比：上排视频帧，下排模拟快照
export async function processCompare(frames, simTimes, pour, key = 'wave') {
  const n = frames.length, cell = 150;
  const cv = document.createElement('canvas');
  cv.width = n * cell; cv.height = 2 * cell + 10;
  const g = cv.getContext('2d');
  g.fillStyle = '#222'; g.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < n; i++) {
    const im = await loadImg(`ref/${key}/f_${String(frames[i]).padStart(3, '0')}.jpg`);
    // 帧是 400×455，杯子大致在下半部，取中间一块
    g.drawImage(im, 20, 110, 360, 345, i * cell + 2, 2, cell - 4, cell - 4);
  }
  const snaps = runPour({ ...pour, snaps: simTimes });
  snaps.forEach((c, i) => g.drawImage(gameLook(c, cell - 4), i * cell + 2, cell + 8));
  return cv;
}

// 同一组时间点，比较几组参数（每组一行）
export function variantRows(variants, simTimes, pour) {
  const cell = 120, n = simTimes.length;
  const cv = document.createElement('canvas');
  cv.width = n * cell; cv.height = variants.length * cell;
  const g = cv.getContext('2d');
  g.fillStyle = '#222'; g.fillRect(0, 0, cv.width, cv.height);
  variants.forEach((v, r) => {
    const save = {};
    for (const k in v) { save[k] = config[k]; config[k] = v[k]; }
    runPour({ ...pour, snaps: simTimes }).forEach((c, i) => g.drawImage(gameLook(c, cell - 4), i * cell + 2, r * cell + 2));
    Object.assign(config, save);
  });
  return cv;
}

// 按"段"倒（推推乐、树叶这种多段手法），返回奶泡模拟
import { FoamSim as _FoamSim } from '../sim.js';
import { Pour as _Pour } from '../pour.js';
export function runSegments(segs) {
  const n = 256, c = n / 2, dt = 1 / 60;
  const sim = new _FoamSim(n), pour = new _Pour();
  let started = false, tt = 0;
  for (const sg of segs) for (let t = 0; t < sg.t; t += dt) {
    const f = t / sg.t, y = c + (sg.y0 + (sg.y1 - sg.y0) * f) * c;
    const x = c + Math.sin(tt * (sg.hz || 0) * 2 * Math.PI) * (sg.wig || 0) * c;
    if (!started) { pour.start(x, y); started = true; }
    sim.step(dt, pour.update(dt, x, y, sg.flow ?? 1, sg.lift ?? null));
    tt += dt;
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d');
  const im = g.createImageData(n, n);
  sim.render(im.data);
  g.putImageData(im, 0, 0);
  return { sim, canvas: cv };
}

// 上排视频成品，下排模拟
export async function finalsCompare(pairs) {
  const cell = 220;
  const cv = document.createElement('canvas');
  cv.width = pairs.length * cell; cv.height = 2 * cell + 30;
  const g = cv.getContext('2d');
  g.fillStyle = '#222'; g.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < pairs.length; i++) {
    const [src, segs, label] = pairs[i];
    const im = await loadImg(src);
    g.drawImage(im, 20, 120, 360, 330, i * cell + 4, 4, cell - 8, (cell - 8) * 330 / 360);
    g.drawImage(gameLook(runSegments(segs).canvas, cell - 8), i * cell + 4, cell + 4);
    g.fillStyle = '#ddd'; g.font = '14px sans-serif'; g.fillText(label, i * cell + 8, 2 * cell + 22);
  }
  return cv;
}
