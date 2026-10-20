// 场景：木桌、杯碟、陶瓷杯、液面光泽、溢出。游戏画面和分享图共用，保证两边长得一样。
// 静止的部分（桌面、杯碟、杯身）调用方应当画一次缓存起来，每帧只贴图。

// 木桌：暖深色底 + 细木纹 + 暗角
export function drawTable(g, W, H, seed = 7) {
  const base = g.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, '#3a2518');
  base.addColorStop(0.5, '#2e1d13');
  base.addColorStop(1, '#24160e');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  // 木纹：一组微微弯曲的细线，随机深浅
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.save();
  g.lineWidth = 1;
  const lines = Math.ceil(H / 3);
  for (let i = 0; i < lines; i++) {
    const y = (i / lines) * H + rnd() * 3;
    const amp = 2 + rnd() * 6, freq = 0.002 + rnd() * 0.004, ph = rnd() * 6;
    g.strokeStyle = rnd() > 0.5 ? `rgba(255,220,180,${0.015 + rnd() * 0.03})` : `rgba(0,0,0,${0.04 + rnd() * 0.06})`;
    g.beginPath();
    for (let x = 0; x <= W; x += 12) {
      const yy = y + Math.sin(x * freq + ph) * amp;
      if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
    }
    g.stroke();
  }
  g.restore();

  const vg = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
}

// 液面上的光泽：杯沿内侧的阴影 + 一抹柔和反光（盖在奶泡图层上）
export function drawLiquidGloss(g, cx, cy, R) {
  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.clip();
  const ish = g.createRadialGradient(cx + R * 0.05, cy + R * 0.08, R * 0.82, cx, cy, R * 1.02);
  ish.addColorStop(0, 'rgba(0,0,0,0)');
  ish.addColorStop(1, 'rgba(30,15,5,0.38)');
  g.fillStyle = ish;
  g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  const gl = g.createRadialGradient(cx - R * 0.42, cy - R * 0.5, 0, cx - R * 0.42, cy - R * 0.5, R * 0.55);
  gl.addColorStop(0, 'rgba(255,250,240,0.16)');
  gl.addColorStop(1, 'rgba(255,250,240,0)');
  g.fillStyle = gl;
  g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  g.restore();
}

// 溢出：咖啡和奶泡从 angle 方向漫过杯沿、流到杯碟上。t 为 0~1 的动画进度
export function drawSpill(g, cx, cy, R, angle, t, seed = 3) {
  if (t <= 0) return;
  const e = 1 - Math.pow(1 - Math.min(1, t), 3); // 先快后慢
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
  // 几个往外鼓的小包（液体顺着杯壁流下去的地方）
  const lobes = Array.from({ length: 4 }, () => ({ a: angle + (rnd() - 0.5) * 1.4, w: 0.16 + rnd() * 0.12, h: 0.06 + rnd() * 0.08 }));
  const dAng = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const reach = th => {
    const d = dAng(th, angle);
    const main = Math.exp(-(d * d) / 0.8);
    let bump = 0;
    for (const l of lobes) { const dl = dAng(th, l.a); bump += l.h * Math.exp(-(dl * dl) / (l.w * l.w)); }
    const wob = 0.03 * Math.sin(th * 9 + ph[0]) + 0.02 * Math.sin(th * 17 + ph[1]);
    // 一圈都漫到杯沿上（杯子满了），溢出方向漫得最远
    return R * (1.0 + e * (0.05 + 0.3 * main + (bump + wob) * main));
  };

  g.save();
  // 只画杯口外面的部分：外轮廓 + 杯口（反向），用 evenodd 挖掉杯口
  g.beginPath();
  const N = 160;
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI * 2;
    const r = reach(th);
    const x = cx + Math.cos(th) * r, y = cy + Math.sin(th) * r;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  g.moveTo(cx + R * 0.995, cy);
  g.arc(cx, cy, R * 0.995, 0, Math.PI * 2, true);

  // 靠杯沿是奶泡色，往外渐渐透出咖啡色
  const lg = g.createRadialGradient(cx, cy, R, cx, cy, R * 1.42);
  lg.addColorStop(0, 'rgba(240,229,212,0.96)');
  lg.addColorStop(0.35, 'rgba(222,196,163,0.95)');
  lg.addColorStop(1, 'rgba(158,104,64,0.94)');
  g.fillStyle = lg;
  g.shadowColor = 'rgba(40,20,10,0.4)';
  g.shadowBlur = R * 0.06;
  g.shadowOffsetY = R * 0.02;
  g.fill('evenodd');
  g.shadowColor = 'transparent';

  // 液面反光：沿外缘一道细高光
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI * 2;
    const r = reach(th) - R * 0.012;
    const x = cx + Math.cos(th) * r, y = cy + Math.sin(th) * r;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.strokeStyle = 'rgba(255,255,255,0.32)';
  g.lineWidth = Math.max(1, R * 0.01);
  g.stroke();
  g.restore();
}

