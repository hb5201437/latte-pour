// 几何（大理石纹）拉花引擎：不解流体方程。游戏里树叶用它（marblefoam.js 包一层），proto/marble.html 可以直接用手指倒。
// 思路来自 "Mathematical Marbling"（Lu, Jaffer, Jin, Zhao, Mao, IEEE CG&A 2012）：
// 图案 = 一组闭合折线（每次浮上来的一团奶泡 / 一条被夹住的咖啡面），
// 每一帧对所有顶点做面积守恒的变换（滴落、吸入、拉线），折线被拉长时自动补点，所以线条永远是清楚的。
//
// 坐标：杯口直径 = 1，原点在杯心，+Y 朝上 = 前方（远离拉花缸）。拉花缸在屏幕下方。
// 颜色：0 = 白奶泡，1 = 褐色（咖啡面）。背景本身就是咖啡面，所以"褐色"和背景同色。

// ---------- 参数（都可以用网址 ?p={"rate":0.15} 覆盖） ----------
export const P = {
  // —— 浮上来多少、在哪儿浮 ——
  rate: 0.3,        // 每秒浮上来的面积（杯口直径² 为单位）；整杯面积 0.785，成品图案大约 0.4
  taper: 0.5,       // 越往后（靠近拉花缸那侧）浮上量越少：rate × (1 - taper × 后退程度)，后面的叶子更小
  taperY: 0.35,     // 后退到这个距离（直径单位，杯心往后）时 taper 用满
  ahead: 0.09,      // 浮出点在奶柱落点前方多远（奶柱斜着冲进去，奶在前面浮上来）
  sink: 0.6,        // 奶柱落点吸走的面积 / 浮上面积（落点后面的液面往奶柱里流，把每一圈的后端收拢、吃掉 → 前面是弧）
  sinkBack: 0.01,   // 吸入点在落点后方多远
  sinkBackMul: 0.4, // 往后退时吸入的倍数（小 = 外圈弧线不跟着落点被拖到底部，轮廓更圆）
  absorbR: 0,       // 落点旁边沉下去的圆的半径（直径单位）：奶泡在这里被切断，弧线留下钝头（0 = 关）
  absorbBack: 0.02, // 沉下去的圆心在落点后方多远
  // —— 摇：折叠出褐线 ——
  swing: 0.3,       // 原地摇时奶柱方向最大偏转角（弧度）：小，弧线基本同心
  trans: 0.25,      // 浮出点跟着拉花缸横移的比例（1 = 字面平移；大了左右分成两团）
  brownThr: 0.5,    // 横向速度 / 本轮峰值 超过这个比例时浮上来的是褐色（两次折叠之间夹住的咖啡面）
  folds: 1,         // 每个摇动周期出几条褐线：2 = 往左、往右各一次（线多而细）；1 = 只在往右摆时（线少而粗）
  brownRate: 0.9,   // 褐色那一段的面积倍数（控制褐线粗细）
  // —— 往后退：手腕转，奶被甩向两边 → S 形蛇 → 交错的叶子 ——
  backV: 0.08,      // 落点往后移动快于这个（直径/秒）算"往后退"
  swingBack: 4,     // 往后退时偏转角是原地摇的几倍（0.3×4 = 1.2 弧度）
  aheadBack: 0.07,  // 往后退时浮出点离落点多远（甩得越远，蛇越弯）
  backEnds: 1,      // 往后退时褐色出现在哪里：0 = 摆过中线时（同原地摇），1 = 摆到两端时（甩到一边的奶之间夹进咖啡面）
  backEndThr: 0.6,  // backEnds=1 时：|位移| / 峰值 超过这个出褐色
  backBrown: 0.4,   // 往后退时褐色段的面积倍数（0 = 后退时只出白）
  swingPhase: 0,    // 偏转角跟谁同相：0 = 跟左右位移（摆到哪边甩向哪边），1 = 跟横向速度
  hpTau: 0.3,       // 横移高通的时间常数（秒）：区分"左右摇"和"整体移动"
  pkTau: 0.5,       // 摇动峰值的衰减时间（秒）
  minAmp: 0.012,    // 摇动幅度低于这个（直径单位）当作没摇
  phaseFold: 0,     // 1 = 按摆动相位出褐（见 phaseColor），不看速度：节奏、幅度变了也稳
  inW: 0.35,        // phaseFold：原地摇时过中线后出褐的时长（半周期的比例）
  backW: 0.35,      // phaseFold：往后退时摆到两端出褐的宽度（半周期的比例）
  // —— 抬高拉过 ——
  liftCut: 1,       // 抬高时浮上量减少的比例（1 = 抬高时不再出奶泡）
  sinkLift: 0.08,   // 抬高时奶柱还在吸的面积（每秒）：抬高停顿时落点的奶泡被吸走、露出咖啡面，接着被拉成叶脉
  cut: 0.5,         // 拉线：奶柱经过时带着液面往前走的比例（<1，否则液面一直粘在奶柱前面被推到底）
  cutW: 0.02,       // 拉线横向衰减宽度（只在中线附近拐出 V，不拖一整条宽带）
  cutLen: 0.05,     // 拉线影响奶柱后方多长；一个点总共被带走 ≈ cut·cutLen/(1-cut)
  cutAhead: 0.004,  // 奶柱前方的影响长度（很短：只推不铲）
  cutCore: 0.38,    // 拉线正中心额外的带动比例（cut + cutCore 接近 1：中线上的一丝咖啡面被一路带走 → 细褐色叶脉）
  cutCoreW: 0.005,  // 中心那一丝的宽度（叶脉粗细）
  cutSink: 0,       // 拉线时沿路径吸走的面积（每单位长度）
  // —— 几何 / 数值 ——
  wall: 0.47,       // 杯壁：顶点不超过这个半径
  maxSeg: 0.0035,   // 折线最长线段（直径单位）：超过就在原像上细分
  tol: 0.00025,     // 删点容差：去掉一个点后偏离不超过这个就删
  dt: 1 / 60,       // 模拟步长
  fusionNoFoam: 1,  // 示范倒法里 step:'fusion' 的段不出奶泡
};

