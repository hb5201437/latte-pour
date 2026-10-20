import { config } from './config.js';

// 倒奶控制：输入每帧倒奶点位置（格），输出给奶泡模型的奶柱参数。
// 手指模式和之后的陀螺仪模式共用这一套规则。
export class Pour {
  constructor() {
    this.start(0, 0);
  }

  start(x, y) {
    this.px = x; this.py = y;
    this.vx = this.vy = 0;   // 平滑后的瞬时速度
    this.dx = this.dy = 0;   // 平滑后的"净移动"速度
    this.elapsed = 0;
    this.flowTime = 0;       // 实际在出奶的累计时间（融合阶段用）
    this.foamTime = 0;       // 出白以后的时间
    this.q = 0;
    this.side = 0;           // 当前在中线哪一侧 -1 / 1
    this.peak = 0;           // 本次晃动的最大横向速度
    this.center = null;      // 晃动中线（横向位置的慢速平均）
    this.crossings = 0;      // 有效晃动（过中线）次数
    this.lastCross = 0;      // 上次过中线的时间
    this.halfPeriod = 0.15;  // 估计的半个晃动周期（秒）
    this.pausedFor = 0;      // 已经停流多久（秒），停够了再出奶算新的一层（郁金香）
    this.piece = 0;          // 第几片（推推乐每停一下再推，算新的一片）
    this.hasPoured = false;
    this.wiggle = 0;         // 晃动强度 0~1
  }

  // flowScale：额外的流量比例（陀螺仪模式下由前倾角决定，手指模式为 1）
  // lift：拉花缸抬起的高度 0~1，不传则按往前移动的速度推断（手指模式快速往前划 = 抬高收尾）
  update(dt, x, y, flowScale = 1, lift = null) {
    this.elapsed += dt;
    const ivx = (x - this.px) / dt, ivy = (y - this.py) / dt;
    this.px = x; this.py = y;
    const av = 1 - Math.exp((-dt * 1000) / config.velTauMs);
    const ad = 1 - Math.exp((-dt * 1000) / config.driftTauMs);
    this.vx += (ivx - this.vx) * av;
    this.vy += (ivy - this.vy) * av;
    this.dx += (ivx - this.dx) * ad;
    this.dy += (ivy - this.dy) * ad;

    // 流量：只有快速往前（心尖方向）划才降流量，即"穿心"；
    // 原地、左右晃、往回收都保持满流量
    const fx = Math.cos(config.forwardAngle), fy = Math.sin(config.forwardAngle);
    const drift = Math.max(0, this.dx * fx + this.dy * fy);
    // 融合：先倒一段时间不出白
    // 融合主要按时间算（流量只稍微影响快慢），轻轻倾斜也能很快出白，不会像没反应
    if (flowScale > 0) this.flowTime += dt * (0.6 + 0.4 * flowScale);
    const fusion = this.flowTime < config.fusionSec;
    if (!fusion) this.foamTime += dt;
    const ramp = Math.min(1, (this.foamTime * 1000) / config.flowRampMs);
    // 抬高：奶柱变细、沉下去不出白，只把两边的图案往中间压，拉出细线收尾
    if (lift == null) {
      const t = Math.min(1, Math.max(0, (drift / config.pullSpeed - 0.3) / 0.6));
      lift = t * t * (3 - 2 * t);
    }
    this.q = config.flowMax * Math.max(config.flowMinFrac, 1 - lift) * ramp * flowScale;

    // 千层纹：每次晃过中线记一次。奶泡模型按这个计数在每次晃动的奶泡轮廓上画线。
    // 中线 = 横向位置的慢速平均。
    const lateralPos = -x * fy + y * fx;
    const lateralVel = -this.vx * fy + this.vy * fx;
    const ac = 1 - Math.exp((-dt * 1000) / config.wiggleCenterTauMs);
    this.center = this.center == null ? lateralPos : this.center + (lateralPos - this.center) * ac;
    this.peak = Math.max(this.peak, Math.abs(lateralVel));
    // 晃动强度：横向速度的慢速平均
    const aw = 1 - Math.exp((-dt * 1000) / config.wiggleTauMs);
    this.wiggle += (Math.min(1, Math.abs(lateralVel) / config.wiggleFullSpeed) - this.wiggle) * aw;
    const off = lateralPos - this.center;
    const side = off > config.wiggleHysteresis ? 1 : off < -config.wiggleHysteresis ? -1 : this.side;
    if (side !== this.side) {
      if (this.side !== 0 && this.peak > config.wiggleMinSpeed && drift < config.pullSpeed * 0.5) {
        this.halfPeriod = Math.min(0.6, Math.max(0.05, this.elapsed - this.lastCross));
        this.lastCross = this.elapsed;
        this.crossings++;
      }
      this.side = side;
      this.peak = 0;
    }
    // 两次过中线之间按时间插值，让相位连续；不晃了就停在接近下一个整数处，不再出新线
    // 停一下再推（郁金香的手法）：停流超过 pushPause 后重新出奶，算新的一层，
    // 两层交界处会画分隔线
    const flowing = flowScale > 0.05 && (lift ?? 0) < 0.5 && !fusion;
    if (flowing) {
      if (this.hasPoured && this.pausedFor > config.pushPause) {
        this.crossings = Math.ceil((this.crossings + 1) / config.crossingsPerLine) * config.crossingsPerLine;
        this.lastCross = this.elapsed;
        this.piece++;
      }
      this.hasPoured = true;
      this.pausedFor = 0;
    } else if (this.hasPoured) {
      this.pausedFor += dt;
    }
    const phase = (this.crossings + Math.min(0.95, (this.elapsed - this.lastCross) / this.halfPeriod)) / config.crossingsPerLine;

    this.lift = lift;
    if (fusion) this.q = config.flowMax * flowScale; // 融合阶段的流量只用来推进融合进度和画奶柱
    return { x, y, vx: this.vx, vy: this.vy, q: this.q, phase, fusion, lift, wiggle: this.wiggle, piece: this.piece };
  }
}
