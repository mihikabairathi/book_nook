import { loadBooks, loadTimeline } from '../data.js';
import { getState } from '../state.js';
import { initTimeline as renderTimeline } from '../viz/timeline.js';

export async function initTimeline() {
  await loadBooks();
  await loadTimeline();

  const { timelineData, books } = getState();

  const loadingEl = document.getElementById('timeline-loading');

  if (!timelineData || !timelineData.length) {
    if (loadingEl) loadingEl.innerHTML =
      '<p style="color:var(--text-muted); font-size:0.9rem;">Timeline data not yet generated — run the pipeline first.</p>';
    return;
  }

  if (loadingEl) loadingEl.style.display = 'none';

  // Populate genre highlight dropdown
  const genreCounts = {};
  for (const b of books) {
    for (const g of b.genres || []) genreCounts[g] = (genreCounts[g] || 0) + 1;
  }
  const topGenres = Object.keys(genreCounts).sort((a, b) => genreCounts[b] - genreCounts[a]).slice(0, 20);
  const genreSelect = document.getElementById('genre-highlight');
  if (genreSelect) {
    genreSelect.innerHTML += topGenres.map(g => `<option value="${g}">${g}</option>`).join('');
    genreSelect.addEventListener('change', () => {
      renderTimeline('timeline-svg', timelineData, books, {
        highlightGenre: genreSelect.value || null,
        colorMode: document.getElementById('color-mode')?.value || 'genre',
      });
    });
  }

  const colorMode = document.getElementById('color-mode');
  colorMode?.addEventListener('change', () => {
    renderTimeline('timeline-svg', timelineData, books, {
      highlightGenre: genreSelect?.value || null,
      colorMode: colorMode.value,
    });
  });

  document.getElementById('reset-zoom')?.addEventListener('click', () => {
    renderTimeline('timeline-svg', timelineData, books, {
      highlightGenre: null,
      colorMode: 'genre',
      resetZoom: true,
    });
    if (genreSelect) genreSelect.value = '';
    if (colorMode) colorMode.value = 'genre';
  });

  renderTimeline('timeline-svg', timelineData, books, {
    highlightGenre: null,
    colorMode: 'genre',
  });
}
