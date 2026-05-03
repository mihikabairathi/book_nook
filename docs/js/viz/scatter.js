// UMAP scatter plot using regl-scatterplot
// Docs: https://github.com/flekschas/regl-scatterplot

let _scatterplot = null;
let _books = [];
let _coords = [];
let _onHover = null;
let _onClick = null;
let _activeGenres = null;

// 20-color warm categorical palette for clusters
const CLUSTER_COLORS = [
  '#c0392b','#e67e22','#d4ac0d','#27ae60','#16a085',
  '#2980b9','#8e44ad','#c0392b','#f39c12','#1abc9c',
  '#e74c3c','#3498db','#9b59b6','#2ecc71','#f1c40f',
  '#e67e22','#1abc9c','#34495e','#7f8c8d','#c0392b',
];

export async function initScatter(canvasId, books, coords, { onHover, onClick } = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.createScatterplot) return;

  _books = books;
  _coords = coords;
  _onHover = onHover;
  _onClick = onClick;

  // Build id → book lookup
  const bookById = {};
  for (const b of books) bookById[b.id] = b;

  // Align coords to books array (coords have {id, x, y, cluster})
  const pts = coords.map(c => [c.x, c.y]);
  const clusterIds = coords.map(c => c.cluster ?? 0);
  const bookIds = coords.map(c => c.id);

  const scatterplot = window.createScatterplot({ canvas, lassoOnLongPress: false });
  _scatterplot = scatterplot;

  // Map cluster id → color
  const colorArr = clusterIds.map(c => CLUSTER_COLORS[c % CLUSTER_COLORS.length]);

  await scatterplot.draw({
    x: pts.map(p => p[0]),
    y: pts.map(p => p[1]),
    color: colorArr,
    opacity: 0.8,
    size: 4,
  });

  // Hover
  scatterplot.subscribe('pointOver', idx => {
    const book = bookById[bookIds[idx]];
    if (!book || !_onHover) return;
    const canvas = document.getElementById(canvasId);
    const rect = canvas?.getBoundingClientRect();
    // Map normalized coords back to screen coords
    const [nx, ny] = [pts[idx][0], pts[idx][1]];
    if (rect) {
      const sx = rect.left + ((nx + 1) / 2) * rect.width;
      const sy = rect.top  + ((1 - (ny + 1) / 2)) * rect.height;
      _onHover(book, sx, sy);
    }
  });

  scatterplot.subscribe('pointOut', () => {
    if (_onHover) _onHover(null, 0, 0);
  });

  scatterplot.subscribe('select', ({ points }) => {
    if (!points.length || !_onClick) return;
    const book = bookById[bookIds[points[0]]];
    if (book) _onClick(book);
  });

  // Cluster labels
  renderClusterLabels(canvas, coords, clusterIds);
}

function renderClusterLabels(canvas, coords, clusterIds) {
  const container = document.getElementById('cluster-labels');
  if (!container) return;

  // Find centroid of each cluster
  const centroids = {};
  const counts = {};
  for (let i = 0; i < coords.length; i++) {
    const c = clusterIds[i];
    if (!centroids[c]) { centroids[c] = [0, 0]; counts[c] = 0; }
    centroids[c][0] += coords[i].x;
    centroids[c][1] += coords[i].y;
    counts[c]++;
  }

  // Use cluster label names if available (from umap_coords.json cluster_label field)
  const clusterLabels = {};
  for (const c of coords) {
    if (c.cluster_label && !clusterLabels[c.cluster]) clusterLabels[c.cluster] = c.cluster_label;
  }

  const rect = canvas.getBoundingClientRect();

  container.innerHTML = Object.keys(centroids).map(c => {
    const cx = centroids[c][0] / counts[c];
    const cy = centroids[c][1] / counts[c];
    // normalized [-1,1] → pixel coords
    const px = ((cx + 1) / 2) * 100;
    const py = (1 - (cy + 1) / 2) * 100;
    const label = clusterLabels[c] || '';
    if (!label) return '';
    return `<div class="cluster-label" style="left:${px}%;top:${py}%">${label}</div>`;
  }).join('');
}

export function setGenreFilter(genres) {
  if (!_scatterplot || !_books.length || !_coords.length) return;
  _activeGenres = genres;

  const bookById = {};
  for (const b of _books) bookById[b.id] = b;

  const opacities = _coords.map(c => {
    if (!genres) return 0.8;
    const book = bookById[c.id];
    const bookGenres = (book?.genres || []).map(g => g.toLowerCase());
    return genres.some(g => bookGenres.includes(g.toLowerCase())) ? 1.0 : 0.08;
  });

  _scatterplot.draw({ opacity: opacities });
}
