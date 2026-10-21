// 生成图案卡片上的示范图：用游戏同一套奶泡模型按示范倒法跑一遍。
// 分小段跑、不卡住页面；结果存在本机，下次打开直接用。
import { createFoam } from './fluidfoam.js';
import { Pour } from './pour.js';

const N = 256, DT = 1 / 60;
let shared = null; // 示范图共用一个奶泡（GPU 上下文不能开太多）
let queue = Promise.resolve();

export function renderDemo(pattern, key) {
  const cacheKey = `latte-pour.demo.${pattern.id}.${key}`;
  try { const hit = localStorage.getItem(cacheKey); if (hit) return Promise.resolve(hit); } catch { /* 忽略 */ }
  // 一张一张排队跑（共用同一个奶泡）
  queue = queue.then(() => run(pattern, cacheKey));
  return queue;
}

function run(pattern, cacheKey) {
  const steps = [];
  if (!shared) shared = createFoam(N, 256);
  // GPU 奶泡出白快，用它自己那套更短的示范倒法
  const demo = shared.isFluid && pattern.fluid?.demo || pattern.demo;
  for (const sg of demo) for (let t = 0; t < sg.t; t += DT) steps.push({ sg, f: t / sg.t });
  const sim = shared, pour = new Pour(), c = N / 2;
  sim.reset();
  let i = 0, tt = 0;
  return new Promise(resolve => {
    const chunk = () => {
      // 正在倒奶时先停下，别和游戏抢 GPU
      const play = document.getElementById('play');
      if (play && !play.hidden) { setTimeout(chunk, 300); return; }
      const end = Math.min(steps.length, i + 25);
      for (; i < end; i++) {
        const { sg, f } = steps[i];
        const y = c + (sg.y0 + (sg.y1 - sg.y0) * f) * c;
        const x = c + Math.sin(tt * (sg.hz || 0) * 2 * Math.PI) * (sg.wig || 0) * c;
        if (i === 0) pour.start(x, y);
        sim.step(DT, pour.update(DT, x, y, sg.flow ?? 1, sg.lift ?? null));
        tt += DT;
      }
      if (i < steps.length) { setTimeout(chunk, 0); return; }
      const cv = document.createElement('canvas');
      cv.width = cv.height = N;
      const g = cv.getContext('2d');
      if (sim.isFluid) { sim.render(); g.drawImage(sim.canvas, 0, 0, N, N); }
      else { const im = g.createImageData(N, N); sim.render(im.data); g.putImageData(im, 0, 0); }
      const url = cv.toDataURL('image/jpeg', 0.85);
      try { localStorage.setItem(cacheKey, url); } catch { /* 存不下就算了 */ }
      resolve(url);
    };
    chunk();
  });
}
