import { getState, setState, on, emit } from './state.js';

const SLIDER_NULL_VALUE = 5; // center = "don't care"

// All known genres (populated from books data)
let _genres = [];

export function initFilters() {
  const s = getState();

  // Sliders
  bindSlider('slider-mood-dark', 'mood-dark-val', 'mood_dark', ['cozy/light', 'dark/heavy']);
  bindSlider('slider-pacing',    'pacing-val',    'pacing',    ['slow burn', 'fast-paced']);
  bindSlider('slider-focus',     'focus-val',     'focus',     ['character', 'plot-driven']);
  bindSlider('slider-depth',     'depth-val',     'depth',     ['light read', 'literary']);

  // Year range
  document.getElementById('year-min')?.addEventListener('change', e => {
    setState({ filters: { ...getState().filters, yearMin: +e.target.value || 1800 } });
    triggerUpdate();
  });
  document.getElementById('year-max')?.addEventListener('change', e => {
    setState({ filters: { ...getState().filters, yearMax: +e.target.value || 2030 } });
    triggerUpdate();
  });

  // Hidden gems
  document.getElementById('hidden-gems-only')?.addEventListener('change', e => {
    setState({ filters: { ...getState().filters, hiddenGemsOnly: e.target.checked } });
    triggerUpdate();
  });

  // Sort
  document.getElementById('sort-select')?.addEventListener('change', e => {
    setState({ sort: e.target.value });
    triggerUpdate();
  });

  // Reset
  document.getElementById('reset-filters')?.addEventListener('click', resetFilters);
}

function bindSlider(sliderId, valId, profileKey, [minLabel, maxLabel]) {
  const el = document.getElementById(sliderId);
  const valEl = document.getElementById(valId);
  if (!el) return;

  el.addEventListener('input', () => {
    const v = +el.value;
    const isNull = v === SLIDER_NULL_VALUE;
    const { profile } = getState();
    setState({ profile: { ...profile, [profileKey]: isNull ? null : v } });
    if (valEl) valEl.textContent = isNull ? 'any' : v < 5 ? minLabel : v > 5 ? maxLabel : 'any';
    triggerUpdate();
  });
}

export function populateGenreTags(books) {
  const counts = {};
  for (const book of books) {
    for (const g of book.genres || []) counts[g] = (counts[g] || 0) + 1;
  }
  _genres = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .map(([name]) => name);

  const container = document.getElementById('genre-tags');
  if (!container) return;

  container.innerHTML = _genres.map(g => `
    <button class="tag-pill" data-genre="${g}">${g}</button>
  `).join('');

  container.addEventListener('click', e => {
    const pill = e.target.closest('.tag-pill');
    if (!pill) return;
    const genre = pill.dataset.genre;
    const { filters } = getState();
    const active = filters.genres.includes(genre);
    const newGenres = active
      ? filters.genres.filter(g => g !== genre)
      : [...filters.genres, genre];
    setState({ filters: { ...filters, genres: newGenres } });
    pill.classList.toggle('active', !active);

    const clearBtn = document.getElementById('genre-clear');
    if (clearBtn) clearBtn.style.display = newGenres.length ? '' : 'none';

    triggerUpdate();
  });

  document.getElementById('genre-clear')?.addEventListener('click', () => {
    const { filters } = getState();
    setState({ filters: { ...filters, genres: [] } });
    container.querySelectorAll('.tag-pill').forEach(p => p.classList.remove('active'));
    document.getElementById('genre-clear').style.display = 'none';
    triggerUpdate();
  });
}

function resetFilters() {
  setState({
    filters: { genres: [], yearMin: 1800, yearMax: 2030, hiddenGemsOnly: false },
    profile: { mood_dark: null, pacing: null, focus: null, depth: null },
    query: '',
    sort: 'popularity',
  });
  // Reset UI elements
  ['slider-mood-dark','slider-pacing','slider-focus','slider-depth'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = 5;
  });
  ['mood-dark-val','pacing-val','focus-val','depth-val'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = 'any';
  });
  document.getElementById('hidden-gems-only') && (document.getElementById('hidden-gems-only').checked = false);
  const yearMin = document.getElementById('year-min');
  const yearMax = document.getElementById('year-max');
  if (yearMin) yearMin.value = 1800;
  if (yearMax) yearMax.value = 2025;
  document.getElementById('sort-select') && (document.getElementById('sort-select').value = 'popularity');
  document.querySelectorAll('.tag-pill.active').forEach(p => p.classList.remove('active'));
  const clearBtn = document.getElementById('genre-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  const nlInput = document.getElementById('nl-input');
  if (nlInput) nlInput.value = '';

  triggerUpdate();
}

export function triggerUpdate() {
  emit('filters-changed', null);
}
