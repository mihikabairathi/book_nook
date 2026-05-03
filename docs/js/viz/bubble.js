// D3 circle packing bubble chart — genre by book count, colored by avg mood_dark
export function initBubble(svgId, books) {
  const svgEl = document.getElementById(svgId);
  if (!svgEl || !window.d3 || !books.length) return;
  const d3 = window.d3;

  // Aggregate genre stats
  const genreMap = {};
  for (const b of books) {
    for (const g of (b.genres || [])) {
      if (!genreMap[g]) genreMap[g] = { name: g, count: 0, darkSum: 0, topBooks: [] };
      genreMap[g].count++;
      genreMap[g].darkSum += b.mood_dark || 5;
      if (genreMap[g].topBooks.length < 5) genreMap[g].topBooks.push(b);
    }
  }

  const genres = Object.values(genreMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map(g => ({ ...g, avgDark: g.darkSum / g.count }));

  const W = svgEl.parentElement?.clientWidth || 280;
  const H = Math.max(200, W * 0.9);

  const svg = d3.select(`#${svgId}`)
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('height', H);

  // Color: red (dark) → warm cream (cozy)
  const colorScale = d3.scaleSequential()
    .domain([0, 10])
    .interpolator(d3.interpolateRgb('#fdf6ee', '#c0392b'));

  const pack = d3.pack()
    .size([W, H])
    .padding(4);

  const root = d3.hierarchy({ children: genres })
    .sum(d => d.count || 0);

  const nodes = pack(root).leaves();

  const g = svg.append('g');

  const circles = g.selectAll('g')
    .data(nodes)
    .join('g')
    .attr('transform', d => `translate(${d.x},${d.y})`)
    .attr('cursor', 'pointer');

  circles.append('circle')
    .attr('r', d => d.r)
    .attr('fill', d => colorScale(d.data.avgDark))
    .attr('stroke', 'rgba(44,24,16,0.12)')
    .attr('stroke-width', 1)
    .on('mouseenter', function(event, d) {
      d3.select(this).attr('stroke-width', 2).attr('stroke', 'var(--accent)');
      showBubbleTooltip(event, d.data);
    })
    .on('mouseleave', function() {
      d3.select(this).attr('stroke-width', 1).attr('stroke', 'rgba(44,24,16,0.12)');
      hideBubbleTooltip();
    })
    .on('click', (event, d) => {
      // Navigate to home with genre filter
      window.location.href = `index.html?genre=${encodeURIComponent(d.data.name)}`;
    });

  // Labels (only for larger bubbles)
  circles.filter(d => d.r > 22)
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .attr('font-family', 'var(--font-ui)')
    .attr('font-size', d => Math.min(12, d.r * 0.4))
    .attr('fill', d => d.data.avgDark > 5 ? '#fdf6ee' : '#2c1810')
    .attr('pointer-events', 'none')
    .text(d => d.data.name);

  circles.filter(d => d.r > 30)
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '1.4em')
    .attr('font-family', 'var(--font-mono)')
    .attr('font-size', d => Math.min(9, d.r * 0.3))
    .attr('fill', d => d.data.avgDark > 5 ? 'rgba(253,246,238,0.7)' : 'rgba(44,24,16,0.5)')
    .attr('pointer-events', 'none')
    .text(d => d.data.count);
}

let _ttEl = null;

function showBubbleTooltip(event, data) {
  if (!_ttEl) {
    _ttEl = document.createElement('div');
    _ttEl.style.cssText = `
      position: fixed; background: var(--bg-card); border: 1px solid var(--border-mid);
      border-radius: var(--radius); padding: 8px 12px; font-size: 0.75rem;
      box-shadow: var(--shadow); pointer-events: none; z-index: 100; max-width: 180px;
    `;
    document.body.appendChild(_ttEl);
  }
  _ttEl.innerHTML = `
    <strong style="font-family:var(--font-body); color:var(--text);">${data.name}</strong>
    <div style="color:var(--text-faint); margin-top:4px;">${data.count} books · avg mood ${data.avgDark.toFixed(1)}/10</div>
    <div style="margin-top:6px; color:var(--text-muted);">${data.topBooks.slice(0,3).map(b => b.title).join(', ')}</div>
  `;
  _ttEl.style.display = '';
  _ttEl.style.left = `${event.clientX + 12}px`;
  _ttEl.style.top  = `${event.clientY - 10}px`;
}

function hideBubbleTooltip() {
  if (_ttEl) _ttEl.style.display = 'none';
}
