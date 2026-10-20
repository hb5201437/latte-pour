// 图案挑战。每个图案有：名字、操作提示、评分模板（轮廓）、分层要求。
// 轮廓都在"心尖朝前方"的局部坐标里定义：y 轴朝前（心尖方向），x 轴横向；评分时会对齐、缩放。

// 心形：经典心形曲线，拉花的心比扑克牌的心圆一点、两瓣浅一点
function heartOutline(stretch = 1) {
  const pts = [];
  for (let i = 0; i < 240; i++) {
    const t = (i / 240) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 4 * Math.cos(2 * t) - 1.6 * Math.cos(3 * t) - 0.8 * Math.cos(4 * t);
    // 数学坐标里心尖在下；翻过来让心尖朝"前"（+y），再按需要拉长
    pts.push([x, -y * stretch]);
  }
  return pts;
}

// 树叶（rosetta）：比心长的椭圆叶子，往前稍微收窄（参数按模拟倒出来的树叶对过）
function leafOutline() {
  const pts = [];
  const N = 120, L = 1.45, taper = 0.15;
  const hw = s => 0.5 * Math.sqrt(Math.max(0, 1 - (2 * s - 1) ** 2)) * (1 - taper * s);
  for (let i = 0; i <= N; i++) { const s = i / N; pts.push([hw(s), (s - 0.5) * L]); }
  for (let i = N; i >= 0; i--) { const s = i / N; pts.push([-hw(s), (s - 0.5) * L]); }
  return pts;
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

// 示范倒法（生成卡片上的示范图用）。每段：t 秒，y0→y1 位置（杯心为 0，往后为正，单位半径），
// flow 流量，lift 抬高，wig/hz 左右摆幅和频率
const pull = from => [{ t: 0.4, y0: from, y1: from, lift: 1 }, { t: 0.45, y0: from, y1: -0.8, lift: 1 }];
const pause = (a, b) => ({ t: 0.3, y0: a, y1: b, flow: 0 });

export const PATTERNS = [
  {
    id: 'heart',
    name: { en: 'Heart', zh: '心形' },
    outline: heartOutline(1),
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
    locked: true, // 和视频对比还差得远（片的月牙包不下去、树叶纹路太少太粗），先不开放
    name: { en: 'Rosetta', zh: '树叶' },
    outline: leafOutline(),
    layers: 6,
    notch: false,
    startBack: -0.2,
    demo: [{ t: 0.9, y0: -0.2, y1: -0.2 }, { t: 3.2, y0: -0.2, y1: 0.55, wig: 0.06, hz: 4 }, ...pull(0.55)],
    hint: {
      en: 'Wiggle side to side while slowly drawing the pitcher back, then pull a thin line forward through the middle.',
      zh: '一边左右摇，一边把拉花缸慢慢往后退，最后往前拉一条细线穿过中间。',
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
