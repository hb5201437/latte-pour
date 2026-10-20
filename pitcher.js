// 斜着拿的不锈钢拉花缸，从上往下看：缸嘴朝前（对着杯子），把手朝后（对着自己）。
// 拉花缸是上窄下宽的"大肚"形：上面看到缸口的椭圆，往后能看到鼓出来的缸身和缸底。
// 倾得越多，缸口椭圆压得越扁、看到的缸身越多。只负责画，状态由 game.js 传进来。
//
// s：{ tipX, tipY }     缸嘴尖对准的液面位置（屏幕坐标）
//    fwd, lat           前方、横向单位向量（屏幕坐标）
//    size               缸口半径（像素）
//    height             离液面高度 0~1：越高缸越大、影子离得越远、奶柱越长
//    tilt               倾斜程度 0~1
//    milk               缸里剩下的奶 0~1
//    stream             奶柱粗细（像素），0 = 不出奶
//    alpha              整体透明度（倒完移开时淡出）
//    rock               左右歪的角度（弧度），整只缸绕缸嘴尖转
//    slosh              { x, y } 奶面晃动的偏移（缸口内半径的比例，x 横向、y 前后）
export function drawPitcher(ctx, s) {
  const { fwd, lat, size, height, tilt, milk, stream, alpha } = s;
  const rock = s.rock || 0, slosh = s.slosh || { x: 0, y: 0 };
  if (alpha <= 0) return;
  const scale = 1 + 0.12 * height;
  const br = size * scale;                 // 缸口半径
  const belly = br * 1.16;                 // 缸身最鼓处半径
  const ang = (25 + 35 * tilt) * Math.PI / 180;
  const sq = Math.cos(ang);                // 缸口椭圆前后方向的压扁比例
  const wall = br * 1.3 * Math.sin(ang);   // 看得到的缸身长度
  const spout = br * 0.5;
  const up = size * 0.35 * height;
  const tx = s.tipX, ty = s.tipY + up;     // 缸嘴尖（离液面越高越往镜头这边偏）
  const ox = tx - fwd.x * (spout + br * sq), oy = ty - fwd.y * (spout + br * sq); // 缸口中心
  const bx = ox - fwd.x * wall, by = oy - fwd.y * wall;                           // 缸底中心
  const mx0 = (ox + bx) / 2, my0 = (oy + by) / 2;                                 // 缸身最鼓处
  const rot = Math.atan2(lat.y, lat.x);
  const P = (cx, cy, a, b) => [cx + lat.x * a + fwd.x * b, cy + lat.y * a + fwd.y * b];

  ctx.save();
  ctx.globalAlpha = alpha;
  // 左右歪：整只缸绕缸嘴落点转（奶柱落点不动）
  if (rock) {
    ctx.translate(s.tipX, s.tipY);
    ctx.rotate(rock);
    ctx.translate(-s.tipX, -s.tipY);
  }

  // —— 影子：落在液面/桌面上，越高越淡越散 ——
  const shx = mx0 + br * 0.15 * height, shy = my0 - up + br * 0.12 * height;
  const shr = belly * (1.15 + 0.35 * height);
  const shg = ctx.createRadialGradient(shx, shy, shr * 0.15, shx, shy, shr);
  shg.addColorStop(0, `rgba(0,0,0,${0.32 - 0.16 * height})`);
  shg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shg;
  ctx.beginPath();
  ctx.arc(shx, shy, shr, 0, Math.PI * 2);
  ctx.fill();

  // —— 奶柱：从缸嘴尖落到液面，带一点光泽 ——
  if (stream > 0.3) {
    const sg = ctx.createLinearGradient(tx - lat.x * stream, ty - lat.y * stream, tx + lat.x * stream, ty + lat.y * stream);
    sg.addColorStop(0, 'rgba(232,224,212,0.95)');
    sg.addColorStop(0.45, 'rgba(255,253,248,0.98)');
    sg.addColorStop(1, 'rgba(226,217,204,0.95)');
    ctx.beginPath();
    ctx.moveTo(tx + lat.x * stream * 0.6, ty + lat.y * stream * 0.6);
    ctx.lineTo(s.tipX + lat.x * stream * 0.45, s.tipY + lat.y * stream * 0.45);
    ctx.lineTo(s.tipX - lat.x * stream * 0.45, s.tipY - lat.y * stream * 0.45);
    ctx.lineTo(tx - lat.x * stream * 0.6, ty - lat.y * stream * 0.6);
    ctx.closePath();
    ctx.fillStyle = sg;
    ctx.fill();
  }

  // —— 缸身：缸口椭圆 → 鼓肚 → 缸底，拉丝不锈钢 ——
  const body = () => {
    ctx.beginPath();
    const [a0x, a0y] = P(ox, oy, br, 0);
    ctx.moveTo(a0x, a0y);
    const [c1x, c1y] = P(mx0, my0, belly * 1.06, 0);
    const [b0x, b0y] = P(bx, by, belly * 0.98, 0);
    ctx.quadraticCurveTo(c1x, c1y, b0x, b0y);
    ctx.ellipse(bx, by, belly * 0.98, belly * 0.98 * sq, rot, 0, Math.PI, false);
    const [c2x, c2y] = P(mx0, my0, -belly * 1.06, 0);
    const [a1x, a1y] = P(ox, oy, -br, 0);
    ctx.quadraticCurveTo(c2x, c2y, a1x, a1y);
    ctx.ellipse(ox, oy, br, br * sq, rot, Math.PI, 0, false);
    ctx.closePath();
  };
  const [l0x, l0y] = P(mx0, my0, -belly * 1.05, 0), [l1x, l1y] = P(mx0, my0, belly * 1.05, 0);
  const steel = ctx.createLinearGradient(l0x, l0y, l1x, l1y);
  steel.addColorStop(0, '#5d636b');
  steel.addColorStop(0.12, '#9aa1aa');
  steel.addColorStop(0.28, '#eef1f4');
  steel.addColorStop(0.36, '#c4c9cf');
  steel.addColorStop(0.55, '#8d949d');
  steel.addColorStop(0.7, '#d9dde2');
  steel.addColorStop(0.8, '#f7f9fb');
  steel.addColorStop(0.9, '#a2a9b2');
  steel.addColorStop(1, '#5a6068');
  body();
  ctx.fillStyle = steel;
  ctx.fill();
  // 拉丝纹：沿缸身方向的细线
  ctx.save();
  body();
  ctx.clip();
  ctx.lineWidth = 1;
  for (let k = -12; k <= 12; k++) {
    const off = (k / 12) * belly;
    const [p0x, p0y] = P(ox, oy, off, br);
    const [p1x, p1y] = P(bx, by, off * 1.1, -belly);
    ctx.strokeStyle = k % 3 === 0 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)';
    ctx.beginPath(); ctx.moveTo(p0x, p0y); ctx.lineTo(p1x, p1y); ctx.stroke();
  }
  // 缸底一圈暗边
  ctx.beginPath();
  ctx.ellipse(bx, by, belly * 0.98, belly * 0.98 * sq, rot, 0, Math.PI, false);
  ctx.strokeStyle = 'rgba(30,32,36,0.45)';
  ctx.lineWidth = br * 0.06;
  ctx.stroke();
  ctx.restore();
  body();
  ctx.strokeStyle = 'rgba(40,44,50,0.55)';
  ctx.lineWidth = Math.max(1, br * 0.02);
  ctx.stroke();

  // —— 把手：咖啡师右手握着，从缸身右侧伸出去的一个弯把 ——
  const [h0x, h0y] = P(ox, oy, br * 0.92, -br * sq * 0.35);
  const [hcx, hcy] = P(mx0, my0, belly * 1.95, -wall * 0.15);
  const [h1x, h1y] = P(bx, by, belly * 0.95, br * 0.15);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1b1d20';
  ctx.lineWidth = br * 0.24;
  ctx.beginPath(); ctx.moveTo(h0x, h0y); ctx.quadraticCurveTo(hcx, hcy, h1x, h1y); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = br * 0.06;
  const [q0x, q0y] = P(h0x, h0y, 0, br * 0.05), [qcx, qcy] = P(hcx, hcy, -br * 0.06, br * 0.05), [q1x, q1y] = P(h1x, h1y, 0, br * 0.05);
  ctx.beginPath(); ctx.moveTo(q0x, q0y); ctx.quadraticCurveTo(qcx, qcy, q1x, q1y); ctx.stroke();

  // —— 缸嘴：从缸口前沿伸出的尖嘴，中间有导流槽 ——
  const [s0x, s0y] = P(ox, oy, br * 0.62, br * sq * 0.55);
  const [s1x, s1y] = P(ox, oy, -br * 0.62, br * sq * 0.55);
  const [k0x, k0y] = P(ox, oy, br * 0.3, br * sq + spout * 0.55);
  const [k1x, k1y] = P(ox, oy, -br * 0.3, br * sq + spout * 0.55);
  const spg = ctx.createLinearGradient(s1x, s1y, s0x, s0y);
  spg.addColorStop(0, '#7f868f');
  spg.addColorStop(0.4, '#f4f6f8');
  spg.addColorStop(0.6, '#d3d8dd');
  spg.addColorStop(1, '#858c95');
  ctx.beginPath();
  ctx.moveTo(s0x, s0y);
  ctx.quadraticCurveTo(k0x, k0y, tx, ty);
  ctx.quadraticCurveTo(k1x, k1y, s1x, s1y);
  ctx.closePath();
  ctx.fillStyle = spg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,44,50,0.5)';
  ctx.lineWidth = Math.max(1, br * 0.018);
  ctx.stroke();
  // 导流槽
  const [g0x, g0y] = P(ox, oy, 0, br * sq * 0.7);
  ctx.beginPath();
  ctx.moveTo(g0x, g0y);
  ctx.lineTo(tx - fwd.x * br * 0.05, ty - fwd.y * br * 0.05);
  ctx.strokeStyle = 'rgba(70,76,84,0.55)';
  ctx.lineWidth = br * 0.07;
  ctx.stroke();

  // —— 缸口：卷边，前亮后暗 ——
  ctx.beginPath();
  ctx.ellipse(ox, oy, br, br * sq, rot, 0, Math.PI * 2);
  const rimG = ctx.createLinearGradient(...P(ox, oy, 0, -br * sq), ...P(ox, oy, 0, br * sq));
  rimG.addColorStop(0, '#9aa1a9');
  rimG.addColorStop(0.5, '#e6e9ec');
  rimG.addColorStop(1, '#fbfcfd');
  ctx.fillStyle = rimG;
  ctx.fill();

  // 内壁
  const ir = br * 0.9;
  ctx.beginPath();
  ctx.ellipse(ox, oy, ir, ir * sq, rot, 0, Math.PI * 2);
  const ig = ctx.createLinearGradient(...P(ox, oy, 0, -ir * sq), ...P(ox, oy, 0, ir * sq));
  ig.addColorStop(0, '#565c64');
  ig.addColorStop(1, '#b3b8be');
  ctx.fillStyle = ig;
  ctx.fill();

  // —— 奶面：倾斜时往缸嘴那边聚，靠缸嘴更白、后面被缸壁挡住发灰；奶越少露出的内壁越多 ——
  if (milk > 0.02) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(ox, oy, ir, ir * sq, rot, 0, Math.PI * 2);
    ctx.clip();
    // 奶越少，奶面越低越小（露出的内壁越多）；倾斜时往缸嘴涌；摇晃时来回荡
    const mr = ir * (0.3 + 0.7 * Math.sqrt(milk));
    const shift = (ir - mr) * sq * (0.4 + 0.6 * tilt) + ir * sq * (0.15 * tilt + slosh.y * 0.35);
    const side = slosh.x * (ir - mr * 0.6) * 0.6;
    const mx = ox + fwd.x * shift + lat.x * side, my = oy + fwd.y * shift + lat.y * side;
    const mg = ctx.createLinearGradient(...P(mx, my, 0, -mr * sq), ...P(mx, my, 0, mr * sq));
    mg.addColorStop(0, '#cfc7bb');
    mg.addColorStop(0.45, '#f7f2ea');
    mg.addColorStop(1, '#fffdf9');
    ctx.beginPath();
    ctx.ellipse(mx, my, mr, mr * sq, rot, 0, Math.PI * 2);
    ctx.fillStyle = mg;
    ctx.fill();
    // 奶面上的一小块反光
    const [hx, hy] = P(mx, my, -mr * 0.35, mr * sq * 0.1);
    const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, mr * 0.35);
    hg.addColorStop(0, 'rgba(255,255,255,0.7)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(hx - mr, hy - mr, mr * 2, mr * 2);
    ctx.restore();
  }

  // 缸口边缘的高光线
  ctx.beginPath();
  ctx.ellipse(ox, oy, br * 0.95, br * sq * 0.95, rot, Math.PI * 0.05, Math.PI * 0.95);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = Math.max(1, br * 0.025);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(ox, oy, br, br * sq, rot, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(40,44,50,0.55)';
  ctx.lineWidth = Math.max(1, br * 0.02);
  ctx.stroke();

  ctx.restore();
}
