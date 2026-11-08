import { config } from './config.js';
import { Pour } from './pour.js';

// 引导式模拟（路线图第 1 步）：
// 每个图案有一套标准倒法（patterns.js 里 fluid.demo，每段带 step 标签：fusion 融合、grow 原地长大、
// wiggle 原地摇、back 边摇边退、dot 压低做小心、pull 收尾）。
// 玩家倒的时候按"步骤"对齐（不按秒数）：用玩家自己的输入判断现在在哪一步，
// 这一步里送进物理的 = 标准动作 + (玩家动作 − 标准动作) × assist。
//   assist = 0：完全按标准动作（只有每一步的时长、什么时候进下一步听玩家的）
//   assist = 1：完全按玩家（和没有引导一样）
// 同时量出每一步的偏差，评分用（report()）。
//
// 坐标：内部用"杯口半径"为单位的局部坐标，u = 横向（屏幕右为正），v = 往后（往拉花缸那边为正），杯心为 0。

const clamp01 = x => Math.min(1, Math.max(0, x));
// 偏差换成扣分比例：|err| ≤ free 不扣，≥ bad 扣满
const pen = (err, free, bad) => clamp01((Math.abs(err) - free) / (bad - free));

// 每一步的权重（在步骤分里的占比）；dot 只是锦上添花
const STEP_WEIGHT = { fusion: 0.5, grow: 2, wiggle: 1.2, back: 1.2, dot: 0.3, pull: 1.0 };

// 从示范倒法切出步骤
function buildSteps(demo) {
  const steps = [];
  for (const sg of demo) {
    const id = sg.step || 'grow';
    let st = steps[steps.length - 1];
    if (!st || st.id !== id) { st = { id, segs: [], T: 0 }; steps.push(st); }
    st.segs.push({ ...sg, t0: st.T });
    st.T += sg.t;
  }
  return steps;
}

// 标准动作在这一步第 tau 秒的样子（超过这一步的标准时长就停在最后）
function stdAt(st, tau) {
  let sg = st.segs[st.segs.length - 1];
  for (const s of st.segs) if (tau < s.t0 + s.t) { sg = s; break; }
  const f = clamp01((tau - sg.t0) / sg.t);
  return { v: sg.y0 + (sg.y1 - sg.y0) * f, wig: sg.wig || 0, hz: sg.hz || 0, lift: sg.lift ?? 0 };
}

export class Guide {
  // pattern：patterns.js 的图案；没有带步骤标签的标准倒法时 enabled = false（郁金香暂时不引导）
  constructor(pattern, n, assist = 1) {
    this.n = n;
    this.assist = assist;
    const demo = pattern.fluid?.demo;
    this.enabled = !!demo && demo.some(s => s.step);
    this.steps = this.enabled ? buildSteps(demo) : [];
    // 目标图案引导（fluid.js 的 ctl）：图案在 fluid.target 里声明了才开
    this.useTarget = this.enabled && !!pattern.fluid?.target;
    this.raw = new Pour(); // 玩家原始输入的信号（流量、摇动、抬高），只用来判断步骤和量偏差
    const F = { x: Math.cos(config.forwardAngle), y: Math.sin(config.forwardAngle) };
    this.F = F; this.L = { x: -F.y, y: F.x };
  }

  toLocal(x, y) {
    const c = this.n / 2, dx = (x - c) / c, dy = (y - c) / c;
    return { u: dx * this.L.x + dy * this.L.y, v: -(dx * this.F.x + dy * this.F.y) };
  }
  toGrid(u, v) {
    const c = this.n / 2;
    return { x: c + c * (u * this.L.x - v * this.F.x), y: c + c * (u * this.L.y - v * this.F.y) };
  }

  start(x, y) {
    this.raw.start(x, y);
    this.k = 0;          // 当前第几步
    this.tau = 0;        // 这一步已经多久
    this.theta = 0;      // 标准摇动的相位（轻轻锁到玩家的相位上，看起来跟手）
    this.amp = 0;        // 标准摇动的幅度（平滑过渡）
    this.vb = 0;         // 玩家往后退的速度（半径/秒，平滑）
    this.vbFast = 0;     // 同上，平滑得少（判断停下来用）
    this.du = 0;         // 玩家横向速度（半径/秒，平滑）
    this.last = this.toLocal(x, y);
    this.out = { ...this.last };
    this.moveFor = 0; this.stillFor = 0;
    this.pullLift = 0;
    this.ctl = 0;        // 目标图案引导的强度 0~1（倒得准 → 强）
    this.meas = [];      // 每一步量到的东西
    this.enter(0);
  }