// rosetta 标准示范倒法（和游戏 patterns.js 里 fluid.demo 同格式：y 以半径为单位，+ = 往后靠近拉花缸）
export const ROSETTA = [
  { t: 0.9, y0: 0.05, y1: 0.05, step: 'fusion' },
  { t: 2.1, y0: 0.05, y1: 0.05, wig: 0.14, hz: 3, step: 'wiggle' },
  { t: 1.5, y0: 0.05, y1: 0.65, wig: 0.14, hz: 3, step: 'back' },
  { t: 0.15, y0: 0.65, y1: 0.65, step: 'dot' },
  { t: 0.15, y0: 0.65, y1: 0.65, lift: 1, step: 'pull' },
  { t: 0.3, y0: 0.65, y1: -0.55, lift: 1, step: 'pull' },
];

const WHITE = 0, BROWN = 1;

export class Marble {
  constructor(params = {}) {
    this.p = { ...P, ...params };
    this.reset();
  }
  reset() {
    this.polys = [];       // { c: 颜色, a: [x0,y0,x1,y1,...], bb: [minx,miny,maxx,maxy] }，越后越新
    this.t = 0;
    this.prev = null;      // 上一帧输入（落点）
    this.ema = null;       // 横移的低通（高通 = x - ema）
    this.pkX = 0; this.pkV = 0;
    this.S = null; this.C = null; this.color = WHITE;
    this.ms = 0; this.frames = 0;
    this.side = 0; this.sinceX = 9; this.half = 0; this.crossDir = 0;
  }

