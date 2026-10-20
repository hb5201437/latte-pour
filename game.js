import { config } from './config.js';
import { FoamSim } from './sim.js';
import { Pour } from './pour.js';
import { TiltInput } from './tilt.js';

// 两种操作方式：
//   tilt（陀螺仪）：前倾 = 倒奶，倾角越大流量越大；左右晃 = 奶柱横向晃；
//                   向前一推 = 穿心（奶柱自动往前划过）；收回端平 = 倒完
//   touch（手指）： 按住 = 倒奶，倒奶点跟着手指走；快速往前划 = 穿心；松手 = 倒完
// 流量、穿心降流量、千层纹的规则在 pour.js，两种方式共用。
export function createGame(canvas, { mode, onStart, onEnd, debug = false }) {
  const ctx = canvas.getContext('2d');
  const n = config.gridSize;
  const sim = new FoamSim(n);
  const off = document.createElement('canvas');
  off.width = off.height = n;
  const offCtx = off.getContext('2d');
  const img = offCtx.createImageData(n, n);

  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 0;
  let state = 'ready'; // ready | pouring | done
  let elapsed = 0;
  let last = 0;

  const pour = new Pour();
  // 倒奶点（格坐标）
  const p = { x: n / 2, y: n / 2 };

  // 陀螺仪模式状态
  const tiltIn = mode === 'tilt' ? new TiltInput() : null;
  const fwd = { x: Math.cos(config.forwardAngle), y: Math.sin(config.forwardAngle) };
  const lat = { x: -fwd.y, y: fwd.x }; // 横向（forward 朝上时为屏幕向右）
  let pulling = false;
  let lowFor = 0;
  let hud = null; // 调试读数
  let accelShow = 0;

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, config.maxDpr);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    cx = W / 2;
    cy = H / 2;
    R = Math.min(W, H) * config.cupRadiusFrac;
  }

  function toGrid(e) {
    let gx = ((e.clientX - (cx - R)) / (2 * R)) * n;
    let gy = ((e.clientY - (cy - R)) / (2 * R)) * n;
    // 限制在杯口内
    const c = n / 2, dx = gx - c, dy = gy - c, r = Math.hypot(dx, dy), max = n / 2 - 2;
    if (r > max) { gx = c + (dx * max) / r; gy = c + (dy * max) / r; }
    return [gx, gy];
  }

  canvas.addEventListener('pointerdown', e => {
    if (mode !== 'touch' || state !== 'ready') return;
    canvas.setPointerCapture(e.pointerId);
    [p.x, p.y] = toGrid(e);
    pour.start(p.x, p.y);
    elapsed = 0;
    state = 'pouring';
    onStart();
  });

  canvas.addEventListener('pointermove', e => {
    if (mode !== 'touch' || state !== 'pouring') return;
    [p.x, p.y] = toGrid(e);
  });

  const stop = () => { if (mode === 'touch' && state === 'pouring') finish(); };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);

  function finish() {
    state = 'done';
    onEnd();
  }

  function update(dt) {
    if (mode === 'tilt') updateTilt(dt);
    else if (state === 'pouring') {
      elapsed += dt;
      sim.step(dt, pour.update(dt, p.x, p.y));
    }
    if (state === 'pouring' && elapsed >= config.pourTimeLimit) finish();
  }

  function updateTilt(dt) {
    const c = n / 2;
    if (state !== 'pouring') {
      tiltIn.follow(dt);
      const s = tiltIn.read(dt);
      hud = s;
      if (state === 'ready' && s.flow > 0) {
        // 从杯心后方开始倒
        p.x = c - fwd.x * config.pourStartBack * c;
        p.y = c - fwd.y * config.pourStartBack * c;
        pour.start(p.x, p.y);
        elapsed = 0;
        pulling = false;
        lowFor = 0;
        state = 'pouring';
        onStart();
      }
      return;
    }

    elapsed += dt;
    const s = tiltIn.read(dt);
    hud = s;
    accelShow = Math.max(accelShow * Math.exp(-dt / 0.6), s.accel);
    let flowScale;

    if (pulling) {
      // 穿心：奶柱自动快速往前划，pour.js 会因为往前移动快而把流量降到最低
      p.x += fwd.x * config.tiltPullSpeed * dt;
      p.y += fwd.y * config.tiltPullSpeed * dt;
      flowScale = 1;
      const ahead = (p.x - c) * fwd.x + (p.y - c) * fwd.y;
      sim.step(dt, pour.update(dt, p.x, p.y, flowScale));
      if (ahead >= config.pullEnd * c) finish();
      return;
    }

    // 倒奶点 = 起倒位置 + 左右晃带来的横移
    const bx = c - fwd.x * config.pourStartBack * c;
    const by = c - fwd.y * config.pourStartBack * c;
    p.x = bx + lat.x * s.lateral;
    p.y = by + lat.y * s.lateral;
    flowScale = s.flow;
    sim.step(dt, pour.update(dt, p.x, p.y, flowScale));

    if (elapsed * 1000 > config.pushIgnoreMs && s.accel > config.pushAccel) pulling = true;

    lowFor = s.flow === 0 ? lowFor + dt : 0;
    if (lowFor * 1000 > config.stopHoldMs) finish();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 杯沿
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = R * 0.12;
    ctx.shadowOffsetY = R * 0.04;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.12, 0, Math.PI * 2);
    ctx.fillStyle = '#efe8df';
    ctx.fill();
    ctx.restore();

    // 液面
    sim.render(img.data);
    offCtx.putImageData(img, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, cx - R, cy - R, 2 * R, 2 * R);
    const shade = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = shade;
    ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    ctx.restore();

    // 计时环
    if (state !== 'ready') {
      const f = Math.min(1, elapsed / config.pourTimeLimit);
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.06, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
      ctx.strokeStyle = 'rgba(120,80,50,0.55)';
      ctx.lineWidth = R * 0.025;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // 奶柱落点
    if (state === 'pouring') {
      const sx = cx - R + (p.x / n) * 2 * R;
      const sy = cy - R + (p.y / n) * 2 * R;
      const r = 3 + 6 * Math.sqrt(pour.q / config.flowMax);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
    }

    // ?debug=1 时显示陀螺仪读数，调手感用
    if (debug && hud) {
      ctx.font = '12px ui-monospace, Menlo, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      const lines = [
        `前倾 ${hud.tilt.toFixed(1)}°  (起倒 ${config.tiltStart}° / 满 ${config.tiltFull}°)`,
        `左右 ${hud.roll.toFixed(1)}°  横移 ${hud.lateral.toFixed(1)} 格`,
        `流量 ${(pour.q / config.flowMax * 100).toFixed(0)}%  加速度峰值 ${accelShow.toFixed(1)} (推 >${config.pushAccel})`,
        `状态 ${state}${pulling ? ' · 穿心' : ''}`,
      ];
      lines.forEach((t, i) => ctx.fillText(t, 12, 24 + i * 16));
    }
  }

  function frame(now) {
    const dt = last ? Math.min(0.033, (now - last) / 1000) : 1 / 60;
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', layout);
  layout();
  requestAnimationFrame(frame);

  return {
    reset() {
      sim.reset();
      elapsed = 0;
      pulling = false;
      state = 'ready';
    },
  };
}
