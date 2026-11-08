# Latte Pour

手机网页上的拉花练习游戏：手机当拉花缸，倾斜出奶、左右摇、往前推收尾，杯子里实时长出拉花。

- 线上：https://hb5201437.github.io/latte-pour/ （GitHub Pages，推到 main 约 1 分钟后生效）
- 流体原型页（可直接用手指倒）：https://hb5201437.github.io/latte-pour/proto/fluid.html
- 仓库是**公开的**：用户的参考视频帧（dev/ref/）和截图输出永远不提交。

## 产品方向（用户确认过的）

- 收费的拉花练习应用，面向海外，**界面英文**（中文浏览器显示中文）。网页版是免费引流，ARKit 原生版（../latte-pour-ar）是收费产品候选。
- 拉花方向：拉花缸在屏幕下方，图案**从下往上**长，**心尖朝上**。不要再改。
- 最优先的是"像真的拉花"。原任务书（latte_pour_build_brief.md，不提交）里"只用 2D canvas、不用 WebGL"等限制已经放开：可以用任何免费或便宜的手段。
- 玩梗风格：毒舌评价、高分难拿、溢出失败、分享图带挑战。
- 不要阅读、复制或参考 github.com/Yode0419/LatteArt 的代码。

## 架构

纯 ES module，没有构建步骤，没有第三方库。

| 文件 | 作用 |
|---|---|
| main.js | 页面流程：开始页、图案选择、结果页、统计（GoatCounter）。`BUILD` 版本号每次部署改一下 |
| game.js | 游戏循环：输入（陀螺仪/手指）、拉花缸、杯子、画面分三层（底层 2D、中层 WebGL 液面、顶层 2D） |
| pour.js | 把输入变成奶柱参数：流量、抬高（收尾）、摇动相位、第几片 |
| **guide.js** | **引导式模拟**：按步骤（融合/原地倒/原地摇/往后退/小心/收尾）对齐玩家动作，送进物理的 = 标准动作 + 偏差 × assist；量每一步的偏差给评分。标准动作 = patterns.js 里 `fluid.demo` 带 `step` 标签的段。郁金香还没加标签，不引导 |
| tilt.js / sensors.js | 陀螺仪：放平校准、倾角→流量、左右倾→横移 |
| **fluid.js** | **GPU 真流体（WebGL2）**：液面速度场 + 奶泡层。参数都在 `P` 里，有中文注释 |
| fluidfoam.js | 游戏用的奶泡接口：包一层 fluid.js，接口和旧模型一样；不支持 WebGL2 时退回 sim.js |
| sim.js | 旧的 CPU 奶泡模型（手写规则），现在只做后备 |
| score.js | 评分：和模板比轮廓重合度 + 数纹路/片数 + 是否收尾/后退；有引导的图案总分 70% 看每一步偏差（`scoreStepWeight`）；返回扣分最多的提示 |
| patterns.js | 图案：名字、提示、模板轮廓、示范倒法。`fluid: {...}` 里是 GPU 引擎专用的模板、分数区间、示范倒法 |
| scene.js / pitcher.js | 杯子、桌子、拉花缸的绘制 |
| snapshot.js | 分享图 |
| audio.js / verdicts.js / i18n.js | 声音、毒舌评价、中英文案 |

### GPU 流体的物理（fluid.js）

坐标：杯口直径 = 1，纹理 v 朝上 = 屏幕上方 = 前方。场：`vel`（表面速度，N×N）、`foam`（R 奶泡厚度 h、G 油脂染色、B 混进咖啡的牛奶 m、A 油脂纹理；M×M，M = 2N）。

- 奶柱在落点前方浮上来 = 液面的"源"；带往前冲的射流。
- 浮上来的是白还是褐：看左右摇的速度占这一轮峰值的比例。摆到两端出白，摆过中线出褐。往后退时出褐更短。这就是千层纹/树叶纹的来源。
- **折叠模型（`fold: 1`，目前只有树叶用，见 patterns.js 的 `fluid.fp`）**：上一条是旧规则。对照参考视频逐帧看到的机制是：奶柱落在"后面是咖啡、前面是奶泡"的交界上，落点往下吸（`plunge`），把后面的咖啡表面带进来；奶泡一直是白的，在落点前一点浮上来；缸嘴只摆杯径的 1~4%（`wigGain` 把玩家的摆动缩小），奶泡带被甩成 S 形、一层层折起来，咖啡色线是折缝里夹的咖啡。和大理石纹（marbling）的机制一样。往后退时摆动主要是手腕转动：缸嘴几乎不动、奶柱方向左右甩（`jetSwing`），奶泡被交替甩到两边形成 S 形叶脉，收尾细细一刀切开就是交错的叶子；收尾不能带动太宽（树叶 `liftDrag` 8、`liftDragR` 0.01），否则纹路被拽成尖峰。心形、郁金香还没改过来。
- 浮出点横向跟着奶柱走的快慢：原地摇时慢（扇形完整弧），往后退时快（交错的叶子）。
- 奶从奶泡底下钻过去把整片图案撑开（spread）。
- 抬高收尾：奶柱沿整段路径往下吸（汇），两边奶泡合拢不留缝；窄而强的拖动拉出心尖。快速往前扫等同抬高。
- 杯壁不可穿过；净面积在杯壁附近下沉。
- 目标图案引导（只对 `fluid.target` 的图案，现在是树叶）：奶泡被轻轻推向一个跟着奶柱走的"倒蛋"形（面积 = 现有奶泡面积），强度 = guide.js 的 liveScore()²，倒得准才强。参数 `ctl*`。
- 图案可以用 `fluid.fp` 覆盖流体参数（FluidFoam.usePattern 在每杯开始时切换）。对比脚本临时改参数用 regress.html 的 `window.FPover`（加在图案参数之上），别直接改 `window.FP`。

