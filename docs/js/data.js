import { setState, buildIndex } from './state.js';

let _booksLoaded = false;
let _embeddingsLoaded = false;
let _booksPromise = null;
let _embeddingsPromise = null;

export async function loadBooks() {
  if (_booksLoaded) return;
  if (_booksPromise) return _booksPromise;

  _booksPromise = (async () => {
    try {
      const resp = await fetch('data/books.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const books = await resp.json();
      setState({ books });
      buildIndex();
      _booksLoaded = true;
    } catch (err) {
      console.error('Failed to load books.json:', err);
      setState({ books: [] });
    }
  })();

  return _booksPromise;
}

export async function loadEmbeddings() {
  if (_embeddingsLoaded) return;
  if (_embeddingsPromise) return _embeddingsPromise;

  _embeddingsPromise = (async () => {
    try {
      const resp = await fetch('data/embeddings_int8.bin');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = await resp.arrayBuffer();
      setState({ embeddings: new Int8Array(buf) });
      _embeddingsLoaded = true;
    } catch (err) {
      console.error('Failed to load embeddings:', err);
    }
  })();

  return _embeddingsPromise;
}

export async function loadUmapCoords() {
  try {
    const resp = await fetch('data/umap_coords.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    setState({ umapCoords: data });
  } catch (err) {
    console.error('Failed to load UMAP coords:', err);
  }
}

export async function loadAuthorGraph() {
  try {
    const resp = await fetch('data/author_graph.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    setState({ authorGraph: data });
  } catch (err) {
    console.error('Failed to load author graph:', err);
  }
}

export async function loadTimeline() {
  try {
    const resp = await fetch('data/timeline.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    setState({ timelineData: data });
  } catch (err) {
    console.error('Failed to load timeline data:', err);
  }
}

export async function loadMeta() {
  try {
    const resp = await fetch('data/meta.json');
    if (!resp.ok) return;
    const data = await resp.json();
    setState({ meta: data });
  } catch (_) {}
}
