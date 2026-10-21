// 图案挑战。每个图案有：名字、操作提示、评分模板（轮廓）、分层要求。
// 轮廓都在"心尖朝前方"的局部坐标里定义：y 轴朝前（心尖方向），x 轴横向；评分时会对齐、缩放。

// 心形：经典心形曲线，拉花的心比扑克牌的心圆一点、两瓣浅一点
// 心形：每一列的后沿（两瓣和凹口）和前沿（圆顶收成尖）。取自大白心和千层心示范倒法的平均（左右对称后量的）
function heartOutline() {
  const cols = [[0, -0.27, 0.62], [0.04, -0.29, 0.59], [0.08, -0.34, 0.53], [0.12, -0.39, 0.51], [0.16, -0.43, 0.49],
    [0.2, -0.47, 0.47], [0.24, -0.49, 0.46], [0.28, -0.5, 0.43], [0.32, -0.5, 0.41], [0.36, -0.49, 0.38],
    [0.4, -0.48, 0.35], [0.44, -0.46, 0.3], [0.48, -0.43, 0.25], [0.52, -0.38, 0.2], [0.56, -0.34, 0.13], [0.6, -0.29, 0.04]];
  const right = cols.slice(1);
  const left = right.slice().reverse().map(([x, b, f]) => [-x, b, f]);
  const all = [...left, cols[0], ...right];
  // 前沿从左到右，侧边收口，后沿从右到左
  return [...all.map(([x, , f]) => [x, f]), [0.63, -0.13], ...all.slice().reverse().map(([x, b]) => [x, b]), [-0.63, -0.13]];
}

// 树叶（rosetta）：圆圆的扇形底纹，往拉花缸那头收窄。半宽剖面取自对照视频调好的示范倒法（闭合缝隙后量的）
function leafOutline() {
  const prof = [[-0.53, 0.18], [-0.49, 0.29], [-0.45, 0.36], [-0.41, 0.41], [-0.36, 0.46], [-0.32, 0.48], [-0.28, 0.5],
    [-0.24, 0.52], [-0.2, 0.53], [-0.16, 0.54], [-0.12, 0.54], [-0.07, 0.54], [-0.03, 0.54], [0.01, 0.54], [0.05, 0.53],
    [0.09, 0.53], [0.13, 0.52], [0.17, 0.5], [0.22, 0.48], [0.26, 0.46], [0.3, 0.43], [0.34, 0.39], [0.38, 0.36],
    [0.42, 0.32], [0.46, 0.29], [0.5, 0.27], [0.55, 0.24], [0.59, 0.21]];
  const right = prof.map(([y, w]) => [w, -y]);
  const left = prof.slice().reverse().map(([y, w]) => [-w, -y]);
  return [[0, 0.55], ...right, [0, -0.63], ...left];
}

// 郁金香：圆顶、两侧笔直往下（外圈月牙的两端）。半宽剖面取自对照视频调好的示范倒法（闭合缝隙后量的）
function tulipOutline() {
  const prof = [[-0.54, 0.2], [-0.48, 0.34], [-0.41, 0.4], [-0.34, 0.43], [-0.27, 0.47], [-0.2, 0.49], [-0.14, 0.5],
    [-0.07, 0.52], [0, 0.52], [0.07, 0.52], [0.14, 0.52], [0.2, 0.52], [0.27, 0.5], [0.34, 0.49], [0.41, 0.47],
    [0.48, 0.43], [0.54, 0.4], [0.61, 0.37], [0.68, 0.3]];
  // 剖面里 y 朝屏幕下方（往拉花缸那边），局部坐标里 +y 是前方，所以取反
  const right = prof.map(([y, w]) => [w, -y]);
  const left = prof.slice().reverse().map(([y, w]) => [-w, -y]);
  return [[0, 0.56], ...right, [0, -0.7], ...left];
}