  // 一帧。inp = { x, y（直径单位，杯心原点，+y 前方）, pour: bool, flow, lift, foam: bool }
  // 是否"往后退"由落点速度自己判断，实时输入和示范倒法走同一条路
  step(inp, dt = this.p.dt) {
    const t0 = performance.now(), p = this.p;
    this.t += dt;
    if (!inp.pour) { this.prev = null; this.ema = null; this.S = null; this.lastS = null; this.vyS = 0; return; }
    const prev = this.prev || inp;
    if (this.ema == null) this.ema = inp.x;
    this.ema += (inp.x - this.ema) * Math.min(1, dt / p.hpTau);
    const xd = inp.x - this.ema;                       // 左右摇的位移
    const vx = (inp.x - prev.x) / dt;                  // 横向速度
    this.vyS = (this.vyS || 0) + ((inp.y - prev.y) / dt - (this.vyS || 0)) * Math.min(1, dt / 0.1);
    const back = this.vyS < -p.backV;                  // 正在往后退（往拉花缸方向）
    const kx = Math.exp(-dt / p.pkTau);
    this.pkX = Math.max(Math.abs(xd), this.pkX * kx, p.minAmp);
    this.pkV = Math.max(Math.abs(vx), this.pkV * kx, p.minAmp * 2 * Math.PI * 2);
    const al = p.swingPhase * Math.PI / 2;
    const sw = Math.max(-1, Math.min(1, Math.cos(al) * xd / this.pkX + Math.sin(al) * vx / this.pkV)) * (this.pkX > p.minAmp * 1.01 ? 1 : 0);
    const th = p.swing * (back ? p.swingBack : 1) * sw;
    const S = [inp.x * p.trans, inp.y];
    const ah = back ? p.aheadBack : p.ahead;
    const C = [S[0] + ah * Math.sin(th), S[1] + ah * Math.cos(th)];
    let color = Math.abs(vx) / this.pkV > p.brownThr && this.pkX > p.minAmp * 1.01 && (p.folds > 1 || vx > 0) ? BROWN : WHITE;
    if (back && p.backEnds) color = Math.abs(xd) / this.pkX > p.backEndThr && this.pkX > p.minAmp * 1.01 ? BROWN : WHITE;
    if (p.phaseFold) color = this.phaseColor(xd, back, dt);
    if (back && color === BROWN && p.backBrown <= 0) color = WHITE;
    this.S = S; this.C = C; this.color = color;

    const lift = inp.lift || 0, flow = inp.flow ?? 1;
    const ops = [];
    const tp = 1 - p.taper * Math.max(0, Math.min(1, -S[1] / p.taperY));
    const area = p.rate * tp * flow * (1 - lift * p.liftCut) * dt;
    // 1) 落点吸入（液面往奶柱里流）
    const sinkA = area * p.sink * (back ? p.sinkBackMul : 1) + p.sinkLift * lift * flow * dt;
    if (sinkA > 0) {
      const rs2 = sinkA / Math.PI;
      ops.push({ k: 1, x: S[0], y: S[1] - p.sinkBack, r2: rs2 });
    }
    // 1b) 落点旁边一小块奶泡直接沉下去（absorbR > 0）：每一圈的后端被切掉、留下钝的断头，
    //     而不是被吸口拉成一束细线聚到落点（视频里扇形的弧在落点前就断开，不会收成一个尖）
    if (p.absorbR > 0 && !lift) ops.push({ k: 3, x: S[0], y: S[1] - p.absorbBack, r: p.absorbR });
    // 2) 浮出点滴落
    let addCircle = null;
    if (inp.foam !== false && area > 0) {
      const a = area * (color === BROWN ? p.brownRate * (back ? Math.max(p.backBrown, 0) || 1 : 1) : 1);
      const r2 = a / Math.PI;
      ops.push({ k: 0, x: C[0], y: C[1], r2 });
      if (this.colorAt(C[0], C[1]) !== color) addCircle = { x: C[0], y: C[1], r: Math.sqrt(r2), c: color };
    }
    // 3) 拉线：抬高时奶柱带着中线附近的液面往前走
    const mx = S[0] - (this.lastS ? this.lastS[0] : S[0]), my = S[1] - (this.lastS ? this.lastS[1] : S[1]);
    const ml = Math.hypot(mx, my);
    if (lift > 0 && ml > 1e-6) {
      ops.push({ k: 2, x: S[0], y: S[1], ux: mx / ml, uy: my / ml, len: ml * p.cut * lift, w: p.cutW, wb: p.cutLen, wa: p.cutAhead, lc: ml * p.cutCore * lift, wc: p.cutCoreW });
      if (p.cutSink > 0) ops.push({ k: 1, x: S[0], y: S[1], r2: p.cutSink * ml * lift / Math.PI });
    }
    this.lastS = S;
    this.prev = inp;
    if (ops.length) this.apply(ops);
    if (addCircle) this.polys.push(circle(addCircle.x, addCircle.y, addCircle.r, addCircle.c, p.maxSeg));
    this.ms += performance.now() - t0; this.frames++;
  }

