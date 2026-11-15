Pinned optional browser runtime. None of these assets are requested until the
user opts into the model. JavaScript is dynamically imported in a worker;
single-threaded WASM uses SIMD when supported, with the non-SIMD fallback bundled.

- Transformers.js 2.17.2: Apache-2.0 (LICENSE-transformers). Third-party notices
  also appear inline in its bundled JavaScript.
- ONNX Runtime Web 1.14.0: MIT (LICENSE-onnxruntime); dependencies are described
  in ThirdPartyNotices-onnxruntime.txt.
- `manifest.json` records exact source URLs, sizes and SHA-256 digests.
  Run `python build/fetch-model-runtime.py` from the repository to reproduce.
- CLIP weights are **not bundled**. Opt-in downloads the pinned MIT-licensed
  [Xenova CLIP conversion](https://huggingface.co/Xenova/clip-vit-base-patch32/tree/6b7c523703ae26e39be4b03774966f8571c7f523),
  based on [OpenAI CLIP](https://github.com/openai/CLIP), to browser Cache API storage.
