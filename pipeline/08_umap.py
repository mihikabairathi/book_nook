"""
UMAP 2D projection of book embeddings + KMeans cluster labels.
Outputs: umap/umap_coords.json — [{id, x, y, cluster, cluster_label}]
"""
import json
import numpy as np
from pathlib import Path

import umap
from sklearn.cluster import KMeans
from sklearn.preprocessing import normalize

from config import LABELED, EMBED, UMAP_DIR, N_CLUSTERS, UMAP_NEIGHBORS, UMAP_MIN_DIST

BOOKS_PATH = LABELED / "books_labeled.json"
F32_PATH   = EMBED   / "embeddings_float32.npy"
INDEX_PATH = EMBED   / "book_id_index.json"
OUTPUT     = UMAP_DIR / "umap_coords.json"

def dominant_genre(book_ids_in_cluster: list, book_by_id: dict) -> str:
    counts: dict = {}
    for bid in book_ids_in_cluster:
        book = book_by_id.get(bid, {})
        for g in book.get("genres", []):
            counts[g] = counts.get(g, 0) + 1
    if not counts:
        return ""
    return max(counts, key=counts.get)

def main():
    print("=== 08_umap: UMAP + KMeans clustering ===")

    embeddings = np.load(str(F32_PATH))
    with open(INDEX_PATH) as f:
        book_ids = json.load(f)
    with open(BOOKS_PATH) as f:
        books = json.load(f)

    book_by_id = {b["id"]: b for b in books}
    print(f"  Embeddings shape: {embeddings.shape}")

    print("  Running UMAP…")
    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=UMAP_NEIGHBORS,
        min_dist=UMAP_MIN_DIST,
        metric="cosine",
        random_state=42,
        verbose=False,
    )
    coords_2d = reducer.fit_transform(embeddings)

    # Normalize to [-0.95, 0.95] for regl-scatterplot
    for dim in range(2):
        mn, mx = coords_2d[:, dim].min(), coords_2d[:, dim].max()
        coords_2d[:, dim] = (coords_2d[:, dim] - mn) / (mx - mn) * 1.9 - 0.95

    print("  Running KMeans clustering…")
    km = KMeans(n_clusters=N_CLUSTERS, random_state=42, n_init=10)
    cluster_labels = km.fit_predict(coords_2d)

    # Name each cluster by dominant genre
    cluster_book_ids: dict = {}
    for i, cid in enumerate(cluster_labels):
        cluster_book_ids.setdefault(int(cid), []).append(book_ids[i])

    cluster_names = {
        cid: dominant_genre(bids, book_by_id)
        for cid, bids in cluster_book_ids.items()
    }

    results = []
    for i, bid in enumerate(book_ids):
        c = int(cluster_labels[i])
        results.append({
            "id":            bid,
            "x":             round(float(coords_2d[i, 0]), 5),
            "y":             round(float(coords_2d[i, 1]), 5),
            "cluster":       c,
            "cluster_label": cluster_names.get(c, ""),
        })

    with open(OUTPUT, "w") as f:
        json.dump(results, f)
    print(f"  Wrote {len(results):,} coords → {OUTPUT}")

if __name__ == "__main__":
    main()
