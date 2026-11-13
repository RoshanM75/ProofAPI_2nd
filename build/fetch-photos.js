'use strict';
/* ============================================================
   Proof API · 真实照片素材获取(Wikimedia Commons)
   只接受可自由使用的许可:Public domain / CC0 / CC BY / CC BY-SA
   下载 800px 缩略图到 assets/photos/,并生成出处清单
   manifest.json → 用于 README 致谢与数据模型引用
   用法: node build/fetch-photos.js [--list]
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'photos');
const CURL = ['curl', '-sS', '-m', '60', '-A', 'ProofAPI-Prototype/0.1 (educational demo; contact: demo@example.com)'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ACTIONS = [
  { key: 'afforest', terms: ['tree planting volunteers', 'reforestation planting'], kw: /tree|plant|seedling|sapling|reforest/i },
  { key: 'solar',    terms: ['rooftop solar panels', 'photovoltaic roof'], kw: /solar|panel|photovoltaic|roof/i },
  { key: 'wetland',  terms: ['wetland restoration', 'mangrove forest'], kw: /wetland|mangrove|marsh|reed/i },
  { key: 'ev',       terms: ['electric vehicle charging station', 'ev charger'], kw: /electric|charging|charger|vehicle|ev/i },
  { key: 'cleanup',  terms: ['beach cleanup volunteers', 'litter collection beach'], kw: /beach|cleanup|clean-up|litter|trash|rubbish/i },
  { key: 'retrofit', terms: ['building insulation installation', 'energy retrofit building'], kw: /insulation|retrofit|facade|renovation|building/i }
];

const LICENSE_OK = /^(public domain|cc0|cc by|cc by-sa)/i;
const LICENSE_BAD = /(nc|nd|fair use|noncommercial|all rights reserved)/i;

/* 每个行动类型从候选列表中挑选的下标(--list 输出中的人工复核结果) */
const PICKS = {
  afforest: [1, 2],  /* 1=USFWS 植树志愿者 2=空军植树活动 */
  solar:    [2, 3],  /* 屋顶光伏:Caldicot 1600px + Gwehelog 964px(走缩略图通道,直链被限流) */
  wetland:  [0, 1],  /* 澳大利亚湿地修复 + 得州湿地保护计划 */
  ev:       [0, 2],  /* 斯图加特充电站 + 比萨充电站 */
  cleanup:  [0, 1],  /* 奥林匹克国家公园净滩 + 俄勒冈净滩 */
  retrofit: [1, 3]   /* CSIRO 保温棉安装 + 海军隔热与屋顶板安装 */
};

function stripHtml(s){
  return (s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
}

async function api(params){
  const q = new URLSearchParams(Object.assign({ format: 'json' }, params));
  const qs = q.toString().replace(/\+/g, '%20'); /* Commons 要求空格用 %20 */
  const url = 'https://commons.wikimedia.org/w/api.php?' + qs;
  let lastErr = null;
  for(let attempt = 1; attempt <= 3; attempt++){
    try {
      const out = execFileSync(CURL[0], CURL.slice(1).concat([url]), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      return JSON.parse(out);
    } catch(e){
      lastErr = e;
      console.log('  (retry ' + attempt + '/3 after API timeout…)');
      await sleep(4000 * attempt);
    }
  }
  throw lastErr;
}

async function searchCandidates(action){
  for(const term of action.terms){
    const data = await api({
      action: 'query', generator: 'search', gsrsearch: term,
      gsrnamespace: '6', gsrlimit: '10', prop: 'imageinfo',
      iiprop: 'url|extmetadata|mime|size', iiurlwidth: '800'
    });
    const pages = data.query && data.query.pages ? Object.values(data.query.pages) : [];
    const good = [];
    for(const p of pages){
      const ii = p.imageinfo && p.imageinfo[0];
      if(!ii || !ii.thumburl || !ii.mime || !ii.mime.startsWith('image/')) continue;
      const em = ii.extmetadata || {};
      const lic = stripHtml(em.LicenseShortName && em.LicenseShortName.value);
      if(!LICENSE_OK.test(lic) || LICENSE_BAD.test(lic)) continue;
      if(!action.kw.test(p.title)) continue;
      if(ii.width < 500) continue;
      good.push({
        title: p.title.replace(/^File:/, ''),
        thumburl: ii.thumburl,
        page: ii.descriptionurl,
        artist: stripHtml(em.Artist && em.Artist.value) || 'unknown',
        license: lic,
        licUrl: (em.LicenseUrl && em.LicenseUrl.value) || '',
        width: ii.width, height: ii.height
      });
    }
    if(good.length >= 2) return good.slice(0, 6);
  }
  return [];
}

async function download(url, out){
  let lastErr = null;
  for(let attempt = 1; attempt <= 3; attempt++){
    try {
      execFileSync(CURL[0], CURL.slice(1).concat(['-f', '-o', out, url]), { stdio: 'inherit' });
      const head = fs.readFileSync(out).slice(0, 3);
      if(head[0] !== 0xff || head[1] !== 0xd8) throw new Error('not a JPEG (rate-limit page?)');
      return fs.statSync(out).size;
    } catch(e){
      lastErr = e;
      console.log('  (download retry ' + attempt + '/3: ' + e.message + ')');
      await sleep(5000 * attempt);
    }
  }
  throw lastErr;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = { fetched: new Date().toISOString(), photos: [] };
  const listOnly = process.argv.includes('--list');

  for(const action of ACTIONS){
    console.log('\n=== ' + action.key + ' ===');
    try {
      const cands = await searchCandidates(action);
      cands.forEach((c, i) => {
        console.log('  [' + i + '] ' + c.title + '  — ' + c.license + ' — ' + c.artist + ' — ' + c.width + 'px');
      });
      if(listOnly || !cands.length) continue;
      const idx = PICKS[action.key] || [0, 1];
      const picks = idx.map(i => cands[i]).filter(Boolean);
      for(let i = 0; i < picks.length; i++){
        const c = picks[i];
        const name = action.key + '-0' + (i + 1) + '.jpg';
        const out = path.join(OUT_DIR, name);
        /* 已存在且为合法 JPEG → 跳过(幂等重跑) */
        if(fs.existsSync(out)){
          const head = fs.readFileSync(out).slice(0, 3);
          if(head[0] === 0xff && head[1] === 0xd8){
            console.log('  SKIP ' + name + ' (already valid)');
            manifest.photos.push({ file: 'assets/photos/' + name, action: action.key, ...c });
            continue;
          }
        }
        const bytes = await download(c.thumburl, out);
        console.log('  DOWNLOADED ' + name + ' (' + Math.round(bytes / 1024) + ' KB)');
        manifest.photos.push({ file: 'assets/photos/' + name, action: action.key, ...c });
      }
    } catch(e){
      console.log('  ACTION FAILED: ' + e.message);
    }
    await sleep(1500); /* 对 API 保持礼貌 */
  }
  fs.writeFileSync(path.join(__dirname, 'photos-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('\nmanifest → build/photos-manifest.json (' + manifest.photos.length + ' photos)');
})().catch(e => { console.error('FETCH FAILED:', e.message); process.exit(1); });
