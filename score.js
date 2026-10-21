import { config } from './config.js';

// 评分：把奶泡区域和图案模板比"像素重叠率"（交集 / 并集），再看分层够不够。
// 玩家自己选入点，图案的位置和大小每次都不一样，所以先把模板对齐到奶泡的重心、
// 缩放到和奶泡一样的面积，只比形状像不像。
const G = 128; // 评分用的网格，比模拟网格粗一半，够用也快

// 把图案轮廓（局部坐标，+y 朝前方）转到屏幕坐标，归一化到面积 1、重心在原点
const cache = new Map();
function template(pattern) {
  if (cache.has(pattern.id)) return cache.get(pattern.id);
  const rot = config.forwardAngle - Math.PI / 2;
  const c = Math.cos(rot), s = Math.sin(rot);
  const rp = pattern.outline.map(([x, y]) => [x * c - y * s, x * s + y * c]);
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < rp.length; i++) {
    const [x0, y0] = rp[i], [x1, y1] = rp[(i + 1) % rp.length];
    const cr = x0 * y1 - x1 * y0;
    a += cr; cx += (x0 + x1) * cr; cy += (y0 + y1) * cr;
  }
  a /= 2; cx /= 6 * a; cy /= 6 * a;
  const k = 1 / Math.sqrt(Math.abs(a));
  const t = rp.map(([x, y]) => [(x - cx) * k, (y - cy) * k]);
  cache.set(pattern.id, t);
  return t;
}

// 分层：沿着前后中线，从奶泡后缘走到前缘，数跨过了几道层线（相位每跨过一个整数是一层）
function countLayers(sim, cxCell, cyCell) {
  const n = sim.n, fx = Math.cos(config.forwardAngle), fy = Math.sin(config.forwardAngle);
  let prev = null, layers = 0, inFoam = false;
  for (let t = -n; t <= n; t += 0.5) {
    const x = Math.round(cxCell + fx * t), y = Math.round(cyCell + fy * t);
    if (x < 1 || y < 1 || x >= n - 1 || y >= n - 1) continue;
    const i = y * n + x, v = sim.d[i];
    if (v > 0.55) {
      const ph = Math.floor(sim.p[i] / v);
      if (inFoam && prev != null && ph !== prev) layers += Math.min(3, Math.abs(ph - prev));
      prev = ph;
      inFoam = true;
    } else inFoam = false;
  }
  return layers;
}

// GPU 真流体：纹路和片与片的分界都是真的咖啡色细线，直接数线。
// 沿前后方向走，在中线左右各偏一点走（避开收尾拉出的那条中线），数图案里面"白 → 咖啡色 → 白"出现了几次
function countLines(sim, cxCell, cyCell, halfW) {
  const n = sim.n, d = sim.white || sim.d, fx = Math.cos(config.forwardAngle), fy = Math.sin(config.forwardAngle);
  const lx = -fy, ly = fx;
  let best = 0;
  for (const off of [-0.35, -0.2, 0.2, 0.35]) {
    let seenWhite = false, inGap = false, lines = 0;
    for (let t = -n; t <= n; t += 0.5) {
      const x = Math.round(cxCell + fx * t + lx * off * halfW), y = Math.round(cyCell + fy * t + ly * off * halfW);
      if (x < 1 || y < 1 || x >= n - 1 || y >= n - 1) continue;
      const v = d[y * n + x];
      if (v > 0.6) { if (inGap) lines++; seenWhite = true; inGap = false; }
      else if (v < 0.3 && seenWhite) inGap = true;
    }
    best = Math.max(best, lines);
  }
  return best;
}

// 形态学闭运算：先膨胀再腐蚀 r 格，把片与片之间的咖啡色细缝填上，只看整体轮廓（郁金香用）
function closeMask(m, r) {
  const grow = (src, val) => {
    const out = new Uint8Array(G * G);
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      let hit = !val;
      for (let dy = -r; dy <= r && hit !== val; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const xx = x + dx, yy = y + dy;
        const v = xx >= 0 && yy >= 0 && xx < G && yy < G ? src[yy * G + xx] : 0;
        if (!!v === val) { hit = val; break; }
      }
      out[y * G + x] = hit ? 1 : 0;
    }
    return out;
  };
  return grow(grow(m, true), false);
}

