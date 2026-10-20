// 界面文案。默认英文；浏览器语言是中文时显示中文；?lang=en / ?lang=zh 可以强制切换。
const STRINGS = {
  en: {
    title: 'Latte Pour',
    tagline: 'Master latte art in 8 seconds a day.',
    fineprint: 'Results not guaranteed. Milk not included.',
    start: 'Start pouring',
    connecting: 'Connecting motion sensor…',
    hintTilt: 'Drag anywhere to move the pitcher and pick your entry point · Tip the top edge of the phone forward to pour — tip more, pour more · Once it turns white, rock side to side for layers · Give the phone a quick push forward to finish',
    hintTouch: 'Hold to pour, drag to move the pitcher · Wait for it to turn white, then wiggle side to side for layers · Swipe up quickly to finish',
    fallbackDenied: 'Motion access was denied, so finger controls are on. ',
    fallbackUnsupported: "This device has no motion sensor, so finger controls are on. ",
    flip: 'Pouring the wrong way? Tap here',
    flipped: 'Direction flipped · tap to undo',
    again: 'Pour again',
    save: 'Save image',
    saveHint: 'Long-press the image to save it',
    download: 'Download image',
    close: 'Close',
    points: 'pts',
    modeTilt: 'Motion controls',
    modeTouch: 'Finger controls',
    footer: 'Third-party code: none · Stats: GoatCounter (no cookies)',
    build: 'build',
    best: 'Best:',
    newBest: 'New best!',
    challenge: 'Can you beat {n}?',
    patterns: 'Try another pattern',
    comingSoon: 'Coming soon',
  },
  zh: {
    title: 'Latte Pour',
    tagline: '每天 8 秒，成为拉花大师。',
    fineprint: '效果因人而异，牛奶自备。',
    start: '开始倒奶',
    connecting: '正在连接陀螺仪…',
    hintTilt: '手指按住拖动拉花缸选入点，倒的时候也能拖着往后退 · 屏幕上沿往前压出奶，压得越多流量越大 · 出白后左右匀速摇晃出千层纹 · 向前一推收尾',
    hintTouch: '按住屏幕倒奶，拖动手指移动拉花缸 · 先融合一下，出白后左右匀速晃出千层纹 · 最后快速向上一划拉出心尖',
    fallbackDenied: '没有获得陀螺仪权限，已改用手指模式。',
    fallbackUnsupported: '这台设备读不到陀螺仪，已改用手指模式。',
    flip: '倒奶方向反了？点这里',
    flipped: '方向已反转 · 点这里改回',
    again: '再来一次',
    save: '保存图片',
    saveHint: '长按图片保存到相册',
    download: '下载图片',
    close: '关闭',
    points: '分',
    modeTilt: '陀螺仪模式',
    modeTouch: '手指模式',
    footer: '第三方库：无 · 统计：GoatCounter（不用 cookie）',
    build: '版本',
    best: '最高分',
    newBest: '新纪录！',
    challenge: '你能超过 {n} 分吗？',
    patterns: '换个图案',
    comingSoon: '即将推出',
  },
};

const forced = new URLSearchParams(location.search).get('lang');
export const lang = forced === 'zh' || forced === 'en' ? forced
  : (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';

export const t = key => STRINGS[lang][key] ?? STRINGS.en[key] ?? key;

// 把页面里带 data-i18n="key" 的元素填上对应文案
export function applyStatic() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
}
