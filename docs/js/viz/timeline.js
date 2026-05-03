// D3 publication year timeline with zoom
// timelineData: [{bucket_label, year_start, year_end, books: [{id, title, ...}]}]

const GENRE_COLORS = {
  fantasy:    '#8b5cf6', 'science fiction': '#06b6d4', scifi: '#06b6d4',
  mystery:    '#6366f1', thriller: '#dc2626', horror: '#991b1b',
  romance:    '#ec4899', literary: '#0d9488', 'literary fiction': '#0d9488',
  historical: '#d97706', nonfiction: '#16a34a', biography: '#16a34a',
  default:    '#b89588',
};

function bookColor(book, mode) {
  if (mode === 'mood') {
    const d = book.mood_dark ?? 5;
    const t = d / 10;
    const r = Math.round(253 + (192 - 253) * t);
    const g = Math.round(246 + (57  - 246) * t);
    const b = Math.round(238 + (43  - 238) * t);
    return `rgb(${r},${g},${b})`;
  }
  if (mode === 'pacing') {
    const p = (book.pacing ?? 5) / 10;
    const r = Math.round(13  + (200 - 13)  * p);
    const g = Math.round(148 + (57  - 148) * p);
    const b = Math.round(136 + (43  - 136) * p);
    return `rgb(${r},${g},${b})`;
  }
  // genre mode
  const genre = (book.genres || [])[0]?.toLowerCase();
  return GENRE_COLORS[genre] || GENRE_COLORS.default;
}

let _zoom = null;

