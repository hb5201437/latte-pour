// 拉花图案的定量指标：视频摆正后的帧和模拟器的截图走同一套量法，比"像不像"看数字，不靠眼睛。
// 输入：正方形图，杯口（液面）是内切圆；方向和游戏一样（拉花缸在下方，前方朝上）。
// 用法：
//   node dev/reftools/metrics.mjs ref.png sim.png [更多 sim.png ...]      打印指标对照表 + 每张和第一张的差距分
//   node dev/reftools/metrics.mjs --overlay out.png ref.png sim.png      再出一张轮廓叠图（白 = 两者都有，红 = 只有参考，绿 = 只有模拟）
import { execFileSync } from 'node:child_process';

const G = 256; // 量的时候统一缩到这个尺寸

export function load(path) {
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', path, '-vf', `scale=${G}:${G}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: G * G * 3 + 1024 });
  return raw;
}

const R0 = 0.95; // 只看这个半径以内（杯沿附近有阴影、反光）

// 分类：1 = 奶泡（白），0 = 咖啡，-1 = 看不清（拉花缸、奶柱：偏蓝灰；圆外）
export function classify(rgb) {
  const cls = new Int8Array(G * G).fill(-1), lum = new Float32Array(G * G);
  const known = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const u = ((i + 0.5) / G) * 2 - 1, v = ((j + 0.5) / G) * 2 - 1;
    if (u * u + v * v > R0 * R0) continue;
    const k = j * G + i, r = rgb[k * 3], g = rgb[k * 3 + 1], b = rgb[k * 3 + 2];
    const L = 0.3 * r + 0.59 * g + 0.11 * b;
    // 不锈钢和奶柱：蓝不比红少，而且不暗
    if (b >= r - 2 && L > 90) continue;
    cls[k] = 0;
    // 用"暖度"（红 − 蓝）分：奶泡接近中性白，咖啡油脂（深的浅的都是）明显偏橙。暗的一律算咖啡
    lum[k] = L < 110 ? 255 : Math.min(255, Math.max(0, r - b));
    known.push(lum[k]);
  }
  // Otsu 阈值：自动分开白和咖啡（视频和模拟的颜色不一样，各用各的阈值）
  const hist = new Array(256).fill(0);
  for (const l of known) hist[Math.min(255, Math.round(l))]++;
  let sum = 0, n = known.length; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, th = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue; const wF = n - wB; if (!wF) break;
    sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2;
    if (v > best) { best = v; th = i; }
  }
  for (let k = 0; k < G * G; k++) if (cls[k] === 0 && lum[k] <= th) cls[k] = 1;
  return cls;
}

// 形态学：圆形结构元素膨胀/腐蚀（r 格）
function morph(m, r, grow) {
  const out = new Uint8Array(G * G), offs = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) offs.push([dx, dy]);
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    let hit = !grow;
    for (const [dx, dy] of offs) {
      const xx = x + dx, yy = y + dy, v = xx >= 0 && yy >= 0 && xx < G && yy < G ? m[yy * G + xx] : 0;
      if (grow ? v : !v) { hit = grow; break; }
    }
    out[y * G + x] = hit ? 1 : 0;
  }
  return out;
}

// 图案轮廓：把条纹之间的咖啡色缝合上（闭运算），再把被包住的洞填满（从圆外往里灌）
export function silhouette(cls, r = Math.round(G * 0.04)) {
  let m = new Uint8Array(G * G);
  for (let k = 0; k < G * G; k++) m[k] = cls[k] === 1 ? 1 : 0;
  m = morph(morph(m, r, true), r, false);
  const outside = new Uint8Array(G * G), st = [];
  for (let k = 0; k < G * G; k++) { const i = k % G, j = (k / G) | 0; if (i === 0 || j === 0 || i === G - 1 || j === G - 1) { outside[k] = 1; st.push(k); } }
  while (st.length) {
    const k = st.pop(), i = k % G, j = (k / G) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= G || jj >= G) continue;
      const kk = jj * G + ii; if (outside[kk] || m[kk]) continue; outside[kk] = 1; st.push(kk);
    }
  }
  const s = new Uint8Array(G * G);
  for (let k = 0; k < G * G; k++) s[k] = outside[k] ? 0 : 1;
  return s;
}