  get step() { return this.steps[this.k]; }
  get inPull() { return this.enabled && this.step?.id === 'pull'; }
  // 标准的收尾动作走完了（游戏该结束了；再停在那里抬高的奶柱会一直往下吸，把图案吸小）
  get pullDone() { return this.inPull && this.tau >= this.step.T; }

  // 标准动作的前后位置。每一步的标准位置从上一步结束时的标准位置接着走（只用这一步的位移），
  // 玩家提前或推迟进下一步时不会跳
  stdV(tau = this.tau) {
    const st = this.step;
    return this.base + stdAt(st, tau).v - st.segs[0].y0;
  }

  enter(k) {
    this.base = this.steps[k - 1] ? this.stdV() : this.steps[0].segs[0].y0;
    this.k = k;
    this.tau = 0;
    this.moveFor = this.stillFor = 0;
    const p = this.last;
    this.meas[k] = { id: this.steps[k].id, time: 0, u0: p.u, v0: p.v, u1: p.u, v1: p.v, offSq: 0, wigTime: 0,
      cross0: this.raw.crossings, halves: [], lastHalf: null, maxDrift: 0, maxUDrift: 0,
      vbSum: 0, vbSq: 0, vbN: 0, liftTime: 0, out0: { ...this.out, c: this.out.u - this.amp * Math.sin(this.theta) * (1 - this.assist) } };
  }

  // 每帧调用：玩家的倒奶点（格）、流量比例、抬高（null = 按往前划的速度推断）。
  // 返回送进物理（和画拉花缸）的倒奶点、流量、抬高
  apply(dt, x, y, flowScale = 1, lift = null) {
    const raw = this.raw.update(dt, x, y, flowScale, lift);
    const p = this.toLocal(x, y);
    const a = 1 - Math.exp(-dt / 0.15);
    this.vb += ((p.v - this.last.v) / dt - this.vb) * a;
    this.vbFast += ((p.v - this.last.v) / dt - this.vbFast) * (1 - Math.exp(-dt / 0.05));
    this.du += ((p.u - this.last.u) / dt - this.du) * (1 - Math.exp(-dt / 0.05));
    this.last = p;
    if (!this.enabled) return { x, y, flowScale, lift, raw, ctl: 0 };

    this.advance(dt, raw, flowScale);
    this.measure(dt, raw, p, flowScale);
    if (this.useTarget) {
      const want = this.liveScore() ** 2;
      this.ctl += (want - this.ctl) * (1 - Math.exp(-dt / 0.3));
    }

    const st = this.step, s = st.id === 'pull' ? null : stdAt(st, this.tau);
    const A = this.assist;
    let u, v, lf;
    if (st.id === 'pull') {
      // 收尾的标准动作从进入收尾时的位置开始（先原地抬高，再快速往前拉）
      // 横向：摇动的余摆很快收回到收尾开始时的中线上，拉一条直线
      const o = this.meas[this.k].out0, d = stdAt(st, this.tau).v - st.segs[0].y0;
      const su = o.c + (o.u - o.c) * Math.exp(-this.tau / 0.05);
      u = su + (p.u - su) * A;
      v = o.v + d + (p.v - (o.v + d)) * A;
      // 玩家这边的抬高取收尾以来的最大值（手指划完停下来，推断出的抬高会掉回去）
      this.pullLift = Math.max(this.pullLift || 0, raw.lift ?? 0);
      lf = stdAt(st, this.tau).lift * (1 - A) + this.pullLift * A;
    } else {
      // 摇动：标准幅度和频率的正弦；玩家在摇时把相位往玩家的相位上拉，拉花缸跟着手摆
      this.amp += (s.wig - this.amp) * (1 - Math.exp(-dt / 0.15));
      const w = 2 * Math.PI * (s.hz || 4);
      let dth = w;
      if (raw.wiggle > 0.25) {
        const off = p.u - this.centerU();
        dth += 6 * Math.sin(Math.atan2(off * w, this.du) - this.theta);
      }
      this.theta += dth * dt;
      const su = this.amp * Math.sin(this.theta);
      u = su + (p.u - su) * A;
      const sv = this.stdV();
      v = sv + (p.v - sv) * A;
      lf = (raw.lift ?? 0) * A;
    }
    // 流量：在倒就按标准（满流量），停了就是停了
    const fs = flowScale > 0.05 ? flowScale + (1 - flowScale) * (1 - A) : flowScale;
    this.out = { u, v };
    if (A >= 1) return { x, y, flowScale, lift, raw, ctl: this.ctl };
    const g = this.toGrid(u, v);
    return { x: g.x, y: g.y, flowScale: fs, lift: lf, raw, ctl: this.ctl };
  }

