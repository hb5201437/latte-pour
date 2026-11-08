// 用法：node --experimental-default-type=module dev/try.mjs '{"dragRadius":6}'
// 临时改 config 跑回归测试，不改文件
import { config } from '../config.js';
const ov = JSON.parse(process.argv[2] || '{}');
Object.assign(config, ov);
const { check } = await import('./regress.mjs');
const { fail, rows } = check();
console.log(JSON.stringify(ov));
console.log(rows.join('\n'));
console.log(fail ? `${fail} 项不通过` : '全部通过');
