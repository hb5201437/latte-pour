// 真流体版奶泡（WebGL2）：液面上解一层二维流体，奶泡是浮在上面、被水流带着走的一层膜。
//
// 物理模型（坐标：杯口直径 = 1，纹理坐标 v 朝上 = 屏幕上方 = "前方"，拉花缸在下方）
// - 奶柱扎进咖啡，在落点前方浮上来：浮出点是液面的"源"（散度为正），表面往外涌，浮上来的就是奶泡
// - 奶柱还带着往前冲的动量（射流），把浮出的奶泡往前推
// - 抬高后奶柱又细又急，把液面往下吸：落点变成"汇"（散度为负），两侧奶泡往奶柱这里收，
//   拉花缸往前走，身后就被收成一条 V 形的线（收尾、心尖、郁金香每片中间的尖都是这样来的）
// - 奶泡是黏的（越厚越黏），像一张膜整体被推着走，不会像墨水那样散开
// - 奶泡边缘碰着咖啡会慢慢染上一层油脂色；左右摇时新奶泡从里面把旧的推出去，
//   染色的边被挤成一道道细线，这就是千层纹
// - 杯壁不能穿过；源带进来的面积在杯壁附近往下沉（奶泡挤在杯壁边上）
//
// 场：vel（表面速度）、foam（R 奶泡厚度 h、G 油脂染色 t、B 咖啡里混进的牛奶 m、A 油脂纹理 c）

const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform vec2 texel;
float inside(vec2 p) { return step(length(p - 0.5), 0.5 - texel.x); }
float gauss(vec2 p, vec2 c, float r) { vec2 d = p - c; return exp(-dot(d, d) / (r * r)); }
// 点到线段（上一帧落点 → 这一帧落点）的距离：奶柱一帧走好几格时，沿整段路径连续作用，不会留下一串点
float segGauss(vec2 p, vec2 a, vec2 b, float r) {
  vec2 ab = b - a; float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
  vec2 d = p - (a + ab * t); return exp(-dot(d, d) / (r * r));
}
`;

const FS = {
  // 初始化：咖啡油脂表面的斑驳纹理（几层随机噪声叠起来）
  init: `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
uniform float seed;
void main() {
  // 油脂：大块明暗 + 被搅出来的细长条纹（虎纹）
  vec2 p = vUv * 6.0 + seed;
  float c = 0.45 * noise(p) + 0.25 * noise(p * 2.7) + 0.15 * noise(p * 6.3) + 0.15 * noise(vec2(p.x * 3.0, p.y * 14.0));
  o = vec4(0.0, 0.0, 0.0, c);
}`,
  clear: `void main() { o = vec4(0.0); }`,

  // 速度的半拉格朗日搬运
  advectVel: `
uniform sampler2D uVel; uniform float dt;
void main() {
  vec2 u = texture(uVel, vUv).xy;
  o = vec4(texture(uVel, vUv - dt * u).xy * inside(vUv), 0.0, 1.0);
}`,

  // 外力：阻尼、射流、拉花缸贴近液面时带着液面走
  forces: `
uniform sampler2D uVel, uFoam; uniform float dt, damp;
uniform vec2 jetPos, jetDir; uniform float jetAmp, jetR;
uniform vec2 srcPos, prevPos, pv; uniform float dragAmp, dragR;
void main() {
  vec2 u = texture(uVel, vUv).xy * exp(-damp * dt);
  u += jetDir * jetAmp * gauss(vUv, jetPos, jetR) * dt;
  float g = clamp(dragAmp * segGauss(vUv, prevPos, srcPos, dragR) * dt, 0.0, 1.0);
  u += (pv - u) * g;
  o = vec4(u * inside(vUv), 0.0, 1.0);
}`,

  // 黏性（隐式扩散的雅可比迭代），黏度随奶泡厚度变大：奶泡像一张膜被整体带动
  visc: `