// —— 视频角度：米色斑点粗陶杯（没有杯碟，从拉花缸这一侧斜着往下看）——

// 斑点纹理（画一次复用）
let speckle = null;
function speckleCanvas() {
  if (speckle) return speckle;
  const S = 256;
  speckle = document.createElement('canvas');
  speckle.width = speckle.height = S;
  const g = speckle.getContext('2d');
  g.fillStyle = '#e6dccd';
  g.fillRect(0, 0, S, S);
  let s = 5;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1400; i++) {
    const r = rnd() < 0.85 ? 0.5 + rnd() * 0.9 : 1.2 + rnd() * 1.4;
    g.fillStyle = `rgba(${90 + rnd() * 40},${70 + rnd() * 30},${55 + rnd() * 25},${0.35 + rnd() * 0.5})`;
    g.beginPath();
    g.arc(rnd() * S, rnd() * S, r, 0, Math.PI * 2);
    g.fill();
  }
  return speckle;
}

// 杯身：靠近镜头这一侧露出来的外壁。rimSq 是杯口的扁度，bodyH 是露出来的杯身高度（像素）
// 杯口中心在 (cx, cy)，外半径 R * 1.1
export function drawStoneBody(g, cx, cy, R, rimSq, bodyH) {
  const Ro = R * 1.1, Rb = R * 1.0; // 杯底比杯口略窄
  g.save();
  // 影子
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.45)';
  g.shadowBlur = R * 0.25;
  g.shadowOffsetY = R * 0.12;
  g.beginPath();
  g.ellipse(cx, cy + bodyH, Rb, Rb * rimSq, 0, 0, Math.PI * 2);
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fill();
  g.restore();
  // 外壁：杯口下半个椭圆 → 杯底下半个椭圆
  g.beginPath();
  g.ellipse(cx, cy, Ro, Ro * rimSq, 0, 0, Math.PI, false);
  g.lineTo(cx - Rb, cy + bodyH);
  g.ellipse(cx, cy + bodyH, Rb, Rb * rimSq, 0, Math.PI, 0, true);
  g.closePath();
  g.fillStyle = g.createPattern(speckleCanvas(), 'repeat');
  g.fill();
  // 圆柱的明暗：两侧暗、偏左一道高光
  const sh = g.createLinearGradient(cx - Ro, 0, cx + Ro, 0);
  sh.addColorStop(0, 'rgba(40,25,15,0.45)');
  sh.addColorStop(0.3, 'rgba(255,250,240,0.12)');
  sh.addColorStop(0.55, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(40,25,15,0.5)');
  g.fillStyle = sh;
  g.fill();
  g.restore();
}

// 杯口：一圈粗陶边（俯视的正圆，调用方按杯口扁度压扁）
export function drawStoneRim(g, cx, cy, R) {
  const Ro = R * 1.1;
  g.save();
  g.beginPath();
  g.arc(cx, cy, Ro, 0, Math.PI * 2);
  g.arc(cx, cy, R * 0.985, 0, Math.PI * 2, true);
  g.fillStyle = g.createPattern(speckleCanvas(), 'repeat');
  g.fill('evenodd');
  // 边沿圆润：外圈暗、中间亮
  const rg = g.createRadialGradient(cx, cy, R * 0.985, cx, cy, Ro);
  rg.addColorStop(0, 'rgba(60,40,25,0.35)');
  rg.addColorStop(0.45, 'rgba(255,252,245,0.25)');
  rg.addColorStop(1, 'rgba(60,40,25,0.3)');
  g.fillStyle = rg;
  g.fill('evenodd');
  g.restore();
}
