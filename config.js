// 所有可调参数集中在这里。调手感只改这个文件。
// 单位说明：长度用"格"，杯子直径 = gridSize 格。
export const config = {
  // —— 传感器（第1步）——
  // 平滑窗口（毫秒），对传感器读数做指数平滑
  smoothingMs: 35,
  // 等多久没收到任何传感器事件就判定为"无陀螺仪"（毫秒）
  sensorTimeoutMs: 1500,

  // —— 画面 ——
  gridSize: 256,          // 模拟网格边长，越大越细腻越耗性能
  maxDpr: 2,              // 画布像素比上限
  cameraAngle: 26,        // 镜头偏离正上方的角度（度），视频大约是这个角度
  cupTiltMax: 22,         // 刚开始倒时杯子朝拉花缸倾斜的角度（度），回杯后变 0
  cupDepth: 1.6,          // 杯子高度（杯口半径的倍数），决定露出来的杯身有多高
  cupRadiusFrac: 0.34,    // 杯口半径占屏幕宽度的比例（杯碟和把手要放得下）
  pitcherSize: 0.72,      // 拉花缸缸身半径占杯口半径的比例（350ml 拉花缸约 7.5cm，杯口约 10cm）
  pitcherMilkSec: 7,      // 满流量倒多少秒把缸里的奶倒完（只影响画面）

  // —— 倒奶 ——
  pourTimeLimit: 10,      // 秒（保底上限；通常先被杯子容量限制）
  cupCapacity: 6.5,       // 杯子容量：满流量倒这么多秒就会溢出
  flowMax: 4200,          // 最大流量：每秒新增奶泡面积（格²）
  flowMinFrac: 0.02,      // 快速划动时流量降到最大值的这个比例
  flowRampMs: 120,        // 刚开始倒时流量从 0 升到满的时间
  pullSpeed: 260,         // 往前（心尖方向）移动达到这个速度（格/秒）时流量降到最低，即"穿心"
  velTauMs: 50,           // 倒奶点瞬时速度的平滑时间，决定拖曳/晃动的跟手程度
  driftTauMs: 40,         // 往前移动速度的平滑时间，越短穿心时流量降得越快

  // —— 陀螺仪（第3步）——
  tiltStart: 4,           // 满缸时前倾超过这个角度（度）奶开始自己流出来
  tiltStartEmptyAdd: 14,  // 奶倒完时出奶角再多这么多度（奶越少要倾得越多）
  tiltRange: 14,          // 过了出奶角再倾这么多度，流量最大
  flowCurve: 1.3,         // 倾角→流量的曲线，1 = 正比，越大轻倾时流量越小
  stopHoldMs: 1000,       // 收回到不出奶并保持这么久，算倒完（没穿心）
  baseFollowTauMs: 300,   // 没在倒时往后仰，基准姿势跟上去的速度
  rollGain: 2.2,          // 左右倾 1 度，奶柱横移多少格（手腕转 10° 缸嘴约移 1cm ≈ 杯径 11%）
  rollCenterTauMs: 1500,  // 没在倒时，左右倾的中心跟随手的速度
  rollCenterPourTauMs: 10000, // 倒的时候中心几乎不跟随：手一歪、一抖，入点就跟着偏（考验手稳不稳）
  lateralMax: 60,         // 奶柱最大横移（格）
  pourStartBack: 0.45,    // 起倒位置：从杯心往后（远离心尖）多少个半径
  pushAccel: 9,           // 加速度峰值超过这个（m/s²）算"向前一推"
  pushIgnoreMs: 800,      // 刚开始倒的这段时间不检测推，避免前倾时的抖动误判
  tiltPullSpeed: 300,     // 收尾时细奶柱自动往前划的速度（格/秒）
  pullEnd: 0.75,          // 划到杯心往前多少个半径处结束

  // —— 千层纹 ——
  wiggleMinSpeed: 40,     // 横向晃动速度超过这个（格/秒）才算一次有效晃动
  wiggleHysteresis: 1.5,  // 离中线超过这个距离（格）才算换边，防止抖动误判
  wiggleCenterTauMs: 300, // 晃动中线的平滑时间
  wiggleFullSpeed: 80,    // 横向速度达到这个（格/秒）算"晃得很厉害"
  wiggleTauMs: 250,       // 晃动强度的平滑时间
  wiggleAheadCut: 1.0,    // 晃得厉害时，奶泡浮出点往落点收的比例（千层从奶柱处一层层冒出来）
  wiggleFrontBias: 0.3,   // 晃得厉害时，额外往前推的力
  wiggleBackPull: 0,      // 晃得厉害时，额外往后收的力
  wiggleCone: 0,          // 晃得厉害时奶泡集中往前方扇形里推的程度（0 = 四面铺开；视频里是以落点为圆心一圈圈长）
  wiggleJetBoost: -0.5,   // 晃得厉害时奶柱往前冲的力变化（-0.5 = 减半）：冲力小，一圈圈的圆心才留在落点上
  wallWidth: 16,          // 杯壁影响范围（格）：奶泡离液面边缘这么近时开始被挡住，改沿杯壁往两侧流
  tiltSurface: 0.72,      // 杯子斜着时液面半径占杯口半径的比例
  levelStretch: 0.2,      // 回杯时奶泡跟着液面撑开的程度（1 = 和液面一起等比例放大）
  levelAt: 0.8,           // 倒到杯子容量的这个比例时杯子完全放平
  wallSpread: 2.2,        // 被挡住后沿杯壁往两侧流的比例
  pieceGap: 1.8,          // 推推乐片与片之间咖啡色缝的半宽（格）
  pushPause: 0.15,        // 停流超过这么久（秒）再出奶，算新的一层（郁金香"推一层、停、再推一层"）
  crossingsPerLine: 2,    // 晃过中线几次出一条线；2 = 左右来回一次一条
  lineFrac: 0.28,         // 千层纹咖啡色带占每层间距的比例
  lineFadeLo: 0.5,        // 层间距挤到每格跨过这么多层时开始渐隐（落点处线最密）
  lineFadeHi: 1.2,        // ……到这么多层时完全不画
  lineMaxHalfWidth: 1.6,  // 千层纹线的最大半宽（格），被拉开的地方也保持细线
  lineStrength: 0.85,     // 千层纹颜色深浅，1 = 完全是浅咖啡色

  // —— 计数 ——
  // GoatCounter 站点代码（注册后 https://<代码>.goatcounter.com 里的 <代码>），留空则不统计
  goatcounterCode: 'lattepour',

  // —— 评分（第4步）——
  scoreIouZero: 0.62,     // 和心形模板的重叠率低于这个记 0 分
  scoreIouFull: 0.88,     // 重叠率达到这个记 100 分
  scoreTipWeight: 0.3,    // 心尖那一段的重叠率在总分里的权重
  scoreBackWeight: 0.3,   // 两瓣和凹口那一段的重叠率在总分里的权重
  scoreNotchPenalty: 0.8, // 凹口被奶泡填满时最多扣掉的比例（平底一团没有心形凹口）
  scoreNotchWidth: 0.12,  // 检查凹口的区域宽度（占心宽一半的比例）
  scoreNotchFree: 0.45,   // 凹口区域被填到这个比例以内不扣分
  scoreMinCoverage: 0.08, // 奶泡占杯面不到这个比例要按比例扣分
  scoreOk: 40,            // 达到这个分数算"有点像了"档（统计用，显示的台词在 verdicts.js）
  scoreGood: 70,          // 达到这个分数算"漂亮"档

  // —— 融合（压低出白之前）——
  fusionSec: 0.8,         // 先倒多久不出白（秒，按流量折算）；0 = 一倒就出白
  fusionLighten: 0.35,    // 融合结束时油脂变浅的程度

  // —— 奶泡 ——
  forwardAngle: -Math.PI / 2, // "前方"方向（屏幕坐标，-π/2 = 朝上）。拉花缸在屏幕下方（靠近自己），图案往上长，心尖朝上
  forwardBias: 0.1,       // 落点前方的额外推力，越大奶泡越往前长、越窄
  backPull: 0,         // 落点后方的回收力，>1 时后方奶泡往回收，落点贴着奶泡后缘（穿心才拉得出凹口）
  surfaceAhead: 4,        // 白色浮出的位置在落点前方多少格（起始）
  surfaceAheadFrac: 0.8,  // 奶泡长大后，浮出点再往前移"奶泡半径 × 这个比例"
  surfaceAheadFlowExp: 0, // 浮出距离随流量变化的程度，0 = 和流量无关
  jetSpeed: 140,          // 奶柱往前冲的速度（格/秒），把咖啡卷进奶泡后缘形成凹口
  jetRadius: 6,           // 奶柱冲力影响范围（格）
  streamRadius: 3,        // 奶柱落点注入白色的半径（格）
  dragStrength: 1.0,      // 奶柱拖着周围奶泡跟着走的强度，1 = 跟奶柱同速
  dragRadius: 11,         // 拖曳影响范围（格）
  liftDragNarrow: 0.7,    // 抬高收尾时奶柱正下方的拖曳范围缩到原来的这个比例
  liftSink: 0,          // 抬高后奶柱"吸口"往里吸的速度（格/秒）
  liftSinkRadius: 9,      // 吸口影响范围（格）
  liftAbsorb: 0,         // 紧贴吸口的奶泡沉下去的速度（每秒）
  liftAbsorbRadius: 3,    // 沉下去的范围（格）
  liftWake: 300,          // 尾流往回带的速度（格/秒）
  liftWakeWidth: 6,       // 尾流宽度（格）
  liftWakeGap: 25,        // 奶柱身后多远才开始倒流（格）
  liftWakeLength: 70,     // 尾流在奶柱身后延续多远（格）
  liftDragBehind: 0.15,   // 奶柱身后还被往前拖的范围（越小 = 一过奶柱就不拖了）
  liftDragCut: 0,       // 抬高后奶柱往前拖奶泡的力减掉多少（1 = 完全不拖）
  liftDragTail: 0.1,     // 抬高收尾时外圈被整体带动的强度（相对奶柱速度）
  liftDragTailRadius: 35, // 外圈带动的范围（格）
  liftSqueeze: 0.4,       // 抬高收尾时把两侧奶泡往中线压的强度
  liftSqueezeRadius: 16,  // 往中线压的影响范围（格）
  liftLineRadius: 0.6,    // 抬高后奶柱留下的细线半径（格）
  liftJet: 0.5,           // 抬高后奶柱冲力（相对满流量时）
  liftRaiseMs: 400,       // 收尾时先原地抬高多久（流量慢慢收小，两瓣变鼓、凹口变深），再往前推
  liftJetWiden: 1.0,      // 抬高后奶柱冲击范围变宽的比例
  maxStepCells: 4,        // 每帧最大位移，防止数值炸开
  foamAgeRate: 0.15,      // 旧奶泡变成奶油色的速度，新旧交界会显出纹路
  foamFloor: 0.62,        // 旧奶泡最低浓度
  edgeLo: 0.30,           // 浓度在 edgeLo~edgeHi 之间过渡成白色
  edgeHi: 0.50,
  edgeSharpen: 4,         // 边缘锐化速度，0 = 不锐化（边缘会越来越糊）
  haloLo: 0.04,           // 奶泡外缘一圈浅金棕色晕边（奶泡变薄透出油脂）
  haloStrength: 0.55,
  foamRelief: 0.35,       // 奶泡立体感（迎光亮、背光暗）的强度
  foamGrain: 0.03,        // 微泡纹理的明暗幅度
};
