import { reading, requestSensors } from './sensors.js';
import { createGame } from './game.js';

// 每次部署改一下，页面底部会显示，用来确认手机上跑的是不是最新版
const BUILD = '1020-r12';

const $ = id => document.getElementById(id);
$('build').textContent = '版本 ' + BUILD;
const show = id => { for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id; };

const params = new URLSearchParams(location.search);
// ?debug=sensors 打开第1步的传感器读数页
const debugSensors = params.get('debug') === 'sensors';
// ?debug=1 在游戏画面上显示陀螺仪读数
const debugHud = params.get('debug') === '1';
// ?mode=touch 强制手指模式（手机上对比用）
const forceTouch = params.get('mode') === 'touch';

const HINTS = {
  tilt: '手指按住拖动拉花缸选入点，倒的时候也能拖着往后退 · 屏幕上沿往前压出奶，压得越多流量越大 · 出白后左右匀速摇晃出千层纹 · 向前一推收尾',
  touch: '按住屏幕倒奶，拖动手指移动拉花缸 · 先融合一下，出白后左右匀速晃出千层纹 · 最后快速向上一划拉出心尖',
};

const FALLBACK_NOTE = {
  denied: '没有获得陀螺仪权限，已改用手指模式。',
  unsupported: '这台设备读不到陀螺仪，已改用手指模式。',
};

let game = null;

$('startBtn').addEventListener('click', async () => {
  if (debugSensors) return startSensorReadout();
  if (game) return;

  $('startBtn').disabled = true;
  $('startNote').textContent = '正在连接陀螺仪…';
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
    onStart: () => { $('hint').hidden = true; },
    onEnd: () => { $('result').hidden = false; },
  });
});

$('againBtn').addEventListener('click', () => {
  game.reset();
  $('result').hidden = true;
  $('hint').hidden = false;
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