// 片数：停一下再推的每一片都有自己的片号，数一数还看得见的有几片（郁金香用）
function countPieces(sim) {
  const hist = new Map();
  for (let i = 0; i < sim.d.length; i++) {
    const v = sim.d[i];
    if (v < 0.55) continue;
    const k = Math.round(sim.k[i] / v);
    hist.set(k, (hist.get(k) || 0) + 1);
  }
  let pieces = 0;
  for (const c of hist.values()) if (c >= config.scorePieceMinCells) pieces++;
  return pieces;
}

function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// sim：FoamSim；pattern：patterns.js 里的图案。返回 { score: 0~100, tier, tip, iou, coverage, layers }
// tip：扣分最多的那一项（pull / back / pieces / layers / notch / small / shape），没有明显问题时为 null
export function scorePour(sim, pattern) {
  if (sim.isFluid && !sim.d) sim.readback();
  // GPU 真流体用自己的模板和分数区间
  if (sim.isFluid && pattern.fluid) pattern = { ...pattern, iouZero: undefined, iouFull: undefined, ...pattern.fluid, id: pattern.id + ':fluid' };
  const TEMPLATE = template(pattern);
  const n = sim.n, step = n / G;
  let mask = new Uint8Array(G * G);
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      const v = sim.d[Math.floor((y + 0.5) * step) * n + Math.floor((x + 0.5) * step)];
      if (v > 0.45) mask[y * G + x] = 1;
    }
  }
  // 真流体里纹路是真的咖啡色线，比轮廓时先把线填上
  const close = sim.isFluid ? Math.max(2, pattern.closeGaps || 0) : pattern.closeGaps;
  if (close) mask = closeMask(mask, close);
  let area = 0, sx = 0, sy = 0;
  for (let i = 0; i < G * G; i++) if (mask[i]) { area++; sx += i % G; sy += (i / G) | 0; }
  // 杯面积（以评分网格计）里奶泡占的比例；太少说明基本没倒出图案
  const cupArea = Math.PI * (G / 2) ** 2;
  const coverage = area / cupArea;
  if (area < 20) return { score: 0, tier: TIERS[0], iou: 0, coverage };

  const cx = sx / area, cy = sy / area;
  const scale = Math.sqrt(area); // 模板面积为 1，缩放后与奶泡同面积
  const layers = sim.isFluid
    ? (pattern.pieces ? sim.pieces : countLines(sim, (cx + 0.5) * step, (cy + 0.5) * step, scale * step * 0.5))
    : pattern.pieces ? countPieces(sim) : countLayers(sim, (cx + 0.5) * step, (cy + 0.5) * step);
  // 模板外接框，框外的格直接跳过多边形判断
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of TEMPLATE) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  // 整体重叠率 + 心尖那一段（前方 1/3）+ 两瓣和凹口那一段（后方 1/3）的重叠率。
  // 没收尾的一团圆整体也挺像心，区别在有没有拉出尖；乱晃出来的平底一团，区别在有没有凹口
  const fx = Math.cos(config.forwardAngle), fy = Math.sin(config.forwardAngle);
  let tipStart = Infinity, tipEnd = -Infinity;
  for (const [x, y] of TEMPLATE) { const a = x * fx + y * fy; tipStart = Math.min(tipStart, a); tipEnd = Math.max(tipEnd, a); }
  const span = tipEnd - tipStart;
  const backEnd = tipStart + span / 3;
  tipStart = tipEnd - span / 3;
  let inter = 0, tArea = 0, fInter = 0, fT = 0, fM = 0, bInter = 0, bT = 0, bM = 0;
  // 凹口：两瓣中间、模板外面的那一小块。好的心那里是咖啡色，被奶泡填满说明没有凹口
  const lx = -fy, ly = fx;
  let halfW = 0;
  for (const [x, y] of TEMPLATE) halfW = Math.max(halfW, Math.abs(x * lx + y * ly));
  let notchCells = 0, notchFilled = 0;
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      const ux = (x - cx) / scale, uy = (y - cy) / scale;
      const m = mask[y * G + x];
      const t = ux >= x0 && ux <= x1 && uy >= y0 && uy <= y1 && inside(TEMPLATE, ux, uy);
      if (t) { tArea++; if (m) inter++; }
      const along = ux * fx + uy * fy;
      if (along > tipStart) { if (t) fT++; if (m) fM++; if (t && m) fInter++; }
      if (along < backEnd) {
        if (t) bT++; if (m) bM++; if (t && m) bInter++;
        if (!t && along > tipStart - span && Math.abs(ux * lx + uy * ly) < halfW * config.scoreNotchWidth &&
            ux >= x0 && ux <= x1 && uy >= y0 && uy <= y1) {
          notchCells++;
          if (m) notchFilled++;
        }
      }
    }
  }
  const whole = inter / (area + tArea - inter);
  const front = fInter / Math.max(1, fT + fM - fInter);
  const back = bInter / Math.max(1, bT + bM - bInter);
  const iou = (1 - config.scoreTipWeight - config.scoreBackWeight) * whole +
    config.scoreTipWeight * front + config.scoreBackWeight * back;

  // 重叠率换成分数：没收尾的一团圆约 0.75（60 分左右），拉得好的心约 0.8 以上
  // 先封顶到 100 再扣分，否则超出 100 的部分会把扣分抵掉
  // 模板是照着示范倒法量的图案（心形），重叠率普遍更高，可以单独设分数区间
  const iouZero = pattern.iouZero ?? config.scoreIouZero, iouFull = pattern.iouFull ?? config.scoreIouFull;
  let score = Math.min(100, ((iou - iouZero) / (iouFull - iouZero)) * 100);
  // 凹口被填满要扣分（大白心的凹口本来就窄，填到一半以内不算）；树叶没有凹口，不查
  const notchFill = notchCells ? notchFilled / notchCells : 0;
  // 每一项扣分的比例都记下来，最后挑扣得最多的那一项给玩家提示
  const factors = {};
  if (pattern.notch) factors.notch = 1 - config.scoreNotchPenalty * Math.max(0, (notchFill - config.scoreNotchFree) / (1 - config.scoreNotchFree));
  // 分层不够要扣分：郁金香要叠够层数，树叶要摇出够多的纹路
  const need = pattern.pieces || pattern.layers;
  if (need) factors[pattern.pieces ? 'pieces' : 'layers'] = 0.35 + 0.65 * Math.min(1, layers / need);
  // 树叶要边摆边往后退拉出叶脉：退得不够按比例扣分
  if (pattern.needBack) factors.back = 0.35 + 0.65 * Math.min(1, (sim.backTravel || 0) / (pattern.needBack * sim.n / 2));
  // 一口气倒完的图案（心形）：停下来再推了好几次要扣分
  if (pattern.maxPieces && sim.pieces > pattern.maxPieces) factors.onePour = 0.5;
  // 要求收尾的图案（郁金香、树叶）：没有抬高往前拉线，分数减半
  if (pattern.needPull && !sim.pulled) factors.pull = 0.5;
  // 图案太小（没倒出多少奶泡）要扣分
  if (coverage < config.scoreMinCoverage) factors.small = coverage / config.scoreMinCoverage;
  for (const f of Object.values(factors)) score *= f;
  // 心形不扣"没收尾"的分（形状分里已经体现），但没拉线时这是最该提醒的
  // 没收尾时凹口、心尖都出不来，提示收尾比提示凹口有用
  if (!sim.pulled && !factors.pull) factors.pull = Math.min(0.6, ...Object.values(factors).map(f => f - 0.01));
  let tip = null, worst = 0.9;
  for (const [k, f] of Object.entries(factors)) if (f < worst) { worst = f; tip = k; }
  if (!tip && score < 70) tip = 'shape';
  score = Math.round(Math.max(0, Math.min(100, score)));
  const tier = score >= config.scoreGood ? TIERS[2] : score >= config.scoreOk ? TIERS[1] : TIERS[0];
  return { score, tier, tip, iou: +iou.toFixed(3), coverage: +coverage.toFixed(3), notchFill: +notchFill.toFixed(2), layers };
}

// 评价档位（文案在 i18n.js）
const TIERS = ['try', 'ok', 'good'];
