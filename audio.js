// 声音：全部用 Web Audio 实时合成，不用音频文件（没有版权问题，网页也不会变大）。
//   倒奶声：两层噪声。闷的"汩汩"声跟流量走；高处倒的"哗哗"溅落声跟高度走
//   溢出：一声泼溅 + 几声滴答
//   结果：破纪录叮一声，分数很低"哇哦"一声
// iOS 要求在点击回调里创建/恢复 AudioContext，所以 init() 要在按钮点击时调用。

const MUTE_KEY = 'latte-pour.muted';
let ctx = null, master = null, noiseBuf = null;
let body = null, hiss = null; // 倒奶声两层 { gain, filter }
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* 读不到就默认开声音 */ }

function makeNoise() {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // 粉红一点的噪声（低频多一些），听起来更像水声
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.997 * b0 + w * 0.029591;
    b1 = 0.985 * b1 + w * 0.032534;
    b2 = 0.95 * b2 + w * 0.048056;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.5;
  }
  return buf;
}

function loopLayer(type, freq, q) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(filter).connect(gain).connect(master);
  src.start();
  return { gain, filter };
}

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  // iOS：让声音不受静音拨片影响（支持的浏览器才有）
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* 忽略 */ }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  master.connect(ctx.destination);
  noiseBuf = makeNoise();
  body = loopLayer('lowpass', 700, 0.8);
  hiss = loopLayer('bandpass', 3200, 0.7);
  // 汩汩声：给闷的那层加一点不规则起伏
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 7;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain).connect(body.filter.frequency);
  lfo.start();
}

export function isMuted() { return muted; }

export function setMuted(m) {
  muted = m;
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* 忽略 */ }
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05);
}

// 每帧调用。flow 0~1：流量；height 0~1：拉花缸离液面的高度
export function updatePour(flow, height) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const f = Math.max(0, Math.min(1, flow));
  body.gain.gain.setTargetAtTime(f * (0.55 - 0.25 * height), t, 0.06);
  body.filter.frequency.setTargetAtTime(450 + 500 * f, t, 0.1);
  hiss.gain.gain.setTargetAtTime(f * (0.04 + 0.22 * height), t, 0.06);
  hiss.filter.frequency.setTargetAtTime(2400 + 1800 * height, t, 0.1);
}

function envGain(t0, peak, attack, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  g.connect(master);
  return g;
}

export function splash() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(4000, t);
  lp.frequency.exponentialRampToValueAtTime(350, t + 0.7);
  src.connect(lp).connect(envGain(t, 0.9, 0.015, 0.9));
  src.start(t);
  src.stop(t + 1.1);
  // 几声滴答
  for (let i = 0; i < 4; i++) {
    const t0 = t + 0.35 + i * (0.14 + Math.random() * 0.12);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(900 + Math.random() * 300, t0);
    o.frequency.exponentialRampToValueAtTime(260, t0 + 0.08);
    o.connect(envGain(t0, 0.18, 0.004, 0.12));
    o.start(t0);
    o.stop(t0 + 0.2);
  }
}

// 结果音效：破纪录叮一声；分数很低"哇哦"一声；其他只轻轻一声
export function resultSound(score, newBest) {
  if (!ctx) return;
  const t = ctx.currentTime + 0.05;
  const tone = (freq, t0, dur, peak, type = 'sine', slideTo = null) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    o.connect(envGain(t0, peak, 0.01, dur));
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  };
  if (newBest) {
    tone(1318.5, t, 0.5, 0.18);
    tone(1975.5, t + 0.09, 0.7, 0.14);
  } else if (score < 25) {
    tone(392, t, 0.28, 0.16, 'triangle', 330);
    tone(330, t + 0.3, 0.6, 0.16, 'triangle', 196);
  } else {
    tone(880, t, 0.25, 0.1);
  }
}
