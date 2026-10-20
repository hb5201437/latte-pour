// 俯视的不锈钢拉花缸：缸嘴朝前（对着杯子），把手朝后（对着自己）。
// 只负责画，位置、高度、倾斜由 game.js 算好传进来。
//
// s：{ tipX, tipY }     缸嘴尖在液面上对准的点（屏幕坐标）
//    fwd, lat           前方、横向单位向量（屏幕坐标）
//    size               缸身半径（像素）
//    height             离液面高度 0~1：越高缸越大、影子离得越远、奶柱越长
//    tilt               倾斜程度 0~1：越倾缸里奶面越往缸嘴偏
//    milk               缸里剩下的奶 0~1
//    stream             奶柱粗细（像素），0 = 不出奶
//    alpha              整体透明度（倒完移开时淡出）
export function drawPitcher(ctx, s) {
  const { fwd, lat, size, height, tilt, milk, stream, alpha } = s;
  if (alpha <= 0) return;
  const scale = 1 + 0.18 * height;
  const br = size * scale;
  const spout = size * 0.42 * scale;
  // 越高越往镜头这边（屏幕下方）偏，奶柱从缸嘴落到液面上的点
  const lift = size * 0.6 * height;
  const tx = s.tipX - fwd.x * lift * 0.35, ty = s.tipY + lift * 0.55;
  const bx = tx - fwd.x * (br + spout), by = ty - fwd.y * (br + spout);

  ctx.save();
  ctx.globalAlpha = alpha;

  // 影子：落在液面/桌面上，越高越淡越散
  const shx = s.tipX - fwd.x * (br + spout) + size * 0.25 * height;
  const shy = s.tipY - fwd.y * (br + spout) + size * 0.15 * height;
  const shg = ctx.createRadialGradient(shx, shy, br * 0.3, shx, shy, br * (1.15 + 0.4 * height));
  shg.addColorStop(0, `rgba(0,0,0,${0.32 - 0.18 * height})`);
  shg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shg;
  ctx.beginPath();
  ctx.arc(shx, shy, br * (1.15 + 0.4 * height), 0, Math.PI * 2);
  ctx.fill();

  // 奶柱：从缸嘴尖落到液面
  if (stream > 0.3) {
    const g = ctx.createLinearGradient(tx, ty, s.tipX, s.tipY);
    g.addColorStop(0, 'rgba(250,247,240,0.95)');
    g.addColorStop(1, 'rgba(250,247,240,0.85)');
    ctx.beginPath();
    ctx.moveTo(tx + lat.x * stream * 0.6, ty + lat.y * stream * 0.6);
    ctx.lineTo(s.tipX + lat.x * stream * 0.45, s.tipY + lat.y * stream * 0.45);
    ctx.lineTo(s.tipX - lat.x * stream * 0.45, s.tipY - lat.y * stream * 0.45);
    ctx.lineTo(tx - lat.x * stream * 0.6, ty - lat.y * stream * 0.6);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
  }

  // 把手（朝后）
  const hx0 = bx - fwd.x * br * 0.82, hy0 = by - fwd.y * br * 0.82;
  const hx1 = bx - fwd.x * br * 1.45, hy1 = by - fwd.y * br * 1.45;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#26292d';
  ctx.lineWidth = br * 0.34;
  ctx.beginPath(); ctx.moveTo(hx0, hy0); ctx.lineTo(hx1, hy1); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = br * 0.08;
  ctx.beginPath();
  ctx.moveTo(hx0 + lat.x * br * 0.07, hy0 + lat.y * br * 0.07);
  ctx.lineTo(hx1 + lat.x * br * 0.07, hy1 + lat.y * br * 0.07);
  ctx.stroke();

  // 缸嘴：从缸口往前收成尖
  const sbx = bx + fwd.x * br * 0.62, sby = by + fwd.y * br * 0.62;
  const sw = br * 0.55;
  const sg = ctx.createLinearGradient(sbx - lat.x * sw, sby - lat.y * sw, sbx + lat.x * sw, sby + lat.y * sw);
  sg.addColorStop(0, '#8d939b');
  sg.addColorStop(0.45, '#eef0f3');
  sg.addColorStop(1, '#9ca2aa');
  ctx.beginPath();
  ctx.moveTo(sbx + lat.x * sw, sby + lat.y * sw);
  ctx.quadraticCurveTo(sbx + lat.x * sw * 0.35 + fwd.x * spout * 0.7, sby + lat.y * sw * 0.35 + fwd.y * spout * 0.7, tx, ty);
  ctx.quadraticCurveTo(sbx - lat.x * sw * 0.35 + fwd.x * spout * 0.7, sby - lat.y * sw * 0.35 + fwd.y * spout * 0.7, sbx - lat.x * sw, sby - lat.y * sw);
  ctx.closePath();
  ctx.fillStyle = sg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(70,75,82,0.7)';
  ctx.lineWidth = Math.max(1, br * 0.03);
  ctx.stroke();

  // 缸身外圈
  const bg = ctx.createRadialGradient(bx - lat.x * br * 0.35, by - lat.y * br * 0.35 - br * 0.2, br * 0.1, bx, by, br);
  bg.addColorStop(0, '#f6f7f9');
  bg.addColorStop(0.6, '#c3c8ce');
  bg.addColorStop(1, '#878d95');
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = '#6c727a';
  ctx.lineWidth = Math.max(1, br * 0.035);
  ctx.stroke();

  // 缸口内壁
  const ir = br * 0.86;
  const ig = ctx.createRadialGradient(bx, by, ir * 0.2, bx, by, ir);
  ig.addColorStop(0, '#a9aeb5');
  ig.addColorStop(1, '#6b7179');
  ctx.beginPath();
  ctx.arc(bx, by, ir, 0, Math.PI * 2);
  ctx.fillStyle = ig;
  ctx.fill();

  // 缸里的奶面：倾斜时往缸嘴那边偏，奶越少露出的内壁越多
  if (milk > 0.02) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, ir, 0, Math.PI * 2);
    ctx.clip();
    const mr = ir * (0.55 + 0.45 * Math.sqrt(milk));
    const shift = (ir - mr) + ir * 0.25 * tilt;
    const mx = bx + fwd.x * shift, my = by + fwd.y * shift;
    const mg = ctx.createRadialGradient(mx - lat.x * mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
    mg.addColorStop(0, '#fffdf8');
    mg.addColorStop(1, '#e9e2d6');
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fillStyle = mg;
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}
