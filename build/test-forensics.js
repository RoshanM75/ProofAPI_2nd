'use strict';
/* ============================================================
   取证与自定义组织单元测试(零依赖,node 直跑):
   · parseExif:合成 JPEG(APP1/Exif + TIFF II + IFD0/ExifIFD/GPSIFD)
   · scanProvenance:c2pa / XMP 字节流检测
   · haversineKm / locFromKm
   · data.js:custom:<名称> 组织的聚合(org / orgRows / scopeSubs)
   ============================================================ */
const fs = require('fs');
const path = require('path');

/* ---- 加载 api.js(顶层无 DOM 依赖) ---- */
const apiSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'api.js'), 'utf8');
const apiCtx = { console };
const vm = require('vm');
vm.createContext(apiCtx);
vm.runInContext(apiSrc, apiCtx, { filename: 'api.js' });

/* ---- 合成 TIFF/JPEG(绝对偏移布局,小端/大端,各区不重叠) ----
   头(8) · IFD0@8(3 项,42B→0x32) · Make@0x40 · ExifIFD@0x50(18B)
   · GPSIFD@0x70(54B→0xA6) · DateTimeOriginal@0xB0(20B)
   · Lat 3×RATIONAL@0xD0(24B) · Lon 3×RATIONAL@0xE8(24B) → 总长 0x100 */
function tiff(le){
  const b = Buffer.alloc(0x100);
  const w16 = (off, v) => le ? b.writeUInt16LE(v, off) : b.writeUInt16BE(v, off);
  const w32 = (off, v) => le ? b.writeUInt32LE(v, off) : b.writeUInt32BE(v, off);
  b[0] = le ? 0x49 : 0x4D; b[1] = le ? 0x49 : 0x4D;   /* II / MM */
  w16(2, 42); w32(4, 8);                              /* magic, IFD0 @ 8 */
  w16(8, 3);                                          /* 3 项 */
  /* Make 0x010F ASCII 6B @ 0x40 */
  w16(10, 0x010F); w16(12, 2); w32(14, 6); w32(18, 0x40);
  /* ExifIFD 0x8769 LONG 1 → 0x50 */
  w16(22, 0x8769); w16(24, 4); w32(26, 1); w32(30, 0x50);
  /* GPSIFD 0x8825 LONG 1 → 0x70 */
  w16(34, 0x8825); w16(36, 4); w32(38, 1); w32(42, 0x70);
  w32(46, 0);                                         /* next IFD */
  b.write('Nikon', 0x40, 'ascii');
  /* ExifIFD:DateTimeOriginal 0x9003 ASCII 20B @ 0xB0 */
  w16(0x50, 1);
  w16(0x52, 0x9003); w16(0x54, 2); w32(0x56, 20); w32(0x5A, 0xB0);
  w32(0x5E, 0);
  b.write('2026:11:10 09:30:00', 0xB0, 'ascii');
  /* GPSIFD:LatRef/Lat/LonRef/Lon;2B 的 Ref 值内联在条目 value 字段 */
  w16(0x70, 4);
  w16(0x72, 0x0001); w16(0x74, 2); w32(0x76, 2); w32(0x7A, 0x80);   /* LatRef value @0x7A(内联区) */
  w16(0x7E, 0x0002); w16(0x80, 5); w32(0x82, 3); w32(0x86, 0xD0);   /* Lat @0xD0 */
  w16(0x8A, 0x0003); w16(0x8C, 2); w32(0x8E, 2); w32(0x92, 0x90);   /* LonRef value @0x92(内联区) */
  w16(0x96, 0x0004); w16(0x98, 5); w32(0x9A, 3); w32(0x9E, 0xE8);   /* Lon @0xE8 */
  w32(0xA2, 0);
  b[0x7A] = 0x4E;                                      /* 'N' */
  b[0x92] = 0x45;                                      /* 'E' */
  const rat = (off, list) => { let o = off; for(const [n, d] of list){ w32(o, n); w32(o + 4, d); o += 8; } };
  rat(0xD0, [[31, 1], [13, 1], [49, 1]]);              /* 31°13'49" */
  rat(0xE8, [[121, 1], [28, 1], [12, 1]]);             /* 121°28'12" */
  /* JPEG 包装(段长度字段按规范含自身 2 字节) */
  const exifLen = 6 + b.length + 2;
  const jpeg = Buffer.concat([
    Buffer.from([0xFF, 0xD8, 0xFF, 0xE1, (exifLen >> 8) & 0xFF, exifLen & 0xFF, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00]),
    b,
    Buffer.from([0xFF, 0xD9])
  ]);
  return jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength);
}

