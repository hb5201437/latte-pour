// 所有可调参数集中在这里。调手感只改这个文件。
// 单位说明：长度用"格"，杯子直径 = gridSize 格。
export const config = {
  // —— 传感器（第1步）——
  // 平滑窗口（毫秒），对传感器读数做指数平滑
  smoothingMs: 100,
  // 等多久没收到任何传感器事件就判定为"无陀螺仪"（毫秒）
  sensorTimeoutMs: 1500,

  // —— 画面 ——
  gridSize: 256,          // 模拟网格边长，越大越细腻越耗性能
  maxDpr: 2,              // 画布像素比上限
  cupRadiusFrac: 0.40,    // 杯口半径占屏幕短边的比例

  // —— 倒奶 ——
  pourTimeLimit: 8,       // 秒
  flowMax: 5000,          // 最大流量：每秒新增奶泡面积（格²）
  flowMinFrac: 0.02,      // 快速划动时流量降到最大值的这个比例
  flowRampMs: 250,        // 刚开始倒时流量从 0 升到满的时间
  pullSpeed: 260,         // 往前（心尖方向）移动达到这个速度（格/秒）时流量降到最低，即"穿心"
  velTauMs: 50,           // 倒奶点瞬时速度的平滑时间，决定拖曳/晃动的跟手程度
  driftTauMs: 40,         // 往前移动速度的平滑时间，越短穿心时流量降得越快

  // —— 陀螺仪（第3步）——
  tiltStart: 10,          // 前倾超过这个角度（度）开始出奶
  tiltFull: 35,           // 前倾到这个角度流量最大
  tiltFlowMin: 0.35,      // 刚过起倒角时的流量比例
  stopHoldMs: 400,        // 收回到起倒角以下保持这么久，算倒完（没穿心）
  baseFollowTauMs: 1500,  // 没在倒时，基准姿势跟随手的速度
  rollGain: 1.0,          // 左右倾 1 度，奶柱横移多少格
  rollCenterTauMs: 1500,  // 左右倾的中心跟随速度，越大越能刻意把奶柱停在一边
  lateralMax: 40,         // 奶柱最大横移（格）
  pourStartBack: 0.35,    // 起倒位置：从杯心往后（远离心尖）多少个半径
  pushAccel: 9,           // 加速度峰值超过这个（m/s²）算"向前一推"
  pushIgnoreMs: 800,      // 刚开始倒的这段时间不检测推，避免前倾时的抖动误判
  tiltPullSpeed: 520,     // 穿心时奶柱自动往前划的速度（格/秒）
  pullEnd: 0.85,          // 划到杯心往前多少个半径处结束

  // —— 千层纹 ——
  wiggleMinSpeed: 40,     // 横向晃动速度超过这个（格/秒）才算一次有效晃动
  wiggleHysteresis: 1.5,  // 离中线超过这个距离（格）才算换边，防止抖动误判
  wiggleCenterTauMs: 300, // 晃动中线的平滑时间
  crossingsPerLine: 2,    // 晃过中线几次出一条线；2 = 左右来回一次一条
  lineWidth: 2.5,         // 千层纹线宽（格）
  lineStrength: 0.85,     // 千层纹颜色深浅，1 = 完全是浅咖啡色

  // —— 奶泡 ——
  forwardAngle: Math.PI / 2,  // "前方"方向（屏幕坐标，π/2 = 朝下），拉花缸在反方向；心尖朝这个方向
  forwardBias: 1.15,      // 落点前方的额外推力，越大奶泡越往前长、越窄
  backPull: 1.15,         // 落点后方的回收力，>1 时后方奶泡往回收，落点贴着奶泡后缘（穿心才拉得出凹口）
  streamRadius: 3,        // 奶柱落点注入白色的半径（格）
  dragStrength: 1.0,      // 奶柱拖着周围奶泡跟着走的强度，1 = 跟奶柱同速
  dragRadius: 11,         // 拖曳影响范围（格）
  maxStepCells: 4,        // 每帧最大位移，防止数值炸开
  foamAgeRate: 0.15,      // 旧奶泡变成奶油色的速度，新旧交界会显出纹路
  foamFloor: 0.62,        // 旧奶泡最低浓度
  edgeLo: 0.30,           // 浓度在 edgeLo~edgeHi 之间过渡成白色
  edgeHi: 0.50,
  edgeSharpen: 4,         // 边缘锐化速度，0 = 不锐化（边缘会越来越糊）
  haloLo: 0.08,           // 奶泡边缘外一圈深色，让轮廓更清楚
  haloStrength: 0.3,
};
