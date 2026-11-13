'use strict';
/* ============================================================
   Proof API · 接口层(UI 与验证引擎的唯一边界)
   ============================================================
   真实 API 接入时:仅替换本文件(或新增 api-real.js 并保持同名
   导出),界面代码零改动。当前为本地演示引擎:

   真实计算(浏览器本地,离线可用):
     · SHA-256 文件指纹(精确重复通道)
     · pHash 64-bit 感知哈希(汉明距离 < 8 判相似)
     · 噪声谱方差(拉普拉斯算子 → 真实性启发式)
     · 色彩分布(HSV 六桶余弦相似 → 行动匹配启发式)
   演示计算(确定性,标注 demo):
     · 地理一致性(由指纹派生的演示分)
     · 综合分与判定(与数据集同一规则)

   返回结构(将来与真实 API 响应对齐):
   proofApiSubmit(payload) → Promise<{
     ok,
     submission: { id, submitter, action, city, time, device, gpsOk,
                   hash, phash, width, height, size, mime, status, dup },
     verification: { score, subs:{auth,action,loc}, verdict,
                     flags:[{code, level, msgKey, vars}] },
     receipt: { issuedAt }
   }>
   ============================================================ */

/* ---- 工具:十六进制 ---- */
function bufToHex(buf){
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function sha256(arrayBuffer){
  if(window.crypto && crypto.subtle && crypto.subtle.digest){
    try {
      const d = await crypto.subtle.digest('SHA-256', arrayBuffer);
      return bufToHex(d);
    } catch(e) { /* 回退到演示指纹 */ }
  }
  /* 非安全上下文回退:FNV 类演示指纹(带 demo: 前缀标记) */
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  const u8 = new Uint8Array(arrayBuffer);
  for(let i = 0; i < u8.length; i++){ h1 = Math.imul(h1 ^ u8[i], 16777619) >>> 0; h2 = (h2 + u8[i] * (i + 1)) >>> 0; }
  return 'demo:' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/* ---- 图像加载 ---- */
function loadImage(url){
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('image decode failed'));
    img.src = url;
  });
}
function drawToCanvas(img, w, h){
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  return c;
}

/* ---- pHash 64-bit(8×8 灰度 DCT 简化:均值阈值) ---- */
function phash(img){
  const c = drawToCanvas(img, 8, 8);
  const d = c.getContext('2d').getImageData(0, 0, 8, 8).data;
  const g = [];
  let sum = 0;
  for(let i = 0; i < 64; i++){
    const v = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    g.push(v); sum += v;
  }
  const avg = sum / 64;
  let bits = '';
  for(const v of g) bits += v >= avg ? '1' : '0';
  /* 转 16 位 hex */
  let hex = '';
  for(let i = 0; i < 64; i += 4) hex += parseInt(bits.substr(i, 4), 2).toString(16);
  return { hex, bits };
}
function hamming(a, b){
  let hd = 0;
  for(let i = 0; i < Math.min(a.length, b.length); i++) if(a[i] !== b[i]) hd++;
  return hd;
}

