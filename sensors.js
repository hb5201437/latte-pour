import { config } from './config.js';

// 平滑后的最新读数
export const reading = {
  alpha: null, beta: null, gamma: null,
  ax: null, ay: null, az: null,
  events: 0,
};

let last = 0;

// 按时间间隔做指数平滑：dt 越接近 smoothingMs，新值权重越大
function smooth(prev, next, dt) {
  if (next == null) return prev;
  if (prev == null) return next;
  const k = Math.min(1, dt / config.smoothingMs);
  return prev + (next - prev) * k;
}

function onOrientation(e) {
  const now = performance.now();
  const dt = last ? now - last : config.smoothingMs;
  last = now;
  reading.alpha = smooth(reading.alpha, e.alpha, dt);
  reading.beta = smooth(reading.beta, e.beta, dt);
  reading.gamma = smooth(reading.gamma, e.gamma, dt);
  reading.events++;
}

function onMotion(e) {
  // 优先用去掉重力的加速度；部分设备只给含重力的版本
  const a = e.acceleration && e.acceleration.x != null
    ? e.acceleration
    : e.accelerationIncludingGravity;
  if (!a) return;
  const dt = e.interval ? e.interval * (e.interval < 1 ? 1000 : 1) : 16;
  reading.ax = smooth(reading.ax, a.x, dt);
  reading.ay = smooth(reading.ay, a.y, dt);
  reading.az = smooth(reading.az, a.z, dt);
  reading.events++;
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

  // 桌面浏览器有 API 但从不触发事件，等一会儿确认真的有数据
  const before = reading.events;
  await new Promise(r => setTimeout(r, config.sensorTimeoutMs));
  return reading.events > before ? 'granted' : 'unsupported';
}
