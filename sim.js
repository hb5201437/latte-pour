import { config } from './config.js';

// 奶泡模型：一张 n×n 的浓度场，0 = 咖啡，1 = 新鲜奶泡。
// 每帧做两件事：
//   1. 按速度场把浓度"搬运"一步（半拉格朗日：从每格往回追踪取样）
//   2. 在奶柱落点注入新奶泡
// 速度场 = 落点处的"源"（新奶泡把旧的往外推，面积守恒）
//        + 奶柱移动时拖着附近奶泡一起走（晃动、穿心都靠这个）
// 不追求物理正确，只求看起来像。
export class FoamSim {
  constructor(n) {
    this.n = n;
    this.d = new Float32Array(n * n);
    this.tmp = new Float32Array(n * n);
    this.inside = new Uint8Array(n * n);
    this.bg = new Uint8ClampedArray(n * n * 3);

    const c = (n - 1) / 2;
    const R = n / 2;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (Math.hypot(x - c, y - c) <= R + 1) this.inside[y * n + x] = 1;
      }
    }
    this.buildCrema();
  }

  reset() {
    this.d.fill(0);
  }

  // 咖啡表面：中心偏浅的油脂色，向边缘变深，加一点低频斑驳
  buildCrema() {
    const { n, bg } = this;
    const noise = new Float32Array(n * n).map(() => Math.random());
    const blurred = boxBlur(boxBlur(boxBlur(noise, n, 4), n, 4), n, 4);
    const c = (n - 1) / 2;
    for (let i = 0; i < n * n; i++) {
      const x = i % n, y = (i / n) | 0;
      const r = Math.min(1, Math.hypot(x - c, y - c) / (n / 2));
      const t = r * r;
      const v = 0.88 + (blurred[i] - 0.5) * 0.9;
      bg[i * 3] = (148 - 80 * t) * v;
      bg[i * 3 + 1] = (92 - 54 * t) * v;
      bg[i * 3 + 2] = (52 - 32 * t) * v;
    }
  }

  // src: { x, y, vx, vy, q }，坐标/速度用格，q 为每秒新增面积（格²）
  step(dt, src) {
    const { n, d, tmp, inside } = this;
    const k = src.q / (2 * Math.PI);
    const sig2 = config.dragRadius * config.dragRadius;
    const dragCut = sig2 * 9;
    const drag = config.dragStrength;
    const vmax = config.maxStepCells;
    const floor = config.foamFloor;
    const age = config.foamAgeRate * dt;
    const sharpen = config.edgeSharpen * dt;
    const mid = (config.edgeLo + config.edgeHi) / 2;
    const bias = config.forwardBias;
    const fx = Math.cos(config.forwardAngle), fy = Math.sin(config.forwardAngle);

    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        if (!inside[i]) { tmp[i] = 0; continue; }
        const dx = x - src.x, dy = y - src.y;
        const r2 = dx * dx + dy * dy + 1;
        // 奶泡主要往前（远离拉花缸）推，落点因此留在奶泡后缘
        const push = 1 + (bias * (dx * fx + dy * fy)) / Math.sqrt(r2);
        let ux = (k * push * dx) / r2;
        let uy = (k * push * dy) / r2;
        if (r2 < dragCut) {
          const g = Math.exp(-r2 / sig2) * drag;
          ux += src.vx * g;
          uy += src.vy * g;
        }
        let bx = ux * dt, by = uy * dt;
        const len = Math.hypot(bx, by);
        if (len > vmax) { bx *= vmax / len; by *= vmax / len; }
        let v = sample(d, n, x - bx, y - by);
        if (v > floor) v = Math.max(floor, v - age);
        else if (v > 0) {
          // 搬运会把边缘越抹越糊，这里把中间值往两头推，保持轮廓利落
          v += sharpen * (v - mid);
          v = v < 0 ? 0 : v > floor ? floor : v;
        }
        tmp[i] = v;
      }
    }

    // 奶柱落点注入新奶泡，流量小时落点也变细
    const rIn = config.streamRadius * Math.sqrt(src.q / config.flowMax);
    if (rIn > 0.05) {
      // 边缘按距离给部分浓度，细奶柱也是连续的线而不是一串点
      const reach = rIn + 1;
      const x0 = Math.max(0, Math.floor(src.x - reach)), x1 = Math.min(n - 1, Math.ceil(src.x + reach));
      const y0 = Math.max(0, Math.floor(src.y - reach)), y1 = Math.min(n - 1, Math.ceil(src.y + reach));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const w = Math.min(1, rIn + 0.5 - Math.hypot(x - src.x, y - src.y));
          const i = y * n + x;
          if (w > tmp[i]) tmp[i] = w;
        }
      }
    }

    this.d = tmp;
    this.tmp = d;
  }

  // 写入 RGBA 像素（长度 n*n*4）
  render(out) {
    const { n, d, bg } = this;
    const { edgeLo, edgeHi, haloLo, haloStrength, foamFloor } = config;
    for (let i = 0; i < n * n; i++) {
      const v = d[i];
      const a = smoothstep(edgeLo, edgeHi, v);
      const halo = smoothstep(haloLo, edgeLo, v) * (1 - a) * haloStrength;
      const br = bg[i * 3] * (1 - halo);
      const bgc = bg[i * 3 + 1] * (1 - halo);
      const bb = bg[i * 3 + 2] * (1 - halo);
      // 旧奶泡偏奶油色，新奶泡偏白
      const t = Math.min(1, Math.max(0, (v - foamFloor) / (1 - foamFloor)));
      const fr = 236 + 14 * t, fg = 222 + 25 * t, fb = 200 + 38 * t;
      const j = i * 4;
      out[j] = br + (fr - br) * a;
      out[j + 1] = bgc + (fg - bgc) * a;
      out[j + 2] = bb + (fb - bb) * a;
      out[j + 3] = 255;
    }
  }
}

function sample(d, n, x, y) {
  const m = n - 1.001;
  if (x < 0) x = 0; else if (x > m) x = m;
  if (y < 0) y = 0; else if (y > m) y = m;
  const x0 = x | 0, y0 = y | 0;
  const fx = x - x0, fy = y - y0;
  const i = y0 * n + x0;
  const top = d[i] + (d[i + 1] - d[i]) * fx;
  const bot = d[i + n] + (d[i + n + 1] - d[i + n]) * fx;
  return top + (bot - top) * fy;
}

function smoothstep(a, b, v) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function boxBlur(src, n, r) {
  const out = new Float32Array(n * n);
  const tmp = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let s = 0, c = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < n) { s += src[y * n + xx]; c++; }
      }
      tmp[y * n + x] = s / c;
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let s = 0, c = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < n) { s += tmp[yy * n + x]; c++; }
      }
      out[y * n + x] = s / c;
    }
  }
  return out;
}
