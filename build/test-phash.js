'use strict';
/* ============================================================
   pHash-DCT 单元测试(零依赖,node 直跑;canvas/Image 用桩实现)
   1) DCT 性质:常向量只留 DC;能量守恒
   2) 阈值行为:同图微变(噪声/亮度/裁切)→ 汉明距离 ≤ 8;
      无关图像 → > 8(即 proofApiSubmit 的 phHd ≤ 8 阈值两侧)
   3) 注册表版本迁移:旧 aHash 条目作废 → 从缩略图重建 DCT 哈希
      → 持久化带 version 标记 → 二次加载不再触发迁移
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (name, cond) => { if(cond){ pass++; console.log('OK   ' + name); } else { fail++; console.log('FAIL ' + name); } };

/* ---- 确定性噪声 ---- */
function noise(rnd, amp){
  return (rnd() * 2 - 1) * amp;
}
function rng(seed){
  let s = seed >>> 0;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* ---- 画布 / Image 桩(采样用最近邻) ---- */
function makeStubEnv(pixelsByUrl){
  const fakeCanvas = {
    width: 0, height: 0, __img: null,
    getContext(){
      return {
        drawImage: (img, x, y, w, h) => { fakeCanvas.width = w; fakeCanvas.height = h; fakeCanvas.__img = img; },
        getImageData: (x, y, w, h) => {
          const img = fakeCanvas.__img;
          const data = new Uint8ClampedArray(w * h * 4);
          const src = img.__pixels, sw = img.naturalWidth, sh = img.naturalHeight;
          for(let yy = 0; yy < h; yy++) for(let xx = 0; xx < w; xx++){
            const sx = Math.min(sw - 1, Math.floor(xx * sw / w));
            const sy = Math.min(sh - 1, Math.floor(yy * sh / h));
            const si = (sy * sw + sx) * 3, di = (yy * w + xx) * 4;
            data[di] = src[si]; data[di + 1] = src[si + 1]; data[di + 2] = src[si + 2]; data[di + 3] = 255;
          }
          return { data };
        }
      };
    },
    toDataURL(){ throw new Error('toDataURL not stubbed'); }
  };
  class FakeImage {
    constructor(){ this.naturalWidth = 0; this.naturalHeight = 0; this.__pixels = null; }
    set src(url){
      const p = pixelsByUrl[url];
      if(!p){ if(this.onerror) this.onerror(new Error('no pixels for ' + url)); return; }
      this.naturalWidth = p.w; this.naturalHeight = p.h; this.__pixels = p.data;
      if(this.onload) this.onload();
    }
  }
  const document = { createElement: tag => (tag === 'canvas' ? fakeCanvas : {}) };
  return { document, Image: FakeImage };
}

/* ---- 加载 api.js 到 vm ---- */
function loadApi(store, pixelsByUrl){
  const env = makeStubEnv(pixelsByUrl || {});
  const ctx = {
    console,
    document: env.document,
    Image: env.Image,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'api.js'), 'utf8'), ctx, { filename: 'api.js' });
  return ctx;
}

/* ---- 1) DCT 性质 ---- */
{
  const ctx = loadApi({});
  const dct1d = vm.runInContext('dct1d', ctx);
  const c = 7;
  const v = new Float64Array(32).fill(c);
  const out = dct1d(v);
  ok('DCT constant → DC = N·c (' + out[0].toFixed(1) + ')', Math.abs(out[0] - 32 * c) < 1e-6);
  const rest = Array.from(out.slice(1)).reduce((a, b) => a + Math.abs(b), 0);
  ok('DCT constant → AC = 0', rest < 1e-6);
  /* 正交性:单一频率的余弦波能量集中于对应系数(旁瓣 < 1e-6) */
  for(const k of [2, 5, 11, 23]){
    const f = Float64Array.from({ length: 32 }, (_, x) => Math.cos(Math.PI * k * (2 * x + 1) / 64));
    const F = dct1d(f);
    const main = Math.abs(F[k]);
    const leak = Array.from(F).reduce((a, b, i) => a + (i === k ? 0 : Math.abs(b)), 0);
    ok('DCT pure cosine k=' + k + ' → main ' + main.toFixed(1) + ', leak ' + leak.toExponential(1), Math.abs(main - 16) < 1e-6 && leak < 1e-6);
  }
}

