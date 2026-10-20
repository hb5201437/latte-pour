import { reading, requestSensors } from './sensors.js';

const $ = id => document.getElementById(id);

const MODE_TEXT = {
  granted: '陀螺仪已连接，倾斜手机看看数字变化',
  denied: '没有获得传感器权限，之后会改用手指拖动模式',
  unsupported: '这台设备读不到陀螺仪，之后会改用手指拖动模式',
};

if (!window.isSecureContext) {
  $('startNote').textContent = '当前不是 HTTPS 页面，iPhone 上读不到陀螺仪';
}

$('startBtn').addEventListener('click', async () => {
  $('startBtn').disabled = true;
  $('startNote').textContent = '正在连接传感器…';
  const result = await requestSensors();
  $('start').hidden = true;
  $('sensor').hidden = false;
  $('mode').textContent = MODE_TEXT[result];
  requestAnimationFrame(render);
});

const fmt = v => (v == null ? '–' : v.toFixed(1));

function render() {
  for (const key of ['alpha', 'beta', 'gamma', 'ax', 'ay', 'az']) {
    $(key).textContent = fmt(reading[key]);
  }
  $('count').textContent = reading.events;
  requestAnimationFrame(render);
}
