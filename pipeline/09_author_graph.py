"""
Build author similarity graph.
Author embedding = mean of their books' embeddings.
Top-5 most similar authors per author = edges.
Outputs: graph/author_graph.json — {nodes, links}
"""
import json
import numpy as np
from collections import defaultdict
from config import LABELED, EMBED, GRAPH

BOOKS_PATH = LABELED / "books_labeled.json"
F32_PATH   = EMBED   / "embeddings_float32.npy"
OUTPUT     = GRAPH   / "author_graph.json"
MAX_AUTHORS = 500
TOP_K_EDGES = 5

def main():
    print("=== 09_author_graph: Author similarity graph ===")

    with open(BOOKS_PATH) as f:
        books = json.load(f)
    embeddings = np.load(str(F32_PATH))

    # Group books by author_id
    author_books: dict = defaultdict(list)
    for b in books:
        if b.get("author_id") and b.get("embed_idx") is not None:
            author_books[b["author_id"]].append(b)

    # Sort by book_count, keep top MAX_AUTHORS
    sorted_authors = sorted(author_books.items(), key=lambda x: len(x[1]), reverse=True)[:MAX_AUTHORS]
    print(f"  {len(sorted_authors)} authors selected")

    if not sorted_authors:
        print("  No authors with embed_idx found — writing empty graph")
        with open(OUTPUT, "w") as f:
            json.dump({"nodes": [], "links": []}, f)
        print(f"  Wrote → {OUTPUT}")
        return

    # Compute author embeddings (mean of books)
    author_vecs = {}
    author_meta = {}
    for aid, ab in sorted_authors:
        vecs = np.stack([embeddings[b["embed_idx"]] for b in ab])
        mean_vec = vecs.mean(axis=0)
        # L2 normalize
        norm = np.linalg.norm(mean_vec)
        author_vecs[aid] = mean_vec / (norm + 1e-10)

        # Aggregate genre info
        genre_counts: dict = {}
        for b in ab:
            for g in b.get("genres", []):
                genre_counts[g] = genre_counts.get(g, 0) + 1
        top_genres = sorted(genre_counts, key=genre_counts.get, reverse=True)[:3]

        avg_r = sum(b.get("ol_avg_rating") or 0 for b in ab)
        avg_r /= len(ab)

        author_meta[aid] = {
            "id":        aid,
            "name":      ab[0].get("author", aid),
            "book_count": len(ab),
            "genres":    top_genres,
            "avg_rating": round(avg_r, 2) if avg_r else None,
        }

    # Build similarity matrix (cosine = dot product since normalized)
    ids = list(author_vecs.keys())
    mat = np.stack([author_vecs[a] for a in ids])  # (n_authors, 384)
    sim_matrix = mat @ mat.T  # (n_authors, n_authors)

    # Build edges: top-5 per author (excluding self)
    links = []
    seen_pairs: set = set()
    for i, aid in enumerate(ids):
        sims = sim_matrix[i].copy()
        sims[i] = -1  # exclude self
        top_indices = np.argsort(sims)[::-1][:TOP_K_EDGES]
        for j in top_indices:
            pair = tuple(sorted([i, j]))
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            links.append({
                "source": ids[i],
                "target": ids[j],
                "weight": round(float(sims[j]), 4),
            })

    nodes = list(author_meta.values())
    print(f"  {len(nodes)} nodes, {len(links)} edges")

    with open(OUTPUT, "w") as f:
        json.dump({"nodes": nodes, "links": links}, f)
    print(f"  Wrote → {OUTPUT}")

if __name__ == "__main__":
    main()
