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
  pullSpeed: 260,         // 持续单向移动达到这个速度（格/秒）时流量降到最低，即"穿心"
  velTauMs: 50,           // 倒奶点瞬时速度的平滑时间，决定拖曳/晃动的跟手程度
  driftTauMs: 40,         // 倒奶点"净移动"速度的平滑时间；左右晃动会互相抵消，单向划动不会

  // —— 奶泡 ——
  forwardAngle: Math.PI / 2,  // "前方"方向（屏幕坐标，π/2 = 朝下），拉花缸在反方向；心尖朝这个方向
  forwardBias: 1.15,      // 0 = 以落点为圆心均匀扩散；>1 时落点后方会往回收，落点贴着奶泡后缘
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
