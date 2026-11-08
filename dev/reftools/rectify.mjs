// 把参考视频的关键帧"摆正"：液面在画面里是斜着看的椭圆，按椭圆仿射成正圆，再转 180°（视频里拉花缸在上方，游戏里在下方）。
// 用法：node dev/reftools/rectify.mjs <视频> <keys.json> <输出目录> [size=512]
//   keys.json：[{ "name": "k1", "t": 103.8, "cx": 804, "cy": 1384, "ax": 424, "ay": 324, "rot": 0 }, ...]
//   cx, cy, ax, ay：液面椭圆在视频原始帧里的中心和半轴（像素），rot：椭圆转角（度，顺时针）
// 每帧输出 <name>.png（摆正后的液面，圆外为黑）和 <name>-check.png（原帧上画出椭圆，检查标得准不准）
// 参考视频是第三方教程录屏，椭圆参数和输出图都放 dev/ref/（不提交）
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';

const [video, keysPath, outDir, sizeArg] = process.argv.slice(2);
const N = Number(sizeArg) || 512;
const keys = JSON.parse(readFileSync(keysPath, 'utf8'));
mkdirSync(outDir, { recursive: true });

function frame(t) {
  const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', video]).toString().trim().split(',').map(Number);
  const [W, H] = probe;
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-ss', String(t), '-i', video, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: W * H * 3 + 1024 });
  return { W, H, raw };
}

const toPng = (rgb, w, h, path) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-i', '-', path], { input: rgb });

for (const k of keys) {
  const { W, H, raw } = frame(k.t);
  const a = ((k.rot || 0) * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  // 液面上的点（单位圆，u 向右、v 向下，游戏方向）→ 视频像素：先转 180°，再按椭圆放大、旋转、平移
  const map = (u, v) => { const x = -u * k.ax, y = -v * k.ay; return [k.cx + x * ca - y * sa, k.cy + x * sa + y * ca]; };
  const out = Buffer.alloc(N * N * 3);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = ((i + 0.5) / N) * 2 - 1, v = ((j + 0.5) / N) * 2 - 1;
    if (u * u + v * v > 1) continue;
    const [x, y] = map(u, v);
    // 双线性取样
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    if (x0 < 0 || y0 < 0 || x0 + 1 >= W || y0 + 1 >= H) continue;
    for (let c = 0; c < 3; c++) {
      const p = (yy, xx) => raw[(yy * W + xx) * 3 + c];
      out[(j * N + i) * 3 + c] = Math.round(p(y0, x0) * (1 - fx) * (1 - fy) + p(y0, x0 + 1) * fx * (1 - fy) + p(y0 + 1, x0) * (1 - fx) * fy + p(y0 + 1, x0 + 1) * fx * fy);
    }
  }
  toPng(out, N, N, `${outDir}/${k.name}.png`);
  // 检查图：原帧上画椭圆（红点）和"前方"方向（绿点：游戏里的上方）
  const chk = Buffer.from(raw);
  const dot = (x, y, col) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const xx = Math.round(x) + dx, yy = Math.round(y) + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; chk.set(col, (yy * W + xx) * 3); } };
  for (let s = 0; s < 360; s += 1) { const [x, y] = map(Math.cos((s * Math.PI) / 180), Math.sin((s * Math.PI) / 180)); dot(x, y, [255, 0, 0]); }
  for (let s = 0; s <= 10; s++) { const [x, y] = map(0, -s / 10); dot(x, y, [0, 255, 0]); }
  toPng(chk, W, H, `${outDir}/${k.name}-check.png`);
  console.log(k.name, k.t, '→', `${outDir}/${k.name}.png`);
}
