// Lightweight reactive state with pub/sub
const _state = {
  books: [],           // Full books.json array
  bookIndex: {},       // id -> book object
  embeddings: null,    // Int8Array | null
  umapCoords: null,    // [{id, x, y, cluster}] | null
  authorGraph: null,   // {nodes, links} | null
  timelineData: null,  // decoded timeline.json | null
  meta: null,          // meta.json

  // Current filter/search state
  query: '',
  profile: {
    mood_dark:   null,  // null = "don't care", 0-10 = specific value
    pacing:      null,
    focus:       null,  // maps to character_focus vs plot_focus
    depth:       null,
  },
  filters: {
    genres:       [],   // active genre tags
    yearMin:      1800,
    yearMax:      2030,
    hiddenGemsOnly: false,
  },
  sort: 'popularity',
  results: [],
  page: 0,
  PAGE_SIZE: 48,
};

const _listeners = {};

export function getState() { return _state; }

export function setState(updates) {
  Object.assign(_state, updates);
  for (const [k, v] of Object.entries(updates)) {
    emit(k, v);
  }
}

export function on(event, fn) {
  (_listeners[event] = _listeners[event] || []).push(fn);
  return () => { _listeners[event] = _listeners[event].filter(f => f !== fn); };
}

export function emit(event, data) {
  (_listeners[event] || []).forEach(fn => fn(data));
}

export function getBook(id) { return _state.bookIndex[id] || null; }

export function buildIndex() {
  _state.bookIndex = {};
  for (const b of _state.books) _state.bookIndex[b.id] = b;
}
