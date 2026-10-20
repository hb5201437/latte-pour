import { config } from './config.js';
import { FoamSim } from './sim.js';
import { Pour } from './pour.js';
import { TiltInput } from './tilt.js';
import { drawPitcher } from './pitcher.js';
import { scorePour } from './score.js';

// 杯子不动，玩家移动的是拉花缸。缸嘴对准的点就是入奶点。
// 两种操作方式：
//   tilt（陀螺仪）：手指按住任意位置拖 = 平移拉花缸（倒的时候也能拖着往后退）；
//                   前倾 = 倒奶，倾角越大流量越大；左右晃 = 拉花缸横向晃；
//                   向前一推 = 抬高收尾；收回端平 = 倒完
//   touch（手指）： 按住 = 倒奶，拖动 = 平移拉花缸；快速往前划 = 抬高收尾；松手 = 倒完
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
  const rim = document.createElement('canvas');
  let rimPad = 0;
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
  let frameMs = 0; // 每帧计算+绘制耗时
  let lift = 0; // 当前抬高程度
  // 拉花缸位置（缸嘴对准的入点，格坐标），默认在杯心后方
  const c0 = n / 2;
  const home = () => ({ x: c0 - fwd.x * config.pourStartBack * c0, y: c0 - fwd.y * config.pourStartBack * c0 });
  const entry = home();
  // 拉花缸的画面状态
  const pit = { height: 0.6, milk: 1, away: 0 };

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, config.maxDpr);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    // 杯子上方留杯沿，下方留出拉花缸（缸身 + 把手）的位置
    const above = 1.14, below = 2.0;
    R = Math.min(W * config.cupRadiusFrac, (H - 24) / (above + below));
    cx = W / 2;
    cy = (H - (above + below) * R) / 2 + above * R;

    // 杯沿和它的阴影是静止的，布局变化时画一次，之后每帧直接贴图
    const pad = R * 1.4;
    rim.width = Math.ceil(2 * pad * dpr);
    rim.height = Math.ceil(2 * pad * dpr);
    const rc = rim.getContext('2d');
    rc.setTransform(dpr, 0, 0, dpr, 0, 0);
    rc.shadowColor = 'rgba(0,0,0,0.45)';
    rc.shadowBlur = R * 0.12;
    rc.shadowOffsetY = R * 0.04;
    rc.beginPath();
    rc.arc(pad, pad, R * 1.12, 0, Math.PI * 2);
    rc.fillStyle = '#efe8df';
    rc.fill();
    rimPad = pad;
  }

  // 限制在杯口内
  function clampToCup(gx, gy) {
    const c = n / 2, dx = gx - c, dy = gy - c, r = Math.hypot(dx, dy), max = n / 2 - 2;
    return r > max ? [c + (dx * max) / r, c + (dy * max) / r] : [gx, gy];
  }

  // 拖拉花缸：手指按住任意位置拖，拉花缸跟着平移（相对移动，手指不会挡住入奶点）
  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    if (state === 'done' || pulling || drag) return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* 个别浏览器不支持时照样能拖 */ }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, ex: entry.x, ey: entry.y };
    if (mode === 'touch' && state === 'ready') {
      p.x = entry.x; p.y = entry.y;
      pour.start(p.x, p.y);
      elapsed = 0;
      state = 'pouring';
      onStart();
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id || state === 'done' || pulling) return;
    const k = n / (2 * R);
    [entry.x, entry.y] = clampToCup(drag.ex + (e.clientX - drag.x) * k, drag.ey + (e.clientY - drag.y) * k);
  });
  const release = e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    if (mode === 'touch' && state === 'pouring') finish();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  function finish() {
    state = 'done';
    drag = null;
    onEnd(scorePour(sim));
  }

  // 拉花缸高度：融合时抬高，出白后贴近液面，收尾时再抬高；倒完移开
  function updatePitcher(dt) {
    let target = 0.6;
    if (state === 'pouring') {
      if (pour.flowTime < config.fusionSec) target = 1;
      else target = 0.12 + 0.88 * Math.max(lift, pour.lift || 0);
      pit.milk = Math.max(0, pit.milk - (pour.q / config.flowMax) * dt / config.pitcherMilkSec);
    }
    if (state === 'done') { target = 1; pit.away = Math.min(1, pit.away + dt / 0.7); }
    pit.height += (target - pit.height) * (1 - Math.exp(-dt / 0.15));
  }

  function update(dt) {
    if (mode === 'tilt') updateTilt(dt);
    else if (state === 'pouring') {
      elapsed += dt;
      p.x = entry.x; p.y = entry.y;
      sim.step(dt, pour.update(dt, p.x, p.y));
    } else {
      p.x = entry.x; p.y = entry.y;
    }
    if (state === 'pouring' && elapsed >= config.pourTimeLimit) finish();
    updatePitcher(dt);
  }

  function updateTilt(dt) {
    const c = n / 2;
    if (state !== 'pouring') {
      tiltIn.follow(dt);
      const s = tiltIn.read(dt);
      s.flow = TiltInput.flow(s.tilt, pit.milk);
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
    s.flow = TiltInput.flow(s.tilt, pit.milk);
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

    lowFor = s.flow === 0 ? lowFor + dt : 0;
    if (lowFor * 1000 > config.stopHoldMs) finish();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 杯沿（预先画好的）
    ctx.drawImage(rim, cx - rimPad, cy - rimPad, 2 * rimPad, 2 * rimPad);

    // 液面
    sim.render(img.data);
    offCtx.putImageData(img, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    // 奶泡边缘已经抗锯齿过，普通双线性放大就够，比"最高质量"快十几倍
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(off, cx - R, cy - R, 2 * R, 2 * R);
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

    // 入点：拉花缸还没倒时，在液面上标出缸嘴对准的位置
    const [sx, sy] = toScreen(p.x, p.y);
    if (state === 'ready') {
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(2, R * 0.018), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fill();
    }

    // 拉花缸：奶柱越粗流量越大，抬高后变细；倒完往后移开
    const flow = state !== 'pouring' ? 0 : mode === 'tilt' ? (hud ? hud.flow : 0) : 1;
    const thin = 1 - 0.75 * Math.max(lift, pour.lift || 0);
    const away = pit.away * pit.away;
    drawPitcher(ctx, {
      tipX: sx - fwd.x * away * R * 1.5, tipY: sy - fwd.y * away * R * 1.5,
      fwd, lat,
      size: R * config.pitcherSize,
      height: pit.height,
      tilt: flow,
      milk: pit.milk,
      stream: flow > 0 ? (1.5 + 7 * Math.sqrt(flow)) * thin * (R / 150) : 0,
      alpha: 1 - away,
    });

    // 当前操作模式，常驻在左下角
    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(246,239,230,0.45)';
    ctx.fillText(mode === 'tilt' ? '陀螺仪模式' : '手指模式', 12, H - 14);

    // ?debug=1 时显示陀螺仪读数，调手感用
    if (debug && hud) {
      ctx.font = '12px ui-monospace, Menlo, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      const lines = [
        `前倾 ${hud.tilt.toFixed(1)}°  (出奶角 ${TiltInput.startAngle(pit.milk).toFixed(0)}°)`,
        `左右 ${hud.roll.toFixed(1)}°  横移 ${hud.lateral.toFixed(1)} 格`,
        `流量 ${(pour.q / config.flowMax * 100).toFixed(0)}%  加速度峰值 ${accelShow.toFixed(1)} (推 >${config.pushAccel})`,
        `状态 ${state}${pulling ? ' · 收尾' : ''}  帧率 ${fps.toFixed(0)}  每帧耗时 ${frameMs.toFixed(1)}ms`,
        `屏幕角度 用=${hud.angle} 报=${screen.orientation ? screen.orientation.angle : '无'}/${window.orientation ?? '无'}`,
      ];
      lines.forEach((t, i) => ctx.fillText(t, 12, 24 + i * 16));
    }
  }

  function frame(now) {
    const raw = last ? (now - last) / 1000 : 1 / 60;
    const dt = Math.min(0.033, raw);
    last = now;
    fps += (1 / Math.max(raw, 0.001) - fps) * 0.05;
    const t0 = performance.now();
    update(dt);
    draw();
    frameMs += (performance.now() - t0 - frameMs) * 0.05;
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', layout);
  layout();
  requestAnimationFrame(frame);

  return {
    isTilt: mode === 'tilt',
    foamCanvas: off, // 最后一帧渲染好的奶泡，保存图片用
    reset() {
      sim.reset();
      elapsed = 0;
      pulling = false;
      lift = 0;
      Object.assign(entry, home());
      Object.assign(pit, { height: 0.6, milk: 1, away: 0 });
      state = 'ready';
    },
  };
}
