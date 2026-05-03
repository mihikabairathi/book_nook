import { loadBooks, loadEmbeddings } from '../data.js';
import { getState, getBook } from '../state.js';
import { findSimilar } from '../search.js';
import { renderBookGrid } from '../book-card.js';

export async function initAuthorDetail() {
  const params = new URLSearchParams(window.location.search);
  const authorId = params.get('id');

  if (!authorId) { window.location.href = 'index.html'; return; }

  await loadBooks();
  const { books } = getState();

  const authorBooks = books.filter(b => b.author_id === authorId);
  if (!authorBooks.length) {
    document.getElementById('loading-state').innerHTML =
      '<p style="color:var(--text-muted)">Author not found.</p>';
    return;
  }

  const authorName = authorBooks[0].author || authorId;
  document.title = `${authorName} — BookNook`;

  // Aggregate genre info
  const genreCounts = {};
  for (const b of authorBooks) {
    for (const g of b.genres || []) genreCounts[g] = (genreCounts[g] || 0) + 1;
  }
  const topGenres = Object.keys(genreCounts).sort((a, b) => genreCounts[b] - genreCounts[a]).slice(0, 5);

  // Render author info
  const nameEl = document.getElementById('author-name');
  if (nameEl) nameEl.textContent = authorName;

  const statsEl = document.getElementById('author-stats');
  if (statsEl) statsEl.textContent = `${authorBooks.length} book${authorBooks.length !== 1 ? 's' : ''} in our collection`;

  const genresEl = document.getElementById('author-genres');
  if (genresEl) {
    genresEl.innerHTML = topGenres.map(g => `<span class="tag-pill active">${g}</span>`).join('');
  }

  const bookCountEl = document.getElementById('book-count-label');
  if (bookCountEl) bookCountEl.textContent = `(${authorBooks.length})`;

  // Render books
  const booksEl = document.getElementById('author-books');
  if (booksEl) {
    const sorted = [...authorBooks].sort((a, b) =>
      (b.unified_popularity || 0) - (a.unified_popularity || 0)
    );
    renderBookGrid(booksEl, sorted.map(b => ({ book: b, score: 0, semanticScore: 0 })));
  }

  document.getElementById('loading-state').style.display = 'none';
  document.getElementById('author-detail').style.display = '';

  // Similar authors via embeddings
  await loadEmbeddings();
  renderSimilarAuthors(authorId, authorBooks);
}

function renderSimilarAuthors(authorId, authorBooks) {
  const container = document.getElementById('similar-authors');
  if (!container) return;

  const { books, embeddings } = getState();
  if (!embeddings) return;

  // Author embedding = mean of their books' int8 embeddings
  const DIMS = 384;
  const validBooks = authorBooks.filter(b => b.embed_idx != null);
  if (!validBooks.length) return;

  const authorVec = new Float32Array(DIMS);
  for (const b of validBooks) {
    const offset = b.embed_idx * DIMS;
    for (let d = 0; d < DIMS; d++) authorVec[d] += embeddings[offset + d];
  }
  for (let d = 0; d < DIMS; d++) authorVec[d] /= validBooks.length;

  // Normalize
  let norm = 0;
  for (let d = 0; d < DIMS; d++) norm += authorVec[d] * authorVec[d];
  norm = Math.sqrt(norm);
  const queryInt8 = new Int8Array(DIMS);
  for (let d = 0; d < DIMS; d++) queryInt8[d] = Math.round((authorVec[d] / (norm || 1)) * 127);

  // Find similar books (from other authors), then group by author
  const excluded = new Set(authorBooks.map(b => b.id));
  const results = findSimilar(queryInt8, 60, excluded);

  const authorScores = {};
  for (const { book, score } of results) {
    if (!authorScores[book.author_id]) {
      authorScores[book.author_id] = { author: book.author, score: 0, count: 0, genres: [] };
    }
    authorScores[book.author_id].score += score;
    authorScores[book.author_id].count++;
    for (const g of book.genres || []) {
      if (!authorScores[book.author_id].genres.includes(g)) authorScores[book.author_id].genres.push(g);
    }
  }

  const topAuthors = Object.entries(authorScores)
    .map(([id, data]) => ({ id, ...data, avgScore: data.score / data.count }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 6);

  container.innerHTML = topAuthors.map(a => `
    <a href="author.html?id=${a.id}"
       style="display:flex; align-items:center; gap:12px; padding:10px 14px; background:var(--bg-card);
              border:1px solid var(--border); border-radius:var(--radius); text-decoration:none;
              transition:border-color var(--transition-fast), box-shadow var(--transition-fast);"
       onmouseover="this.style.borderColor='var(--accent)';this.style.boxShadow='var(--shadow-sm)'"
       onmouseout="this.style.borderColor='var(--border)';this.style.boxShadow='none'">
      <div style="flex:1;">
        <div style="font-family:var(--font-body); font-size:0.95rem; color:var(--text);">${a.author}</div>
        <div style="font-size:0.75rem; color:var(--text-faint); margin-top:2px;">${a.genres.slice(0,3).join(', ')}</div>
      </div>
      <div style="font-size:0.7rem; color:var(--text-faint);">
        ${Math.round(a.avgScore * 100)}% match
      </div>
    </a>
  `).join('');
}