  centerU() {
    const c = this.n / 2, cc = this.raw.center ?? 0;
    // pour.js 的中线是 (-x·fy + y·fx)，即横向坐标（格，没减杯心）
    return (cc - (c * this.L.x + c * this.L.y)) / c;
  }

  // 判断玩家进到了哪一步（只往后走，可以跳过步骤）
  advance(dt, raw, flowScale) {
    this.tau += dt;
    const ids = this.steps.map(s => s.id);
    const go = id => { const k = ids.indexOf(id, this.k + 1); if (k > this.k) this.enter(k); return k > 0; };
    const id = this.step.id;
    if (id === 'pull') return;
    if ((raw.lift ?? 0) > 0.5) { go('pull'); return; }
    if (id === 'fusion') { if (!raw.fusion) this.enter(this.k + 1); return; }
    const moving = this.vb > 0.12 && flowScale > 0.05, still = Math.abs(this.vbFast) < 0.06;
    this.moveFor = moving ? this.moveFor + dt : 0;
    this.stillFor = still ? this.stillFor + dt : 0;
    const m = this.meas[this.k];
    if ((id === 'grow' || id === 'wiggle') && ids.includes('back') && this.moveFor > 0.15 && this.last.v - m.v0 > 0.04) go('back');
    else if (id === 'back' && ids.includes('dot') && this.stillFor > 0.08 && this.last.v - m.v0 > 0.1) go('dot');
  }

  measure(dt, raw, p, flowScale) {
    const m = this.meas[this.k];
    if (flowScale <= 0.05) return;
    m.time += dt;
    m.u1 = p.u; m.v1 = p.v;
    const cu = this.centerU(), off = p.u - cu;
    m.offSq += off * off * dt;
    m.maxDrift = Math.max(m.maxDrift, Math.abs(p.v - m.v0));
    if (m.cu0 == null) m.cu0 = cu;
    m.maxUDrift = Math.max(m.maxUDrift, Math.abs(cu - m.cu0));
    // 每次过中线记下半个周期，看节奏匀不匀
    if (this.raw.crossings !== (m.lastCross ?? m.cross0)) {
      m.lastCross = this.raw.crossings;
      m.halves.push(this.raw.halfPeriod);
    }
    if (m.id === 'back' && m.time > 0.2) { m.vbSum += this.vb; m.vbSq += this.vb * this.vb; m.vbN++; }
    if (m.id === 'pull' && (raw.lift ?? 0) > 0.5) m.liftTime += dt;
  }

