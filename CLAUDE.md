# BookNook — Codebase Guide

Book recommendation + visualization site, statically hosted on GitHub Pages.

## Quick orientation

| Path | Purpose |
|---|---|
| `docs/` | Everything GitHub Pages serves |
| `docs/data/` | Generated data files (books.json, embeddings, etc.) |
| `pipeline/` | Python scripts that generate the data files |
| `.github/workflows/` | CI: monthly data refresh + Pages deploy |

## Running locally

```bash
# One-time setup
cd pipeline
pip install -r requirements.txt

# Seed ~500 books for development (fast, no bulk download)
python 00_seed.py

# Serve the site
python -m http.server 8000 --directory ../docs
# Open http://localhost:8000
```

## Full pipeline (monthly, also runs via GitHub Actions)

```bash
cd pipeline
python 01_fetch_ol.py        # Download Open Library bulk dump (~3GB, cached)
python 02_fetch_nyt.py       # NYT Books API bestseller signal (needs NYT_BOOKS_API_KEY)
python 03_fetch_hardcover.py # Hardcover community ratings (no auth)
python 04_clean.py           # Merge, dedup, rank top 10k
python 05_enrich.py          # Google Books gap-fill (needs GOOGLE_BOOKS_API_KEY)
python 06_label.py           # Claude Haiku LLM labels (needs ANTHROPIC_API_KEY)
python 07_embed.py           # sentence-transformers embeddings
python 08_umap.py            # UMAP 2D projection + KMeans clusters
python 09_author_graph.py    # Author similarity force graph
python 10_timeline.py        # Publication timeline buckets
python 11_serialize.py       # Write to docs/data/
```

## Secrets needed (GitHub repo Settings → Secrets)

| Secret | Required for |
|---|---|
| `ANTHROPIC_API_KEY` | LLM labeling (06_label.py). ~$8 one-time, ~$0.17/month after. |
| `NYT_BOOKS_API_KEY` | Bestseller signal (02_fetch_nyt.py). Free, get at developer.nytimes.com |
| `GOOGLE_BOOKS_API_KEY` | Description gap-fill (05_enrich.py). Free, 100 req/day. |

## Key architecture decisions

- **Static-only**: No server. All recommendations run in the browser.
- **Embeddings**: int8 quantized (3.7MB), lazy-loaded on first search.
- **NL search**: Transformers.js + all-MiniLM-L6-v2, loaded on first focus (~23MB, browser-cached).
- **Hybrid scoring**: 40% semantic + 25% profile sliders + 20% popularity + 15% recency.
- **Data freshness**: Open Library monthly dumps keep the catalog current. NYT/Hardcover add rating signal.

## Frontend structure

```
docs/js/
  state.js          — global reactive store (pub/sub)
  data.js           — fetch + cache books.json, embeddings.bin
  search.js         — cosine similarity + hybrid scoring
  filters.js        — slider/filter panel logic
  book-card.js      — <book-card> custom element + renderBookGrid()
  nl-search.js      — Transformers.js lazy loader
  viz/
    scatter.js      — regl-scatterplot UMAP view
    force-graph.js  — D3 author network
    bubble.js       — D3 genre/mood bubble chart
    radar.js        — Chart.js per-book radar
    timeline.js     — D3 publication timeline
  pages/
    home.js         — index.html controller
    book-detail.js  — book.html controller
    explore.js      — explore.html controller
    author-detail.js
    authors-graph.js
    timeline.js
```

## Design tokens

Warm & literary palette. All colors, spacing, and fonts defined in `docs/css/tokens.css`.
Primary accent: `#c0392b` (deep red). Background: `#fdf6ee` (warm cream).
