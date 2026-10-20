// 斜着拿的不锈钢拉花缸，从上往下看：缸嘴朝前（对着杯子），把手朝后（对着自己）。
// 倾得越多，缸口这个椭圆被压得越扁，能看到的缸身侧壁越多。
// 只负责画，位置、高度、倾斜由 game.js 算好传进来。
//
// s：{ tipX, tipY }     缸嘴尖对准的液面位置（屏幕坐标）
//    fwd, lat           前方、横向单位向量（屏幕坐标）
//    size               缸口半径（像素）
//    height             离液面高度 0~1：越高缸越大、影子离得越远、奶柱越长
//    tilt               倾斜程度 0~1
//    milk               缸里剩下的奶 0~1
//    stream             奶柱粗细（像素），0 = 不出奶
//    alpha              整体透明度（倒完移开时淡出）
export function drawPitcher(ctx, s) {
  const { fwd, lat, size, height, tilt, milk, stream, alpha } = s;
  if (alpha <= 0) return;
  const scale = 1 + 0.12 * height;
  const br = size * scale;
  // 缸身倾角：端着的时候约 25°，倒到最大约 60°
  const ang = (25 + 35 * tilt) * Math.PI / 180;
  const sq = Math.cos(ang);           // 缸口椭圆在前后方向的压扁比例
  const wall = br * 1.25 * Math.sin(ang); // 看得到的侧壁长度
  const spout = br * 0.45;
  // 越高越往镜头这边偏，奶柱从缸嘴尖落到液面上的点
  const up = size * 0.35 * height;
  const tx = s.tipX, ty = s.tipY + up;
  // 缸口中心、缸底中心
  const ox = tx - fwd.x * (spout + br * sq), oy = ty - fwd.y * (spout + br * sq);
  const bx = ox - fwd.x * wall, by = oy - fwd.y * wall;
  const rot = Math.atan2(lat.y, lat.x);

  ctx.save();
  ctx.globalAlpha = alpha;

  // 影子：落在液面/桌面上，越高越淡越散
  const shx = (ox + bx) / 2 + br * 0.15 * height, shy = (oy + by) / 2 - up + br * 0.1 * height;
  const shr = br * (1.2 + 0.3 * height);
  const shg = ctx.createRadialGradient(shx, shy, shr * 0.2, shx, shy, shr);
  shg.addColorStop(0, `rgba(0,0,0,${0.3 - 0.15 * height})`);
  shg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shg;
  ctx.beginPath();
  ctx.arc(shx, shy, shr, 0, Math.PI * 2);
  ctx.fill();

  // 奶柱：从缸嘴尖落到液面
  if (stream > 0.3) {
    ctx.beginPath();
    ctx.moveTo(tx + lat.x * stream * 0.6, ty + lat.y * stream * 0.6);
    ctx.lineTo(s.tipX + lat.x * stream * 0.45, s.tipY + lat.y * stream * 0.45);
    ctx.lineTo(s.tipX - lat.x * stream * 0.45, s.tipY - lat.y * stream * 0.45);
    ctx.lineTo(tx - lat.x * stream * 0.6, ty - lat.y * stream * 0.6);
    ctx.closePath();
    ctx.fillStyle = 'rgba(250,247,240,0.92)';
    ctx.fill();
  }

  // 把手：从缸身后侧伸出来
  const hx0 = bx + fwd.x * wall * 0.3, hy0 = by + fwd.y * wall * 0.3;
  const hx1 = bx - fwd.x * br * 0.75, hy1 = by - fwd.y * br * 0.75;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#25282c';
  ctx.lineWidth = br * 0.26;
  ctx.beginPath(); ctx.moveTo(hx0, hy0); ctx.lineTo(hx1, hy1); ctx.stroke();

  // 侧壁：缸口椭圆和缸底椭圆之间的部分
  const wg = ctx.createLinearGradient(ox - lat.x * br, oy - lat.y * br, ox + lat.x * br, oy + lat.y * br);
  wg.addColorStop(0, '#7c828a');
  wg.addColorStop(0.35, '#e9ecef');
  wg.addColorStop(0.55, '#c9cdd2');
  wg.addColorStop(1, '#6f757d');
  ctx.beginPath();
  ctx.ellipse(bx, by, br * 0.97, br * sq * 0.97, rot, 0, Math.PI * 2);
  ctx.fillStyle = wg;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(ox + lat.x * br, oy + lat.y * br);
  ctx.lineTo(bx + lat.x * br * 0.97, by + lat.y * br * 0.97);
  ctx.lineTo(bx - lat.x * br * 0.97, by - lat.y * br * 0.97);
  ctx.lineTo(ox - lat.x * br, oy - lat.y * br);
  ctx.closePath();
  ctx.fill();

  // 缸嘴：从缸口前沿往前收成尖
  const fx0 = ox + fwd.x * br * sq * 0.7, fy0 = oy + fwd.y * br * sq * 0.7;
  const sw = br * 0.55;
  const sg = ctx.createLinearGradient(fx0 - lat.x * sw, fy0 - lat.y * sw, fx0 + lat.x * sw, fy0 + lat.y * sw);
  sg.addColorStop(0, '#8b9199');
  sg.addColorStop(0.5, '#f2f4f6');
  sg.addColorStop(1, '#8b9199');
  ctx.beginPath();
  ctx.moveTo(fx0 + lat.x * sw, fy0 + lat.y * sw);
  ctx.quadraticCurveTo(fx0 + lat.x * sw * 0.3 + fwd.x * spout * 0.75, fy0 + lat.y * sw * 0.3 + fwd.y * spout * 0.75, tx, ty);
  ctx.quadraticCurveTo(fx0 - lat.x * sw * 0.3 + fwd.x * spout * 0.75, fy0 - lat.y * sw * 0.3 + fwd.y * spout * 0.75, fx0 - lat.x * sw, fy0 - lat.y * sw);
  ctx.closePath();
  ctx.fillStyle = sg;
  ctx.fill();

  // 缸口（金属边）
  ctx.beginPath();
  ctx.ellipse(ox, oy, br, br * sq, rot, 0, Math.PI * 2);
  ctx.fillStyle = '#d9dde1';
  ctx.fill();
  ctx.strokeStyle = '#6c727a';
  ctx.lineWidth = Math.max(1, br * 0.025);
  ctx.stroke();

  // 内壁
  const ir = br * 0.92;
  ctx.beginPath();
  ctx.ellipse(ox, oy, ir, ir * sq, rot, 0, Math.PI * 2);
  const ig = ctx.createLinearGradient(ox - fwd.x * ir, oy - fwd.y * ir, ox + fwd.x * ir, oy + fwd.y * ir);
  ig.addColorStop(0, '#5f656d');
  ig.addColorStop(1, '#a7acb3');
  ctx.fillStyle = ig;
  ctx.fill();

  // 奶面：缸倾斜时奶往缸嘴那边聚，奶越少露出的内壁越多
  if (milk > 0.02) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(ox, oy, ir, ir * sq, rot, 0, Math.PI * 2);
    ctx.clip();
    const mr = ir * (0.45 + 0.55 * Math.sqrt(milk));
    const shift = (ir - mr) * sq + ir * sq * 0.2 * tilt;
    const mx = ox + fwd.x * shift, my = oy + fwd.y * shift;
    const mg = ctx.createLinearGradient(mx - lat.x * mr, my - lat.y * mr, mx + lat.x * mr, my + lat.y * mr);
    mg.addColorStop(0, '#efe8dc');
    mg.addColorStop(0.4, '#fffdf8');
    mg.addColorStop(1, '#e8e0d2');
    ctx.beginPath();
    ctx.ellipse(mx, my, mr, mr * sq, rot, 0, Math.PI * 2);
    ctx.fillStyle = mg;
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}