uniform sampler2D uVel, uVel0, uFoam; uniform float dt, nu0, nu1;
float nu(vec2 p) { return nu0 + nu1 * smoothstep(0.05, 0.6, texture(uFoam, p).r); }
void main() {
  vec2 dx = vec2(texel.x, 0.0), dy = vec2(0.0, texel.y);
  float a = dt / (texel.x * texel.x);
  float nc = nu(vUv);
  vec2 num = texture(uVel0, vUv).xy; float den = 1.0;
  vec2 offs[4] = vec2[4](dx, -dx, dy, -dy);
  for (int k = 0; k < 4; k++) {
    vec2 q = vUv + offs[k];
    if (inside(q) < 0.5) continue;
    float w = a * 0.5 * (nc + nu(q));
    num += w * texture(uVel, q).xy; den += w;
  }
  o = vec4(num / den * inside(vUv), 0.0, 1.0);
}`,

  // 散度减去源/汇：投影之后的速度场散度就等于源/汇
  divergence: `
uniform sampler2D uVel, uFoam;
uniform vec2 upPos; uniform float upAmp, upR, spreadAmp, spreadL;
uniform vec2 sinkPos, sinkPrev; uniform float sinkAmp, sinkR;
uniform float ringAmp;
// 图案范围：奶泡，以及冒上来的奶咖色线（混了牛奶的咖啡）
float patternMask(vec4 f) { return max(smoothstep(0.35, 0.75, f.r), smoothstep(0.3, 0.5, f.b)); }
void main() {
  vec2 dx = vec2(texel.x, 0.0), dy = vec2(0.0, texel.y);
  float d = 0.5 / texel.x * (texture(uVel, vUv + dx).x - texture(uVel, vUv - dx).x +
                             texture(uVel, vUv + dy).y - texture(uVel, vUv - dy).y);
  float r = length(vUv - 0.5);
  float src = upAmp * gauss(vUv, upPos, upR) - sinkAmp * segGauss(vUv, sinkPrev, sinkPos, sinkR)
            - ringAmp * smoothstep(0.40, 0.49, r)
            // 奶从已有奶泡底下钻过去、把奶泡往上往外撑开：整片奶泡均匀膨胀（咖啡线不膨胀，所以越往外线越细、白带越宽）
            + spreadAmp * patternMask(texture(uFoam, vUv)) * exp(-length(vUv - upPos) / spreadL);
  o = vec4((d - src) * inside(vUv), 0.0, 0.0, 1.0);
}`,

  pressure: `
uniform sampler2D uP, uDiv;
void main() {
  if (inside(vUv) < 0.5) { o = vec4(0.0); return; }
  vec2 dx = vec2(texel.x, 0.0), dy = vec2(0.0, texel.y);
  float pc = texture(uP, vUv).r;
  float s = 0.0;
  vec2 offs[4] = vec2[4](dx, -dx, dy, -dy);
  for (int k = 0; k < 4; k++) { vec2 q = vUv + offs[k]; s += inside(q) > 0.5 ? texture(uP, q).r : pc; }
  o = vec4((s - texel.x * texel.x * texture(uDiv, vUv).r) * 0.25, 0.0, 0.0, 1.0);
}`,

  // 减去压力梯度，杯壁处去掉朝外的分量
  gradient: `
uniform sampler2D uVel, uP;
void main() {
  vec2 dx = vec2(texel.x, 0.0), dy = vec2(0.0, texel.y);
  float pc = texture(uP, vUv).r;
  float pl = inside(vUv - dx) > 0.5 ? texture(uP, vUv - dx).r : pc;
  float pr = inside(vUv + dx) > 0.5 ? texture(uP, vUv + dx).r : pc;
  float pb = inside(vUv - dy) > 0.5 ? texture(uP, vUv - dy).r : pc;
  float pt = inside(vUv + dy) > 0.5 ? texture(uP, vUv + dy).r : pc;
  vec2 u = texture(uVel, vUv).xy - 0.5 / texel.x * vec2(pr - pl, pt - pb);
  vec2 rv = vUv - 0.5; float r = length(rv);
  if (r > 0.5 - 4.0 * texel.x) { vec2 n = rv / r; u -= n * max(0.0, dot(u, n)); }
  o = vec4(u * inside(vUv), 0.0, 1.0);
}`,

  // 奶泡场的搬运（MacCormack：先正着搬，再倒着搬回来估计误差、补回去，细线不会被抹糊）
  advect: `
