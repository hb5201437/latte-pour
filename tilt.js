import { config } from './config.js';
import { screenTilt, takeAccelPeak } from './sensors.js';

// 陀螺仪输入：把手机姿态翻译成"倒多少、往哪边晃、有没有往前推"。
// 角度都相对于"平时拿手机的姿势"计算，所以怎么端着都能玩。
export class TiltInput {
  constructor() {
    this.basePitch = null;
    this.rollCenter = null;
  }

  // 没在倒奶时调用：基准姿势慢慢跟随当前姿势，吸收手的缓慢漂移；
  // 真正的前倾比这快得多，来不及被吸收
  follow(dt) {
    const t = screenTilt();
    if (this.basePitch == null) { this.basePitch = t.pitch; this.rollCenter = t.roll; return; }
    const a = 1 - Math.exp((-dt * 1000) / config.baseFollowTauMs);
    if (t.pitch > this.basePitch - config.tiltStart) this.basePitch += (t.pitch - this.basePitch) * a;
    this.rollCenter += (t.roll - this.rollCenter) * a;
  }

  read(dt) {
    const t = screenTilt();
    if (this.basePitch == null) this.follow(dt);
    // 前倾角：屏幕上沿往下压了多少度
    const tilt = this.basePitch - t.pitch;
    // 左右晃：相对一个慢速跟随的中心，手一直歪着拿也不会让奶柱跑偏
    const a = 1 - Math.exp((-dt * 1000) / config.rollCenterTauMs);
    this.rollCenter += (t.roll - this.rollCenter) * a;
    const lateral = Math.max(-config.lateralMax,
      Math.min(config.lateralMax, -(t.roll - this.rollCenter) * config.rollGain));
    // 流量比例：没过起倒角为 0，过了之后随倾角增大，到满倾角封顶
    const flow = tilt < config.tiltStart ? 0
      : Math.max(config.tiltFlowMin, Math.min(1, (tilt - config.tiltStart) / (config.tiltFull - config.tiltStart)));
    return { tilt, roll: t.roll - this.rollCenter, lateral, flow, accel: takeAccelPeak() };
  }
}
