import { lang } from './i18n.js';

// 毒舌咖啡师的评价：分数越低越好笑。每档几句随机轮换，连玩几杯不会总看到同一句。
const LINES = [
  { min: 0, key: 'v0', en: [
    "That's not latte art. That's a crime scene.",
    'The milk wants a lawyer.',
    'Did you pour with your elbow?',
  ], zh: [
    '这不是拉花，这是案发现场。',
    '牛奶表示要请律师。',
    '你是用胳膊肘倒的吗？',
  ] },
  { min: 20, key: 'v1', en: [
    'Your manager would like a word.',
    'Customers are leaving. Quietly.',
    'Bold of you to call this a heart.',
  ], zh: [
    '店长想找你谈谈。',
    '客人正在悄悄离开。',
    '管这个叫心，你很勇。',
  ] },
  { min: 40, key: 'v2', en: [
    'Technically a heart. Emotionally, no.',
    'Your mom would still post this.',
    'It has the confidence of a heart.',
  ], zh: [
    '技术上是颗心，情感上不是。',
    '你妈还是会转发的。',
    '它有一颗心的自信。',
  ] },
  { min: 60, key: 'v3', en: [
    'A barista somewhere just nodded.',
    "Not bad. Don't let it go to your head.",
    "You're one YouTube tutorial away.",
  ], zh: [
    '远方有位咖啡师点了点头。',
    '还行，别飘。',
    '再看一个教程你就成了。',
  ] },
  { min: 80, key: 'v4', en: [
    'Okay, show-off.',
    'Your regulars are taking photos.',
    "That's going on the café's Instagram.",
  ], zh: [
    '行了，别炫了。',
    '熟客开始拍照了。',
    '这杯要上咖啡店的朋友圈。',
  ] },
  { min: 95, key: 'v5', en: [
    'World Latte Art Champion. Put the phone down.',
    'Retire. You have nothing left to prove.',
  ], zh: [
    '世界拉花冠军，可以放下手机了。',
    '退役吧，你已经没什么要证明的了。',
  ] },
];

const OVERFLOW = {
  key: 'overflow',
  en: ['You flooded the café.', 'That was a cup, not a bathtub.', 'Mop. Now.'],
  zh: ['你把咖啡店淹了。', '这是杯子，不是浴缸。', '去拿拖把。'],
};

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// 返回 { key, text }；key 用于统计（分档），text 是显示的台词
export function verdict(score, overflow = false) {
  const tier = overflow ? OVERFLOW : [...LINES].reverse().find(l => score >= l.min);
  return { key: tier.key, text: pick(tier[lang] || tier.en) };
}