/* ---- 2) 阈值行为:同图微变 ≤ 8,无关 > 8 ---- */
{
  const ctx = loadApi({});
  const phashFromGray = vm.runInContext('phashFromGray', ctx);
  const hamming = vm.runInContext('hamming', ctx);
  /* 照片级宽带底图:8×8 随机网格双线性上采样(能量连续分布,低频为主) + 两个亮斑 */
  const mkPhotoBase = () => {
    const r8 = rng(42);
    const grid = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => r8() * 160 + 40));
    const out = new Float64Array(32 * 32);
    for(let y = 0; y < 32; y++) for(let x = 0; x < 32; x++){
      const gx = x * 7 / 31, gy = y * 7 / 31;
      const x0 = Math.min(6, Math.floor(gx)), y0 = Math.min(6, Math.floor(gy));
      const tx = gx - x0, ty = gy - y0;
      const v =
        grid[y0][x0] * (1 - tx) * (1 - ty) + grid[y0][x0 + 1] * tx * (1 - ty) +
        grid[y0 + 1][x0] * (1 - tx) * ty + grid[y0 + 1][x0 + 1] * tx * ty;
      out[y * 32 + x] = v;
    }
    /* 两个高斯斑(模拟天空/地面明暗结构) */
    for(let y = 0; y < 32; y++) for(let x = 0; x < 32; x++){
      const d1 = (x - 10) ** 2 + (y - 8) ** 2, d2 = (x - 24) ** 2 + (y - 22) ** 2;
      out[y * 32 + x] += 55 * Math.exp(-d1 / 40) + 40 * Math.exp(-d2 / 60);
    }
    return out;
  };
  const base = mkPhotoBase();
  const b0 = phashFromGray(base);
  ok('phash bits length 64', b0.bits.length === 64 && b0.hex.length === 16);
  ok('phash identical → hd 0', hamming(b0.bits, phashFromGray(base).bits) === 0);

  /* 微变:±2 噪声 / 亮度 +8 / 裁切一圈再放大回 32×32 */
  const r = rng(20261114);
  const noisy = base.map(v => v + noise(r, 2));
  const bright = base.map(v => v + 8);
  const crop = new Float64Array(32 * 32);
  for(let y = 0; y < 32; y++) for(let x = 0; x < 32; x++){
    const sx = Math.min(31, Math.floor(x * 30 / 32)) + 1;
    const sy = Math.min(31, Math.floor(y * 30 / 32)) + 1;
    crop[y * 32 + x] = base[sy * 32 + sx];
  }
  const hdNoise = hamming(b0.bits, phashFromGray(noisy).bits);
  const hdBright = hamming(b0.bits, phashFromGray(bright).bits);
  const hdCrop = hamming(b0.bits, phashFromGray(crop).bits);
  ok('noise ±2 → hd ' + hdNoise + ' ≤ 8', hdNoise <= 8);
  ok('brightness +8 → hd ' + hdBright + ' ≤ 8', hdBright <= 8);
  ok('crop 6% → hd ' + hdCrop + ' ≤ 8', hdCrop <= 8);

  /* 无关图像:不同结构 / 纯随机 */
  const other = new Float64Array(32 * 32);
  for(let y = 0; y < 32; y++) for(let x = 0; x < 32; x++){
    other[y * 32 + x] = 90 + 90 * Math.cos(2 * Math.PI * (x + 2 * y) / 32) * (x > 16 ? 1 : -1);
  }
  const rnd2 = rng(987654321);
  const random = Float64Array.from({ length: 32 * 32 }, () => rnd2() * 255);
  const hdOther = hamming(b0.bits, phashFromGray(other).bits);
  const hdRandom = hamming(b0.bits, phashFromGray(random).bits);
  ok('unrelated structure → hd ' + hdOther + ' > 8', hdOther > 8);
  ok('random noise → hd ' + hdRandom + ' > 8', hdRandom > 8);

  /* 平坦图 → 全零位(去 DC 后所有系数为 0) */
  const flat = phashFromGray(new Float64Array(32 * 32).fill(128));
  ok('flat image → all-zero bits', flat.bits === '0'.repeat(64) && flat.hex === '0000000000000000');
}