  // 第 k 步的各项偏差：[[扣分比例, 问题名], ...]。live = 这一步还在进行中（不算"太短""退得不够"这种还没结束的项）
  stepPens(k, live = false) {
    const st = this.steps[k], m = this.meas[k], pens = [];
    if (!m || m.time < 0.05) return pens;
    const s0 = stdAt(st, 0), std = { wig: Math.max(...st.segs.map(s => s.wig || 0)), hz: Math.max(...st.segs.map(s => s.hz || 0)) };
    const amp = Math.sqrt(2 * m.offSq / m.time);
    const hz = m.halves.length >= 2 ? m.halves.length / 2 / m.time : 0;
    const halves = m.halves.slice(1);
    const mean = halves.reduce((a, b) => a + b, 0) / Math.max(1, halves.length);
    const cv = halves.length >= 3 ? Math.sqrt(halves.reduce((a, b) => a + (b - mean) ** 2, 0) / halves.length) / mean : 0;
    const ratio = m.time / st.T;
    const dur = (lo, hi) => ratio < 1 ? [pen(Math.log(ratio), Math.log(1 / lo), Math.log(1 / lo) + 0.7), 'short'] : [pen(Math.log(ratio), Math.log(hi), Math.log(hi) + 0.7), 'long'];
    if (st.id === 'fusion') {
      pens.push([pen(Math.hypot(m.u0, m.v0 - s0.v), 0.12, 0.4), 'entry']);
    } else if (st.id === 'grow') {
      // 心形：原地倒，摇不摇都行，但不能大幅乱晃、不能到处挪
      pens.push(dur(0.7, 1.5));
      pens.push([pen(Math.max(0, amp - 0.09), 0, 0.12), 'wild']);
      pens.push([pen(m.maxDrift, 0.1, 0.3), 'drift']);
    } else if (st.id === 'wiggle' || st.id === 'back') {
      const da = amp - std.wig;
      pens.push([pen(da, 0.05, 0.12), da < 0 ? 'small' : 'big']);
      if (amp > 0.03) { const dh = hz - std.hz; pens.push([pen(dh, 1.2, 2.8), dh < 0 ? 'slow' : 'fast']); }
      pens.push([pen(cv, 0.25, 0.7) * 0.7, 'rhythm']);
      if (st.id === 'wiggle') {
        pens.push(dur(0.6, 1.8));
        pens.push([pen(m.maxDrift, 0.08, 0.25), 'drift']);
      } else {
        const dist = m.v1 - m.v0, want = st.segs[st.segs.length - 1].y1 - st.segs[0].y0;
        pens.push([pen(dist - want, 0.12, 0.35), dist < want ? 'short' : 'long']);
        const vbm = m.vbN ? m.vbSum / m.vbN : 0, vcv = vbm > 0 ? Math.sqrt(Math.max(0, m.vbSq / m.vbN - vbm * vbm)) / vbm : 0;
        pens.push([pen(vcv, 0.35, 1.0) * 0.7, 'uneven']);
        pens.push([pen(m.maxUDrift, 0.06, 0.25), 'crooked']);
      }
    } else if (st.id === 'pull') {
      const dv = m.v0 - m.v1, du = m.u1 - m.u0;
      const speed = m.liftTime > 0 ? dv / Math.max(m.liftTime, 0.05) : 0;
      pens.push([pen(Math.max(0, 2 - speed), 0, 1.4), 'slow']);
      if (dv > 0.1) pens.push([pen(du / dv, 0.15, 0.5), 'crooked']);
    }
    return live ? pens.filter(([, name]) => name !== 'short') : pens;
  }

  // 倒到现在为止做得多准（0~1）：做完的步骤 + 正在做的这一步。目标图案引导按这个调强弱
  liveScore() {
    let sc = 1;
    for (let k = 0; k <= this.k; k++) for (const [pp] of this.stepPens(k, k === this.k)) sc *= 1 - pp;
    return sc;
  }

  // 每一步的偏差和得分。返回 { score 0~100, steps: [{ id, score, done }], tip }
  // tip：扣分最多的那一项，格式 'step_<步骤>_<问题>'（文案在 i18n.js 的 tipStep_...），没收尾时为 'pull'
  report() {
    if (!this.enabled || !this.meas) return null;
    const out = [];
    let sum = 0, wsum = 0, worst = { loss: 0.15, tip: null }; // 扣得太少的不提示
    const blame = (W, loss, tip) => { if (W * loss > worst.loss) worst = { loss: W * loss, tip }; };
    this.steps.forEach((st, k) => {
      const W = STEP_WEIGHT[st.id] ?? 1, m = this.meas[k];
      // 压低做小心很短、可做可不做：没做就不算这一步
      if (st.id === 'dot' && (!m || m.time < 0.05)) return;
      wsum += W;
      if (!m || m.time < 0.05) {
        out.push({ id: st.id, score: 0, done: false });
        if (st.id !== 'fusion') blame(W, 1, st.id === 'pull' ? 'pull' : `step_${st.id}_missing`);
        return;
      }
      const pens = this.stepPens(k);
      let sc = 1;
      for (const [pp, name] of pens) { sc *= 1 - pp; blame(W, pp, `step_${st.id}_${name}`); }
      sum += W * sc;
      out.push({ id: st.id, score: Math.round(sc * 100), done: true });
    });
    // 没收尾的图案只是一团，步骤分再打五折
    const pulled = out.find(s => s.id === 'pull')?.done !== false;
    return { score: Math.round((sum / wsum) * (pulled ? 100 : 50)), steps: out, tip: worst.tip };
  }
}