// 沿一条线数条纹：只算轮廓以内、看得清的格；返回 { stripes: 咖啡色线条数, white: 白带平均宽, brown: 咖啡带平均宽 }（单位：杯口半径）
function along(cls, sil, pts) {
  const runs = []; let cur = null, len = 0;
  for (const [i, j] of pts) {
    const k = j * G + i, c = sil[k] && cls[k] >= 0 ? cls[k] : null;
    if (c === cur) { len++; continue; }
    if (cur != null) runs.push([cur, len]);
    cur = c; len = 1;
  }
  if (cur != null) runs.push([cur, len]);
  // 夹在两段白之间的咖啡段才算一条线（去掉 1 格的噪点）
  const brown = [], white = [];
  for (let n = 0; n < runs.length; n++) {
    const [c, l] = runs[n];
    if (c === 1) white.push(l);
    else if (c === 0 && l >= 2 && runs[n - 1]?.[0] === 1 && runs[n + 1]?.[0] === 1) brown.push(l);
  }
  const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length / (G / 2) : 0);
  return { stripes: brown.length, white: avg(white), brown: avg(brown) };
}

export function analyze(rgb) {
  const cls = classify(rgb), sil = silhouette(cls);
  let known = 0, white = 0, sArea = 0, sIn = 0, sWhite = 0, cx = 0, cy = 0;
  let top = 1, bot = -1, left = 1, right = -1;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const k = j * G + i, u = ((i + 0.5) / G) * 2 - 1, v = ((j + 0.5) / G) * 2 - 1;
    if (cls[k] >= 0) { known++; if (cls[k] === 1) white++; }
    if (!sil[k]) continue;
    sArea++; cx += u; cy += v;
    top = Math.min(top, v); bot = Math.max(bot, v); left = Math.min(left, u); right = Math.max(right, u);
    if (cls[k] >= 0) { sIn++; if (cls[k] === 1) sWhite++; }
  }
  const disc = Math.PI * (G / 2 * R0) ** 2;
  // 不同高度的宽度（v 朝下 = 往拉花缸那边；-0.5 = 靠前方）
  const widths = {};
  for (const v of [-0.6, -0.3, 0, 0.3, 0.6]) {
    const j = Math.round(((v + 1) / 2) * G);
    let a = G, b = -1; for (let i = 0; i < G; i++) if (sil[j * G + i]) { a = Math.min(a, i); b = Math.max(b, i); }
    widths[v] = b >= a ? (b - a + 1) / (G / 2) : 0;
  }
  const line = (u0, v0, u1, v1) => { const pts = [], n = G * 2; for (let s = 0; s <= n; s++) { const u = u0 + (u1 - u0) * s / n, v = v0 + (v1 - v0) * s / n; pts.push([Math.min(G - 1, Math.max(0, Math.floor((u + 1) / 2 * G))), Math.min(G - 1, Math.max(0, Math.floor((v + 1) / 2 * G)))]); } return pts.filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]); };
  const vert = [along(cls, sil, line(-0.2, -1, -0.2, 1)), along(cls, sil, line(0.2, -1, 0.2, 1))];
  const horiz = [-0.4, 0, 0.4].map(v => along(cls, sil, line(-1, v, 1, v)));
  const mean = (a, f) => a.reduce((x, y) => x + f(y), 0) / a.length;
  // 大片没纹路的白：离任何咖啡色超过 0.15 个半径的白色，占轮廓的比例（真拉花里纹路铺满，这个很小）
  const brownMask = new Uint8Array(G * G);
  for (let k = 0; k < G * G; k++) brownMask[k] = sil[k] && cls[k] === 0 ? 1 : 0;
  const near = morph(brownMask, Math.round(0.15 * G / 2), true);
  let plain = 0; for (let k = 0; k < G * G; k++) if (sil[k] && cls[k] === 1 && !near[k]) plain++;
  return {
    m: {
      foam: +(white / Math.max(1, known)).toFixed(3),               // 杯面里白色的比例
      size: +(sArea / disc).toFixed(3),                              // 图案轮廓占杯面的比例
      inBrown: +(1 - sWhite / Math.max(1, sIn)).toFixed(3),          // 轮廓里咖啡色线占的比例
      cx: +(cx / Math.max(1, sArea)).toFixed(3), cy: +(cy / Math.max(1, sArea)).toFixed(3),
      top: +top.toFixed(2), bottom: +bot.toFixed(2), left: +left.toFixed(2), right: +right.toFixed(2),
      w_f60: +widths[-0.6].toFixed(2), w_f30: +widths[-0.3].toFixed(2), w_0: +widths[0].toFixed(2), w_b30: +widths[0.3].toFixed(2), w_b60: +widths[0.6].toFixed(2),
      stripesV: +mean(vert, x => x.stripes).toFixed(1),              // 竖着穿过（离中线 0.2）数到几条线
      stripesH: +mean(horiz, x => x.stripes).toFixed(1),             // 横着穿过三道数到几条线（平均）
      whiteBand: +mean([...vert, ...horiz], x => x.white).toFixed(3),
      brownBand: +mean([...vert, ...horiz], x => x.brown).toFixed(3),
      plain: +(plain / Math.max(1, sArea)).toFixed(3),
    },
    cls, sil,
  };
}

