"""
Final step: serialize all pipeline outputs to docs/data/ for GitHub Pages.
Writes:
  docs/data/books.json
  docs/data/embeddings_int8.bin
  docs/data/umap_coords.json
  docs/data/author_graph.json
  docs/data/timeline.json
  docs/data/meta.json
"""
import json
import shutil
import hashlib
import datetime
from pathlib import Path

from config import LABELED, EMBED, UMAP_DIR, GRAPH, DOCS

BOOKS_SRC   = LABELED  / "books_labeled.json"
INT8_SRC    = EMBED    / "embeddings_int8.bin"
UMAP_SRC    = UMAP_DIR / "umap_coords.json"
GRAPH_SRC   = GRAPH    / "author_graph.json"
TIMELINE_SRC= UMAP_DIR / "timeline.json"

DOCS.mkdir(parents=True, exist_ok=True)

def copy_file(src: Path, dest: Path):
    if not src.exists():
        print(f"  WARN: {src.name} not found — skipping")
        return
    shutil.copy2(src, dest)
    mb = dest.stat().st_size / 1e6
    print(f"  {dest.name}  ({mb:.1f} MB)")

def main():
    print("=== 11_serialize: Writing to docs/data/ ===")

    # books.json — prune heavy fields not needed by frontend
    if BOOKS_SRC.exists():
        with open(BOOKS_SRC) as f:
            books = json.load(f)

        # Remove pipeline-internal fields; keep only frontend fields
        keep = {
            "id","title","author","author_id","year","isbn","cover_url","description",
            "genres","tags","ol_avg_rating","ol_ratings_count","hardcover_avg_rating",
            "hardcover_ratings_count","nyt_weeks_on_list","unified_popularity","page_count",
            "mood_dark","mood_emotional","pacing","tone_humor","tone_dark","tone_literary",
            "character_focus","plot_focus","world_building","prose_style","primary_theme",
            "themes","setting_era","setting_location","emotional_intensity","depth",
            "hidden_gem_score","embed_idx",
        }
        slim_books = [{k: b[k] for k in keep if k in b} for b in books]

        out_path = DOCS / "books.json"
        with open(out_path, "w") as f:
            json.dump(slim_books, f, separators=(",", ":"))  # compact JSON
        mb = out_path.stat().st_size / 1e6
        print(f"  books.json  ({mb:.1f} MB, {len(slim_books):,} books)")
    else:
        print("  WARN: books_labeled.json not found")
        books = []

    # Binary embeddings
    copy_file(INT8_SRC, DOCS / "embeddings_int8.bin")

    # UMAP coords
    copy_file(UMAP_SRC, DOCS / "umap_coords.json")

    # Author graph
    copy_file(GRAPH_SRC, DOCS / "author_graph.json")

    # Timeline
    copy_file(TIMELINE_SRC, DOCS / "timeline.json")

    # meta.json
    meta = {
        "pipeline_run":    datetime.datetime.utcnow().isoformat() + "Z",
        "book_count":      len(books),
        "schema_version":  "1.0",
    }
    (DOCS / "meta.json").write_text(json.dumps(meta, indent=2))
    print(f"  meta.json  ({len(books):,} books, run: {meta['pipeline_run'][:10]})")
    print("=== Done ===")

if __name__ == "__main__":
    main()