let pass = 0, fail = 0;
const ok = (name, cond) => { if(cond){ pass++; console.log('OK   ' + name); } else { fail++; console.log('FAIL ' + name); } };

/* ---- parseExif ---- */
{
  const ex = apiCtx.parseExif(tiff(true));
  ok('parseExif hasExif', ex.hasExif === true);
  ok('parseExif Make=Nikon', ex.make === 'Nikon');
  ok('parseExif DateTimeOriginal', ex.dateTimeOriginal === '2026:11:10 09:30:00');
  ok('parseExif GPS lat', ex.gps && Math.abs(ex.gps.lat - (31 + 13 / 60 + 49 / 3600)) < 1e-9);
  ok('parseExif GPS lon', ex.gps && Math.abs(ex.gps.lon - (121 + 28 / 60 + 12 / 3600)) < 1e-9);
  /* 大端变体 */
  const exBe = apiCtx.parseExif(tiff(false));
  ok('parseExif big-endian', exBe.make === 'Nikon' && exBe.gps && Math.abs(exBe.gps.lat - 31.2303) < 1e-3);
  /* 非 JPEG / 无 EXIF */
  ok('parseExif non-JPEG', apiCtx.parseExif(new Uint8Array([1, 2, 3, 4]).buffer).hasExif === false);
  const noExif = Uint8Array.from([0xFF, 0xD8, 0xFF, 0xDB, 0x00, 0x02, 0xFF, 0xD9]).buffer;
  ok('parseExif JPEG-no-Exif', apiCtx.parseExif(noExif).hasExif === false);
}

/* ---- scanProvenance ---- */
{
  const b = new TextEncoder().encode('prefix c2pa middle http://ns.adobe.com/xap/1.0/ tail').buffer;
  const p = apiCtx.scanProvenance(b);
  ok('scanProvenance c2pa', p.c2pa === true);
  ok('scanProvenance xmp', p.xmp === true);
  const p2 = apiCtx.scanProvenance(new TextEncoder().encode('jumb box here').buffer);
  ok('scanProvenance jumbf', p2.jumbf === true && p2.c2pa === false);
}

/* ---- haversine / locFromKm ---- */
{
  const km = apiCtx.haversineKm(51.5074, -0.1278, 48.8566, 2.3522);  /* 伦敦→巴黎 */
  ok('haversine London-Paris ~343.5km (' + km.toFixed(1) + ')', Math.abs(km - 343.5) < 2);
  ok('haversine same point = 0', apiCtx.haversineKm(31.23, 121.47, 31.23, 121.47) < 1e-9);
  ok('locFromKm(0)=98', apiCtx.locFromKm(0) === 98);
  ok('locFromKm monotonic', apiCtx.locFromKm(0) > apiCtx.locFromKm(10) && apiCtx.locFromKm(10) > apiCtx.locFromKm(100) && apiCtx.locFromKm(100) > apiCtx.locFromKm(1000));
}

/* ---- data.js 自定义组织 ---- */
{
  const dataSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8');
  const ctx = { console, window: undefined };
  vm.createContext(ctx);
  vm.runInContext(dataSrc, ctx, { filename: 'data.js' });
  const PROOF = vm.runInContext('PROOF', ctx);
  const o = PROOF.org('custom:绿野行动队');
  ok('org(custom) type', o && o.type === 'custom');
  ok('org(custom) name', o && o.name.zh === '绿野行动队' && o.name.en === '绿野行动队');
  ok('org(registered) intact', PROOF.org('org-gbg').type === 'community');
  /* 注入一条自定义组织提交,验证聚合 */
  const sub = Object.assign({}, PROOF.submissions[0], {
    id: 'PA-9999', org: 'custom:绿野行动队', orgType: 'ngo', city: 9
  });
  PROOF.submissions.unshift(sub);
  const rows = PROOF.orgRows(9);
  const row = rows.find(r => r.key === 'custom:绿野行动队');
  ok('orgRows includes custom org', !!row && row.count === 1 && row.type === 'custom');
  ok('scopeSubs custom org', PROOF.scopeSubs(null, 9, 'custom:绿野行动队').every(s => s.org === 'custom:绿野行动队') && PROOF.scopeSubs(null, 9, 'custom:绿野行动队').length === 1);
  ok('registered orgs unchanged', PROOF.orgs.length === 14);
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
