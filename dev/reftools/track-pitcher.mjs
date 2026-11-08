// 从参考视频里量拉花缸怎么动：逐帧找拉花缸左边缘（亮的缸身 vs 暗的桌面），得到左右摆动和前后移动。
// 视频是用户自己的参考资料，不提交；这个脚本只读视频、输出 CSV。
// 用法：node dev/reftools/track-pitcher.mjs <视频> <开始秒> <时长秒> <crop=w:h:x:y> <行号,行号,...> <x 搜索范围 lo:hi> [out.csv]
//   行号、x 都是裁剪后的像素坐标。每行输出：时间, 每一行的左边缘 x（找不到为空）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [video, ss, dur, crop, rowsArg, xr, out = 'track.csv'] = process.argv.slice(2);
const [W, H] = crop.split(':').map(Number);
const rows = rowsArg.split(',').map(Number);
const [xlo, xhi] = xr.split(':').map(Number);
const ff = spawn('ffmpeg', ['-loglevel', 'error', '-ss', ss, '-t', dur, '-i', video, '-vf', `crop=${crop},format=gray`, '-f', 'rawvideo', '-']);
const size = W * H;
let buf = Buffer.alloc(0), frame = 0;
const lines = ['t,' + rows.map(r => 'x' + r).join(',')];
const fps = 60;

// 一行里亮度从暗变亮最陡的位置（7 像素平均，抗噪），对比度不够时返回空
function leftEdge(img, y) {
  let best = 0, bx = -1;
  const at = x => { let s = 0; for (let k = -1; k <= 1; k++) for (let j = -2; j <= 2; j++) s += img[(y + k) * W + x + j]; return s / 15; };
  for (let x = xlo; x < xhi; x++) {
    const g = at(x + 4) - at(x - 4);
    if (g > best) { best = g; bx = x; }
  }
  return best > 25 ? bx : '';
}

ff.stdout.on('data', d => {
  buf = Buffer.concat([buf, d]);
  while (buf.length >= size) {
    const img = buf.subarray(0, size);
    lines.push([(+ss + frame / fps).toFixed(3), ...rows.map(y => leftEdge(img, y))].join(','));
    buf = buf.subarray(size);
    frame++;
  }
});
ff.on('close', () => { writeFileSync(out, lines.join('\n') + '\n'); console.log(`${frame} 帧 → ${out}`); });