// GPU 真流体的轮廓（不同的物理模型长出来的形状不一样，模板分开量）。
// 用 dev/shot/profile.mjs 按示范倒法量出来：心形是每列的 [横向, 后沿, 前沿]，郁金香、树叶是每行的 [前后, 半宽]
function colsOutline(cols, side) {
  const right = cols.slice(1);
  const left = right.slice().reverse().map(([x, b, f]) => [-x, b, f]);
  const all = [...left, cols[0], ...right];
  return [...all.map(([x, , f]) => [x, f]), side, ...all.slice().reverse().map(([x, b]) => [x, b]), [-side[0], side[1]]];
}
function rowsOutline(prof) {
  const right = prof.map(([y, w]) => [w, -y]);
  const left = prof.slice().reverse().map(([y, w]) => [-w, -y]);
  return [[0, -prof[0][0] + 0.02], ...right, [0, -prof[prof.length - 1][0] - 0.02], ...left];
}
const FLUID = {
  heart: colsOutline([[0, -0.48, 0.6], [0.04, -0.5, 0.57], [0.08, -0.51, 0.54], [0.12, -0.51, 0.52], [0.16, -0.51, 0.52], [0.2, -0.51, 0.51], [0.24, -0.51, 0.49], [0.28, -0.5, 0.47], [0.32, -0.48, 0.45], [0.36, -0.46, 0.41], [0.4, -0.42, 0.38], [0.44, -0.38, 0.34], [0.48, -0.32, 0.29], [0.52, -0.24, 0.21], [0.56, -0.14, 0.12]], [0.59,  -0.01]),
  tulip: rowsOutline([[-0.53, 0.08], [-0.48, 0.25], [-0.44, 0.33], [-0.39, 0.4], [-0.34, 0.44], [-0.29, 0.49], [-0.24, 0.52], [-0.2, 0.55], [-0.15, 0.56], [-0.1, 0.58], [-0.05, 0.59], [-0.01, 0.59], [0.04, 0.59], [0.09, 0.58], [0.14, 0.57], [0.18, 0.55], [0.23, 0.52], [0.28, 0.49], [0.33, 0.45], [0.37, 0.41], [0.42, 0.35], [0.47, 0.27], [0.52, 0.16]]),
  rosetta: rowsOutline([[-0.56, 0.18], [-0.52, 0.27], [-0.47, 0.32], [-0.43, 0.36], [-0.39, 0.4], [-0.35, 0.43], [-0.31, 0.45], [-0.26, 0.48], [-0.22, 0.5], [-0.18, 0.52], [-0.14, 0.53], [-0.1, 0.55], [-0.05, 0.55], [-0.01, 0.55], [0.03, 0.55], [0.07, 0.54], [0.11, 0.53], [0.16, 0.51], [0.2, 0.5], [0.24, 0.46], [0.28, 0.42], [0.32, 0.35], [0.37, 0.29], [0.41, 0.27], [0.45, 0.27], [0.49, 0.25], [0.53, 0.23], [0.58, 0.2], [0.62, 0.15], [0.66, 0.09]]),
};

// 示范倒法（生成卡片上的示范图用）。每段：t 秒，y0→y1 位置（杯心为 0，往后为正，单位半径），
// flow 流量，lift 抬高，wig/hz 左右摆幅和频率
// 收尾：先原地抬高 0.15 秒，再 0.3 秒快速往前拉线（和游戏里陀螺仪收尾一致）
const pull = from => [{ t: 0.15, y0: from, y1: from, lift: 1 }, { t: 0.3, y0: from, y1: from - 1.2, lift: 1 }];
const pause = (a, b) => ({ t: 0.3, y0: a, y1: b, flow: 0 });

