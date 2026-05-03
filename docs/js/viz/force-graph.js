// D3 force-directed author similarity graph
// Expects: nodes = [{id, name, book_count, genres, avg_rating}]
//          links = [{source, target, weight}]

const GENRE_COLORS = {
  fantasy:    '#8b5cf6', 'science fiction': '#06b6d4', scifi: '#06b6d4',
  mystery:    '#6366f1', thriller: '#dc2626', horror: '#991b1b',
  romance:    '#ec4899', literary: '#0d9488', 'literary fiction': '#0d9488',
  historical: '#d97706', nonfiction: '#16a34a', biography: '#16a34a',
  default:    '#b89588',
};

function nodeColor(node) {
  const genre = (node.genres || [])[0]?.toLowerCase();
  return GENRE_COLORS[genre] || GENRE_COLORS.default;
}

export function initForceGraph(svgId, { nodes, links }, { onSelect } = {}) {
  const svgEl = document.getElementById(svgId);
  if (!svgEl || !window.d3) return;
  const d3 = window.d3;

  const rect = svgEl.getBoundingClientRect();
  const W = rect.width || 800;
  const H = rect.height || 600;

  const svg = d3.select(`#${svgId}`)
    .attr('viewBox', `0 0 ${W} ${H}`)
    .call(d3.zoom().scaleExtent([0.3, 4]).on('zoom', e => g.attr('transform', e.transform)));

  const g = svg.append('g');

  // Size scale: node radius proportional to book_count
  const maxBooks = d3.max(nodes, d => d.book_count || 1);
  const rScale = d3.scaleSqrt().domain([1, maxBooks]).range([4, 18]);

  // Force simulation
  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).strength(l => (l.weight || 0.5) * 0.3))
    .force('charge', d3.forceManyBody().strength(-80))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collide', d3.forceCollide(d => rScale(d.book_count || 1) + 3));

  // Links
  const link = g.append('g').attr('class', 'links')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('class', 'link')
    .attr('stroke-width', l => Math.max(0.5, (l.weight || 0.5) * 2));

  // Nodes
  const node = g.append('g').attr('class', 'nodes')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', 'node')
    .call(d3.drag()
      .on('start', (event, d) => {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on('end', (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null; d.fy = null;
      })
    )
    .on('click', (event, d) => {
      event.stopPropagation();
      // Highlight connected nodes
      const connectedIds = new Set(links
        .filter(l => (l.source?.id || l.source) === d.id || (l.target?.id || l.target) === d.id)
        .flatMap(l => [l.source?.id || l.source, l.target?.id || l.target])
      );
      node.select('circle').attr('opacity', n => connectedIds.has(n.id) || n.id === d.id ? 1 : 0.25);
      link.attr('opacity', l => {
        const s = l.source?.id || l.source; const t = l.target?.id || l.target;
        return s === d.id || t === d.id ? 1 : 0.1;
      });
      if (onSelect) onSelect(d);
    });

  node.append('circle')
    .attr('r', d => rScale(d.book_count || 1))
    .attr('fill', nodeColor)
    .attr('stroke', d => d3.color(nodeColor(d)).darker(0.5).toString())
    .attr('stroke-width', 1.5);

  node.append('title').text(d => d.name);

  // Labels for larger nodes only
  node.filter(d => (d.book_count || 1) >= 3)
    .append('text')
    .text(d => d.name.split(' ').slice(-1)[0]) // last name only
    .attr('dy', d => rScale(d.book_count || 1) + 10)
    .attr('text-anchor', 'middle');

  // Click on background = deselect
  svg.on('click', () => {
    node.select('circle').attr('opacity', 1);
    link.attr('opacity', 1);
  });

  sim.on('tick', () => {
    link
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });
}
