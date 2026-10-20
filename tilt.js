import { config } from './config.js';
import { screenTilt, takeAccelPeak } from './sensors.js';

// 陀螺仪输入：把手机姿态翻译成"倒多少、往哪边晃、有没有往前推"。
// 角度都相对于"平时拿手机的姿势"计算，所以怎么端着都能玩。

// 手动翻转：个别手机方向判反时，玩家可以在页面上切换（前后、左右一起翻，相当于转 180°）
let flip = 1;
export function setTiltFlip(on) { flip = on ? -1 : 1; }

function pose() {
  const t = screenTilt();
  return { pitch: t.pitch * flip, roll: t.roll * flip, angle: t.angle };
}

export class TiltInput {
  constructor() {
    this.basePitch = null;  // "奶缸放平"时手机的俯仰角
    this.rollCenter = null;
    this.lastPitch = null;
    this.rate = 0;          // 俯仰角变化速度（度/秒，平滑后）
    this.stillFor = 0;      // 已经拿稳多久（秒）
    this.calibrated = false; // 开始倒之前要先拿稳一下，确定"放平"是哪个姿势
  }

  // 每帧调用：看手机是不是拿稳了
  trackStill(dt, pitch) {
    if (this.lastPitch != null) {
      const r = Math.abs(pitch - this.lastPitch) / Math.max(dt, 1e-3);
      this.rate += (r - this.rate) * (1 - Math.exp(-dt / 0.15));
    }
    this.lastPitch = pitch;
    this.stillFor = this.rate < config.stillRate ? this.stillFor + dt : 0;
  }

  // 让"放平"的基准慢慢跟上当前姿势
  ease(target, dt, tauMs) {
    this.basePitch += (target - this.basePitch) * (1 - Math.exp((-dt * 1000) / tauMs));
  }

  // 还没开始倒的时候调用：拿稳不动时，当前姿势就是"放平"
  follow(dt) {
    const t = pose();
    if (this.basePitch == null) { this.basePitch = t.pitch; this.rollCenter = t.roll; this.lastPitch = t.pitch; return; }
    this.trackStill(dt, t.pitch);
    if (t.pitch > this.basePitch) this.ease(t.pitch, dt, config.baseFollowTauMs); // 往后仰随时跟上
    else if (this.stillFor > config.stillSettleSec) this.ease(t.pitch, dt, config.baseSettleTauMs);
    // 第一次拿稳：直接以当前姿势为"放平"（不能慢慢靠过去，否则基准还没到位就开始漏奶）
    if (!this.calibrated && this.stillFor > config.calibrateSec) { this.basePitch = t.pitch; this.calibrated = true; }
    const a = 1 - Math.exp((-dt * 1000) / config.rollCenterTauMs);
    this.rollCenter += (t.roll - this.rollCenter) * a;
  }

  // 倒奶过程中调用：往后仰超过原来的放平位置，就以新姿势为准；
  // 没在出奶、手又拿稳了（比如郁金香推完一片在等），也慢慢重新放平
  relevel(dt, idle) {
    const t = pose();
    this.trackStill(dt, t.pitch);
    if (t.pitch > this.basePitch) this.ease(t.pitch, dt, config.baseFollowTauMs);
    else if (idle && this.stillFor > config.stillSettleSec) this.ease(t.pitch, dt, config.baseSettleTauMs);
  }

  read(dt) {
    const t = pose();
    if (this.basePitch == null) this.follow(dt);
    // 前倾角：屏幕上沿往下压了多少度
    const tilt = this.basePitch - t.pitch;
    // 左右倾 → 入点横移。倒的时候中心几乎不跟随，手不稳入点就会跟着偏
    const a = 1 - Math.exp((-dt * 1000) / config.rollCenterPourTauMs);
    this.rollCenter += (t.roll - this.rollCenter) * a;
    const lateral = Math.max(-config.lateralMax,
      Math.min(config.lateralMax, -(t.roll - this.rollCenter) * config.rollGain));
    return { tilt, roll: t.roll - this.rollCenter, lateral, angle: t.angle, accel: takeAccelPeak() };
  }

  // 流量比例：倾过"出奶角"后奶自己流出来，倾得越多流得越多。
  // 出奶角跟缸里的奶量有关：满缸稍微一倾就出，奶越少要倾得越多（和真的拉花缸一样）
  static flow(tilt, milk) {
    const start = config.tiltStart + (1 - milk) * config.tiltStartEmptyAdd;
    const f = Math.min(1, Math.max(0, (tilt - start) / config.tiltRange));
    // 倾角和流量基本成正比，稍微压一下小倾角的流量：轻倾奶泡少，重倾奶泡多，差别明显
    return f ** config.flowCurve;
  }

  static startAngle(milk) {
    return config.tiltStart + (1 - milk) * config.tiltStartEmptyAdd;
  }
}
