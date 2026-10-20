import { config } from './config.js';
import { FoamSim } from './sim.js';

// 手指/鼠标版：按住 = 倒奶，倒奶点跟着手指走，松手 = 结束。
// 流量看"净移动"速度：原地或左右晃动时满流量，快速单向划过时流量降到很低（穿心）。
export function createGame(canvas, { onEnd }) {
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

  // 倒奶点（格坐标）及其平滑速度
  const p = { x: n / 2, y: n / 2, px: n / 2, py: n / 2, vx: 0, vy: 0, dx: 0, dy: 0, q: 0 };

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
    if (state !== 'ready') return;
    canvas.setPointerCapture(e.pointerId);
    [p.x, p.y] = toGrid(e);
    p.px = p.x; p.py = p.y;
    p.vx = p.vy = p.dx = p.dy = 0;
    elapsed = 0;
    state = 'pouring';
  });

  canvas.addEventListener('pointermove', e => {
    if (state !== 'pouring') return;
    [p.x, p.y] = toGrid(e);
  });

  const stop = () => { if (state === 'pouring') finish(); };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);

  function finish() {
    state = 'done';
    p.q = 0;
    onEnd();
  }

  function update(dt) {
    if (state !== 'pouring') return;
    elapsed += dt;

    const ivx = (p.x - p.px) / dt, ivy = (p.y - p.py) / dt;
    p.px = p.x; p.py = p.y;
    const av = 1 - Math.exp((-dt * 1000) / config.velTauMs);
    const ad = 1 - Math.exp((-dt * 1000) / config.driftTauMs);
    p.vx += (ivx - p.vx) * av;
    p.vy += (ivy - p.vy) * av;
    p.dx += (ivx - p.dx) * ad;
    p.dy += (ivy - p.dy) * ad;

    const drift = Math.hypot(p.dx, p.dy);
    const ramp = Math.min(1, (elapsed * 1000) / config.flowRampMs);
    p.q = config.flowMax * Math.max(config.flowMinFrac, 1 - drift / config.pullSpeed) * ramp;

    sim.step(dt, { x: p.x, y: p.y, vx: p.vx, vy: p.vy, q: p.q });

    if (elapsed >= config.pourTimeLimit) finish();
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
      const r = 3 + 6 * Math.sqrt(p.q / config.flowMax);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
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
      state = 'ready';
    },
  };
}
