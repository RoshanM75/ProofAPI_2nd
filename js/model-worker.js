'use strict';
importScripts('model-config.js');

self.onmessage = async ({ data }) => {
  let phase = 'runtime';
  try {
    const config = self.PROOF_MODEL;
    const cache = await caches.open(config.cache);
    // Cache-only mode also blocks WASM fetches: a fresh worker must read disk,
    // not reuse an already resident model or quietly contact the network.
    if(data.cacheOnly){
      self.fetch = async input => {
        const hit = await caches.match(input);
        if(!hit) throw new Error('Offline cache is incomplete: ' + String(input));
        return hit;
      };
    }
    const { pipeline, env, RawImage } = await import('../assets/vendor/transformers/transformers.min.js');
    // Transformers.js requires one source enabled even when all files are cached.
    // In cache-only mode the fetch guard rejects any uncached local/WASM request.
    env.allowLocalModels = data.cacheOnly;
    env.allowRemoteModels = !data.cacheOnly;
    env.useBrowserCache = false;
    env.useCustomCache = true;
    env.customCache = {
      match: key => cache.match(key),
      put: async (key, response) => {
        try { await cache.put(key, response); }
        catch(e) { throw new Error('Cannot cache model files (storage quota or browser policy): ' + e.message); }
      }
    };
    env.backends.onnx.wasm.wasmPaths = new URL('../assets/vendor/transformers/', self.location.href).href;
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.proxy = false;
    const started = performance.now();
    phase = 'model loading / cache';
    const classifier = await pipeline('zero-shot-image-classification', config.id, {
      revision: config.revision, quantized: true,
      progress_callback: p => self.postMessage({ type: 'progress', file: p.file || '',
        status: p.status, loaded: p.loaded, total: p.total, progress: p.progress })
    });
    const loadMs = performance.now() - started;
    phase = 'image decoding';
    const image = await RawImage.fromBlob(new Blob([data.bytes], { type: data.mime }));
    self.postMessage({ type: 'inferring' });
    const inferenceStart = performance.now();
    phase = 'inference';
    const predictions = await classifier(image, config.prompts.map(p => p.text), { hypothesis_template: '{}' });
    const inferenceMs = performance.now() - inferenceStart;
    if(predictions.length !== config.prompts.length || predictions.some(p => !Number.isFinite(p.score) || p.score < 0 || p.score > 1)){
      throw new Error('The model returned invalid probabilities.');
    }
    self.postMessage({ type: 'result', predictions, inferenceMs, loadMs, cacheOnly: data.cacheOnly,
      cachedFiles: (await cache.keys()).length });
  } catch(e) {
    const detail = /failed to fetch/i.test(e.message || '')
      ? 'Could not fetch required files. Check connectivity, browser network policy and whether the offline cache is complete.'
      : e.message || String(e);
    self.postMessage({ type: 'error', reason: phase + ': ' + detail });
  }
};