  // 按摆动相位决定浮上来的是白还是褐（phaseFold = 1）：只看奶柱什么时候过中线（左右方向），不看摇得多快多大。
  // 每过一次中线记一次，按两次过中线的间隔估计半个周期；
  //   原地摇：过中线之后的 inW 个半周期出褐（folds = 1 时只在往右过中线时出，一个来回一条线）
  //   往后退：摆到两端（半周期的中段）出褐，宽 backW 个半周期
  // 节奏快慢、幅度大小变了，每一摆还是折出一道干净的线
  phaseColor(xd, back, dt) {
    const p = this.p, h = p.minAmp * 0.5;
    this.side = this.side || 0;
    const side = xd > h ? 1 : xd < -h ? -1 : this.side;
    this.sinceX = (this.sinceX ?? 9) + dt;
    if (side !== this.side) {
      if (this.side !== 0 && this.sinceX > 0.06) this.half = this.half ? this.half + (Math.min(0.5, this.sinceX) - this.half) * 0.5 : Math.min(0.5, this.sinceX);
      this.crossDir = side; this.side = side; this.sinceX = 0;
    }
    if (!this.half || this.pkX <= p.minAmp * 1.01) return WHITE;
    const ph = this.sinceX / this.half; // 这一摆走到哪儿了（0 = 刚过中线，1 = 下一次过中线）
    if (back && p.backEnds) return Math.abs(ph - 0.5) < p.backW / 2 ? BROWN : WHITE;
    // 往后退、backEnds = 0：奶被甩到两边成白色叶片，每次过中线（不分方向）都夹进一道咖啡面 → 左右交错的叶子
    if (back) return ph < p.backW ? BROWN : WHITE;
    return ph < p.inW && (p.folds > 1 || this.crossDir > 0) ? BROWN : WHITE;
  }

