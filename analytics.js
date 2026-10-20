import { config } from './config.js';

// 极简计数：直接请求 GoatCounter 的计数接口。
// 不引入它的脚本（许可证不是 MIT/BSD/Apache），不用 cookie，不记录任何个人信息。
// config.goatcounterCode 为空、或在本机开发时，什么都不发。
export function count(path, title, event = false) {
  const code = config.goatcounterCode;
  if (!code || location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
  const q = new URLSearchParams({
    p: path,
    t: title,
    e: event ? 'true' : 'false',
    s: `${screen.width},${screen.height},${window.devicePixelRatio || 1}`,
    rnd: Math.random().toString(36).slice(2),
  });
  if (!event && document.referrer) q.set('r', document.referrer);
  new Image().src = `https://${code}.goatcounter.com/count?${q}`;
}
