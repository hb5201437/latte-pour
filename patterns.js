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
    locked: true, // 和视频对比还差得远（片的月牙包不下去、树叶纹路太少太粗），先不开放
    name: { en: 'Tulip', zh: '郁金香' },
    outline: heartOutline(1.2),
    layers: 3,
    notch: true,
    startBack: 0.15,
    demo: [{ t: 0.9, y0: 0.15, y1: 0.15 }, { t: 1.1, y0: 0.15, y1: 0.15 }, pause(0.15, 0.33), { t: 0.8, y0: 0.33, y1: 0.33 },
      pause(0.33, 0.5), { t: 0.6, y0: 0.5, y1: 0.5 }, ...pull(0.5)],
    hint: {
      en: 'Push a blob, pause, move back a little, push the next one into it. Three layers, then pull through.',
      zh: '推一团、停一下、往后退一点，再推下一团顶进去。叠三层，最后往前推收尾。',
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
