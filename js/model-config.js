'use strict';
// Pinned weights and runtime: the offline heuristic path never imports either.
self.PROOF_MODEL = Object.freeze({
  id: 'Xenova/clip-vit-base-patch32',
  revision: '6b7c523703ae26e39be4b03774966f8571c7f523',
  runtime: 'transformers.js 2.17.2 / ONNX Runtime Web 1.14.0',
  cache: 'proof-clip-6b7c523-v1',
  prompts: [
    { action: 'solar', text: 'a rooftop covered with solar panels' },
    { action: 'cleanup', text: 'volunteers collecting trash on a beach' },
    { action: 'afforest', text: 'newly planted tree seedlings' },
    { action: 'wetland', text: 'a restored wetland with water and vegetation' },
    { action: 'ev', text: 'an electric car plugged into a charging station' },
    { action: 'retrofit', text: 'workers installing insulation in a building' }
  ]
});
