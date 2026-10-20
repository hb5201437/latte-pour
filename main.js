import { reading, requestSensors } from './sensors.js';
import { createGame } from './game.js';

const $ = id => document.getElementById(id);
const show = id => { for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id; };

// ?debug=sensors 打开第1步的传感器读数页，调第3步手感时用
const debugSensors = new URLSearchParams(location.search).get('debug') === 'sensors';

let game = null;

$('startBtn').addEventListener('click', async () => {
  if (debugSensors) return startSensorReadout();
  show('play');
  $('hint').hidden = false;
  $('result').hidden = true;
  if (!game) {
    game = createGame($('cup'), {
      onEnd: () => { $('result').hidden = false; },
    });
    $('cup').addEventListener('pointerdown', () => { $('hint').hidden = true; });
  }
});

$('againBtn').addEventListener('click', () => {
  game.reset();
  $('result').hidden = true;
  $('hint').hidden = false;
});

// —— 第1步：传感器读数 ——

const MODE_TEXT = {
  granted: '陀螺仪已连接，倾斜手机看看数字变化',
  denied: '没有获得传感器权限，之后会改用手指拖动模式',
  unsupported: '这台设备读不到陀螺仪，之后会改用手指拖动模式',
};

if (debugSensors && !window.isSecureContext) {
  $('startNote').textContent = '当前不是 HTTPS 页面，iPhone 上读不到陀螺仪';
}

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
