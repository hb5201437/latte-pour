import { config } from './config.js';
import { FoamSim } from './sim.js';
import { Pour } from './pour.js';
import { TiltInput } from './tilt.js';

// 两种操作方式：
//   tilt（陀螺仪）：手指点杯子选入点（倒的时候也能拖）；前倾 = 倒奶，倾角越大流量越大；
//                   左右晃 = 奶柱横向晃；向前一推 = 抬高收尾；收回端平 = 倒完
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
  // 横向：垂直于前方、指向屏幕右侧，前方朝上朝下都一样
  const lat = fwd.y <= 0 ? { x: -fwd.y, y: fwd.x } : { x: fwd.y, y: -fwd.x };
  let pulling = false;
  let pullT = 0;
  let lowFor = 0;
  let hud = null; // 调试读数
  let accelShow = 0;
  let fps = 60;
  let lift = 0; // 当前抬高程度，画奶柱粗细用
  // 入点：陀螺仪模式下用手指选，默认在杯心后方
  const c0 = n / 2;
  const entry = { x: c0 - fwd.x * config.pourStartBack * c0, y: c0 - fwd.y * config.pourStartBack * c0 };

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

  // 陀螺仪模式：点或拖动选入点
  const pickEntry = e => {
    if (mode !== 'tilt' || pulling || state === 'done') return;
    if (e.type === 'pointermove' && !e.buttons && e.pointerType === 'mouse') return;
    [entry.x, entry.y] = toGrid(e);
  };
  canvas.addEventListener('pointerdown', pickEntry);
  canvas.addEventListener('pointermove', pickEntry);

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
      p.x = entry.x; p.y = entry.y;
      if (state === 'ready' && s.flow > 0) {
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
      // 收尾：先原地抬高（奶柱变细、往下扎，凹口加深），再细奶柱往前划过图案
      pullT += dt;
      const raise = config.liftRaiseMs / 1000;
      lift = Math.min(1, pullT / raise);
      if (pullT > raise) {
        p.x += fwd.x * config.tiltPullSpeed * dt;
        p.y += fwd.y * config.tiltPullSpeed * dt;
      }
      flowScale = 1;
      const ahead = (p.x - c) * fwd.x + (p.y - c) * fwd.y;
      sim.step(dt, pour.update(dt, p.x, p.y, flowScale, lift));
      if (ahead >= config.pullEnd * c) finish();
      return;
    }

    // 倒奶点 = 入点 + 左右晃带来的横移
    p.x = entry.x + lat.x * s.lateral;
    p.y = entry.y + lat.y * s.lateral;
    flowScale = s.flow;
    lift = 0;
    sim.step(dt, pour.update(dt, p.x, p.y, flowScale));

    if (elapsed * 1000 > config.pushIgnoreMs && s.accel > config.pushAccel) { pulling = true; pullT = 0; }

    lowFor = s.tilt < config.stopTilt ? lowFor + dt : 0;
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
    shade.addColorStop(1, 'rgba(0,0,0,0.22)');
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

    const toScreen = (gx, gy) => [cx - R + (gx / n) * 2 * R, cy - R + (gy / n) * 2 * R];

    // 入点标记（陀螺仪模式，还没开始倒）
    if (mode === 'tilt' && state === 'ready') {
      const [ex, ey] = toScreen(entry.x, entry.y);
      ctx.beginPath();
      ctx.arc(ex, ey, R * 0.06, 0, Math.PI * 2);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 奶柱：从拉花缸那一侧的屏幕边缘落到入点，越粗流量越大，抬高后变细
    if (state === 'pouring') {
      const [sx, sy] = toScreen(p.x, p.y);
      const flow = mode === 'tilt' ? (hud ? hud.flow : 0) : 1;
      const w = (2 + 10 * Math.sqrt(flow)) * (1 - 0.75 * Math.max(lift, pour.lift || 0)) * (R / 150);
      if (w > 0.3) {
        const ox = sx - fwd.x * R * 1.6, oy = sy - fwd.y * R * 1.6;
        const nx = lat.x, ny = lat.y;
        const grad = ctx.createLinearGradient(ox, oy, sx, sy);
        grad.addColorStop(0, 'rgba(250,247,240,0)');
        grad.addColorStop(0.35, 'rgba(250,247,240,0.85)');
        grad.addColorStop(1, 'rgba(250,247,240,0.95)');
        ctx.beginPath();
        ctx.moveTo(ox + nx * w, oy + ny * w);
        ctx.lineTo(sx + nx * w * 0.5, sy + ny * w * 0.5);
        ctx.lineTo(sx - nx * w * 0.5, sy - ny * w * 0.5);
        ctx.lineTo(ox - nx * w, oy - ny * w);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }
    }

    // ?debug=1 时显示陀螺仪读数，调手感用
    if (debug && hud) {
      ctx.font = '12px ui-monospace, Menlo, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      const lines = [
        `前倾 ${hud.tilt.toFixed(1)}°  (起倒 ${config.tiltStart}° / 满 ${config.tiltFull}°)`,
        `左右 ${hud.roll.toFixed(1)}°  横移 ${hud.lateral.toFixed(1)} 格`,
        `流量 ${(pour.q / config.flowMax * 100).toFixed(0)}%  加速度峰值 ${accelShow.toFixed(1)} (推 >${config.pushAccel})`,
        `状态 ${state}${pulling ? ' · 收尾' : ''}  帧率 ${fps.toFixed(0)}`,
        `屏幕角度 screen=${screen.orientation ? screen.orientation.angle : '无'} window=${window.orientation ?? '无'}`,
      ];
      lines.forEach((t, i) => ctx.fillText(t, 12, 24 + i * 16));
    }
  }

  function frame(now) {
    const raw = last ? (now - last) / 1000 : 1 / 60;
    const dt = Math.min(0.033, raw);
    last = now;
    fps += (1 / Math.max(raw, 0.001) - fps) * 0.05;
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
      lift = 0;
      state = 'ready';
    },
  };
}
