'use strict';
/* ============================================================
   Proof API · 零依赖 QR 码生成器(字节模式,v1–v4,L/M/Q/H)
   纯 node 实现:GF(256) Reed-Solomon + 标准掩码/罚分 + PNG 写入(zlib)。
   用法:node build/make-qr.js [url] [out.png]
   默认:仓库地址 → assets/qr.png(供评委扫码 / About 面板 / README)
   校验:node build/verify-qr.js 与本文件自带的 PNG 写回解析互证。
   ============================================================ */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

/* ---- GF(256),本原多项式 0x11D ---- */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(function(){
  let x = 1;
  for(let i = 0; i < 255; i++){ EXP[i] = x; LOG[x] = i; x <<= 1; if(x & 0x100) x ^= 0x11D; }
  for(let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gmul = (a, b) => (!a || !b) ? 0 : EXP[LOG[a] + LOG[b]];

/* ---- Reed-Solomon ---- */
function rsGenerator(degree){
  let g = [1];
  for(let i = 0; i < degree; i++){
    const ng = new Array(g.length + 1).fill(0);
    for(let j = 0; j < g.length; j++){
      ng[j] ^= gmul(g[j], EXP[i]);
      ng[j + 1] ^= g[j];
    }
    g = ng;
  }
  return g;
}
function rsEncode(data, ecLen){
  /* 生成多项式最低次在前 → 反转后从最高次做综合除法,余数即纠错码字 */
  const rev = rsGenerator(ecLen).slice().reverse();
  const res = data.concat(new Array(ecLen).fill(0));
  for(let i = 0; i < data.length; i++){
    const f = res[i];
    if(f){
      for(let j = 0; j < rev.length; j++) res[i + j] ^= gmul(rev[j], f);
    }
  }
  return res.slice(data.length);
}

/* ---- RS 分块表(ISO 18004,v1–v4;每版本各等级为均匀分块) ---- */
const RS_BLOCK = {
  1: { L: { data: 19, ec: 7,  blocks: 1 }, M: { data: 16, ec: 10, blocks: 1 }, Q: { data: 13, ec: 13, blocks: 1 }, H: { data: 9,  ec: 17, blocks: 1 } },
  2: { L: { data: 34, ec: 10, blocks: 1 }, M: { data: 28, ec: 16, blocks: 1 }, Q: { data: 22, ec: 22, blocks: 1 }, H: { data: 16, ec: 28, blocks: 1 } },
  3: { L: { data: 55, ec: 15, blocks: 1 }, M: { data: 44, ec: 26, blocks: 1 }, Q: { data: 17, ec: 18, blocks: 2 }, H: { data: 13, ec: 22, blocks: 2 } },
  4: { L: { data: 80, ec: 20, blocks: 1 }, M: { data: 32, ec: 18, blocks: 2 }, Q: { data: 24, ec: 26, blocks: 2 }, H: { data: 9,  ec: 16, blocks: 4 } }
};
const EC_BITS = { L: 1, M: 0, Q: 3, H: 2 };

/* ---- 数据编码(字节模式)+ 填充 ---- */
function encodeData(bytes, version, level){
  const cfg = RS_BLOCK[version][level];
  const cap = cfg.data * cfg.blocks;
  const bits = [];
  const push = (v, n) => { for(let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
  push(4, 4);                       /* 模式:字节 */
  push(bytes.length, 8);            /* 长度(v1–v9 为 8 位) */
  bytes.forEach(b => push(b, 8));
  const term = Math.min(4, cap * 8 - bits.length);
  for(let i = 0; i < term; i++) bits.push(0);
  while(bits.length % 8) bits.push(0);
  const codewords = [];
  for(let i = 0; i < bits.length; i += 8) codewords.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  let alt = true;
  while(codewords.length < cap){ codewords.push(alt ? 0xEC : 0x11); alt = !alt; }
  return codewords;
}

/* ---- 分块 + 纠错 + 交织 ---- */
function makeCodewords(dataBytes, version, level){
  const cfg = RS_BLOCK[version][level];
  const blocks = [];
  for(let i = 0; i < cfg.blocks; i++) blocks.push(dataBytes.slice(i * cfg.data, (i + 1) * cfg.data));
  const ecs = blocks.map(b => rsEncode(b, cfg.ec));
  const out = [];
  for(let i = 0; i < cfg.data; i++) for(const b of blocks) if(i < b.length) out.push(b[i]);
  for(let i = 0; i < cfg.ec; i++) for(const e of ecs) out.push(e[i]);
  return out;
}

/* ---- 矩阵与功能图形 ---- */
function buildBase(version){
  const size = version * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(0));
  const used = Array.from({ length: size }, () => new Array(size).fill(false));

  const finder = (r0, c0) => {
    for(let r = -1; r <= 7; r++) for(let c = -1; c <= 7; c++){
      const rr = r0 + r, cc = c0 + c;
      if(rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
      const dark = (r >= 0 && r <= 6 && c >= 0 && c <= 6) &&
        (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      m[rr][cc] = dark ? 1 : 0;
      used[rr][cc] = true;
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  for(let i = 8; i < size - 8; i++){
    m[6][i] = m[i][6] = (i % 2 === 0) ? 1 : 0;
    used[6][i] = used[i][6] = true;
  }

  if(version > 1){
    const ap = [6, version * 4 + 10];
    for(const r0 of ap) for(const c0 of ap){
      if((r0 === 6 && c0 === 6) || (r0 === 6 && c0 === size - 7) || (r0 === size - 7 && c0 === 6)) continue;
      for(let r = -2; r <= 2; r++) for(let c = -2; c <= 2; c++){
        const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
        m[r0 + r][c0 + c] = dark ? 1 : 0;
        used[r0 + r][c0 + c] = true;
      }
    }
    m[version * 4 + 9][8] = 1;      /* 暗模块 */
    used[version * 4 + 9][8] = true;
  }

  /* 格式信息区域预留(两处) */
  for(let i = 0; i < 9; i++){ used[8][i] = true; used[i][8] = true; }
  for(let i = 0; i < 8; i++){ used[8][size - 1 - i] = true; used[size - 1 - i][8] = true; }

  return { m, used, size };
}

/* ---- 数据码位放置(自右下起之字形,跳过第 6 列计时) ---- */
function placeData(base, codewords){
  const { m, used, size } = base;
  const bits = [];
  codewords.forEach(b => { for(let i = 7; i >= 0; i--) bits.push((b >> i) & 1); });
  let bi = 0, upward = true;
  for(let right = size - 1; right >= 1; right -= 2){
    if(right === 6) right = 5;
    for(let v = 0; v < size; v++){
      const row = upward ? size - 1 - v : v;
      for(let c = 0; c < 2; c++){
        const col = right - c;
        if(!used[row][col]){
          if(bi < bits.length){ m[row][col] = bits[bi]; bi++; }
          else m[row][col] = 0;   /* 余位 */
        }
      }
    }
    upward = !upward;
  }
  return base;
}

/* ---- 掩码 ---- */
const MASK_FN = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
];

/* ---- 罚分(与 ISO 18004 规则一致) ---- */
function penalty(m){
  const size = m.length;
  let p = 0;
  /* N1:连续同色游程 ≥5 */
  for(let r = 0; r < size; r++){
    let run = 1;
    for(let c = 1; c < size; c++){
      if(m[r][c] === m[r][c - 1]) run++;
      else { if(run >= 5) p += 3 + (run - 5); run = 1; }
    }
    if(run >= 5) p += 3 + (run - 5);
  }
  for(let c = 0; c < size; c++){
    let run = 1;
    for(let r = 1; r < size; r++){
      if(m[r][c] === m[r - 1][c]) run++;
      else { if(run >= 5) p += 3 + (run - 5); run = 1; }
    }
    if(run >= 5) p += 3 + (run - 5);
  }
  /* N2:2×2 同色块 */
  for(let r = 0; r < size - 1; r++) for(let c = 0; c < size - 1; c++){
    const v = m[r][c];
    if(m[r][c + 1] === v && m[r + 1][c] === v && m[r + 1][c + 1] === v) p += 3;
  }
  /* N3:1011101 且一侧有 4 白 */
  const P = [1, 0, 1, 1, 1, 0, 1];
  for(let r = 0; r < size; r++) for(let c = 0; c <= size - 7; c++){
    let ok = true;
    for(let i = 0; i < 7; i++) if(m[r][c + i] !== P[i]){ ok = false; break; }
    if(!ok) continue;
    const before = c >= 4 && m[r][c - 1] === 0 && m[r][c - 2] === 0 && m[r][c - 3] === 0 && m[r][c - 4] === 0;
    const after = c + 11 <= size - 1 && m[r][c + 7] === 0 && m[r][c + 8] === 0 && m[r][c + 9] === 0 && m[r][c + 10] === 0;
    if(before || after) p += 40;
  }
  for(let c = 0; c < size; c++) for(let r = 0; r <= size - 7; r++){
    let ok = true;
    for(let i = 0; i < 7; i++) if(m[r + i][c] !== P[i]){ ok = false; break; }
    if(!ok) continue;
    const before = r >= 4 && m[r - 1][c] === 0 && m[r - 2][c] === 0 && m[r - 3][c] === 0 && m[r - 4][c] === 0;
    const after = r + 11 <= size - 1 && m[r + 7][c] === 0 && m[r + 8][c] === 0 && m[r + 9][c] === 0 && m[r + 10][c] === 0;
    if(before || after) p += 40;
  }
  /* N4:深色占比偏离 */
  let dark = 0;
  for(let r = 0; r < size; r++) for(let c = 0; c < size; c++) dark += m[r][c];
  p += Math.floor(Math.abs(dark / (size * size) * 100 - 50) / 5) * 10;
  return p;
}

/* ---- 格式信息(5 位数据 + 10 位 BCH,XOR 0x5412) ---- */
function formatBits(level, mask){
  const d = (EC_BITS[level] << 3) | mask;
  let r = d << 10;
  for(let i = 14; i >= 10; i--){
    if(r & (1 << i)) r ^= 0x537 << (i - 10);
  }
  return ((d << 10) | r) ^ 0x5412;
}
function placeFormat(m, bits){
  const size = m.length;
  const get = i => (bits >> i) & 1;
  /* 副本 1(横臂,row 8):bit0–7 → (8, size-1..size-8);bit8 → (8,7);bit9–14 → (8,5..0) */
  for(let i = 0; i < 8; i++) m[8][size - 1 - i] = get(i);
  m[8][7] = get(8);
  for(let i = 9; i < 15; i++) m[8][15 - i - 1] = get(i);
  /* 副本 2(竖臂,col 8):bit0–5 → (0..5,8);bit6 → (7,8);bit7 → (8,8);bit8–14 → (size-7..size-1,8) */
  for(let i = 0; i < 6; i++) m[i][8] = get(i);
  m[7][8] = get(6);
  m[8][8] = get(7);
  for(let i = 8; i < 15; i++) m[size - 15 + i][8] = get(i);
}

/* ---- 编码主流程 → 模块矩阵(0 亮 / 1 暗) ---- */
function encode(url){
  const bytes = Array.from(Buffer.from(url, 'utf8'));
  let version = 0, level = 'M';
  outer:
  for(let v = 1; v <= 4; v++){
    for(const lv of ['M', 'L', 'Q', 'H']){
      const cfg = RS_BLOCK[v][lv];
      if(cfg.data * cfg.blocks >= bytes.length + 2){ version = v; level = lv; break outer; }
    }
  }
  if(!version) throw new Error('URL too long for v4 QR (max 78 bytes at level L)');
  const dataBytes = encodeData(bytes, version, level);
  const codewords = makeCodewords(dataBytes, version, level);
  const base = buildBase(version);
  placeData(base, codewords);

  /* 掩码评估:罚分最小(平局取更小掩码);all 保留全部 8 掩码矩阵供交叉验证 */
  let best = null, bestP = Infinity, bestM = null;
  const all = [];
  for(let mask = 0; mask < 8; mask++){
    const m = base.m.map(row => row.slice());
    const fn = MASK_FN[mask];
    for(let r = 0; r < base.size; r++) for(let c = 0; c < base.size; c++){
      if(!base.used[r][c] && fn(r, c)) m[r][c] ^= 1;
    }
    placeFormat(m, formatBits(level, mask));
    const p = penalty(m);
    all.push({ mask, matrix: m, penalty: p });
    if(p < bestP){ bestP = p; best = m; bestM = mask; }
  }
  return { matrix: best, mask: bestM, version, level, size: best.length, all };
}

/* ---- PNG 写入(zlib + CRC32,无任何依赖) ---- */
const CRC_TABLE = (() => {
  const t = [];
  for(let n = 0; n < 256; n++){
    let c = n;
    for(let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf){
  let c = 0xFFFFFFFF;
  for(let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data){
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function writePng(w, h, rgba){
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   /* bit depth */
  ihdr[9] = 6;   /* RGBA */
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for(let y = 0; y < h; y++){
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

/* ---- 渲染:模块矩阵 → RGBA 位图(4 模块静区,深色用品牌深蓝黑) ---- */
function renderPng(qr, scale){
  const quiet = 4;
  const px = (qr.size + quiet * 2) * scale;
  const rgba = Buffer.alloc(px * px * 4, 255);
  const DARK = [0x0b, 0x0b, 0x12];
  for(let r = 0; r < qr.size; r++) for(let c = 0; c < qr.size; c++){
    if(!qr.matrix[r][c]) continue;
    for(let y = (r + quiet) * scale; y < (r + quiet + 1) * scale; y++){
      for(let x = (c + quiet) * scale; x < (c + quiet + 1) * scale; x++){
        const o = (y * px + x) * 4;
        rgba[o] = DARK[0]; rgba[o + 1] = DARK[1]; rgba[o + 2] = DARK[2];
      }
    }
  }
  return writePng(px, px, rgba);
}

/* ---- 入口 ---- */
const DEFAULT_URL = 'https://github.com/gunnarcosmo1123-oss/proof-api-dashboard';
if(require.main === module){
  const url = process.argv[2] || DEFAULT_URL;
  const out = process.argv[3] || path.join(__dirname, '..', 'assets', 'qr.png');
  const qr = encode(url);
  const png = renderPng(qr, 12);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, png);
  console.log('QR v' + qr.version + '-' + qr.level + ' mask ' + qr.mask + ' · ' + url + ' → ' + out + ' (' + png.length + ' bytes)');
}

module.exports = { encode, renderPng, encodeData, makeCodewords, buildBase, placeData, placeFormat, formatBits, penalty, rsEncode, rsGenerator, RS_BLOCK, EC_BITS };
