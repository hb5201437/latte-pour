import { config } from './config.js';
import { screenTilt, takeAccelPeak } from './sensors.js';

// 陀螺仪输入：把手机姿态翻译成"倒多少、往哪边晃、有没有往前推"。
// 角度都相对于"平时拿手机的姿势"计算，所以怎么端着都能玩。
export class TiltInput {
  constructor() {
    this.basePitch = null;
    this.rollCenter = null;
  }

  // 没在倒奶时调用。基准姿势只在往后仰时跟上去（往前倾一点都不吸收，
  // 否则慢慢倾的时候基准跟着走，永远倾不到出奶的角度）
  follow(dt) {
    const t = screenTilt();
    if (this.basePitch == null) { this.basePitch = t.pitch; this.rollCenter = t.roll; return; }
    if (t.pitch > this.basePitch) {
      const a = 1 - Math.exp((-dt * 1000) / config.baseFollowTauMs);
      this.basePitch += (t.pitch - this.basePitch) * a;
    }
    const a = 1 - Math.exp((-dt * 1000) / config.rollCenterTauMs);
    this.rollCenter += (t.roll - this.rollCenter) * a;
  }

  read(dt) {
    const t = screenTilt();
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
    return f * f * (3 - 2 * f);
  }

  static startAngle(milk) {
    return config.tiltStart + (1 - milk) * config.tiltStartEmptyAdd;
  }
}
