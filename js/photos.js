'use strict';
/* ============================================================
   Proof API · 确定性 SVG 照片场景生成器(零依赖)
   同一提交 id 永远渲染同一张"照片";重复组成员渲染原图场景
   并叠加轻微缩放/位移/滤镜(模拟裁剪后重传),视觉上可信。
   ============================================================ */
function strHash(s){
  let h = 2166136261;
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function hr(n){
  let seed = n || 1;
  return function(){
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  };
}

/* 每类行动的"照片"场景内层 SVG(确定性) */
const SCENE = {
  afforest(r, uid){
    let s = '';
    const n = 3 + Math.floor(r() * 3);
    for(let i = 0; i < n; i++){
      const x = 18 + r() * 200, h = 34 + r() * 46, w = 15 + r() * 10;
      const c = r() > 0.5 ? '#2f6b34' : '#245428';
      s += `<rect x="${(x - 2.5).toFixed(1)}" y="${(110 - h + 46).toFixed(1)}" width="5" height="${(h - 46).toFixed(1)}" fill="#6b4a2f"/>`;
      s += `<polygon points="${x.toFixed(1)},${(110 - h).toFixed(1)} ${(x - w).toFixed(1)},${(110 - h + 46).toFixed(1)} ${(x + w).toFixed(1)},${(110 - h + 46).toFixed(1)}" fill="${c}"/>`;
      s += `<polygon points="${x.toFixed(1)},${(110 - h - 14).toFixed(1)} ${(x - w * 0.72).toFixed(1)},${(110 - h + 20).toFixed(1)} ${(x + w * 0.72).toFixed(1)},${(110 - h + 20).toFixed(1)}" fill="${c}"/>`;
    }
    return s;
  },
  solar(r, uid){
    const x = 52 + r() * 30, y = 64 + r() * 12;
    let s = `<polygon points="${(x - 84).toFixed(1)},${(y + 52).toFixed(1)} ${(x + 84).toFixed(1)},${(y + 52).toFixed(1)} ${(x + 62).toFixed(1)},${(y + 18).toFixed(1)} ${(x - 62).toFixed(1)},${(y + 18).toFixed(1)}" fill="#8d7b6a"/>`;
    s += `<polygon points="${(x - 62).toFixed(1)},${(y + 18).toFixed(1)} ${(x + 62).toFixed(1)},${(y + 18).toFixed(1)} ${(x + 62).toFixed(1)},${(y - 26).toFixed(1)} ${(x - 62).toFixed(1)},${(y - 26).toFixed(1)}" fill="#1d3557" stroke="#6c7a89" stroke-width="1.5"/>`;
    for(let i = 1; i < 3; i++) s += `<line x1="${(x - 62 + 41 * i).toFixed(1)}" y1="${(y + 18).toFixed(1)}" x2="${(x - 62 + 41 * i).toFixed(1)}" y2="${(y - 26).toFixed(1)}" stroke="#6c7a89" stroke-width="1.5"/>`;
    for(let i = 1; i < 4; i++) s += `<line x1="${(x - 62).toFixed(1)}" y1="${(y + 18 - 11 * i).toFixed(1)}" x2="${(x + 62).toFixed(1)}" y2="${(y + 18 - 11 * i).toFixed(1)}" stroke="#6c7a89" stroke-width="1.5"/>`;
    s += `<line x1="${x.toFixed(1)}" y1="${(y - 26).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(y - 52).toFixed(1)}" stroke="#a9b4bd" stroke-width="2.5" stroke-dasharray="4 3"/>`;
    return s;
  },
  wetland(r, uid){
    let s = '';
    const rx = 20 + r() * 140;
    s += `<rect x="${rx.toFixed(1)}" y="76" width="52" height="34" rx="4" fill="#8d7b6a" opacity="0.85"/>`;
    for(let i = 0; i < 8; i++){
      const x = 8 + r() * 224, h = 26 + r() * 34;
      s += `<line x1="${x.toFixed(1)}" y1="112" x2="${x.toFixed(1)}" y2="${(112 - h).toFixed(1)}" stroke="#5b7a45" stroke-width="2.5"/>`;
      s += `<ellipse cx="${x.toFixed(1)}" cy="${(112 - h).toFixed(1)}" rx="3.4" ry="8" fill="#7a5b3a"/>`;
    }
    for(let i = 0; i < 3; i++){
      const wy = 82 + r() * 26;
      s += `<path d="M ${(8 + r() * 120).toFixed(1)} ${wy.toFixed(1)} q 16 4 32 0 q 16 -4 32 0 q 16 4 32 0" stroke="rgba(255,255,255,0.5)" stroke-width="1.6" fill="none"/>`;
    }
    return s;
  },
  ev(r, uid){
    const x = 78 + r() * 70, y = 96;
    const body = ['#2a78d6', '#2f9e6e', '#e34948', '#52514e'][Math.floor(r() * 4)];
    let s = `<rect x="${(x - 52).toFixed(1)}" y="${(y - 26).toFixed(1)}" width="96" height="26" rx="9" fill="${body}"/>`;
    s += `<rect x="${(x - 34).toFixed(1)}" y="${(y - 42).toFixed(1)}" width="44" height="20" rx="6" fill="#dbe7f2" opacity="0.9"/>`;
    s += `<circle cx="${(x - 28).toFixed(1)}" cy="${y + 3}" r="8.5" fill="#1a1a1a"/><circle cx="${(x - 28).toFixed(1)}" cy="${y + 3}" r="3.6" fill="#c9ccd1"/>`;
    s += `<circle cx="${(x + 30).toFixed(1)}" cy="${y + 3}" r="8.5" fill="#1a1a1a"/><circle cx="${(x + 30).toFixed(1)}" cy="${y + 3}" r="3.6" fill="#c9ccd1"/>`;
    s += `<rect x="${(x + 62).toFixed(1)}" y="${(y - 30).toFixed(1)}" width="7" height="56" fill="#7a848d"/><rect x="${(x + 56).toFixed(1)}" y="${(y - 38).toFixed(1)}" width="19" height="10" rx="2.5" fill="#3f6d9e"/>`;
    s += `<path d="M ${(x + 65.5).toFixed(1)} ${(y - 12).toFixed(1)} L ${(x + 52).toFixed(1)} ${(y + 6).toFixed(1)}" stroke="#7a848d" stroke-width="2.5" fill="none"/>`;
    s += `<polygon points="${(x + 65.5).toFixed(1)},${(y - 24).toFixed(1)} ${(x + 60.5).toFixed(1)},${(y - 15).toFixed(1)} ${(x + 70.5).toFixed(1)},${(y - 15).toFixed(1)}" fill="#f6c244"/>`;
    return s;
  },
  cleanup(r, uid){
    let s = `<rect x="66" y="96" width="24" height="34" rx="3" fill="#3f6d9e"/><rect x="62" y="90" width="32" height="8" rx="3" fill="#5b87b5"/>`;
    s += `<rect x="30" y="98" width="18" height="28" rx="3" fill="#5f8a4e"/><rect x="27" y="92" width="24" height="7" rx="3" fill="#7aa368"/>`;
    for(let i = 0; i < 5; i++){
      const x = 20 + r() * 200, y = 100 + r() * 12;
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1.6 + r() * 2).toFixed(1)}" fill="#8a7a5a"/>`;
    }
    s += `<path d="M 10 118 q 24 -6 48 0 q 24 6 48 0 q 24 -6 48 0 q 24 6 48 0 q 24 -6 48 0" stroke="rgba(255,255,255,0.65)" stroke-width="2" fill="none"/>`;
    return s;
  },
  retrofit(r, uid){
    let s = '';
    for(let i = 0; i < 4; i++){
      const x = 40 + r() * 130, y = 52 + r() * 20, h = 60 + r() * 22;
      s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(34 + r() * 16).toFixed(1)}" height="${(112 - y).toFixed(1)}" fill="${r() > 0.5 ? '#c7cdd4' : '#b9bfc6'}"/>`;
      for(let r2 = 0; r2 < 2; r2++) for(let c2 = 0; c2 < 3; c2++){
        s += `<rect x="${(x + 6 + c2 * 13).toFixed(1)}" y="${(y + 8 + r2 * 18).toFixed(1)}" width="7" height="10" fill="${r() > 0.75 ? '#f6d57c' : '#7fb2d6'}"/>`;
      }
    }
    s += `<polygon points="30,52 60,30 210,30 240,52" fill="#8d7b6a"/>`;
    s += `<rect x="36" y="96" width="16" height="16" fill="#6b4a2f"/><rect x="188" y="100" width="16" height="12" fill="#6b4a2f"/>`;
    return s;
  }
};

