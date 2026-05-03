import { loadBooks, loadAuthorGraph } from '../data.js';
import { getState } from '../state.js';
import { initForceGraph } from '../viz/force-graph.js';

export async function initAuthorsGraph() {
  await loadBooks();
  await loadAuthorGraph();

  const { authorGraph, books } = getState();

  const loadingEl = document.getElementById('force-loading');

  if (!authorGraph || !authorGraph.nodes?.length) {
    if (loadingEl) loadingEl.innerHTML =
      '<p style="color:var(--text-muted); font-size:0.9rem;">Author graph not yet generated — run the pipeline first.</p>';
    return;
  }

  if (loadingEl) loadingEl.style.display = 'none';

  // Build author_id -> books lookup
  const authorBooks = {};
  for (const b of books) {
    if (!authorBooks[b.author_id]) authorBooks[b.author_id] = [];
    authorBooks[b.author_id].push(b);
  }

  initForceGraph('force-svg', authorGraph, {
    onSelect: (node) => showAuthorSidebar(node, authorBooks[node.id] || [], authorGraph),
  });

  // Sidebar close
  document.getElementById('sidebar-close')?.addEventListener('click', () => {
    document.getElementById('author-sidebar')?.classList.remove('open');
  });
}

function showAuthorSidebar(node, books, graph) {
  const sidebar = document.getElementById('author-sidebar');
  if (!sidebar) return;

  document.getElementById('sidebar-author-name').textContent = node.name;
  document.getElementById('sidebar-author-meta').textContent =
    `${node.book_count || books.length} book${node.book_count !== 1 ? 's' : ''} · ${(node.genres || []).slice(0,3).join(', ')}`;
  document.getElementById('sidebar-author-link').href = `author.html?id=${node.id}`;

  // Books list (top 5 by popularity)
  const booksEl = document.getElementById('sidebar-books');
  const topBooks = [...books]
    .sort((a, b) => (b.unified_popularity || 0) - (a.unified_popularity || 0))
    .slice(0, 5);

  booksEl.innerHTML = topBooks.map(b => `
    <a href="book.html?id=${b.id}"
       style="display:block; padding:6px 0; text-decoration:none; border-bottom:1px solid var(--border); font-size:0.8rem;"
       onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color=''">
      <div style="color:var(--text); line-height:1.3;">${b.title}</div>
      <div style="color:var(--text-faint); font-size:0.7rem;">${b.year || ''}</div>
    </a>
  `).join('');

  // Similar authors from graph
  const similarEl = document.getElementById('sidebar-similar');
  const links = graph.links.filter(l =>
    (l.source === node.id || l.source?.id === node.id) ||
    (l.target === node.id || l.target?.id === node.id)
  );
  const neighborIds = new Set(links.map(l => {
    const sid = l.source?.id || l.source;
    const tid = l.target?.id || l.target;
    return sid === node.id ? tid : sid;
  }));
  const neighbors = graph.nodes.filter(n => neighborIds.has(n.id)).slice(0, 4);

  similarEl.innerHTML = neighbors.map(n => `
    <a href="author.html?id=${n.id}"
       style="display:block; padding:4px 0; font-size:0.8rem; color:var(--accent); text-decoration:none;"
       onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration=''">
      ${n.name}
    </a>
  `).join('');

  sidebar.classList.add('open');
}