export const PATTERNS = [
  {
    id: 'heart',
    name: { en: 'Heart', zh: '心形' },
    outline: heartOutline(),
    // 真流体里没收尾的一团圆和心形轮廓很像（凹口本来就浅），所以必须收尾
    fluid: { outline: FLUID.heart, iouZero: 0.82, iouFull: 1.0, notch: false, needPull: true,
      demo: [{ t: 0.9, y0: 0.4, y1: 0.4 }, { t: 3.0, y0: 0.4, y1: 0.4, wig: 0.05, hz: 3.5 }, ...pull(0.4)] },
    maxPieces: 2, // 心形一口气倒完；停下来再推好几次就成了郁金香
    iouZero: 0.7,
    iouFull: 0.95,
    layers: 0, // 不要求分层（千层心也算）
    notch: true,
    startBack: 0.45,
    demo: [{ t: 0.9, y0: 0.4, y1: 0.4 }, { t: 4.2, y0: 0.4, y1: 0.4, wig: 0.05, hz: 3.5 }, ...pull(0.4)],
    hint: {
      en: 'Pour in one spot until a white disc forms (wiggle for layers if you like), then push forward to pull through.',
      zh: '在一个点上倒，等白色圆盘长出来（想要千层就左右摇），最后往前推一下收尾。',
    },
  },
  {
    id: 'tulip',
    name: { en: 'Tulip', zh: '郁金香' },
    outline: tulipOutline(),
    fluid: { outline: FLUID.tulip, iouZero: 0.82, iouFull: 1.0,
      demo: [{ t: 0.9, y0: 0.3, y1: 0.3 }, { t: 1.7, y0: 0.3, y1: 0.0 }, pause(0.0, 0.15), { t: 0.65, y0: 0.15, y1: 0.08 },
        pause(0.08, 0.24), { t: 0.35, y0: 0.24, y1: 0.21 }, pause(0.21, 0.36), { t: 0.2, y0: 0.36, y1: 0.35 }, ...pull(0.35)] },
    pieces: 4, // 至少推出 4 片（外圈 + 3 片）
    needPull: true,
    closeGaps: 3, // 评分时把片与片之间的缝填上，只比整体轮廓
    notch: false,
    startBack: 0.3,
    // 对照视频：第一团推大、推到对面杯壁；之后每团倒进前一团里面，把它撑成月牙，一团比一团小
    demo: [{ t: 0.9, y0: 0.3, y1: 0.3 }, { t: 2.6, y0: 0.3, y1: -0.05 }, pause(-0.05, 0.13), { t: 1.0, y0: 0.13, y1: 0.05 },
      pause(0.05, 0.23), { t: 0.55, y0: 0.23, y1: 0.19 }, pause(0.19, 0.37), { t: 0.3, y0: 0.37, y1: 0.35 }, ...pull(0.35)],
    hint: {
      en: 'Push a big blob, pause, then push a smaller one into the middle of it so it wraps around. Repeat 3–4 times, each smaller, then pull through.',
      zh: '先推一大团，停一下，再把小一点的一团推进它中间，把它撑成月牙。重复 3–4 次、一次比一次小，最后往前推收尾。',
    },
  },
  {
    id: 'rosetta',
    name: { en: 'Rosetta', zh: '树叶' },
    outline: leafOutline(),
    fluid: { outline: FLUID.rosetta, iouZero: 0.8, iouFull: 1.0,
      demo: [{ t: 0.9, y0: 0.05, y1: 0.05 }, { t: 2.4, y0: 0.05, y1: 0.05, wig: 0.14, hz: 4 },
        { t: 1.2, y0: 0.05, y1: 0.6, wig: 0.14, hz: 4 }, { t: 0.3, y0: 0.6, y1: 0.6 }, ...pull(0.6)] },
    layers: 6,
    needPull: true,
    needBack: 0.4, // 出奶时至少往后退 0.4 个杯口半径（叶脉）
    iouZero: 0.72, // 模板照示范倒法量的，重叠率普遍高；示范倒法约 88 分，留出手比脚本更稳的余地
    iouFull: 0.98,
    notch: false,
    startBack: 0.05,
    // 对照视频：原地摆动出半圆底纹 → 保持流量、边摆边匀速往后退（叶脉）→ 到杯口压低做一颗小心 → 垂直收尾
    demo: [{ t: 0.9, y0: 0.05, y1: 0.05 }, { t: 3.6, y0: 0.05, y1: 0.05, wig: 0.14, hz: 4 },
      { t: 1.6, y0: 0.05, y1: 0.65, wig: 0.14, hz: 4 }, { t: 0.35, y0: 0.65, y1: 0.65 }, ...pull(0.65)],
    hint: {
      en: 'Wiggle in place until a half-circle of ripples forms, keep wiggling while drawing the pitcher straight back, drop a small heart at the end, then pull through.',
      zh: '原地左右摆，摆出半圆底纹；保持流量，边摆边把奶缸匀速往后退；到杯口压低做一颗小心，最后往前拉线收尾。',
    },
  },
  {
    id: 'swan',
    name: { en: 'Swan', zh: '天鹅' },
    locked: true,
    hint: { en: 'Coming soon.', zh: '即将推出。' },
  },
];

export const patternById = id => PATTERNS.find(p => p.id === id && !p.locked) || PATTERNS[0];
