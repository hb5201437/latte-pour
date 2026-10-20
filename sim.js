import { config } from './config.js';

// 奶泡模型：两张 n×n 的场
//   d：奶泡浓度，0 = 咖啡，1 = 新鲜奶泡
//   p：这团奶泡是第几次晃动时倒进去的（连续值，存成 p×d 以免和咖啡混在边缘出假线）
// 每帧做两件事：
//   1. 按速度场把两张场"搬运"一步（半拉格朗日：从每格往回追踪取样）
//   2. 在奶柱落点注入新奶泡，记下当前晃动相位
// 画面上 p 每跨过一个整数就画一道咖啡色带 = 每次晃动时奶泡的轮廓，层层套起来就是千层心。
// 另有"融合"阶段：刚开始倒的奶沉到咖啡下面，表面不出白，只是油脂颜色慢慢变浅。
// 速度场 = 落点处的"源"（新奶泡把旧的往外推，面积守恒）
//        + 奶柱移动时拖着附近奶泡一起走（晃动、穿心都靠这个）
// 不追求物理正确，只求看起来像。
export class FoamSim {
  constructor(n) {
    this.n = n;
    this.d = new Float32Array(n * n);
    this.tmp = new Float32Array(n * n);
    this.p = new Float32Array(n * n);
    this.ptmp = new Float32Array(n * n);
    this.inside = new Uint8Array(n * n);
    this.fusion = 0; // 融合进度 0~1，表面变浅的程度
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
    this.p.fill(0);
    this.fusion = 0;
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

  // src: { x, y, vx, vy, q, phase, fusion }，坐标/速度用格，q 为每秒新增面积（格²），
  // phase 为当前晃动相位（每晃过一次中线 +1），fusion = true 表示还在融合阶段
  step(dt, src) {
    if (src.fusion) {
      if (src.q > 0) this.fusion = Math.min(1, this.fusion + dt / config.fusionSec);
      return;
    }
    const { n, d, tmp, p, ptmp, inside } = this;
    const k = src.q / (2 * Math.PI);
    const sig2 = config.dragRadius * config.dragRadius;
    const dragCut = sig2 * 9;
    const drag = config.dragStrength;
    const vmax = config.maxStepCells;
    const floor = config.foamFloor;
    const age = config.foamAgeRate * dt;
    const sharpen = config.edgeSharpen * dt;
    const mid = (config.edgeLo + config.edgeHi) / 2;
    const biasFront = config.forwardBias, biasBack = config.backPull;
    const fx = Math.cos(config.forwardAngle), fy = Math.sin(config.forwardAngle);
    // 奶沉下去一点再浮上来，白色出现在落点稍前方（ox, oy），奶泡从那里往外长
    const ox = src.x + fx * config.surfaceAhead, oy = src.y + fy * config.surfaceAhead;
    // 奶柱本身往前冲，把落点后面的咖啡卷进奶泡后缘，自然形成心形上方的凹口
    const jet = config.jetSpeed * (src.q / config.flowMax);
    const jsig2 = config.jetRadius * config.jetRadius;

    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        if (!inside[i]) { tmp[i] = 0; ptmp[i] = 0; continue; }
        const dx = x - ox, dy = y - oy;
        const r2 = dx * dx + dy * dy + 1;
        // 前方多推一点、后方往回收，落点因此留在奶泡后缘
        const cos = (dx * fx + dy * fy) / Math.sqrt(r2);
        const push = 1 + cos * (cos > 0 ? biasFront : biasBack);
        let ux = (k * push * dx) / r2;
        let uy = (k * push * dy) / r2;
        const sdx = x - src.x, sdy = y - src.y;
        const s2 = sdx * sdx + sdy * sdy;
        if (s2 < dragCut) {
          const g = Math.exp(-s2 / sig2) * drag;
          ux += src.vx * g;
          uy += src.vy * g;
        }
        if (jet > 0 && s2 < jsig2 * 9) {
          const g = Math.exp(-s2 / jsig2) * jet;
          ux += fx * g;
          uy += fy * g;
        }
        let bx = ux * dt, by = uy * dt;
        const len = Math.hypot(bx, by);
        if (len > vmax) { bx *= vmax / len; by *= vmax / len; }
        const sx = x - bx, sy = y - by;
        const v0 = sample(d, n, sx, sy);
        let v = v0;
        if (v > floor) v = Math.max(floor, v - age);
        else if (v > 0) {
          // 搬运会把边缘越抹越糊，这里把中间值往两头推，保持轮廓利落
          v += sharpen * (v - mid);
          v = v < 0 ? 0 : v > floor ? floor : v;
        }
        tmp[i] = v;
        // p×d 跟着 d 同比例变化，保证 p 本身不变
        ptmp[i] = v0 > 1e-4 ? sample(p, n, sx, sy) * (v / v0) : 0;
      }
    }