游戏里可以用网址参数调试：`?engine=old`（旧引擎）、`?q=384`（水流网格）、`?m=`（奶泡网格）、`?fp={"参数":值}`（临时覆盖 fluid.js 的 P）、`?mode=touch`、`?debug=1`、`?lang=en`、`?assist=0.3`（辅助强度）、`?level=easy|normal|pro`（按难度取辅助强度，见 config.assistLevels）。`?debug=1` 或带 `?assist` 时画面顶部有按钮切换辅助强度（记在本机）。

## 开发和测试

本地服务器（no-store，避免缓存旧脚本）：

```bash
python3 dev/serve.py . 5180
```

**GPU 引擎只能在浏览器里测**。dev/shot/ 里的脚本用本机 Google Chrome 的无头模式（真 GPU），第一次用先 `cd dev/shot && npm install`：

| 命令 | 用途 |
|---|---|
| `NODE_PATH=dev/shot/node_modules node dev/shot/regress.mjs` | GPU 回归测试：每个图案的示范 + 典型错误倒法，检查分数区间；再跑引导用例（dev/regress.mjs 的 GUIDED，也查提示对不对）；拼一张结果图到 dev/shot/regress.png |
| `node --experimental-default-type=module dev/regress.mjs` | 旧引擎回归测试（用例定义也在这个文件里，两套共用） |
| `node dev/shot/sweep.mjs 0,1,10 '[{参数},{参数}]'` | 同几个用例，不同参数各跑一遍，拼图对比 |
| `node dev/shot/seq.mjs rosetta '[1.5,2.5,3.5]'` | 看一个图案一步步长出来的过程 |
| `node dev/shot/demo1.mjs rosetta out.png` | 跑一个示范，存原尺寸图 |
| `node dev/reftools/track-pitcher.mjs <视频> <开始秒> <时长> <crop> <行> <x范围>` | 从参考视频逐帧量拉花缸左边缘（摆动频率、幅度、前后移动）。参考视频是第三方教程录屏，有冻结画面，量之前先查冻结段 |
| `dev/shot/update-templates.sh` | **改了流体物理后必须跑**：按示范重新量 GPU 模板，写回 patterns.js |
| `node dev/shot/game-smooth.mjs` | 在游戏里用平滑的模拟手指真倒一次树叶（比 game.mjs 的鼠标更接近真手机）。`ASSIST=0.4` 指定辅助强度，`PATTERN=heart` 倒心形 |
| `node dev/shot/guided.mjs '<倒法>' rosetta '[0,0.4,1]' out.png` | 同一种倒法当玩家输入，不同辅助强度各跑一遍，打分拼图 |
| `node dev/shot/game.mjs heart` | 在游戏里用模拟鼠标倒（鼠标一顿一顿，摇出来的线会偏淡） |
| `node dev/shot/fps.mjs` | 测游戏帧率和每帧耗时 |

（node 命令都要加 `NODE_PATH=dev/shot/node_modules`。）

注意：
- 判断画面好不好，一定要和 dev/ref/ 里的真视频帧并排比（ffmpeg hstack），不要只看模拟图。
- Claude 桌面应用里的浏览器面板隐藏时会暂停动画帧，在那里模拟倒奶不可靠，用上面的无头脚本。
- 开始页会在后台用 GPU 生成缩略图，进入倒奶画面时会暂停，测帧率前等它生成完。

## 发布

1. 改 main.js 里的 `BUILD`（格式 `月日-r序号`，例如 `1022-r46`）。
2. 两套回归测试都通过。
3. 提交、推到 main。commit 结尾加 `Co-Authored-By` 行。
4. 等 Pages 部署完，`curl` 线上 main.js 确认 BUILD 变了。

## 路线图

见 [ROADMAP.md](ROADMAP.md)。