  // 把一串变换作用到所有折线；线段被拉长时在原像上细分，太密时删点
  apply(ops) {
    const p = this.p, W = p.wall, W2 = W * W;
    const out = [0, 0];
    const f = (x, y) => {
      for (const o of ops) {
        if (o.k === 0 || o.k === 1) {
          let dx = x - o.x, dy = y - o.y, d2 = dx * dx + dy * dy;
          if (d2 < 1e-14) { dx = 1e-7; dy = 0; d2 = 1e-14; }
          const s = o.k === 0 ? Math.sqrt(1 + o.r2 / d2) : Math.sqrt(Math.max(0, 1 - o.r2 / d2));
          x = o.x + dx * s; y = o.y + dy * s;
        } else if (o.k === 3) {
          // 沉下去：圆内的点推到圆边上（这一段折线贴着圆边，看起来就是被切掉的钝头）
          const dx = x - o.x, dy = y - o.y, d = Math.hypot(dx, dy);
          if (d < o.r) { const s = d > 1e-9 ? o.r / d : 1; x = o.x + (d > 1e-9 ? dx : o.r) * (d > 1e-9 ? s : 1); y = o.y + (d > 1e-9 ? dy * s : 0); }
        } else {
          const dx = x - o.x, dy = y - o.y;
          const a = dx * o.ux + dy * o.uy, d = Math.abs(-dx * o.uy + dy * o.ux);
          // 沿前进方向的窗口：奶柱后方 wb 内满强度（两端平滑），前方很快衰减
          const wa = a > 0 ? Math.exp(-(a / o.wa) * (a / o.wa)) : a > -o.wb ? 1 : Math.exp(-((a + o.wb) / (0.3 * o.wb)) * ((a + o.wb) / (0.3 * o.wb)));
          const k = (o.len * Math.exp(-d / o.w) + o.lc * Math.exp(-d / o.wc)) * wa;
          x += o.ux * k; y += o.uy * k;
        }
      }
      const r2 = x * x + y * y;
      if (r2 > W2) { const s = W / Math.sqrt(r2); x *= s; y *= s; }
      out[0] = x; out[1] = y; return out;
    };
    const L2 = p.maxSeg * p.maxSeg;
    const keep = [];
    for (const poly of this.polys) {
      const a = poly.a, n = a.length / 2, res = [];
      // 先算所有顶点的像
      const fa = new Float64Array(a.length);
      for (let i = 0; i < n; i++) { f(a[2 * i], a[2 * i + 1]); fa[2 * i] = out[0]; fa[2 * i + 1] = out[1]; }
      const sub = (ax, ay, bx, by, fax, fay, fbx, fby, depth) => {
        const ddx = fbx - fax, ddy = fby - fay;
        if (ddx * ddx + ddy * ddy <= L2 || depth > 7) return;
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        f(mx, my); const fmx = out[0], fmy = out[1];
        sub(ax, ay, mx, my, fax, fay, fmx, fmy, depth + 1);
        res.push(fmx, fmy);
        sub(mx, my, bx, by, fmx, fmy, fbx, fby, depth + 1);
      };
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        res.push(fa[2 * i], fa[2 * i + 1]);
        sub(a[2 * i], a[2 * i + 1], a[2 * j], a[2 * j + 1], fa[2 * i], fa[2 * i + 1], fa[2 * j], fa[2 * j + 1], 0);
      }
      const dec = decimate(res, p.maxSeg, p.tol);
      if (dec.length < 6) continue;
      poly.a = dec; poly.bb = bbox(dec);
      if (Math.abs(polyArea(dec)) < 1e-8) continue;
      keep.push(poly);
    }
    this.polys = keep;
  }

  // 某点最上面一层的颜色（没有折线覆盖 = 咖啡面 = 褐色）
  colorAt(x, y) {
    for (let k = this.polys.length - 1; k >= 0; k--) {
      const q = this.polys[k], b = q.bb;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (inside(q.a, x, y)) return q.c;
    }
    return BROWN;
  }

  stats() {
    let v = 0; for (const q of this.polys) v += q.a.length / 2;
    return { polys: this.polys.length, verts: v, msPerStep: this.frames ? this.ms / this.frames : 0 };
  }

  // 画到 2D canvas（size × size）。opt.stream = 画出奶柱落点；opt.bare = 只画液面、铺满画布（量指标用，和摆正的视频帧一致）
  render(ctx, size, opt = {}) {
    const S = size, R = S * 0.5 * (opt.bare ? 1 : 0.94);   // 杯口半径（像素）
    const cx = S / 2, cy = S / 2;
    const k = R * 2;                         // 1 直径单位 = k 像素
    ctx.save();
    ctx.clearRect(0, 0, S, S);
    // 桌面（opt.transparent：游戏里杯子、桌子另外画，这里圆外留透明）
    if (!opt.transparent) { ctx.fillStyle = '#2a1d17'; ctx.fillRect(0, 0, S, S); }
    // 杯沿
    if (!opt.bare) { ctx.beginPath(); ctx.arc(cx, cy, R * 1.055, 0, Math.PI * 2); ctx.fillStyle = '#efe8df'; ctx.fill(); }
    // 咖啡面：中间偏亮、边缘偏暗的 crema
    const g = ctx.createRadialGradient(cx, cy - R * 0.1, R * 0.05, cx, cy, R);
    g.addColorStop(0, '#a8703f'); g.addColorStop(0.6, '#93592d'); g.addColorStop(0.9, '#7a4522'); g.addColorStop(1, '#5e3418');
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    const brown = ctx.createRadialGradient(cx, cy, R * 0.05, cx, cy, R);
    brown.addColorStop(0, '#a46a3a'); brown.addColorStop(1, '#8c5530');
    const white = ctx.createRadialGradient(cx, cy - R * 0.2, R * 0.05, cx, cy, R);
    white.addColorStop(0, '#fbf6ee'); white.addColorStop(0.7, '#f4ead9'); white.addColorStop(1, '#e8d6bb');
    for (const q of this.polys) {
      const a = q.a;
      ctx.beginPath();
      ctx.moveTo(cx + a[0] * k, cy - a[1] * k);
      for (let i = 2; i < a.length; i += 2) ctx.lineTo(cx + a[i] * k, cy - a[i + 1] * k);
      ctx.closePath();
      ctx.fillStyle = q.c === WHITE ? white : brown;
      ctx.fill();
    }
    ctx.restore();
    // 杯壁内侧阴影
    const sh = ctx.createRadialGradient(cx, cy, R * 0.86, cx, cy, R);
    sh.addColorStop(0, 'rgba(40,20,8,0)'); sh.addColorStop(1, 'rgba(40,20,8,0.35)');
    if (!opt.bare) { ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = sh; ctx.fill(); }
    if (opt.stream && this.S) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx + this.S[0] * k, cy - this.S[1] * k, 6, 0, Math.PI * 2); ctx.stroke();
      if (this.C) {
        ctx.fillStyle = this.color === WHITE ? '#fff' : '#5a2f12';
        ctx.beginPath(); ctx.arc(cx + this.C[0] * k, cy - this.C[1] * k, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
}

// ---------- 几何小工具 ----------
function circle(x, y, r, c, seg) {
  const n = Math.max(24, Math.ceil(2 * Math.PI * r / seg));
  const a = new Array(2 * n);
  for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; a[2 * i] = x + r * Math.cos(t); a[2 * i + 1] = y + r * Math.sin(t); }
  return { c, a, bb: [x - r, y - r, x + r, y + r] };
}
function bbox(a) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < a.length; i += 2) {
    const x = a[i], y = a[i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}
function polyArea(a) {
  let s = 0; const n = a.length;
  for (let i = 0; i < n; i += 2) { const j = (i + 2) % n; s += a[i] * a[j + 1] - a[j] * a[i + 1]; }
  return s / 2;
}
function inside(a, x, y) {
  let c = false; const n = a.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const yi = a[i + 1], yj = a[j + 1];
    if ((yi > y) !== (yj > y) && x < (a[j] - a[i]) * (y - yi) / (yj - yi) + a[i]) c = !c;
  }
  return c;
}
// 删点：相邻两段都很短、并且删掉后偏离弦不超过 tol 的点去掉（隔一个删一个，保证不会连删出大误差）
function decimate(a, maxSeg, tol) {
  const n = a.length / 2;
  if (n < 8) return a;
  const out = [];
  let skipped = false;
  const M2 = maxSeg * maxSeg, T2 = tol * tol;
  for (let i = 0; i < n; i++) {
    const px = out.length ? out[out.length - 2] : a[2 * ((i - 1 + n) % n)], py = out.length ? out[out.length - 1] : a[2 * ((i - 1 + n) % n) + 1];
    const x = a[2 * i], y = a[2 * i + 1];
    const j = (i + 1) % n, nx = a[2 * j], ny = a[2 * j + 1];
    const cx = nx - px, cy = ny - py, cl2 = cx * cx + cy * cy;
    if (!skipped && i > 0 && cl2 < M2) {
      // 点到弦的距离²
      const dev = cl2 < 1e-20 ? (x - px) ** 2 + (y - py) ** 2 : ((x - px) * cy - (y - py) * cx) ** 2 / cl2;
      if (dev < T2) { skipped = true; continue; }
    }
    skipped = false;
    out.push(x, y);
  }
  return out;
}

