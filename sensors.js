import { config } from './config.js';

// 平滑后的最新读数
export const reading = {
  alpha: null, beta: null, gamma: null,
  ax: null, ay: null, az: null,
  // "天空方向"在手机坐标系里的单位向量（由 beta/gamma 算出），用来求屏幕的俯仰和左右倾
  ux: null, uy: null, uz: null,
  events: 0,
};

// 上次取走以来的最大加速度（不含重力，m/s²），用于检测"向前一推"
let accelPeak = 0;
let last = 0;

// 按时间间隔做指数平滑：dt 越接近 smoothingMs，新值权重越大
function smooth(prev, next, dt) {
  if (next == null) return prev;
  if (prev == null) return next;
  const k = Math.min(1, dt / config.smoothingMs);
  return prev + (next - prev) * k;
}

const RAD = Math.PI / 180;

function onOrientation(e) {
  const now = performance.now();
  const dt = last ? now - last : config.smoothingMs;
  last = now;
  reading.alpha = smooth(reading.alpha, e.alpha, dt);
  reading.beta = smooth(reading.beta, e.beta, dt);
  reading.gamma = smooth(reading.gamma, e.gamma, dt);
  if (e.beta != null && e.gamma != null) {
    // 平滑向量而不是角度，避免角度在 ±90/±180 处跳变
    const b = e.beta * RAD, g = e.gamma * RAD;
    reading.ux = smooth(reading.ux, -Math.cos(b) * Math.sin(g), dt);
    reading.uy = smooth(reading.uy, Math.sin(b), dt);
    reading.uz = smooth(reading.uz, Math.cos(b) * Math.cos(g), dt);
  }
  reading.events++;
}

function onMotion(e) {
  // 优先用去掉重力的加速度；部分设备只给含重力的版本
  const pure = e.acceleration && e.acceleration.x != null;
  const a = pure ? e.acceleration : e.accelerationIncludingGravity;
  if (!a || a.x == null) return;
  const mag = Math.hypot(a.x, a.y, a.z);
  accelPeak = Math.max(accelPeak, pure ? mag : Math.abs(mag - 9.81));
  const dt = e.interval ? e.interval * (e.interval < 1 ? 1000 : 1) : 16;
  reading.ax = smooth(reading.ax, a.x, dt);
  reading.ay = smooth(reading.ay, a.y, dt);
  reading.az = smooth(reading.az, a.z, dt);
  reading.events++;
}

// 取走并清零上次以来的最大加速度
export function takeAccelPeak() {
  const v = accelPeak;
  accelPeak = 0;
  return v;
}

// 屏幕的俯仰和左右倾（度），按屏幕当前显示方向计算，横屏竖屏都适用。
//   pitch：屏幕上沿相对水平面抬起的角度，上沿往下压时变小
//   roll：屏幕右沿相对水平面抬起的角度，右沿往下压时变小
export function screenTilt() {
  if (reading.ux == null) return { pitch: 0, roll: 0 };
  const angle = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
  const th = angle * RAD;
  const sx = reading.ux * Math.cos(th) - reading.uy * Math.sin(th);
  const sy = reading.ux * Math.sin(th) + reading.uy * Math.cos(th);
  const clamp = v => Math.max(-1, Math.min(1, v));
  return { pitch: Math.asin(clamp(sy)) / RAD, roll: Math.asin(clamp(sx)) / RAD };
}

// 必须在用户手势（点击）回调里同步调用，iOS 才会弹权限框。
// 返回 'granted' | 'denied' | 'unsupported'
export async function requestSensors() {
  if (typeof DeviceOrientationEvent === 'undefined') return 'unsupported';

  const askers = [];
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    askers.push(DeviceOrientationEvent.requestPermission());
  }
  if (typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function') {
    askers.push(DeviceMotionEvent.requestPermission());
  }

  try {
    const results = await Promise.all(askers);
    if (results.some(r => r !== 'granted')) return 'denied';
  } catch {
    // 非 HTTPS 或非手势触发时 iOS 会直接抛错
    return 'denied';
  }

  window.addEventListener('deviceorientation', onOrientation);
  window.addEventListener('devicemotion', onMotion);

  // 桌面浏览器有 API 但从不触发事件；收到第一条朝向数据就算可用，超时算不可用
  const deadline = performance.now() + config.sensorTimeoutMs;
  while (performance.now() < deadline) {
    if (reading.ux != null) return 'granted';
    await new Promise(r => setTimeout(r, 50));
  }
  return 'unsupported';
}