/* ---- 噪声谱方差(3×3 拉普拉斯) ---- */
function noiseVariance(img){
  const c = drawToCanvas(img, 64, 64);
  const d = c.getContext('2d').getImageData(0, 0, 64, 64).data;
  const w = 64, h = 64;
  const g = new Float32Array(w * h);
  for(let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  const lap = new Float32Array(w * h);
  let sum = 0, sum2 = 0, n = 0;
  for(let y = 1; y < h - 1; y++){
    for(let x = 1; x < w - 1; x++){
      const v = 4 * g[y * w + x] - g[y * w + x - 1] - g[y * w + x + 1] - g[(y - 1) * w + x] - g[(y + 1) * w + x];
      lap[y * w + x] = v;
      sum += v; sum2 += v * v; n++;
    }
  }
  const mean = sum / n;
  return Math.max(0, sum2 / n - mean * mean); /* 方差 */
}

/* ---- 色彩分布:HSV 六桶(红/黄/绿/青/蓝/品红)+ 无彩度桶 ---- */
function colorProfile(img){
  const c = drawToCanvas(img, 48, 48);
  const d = c.getContext('2d').getImageData(0, 0, 48, 48).data;
  const buckets = [0, 0, 0, 0, 0, 0, 0]; /* R Y G C B M gray */
  let n = 0;
  for(let i = 0; i < d.length; i += 4){
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const dl = mx - mn;
    let hue = 0;
    if(dl > 0){
      if(mx === r) hue = ((g - b) / dl) % 6;
      else if(mx === g) hue = (b - r) / dl + 2;
      else hue = (r - g) / dl + 4;
      hue = ((hue * 60) + 360) % 360;
    }
    const sat = mx === 0 ? 0 : dl / mx;
    if(sat < 0.12 || mx < 0.12) buckets[6]++;
    else buckets[Math.floor(((hue + 15) % 360) / 60)]++;
    n++;
  }
  return buckets.map(v => v / n);
}
/* 各行动类型的期望色彩分布(演示模型的先验) */
const ACTION_PROFILE = {
  afforest: [0.03, 0.06, 0.38, 0.18, 0.10, 0.03, 0.22],
  solar:    [0.06, 0.10, 0.10, 0.08, 0.30, 0.06, 0.30],
  wetland:  [0.05, 0.07, 0.28, 0.16, 0.22, 0.05, 0.17],
  ev:       [0.08, 0.08, 0.12, 0.10, 0.22, 0.08, 0.32],
  cleanup:  [0.06, 0.18, 0.14, 0.14, 0.22, 0.06, 0.20],
  retrofit: [0.08, 0.10, 0.10, 0.08, 0.12, 0.08, 0.44]
};
function cosine(a, b){
  let dot = 0, na = 0, nb = 0;
  for(let i = 0; i < a.length; i++){ dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if(!na || !nb) return 0;
  return dot / Math.sqrt(na * nb);
}

/* ---- 会话重复注册表(含本地持久化) ---- */
const REG_KEY = 'proof-session';
function loadRegistry(){
  try {
    const raw = localStorage.getItem(REG_KEY);
    if(!raw) return { subs: [], hashes: [], phashes: [] };
    const data = JSON.parse(raw);
    return {
      subs: (data.subs || []).map(r => {
        r.submission.time = new Date(r.submission.time);
        return r;
      }),
      hashes: data.hashes || [],
      phashes: (data.phashes || []).map(p => ({ id: p.id, bits: p.bits }))
    };
  } catch(e) { return { subs: [], hashes: [], phashes: [] }; }
}
function saveRegistry(){
  try {
    const data = {
      subs: REG.subs.map(r => {
        const s = Object.assign({}, r.submission, { time: r.submission.time.getTime() });
        return { submission: s, verification: r.verification, receipt: r.receipt };
      }),
      hashes: REG.hashes,
      phashes: REG.phashes.map(p => ({ id: p.id, bits: p.bits }))
    };
    localStorage.setItem(REG_KEY, JSON.stringify(data));
  } catch(e) {}
}
const REG = loadRegistry();

/* 会话提交并入演示数据集(队列/KPI/智能体 全部实时联动) */
function registerIntoDataset(result){
  const s = result.submission;
  if(PROOF.byId(s.id)) return;
  PROOF.submissions.unshift(s);
}

/* ---- 主入口:提交照片验证 ---- */
async function proofApiSubmit(payload){
  /* payload: { file: File, action: 'solar'|…, city: 0-8, submitter: '' } */
  const file = payload.file;
  const buf = await file.arrayBuffer();
  const url = URL.createObjectURL(file);
  let img;
  try { img = await loadImage(url); }
  finally { URL.revokeObjectURL(url); }

  /* 1) 真实指纹 */
  const hash = await sha256(buf);
  const ph = phash(img);
  const nv = noiseVariance(img);
  const prof = colorProfile(img);

  /* 2) 重复检测(真实) */
  let dup = null;
  const exactHit = REG.hashes.find(h => h.hash === hash);
  let phHit = null, phHd = 99;
  REG.phashes.forEach(p => {
    const hd = hamming(ph.bits, p.bits);
    if(hd < phHd){ phHd = hd; phHit = p; }
  });
  if(exactHit) dup = { sim: 1, base: exactHit.id, type: 'exact' };
  else if(phHit && phHd <= 8) dup = { sim: Math.max(0.5, 1 - phHd / 64), base: phHit.id, type: 'perceptual' };

  /* 3) 真实性启发式(真实计算 → 演示映射) */
  const auth = Math.round(Math.min(98, Math.max(40, 55 + nv * 3.2)));
  /* 4) 行动匹配启发式(真实计算 → 演示映射) */
  const expected = ACTION_PROFILE[payload.action] || ACTION_PROFILE.solar;
  const cos = cosine(prof, expected);
  const actionScore = Math.round(Math.min(98, Math.max(30, 40 + cos * 58)));
  /* 5) 地理一致性(演示:由指纹确定性派生) */
  const hSeed = parseInt(hash.slice(0, 8), 16) || 1;
  const loc = 62 + (hSeed % 35);

  const score = Math.round(0.4 * auth + 0.35 * actionScore + 0.25 * loc);
  const flags = [];
  if(dup) flags.push(dup.type === 'exact'
    ? { code: 'DUP_EXACT', level: 'flagged', msgKey: 'submit.flag.DUP_EXACT', vars: {} }
    : { code: 'DUP_PHASH', level: 'flagged', msgKey: 'submit.flag.DUP_PHASH', vars: { base: dup.base, hd: phHd } });
  if(nv < 1.6 && !dup) flags.push({ code: 'AUTH_SMOOTH', level: 'serious', msgKey: 'submit.flag.AUTH_SMOOTH', vars: {} });
  if(cos < 0.55 && !dup) flags.push({ code: 'ACTION_MISMATCH', level: 'serious', msgKey: 'submit.flag.ACTION_MISMATCH', vars: {} });
  if(loc < 70 && !dup) flags.push({ code: 'GEO_LOW', level: 'warning', msgKey: 'submit.flag.GEO_LOW', vars: {} });

  /* 判定规则:重复 → flagged;低分 → rejected;有任何红旗 → 人工复核;
     与数据集规则一致:红旗永远阻断"自动通过" */
  let verdict;
  if(dup) verdict = 'flagged';
  else if(score < 60) verdict = 'rejected';
  else if(flags.length) verdict = 'pending';
  else if(score >= 85) verdict = 'verified';
  else verdict = 'pending';

  /* 5b) 上传照片缩略图(240px JPEG dataURL,队列/抽屉/重复对比显示真实照片) */
  let thumb = null;
  try {
    thumb = drawToCanvas(img, 240, 150).toDataURL('image/jpeg', 0.72);
  } catch(e) { /* 缩略图失败不影响提交 */ }

  /* 6) 组装提交对象(与数据集同构) */
  const nextId = (() => {
    let mx = 1040;
    PROOF.submissions.forEach(s => { const n = parseInt(s.id.slice(3), 10); if(n > mx) mx = n; });
    return 'PA-' + (mx + 1);
  })();
  const groupId = dup ? (() => {
    let mx = 0;
    PROOF.submissions.forEach(s => { if(s.dup){ const n = parseInt(s.dup.group.slice(2), 10); if(n > mx) mx = n; } });
    return 'G-' + String(mx + 1).padStart(2, '0');
  })() : null;
  const submission = {
    id: nextId,
    submitter: payload.submitter || t('submit.me'),
    action: payload.action,
    city: payload.city,
    time: new Date(),
    subs: { auth, action: actionScore, loc },
    score,
    device: 'Web client',
    gpsOk: false,
    hash: hash.slice(0, 16),
    phash: ph.hex,
    width: img.naturalWidth, height: img.naturalHeight,
    size: file.size, mime: file.type || 'image/*',
    thumb,
    dup: dup ? Object.assign({ group: groupId }, dup) : null,
    status: verdict
  };
  const result = {
    ok: true,
    submission,
    verification: { score, subs: { auth, action: actionScore, loc }, verdict, flags },
    receipt: { issuedAt: new Date() }
  };

  /* 7) 登记:会话注册表 + 演示数据集 */
  REG.subs.push(result);
  REG.hashes.push({ id: submission.id, hash });
  REG.phashes.push({ id: submission.id, bits: ph.bits });
  saveRegistry();
  registerIntoDataset(result);
  return result;
}

/* 生成一张合成示例照片(演示用,canvas 绘制 → File) */
function makeSamplePhoto(action){
  return new Promise((res, rej) => {
    const c = document.createElement('canvas');
    c.width = 480; c.height = 300;
    const g = c.getContext('2d');
    const rnd = (() => { let s = 7; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; })();
    const skyH = action === 'afforest' || action === 'wetland' ? 150 : 210;
    const sky = g.createLinearGradient(0, 0, 0, skyH);
    sky.addColorStop(0, '#b9d9f2'); sky.addColorStop(1, '#eef7ff');
    g.fillStyle = sky; g.fillRect(0, 0, 480, skyH);
    g.fillStyle = '#f2d98c';
    g.beginPath(); g.arc(70 + rnd() * 340, 40 + rnd() * 60, 22, 0, Math.PI * 2); g.fill();
    const ground = (action === 'afforest' || action === 'wetland') ? '#4f8f3f' : '#9aa78b';
    g.fillStyle = ground; g.fillRect(0, skyH, 480, 300 - skyH);
    if(action === 'afforest' || action === 'wetland'){
      for(let i = 0; i < 18; i++){
        const x = 15 + rnd() * 450, h = 46 + rnd() * 96;
        g.fillStyle = rnd() > 0.5 ? '#2f6b34' : '#245428';
        g.beginPath(); g.moveTo(x, skyH - h + 20); g.lineTo(x - 18, skyH + 20); g.lineTo(x + 18, skyH + 20); g.closePath(); g.fill();
        g.fillStyle = '#6b4a2f'; g.fillRect(x - 3, skyH + 14, 6, 8);
      }
      if(action === 'wetland'){
        g.fillStyle = '#5a87a5'; g.fillRect(0, skyH - 20, 480, 20);
        g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2;
        for(let i = 0; i < 5; i++){ g.beginPath(); const y = skyH - 15 + rnd() * 8; g.moveTo(20, y); g.quadraticCurveTo(140, y - 6, 240, y); g.quadraticCurveTo(340, y + 6, 460, y); g.stroke(); }
      }
    } else if(action === 'solar'){
      g.fillStyle = '#8d7b6a'; g.fillRect(120, 190, 240, 30);
      g.fillStyle = '#1d3557'; g.fillRect(140, 130, 200, 60);
      g.strokeStyle = '#6c7a89'; g.lineWidth = 2;
      for(let i = 1; i < 3; i++){ g.beginPath(); g.moveTo(140 + i * 66, 130); g.lineTo(140 + i * 66, 190); g.stroke(); }
      for(let i = 1; i < 3; i++){ g.beginPath(); g.moveTo(140, 130 + i * 20); g.lineTo(340, 130 + i * 20); g.stroke(); }
    } else if(action === 'cleanup'){
      g.fillStyle = '#d9c39a'; g.fillRect(0, 200, 480, 20);
      g.fillStyle = '#3f6d9e'; g.fillRect(180, 190, 44, 50); g.fillStyle = '#5b87b5'; g.fillRect(172, 178, 60, 16);
      for(let i = 0; i < 14; i++){ g.fillStyle = '#8a7a5a'; g.beginPath(); g.arc(20 + rnd() * 440, 210 + rnd() * 14, 2 + rnd() * 3, 0, Math.PI * 2); g.fill(); }
    } else {
      g.fillStyle = '#c7cdd4'; g.fillRect(120, 90, 240, 120);
      for(let i = 0; i < 4; i++) for(let j = 0; j < 3; j++){
        g.fillStyle = rnd() > 0.7 ? '#f6d57c' : '#7fb2d6';
        g.fillRect(140 + j * 70, 108 + i * 26, 40, 16);
      }
      if(action === 'ev'){ g.fillStyle = '#2a78d6'; g.fillRect(150, 240, 120, 34); g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(185, 274, 14, 0, Math.PI * 2); g.arc(285, 274, 14, 0, Math.PI * 2); g.fill(); }
    }
    c.toBlob(b => {
      if(!b){ rej(new Error('toBlob failed')); return; }
      res(new File([b], 'sample-' + action + '.png', { type: 'image/png' }));
    }, 'image/png');
  });
}

/* 恢复会话提交(页面加载时并入数据集) */
function restoreSession(){
  REG.subs.forEach(r => registerIntoDataset(r));
}