// ---------- 示范倒法 → 每帧输入 ----------
// segs: { t, y0, y1, wig, hz, flow, lift, step }；y、wig 以半径为单位，y + = 靠近拉花缸（屏幕下方）
export function expand(segs, dt = P.dt, p = P) {
  const out = []; let ph = 0, T = 0;
  for (const sg of segs) {
    const n = Math.max(1, Math.round(sg.t / dt));
    for (let i = 0; i < n; i++) {
      const f = (i + 1) / n;
      const yr = sg.y0 + ((sg.y1 ?? sg.y0) - sg.y0) * f;
      ph += 2 * Math.PI * (sg.hz || 0) * dt;
      const xr = (sg.wig || 0) * Math.sin(ph);
      T += dt;
      out.push({
        t: T, x: xr * 0.5, y: -yr * 0.5, pour: true,
        flow: sg.flow ?? 1, lift: sg.lift || 0,
        foam: !(p.fusionNoFoam && sg.step === 'fusion'), step: sg.step,
      });
    }
  }
  return out;
}

// 跑一整段倒法，在指定时间点截图。返回 { final, snaps: [{t, img}], stats, ms }
export function runPour(segs, params = {}, times = [], size = 512, opt = {}) {
  const m = new Marble(params);
  const frames = expand(segs, m.p.dt, m.p);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const snaps = []; const ts = [...times].sort((a, b) => a - b); let ti = 0;
  const t0 = performance.now();
  const statsAt = [];
  for (const fr of frames) {
    m.step(fr, m.p.dt);
    while (ti < ts.length && fr.t >= ts[ti] - 1e-6) {
      m.render(ctx, size, opt); snaps.push({ t: ts[ti], img: cv.toDataURL('image/png'), stats: m.stats() }); ti++;
    }
  }
  const simMs = performance.now() - t0;
  const r0 = performance.now(); m.render(ctx, size, opt); const renderMs = performance.now() - r0;
  return { final: cv.toDataURL('image/png'), snaps, stats: { ...m.stats(), frames: frames.length, simMs, renderMs } };
}
