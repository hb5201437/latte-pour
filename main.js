import { reading, requestSensors } from './sensors.js';
import { createGame } from './game.js';
import { setTiltFlip } from './tilt.js';
import { makeSnapshot } from './snapshot.js';
import { count } from './analytics.js';
import { t, applyStatic, lang } from './i18n.js';
import { verdict } from './verdicts.js';
import { initAudio, isMuted, setMuted, resultSound } from './audio.js';

// 每次部署改一下，页面底部会显示，用来确认手机上跑的是不是最新版
const BUILD = '1021-r25';

const $ = id => document.getElementById(id);
applyStatic();
$('build').textContent = t('build') + ' ' + BUILD;
const show = id => { for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id; };

const params = new URLSearchParams(location.search);
// ?debug=sensors 打开第1步的传感器读数页
const debugSensors = params.get('debug') === 'sensors';
// ?debug=1 在游戏画面上显示陀螺仪读数
const debugHud = params.get('debug') === '1';
// ?mode=touch 强制手指模式（手机上对比用）
const forceTouch = params.get('mode') === 'touch';

const HINTS = { tilt: t('hintTilt'), touch: t('hintTouch') };
const FALLBACK_NOTE = { denied: t('fallbackDenied'), unsupported: t('fallbackUnsupported') };
// 本机最高分
const BEST_KEY = 'latte-pour.best';
let best = 0;
try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch { /* 读不到就从 0 开始 */ }

let game = null;
let lastResult = null;
let poursThisVisit = 0; // 这次打开页面倒了几杯，用来看有没有人反复玩

count('/', 'Latte Pour');

// 倒奶方向手动翻转，记在本机
const FLIP_KEY = 'latte-pour.flipTilt';
let flipped = false;
try { flipped = localStorage.getItem(FLIP_KEY) === '1'; } catch { /* 隐私模式读不到就用默认 */ }
setTiltFlip(flipped);
const flipLabel = () => { $('flipBtn').textContent = t(flipped ? 'flipped' : 'flip'); };
flipLabel();
$('flipBtn').addEventListener('click', () => {
  flipped = !flipped;
  setTiltFlip(flipped);
  try { localStorage.setItem(FLIP_KEY, flipped ? '1' : '0'); } catch { /* 忽略 */ }
  flipLabel();
});

$('startBtn').addEventListener('click', async () => {
  if (debugSensors) return startSensorReadout();
  if (game) return;
  initAudio(); // iOS 要求在点击里启动声音

  $('startBtn').disabled = true;
  $('startNote').textContent = t('connecting');
  // requestSensors 必须在点击回调里第一个调用，iOS 才会弹权限框
  const result = forceTouch ? 'forced' : await requestSensors();
  const mode = result === 'granted' ? 'tilt' : 'touch';

  show('play');
  $('hint').textContent = (FALLBACK_NOTE[result] || '') + HINTS[mode];
  $('hint').hidden = false;
  $('result').hidden = true;
  game = createGame($('cup'), {
    mode,
    debug: debugHud,
    onStart: () => { $('hint').hidden = true; $('flipBtn').hidden = true; count('pour-start', 'Pour started', true); },
    onEnd: r => {
      const v = verdict(r.score, r.overflow);
      const newBest = !r.overflow && r.score > best;
      if (newBest) {
        best = r.score;
        try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* 忽略 */ }
      }
      lastResult = { ...r, verdict: v.text, best };
      $('scoreNum').textContent = r.score;
      $('scoreTier').textContent = v.text;
      $('bestLine').textContent = newBest ? t('newBest') : t('best') + ' ' + best;
      $('bestLine').classList.toggle('new', newBest);
      $('result').hidden = false;
      if (!r.overflow) resultSound(r.score, newBest);
      if (r.overflow) count('overflow', 'Overflowed the cup', true);
      if (newBest) count('new-best', 'New personal best', true);
      count('pour-done', 'Finished a pour', true);
      // GoatCounter 按访客去重，同一路径一次访问只算一次；所以用"第几杯"分开记，
      // pour-3 的人数 = 这次打开至少倒了 3 杯的人数
      poursThisVisit++;
      const nth = poursThisVisit >= 5 ? '5+' : String(poursThisVisit);
      count('pour-' + nth, `Pour #${nth} this visit`, true);
      count('score-' + v.key, 'Verdict tier: ' + v.key, true);
    },
  });
  count('mode-' + mode, mode === 'tilt' ? 'Motion controls' : 'Finger controls', true);
  count('lang-' + lang, 'Language: ' + lang, true);
  $('flipBtn').hidden = mode !== 'tilt';
});

$('saveBtn').addEventListener('click', () => {
  if (!game || !lastResult) return;
  const url = makeSnapshot(game.foamCanvas, lastResult);
  $('saveImg').src = url;
  $('saveLink').href = url;
  $('savePanel').hidden = false;
  count('save-image', 'Saved image', true);
});

$('saveClose').addEventListener('click', () => { $('savePanel').hidden = true; });

// 静音按钮
const muteLabel = () => {
  $('muteBtn').setAttribute('aria-label', isMuted() ? 'Unmute' : 'Mute');
  $('muteBtn').classList.toggle('off', isMuted());
};
muteLabel();
$('muteBtn').addEventListener('click', () => { initAudio(); setMuted(!isMuted()); muteLabel(); });

$('againBtn').addEventListener('click', () => {
  initAudio();
  $('savePanel').hidden = true;
  game.reset();
  $('result').hidden = true;
  $('hint').hidden = false;
  $('flipBtn').hidden = !game.isTilt;
});

// —— 第1步：传感器读数页 ——

const MODE_TEXT = {
  granted: '陀螺仪已连接，倾斜手机看看数字变化',
  denied: '没有获得传感器权限',
  unsupported: '这台设备读不到陀螺仪',
};

async function startSensorReadout() {
  $('startBtn').disabled = true;
  $('startNote').textContent = '正在连接传感器…';
  const result = await requestSensors();
  show('sensor');
  $('mode').textContent = MODE_TEXT[result];
  requestAnimationFrame(renderReadout);
}

const fmt = v => (v == null ? '–' : v.toFixed(1));

function renderReadout() {
  for (const key of ['alpha', 'beta', 'gamma', 'ax', 'ay', 'az']) {
    $(key).textContent = fmt(reading[key]);
  }
  $('count').textContent = reading.events;
  requestAnimationFrame(renderReadout);
}