// 差距分（0 = 一样）：每项按"多大算明显不同"归一化后取平均；另外算轮廓重合度
// 分两组：形状（大小、位置、各高度宽度）和纹路（条纹数、带宽、轮廓里咖啡色比例、大片白）。两组等权，纹路不能被形状盖过去
const SHAPE = { foam: 0.1, size: 0.1, cx: 0.1, cy: 0.1, top: 0.1, bottom: 0.1, left: 0.1, right: 0.1,
  w_f60: 0.15, w_f30: 0.15, w_0: 0.15, w_b30: 0.15, w_b60: 0.15 };
const TEXTURE = { inBrown: 0.05, stripesV: 2, stripesH: 2, whiteBand: 0.03, brownBand: 0.02, plain: 0.05 };
const SCALE = { ...SHAPE, ...TEXTURE };
export function compare(a, b) {
  const per = {};
  const group = G => { let s = 0, n = 0; for (const k in G) { const d = Math.abs(a.m[k] - b.m[k]) / G[k]; per[k] = +d.toFixed(2); s += Math.min(d, 5); n++; } return s / n; };
  const shape = group(SHAPE), texture = group(TEXTURE);
  const s = shape + texture, n = 2;
  // 轮廓重合度只算两张图都看得清的格（被拉花缸挡住的地方不算）
  let inter = 0, uni = 0; for (let k = 0; k < G * G; k++) { if (a.cls[k] < 0 || b.cls[k] < 0) continue; if (a.sil[k] && b.sil[k]) inter++; if (a.sil[k] || b.sil[k]) uni++; }
  return { dist: +(s / n).toFixed(2), shape: +shape.toFixed(2), texture: +texture.toFixed(2), iou: +(inter / Math.max(1, uni)).toFixed(3), per };
}

export function overlay(a, b, path) {
  const out = Buffer.alloc(G * G * 3);
  for (let k = 0; k < G * G; k++) {
    const A = a.sil[k], B = b.sil[k];
    const c = A && B ? [235, 230, 220] : A ? [220, 60, 50] : B ? [60, 190, 80] : (b.cls[k] === 1 ? [90, 90, 90] : [30, 20, 15]);
    out.set(c, k * 3);
  }
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${G}x${G}`, '-i', '-', path], { input: out });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let args = process.argv.slice(2), ov = null;
  if (args[0] === '--overlay') { ov = args[1]; args = args.slice(2); }
  const res = args.map(p => analyze(load(p)));
  const keys = Object.keys(res[0].m);
  console.log('指标'.padEnd(10) + args.map(p => p.split('/').pop().slice(0, 12).padStart(13)).join(''));
  for (const k of keys) console.log(k.padEnd(10) + res.map(r => String(r.m[k]).padStart(13)).join(''));
  for (let i = 1; i < res.length; i++) { const c = compare(res[0], res[i]); console.log(`${args[i]}: 差距 ${c.dist}  轮廓重合 ${c.iou}  最大差 ${Object.entries(c.per).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k, v]) => k + ' ' + v).join(', ')}`); }
  if (ov) overlay(res[0], res[1], ov);
}
