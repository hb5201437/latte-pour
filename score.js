import { config } from './config.js';

// 评分：把奶泡区域和一个心形模板比"像素重叠率"（交集 / 并集）。
// 玩家自己选入点，心的位置和大小每次都不一样，所以先把模板对齐到奶泡的重心、
// 缩放到和奶泡一样的面积，只比形状像不像。
const G = 128; // 评分用的网格，比模拟网格粗一半，够用也快

// 心形模板：经典心形曲线，心尖朝"前方"（config.forwardAngle），单位大小、重心在原点
const TEMPLATE = (() => {
  const pts = [];
  for (let i = 0; i < 240; i++) {
    const t = (i / 240) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    // 数学坐标里两瓣在上、心尖在下；拉花的心比扑克牌的心圆一点，两瓣压浅一些
    const y = 13 * Math.cos(t) - 4 * Math.cos(2 * t) - 1.6 * Math.cos(3 * t) - 0.8 * Math.cos(4 * t);
    pts.push([x, -y]); // 屏幕坐标 y 朝下：心尖朝下
  }
  // 转到"心尖朝前方"：屏幕上心尖默认朝下（π/2），旋转到 forwardAngle
  const rot = config.forwardAngle - Math.PI / 2;
  const c = Math.cos(rot), s = Math.sin(rot);
  const rp = pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
  // 面积和重心（多边形公式），归一化到面积 1
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < rp.length; i++) {
    const [x0, y0] = rp[i], [x1, y1] = rp[(i + 1) % rp.length];
    const cr = x0 * y1 - x1 * y0;
    a += cr; cx += (x0 + x1) * cr; cy += (y0 + y1) * cr;
  }
  a /= 2; cx /= 6 * a; cy /= 6 * a;
  const k = 1 / Math.sqrt(Math.abs(a));
  return rp.map(([x, y]) => [(x - cx) * k, (y - cy) * k]);
})();

function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// sim：FoamSim。返回 { score: 0~100, tier: 文案, iou, coverage }
export function scorePour(sim) {
  const n = sim.n, step = n / G;
  const mask = new Uint8Array(G * G);
  let area = 0, sx = 0, sy = 0;
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      const v = sim.d[Math.floor((y + 0.5) * step) * n + Math.floor((x + 0.5) * step)];
      if (v > 0.45) { mask[y * G + x] = 1; area++; sx += x; sy += y; }
    }
  }
  // 杯面积（以评分网格计）里奶泡占的比例；太少说明基本没倒出图案
  const cupArea = Math.PI * (G / 2) ** 2;
  const coverage = area / cupArea;
  if (area < 20) return { score: 0, tier: TIERS[0], iou: 0, coverage };

  const cx = sx / area, cy = sy / area;
  const scale = Math.sqrt(area); // 模板面积为 1，缩放后与奶泡同面积
  // 模板外接框，框外的格直接跳过多边形判断
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of TEMPLATE) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  // 整体重叠率 + 心尖那一段（前方 1/3）的重叠率。
  // 没收尾的一团圆整体也挺像心（奶柱会冲出凹口），区别主要在有没有拉出尖
  const fx = Math.cos(config.forwardAngle), fy = Math.sin(config.forwardAngle);
  let tipStart = Infinity, tipEnd = -Infinity;
  for (const [x, y] of TEMPLATE) { const a = x * fx + y * fy; tipStart = Math.min(tipStart, a); tipEnd = Math.max(tipEnd, a); }
  tipStart = tipEnd - (tipEnd - tipStart) / 3;
  let inter = 0, tArea = 0, fInter = 0, fT = 0, fM = 0;
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      const ux = (x - cx) / scale, uy = (y - cy) / scale;
      const m = mask[y * G + x];
      const t = ux >= x0 && ux <= x1 && uy >= y0 && uy <= y1 && inside(TEMPLATE, ux, uy);
      if (t) { tArea++; if (m) inter++; }
      if (ux * fx + uy * fy > tipStart) { if (t) fT++; if (m) fM++; if (t && m) fInter++; }
    }
  }
  const whole = inter / (area + tArea - inter);
  const front = fInter / Math.max(1, fT + fM - fInter);
  const iou = (1 - config.scoreTipWeight) * whole + config.scoreTipWeight * front;

  // 重叠率换成分数：没收尾的一团圆约 0.75（60 分左右），拉得好的心约 0.8 以上
  let score = ((iou - config.scoreIouZero) / (config.scoreIouFull - config.scoreIouZero)) * 100;
  // 图案太小（没倒出多少奶泡）要扣分
  if (coverage < config.scoreMinCoverage) score *= coverage / config.scoreMinCoverage;
  score = Math.round(Math.max(0, Math.min(100, score)));
  const tier = score >= config.scoreGood ? TIERS[2] : score >= config.scoreOk ? TIERS[1] : TIERS[0];
  return { score, tier, iou: +iou.toFixed(3), coverage: +coverage.toFixed(3) };
}

const TIERS = ['再试试', '有点像了', '漂亮'];