    // 奶柱落点注入新奶泡，流量小时落点也变细
    const phase = src.phase ?? 0;
    const rIn = config.streamRadius * Math.sqrt(src.q / config.flowMax);
    if (rIn > 0.05) {
      // 边缘按距离给部分浓度，细奶柱也是连续的线而不是一串点
      const reach = rIn + 1;
      const x0 = Math.max(0, Math.floor(ox - reach)), x1 = Math.min(n - 1, Math.ceil(ox + reach));
      const y0 = Math.max(0, Math.floor(oy - reach)), y1 = Math.min(n - 1, Math.ceil(oy + reach));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const w = Math.min(1, rIn + 0.5 - Math.hypot(x - ox, y - oy));
          if (w <= 0) continue;
          const i = y * n + x;
          tmp[i] += (1 - tmp[i]) * w;
          ptmp[i] += (phase * tmp[i] - ptmp[i]) * w;
        }
      }
    }

    this.d = tmp;
    this.tmp = d;
    this.p = ptmp;
    this.ptmp = p;
  }

  // 写入 RGBA 像素（长度 n*n*4）
  render(out) {
    const { n, d, p, bg } = this;
    const { edgeLo, edgeHi, haloLo, haloStrength, foamFloor, lineFrac, lineStrength } = config;
    // 融合让油脂整体变浅
    const fu = this.fusion * config.fusionLighten;
    const halfBand = lineFrac / 2;
    const ph = i => (d[i] > 0.05 ? p[i] / d[i] : 0);
    for (let i = 0; i < n * n; i++) {
      const v = d[i];
      const a = smoothstep(edgeLo, edgeHi, v);
      const halo = smoothstep(haloLo, edgeLo, v) * (1 - a) * haloStrength;
      const br = (bg[i * 3] + (200 - bg[i * 3]) * fu) * (1 - halo);
      const bgc = (bg[i * 3 + 1] + (150 - bg[i * 3 + 1]) * fu) * (1 - halo);
      const bb = (bg[i * 3 + 2] + (108 - bg[i * 3 + 2]) * fu) * (1 - halo);
      // 旧奶泡偏奶油色，新奶泡偏白
      const t = Math.min(1, Math.max(0, (v - foamFloor) / (1 - foamFloor)));
      let fr = 236 + 14 * t, fg = 222 + 25 * t, fb = 200 + 38 * t;
      // 千层纹：相位跨过整数处画一道色带，宽度占每层间距的 lineFrac，层被挤密的地方色带也跟着变细（和真的一样）
      let la = 0;
      if (v > foamFloor - 0.02) {
        const x = i % n;
        if (x > 0 && x < n - 1 && i >= n && i < n * n - n) {
          const pc = p[i] / v;
          const gx = (ph(i + 1) - ph(i - 1)) / 2, gy = (ph(i + n) - ph(i - n)) / 2;
          const g = Math.hypot(gx, gy);
          if (g > 1e-4 && g < 0.6) {
            const dist = Math.abs(pc - Math.round(pc));
            const aa = g * 0.8; // 约 0.8 格的抗锯齿
            la = (1 - smoothstep(halfBand - aa, halfBand + aa, dist)) * lineStrength;
            // 刚倒下去还没被推开的地方（梯度很大）不画，避免落点附近一团乱线
            la *= 1 - smoothstep(0.25, 0.6, g);
          }
        }
      }
      fr += (176 - fr) * la; fg += (124 - fg) * la; fb += (84 - fb) * la;
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