uniform sampler2D uSrc, uVel; uniform float dt;
void main() { o = texture(uSrc, vUv - dt * texture(uVel, vUv).xy); }`,
  maccormack: `
uniform sampler2D uSrc, uHat, uVel; uniform float dt;
void main() {
  vec2 u = texture(uVel, vUv).xy;
  vec4 hat = texture(uHat, vUv);
  vec4 back = texture(uHat, vUv + dt * u);
  vec4 r = hat + 0.5 * (texture(uSrc, vUv) - back);
  // 夹在出发点周围四个格的范围内，防止过冲出现亮斑
  vec2 p = (vUv - dt * u) / texel - 0.5;
  vec2 b = (floor(p) + 0.5) * texel;
  vec4 a0 = texture(uSrc, b), a1 = texture(uSrc, b + vec2(texel.x, 0.0));
  vec4 a2 = texture(uSrc, b + vec2(0.0, texel.y)), a3 = texture(uSrc, b + texel);
  r = clamp(r, min(min(a0, a1), min(a2, a3)), max(max(a0, a1), max(a2, a3)));
  o = r;
}`,

  // 奶泡浮出、抬高后的细线、融合时咖啡变浅、边缘染色
  inject: `
uniform sampler2D uFoam; uniform float dt;
uniform vec2 upPos, srcPos, prevPos; uniform float sharpen, absorbRate, absorbR; uniform float foamRate, foamR, white, lineRate, lineR, mixRate, mixR, tintRate, haloRate;
void main() {
  vec4 f = texture(uFoam, vUv);
  float h = f.r, t = f.g, m = f.b;
  // 浮出点冒上来的东西把原来的表面替换掉：white = 1 冒上来的是奶泡，0 是咖啡（奶柱钻得深，带上来的是咖啡）
  float e = min(1.0, foamRate * gauss(vUv, upPos, foamR) * dt);
  h += e * (1.2 * white - h);
  t += e * (0.0 - t);
  m += e * ((1.0 - white) * 0.6 - m);
  // 奶泡和咖啡不互溶：厚度往"有"或"没有"两头推，搬运抹出来的中间值不会一直留着
  h += sharpen * dt * h * (1.2 - h) * (h - 0.45);
  h = max(h, 0.0);
  // 抬高的奶柱扎下去，把经过的奶泡吸到下面（切出一道细缝，两边被吸口收拢）
  h *= 1.0 - min(1.0, absorbRate * segGauss(vUv, prevPos, srcPos, absorbR) * dt);
  float l = lineRate * segGauss(vUv, prevPos, srcPos, lineR) * dt;
  float addL = l * max(0.0, 0.7 - h);
  t = t * h / max(1e-4, h + addL); h += addL;
  m += mixRate * gauss(vUv, srcPos, mixR) * dt * (1.0 - m);
  // 奶泡底下的牛奶慢慢渗到周围咖啡里：奶泡四周一圈变浅
  vec2 dx = vec2(texel.x * 3.0, 0.0), dy = vec2(0.0, texel.y * 3.0);
  float hn = min(min(texture(uFoam, vUv + dx).r, texture(uFoam, vUv - dx).r),
                 min(texture(uFoam, vUv + dy).r, texture(uFoam, vUv - dy).r));
  float hx = max(max(texture(uFoam, vUv + dx).r, texture(uFoam, vUv - dx).r),
                 max(texture(uFoam, vUv + dy).r, texture(uFoam, vUv - dy).r));
  m += haloRate * smoothstep(0.05, 0.5, hx) * dt * (1.0 - m);
  // 边缘染色：挨着咖啡（周围有没奶泡的地方）的奶泡慢慢染上油脂色
  float edge = smoothstep(0.02, 0.1, h) * (1.0 - smoothstep(0.05, 0.35, hn));
  t += tintRate * edge * dt * (1.0 - t);
  o = vec4(h, clamp(t, 0.0, 1.0), clamp(m, 0.0, 1.0), f.a) * inside(vUv);
}`,

  // 画面：奶泡按厚度算法线打光，薄处透出下面的咖啡
  render: `
