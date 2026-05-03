import { loadEmbeddings } from './data.js';
import { getState } from './state.js';

const DIMS = 384;

// Dot product of two int8 vectors; rescales to [-1, 1]
function dotInt8(a, aOffset, b, bOffset) {
  let dot = 0;
  for (let i = 0; i < DIMS; i++) dot += a[aOffset + i] * b[bOffset + i];
  return dot / (127 * 127);
}

// Get the embedding vector slice for book at embed_idx
function bookVec(embeddings, embedIdx) {
  return embeddings.subarray(embedIdx * DIMS, (embedIdx + 1) * DIMS);
}

// Find top-k books most similar to a query vector (Int8Array of length DIMS)
export function findSimilar(queryVec, topK = 30, excludeIds = new Set()) {
  const { books, embeddings } = state();
  if (!embeddings || !books.length) return [];

  const scores = [];
  for (const book of books) {
    if (excludeIds.has(book.id)) continue;
    if (book.embed_idx == null) continue;
    const s = dotInt8(queryVec, 0, embeddings, book.embed_idx * DIMS);
    scores.push({ book, score: s });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topK);
}

// Hybrid scoring: semantic + profile + popularity + recency
export function hybridScore(book, semanticScore, profile) {
  const { sort } = getState();

  // Semantic similarity component (0-1)
  const sem = (semanticScore + 1) / 2; // shift [-1,1] → [0,1]

  // Profile similarity: L1 distance between slider values and book labels
  let profileSim = 0.5; // neutral if no sliders set
  if (profile) {
    const dims = [
      ['mood_dark',         profile.mood_dark],
      ['pacing',            profile.pacing],
      ['character_focus',   profile.focus != null ? 10 - profile.focus : null],
      ['depth',             profile.depth],
    ];
    let sum = 0, count = 0;
    for (const [key, val] of dims) {
      if (val != null) {
        sum += Math.abs((book[key] ?? 5) - val) / 10;
        count++;
      }
    }
    if (count > 0) profileSim = 1 - (sum / count);
  }

  // Popularity: log10 scale, normalized
  const pop = Math.min(Math.log10((book.unified_popularity || 1) + 1) / 7, 1);

  // Recency boost
  const yr = book.year || 1900;
  const recency = yr >= 2018 ? 1.0 : yr >= 2010 ? 0.7 : yr >= 2000 ? 0.55 : 0.4;

  // Weights: adjust when semantic unavailable
  const hasSemantic = semanticScore !== 0;
  const w_sem = hasSemantic ? 0.40 : 0;
  const w_pro = 0.25;
  const w_pop = hasSemantic ? 0.20 : 0.55;
  const w_rec = hasSemantic ? 0.15 : 0.20;
  const total = w_sem + w_pro + w_pop + w_rec;

  return (w_sem * sem + w_pro * profileSim + w_pop * pop + w_rec * recency) / total;
}

// Apply hard metadata filters; returns true if book passes
export function passesFilter(book, filters) {
  if (filters.genres.length > 0) {
    const bookGenres = (book.genres || []).map(g => g.toLowerCase());
    const match = filters.genres.some(g => bookGenres.includes(g.toLowerCase()));
    if (!match) return false;
  }
  if (book.year && book.year < filters.yearMin) return false;
  if (book.year && book.year > filters.yearMax) return false;
  if (filters.hiddenGemsOnly && (book.hidden_gem_score || 0) < 6) return false;
  return true;
}

// Run the full recommendation pipeline for the home page
export async function runRecommendations(queryVec, ensureEmbeddings = false) {
  const { books, embeddings, filters, profile, sort } = getState();
  if (!books.length) return [];

  if (ensureEmbeddings && !embeddings) await loadEmbeddings();

  const { embeddings: emb } = getState();
  const results = [];

  for (const book of books) {
    if (!passesFilter(book, filters)) continue;

    let semScore = 0;
    if (queryVec && emb && book.embed_idx != null) {
      semScore = dotInt8(queryVec, 0, emb, book.embed_idx * DIMS);
    }

    const score = hybridScore(book, semScore, profile);
    results.push({ book, score, semanticScore: semScore });
  }

  // Sort
  switch (sort) {
    case 'rating':
      results.sort((a, b) => (b.book.hardcover_avg_rating || b.book.ol_avg_rating || 0)
                           - (a.book.hardcover_avg_rating || a.book.ol_avg_rating || 0));
      break;
    case 'year_desc':
      results.sort((a, b) => (b.book.year || 0) - (a.book.year || 0));
      break;
    case 'year_asc':
      results.sort((a, b) => (a.book.year || 0) - (b.book.year || 0));
      break;
    case 'hidden_gems':
      results.sort((a, b) => (b.book.hidden_gem_score || 0) - (a.book.hidden_gem_score || 0));
      break;
    default: // popularity or semantic
      results.sort((a, b) => b.score - a.score);
  }

  return results;
}

// Generate a natural-language explanation snippet
export function explainBook(book, context = {}) {
  const parts = [];
  const { semanticScore = 0, seedBook = null, profile = null } = context;

  if (semanticScore > 0.5)
    parts.push('closely matches your query');

  if (seedBook) {
    const shared = (book.themes || []).filter(t => (seedBook.themes || []).includes(t));
    if (shared.length > 0) parts.push(`shares themes with "${seedBook.title}"`);
    else parts.push(`similar feel to "${seedBook.title}"`);
  }

  if (profile) {
    if (profile.pacing != null && Math.abs((book.pacing || 5) - profile.pacing) < 2)
      parts.push((book.pacing || 5) < 5 ? 'slow-burn pacing' : 'fast-paced');
    if (profile.mood_dark != null && Math.abs((book.mood_dark || 5) - profile.mood_dark) < 2)
      parts.push((book.mood_dark || 5) > 6 ? 'dark and heavy' : 'light and cozy');
  }

  if ((book.hidden_gem_score || 0) >= 7)
    parts.push(`hidden gem`);

  return parts.slice(0, 2).join(' · ');
}
