import { config } from './config.js';
import { FoamSim } from './sim.js';
import { Pour } from './pour.js';
import { TiltInput } from './tilt.js';
import { lockScreenAngle, unlockScreenAngle } from './sensors.js';
import { drawPitcher } from './pitcher.js';
import { drawTable, drawLiquidGloss, drawSpill, drawStoneBody, drawStoneRim } from './scene.js';
import { updatePour, splash } from './audio.js';
import { scorePour } from './score.js';
import { t } from './i18n.js';

// 杯子不动，玩家移动的是拉花缸。缸嘴对准的点就是入奶点。
// 两种操作方式：
//   tilt（陀螺仪）：手指按住任意位置拖 = 平移拉花缸（倒的时候也能拖着往后退）；
//                   前倾 = 倒奶，倾角越大流量越大；左右晃 = 拉花缸横向晃；
//                   向前一推 = 抬高收尾；收回端平 = 倒完
//   touch（手指）： 按住 = 倒奶，拖动 = 平移拉花缸；快速往前划 = 抬高收尾；松手 = 倒完
// 流量、穿心降流量、千层纹的规则在 pour.js，两种方式共用。
export function createGame(canvas, { mode, pattern: initialPattern, onStart, onEnd, debug = false }) {
  let pattern = initialPattern;
  const ctx = canvas.getContext('2d');
  const n = config.gridSize;
  const sim = new FoamSim(n);
  const off = document.createElement('canvas');
  off.width = off.height = n;
  const offCtx = off.getContext('2d');
  const img = offCtx.createImageData(n, n);

  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 0;
  // 静止图层（布局变化时画一次）：木桌 + 杯碟 + 杯子；液面光泽
  const sceneLayer = document.createElement('canvas');
  const glossLayer = document.createElement('canvas');
  const rimLayer = document.createElement('canvas');
  // 镜头像视频一样从拉花缸这一侧斜着往下看：液面是水平的，看起来是固定扁度的椭圆；
  // 杯口跟着杯子倾斜，杯子朝拉花缸斜的时候杯口更接近正圆，回杯后变扁
  let sqL = 1, sqR = 1, bodyH = 0;
  function updateView() {
    const cam = config.cameraAngle * Math.PI / 180;
    const tilt = (1 - sim.surface().level) * config.cupTiltMax * Math.PI / 180;
    sqL = Math.cos(cam);
    sqR = Math.cos(Math.max(0, cam - tilt));
    bodyH = config.cupDepth * R * Math.sin(Math.max(0, cam - tilt));
  }
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
  // 默认入点：每个图案不一样（树叶要边摇边往后退，入点靠前）
  const home = () => {
    const back = pattern.startBack ?? config.pourStartBack;
    return { x: c0 - fwd.x * back * c0, y: c0 - fwd.y * back * c0 };
  };
  const entry = home();
  // 拉花缸的画面状态
  const pit = { height: 0.6, milk: 1, away: 0, rock: 0 };
  // 缸里奶面的晃动：弹簧 + 惯性。拉花缸突然横移/前倾，奶会先落后、再荡回来
  const slosh = { x: 0, y: 0, vx: 0, vy: 0, lastX: null, lastY: null, lastVx: 0, lastVy: 0, lastFlow: 0 };

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, config.maxDpr);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    // 杯子上方留出杯碟，下方留出拉花缸（缸身 + 把手）的位置
    const above = 1.15, below = 2.0;
    R = Math.min(W * config.cupRadiusFrac, (H - 24) / (above + below));
    cx = W / 2;
    cy = (H - (above + below) * R) / 2 + above * R;

    sceneLayer.width = canvas.width;
    sceneLayer.height = canvas.height;
    const sc = sceneLayer.getContext('2d');
    sc.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTable(sc, W, H);

    rimLayer.width = rimLayer.height = Math.ceil(2.3 * R * dpr);
    const rc = rimLayer.getContext('2d');
    rc.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStoneRim(rc, 1.15 * R, 1.15 * R, R);

    glossLayer.width = glossLayer.height = Math.ceil(2 * R * dpr);
    const gc = glossLayer.getContext('2d');
    gc.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLiquidGloss(gc, R, R, R);
  }

  // 限制在液面内（杯子斜着时液面比杯口小，偏向拉花缸那侧）
  function clampToCup(gx, gy) {
    const s = sim.surface();
    const dx = gx - s.x, dy = gy - s.y, r = Math.hypot(dx, dy), max = s.r - 3;
    return r > max ? [s.x + (dx * max) / r, s.y + (dy * max) / r] : [gx, gy];
  }
  const clampP = () => { [p.x, p.y] = clampToCup(p.x, p.y); };

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
    [entry.x, entry.y] = clampToCup(drag.ex + (e.clientX - drag.x) * k, drag.ey + (e.clientY - drag.y) * k / sqL);
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
    unlockScreenAngle();
    onEnd(overflowed ? { score: 0, overflow: true } : scorePour(sim, pattern));
  }

  // 杯子容量：倒进去的奶（融合 + 出白 + 收尾都算）超过容量就漫出杯沿，直接失败
  let poured = 0;       // 已倒入量（满流量倒 1 秒 = 1）
  let overflowed = false;
  let spill = null;     // 溢出动画 { angle, t, seed }
  let shake = 0;        // 屏幕震动幅度（像素）
  function trackVolume(dt) {
    poured += (pour.q / config.flowMax) * dt;
    if (!overflowed && poured > config.cupCapacity) {
      overflowed = true;
      // 从倒奶点那一侧漫出来（倒奶点靠近杯心时，就从拉花缸那一侧）
      const c = n / 2, dx = p.x - c, dy = p.y - c;
      const angle = Math.hypot(dx, dy) > n * 0.08 ? Math.atan2(dy, dx) : Math.atan2(-fwd.y, -fwd.x);
      spill = { angle, t: 0, seed: 1 + Math.floor(Math.random() * 1000) };
      shake = R * 0.05;
      splash();
      finish();
    }
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

    // 拉花缸在画面上的移动速度、加速度（格/秒）
    const vxp = slosh.lastX == null ? 0 : (p.x - slosh.lastX) / dt;
    const vyp = slosh.lastY == null ? 0 : (p.y - slosh.lastY) / dt;
    const axp = (vxp - slosh.lastVx) / dt, ayp = (vyp - slosh.lastVy) / dt;
    slosh.lastX = p.x; slosh.lastY = p.y; slosh.lastVx = vxp; slosh.lastVy = vyp;
    const latAcc = axp * lat.x + ayp * lat.y, fwdAcc = axp * fwd.x + ayp * fwd.y;

    // 左右歪：陀螺仪模式跟手机的左右倾；手指模式跟横移速度
    const roll = mode === 'tilt' && hud ? hud.roll : -(vxp * lat.x + vyp * lat.y) * 0.08;
    pit.rock += (-roll * Math.PI / 180 * 0.8 - pit.rock) * (1 - Math.exp(-dt / 0.05));

    // 奶面：往低的一侧流（左右歪），倾角突然变大往前涌，缸突然横移奶会落后
    const flowNow = state === 'pouring' ? Math.min(1, pour.q / config.flowMax) : 0;
    const dFlow = (flowNow - slosh.lastFlow) / dt;
    slosh.lastFlow = flowNow;
    const tx = Math.max(-0.8, Math.min(0.8, -roll / 22));
    const k = 55, c = 3.2;
    slosh.vx += (k * (tx - slosh.x) - c * slosh.vx - latAcc * 0.0035) * dt;
    slosh.vy += (k * (0 - slosh.y) - c * slosh.vy - fwdAcc * 0.0035 + dFlow * 0.6) * dt;
    slosh.x = Math.max(-0.9, Math.min(0.9, slosh.x + slosh.vx * dt));
    slosh.y = Math.max(-0.9, Math.min(0.9, slosh.y + slosh.vy * dt));
  }

  function update(dt) {
    if (mode === 'tilt') updateTilt(dt);
    else if (state === 'pouring') {
      elapsed += dt;
      p.x = entry.x; p.y = entry.y;
      clampP();
      sim.step(dt, pour.update(dt, p.x, p.y));
      trackVolume(dt);
    } else {
      p.x = entry.x; p.y = entry.y;
    }
    if (state === 'pouring' && elapsed >= config.pourTimeLimit) finish();
    updatePitcher(dt);
    updatePour(state === 'pouring' ? pour.q / config.flowMax : 0, pit.height);
    if (spill && spill.t < 1) spill.t = Math.min(1, spill.t + dt / 0.9);
    shake *= Math.exp(-dt / 0.12);
    if (shake < 0.3) shake = 0;
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
        lockScreenAngle();
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
      clampP();
      sim.step(dt, pour.update(dt, p.x, p.y, flowScale, lift));
      trackVolume(dt);
      if (state === 'pouring' && ahead >= config.pullEnd * c) finish();
      return;
    }

    // 倒奶点 = 入点 + 左右晃带来的横移
    p.x = entry.x + lat.x * s.lateral;
    p.y = entry.y + lat.y * s.lateral;
    flowScale = s.flow;
    lift = 0;
    clampP();
    sim.step(dt, pour.update(dt, p.x, p.y, flowScale));
    trackVolume(dt);
    if (state !== 'pouring') return;

    if (elapsed * 1000 > config.pushIgnoreMs && s.accel > config.pushAccel) { pulling = true; pullT = 0; }

    lowFor = s.flow === 0 ? lowFor + dt : 0;
    if (lowFor * 1000 > config.stopHoldMs) finish();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 溢出时轻微一震
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // 木桌（预先画好的）
    ctx.drawImage(sceneLayer, 0, 0, W, H);
    updateView();

    // 杯身（靠近镜头这一侧的外壁）
    drawStoneBody(ctx, cx, cy, R, sqR, bodyH);

    // 杯口里面：先铺一层内壁颜色（杯口比液面圆，上下露出来的是内壁），再画液面
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, R, R * sqR, 0, 0, Math.PI * 2);
    ctx.clip();
    const wallG = ctx.createLinearGradient(0, cy - R * sqR, 0, cy + R * sqR);
    wallG.addColorStop(0, '#d6c9b5');
    wallG.addColorStop(0.5, '#cdbfaa');
    wallG.addColorStop(1, '#c4b49c');
    ctx.fillStyle = wallG;
    ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    // 液面：水平的，按镜头角度压扁
    sim.render(img.data);
    offCtx.putImageData(img, 0, 0);
    ctx.beginPath();
    ctx.ellipse(cx, cy, R, R * sqL, 0, 0, Math.PI * 2);
    ctx.clip();
    // 奶泡边缘已经抗锯齿过，普通双线性放大就够，比"最高质量"快十几倍
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(off, cx - R, cy - R * sqL, 2 * R, 2 * R * sqL);
    ctx.drawImage(glossLayer, cx - R, cy - R * sqL, 2 * R, 2 * R * sqL);
    ctx.restore();

    // 杯口粗陶边（按杯口扁度压扁）
    ctx.drawImage(rimLayer, cx - 1.15 * R, cy - 1.15 * R * sqR, 2.3 * R, 2.3 * R * sqR);

    // 杯满程度环：倒得越多越满，快满时变红，提醒该收尾了
    if (state !== 'ready') {
      const f = Math.min(1, poured / config.cupCapacity);
      ctx.beginPath();
      ctx.ellipse(cx, cy, R * 1.05, R * 1.05 * sqR, 0, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
      ctx.strokeStyle = f > 0.85 ? 'rgba(200,60,40,0.8)' : 'rgba(90,60,40,0.35)';
      ctx.lineWidth = R * 0.03;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // 溢出：咖啡和奶泡从倒奶那一侧漫过杯沿，流到杯碟上
    if (spill) {
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(1, sqR); ctx.translate(-cx, -cy);
      drawSpill(ctx, cx, cy, R * 1.1, spill.angle, spill.t, spill.seed);
      ctx.restore();
    }

    const toScreen = (gx, gy) => [cx - R + (gx / n) * 2 * R, cy + ((gy / n) * 2 * R - R) * sqL];

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
      rock: pit.rock,
      slosh,
    });

    // 当前操作模式，常驻在左下角
    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(246,239,230,0.45)';
    ctx.fillText(t(mode === 'tilt' ? 'modeTilt' : 'modeTouch'), 12, H - 14);

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
    setPattern(p) { pattern = p; },
    foamCanvas: off, // 最后一帧渲染好的奶泡，保存图片用
    reset() {
      sim.reset();
      elapsed = 0;
      pulling = false;
      lift = 0;
      Object.assign(entry, home());
      Object.assign(pit, { height: 0.6, milk: 1, away: 0, rock: 0 });
      Object.assign(slosh, { x: 0, y: 0, vx: 0, vy: 0, lastX: null, lastY: null, lastVx: 0, lastVy: 0, lastFlow: 0 });
      poured = 0;
      unlockScreenAngle();
      overflowed = false;
      spill = null;
      shake = 0;
      state = 'ready';
    },
  };
}
