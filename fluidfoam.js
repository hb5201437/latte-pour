// 游戏用的奶泡：GPU 真流体（fluid.js），对游戏和评分提供和旧模型（sim.js）一样的接口。
// 位置用格坐标（0~n，y 朝下，拉花缸在下方）；不支持 WebGL2 的设备退回旧模型。
import { config } from './config.js';
import { FluidSim, P } from './fluid.js';
import { FoamSim } from './sim.js';

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createFoam(n, quality = 512) {
  // ?engine=old 强制用旧模型（对比用）
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('engine') === 'old') return new FoamSim(n);
  const q = typeof location !== 'undefined' && Number(new URLSearchParams(location.search).get('q'));
  if (q) quality = q;
  try { return new FluidFoam(n, quality); } catch (e) { console.warn('GPU 奶泡不可用，改用旧模型：', e.message); return new FoamSim(n); }
}

class FluidFoam {
  constructor(n, quality) {
    this.n = n;
    this.isFluid = true;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = Math.min(1024, quality * 1.5);
    const gl = this.canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: true });
    if (!gl) throw new Error('没有 WebGL2');
    P.fusionSec = config.fusionSec;
    // ?fp={"参数":值} 临时覆盖流体参数（调手感用）
    try { Object.assign(P, JSON.parse(new URLSearchParams(location.search).get('fp') || '{}')); } catch { /* 忽略 */ }
    this.fluid = new FluidSim(gl, quality);
    this.reset();
    if (new URLSearchParams(location.search).get('debug')) globalThis.__foam = this;
  }

  reset() {
    this.fluid.reset();
    this.vol = 0;
    this.pulled = false;
    this.backTravel = 0;
    this.backStart = null;
    this.pieces = 0;
    this.d = null;
  }

  // 液面（杯子斜着时液面贴着拉花缸那侧的杯壁），和旧模型一样
  surface() {
    const n = this.n, c = (n - 1) / 2, Rc = n / 2 - 1;
    const fill = Math.min(1, this.vol / config.cupCapacity);
    const e = smoothstep(0, config.levelAt, fill);
    const r = Rc * (config.tiltSurface + (1 - config.tiltSurface) * e);
    const bx = -Math.cos(config.forwardAngle), by = -Math.sin(config.forwardAngle);
    return { x: c + bx * (Rc - r), y: c + by * (Rc - r), r, ax: c + bx * Rc, ay: c + by * Rc, level: e };
  }

  step(dt, src) {
    const lift = src.lift ?? 0;
    if (lift > 0.8 && Math.hypot(src.vx, src.vy) > 60) this.pulled = true;
    if (src.q > config.flowMax * 0.2 && lift < 0.5) {
      const back = -(src.x * Math.cos(config.forwardAngle) + src.y * Math.sin(config.forwardAngle));
      if (this.backStart == null) this.backStart = back;
      this.backTravel = Math.max(this.backTravel, back - this.backStart);
    }
    if (src.q > 0) this.vol += (src.q / config.flowMax) * dt;
    // 推了几片（郁金香）：出白时 pour.js 给的片号（停一下再推算新的一片）
    if (src.q > config.flowMax * 0.2 && lift < 0.5 && !src.fusion) this.pieces = Math.max(this.pieces, (src.piece ?? 0) + 1);
    // pour.js 抬高时把流量降到很小（奶柱变细），流体模型里抬高后的吸力、细线看的是"有没有奶柱"，
    // 所以把抬高降掉的那部分流量还原回来
    const q = Math.min(1, src.q / config.flowMax / Math.max(config.flowMinFrac, 1 - lift));
    this.fluid.step(dt, { x: src.x / this.n, y: 1 - src.y / this.n, q, lift });
    this.d = null;
  }

  // 画到自己的画布（this.canvas），游戏再把它贴到杯子里
  render() { this.fluid.render(); }

  // 评分前调用：把奶泡读回来（n×n，y 朝下）。
  // white：白色奶泡覆盖度（数纹路用）；d：图案范围 = 白色奶泡 + 冒上来的奶咖色线（比轮廓用）
  readback() {
    const N = this.fluid.N, n = this.n, f = this.fluid.readFoam();
    const d = new Float32Array(n * n), white = new Float32Array(n * n), s = N / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const gx = Math.min(N - 1, Math.floor((x + 0.5) * s)), gy = Math.min(N - 1, Math.floor((n - 1 - y + 0.5) * s));
      const k = (gy * N + gx) * 4, w = smoothstep(0.22, 0.6, f[k]);
      white[y * n + x] = w;
      d[y * n + x] = Math.max(w, smoothstep(0.3, 0.5, f[k + 2]));
    }
    this.d = d;
    this.white = white;
    return d;
  }
}
