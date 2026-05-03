import { loadBooks, loadMeta } from '../data.js';
import { getState, setState, on } from '../state.js';
import { runRecommendations, explainBook } from '../search.js';
import { initFilters, populateGenreTags, triggerUpdate } from '../filters.js';
import { initNLSearch } from '../nl-search.js';
import { renderBookGrid } from '../book-card.js';

const PAGE_SIZE = 48;
let _currentResults = [];
let _page = 0;
let _queryVec = null;
let _queryText = '';

export async function initHome() {
  showLoading(true);

  await loadBooks();
  await loadMeta();

  showLoading(false);

  const { books, meta } = getState();

  populateGenreTags(books);
  initFilters();
  initNLSearch(handleNLResult);
  on('filters-changed', () => refresh(false));
  document.getElementById('load-more')?.addEventListener('click', loadMore);

  if (!books.length) {
    showEmptyState('No books loaded — run the pipeline first.');
    return;
  }

  if (meta) {
    const footer = document.createElement('footer');
    footer.style.cssText = 'text-align:center;padding:24px;color:var(--text-faint);font-size:0.75rem;';
    footer.textContent = `${meta.book_count?.toLocaleString() || books.length.toLocaleString()} books · Last updated ${meta.pipeline_run?.slice(0,10) || 'recently'}`;
    document.body.appendChild(footer);
  }

  await refresh(false);
}

function handleNLResult(vec, text) {
  _queryVec = vec;
  _queryText = text;
  _page = 0;
  const heading = document.getElementById('results-heading');
  if (heading) {
    heading.firstChild.textContent = text ? `Results for "${text.slice(0,50)}"` : 'Popular books';
  }
  refresh(true);
}

async function refresh(useEmbeddings) {
  if (!getState().books.length) return;
  _page = 0;
  const results = await runRecommendations(_queryVec, useEmbeddings && !!_queryVec);
  _currentResults = results.map(r => ({
    ...r,
    explain: explainBook(r.book, {
      semanticScore: r.semanticScore,
      profile: getState().profile,
    }),
  }));

  const countEl = document.getElementById('result-count');
  if (countEl) countEl.textContent = `${_currentResults.length.toLocaleString()} books`;

  renderPage();
}

function renderPage() {
  const grid = document.getElementById('book-grid');
  const empty = document.getElementById('empty-state');
  const loadMore = document.getElementById('load-more');
  if (!grid) return;

  const slice = _currentResults.slice(0, (_page + 1) * PAGE_SIZE);

  if (slice.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.style.display = '';
    if (loadMore) loadMore.style.display = 'none';
    return;
  }

  if (empty) empty.style.display = 'none';
  renderBookGrid(grid, slice, { showExplain: !!_queryVec });
  if (loadMore) {
    loadMore.style.display = slice.length < _currentResults.length ? '' : 'none';
  }
}

function loadMore() {
  _page++;
  renderPage();
  // Scroll to new content
  const grid = document.getElementById('book-grid');
  if (grid) {
    const cards = grid.querySelectorAll('book-card');
    const newStart = _page * PAGE_SIZE;
    if (cards[newStart]) cards[newStart].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function showLoading(show) {
  const loader = document.getElementById('loading-state');
  const grid = document.getElementById('book-grid');
  if (loader) loader.style.display = show ? '' : 'none';
  if (grid) grid.style.display = show ? 'none' : '';
}

function showEmptyState(msg) {
  showLoading(false);
  const empty = document.getElementById('empty-state');
  if (empty) {
    empty.style.display = '';
    const p = empty.querySelector('p');
    if (p) p.textContent = msg;
  }
}