uniform sampler2D uFoam; uniform float showVel; uniform sampler2D uVel;
void main() {
  vec2 p = vec2(vUv.x, vUv.y);
  float r = length(p - 0.5);
  // 杯口外面透明（游戏里液面画布叠在杯子上），边缘抗锯齿
  float edgeA = 1.0 - smoothstep(0.5 - texel.x, 0.5, r);
  if (edgeA <= 0.0) { o = vec4(0.0); return; }
  vec4 f = texture(uFoam, p);
  float h = f.r, t = f.g, m = f.b, c = f.a;
  // 细颗粒：奶泡里的微泡、油脂表面的细斑
  float gr = fract(sin(dot(floor(vUv * 900.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  vec3 crema = mix(vec3(0.30, 0.15, 0.07), vec3(0.47, 0.25, 0.12), smoothstep(0.2, 0.85, c));
  crema = mix(crema, vec3(0.70, 0.50, 0.32), m * 0.8);
  crema *= 1.0 + gr * 0.06;
  // 奶泡：厚处暖白，薄的边缘透出一点油脂色
  vec3 foamC = mix(vec3(0.80, 0.64, 0.46), vec3(0.97, 0.94, 0.88), smoothstep(0.5, 0.95, h));
  foamC = mix(foamC, vec3(0.70, 0.50, 0.31), t);
  foamC *= 1.0 + gr * 0.025;
  float cov = smoothstep(0.22, 0.6, h);
  vec3 col = mix(crema, foamC, cov);
  // 法线：奶泡厚度当高度
  vec2 dx = vec2(texel.x, 0.0), dy = vec2(0.0, texel.y);
  float hs = 2.5;
  float gx = (texture(uFoam, p + dx).r - texture(uFoam, p - dx).r) * hs;
  float gy = (texture(uFoam, p + dy).r - texture(uFoam, p - dy).r) * hs;
  vec3 n = normalize(vec3(-gx, -gy, 1.0));
  vec3 L = normalize(vec3(-0.4, 0.6, 0.8));
  float diff = 0.75 + 0.25 * dot(n, L);
  float spec = pow(max(0.0, dot(reflect(-L, n), vec3(0.0, 0.0, 1.0))), 24.0) * 0.25 * cov;
  col = col * diff + spec;
  // 杯壁附近暗一点
  col *= 1.0 - 0.25 * smoothstep(0.42, 0.5, r);
  if (showVel > 0.5) col = mix(col, vec3(0.5 + texture(uVel, p).xy * 2.0, 0.5), 0.6);
  o = vec4(col * edgeA, edgeA);
}`,
};

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
  return s;
}

function program(gl, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, HEAD + fs));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

// 可调参数（单位：杯口直径 = 1，秒）
export const P = {
  damp: 1.6,         // 表面速度的阻尼（1/秒）
  nu0: 0.0003,       // 咖啡的黏度
  nu1: 0.004,        // 奶泡额外的黏度（满厚度时）
  viscIters: 16,
  pressureIters: 40,
  upArea: 0.05,      // 满流量时每秒浮上来的面积（杯口直径² / 秒）
  upR: 0.04,         // 浮出点的半径
  aheadLow: 0.035,   // 浮出点在落点前方多远（贴近液面时）
  aheadFlow: 0.03,   // 流量越大浮得越远
  jet: 6.0,          // 射流往前推的加速度
  jetR: 0.035,
  drag: 12,          // 拉花缸贴着液面时带着液面走的强度
  dragR: 0.03,
  liftJet: 0.8,      // 抬高收尾时的射流（奶柱细，往前推得弱）
  dragVmax: 2,       // 拖动的目标速度上限（杯口直径/秒）
  liftDrag: 20,      // 抬高收尾时奶柱带着液面往前走的强度
  liftDragR: 0.035,  // 带动的范围（收尾时奶柱又急又冲，带动的宽度有好几毫米）
  absorb: 40,        // 抬高的奶柱把经过的奶泡吸到下面的速度
  absorbR: 0.008,
  sinkArea: 0.05,    // 抬高时奶柱往下吸的面积（每秒）
  sinkR: 0.025,
  foamRate: 100,
  foamR: 0.04,
  lineRate: 0,  
  lineR: 0.008,
  mixRate: 0.8,
  mixR: 0.06,
  tintRate: 1.2,
  haloRate: 0.05,
  fusionSec: 0.8,
  wigMin: 0.15,      // 横移速度峰值低于这个不算在摇（一直出白）
  whiteSlow: 0.62,    // 横移速度不到这一轮峰值的这个比例：冒上来的是奶泡（摆到两端）
  whiteFast: 0.82,   // 超过这个比例：冒上来的是咖啡（摆到中段，奶柱钻得深）
  onsetSec: 0.2,    // 停一下再出奶时，先冒一点咖啡再出白（郁金香片与片之间的线）
  pauseSec: 0.08,
  diveSlow: 0.5,     // 往前移动快过这个（杯口直径/秒），浮上来的奶开始变少
  diveFast: 1.0,     // 快过这个，奶全部钻到下面去
  latTau: 0.05,      // 横移速度的平滑时间（秒）
  upLagSec: 0.04,   // 浮出点跟着奶柱横移的延迟（太大左右的叶子连成对称的弧，太小两边断开）
  spread: 0.6,       // 浮上来的奶里，有多少是从奶泡底下钻过去、把整片奶泡撑开的
  spreadL: 0.25,     // 撑开的作用随离浮出点的距离衰减
  sharpen: 1.5,       // 分相的强度
  oneWay: 0,        // 1 = 只在往右摆的中段冒咖啡（一个来回一道线），0 = 两个方向都冒
};

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const foamOnNow = sim => (sim.flowTime > P.fusionSec ? 1 : 0);

export class FluidSim {
  constructor(gl, N = 256) {
    this.gl = gl;
    this.N = N;
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('需要 EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    this.prog = {};
    for (const k in FS) this.prog[k] = program(gl, FS[k]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const T = () => this.target();
    this.vel = [T(), T()]; this.vel0 = T();
    this.pres = [T(), T()]; this.div = T();
    this.foam = [T(), T()]; this.hat = T();
    this.reset();
  }

  target() {
    const gl = this.gl, N = this.N;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, N, N, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb };
  }

  // 用某个着色器画到目标（null = 屏幕）
  run(name, out, uniforms = {}, textures = {}) {
    const gl = this.gl, pr = this.prog[name];
    gl.useProgram(pr.p);
    if (out) { gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb); gl.viewport(0, 0, this.N, this.N); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); }
    if (pr.u.texel) gl.uniform2f(pr.u.texel, 1 / this.N, 1 / this.N);
    let unit = 0;
    for (const k in textures) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, textures[k].tex);
      gl.uniform1i(pr.u[k], unit++);
    }
    for (const k in uniforms) {
      const v = uniforms[k], loc = pr.u[k];
      if (loc == null) continue;
      if (Array.isArray(v)) gl.uniform2f(loc, v[0], v[1]); else gl.uniform1f(loc, v);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  swap(pair) { const t = pair[0]; pair[0] = pair[1]; pair[1] = t; }

  reset() {
    for (const t of [this.vel[0], this.vel[1], this.vel0, this.pres[0], this.pres[1], this.div, this.foam[1], this.hat]) this.run('clear', t);
    this.run('init', this.foam[0], { seed: Math.random() * 100 });
    this.flowTime = 0;
    this.last = null;
    this.latSpeed = 0;
    this.latPeak = 0;
    this.upX = null;
    this.fwdSpeed = 0;
    this.foamArea = 0;
    this.pausedFor = 0;
    this.sinceOnset = 0;
    this.time = 0;
  }

  // inp: { x, y }：奶柱落点（纹理坐标，y 朝上 = 前方），q：流量 0~1，lift：抬高 0~1
  step(dt, inp) {
    if (!(dt > 0)) return;
    const fwd = [0, 1];
    const q = inp.q;
    let lift = inp.lift ?? 0;
    this.time += dt;
    if (q > 0) this.flowTime += dt * (0.6 + 0.4 * q);
    const foamOn = this.flowTime > P.fusionSec ? 1 : 0;
    const pv = this.last ? [(inp.x - this.last[0]) / dt, (inp.y - this.last[1]) / dt] : [0, 0];
    this.prevSrc = this.last || [inp.x, inp.y];
    this.last = [inp.x, inp.y];
    // 冒上来的是奶泡还是咖啡：看奶柱横移得多快，以及是不是刚重新开始出奶
    // 横移速度先平滑一下（触摸、陀螺仪的读数一帧一帧有抖动，不平滑的话白和褐判断会乱跳）
    this.latVel = (this.latVel ?? 0) + (pv[0] - (this.latVel ?? 0)) * (1 - Math.exp(-dt / P.latTau));
    this.latSpeed = Math.abs(this.latVel);
    if (q * (1 - lift) > 0.05) {
      if (this.pausedFor > P.pauseSec) this.sinceOnset = 0;
      this.pausedFor = 0;
      this.sinceOnset += dt;
    } else this.pausedFor += dt;
    // 峰值：快速跟上、慢慢回落（大约一个摆动周期）
    this.latPeak = Math.max(this.latSpeed, this.latPeak * Math.exp(-dt / 1.0));
    const rel = this.latPeak > P.wigMin && (!P.oneWay || this.latVel > 0) ? this.latSpeed / this.latPeak : 0;
    const white = (1 - ss(P.whiteSlow, P.whiteFast, rel)) * ss(0, P.onsetSec, this.sinceOnset);
    this.debug = { white, rel, latSpeed: this.latSpeed, latPeak: this.latPeak };
    // 奶泡面积（估计）：冒上来的白色部分 + 被撑开的部分；用来把"撑开"的总量分摊到整片奶泡上
    this.foamArea += dt * foamOnNow(this) * q * (1 - lift) * P.upArea;

    // 奶柱快速往前扫的时候，奶来不及浮上来就钻到下面去了（收尾时不会再拖出一道粗白）
    this.fwdSpeed = (this.fwdSpeed ?? 0) + (Math.max(0, pv[1]) - (this.fwdSpeed ?? 0)) * (1 - Math.exp(-dt / 0.03));
    const dive = 1 - ss(P.diveSlow, P.diveFast, this.fwdSpeed);
    // 快速往前扫的奶柱和抬高的一样：浮不出奶泡，只会往下吸、带着液面走（手指模式快速一划和陀螺仪先抬高再推，收尾效果一致）
    lift = Math.max(lift, 1 - dive);
    const low = q * (1 - lift);          // 贴着液面出奶的量：浮上来的奶泡
    const ahead = P.aheadLow + P.aheadFlow * low;
    // 浮出点：落点前方；横向上慢慢跟着落点走（左右摇时浮出点基本留在中间，冒上来的一道道弧跨过中线）
    if (this.upX == null || q === 0) this.upX = inp.x;
    this.upX += (inp.x - this.upX) * (1 - Math.exp(-dt / P.upLagSec));
    const up = [this.upX + fwd[0] * ahead, inp.y + fwd[1] * ahead];
    const Q = foamOn * low * P.upArea;
    const upAmp = Q * (1 - P.spread) / (Math.PI * P.upR * P.upR);
    const spreadAmp = this.foamArea > 0.003 ? Q * P.spread / this.foamArea : 0;
    // 奶柱带着液面走，但液面跟不上太快的奶柱：拖动的目标速度有上限（划得再快也不会把奶泡撕开）
    const pvLen = Math.hypot(pv[0], pv[1]), cap = Math.min(1, P.dragVmax / Math.max(pvLen, 1e-6));
    const dragPv = [pv[0] * cap, pv[1] * cap];
    // 吸口沿这一帧走过的线段分布：面积 ≈ 圆 + 长条
    const segLen = Math.hypot(inp.x - this.prevSrc[0], inp.y - this.prevSrc[1]);
    const sinkAmp = q * lift * P.sinkArea / (Math.PI * P.sinkR * P.sinkR + 2 * P.sinkR * Math.sqrt(Math.PI) * segLen);
    // 源和汇的净面积由杯壁附近的一圈往下沉的流补上（环 0.40~0.49 的有效面积约 π(0.49²-0.40²)/2）
    const net = Q * (spreadAmp > 0 ? 1 : 1 - P.spread) - q * lift * P.sinkArea;
    const ringAmp = net / (Math.PI * (0.49 * 0.49 - 0.40 * 0.40) * 0.5);

    this.run('advectVel', this.vel[1], { dt }, { uVel: this.vel[0] }); this.swap(this.vel);
    this.run('forces', this.vel[1], {
      dt, damp: P.damp, jetPos: up, jetDir: fwd, jetAmp: P.jet * q * (1 - lift) + P.liftJet * q * lift, jetR: P.jetR,
      srcPos: [inp.x, inp.y], prevPos: this.prevSrc, pv: dragPv, dragAmp: P.drag * q * (1 - lift) + P.liftDrag * q * lift, dragR: P.dragR + (P.liftDragR - P.dragR) * lift,
    }, { uVel: this.vel[0], uFoam: this.foam[0] });
    this.swap(this.vel);
    // 黏性：vel0 存外力之后的速度，迭代求解
    this.run('advectVel', this.vel0, { dt: 0 }, { uVel: this.vel[0] });
    for (let i = 0; i < P.viscIters; i++) {
      this.run('visc', this.vel[1], { dt, nu0: P.nu0, nu1: P.nu1 }, { uVel: this.vel[0], uVel0: this.vel0, uFoam: this.foam[0] });
      this.swap(this.vel);
    }
    this.run('divergence', this.div, { upPos: up, upAmp, upR: P.upR, spreadAmp, spreadL: P.spreadL, sinkPos: [inp.x, inp.y], sinkPrev: this.prevSrc, sinkAmp, sinkR: P.sinkR, ringAmp }, { uVel: this.vel[0], uFoam: this.foam[0] });
    for (let i = 0; i < P.pressureIters; i++) {
      this.run('pressure', this.pres[1], {}, { uP: this.pres[0], uDiv: this.div });
      this.swap(this.pres);
    }
    this.run('gradient', this.vel[1], {}, { uVel: this.vel[0], uP: this.pres[0] }); this.swap(this.vel);

    this.run('advect', this.hat, { dt }, { uSrc: this.foam[0], uVel: this.vel[0] });
    this.run('maccormack', this.foam[1], { dt }, { uSrc: this.foam[0], uHat: this.hat, uVel: this.vel[0] }); this.swap(this.foam);
    this.run('inject', this.foam[1], {
      dt, upPos: up, srcPos: [inp.x, inp.y], prevPos: this.prevSrc,
      absorbRate: q * lift * P.absorb, absorbR: P.absorbR,
      foamRate: foamOn * low * P.foamRate, foamR: P.foamR, white,
      lineRate: foamOn * q * lift * P.lineRate, lineR: P.lineR,
      mixRate: (1 - foamOn) * q * P.mixRate, mixR: P.mixR,
      tintRate: P.tintRate, haloRate: P.haloRate, sharpen: P.sharpen,
    }, { uFoam: this.foam[0] });
    this.swap(this.foam);
  }

  // 把奶泡场读回 CPU（评分用）：RGBA 浮点，行 0 = 纹理 v=0（拉花缸那侧）
  readFoam() {
    const gl = this.gl, N = this.N, out = new Float32Array(N * N * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.foam[0].fb);
    gl.readPixels(0, 0, N, N, gl.RGBA, gl.FLOAT, out);
    return out;
  }

  render(showVel = false) {
    this.run('render', null, { showVel: showVel ? 1 : 0 }, { uFoam: this.foam[0], uVel: this.vel[0] });
  }
}
