// 生成分享用的成品图：杯子 + 奶泡 + 分数，右下角小字署名和网址。
// foam：游戏里最后一帧渲染好的奶泡画布（正方形）
import { t } from './i18n.js';

export function makeSnapshot(foam, { score, verdict }) {
  const S = 1080;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');

  g.fillStyle = '#3b2418';
  g.fillRect(0, 0, S, S);

  const cx = S / 2, cy = S / 2 + 20, R = S * 0.31;
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
  g.font = '600 72px -apple-system, "PingFang SC", sans-serif';
  g.fillText(`${score}`, cx, 104);
  g.font = 'italic 34px -apple-system, "PingFang SC", sans-serif';
  g.fillStyle = 'rgba(246,239,230,0.85)';
  g.fillText(`“${verdict}”`, cx, 154, S - 80);

  // 底部挑战语
  g.font = '600 36px -apple-system, "PingFang SC", sans-serif';
  g.fillStyle = '#f6efe6';
  g.fillText(t('challenge').replace('{n}', score), cx, S - 70);

  g.textAlign = 'right';
  g.font = '24px -apple-system, "PingFang SC", sans-serif';
  g.fillStyle = 'rgba(246,239,230,0.6)';
  g.fillText('latte pour · ' + location.host + location.pathname.replace(/\/$/, ''), S - 28, S - 28);

  return cv.toDataURL('image/png');
}

