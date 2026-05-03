// Lazy-loads Transformers.js + all-MiniLM-L6-v2 on first NL search use
let _extractor = null;
let _loading = false;
let _loadPromise = null;

const MODEL = 'Xenova/all-MiniLM-L6-v2';
const CDN   = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2/dist/transformers.min.js';

async function loadModel() {
  if (_extractor) return _extractor;
  if (_loadPromise) return _loadPromise;

  _loading = true;
  _loadPromise = (async () => {
    const { pipeline, env } = await import(CDN);
    env.allowLocalModels = false; // force CDN
    _extractor = await pipeline('feature-extraction', MODEL);
    _loading = false;
    return _extractor;
  })();

  return _loadPromise;
}

// Returns an Int8Array of 384 dims, L2-normalized and quantized to int8
export async function embedQuery(text, onProgress) {
  const extractor = await loadModel();
  if (onProgress) onProgress('embedding');
  const output = await extractor(text.trim(), { pooling: 'mean', normalize: true });
  const float32 = output.data;
  const int8 = new Int8Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    int8[i] = Math.max(-127, Math.min(127, Math.round(float32[i] * 127)));
  }
  if (onProgress) onProgress('done');
  return int8;
}

export function isModelLoaded() { return _extractor !== null; }
export function isModelLoading() { return _loading; }

// Wire up the NL search input on the home page
export function initNLSearch(onResult) {
  const input = document.getElementById('nl-input');
  const status = document.getElementById('nl-status');
  if (!input) return;

  let debounceTimer = null;

  // Pre-load model when input is focused (before user finishes typing)
  input.addEventListener('focus', () => {
    if (!_extractor && !_loading) {
      if (status) status.textContent = 'Loading AI model…';
      loadModel().then(() => {
        if (status) status.textContent = '';
      });
    }
  }, { once: true });

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = input.value.trim();
    if (!query) {
      onResult(null, '');
      if (status) status.textContent = '';
      return;
    }

    debounceTimer = setTimeout(async () => {
      if (status) status.textContent = 'Searching…';
      try {
        const vec = await embedQuery(query);
        if (status) status.textContent = '';
        onResult(vec, query);
      } catch (err) {
        console.error('NL search error:', err);
        if (status) status.textContent = 'Error — try again';
      }
    }, 500);
  });
}
