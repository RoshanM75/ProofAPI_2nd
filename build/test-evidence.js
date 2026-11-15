'use strict';
// Zero-dependency checks for measurements and the provenance of bundled NDVI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/evidence.js'), 'utf8'), ctx);
const { comparePixels } = ctx.window.ProofEvidence;
function pixels(fn){
  const a = new Uint8ClampedArray(128*64*4);
  for(let y=0;y<64;y++) for(let x=0;x<128;x++){
    const i=(y*128+x)*4;a.set([...fn(x,y),255],i);
  }
  return a;
}
const scene = pixels((x,y)=>[x*2,y*3,(x+y)%256]);
const same = comparePixels(scene,scene);
assert.equal(same.match,1,'identical pixels have SSIM 1');
assert.equal(same.beforeGreen,same.afterGreen,'identical images cannot have green change');
const black=pixels(()=>[0,0,0]),white=pixels(()=>[255,255,255]);
assert.ok(comparePixels(black,white).match<.01,'different luminance should not match');
const green=pixels(()=>[20,150,20]);
const growth=comparePixels(black,green);
assert.equal(growth.beforeGreen,0);assert.equal(growth.afterGreen,1);
assert.ok(growth.match>=0 && growth.match<=1,'SSIM stays in display bounds');
assert.throws(()=>comparePixels(scene,green.subarray(4)),/dimensions/);

const json=JSON.parse(fs.readFileSync(path.join(root,'assets/data/landsat-ndvi.json'),'utf8'));
vm.runInContext(fs.readFileSync(path.join(root,'js/ndvi-data.js'),'utf8'),ctx);
assert.equal(JSON.stringify(ctx.window.PROOF_NDVI),JSON.stringify(json),'file:// bundle matches canonical JSON');
assert.ok(json.sites.length>=2 && json.sites.length<=3);
assert.equal(json.resolutionMeters,30);
assert.match(json.uncertainty,/No numeric confidence interval/);
for(const site of json.sites){
  assert.ok(site.observations.length>=4);
  const dates=site.observations.map(o=>o.date);
  assert.deepEqual(dates,[...dates].sort());
  assert.equal(new Set(dates).size,dates.length);
  for(const point of site.observations){
    assert.equal(point.qaPixel & 63,0,'cloud/shadow/snow/fill rejected');
    assert.equal(point.qaRadsat,0,'saturated pixels rejected');
    const red=point.redDN*.0000275-.2,nir=point.nirDN*.0000275-.2;
    assert.ok(Math.abs(point.ndvi-(nir-red)/(nir+red))<=.0000051,'NDVI is computed from actual raw samples');
    assert.ok(point.ndvi>=-1 && point.ndvi<=1);
    assert.match(point.sceneId,/^LC0[89]_L2SP_\d{6}_\d{8}_02_T1$/);
    assert.ok(point.sceneId.includes(point.date.replaceAll('-','')));
    assert.ok(point.acquiredAt.startsWith(point.date));
    assert.match(point.sourceUrl,/^https:\/\/planetarycomputer.microsoft.com\/api\/stac\/v1\//);
    assert.match(point.sampleUrl,/assets=red&assets=nir08&assets=qa_pixel&assets=qa_radsat/);
  }
}
console.log('PASS: local pair measurements, real NDVI calculations, QA masking, dates, provenance and file:// parity');
