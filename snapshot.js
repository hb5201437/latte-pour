// 生成分享用的成品图：木桌 + 粗陶杯（和游戏里同一个斜视角）+ 拉花 + 分数和吐槽，底部挑战语，右下角署名和网址。
// foam：游戏里最后一帧渲染好的奶泡画布（正方形）
import { t } from './i18n.js';
import { config } from './config.js';
import { drawTable, drawLiquidGloss, drawStoneBody, drawStoneRim } from './scene.js';

const SERIF = '"New York", ui-serif, Georgia, "Songti SC", serif';
const SANS = '-apple-system, "PingFang SC", "Helvetica Neue", sans-serif';

export function makeSnapshot(foam, { score, verdict, patternName }) {
  const S = 1080;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');

  drawTable(g, S, S, 11);
  // 杯子放平、镜头斜看：杯口和液面压扁成椭圆，下面露出一截杯身
  const cam = config.cameraAngle * Math.PI / 180;
  const sq = Math.cos(cam);
  const cx = S / 2, R = S * 0.245, cy = 250 + R * 1.1 * sq;
  const bodyH = config.cupDepth * R * Math.sin(cam);
  drawStoneBody(g, cx, cy, R, sq, bodyH);
  g.save();
  g.beginPath();
  g.ellipse(cx, cy, R, R * sq, 0, 0, Math.PI * 2);
  g.clip();
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(foam, cx - R, cy - R * sq, 2 * R, 2 * R * sq);
  // 液面高光是按正圆画的，压扁画到一张小画布再贴上
  const gl = document.createElement('canvas');
  gl.width = gl.height = Math.ceil(2 * R);
  drawLiquidGloss(gl.getContext('2d'), R, R, R);
  g.drawImage(gl, cx - R, cy - R * sq, 2 * R, 2 * R * sq);
  g.restore();
  const rim = document.createElement('canvas');
  rim.width = rim.height = Math.ceil(2.3 * R);
  drawStoneRim(rim.getContext('2d'), 1.15 * R, 1.15 * R, R);
  g.drawImage(rim, cx - 1.15 * R, cy - 1.15 * R * sq, 2.3 * R, 2.3 * R * sq);

  g.textAlign = 'center';
  if (patternName) {
    g.font = `600 26px ${SANS}`;
    g.fillStyle = 'rgba(246,239,230,0.6)';
    g.fillText(patternName.toUpperCase().split('').join('\u200a'), cx, 58);
  }
  g.fillStyle = '#f6efe6';
  g.font = `700 92px ${SANS}`;
  g.fillText(`${score}`, cx, 140);
  g.font = `italic 36px ${SERIF}`;
  g.fillStyle = 'rgba(246,239,230,0.88)';
  g.fillText(`“${verdict}”`, cx, 192, S - 100);

  g.font = `600 38px ${SANS}`;
  g.fillStyle = '#f2c46d';
  g.fillText(t('challenge').replace('{n}', score), cx, S - 78);

  g.textAlign = 'right';
  g.font = `24px ${SANS}`;
  g.fillStyle = 'rgba(246,239,230,0.55)';
  g.fillText('latte pour · ' + location.host + location.pathname.replace(/\/$/, ''), S - 28, S - 26);

  return cv.toDataURL('image/png');
}