function sceneInner(action, r, hour, uid){
  let sky, sunC;
  if(hour < 8){ sky = ['#ffe3b3', '#f5b98a']; sunC = '#ff9d45'; }
  else if(hour < 16){ sky = ['#b9d9f2', '#eef7ff']; sunC = '#f2d98c'; }
  else { sky = ['#f6c07a', '#e79a6e']; sunC = '#ff9d45'; }
  const sunX = 30 + r() * 180, sunY = 22 + r() * 26;
  let s = `<defs>
    <linearGradient id="sky${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>
    <linearGradient id="gr${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa78b"/><stop offset="1" stop-color="#7c8a6e"/></linearGradient>
    <radialGradient id="vg${uid}" cx="0.5" cy="0.5" r="0.75"><stop offset="0.62" stop-color="rgba(0,0,0,0)"/><stop offset="1" stop-color="rgba(0,0,0,0.22)"/></radialGradient>
  </defs>`;
  s += `<rect width="240" height="112" fill="url(#sky${uid})"/>`;
  s += `<circle cx="${sunX.toFixed(1)}" cy="${sunY.toFixed(1)}" r="13" fill="${sunC}" opacity="0.9"/><circle cx="${sunX.toFixed(1)}" cy="${sunY.toFixed(1)}" r="20" fill="${sunC}" opacity="0.25"/>`;
  if(r() > 0.35){
    const cx = 40 + r() * 150, cy = 30 + r() * 40;
    s += `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(20 + r() * 14).toFixed(1)}" ry="9" fill="#ffffff" opacity="0.75"/><ellipse cx="${(cx + 18).toFixed(1)}" cy="${(cy + 5).toFixed(1)}" rx="${(14 + r() * 10).toFixed(1)}" ry="7" fill="#ffffff" opacity="0.6"/>`;
  }
  s += `<rect y="112" width="240" height="38" fill="url(#gr${uid})"/>`;
  if(action === 'wetland') s += `<rect y="96" width="240" height="16" fill="#5a87a5"/>`;
  if(action === 'cleanup') s += `<rect y="110" width="240" height="14" fill="#d9c39a"/>`;
  s += SCENE[action](r, uid);
  s += `<rect width="240" height="150" fill="url(#vg${uid})"/>`;
  return s;
}

