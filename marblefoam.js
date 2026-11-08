// 游戏用的几何（大理石纹）奶泡：包一层 marble.js，对游戏和评分提供和 fluidfoam.js 一样的接口。
// 位置用格坐标（0~n，y 朝下，拉花缸在下方）。参数在 patterns.js 的 marble 里。
import { config } from './config.js';
import { Marble } from './marble.js';

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class MarbleFoam {
  constructor(n, size = 1024) {
    this.n = n;
    this.isFluid = true; // 和 GPU 流体一样：自己有画布、评分用 readback
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');
    this.small = document.createElement('canvas'); // 评分读回用的小图
    this.small.width = this.small.height = n;
    this.params = {};
    this.reset();
  }

  usePattern(pattern) { this.params = pattern?.marble || {}; }

  reset() {
    this.m = new Marble(this.params);
    this.vol = 0;
    this.pulled = false;
    this.backTravel = 0;
    this.backStart = null;
    this.pieces = 0;
    this.d = null;
  }

  // 液面（杯子斜着时液面贴着拉花缸那侧的杯壁），和 fluidfoam.js 一样
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
    if (src.q > config.flowMax * 0.2 && lift < 0.5 && !src.fusion) this.pieces = Math.max(this.pieces, (src.piece ?? 0) + 1);
    // pour.js 抬高时把流量降得很小，这里还原成"有没有奶柱"（同 fluidfoam.js）
    const q = Math.min(1, src.q / config.flowMax / Math.max(config.flowMinFrac, 1 - lift));
    // marble.js 的坐标：杯口直径 = 1，原点在杯心，+y 朝前方（屏幕上方）
    this.m.step({ x: src.x / this.n - 0.5, y: 0.5 - src.y / this.n, pour: q > 0.02, flow: q, lift, foam: !src.fusion }, dt);
    this.d = null;
  }

  render() { this.m.render(this.ctx, this.canvas.width, { bare: true, transparent: true }); }

  // 评分前调用：画一张 n×n 的小图，按颜色分出白色奶泡（n×n，y 朝下）
  readback() {
    const n = this.n, g = this.small.getContext('2d', { willReadFrequently: true });
    this.m.render(g, n, { bare: true, transparent: true });
    const px = g.getImageData(0, 0, n, n).data, d = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const r = px[4 * i], b = px[4 * i + 2], a = px[4 * i + 3];
      // 奶泡接近白、咖啡明显偏橙：按"暖度"和亮度分
      d[i] = a < 128 ? 0 : smoothstep(70, 40, r - b) * smoothstep(170, 210, r);
    }
    this.d = d;
    this.white = d;
    return d;
  }
}
