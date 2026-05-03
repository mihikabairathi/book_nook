import os
from pathlib import Path

# ── API keys (values come from environment; NEVER hardcode here) ──────────────
ANTHROPIC_API_KEY    = os.environ.get("ANTHROPIC_API_KEY", "")
NYT_BOOKS_API_KEY    = os.environ.get("NYT_BOOKS_API_KEY", "")
GOOGLE_BOOKS_API_KEY = os.environ.get("GOOGLE_BOOKS_API_KEY", "")

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT     = Path(__file__).parent
RAW      = ROOT / "raw"
LABELED  = ROOT / "labeled"
EMBED    = ROOT / "embeddings"
UMAP_DIR = ROOT / "umap"
GRAPH    = ROOT / "graph"
DOCS     = ROOT.parent / "docs" / "data"

for d in [RAW, LABELED, EMBED, UMAP_DIR, GRAPH]:
    d.mkdir(parents=True, exist_ok=True)

# ── Pipeline settings ──────────────────────────────────────────────────────────
TARGET_BOOKS        = 10_000   # max books to keep after ranking
MIN_DESCRIPTION_LEN = 50       # chars
MIN_RATINGS         = 100      # min ratings count (goodbooks-10k exempt)
EMBED_MODEL         = "all-MiniLM-L6-v2"
EMBED_DIMS          = 384
UMAP_NEIGHBORS      = 15
UMAP_MIN_DIST       = 0.1
N_CLUSTERS          = 20
LABEL_MODEL         = "claude-haiku-4-5-20251001"
LABEL_FALLBACK      = "claude-sonnet-4-6"

# ── Open Library dump URL ──────────────────────────────────────────────────────
OL_WORKS_DUMP_URL   = "https://openlibrary.org/data/ol_dump_works_latest.txt.gz"
OL_RATINGS_DUMP_URL = "https://openlibrary.org/data/ol_dump_ratings_latest.txt.gz"
OL_READING_LOG_URL  = "https://openlibrary.org/data/ol_dump_reading-log_latest.txt.gz"