/* ---- 3) 注册表版本迁移 ---- */
{
  const pixelsByUrl = {};
  /* 64×64 平滑图案作为"缩略图"素材 */
  const w = 64, h = 64, px = new Uint8Array(w * h * 3);
  for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){
    const v = 120 + 60 * Math.sin(2 * Math.PI * x / w) + 35 * Math.cos(2 * Math.PI * y / h);
    const i = (y * w + x) * 3;
    px[i] = Math.max(0, Math.min(255, v)); px[i + 1] = Math.max(0, Math.min(255, v * 0.9)); px[i + 2] = Math.max(0, Math.min(255, v * 1.1));
  }
  pixelsByUrl['data:image/jpeg;base64,FAKE0001'] = { w, h, data: px };

  /* 预置 v1 时代注册表(无 version 字段,aHash 位串) */
  const store = {};
  const oldBits = '1010101010101010101010101010101010101010101010101010101010101010';
  store['proof-session'] = JSON.stringify({
    subs: [{ submission: { id: 'PA-2001', time: Date.now(), thumb: 'data:image/jpeg;base64,FAKE0001', org: null, orgType: null }, verification: { verdict: 'verified' }, receipt: { issuedAt: Date.now() } }],
    hashes: [{ id: 'PA-2001', hash: 'abcd1234' }],
    phashes: [{ id: 'PA-2001', bits: oldBits }]
  });

  const ctx = loadApi(store, pixelsByUrl);
  const REG1 = vm.runInContext('REG', ctx);
  ok('old registry → phashes dropped', REG1.phashes.length === 0);
  ok('old registry → stalePhashes marked', REG1.stalePhashes && REG1.stalePhashes.length === 1);
  ok('old registry → exact hashes kept', REG1.hashes.length === 1);
  ok('old registry → subs kept', REG1.subs.length === 1);

  /* 重建 */
  vm.runInContext('rebuildStalePhashes()', ctx);
  (async () => {
    await new Promise(res => setTimeout(res, 20));
    const REG2 = vm.runInContext('REG', ctx);
    ok('rebuild → phash repopulated', REG2.phashes.length === 1);
    ok('rebuild → stale cleared', REG2.stalePhashes === null);
    /* 重建位串应与"同一图案经画布桩下采样"的 pHash 一致,且不同于旧 aHash */
    const expected = (() => {
      const g = new Float64Array(32 * 32);
      for(let y = 0; y < 32; y++) for(let x = 0; x < 32; x++){
        const sx = Math.min(w - 1, Math.floor(x * w / 32)), sy = Math.min(h - 1, Math.floor(y * h / 32));
        const i = (sy * w + sx) * 3;
        g[y * 32 + x] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      }
      return vm.runInContext('phashFromGray', ctx)(g).bits;
    })();
    ok('rebuild → bits match DCT pipeline', REG2.phashes[0].bits === expected);
    ok('rebuild → differs from old aHash', REG2.phashes[0].bits !== oldBits);

    /* 持久化含 version 标记;二次加载不再迁移 */
    const saved = JSON.parse(store['proof-session']);
    ok('saveRegistry → version marker ' + saved.version, saved.version === 2);
    const ctx2 = loadApi(store, pixelsByUrl);
    const REG3 = vm.runInContext('REG', ctx2);
    ok('reload → no stale, phashes intact', REG3.stalePhashes === null && REG3.phashes.length === 1 && REG3.phashes[0].bits === expected);
    console.log(pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })();
}
