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
    this.area = 0;
    this.box = null;
    this.bg = new Uint8ClampedArray(n * n * 3);

    const c = (n - 1) / 2;
    const R = n / 2;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (Math.hypot(x - c, y - c) <= R + 1) this.inside[y * n + x] = 1;
      }
    }
    this.buildCrema();
    // 杯壁暗角，直接算进渲染（比每帧画一层渐变省很多）
    this.vig = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const r = Math.hypot((i % n) - c, ((i / n) | 0) - c) / R;
      this.vig[i] = 1 - 0.22 * smoothstep(0.8, 1, r);
    }
  }

  reset() {
    this.d.fill(0);
    this.p.fill(0);
    this.fusion = 0;
    this.area = 0;   // 累计倒入的奶泡面积（格²）
    this.box = null; // 有奶泡的范围 [x0, y0, x1, y1]，只算这块，省性能
  }

  // 咖啡表面：偏橙的焦糖色油脂，向杯壁略深；加一圈圈沿杯壁方向拉长的细纹（融合时搅出来的）
  buildCrema() {
    const { n, bg } = this;
    const noise = new Float32Array(n * n).map(() => Math.random());
    const blotch = boxBlur(boxBlur(boxBlur(noise, n, 4), n, 4), n, 4);
    // 极坐标里的噪声：沿角度方向大幅模糊、沿半径方向几乎不模糊，映射回来就是一圈圈的细纹
    const RN = 40, AN = 720;
    const pn = new Float32Array(RN * AN).map(() => Math.random());
    const streak = new Float32Array(RN * AN);
    const win = 24;
    for (let r = 0; r < RN; r++) {
      let s = 0;
      for (let k = -win; k <= win; k++) s += pn[r * AN + ((k + AN) % AN)];
      for (let a = 0; a < AN; a++) {
        streak[r * AN + a] = s / (2 * win + 1);
        s += pn[r * AN + ((a + win + 1) % AN)] - pn[r * AN + ((a - win + AN) % AN)];
      }
    }
    const c = (n - 1) / 2;
    for (let i = 0; i < n * n; i++) {
      const x = i % n, y = (i / n) | 0;
      const rr = Math.hypot(x - c, y - c) / (n / 2);
      const r = Math.min(1, rr);
      const t = r * r;
      // 稍微螺旋一点，纹路不是正圆
      const ang = (Math.atan2(y - c, x - c) / (2 * Math.PI) + 1 + r * 0.15) % 1;
      const st = streak[Math.min(RN - 1, (r * (RN - 1)) | 0) * AN + ((ang * AN) | 0)];
      const v = 0.94 + (blotch[i] - 0.5) * 0.35 + (st - 0.5) * 0.7;
      bg[i * 3] = (184 - 46 * t) * v;
      bg[i * 3 + 1] = (114 - 34 * t) * v;
      bg[i * 3 + 2] = (64 - 22 * t) * v;
    }
  }

  // src: { x, y, vx, vy, q, phase, fusion }，坐标/速度用格，q 为每秒新增面积（格²），
  // phase 为当前晃动相位（每晃过一次中线 +1），fusion = true 表示还在融合阶段
  step(dt, src) {
    if (src.fusion) {
      if (src.q > 0) this.fusion = Math.min(1, this.fusion + (dt * (0.6 + 0.4 * src.q / config.flowMax)) / config.fusionSec);
      this.fusionX = src.x; this.fusionY = src.y;
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
    // 奶钻到液面下，在落点前方浮上来（ox, oy），奶泡从那里往外长。
    // 奶泡越大、流量越大，浮出点离落点越远；抬高收流时奶泡就在落点旁边冒出来，往两侧包成两瓣
    if (src.q > 0) this.area += src.q * dt;
    // 左右晃的时候奶柱一直在动、钻不深，奶泡就在落点附近冒出来，纹路因此在奶柱处收拢
    const ahead = config.surfaceAhead + config.surfaceAheadFrac * Math.sqrt(this.area / Math.PI) *
      Math.pow(src.q / config.flowMax, config.surfaceAheadFlowExp) * (1 - config.wiggleAheadCut * (src.wiggle ?? 0));
    const ox = src.x + fx * ahead, oy = src.y + fy * ahead;
    // 奶柱本身往前冲，把落点后面的咖啡卷进奶泡后缘，自然形成心形上方的凹口
    // 抬高后奶柱更细但落得更猛，冲力不减，把凹口扎深
    const jet = config.jetSpeed * Math.max(src.q / config.flowMax, (src.lift ?? 0) * config.liftJet);
    const jr = config.jetRadius * (1 + config.liftJetWiden * (src.lift ?? 0));
    const jsig2 = jr * jr;
    // 抬高收尾：奶柱拖曳范围变窄，并把两侧奶泡往奶柱的路径上压
    const lift = src.lift ?? 0;
    const speed = Math.hypot(src.vx, src.vy);
    const tx = speed > 1 ? src.vx / speed : fx, ty = speed > 1 ? src.vy / speed : fy;
    const squeeze = config.liftSqueeze * lift * speed;
    const qsig2 = config.liftSqueezeRadius * config.liftSqueezeRadius;
    const dsig = config.dragRadius * (1 - (1 - config.liftDragNarrow) * lift);
    const dsig2 = dsig * dsig;
    // 抬高收尾时奶泡像一张膜被整体带动：中间窄而强，外圈宽而弱，层层纹路被拉成 V
    const tailAmp = config.liftDragTail * lift;
    const tsig2 = config.liftDragTailRadius * config.liftDragTailRadius;
    const tailCut = tailAmp > 0 ? tsig2 * 6 : 0;

    // 只算"已有奶泡的范围 + 奶柱周围"：别处全是 0，搬运后还是 0
    const pad = vmax + 2;
    const reachS = Math.max(config.dragRadius, config.jetRadius) * 3 + config.streamRadius + config.surfaceAhead + 2;
    let bx0 = Math.floor(Math.min(src.x, ox) - reachS), by0 = Math.floor(Math.min(src.y, oy) - reachS);
    let bx1 = Math.ceil(Math.max(src.x, ox) + reachS), by1 = Math.ceil(Math.max(src.y, oy) + reachS);
    if (this.box) {
      bx0 = Math.min(bx0, this.box[0] - pad); by0 = Math.min(by0, this.box[1] - pad);
      bx1 = Math.max(bx1, this.box[2] + pad); by1 = Math.max(by1, this.box[3] + pad);
    }
    bx0 = Math.max(0, bx0); by0 = Math.max(0, by0);
    bx1 = Math.min(n - 1, bx1); by1 = Math.min(n - 1, by1);
    tmp.fill(0);
    ptmp.fill(0);

    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        const i = y * n + x;
        if (!inside[i]) continue;
        const dx = x - ox, dy = y - oy;
        const r2 = dx * dx + dy * dy + 1;
        // 前方多推一点、后方往回收，落点因此留在奶泡后缘
        const cos = (dx * fx + dy * fy) / Math.sqrt(r2);
        const push = 1 + cos * (cos > 0 ? biasFront : biasBack);
        let ux = (k * push * dx) / r2;
        let uy = (k * push * dy) / r2;
        const sdx = x - src.x, sdy = y - src.y;
        const s2 = sdx * sdx + sdy * sdy;
        if (s2 < dragCut || s2 < tailCut) {
          let g = s2 < dragCut ? Math.exp(-s2 / dsig2) * drag : 0;
          if (tailAmp > 0) g += Math.exp(-s2 / tsig2) * tailAmp;
          ux += src.vx * g;
          uy += src.vy * g;
        }
        if (squeeze > 0 && s2 < qsig2 * 4) {
          // 离奶柱路径的横向距离，往路径方向收；只收奶柱前方和两侧，后面的两瓣不动
          const off = -sdx * ty + sdy * tx;
          const along = sdx * tx + sdy * ty;
          const front = along > 0 ? 1 : Math.exp(-(along * along) / (qsig2 * 0.25));
          const g = Math.exp(-s2 / qsig2) * squeeze / config.liftSqueezeRadius * front;
          ux += ty * off * g;
          uy += -tx * off * g;
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
    // 贴近液面时落点粗；抬高后只剩一条细线
    const rLow = config.streamRadius * Math.sqrt(src.q / config.flowMax);
    const rIn = rLow + (config.liftLineRadius - rLow) * lift;
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

    // 更新奶泡范围
    let nx0 = n, ny0 = n, nx1 = -1, ny1 = -1;
    for (let y = by0; y <= by1; y++) {
      const row = y * n;
      for (let x = bx0; x <= bx1; x++) {
        if (tmp[row + x] > 0.01) {
          if (x < nx0) nx0 = x; if (x > nx1) nx1 = x;
          if (y < ny0) ny0 = y; if (y > ny1) ny1 = y;
        }
      }
    }
    this.box = nx1 >= 0 ? [nx0, ny0, nx1, ny1] : null;

    this.d = tmp;
    this.tmp = d;
    this.p = ptmp;
    this.ptmp = p;
  }

  // 写入 RGBA 像素（长度 n*n*4）
  render(out) {
    const { n, d, p, bg, vig } = this;
    const { edgeLo, edgeHi, haloLo, haloStrength, foamFloor, lineFrac, lineStrength } = config;
    // 融合让油脂变浅，入点附近最明显
    const fu0 = this.fusion * config.fusionLighten;
    const fxc = this.fusionX ?? n / 2, fyc = this.fusionY ?? n / 2;
    const fr2 = (n * 0.35) ** 2;
    const halfBand = lineFrac / 2;
    const ph = i => (d[i] > 0.05 ? p[i] / d[i] : 0);
    for (let i = 0; i < n * n; i++) {
      const v = d[i];
      // 轮廓用周围 5 格的平均值，边缘有一格多的柔和过渡，放大后不会出锯齿
      const vs = i >= n && i < n * n - n ? (v * 2 + d[i - 1] + d[i + 1] + d[i - n] + d[i + n]) / 6 : v;
      const a = smoothstep(edgeLo, edgeHi, vs);
      // 晕边：奶泡外缘一圈浅金棕色（奶泡变薄、透出油脂）
      const halo = smoothstep(haloLo, edgeLo, vs) * (1 - a) * haloStrength;
      let fu = 0;
      if (fu0 > 0) {
        const ddx = (i % n) - fxc, ddy = ((i / n) | 0) - fyc;
        fu = fu0 * (0.45 + 0.55 * Math.exp(-(ddx * ddx + ddy * ddy) / fr2));
      }
      let br = bg[i * 3] + (205 - bg[i * 3]) * fu;
      let bgc = bg[i * 3 + 1] + (150 - bg[i * 3 + 1]) * fu;
      let bb = bg[i * 3 + 2] + (100 - bg[i * 3 + 2]) * fu;
      br += (214 - br) * halo; bgc += (165 - bgc) * halo; bb += (112 - bb) * halo;
      // 旧奶泡偏奶油色，新奶泡偏白
      const t = Math.min(1, Math.max(0, (v - foamFloor) / (1 - foamFloor)));
      let fr = 238 + 12 * t, fg = 226 + 20 * t, fb = 206 + 32 * t;
      // 千层纹：相位跨过整数处画一道色带，宽度占每层间距的 lineFrac，层被挤密的地方色带也跟着变细（和真的一样）
      let la = 0;
      if (v > foamFloor - 0.02) {
        const x = i % n;
        if (x > 0 && x < n - 1 && i >= n && i < n * n - n) {
          const pc = p[i] / v;
          const gx = (ph(i + 1) - ph(i - 1)) / 2, gy = (ph(i + n) - ph(i - n)) / 2;
          const g = Math.hypot(gx, gy);
          if (g > 1e-4 && g < 0.6) {
            // 换算成格：离线中心多少格、线半宽多少格（被拉得很开的地方也不超过上限，保持细线）
            const distCells = Math.abs(pc - Math.round(pc)) / g;
            const hw = Math.min(halfBand / g, config.lineMaxHalfWidth);
            la = (1 - smoothstep(hw - 0.8, hw + 0.8, distCells)) * lineStrength;
            // 刚倒下去还没被推开的地方（梯度很大）不画，避免落点附近一团乱线
            la *= 1 - smoothstep(0.25, 0.6, g);
          }
        }
      }
      fr += (190 - fr) * la; fg += (128 - fg) * la; fb += (78 - fb) * la;
      const j = i * 4;
      const vg = vig[i];
      out[j] = (br + (fr - br) * a) * vg;
      out[j + 1] = (bgc + (fg - bgc) * a) * vg;
      out[j + 2] = (bb + (fb - bb) * a) * vg;
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
