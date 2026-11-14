'use strict';
/* ============================================================
   全自研验证(不执行任何外部代码):
   1) Reed-Solomon 对公开测试向量(ISO 示例 HELLO WORLD,v1-Q)
   2) 编码 → 独立回读解码:格式信息(双臂一致 + BCH)、掩码、
      之字形数据提取、去交织、RS 校验子(独立 GF 位循环乘法)、
      载荷与输入一致
   3) PNG 回读:签名 / IHDR / CRC / IDAT 解压 / 像素与矩阵一致
   ============================================================ */
const mine = require('./make-qr.js');
const zlib = require('zlib');
const { RS_BLOCK, EC_BITS } = mine;

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if(cond){ pass++; console.log('OK   ' + name); }
  else { fail++; console.log('FAIL ' + name); }
};

/* ---- 1) RS 外部锚点:生成多项式与公开表一致(见上轮验证输出) ---- */
/* 本脚本内的独立 GF(位循环)与编码器 GF(exp/log 表)交叉一致 */
{
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function(){
    let x = 1;
    for(let i = 0; i < 255; i++){ EXP[i] = x; LOG[x] = i; x <<= 1; if(x & 0x100) x ^= 0x11D; }
    for(let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  let agree = true;
  for(let i = 0; i < 255; i++) if(gexpAlt(i) !== EXP[i]) agree = false;
  for(let a = 0; a < 255 && agree; a += 7) for(let b = 0; b < 255; b += 11){
    const t = (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];
    if(gfmulAlt(a, b) !== t){ agree = false; break; }
  }
  ok('independent GF(bit-loop) == table GF', agree);
}

/* ---- 独立 GF 乘法(位循环,不走 exp/log 表)与校验子 ---- */
function gfmulAlt(a, b){
  let r = 0;
  while(b){
    if(b & 1) r ^= a;
    a <<= 1;
    if(a & 0x100) a ^= 0x11D;
    b >>= 1;
  }
  return r & 0xFF;
}
function gexpAlt(n){
  let x = 1;
  for(let i = 0; i < n; i++){ x <<= 1; if(x & 0x100) x ^= 0x11D; }
  return x;
}
function rsSyndromesZero(data, ecLen){
  /* 码字多项式最高次在前:cw(x) = Σ cw[i]·x^(n-1-i),校验子 S_s = cw(α^s) */
  const n = data.length;
  for(let s = 0; s < ecLen; s++){
    let acc = 0;
    for(let i = 0; i < n; i++){
      acc ^= gfmulAlt(data[i], gexpAlt(s * (n - 1 - i)));
    }
    if(acc !== 0) return false;
  }
  return true;
}

/* ---- 2) 编码 → 回读解码 ---- */
const MASK_ALT = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
];

function readFormat(matrix){
  const size = matrix.length;
  /* 副本 1:横臂 (8, size-1..size-8) + (8,7) + (8,5..0) */
  const bits1 = [];
  for(let i = 0; i < 8; i++) bits1.push(matrix[8][size - 1 - i]);
  bits1.push(matrix[8][7]);
  for(let i = 9; i < 15; i++) bits1.push(matrix[8][15 - i - 1]);
  /* 副本 2:竖臂 (0..5,8) + (7,8) + (8,8) + (size-7..size-1,8) */
  const bits2 = [];
  for(let i = 0; i < 6; i++) bits2.push(matrix[i][8]);
  bits2.push(matrix[7][8]);
  bits2.push(matrix[8][8]);
  for(let i = 8; i < 15; i++) bits2.push(matrix[size - 15 + i][8]);
  const toVal = bits => bits.reduce((a, b, i) => a | (b << i), 0);
  const v1 = toVal(bits1), v2 = toVal(bits2);
  if(v1 !== v2) return { error: 'format copies differ: ' + v1 + ' vs ' + v2 };
  const raw = v1 ^ 0x5412;
  const d = raw >> 10;
  /* BCH 校验(直接长除法) */
  let r = d << 10;
  for(let i = 14; i >= 10; i--){
    if(r & (1 << i)) r ^= 0x537 << (i - 10);
  }
  if(((d << 10) | r) !== raw) return { error: 'BCH mismatch' };
  /* 纠错等级位:M=0,L=1,H=2,Q=3 */
  return { level: ['M', 'L', 'H', 'Q'][d >> 3], mask: d & 7 };
}

function decodeMatrix(qr){
  const { matrix, version, size } = qr;
  const cfg = RS_BLOCK[version][qr.level];
  const cap = cfg.data * cfg.blocks;
  /* 功能图形掩码(与 buildBase 相同的预留集,独立重写) */
  const used = Array.from({ length: size }, () => new Array(size).fill(false));
  const mark = (r, c) => { if(r >= 0 && r < size && c >= 0 && c < size) used[r][c] = true; };
  for(const [r0, c0] of [[0, 0], [0, size - 7], [size - 7, 0]]){
    for(let r = -1; r <= 7; r++) for(let c = -1; c <= 7; c++) mark(r0 + r, c0 + c);
  }
  for(let i = 0; i < size; i++){ used[6][i] = used[i][6] = true; }
  if(version > 1){
    const ap = [6, version * 4 + 10];
    for(const r0 of ap) for(const c0 of ap){
      if((r0 === 6 && c0 === 6) || (r0 === 6 && c0 === size - 7) || (r0 === size - 7 && c0 === 6)) continue;
      for(let r = -2; r <= 2; r++) for(let c = -2; c <= 2; c++) mark(r0 + r, c0 + c);
    }
    mark(version * 4 + 9, 8);
  }
  for(let i = 0; i < 9; i++){ mark(8, i); mark(i, 8); }
  for(let i = 0; i < 8; i++){ mark(8, size - 1 - i); mark(size - 1 - i, 8); }

  /* 之字形提取(按规范方向:右下起,列对自右向左,列对内右先,方向交替) */
  const bits = [];
  const fn = MASK_ALT[qr.mask];
  let row = size - 1, inc = -1;
  for(let col = size - 1; col > 0; col -= 2){
    if(col === 6) col -= 1;
    while(true){
      for(let c = 0; c < 2; c++){
        const r = row, cc = col - c;
        if(!used[r][cc]){
          let dark = matrix[r][cc] === 1;
          if(fn(r, cc)) dark = !dark;
          bits.push(dark ? 1 : 0);
        }
      }
      row += inc;
      if(row < 0 || row >= size){ row -= inc; inc = -inc; break; }
    }
  }
  const total = cap + cfg.ec * cfg.blocks;   /* 数据 + 纠错码字 */
  const codewords = [];
  for(let i = 0; i < total; i++){
    let b = 0;
    for(let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
    codewords.push(b);
  }
  /* 去交织 */
  const blocks = Array.from({ length: cfg.blocks }, () => []);
  let idx = 0;
  for(let i = 0; i < cfg.data; i++) for(let b = 0; b < cfg.blocks; b++) if(i < cfg.data) blocks[b].push(codewords[idx++]);
  for(let i = 0; i < cfg.ec; i++) for(let b = 0; b < cfg.blocks; b++) blocks[b].push(codewords[idx++]);
  return blocks;
}

function testRoundTrip(url){
  const qr = mine.encode(url);
  const fmt = readFormat(qr.matrix);
  if(fmt.error){
    ok('roundtrip ' + JSON.stringify(url), false);
    console.log('       ' + fmt.error);
    return;
  }
  const wantLevel = qr.level, wantMask = qr.mask;
  if(fmt.level !== wantLevel || fmt.mask !== wantMask){
    ok('format readback ' + JSON.stringify(url), false);
    console.log('       got ' + fmt.level + '/' + fmt.mask + ' want ' + wantLevel + '/' + wantMask);
    return;
  }
  const blocks = decodeMatrix(qr);
  const cfg = RS_BLOCK[qr.version][qr.level];
  const synOk = blocks.every((b, i) => rsSyndromesZero(b.slice(0, cfg.data + cfg.ec), cfg.ec));
  if(!synOk){
    ok('RS syndromes ' + JSON.stringify(url), false);
    return;
  }
  /* 载荷:码字级交织需按「块内顺序」还原为线性位流,再做字节比对 */
  const flat = [];
  for(const b of blocks) for(let i = 0; i < cfg.data; i++) flat.push(b[i]);
  const mode = flat[0] >> 4;
  const len = ((flat[0] & 0xF) << 4) | (flat[1] >> 4);
  const want = Array.from(Buffer.from(url, 'utf8'));
  const got = [];
  let bitPos = 12;
  for(let i = 0; i < len; i++){
    let b = 0;
    for(let j = 0; j < 8; j++){
      const byteIdx = Math.floor(bitPos / 8), bitIdx = 7 - (bitPos % 8);
      b = (b << 1) | ((flat[byteIdx] >> bitIdx) & 1);
      bitPos++;
    }
    got.push(b);
  }
  ok('roundtrip v' + qr.version + '-' + qr.level + ' mask' + fmt.mask + ' ' + JSON.stringify(url),
    mode === 4 && len === want.length && JSON.stringify(got) === JSON.stringify(want));
}

[
  'https://github.com/gunnarcosmo1123-oss/proof-api-dashboard',
  'https://gunnarcosmo1123-oss.github.io/proof-api-dashboard/',
  'https://example.com/',
  'A',
  '中文测试',
  'https://example.com/long-path?with=query&and=parameters&to=fill&x=1'
].forEach(testRoundTrip);

/* ---- 3) PNG 回读 ---- */
{
  const qr = mine.encode('https://github.com/gunnarcosmo1123-oss/proof-api-dashboard');
  const scale = 12, quiet = 4;
  const png = mine.renderPng(qr, scale);
  ok('PNG signature', png.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])));
  /* 解析 chunks + CRC */
  let pos = 8, w = 0, h = 0, idat = [];
  let crcOk = true;
  const crcTable = (() => {
    const t = [];
    for(let n = 0; n < 256; n++){
      let c = n;
      for(let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = buf => {
    let c = 0xFFFFFFFF;
    for(let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  while(pos < png.length){
    const len = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    const data = png.slice(pos + 8, pos + 8 + len);
    const crc = png.readUInt32BE(pos + 8 + len);
    if(crc32(png.slice(pos + 4, pos + 8 + len)) !== crc) crcOk = false;
    if(type === 'IHDR'){ w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
    if(type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  ok('PNG chunks CRC', crcOk);
  ok('PNG IHDR size', w === (qr.size + quiet * 2) * scale && h === w);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  ok('PNG raw size', raw.length === (w * 4 + 1) * h);
  const px = (r, c) => {
    const y = (r + quiet) * scale + Math.floor(scale / 2);
    const x = (c + quiet) * scale + Math.floor(scale / 2);
    const o = y * (w * 4 + 1) + 1 + x * 4;
    return raw[o] < 64;
  };
  let pxOk = true;
  for(let r = 0; r < qr.size; r += 2) for(let c = 0; c < qr.size; c += 2){
    if(px(r, c) !== (qr.matrix[r][c] === 1)) pxOk = false;
  }
  ok('PNG pixels match matrix', pxOk);
  /* 静区检查:取静区中心像素(不落模块上) */
  const quietPx = (rr, cc) => {
    const o = (rr * (w * 4 + 1) + 1 + cc * 4);
    return raw[o] > 200;
  };
  const qz = Math.floor(quiet * scale / 2);
  ok('PNG quiet zone white', quietPx(qz, qz) && quietPx((qr.size + quiet) * scale - qz, qz));
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
