// 生成分享用的成品图：木桌 + 杯碟 + 拉花 + 分数和吐槽，底部挑战语，右下角署名和网址。
// foam：游戏里最后一帧渲染好的奶泡画布（正方形）
import { t } from './i18n.js';
import { drawTable, drawCup, drawLiquidGloss } from './scene.js';

const SERIF = '"New York", ui-serif, Georgia, "Songti SC", serif';
const SANS = '-apple-system, "PingFang SC", "Helvetica Neue", sans-serif';

export function makeSnapshot(foam, { score, verdict }) {
  const S = 1080;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');

  drawTable(g, S, S, 11);
  const cx = S / 2, cy = S / 2 + 30, R = S * 0.27;
  drawCup(g, cx, cy, R);
  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.clip();
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(foam, cx - R, cy - R, 2 * R, 2 * R);
  g.restore();
  drawLiquidGloss(g, cx, cy, R);

  g.textAlign = 'center';
  g.fillStyle = '#f6efe6';
  g.font = `700 92px ${SANS}`;
  g.fillText(`${score}`, cx, 120);
  g.font = `italic 36px ${SERIF}`;
  g.fillStyle = 'rgba(246,239,230,0.88)';
  g.fillText(`“${verdict}”`, cx, 172, S - 100);

  g.font = `600 38px ${SANS}`;
  g.fillStyle = '#f2c46d';
  g.fillText(t('challenge').replace('{n}', score), cx, S - 78);

  g.textAlign = 'right';
  g.font = `24px ${SANS}`;
  g.fillStyle = 'rgba(246,239,230,0.55)';
  g.fillText('latte pour · ' + location.host + location.pathname.replace(/\/$/, ''), S - 28, S - 26);

  return cv.toDataURL('image/png');
}
