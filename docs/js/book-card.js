// Genre → CSS color variable mapping
const GENRE_COLORS = {
  fantasy:    '#8b5cf6', scifi: '#06b6d4', 'science fiction': '#06b6d4',
  mystery:    '#6366f1', thriller: '#dc2626', horror: '#991b1b',
  romance:    '#ec4899', literary: '#0d9488', 'literary fiction': '#0d9488',
  historical: '#d97706', nonfiction: '#16a34a', biography: '#16a34a',
  default:    '#78716c',
};

function genreColor(genres = []) {
  for (const g of genres) {
    const color = GENRE_COLORS[g.toLowerCase()];
    if (color) return color;
  }
  return GENRE_COLORS.default;
}

// Generates a deterministic gradient for covers with no image
function fallbackGradient(title = '') {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `linear-gradient(135deg, hsl(${hue},40%,35%), hsl(${(hue+40)%360},35%,25%))`;
}

// Cover URL handling: prefer stored URL, fall back to Open Library by ISBN
function coverUrl(book) {
  if (book.cover_url) return book.cover_url;
  if (book.isbn) return `https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg`;
  return null;
}

// Rating display (uses best available signal)
function ratingDisplay(book) {
  const r = book.hardcover_avg_rating || book.ol_avg_rating;
  if (!r) return '';
  return `★ ${r.toFixed(2)}`;
}

class BookCard extends HTMLElement {
  static observedAttributes = ['book-id', 'explain'];

  connectedCallback() { this._render(); }
  attributeChangedCallback() { this._render(); }

  _render() {
    const bookId = this.getAttribute('book-id');
    if (!bookId) return;

    // Lazy-import state to avoid circular deps at module load time
    import('./state.js').then(({ getBook }) => {
      const book = getBook(bookId);
      if (!book) return;
      const explain = this.getAttribute('explain') || '';
      this.innerHTML = this._template(book, explain);
      this._attachHandlers(book);
      this.classList.add('card-enter');
    });
  }

  _template(book, explain) {
    const cover = coverUrl(book);
    const color = genreColor(book.genres);
    const isGem = (book.hidden_gem_score || 0) >= 7;
    const tags = (book.genres || []).slice(0, 2);

    return `
      <article class="book-card" data-id="${book.id}">
        <div class="book-card__cover">
          ${cover
            ? `<img src="${cover}" alt="${book.title}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
               <div class="book-card__cover-fallback" style="display:none; background:${fallbackGradient(book.title)}">
                 ${book.title}
               </div>`
            : `<div class="book-card__cover-fallback" style="background:${fallbackGradient(book.title)}">
                 ${book.title}
               </div>`
          }
          ${isGem ? '<span class="book-card__gem">gem</span>' : ''}
          <span class="book-card__genre-dot" style="background:${color};"></span>
        </div>
        <div class="book-card__meta">
          <div class="book-card__title">${book.title}</div>
          <div class="book-card__author">${book.author || ''}</div>
          <div class="book-card__footer">
            <span class="book-card__rating">${ratingDisplay(book)}</span>
            <div class="book-card__tags">
              ${tags.map(t => `<span class="book-card__tag">${t}</span>`).join('')}
            </div>
          </div>
          ${explain ? `<div class="book-card__explain">${explain}</div>` : ''}
        </div>
      </article>
    `;
  }

  _attachHandlers(book) {
    const article = this.querySelector('article');
    if (!article) return;
    article.addEventListener('click', () => {
      window.location.href = `book.html?id=${book.id}`;
    });
  }
}

customElements.define('book-card', BookCard);

// Helper: render a grid of book-cards into a container element
export function renderBookGrid(containerEl, results, { showExplain = false } = {}) {
  if (!containerEl) return;
  if (results.length === 0) {
    containerEl.innerHTML = '';
    return;
  }

  containerEl.innerHTML = results.map(({ book, score, semanticScore, explain }) => {
    const explainText = showExplain && explain ? explain : '';
    return `<book-card book-id="${book.id}" explain="${explainText}"></book-card>`;
  }).join('');
}
