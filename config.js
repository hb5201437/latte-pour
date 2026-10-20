// 所有可调参数集中在这里。后续步骤的手感阈值也加在这个文件。
export const config = {
  // 平滑窗口（毫秒），对传感器读数做指数平滑
  smoothingMs: 100,
  // 等多久没收到任何传感器事件就判定为"无陀螺仪"（毫秒）
  sensorTimeoutMs: 1500,
};
