// 生成分享用的成品图：杯子 + 奶泡 + 分数，右下角小字署名和网址。
// foam：游戏里最后一帧渲染好的奶泡画布（正方形）
export function makeSnapshot(foam, { score, tier }) {
  const S = 1080;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');

  g.fillStyle = '#3b2418';
  g.fillRect(0, 0, S, S);

  const cx = S / 2, cy = S / 2 + 60, R = S * 0.33;
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.45)';
  g.shadowBlur = R * 0.12;
  g.shadowOffsetY = R * 0.04;
  g.beginPath();
  g.arc(cx, cy, R * 1.12, 0, Math.PI * 2);
  g.fillStyle = '#efe8df';
  g.fill();
  g.restore();

  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.clip();
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(foam, cx - R, cy - R, 2 * R, 2 * R);
  g.restore();

  g.fillStyle = '#f6efe6';
  g.textAlign = 'center';
  g.font = '600 64px -apple-system, "PingFang SC", sans-serif';
  g.fillText(`${score}`, cx, 108);
  g.font = '32px -apple-system, "PingFang SC", sans-serif';
  g.fillStyle = 'rgba(246,239,230,0.75)';
  g.fillText(tier, cx, 156);

  g.textAlign = 'right';
  g.font = '24px -apple-system, "PingFang SC", sans-serif';
  g.fillStyle = 'rgba(246,239,230,0.6)';
  g.fillText('latte pour · ' + location.host + location.pathname.replace(/\/$/, ''), S - 28, S - 28);

  return cv.toDataURL('image/png');
}
