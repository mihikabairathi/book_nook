import { loadBooks, loadUmapCoords } from '../data.js';
import { getState } from '../state.js';
import { initScatter } from '../viz/scatter.js';
import { initBubble } from '../viz/bubble.js';

export async function initExplore() {
  await loadBooks();
  await loadUmapCoords();

  const { books, umapCoords } = getState();

  if (!umapCoords || !umapCoords.length) {
    document.getElementById('scatter-loading').innerHTML =
      '<p style="color:var(--text-muted); font-size:0.9rem;">UMAP data not yet generated — run the pipeline first.</p>';
    return;
  }

  // Build genre list for filter chips
  const genreCounts = {};
  for (const b of books) {
    for (const g of b.genres || []) genreCounts[g] = (genreCounts[g] || 0) + 1;
  }
  const topGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name]) => name);

  renderGenreFilters(topGenres);

  await initScatter('scatter-canvas', books, umapCoords, {
    onHover: showTooltip,
    onClick: (book) => {
      showSelectedBook(book);
    },
  });

  document.getElementById('scatter-loading').style.display = 'none';
  initBubble('bubble-svg', books);
}

function renderGenreFilters(genres) {
  const strip = document.getElementById('genre-filter-strip');
  if (!strip) return;

  let active = new Set();

  strip.innerHTML = ['All', ...genres].map(g =>
    `<button class="tag-pill${g === 'All' ? ' active' : ''}" data-genre="${g}">${g}</button>`
  ).join('');

  strip.addEventListener('click', e => {
    const pill = e.target.closest('.tag-pill');
    if (!pill) return;
    const genre = pill.dataset.genre;

    if (genre === 'All') {
      active.clear();
      strip.querySelectorAll('.tag-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    } else {
      strip.querySelector('[data-genre="All"]')?.classList.remove('active');
      if (active.has(genre)) {
        active.delete(genre);
        pill.classList.remove('active');
      } else {
        active.add(genre);
        pill.classList.add('active');
      }
      if (active.size === 0) {
        strip.querySelector('[data-genre="All"]')?.classList.add('active');
      }
    }

    // Emit genre filter change to scatter
    import('../viz/scatter.js').then(({ setGenreFilter }) => {
      setGenreFilter(active.size > 0 ? [...active] : null);
    });
  });
}

function showTooltip(book, x, y) {
  const tt = document.getElementById('scatter-tooltip');
  if (!tt) return;

  if (!book) { tt.classList.remove('visible'); return; }

  document.getElementById('tt-cover').src = book.cover_url || '';
  document.getElementById('tt-title').textContent = book.title;
  document.getElementById('tt-author').textContent = book.author || '';
  tt.style.left = `${x + 12}px`;
  tt.style.top  = `${y - 20}px`;
  tt.classList.add('visible');
}

function showSelectedBook(book) {
  const card = document.getElementById('selected-book-card');
  const inner = document.getElementById('selected-book-inner');
  const openBtn = document.getElementById('open-book-btn');
  if (!card || !inner) return;

  inner.innerHTML = `
    <div style="font-family:var(--font-body); font-size:0.95rem; margin-bottom:6px; line-height:1.3;">${book.title}</div>
    <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px;">${book.author || ''} · ${book.year || ''}</div>
    <div style="font-size:0.75rem; color:var(--text-faint); line-height:1.5;">${(book.description || '').slice(0, 120)}…</div>
  `;
  if (openBtn) openBtn.onclick = () => { window.location.href = `book.html?id=${book.id}`; };
  card.style.display = '';
}
