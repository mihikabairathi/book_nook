import { loadBooks, loadEmbeddings } from '../data.js';
import { getState, getBook } from '../state.js';
import { findSimilar, explainBook } from '../search.js';
import { renderBookGrid } from '../book-card.js';
import { initRadar } from '../viz/radar.js';

export async function initBookDetail() {
  const params = new URLSearchParams(window.location.search);
  const bookId = params.get('id');

  if (!bookId) { window.location.href = 'index.html'; return; }

  await loadBooks();
  const book = getBook(bookId);

  if (!book) {
    document.getElementById('loading-state').innerHTML = '<p style="color:var(--text-muted)">Book not found.</p>';
    return;
  }

  document.title = `${book.title} — BookNook`;
  renderBook(book);
  document.getElementById('loading-state').style.display = 'none';
  document.getElementById('book-detail').style.display = '';

  // Load embeddings for "find similar"
  await loadEmbeddings();
  renderSimilar(book);
  renderAuthorBooks(book);
  initCompareFeature(book);
}

function renderBook(book) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const setHtml = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };
  const setAttr = (id, attr, val) => { const el = document.getElementById(id); if (el) el[attr] = val; };

  // Cover
  const coverEl = document.getElementById('book-cover');
  if (coverEl) {
    const url = book.cover_url || (book.isbn ? `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg` : '');
    coverEl.src = url;
    coverEl.alt = book.title;
  }

  set('book-title', book.title);
  set('book-author-link', book.author || '');
  setAttr('book-author-link', 'href', `author.html?id=${book.author_id}`);
  set('more-by-author', book.author || '');

  const r = book.hardcover_avg_rating || book.ol_avg_rating;
  set('book-rating', r ? `★ ${r.toFixed(2)}` : '');
  set('book-year', book.year ? `${book.year}` : '');
  set('book-pages', book.page_count ? `${book.page_count} pages` : '');
  set('book-description', book.description || 'No description available.');
  set('book-prose', book.prose_style || '');
  set('book-setting', [book.setting_era, book.setting_location].filter(Boolean).join(' · ') || '—');

  // Genres
  const genreEl = document.getElementById('book-genres');
  if (genreEl) {
    genreEl.innerHTML = (book.genres || []).slice(0, 5).map(g =>
      `<a href="index.html?genre=${encodeURIComponent(g)}"
         class="tag-pill" style="text-decoration:none;">${g}</a>`
    ).join('');
  }

  // Themes
  const themesEl = document.getElementById('book-themes');
  if (themesEl) {
    themesEl.innerHTML = (book.themes || []).slice(0, 8).map(t =>
      `<span class="tag-pill">${t}</span>`
    ).join('');
  }

  // OL link
  setAttr('ol-link', 'href', `https://openlibrary.org/works/${book.id}`);

  // Radar chart
  initRadar('radar-canvas', book, null);
  const legendEl = document.getElementById('radar-legend');
  if (legendEl) {
    legendEl.innerHTML = `
      <div class="radar-legend__item">
        <span class="radar-legend__swatch" style="background:rgba(192,57,43,0.7);"></span>
        ${book.title.slice(0, 20)}${book.title.length > 20 ? '…' : ''}
      </div>`;
  }

  // Find similar button
  document.getElementById('find-similar-btn')?.addEventListener('click', () => {
    renderSimilar(book);
    document.getElementById('similar-grid')?.scrollIntoView({ behavior: 'smooth' });
  });
}

function renderSimilar(book) {
  const grid = document.getElementById('similar-grid');
  if (!grid || book.embed_idx == null) return;

  const { embeddings, books } = getState();
  if (!embeddings) return;

  const DIMS = 384;
  const queryVec = embeddings.subarray(book.embed_idx * DIMS, (book.embed_idx + 1) * DIMS);
  const results = findSimilar(queryVec, 12, new Set([book.id]));

  renderBookGrid(grid, results.map(r => ({
    ...r,
    explain: explainBook(r.book, { semanticScore: r.score, seedBook: book }),
  })), { showExplain: true });
}

function renderAuthorBooks(book) {
  const grid = document.getElementById('author-books-grid');
  if (!grid) return;

  const { books } = getState();
  const authorBooks = books
    .filter(b => b.author_id === book.author_id && b.id !== book.id)
    .slice(0, 6)
    .map(b => ({ book: b, score: 0, semanticScore: 0 }));

  renderBookGrid(grid, authorBooks);
}

function initCompareFeature(book) {
  const toggleBtn = document.getElementById('compare-toggle');
  const inputWrap = document.getElementById('compare-input-wrap');
  const compareInput = document.getElementById('compare-input');
  const compareResults = document.getElementById('compare-results');

  if (!toggleBtn || !inputWrap) return;

  toggleBtn.addEventListener('click', () => {
    const open = inputWrap.style.display !== 'none';
    inputWrap.style.display = open ? 'none' : '';
    toggleBtn.textContent = open ? 'Compare…' : 'Cancel';
  });

  let debounce;
  compareInput?.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = compareInput.value.toLowerCase().trim();
    if (!q) { compareResults.innerHTML = ''; return; }

    debounce = setTimeout(() => {
      const { books } = getState();
      const matches = books.filter(b =>
        b.title.toLowerCase().includes(q) || (b.author || '').toLowerCase().includes(q)
      ).slice(0, 5);

      compareResults.innerHTML = matches.map(b =>
        `<div style="padding:6px 8px; cursor:pointer; border-radius:var(--radius-sm); font-size:0.8rem; hover:background:var(--bg-muted);"
              data-id="${b.id}" class="compare-option">
           <strong>${b.title}</strong> <span style="color:var(--text-faint)">by ${b.author}</span>
         </div>`
      ).join('');

      compareResults.querySelectorAll('.compare-option').forEach(el => {
        el.addEventListener('click', () => {
          const b2 = getBook(el.dataset.id);
          if (b2) {
            initRadar('radar-canvas', book, b2);
            const legendEl = document.getElementById('radar-legend');
            if (legendEl) {
              legendEl.innerHTML = `
                <div class="radar-legend__item">
                  <span class="radar-legend__swatch" style="background:rgba(192,57,43,0.7);"></span>
                  ${book.title.slice(0,20)}${book.title.length>20?'…':''}
                </div>
                <div class="radar-legend__item">
                  <span class="radar-legend__swatch" style="background:rgba(99,102,241,0.5);"></span>
                  ${b2.title.slice(0,20)}${b2.title.length>20?'…':''}
                </div>`;
            }
            inputWrap.style.display = 'none';
            toggleBtn.textContent = 'Compare…';
            compareResults.innerHTML = '';
            compareInput.value = '';
          }
        });
        el.addEventListener('mouseenter', () => el.style.background = 'var(--bg-hover)');
        el.addEventListener('mouseleave', () => el.style.background = '');
      });
    }, 200);
  });
}