export function initTimeline(svgId, timelineData, allBooks, { highlightGenre, colorMode = 'genre', resetZoom = false } = {}) {
  const svgEl = document.getElementById(svgId);
  if (!svgEl || !window.d3 || !timelineData.length) return;
  const d3 = window.d3;

  // Build id → book lookup for access to labels
  const bookById = {};
  for (const b of allBooks) bookById[b.id] = b;

  const container = svgEl.parentElement;
  const W = container?.clientWidth || 900;
  const margin = { top: 30, right: 20, bottom: 60, left: 60 };
  const H = 420;
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  // Clear existing
  d3.select(`#${svgId}`).selectAll('*').remove();

  const svg = d3.select(`#${svgId}`)
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('height', H);

  const clip = svg.append('defs').append('clipPath').attr('id', 'timeline-clip')
    .append('rect').attr('width', innerW).attr('height', innerH);

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  const gClipped = g.append('g').attr('clip-path', 'url(#timeline-clip)');

  // Flatten all books with their year
  const allPoints = [];
  for (const bucket of timelineData) {
    for (const b of (bucket.books || [])) {
      const book = bookById[b.id] || b;
      if (book.year) allPoints.push(book);
    }
  }

  if (!allPoints.length) return;

  const years = allPoints.map(b => b.year);
  const xMin = d3.min(years) - 2;
  const xMax = d3.max(years) + 2;

  const xScale = d3.scaleLinear().domain([xMin, xMax]).range([0, innerW]);
  const popMax = d3.max(allPoints, b => b.unified_popularity || 1);
  const rScale = d3.scaleSqrt().domain([0, popMax]).range([2, 8]);

  // Y: random scatter within band (jitter for readability)
  const yRand = (b) => ((hashCode(b.id) % 80) / 100) * innerH * 0.85 + innerH * 0.07;

  // Axes
  const xAxis = g.append('g').attr('transform', `translate(0,${innerH})`);
  const drawAxis = (scale) => {
    xAxis.call(
      d3.axisBottom(scale)
        .ticks(10)
        .tickFormat(d => `${Math.round(d)}`)
    );
    xAxis.selectAll('text')
      .attr('font-family', 'var(--font-body)')
      .attr('fill', '#7d5a50')
      .attr('font-size', '11px');
    xAxis.select('.domain').attr('stroke', '#e8d5c4');
    xAxis.selectAll('.tick line').attr('stroke', '#e8d5c4');
  };
  drawAxis(xScale);

  // Y axis label
  g.append('text')
    .attr('transform', `translate(-40,${innerH/2}) rotate(-90)`)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px')
    .attr('font-family', 'var(--font-ui)')
    .attr('fill', '#b89588')
    .text('(jittered for clarity)');

  // Decade separators
  const decades = [];
  for (let y = Math.ceil(xMin / 10) * 10; y <= xMax; y += 10) decades.push(y);
  gClipped.selectAll('.decade-line')
    .data(decades)
    .join('line')
    .attr('class', 'decade-line')
    .attr('x1', d => xScale(d)).attr('x2', d => xScale(d))
    .attr('y1', 0).attr('y2', innerH)
    .attr('stroke', '#e8d5c4')
    .attr('stroke-dasharray', '3,4')
    .attr('stroke-width', 0.8);

  gClipped.selectAll('.decade-label')
    .data(decades)
    .join('text')
    .attr('class', 'decade-label')
    .attr('x', d => xScale(d) + 3)
    .attr('y', 14)
    .attr('font-size', '10px')
    .attr('font-family', 'var(--font-body)')
    .attr('fill', '#b89588')
    .text(d => d);

  // Dots
  const dots = gClipped.selectAll('.book-dot')
    .data(allPoints)
    .join('circle')
    .attr('class', 'book-dot')
    .attr('cx', d => xScale(d.year))
    .attr('cy', d => yRand(d))
    .attr('r', d => rScale(d.unified_popularity || 1))
    .attr('fill', d => {
      if (highlightGenre && !(d.genres || []).map(g => g.toLowerCase()).includes(highlightGenre.toLowerCase()))
        return 'rgba(232,213,196,0.3)';
      return bookColor(d, colorMode);
    })
    .attr('opacity', d => {
      if (highlightGenre && !(d.genres || []).map(g => g.toLowerCase()).includes(highlightGenre.toLowerCase()))
        return 0.25;
      return 0.75;
    })
    .attr('stroke', 'rgba(44,24,16,0.1)')
    .attr('stroke-width', 0.5)
    .attr('cursor', 'pointer');

  // Tooltip
  const tooltip = document.getElementById('timeline-tooltip');

  dots.on('mouseenter', (event, d) => {
    d3.select(event.currentTarget).attr('r', rScale(d.unified_popularity || 1) + 2).attr('opacity', 1);
    if (tooltip) {
      tooltip.style.display = '';
      tooltip.innerHTML = `
        <strong style="font-family:var(--font-body);font-size:0.85rem;">${d.title}</strong>
        <div style="color:var(--text-faint);font-size:0.7rem;">${d.author || ''} · ${d.year || ''}</div>
        ${d.genres ? `<div style="color:var(--text-faint);font-size:0.7rem;">${(d.genres).slice(0,2).join(', ')}</div>` : ''}
      `;
      const rect = svgEl.getBoundingClientRect();
      tooltip.style.left = `${event.clientX - rect.left + 10}px`;
      tooltip.style.top  = `${event.clientY - rect.top  - 40}px`;
    }
  })
  .on('mouseleave', (event, d) => {
    d3.select(event.currentTarget).attr('r', rScale(d.unified_popularity || 1)).attr('opacity', 0.75);
    if (tooltip) tooltip.style.display = 'none';
  })
  .on('click', (_, d) => {
    window.location.href = `book.html?id=${d.id}`;
  });

  // Zoom
  const zoom = d3.zoom()
    .scaleExtent([1, 20])
    .translateExtent([[0, 0], [innerW, innerH]])
    .on('zoom', (event) => {
      const newX = event.transform.rescaleX(xScale);
      drawAxis(newX);
      gClipped.selectAll('.book-dot').attr('cx', d => newX(d.year));
      gClipped.selectAll('.decade-line').attr('x1', d => newX(d)).attr('x2', d => newX(d));
      gClipped.selectAll('.decade-label').attr('x', d => newX(d) + 3);
    });

  _zoom = zoom;
  svg.call(zoom);
  if (resetZoom) svg.call(zoom.transform, d3.zoomIdentity);
}

function hashCode(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