/* ---- 照片渲染入口:真实照片(上传缩略图 / 本地素材)优先,SVG 场景兜底 ---- */
const PHOTO_V = '20261113c';
function photoHtml(sub){
  if(sub.thumb) return '<img src="' + sub.thumb + '" alt="submission photo" loading="lazy">';
  if(sub.photo) return '<img src="' + sub.photo + '?v=' + PHOTO_V + '" alt="submission photo" loading="lazy">';
  return photoSvg(sub);
}

/* 对外入口:生成某提交的"照片"(内联 SVG,无真实素材时的兜底) */
function photoSvg(sub){
  const base = sub.dup ? PROOF.byId(sub.dup.base) : sub;
  const r = hr(strHash(base.id + base.action));
  const uid = (sub.id).replace(/[^A-Za-z0-9]/g, '');
  let inner = sceneInner(base.action, r, base.time.getHours(), uid);
  if(sub.dup){
    /* 模拟裁剪 / 滤镜变体:轻微缩放位移 + 白色滤镜层 */
    inner = `<g transform="translate(-3.5,1.5) scale(1.06)">${inner}</g><rect width="240" height="150" fill="#ffffff" opacity="0.05"/>`;
  }
  return '<svg viewBox="0 0 240 150" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style="display:block" role="img" aria-label="submission photo">' + inner + '</svg>';
}
