"""
Fetch Open Library works dump + ratings + reading log.
Streams the gzipped TSV line-by-line to avoid loading 3GB into memory.
Outputs: raw/ol_candidates.ndjson
"""
import gzip
import json
import re
import sys
import time
import urllib.request
from pathlib import Path
from tqdm import tqdm

from config import (
    RAW, DOCS, MIN_DESCRIPTION_LEN,
    OL_WORKS_DUMP_URL, OL_AUTHORS_DUMP_URL, OL_RATINGS_DUMP_URL, OL_READING_LOG_URL,
)

CANDIDATE_PATH = RAW / "ol_candidates.ndjson"
RATINGS_PATH   = RAW / "ol_ratings.json"
READING_PATH   = RAW / "ol_reading_counts.json"
AUTHORS_PATH   = RAW / "ol_authors_latest.txt.gz"

# ── Load existing book IDs for delta detection ─────────────────────────────────
def load_existing_ids():
    existing = DOCS / "books.json"
    if not existing.exists():
        return set()
    with open(existing) as f:
        books = json.load(f)
    return {b["id"] for b in books}

# ── Download helpers ───────────────────────────────────────────────────────────
def download_gz_stream(url: str, dest: Path):
    print(f"  Downloading {url.split('/')[-1]} → {dest.name}")
    req = urllib.request.Request(url, headers={"User-Agent": "BookNook/1.0 (book-recommendation-tool)"})
    with urllib.request.urlopen(req, timeout=300) as resp, open(dest, "wb") as f:
        total = int(resp.headers.get("Content-Length", 0))
        downloaded = 0
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)
            downloaded += len(chunk)
    print(f"  Downloaded {downloaded / 1e6:.1f} MB")

# ── Aggregate reading-log counts by work key ──────────────────────────────────
def build_reading_counts(reading_log_gz: Path) -> dict:
    """Returns {'/works/OL123W': count}"""
    counts: dict = {}
    print("  Aggregating reading log…")
    with gzip.open(reading_log_gz, "rt", encoding="utf-8", errors="replace") as f:
        for line in tqdm(f, desc="reading-log", unit=" lines", miniters=500_000):
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 2:
                wkey = parts[1]
                counts[wkey] = counts.get(wkey, 0) + 1
    return counts

# ── Aggregate ratings by work key ─────────────────────────────────────────────
def build_ratings(ratings_gz: Path) -> dict:
    """Returns {'/works/OL123W': {'count': n, 'sum': s}}"""
    ratings: dict = {}
    print("  Aggregating ratings…")
    with gzip.open(ratings_gz, "rt", encoding="utf-8", errors="replace") as f:
        for line in tqdm(f, desc="ratings", unit=" lines", miniters=500_000):
            parts = line.rstrip("\n").split("\t")
            # Format: work_key \t edition_key \t rating_value \t date
            if len(parts) < 3:
                continue
            wkey = parts[0]
            try:
                rating = float(parts[2])
            except ValueError:
                continue
            if wkey not in ratings:
                ratings[wkey] = {"count": 0, "sum": 0.0}
            ratings[wkey]["count"] += 1
            ratings[wkey]["sum"]   += rating
    return ratings

# ── Build author key → name map from OL authors dump ─────────────────────────
def build_author_names(authors_gz: Path) -> dict:
    """Returns {'/authors/OL123A': 'Author Name'}"""
    names: dict = {}
    print("  Building author name index…")
    with gzip.open(authors_gz, "rt", encoding="utf-8", errors="replace") as f:
        for line in tqdm(f, desc="authors", unit=" lines", miniters=500_000):
            parts = line.rstrip("\n").split("\t", 4)
            if len(parts) < 5 or parts[0] != "/type/author":
                continue
            key = parts[1]
            try:
                data = json.loads(parts[4])
                name = data.get("name") or data.get("personal_name") or data.get("fuller_name")
                if name:
                    names[key] = name.strip()
            except json.JSONDecodeError:
                continue
    print(f"  {len(names):,} author names indexed")
    return names

# ── Extract description text from OL work JSON ────────────────────────────────
def extract_description(data: dict) -> str:
    d = data.get("description", "")
    if isinstance(d, dict):
        d = d.get("value", "")
    return (d or "").strip()

# ── Normalize title / author for dedup ────────────────────────────────────────
_NORM_RE = re.compile(r"[^a-z0-9 ]")
def normalize(s: str) -> str:
    return _NORM_RE.sub("", s.lower()).strip()

# ── Main stream ────────────────────────────────────────────────────────────────
def stream_works(works_gz: Path, ratings: dict, read_counts: dict, existing_ids: set, author_names: dict) -> list:
    candidates = []
    seen_norm: set = set()

    print("  Streaming works dump…")
    with gzip.open(works_gz, "rt", encoding="utf-8", errors="replace") as f:
        for line in tqdm(f, desc="works", unit=" lines", miniters=500_000):
            parts = line.rstrip("\n").split("\t", 4)
            if len(parts) < 5 or parts[0] != "/type/work":
                continue
            key = parts[1]   # e.g. /works/OL123W
            work_id = key.split("/")[-1]
            try:
                data = json.loads(parts[4])
            except json.JSONDecodeError:
                continue

            # Language filter: keep if no language specified or English
            langs = data.get("original_languages", []) or data.get("languages", [])
            if langs and not any(
                l.get("key", "").endswith("eng") or l.get("key", "").endswith("en")
                for l in langs if isinstance(l, dict)
            ):
                continue

            desc = extract_description(data)
            if len(desc) < MIN_DESCRIPTION_LEN:
                continue

            title = data.get("title", "").strip()
            if not title:
                continue

            # Extract publication year
            year = None
            if data.get("first_publish_date"):
                m = re.search(r"\d{4}", str(data["first_publish_date"]))
                if m:
                    year = int(m.group())
            if year and year < 1800:
                continue

            # Authors
            author_keys = [a["author"]["key"] for a in data.get("authors", []) if isinstance(a, dict) and "author" in a]
            author_name = author_names.get(author_keys[0]) if author_keys else None

            # Subjects → genre tags
            subjects = data.get("subjects", [])
            if isinstance(subjects, list):
                subjects = [s if isinstance(s, str) else s.get("name", "") for s in subjects[:20]]
            else:
                subjects = []

            # ISBN (from covers or links — OL works don't directly store ISBN)
            isbn = None
            covers = data.get("covers", [])
            cover_id = covers[0] if covers else None
            cover_url = f"https://covers.openlibrary.org/b/id/{cover_id}-M.jpg" if cover_id else None

            # Ratings signal
            r = ratings.get(key, {})
            ol_ratings_count = r.get("count", 0)
            ol_avg_rating    = round(r["sum"] / r["count"], 2) if r.get("count") else None
            ol_reads_count   = read_counts.get(key, 0)

            # Dedup by normalized title (cross-work)
            norm_title = normalize(title)
            if norm_title in seen_norm:
                continue
            seen_norm.add(norm_title)

            candidates.append({
                "id":               work_id,
                "ol_key":           key,
                "title":            title,
                "description":      desc[:1000],
                "subjects":         subjects,
                "year":             year,
                "author_keys":      author_keys[:3],
                "cover_url":        cover_url,
                "ol_ratings_count": ol_ratings_count,
                "ol_avg_rating":    ol_avg_rating,
                "ol_reads_count":   ol_reads_count,
                # Populated later by 03_enrich.py / 04_clean.py
                "author":           author_name,
                "author_id":        None,
                "genres":           [],
                "tags":             [],
                "isbn":             None,
            })

    print(f"  {len(candidates):,} candidates after stream")
    return candidates

def main():
    print("=== 01_fetch_ol: Open Library fetch ===")
    existing_ids = load_existing_ids()
    print(f"  Existing books in dataset: {len(existing_ids):,}")

    # Download dumps if not cached
    works_gz   = RAW / "ol_works_latest.txt.gz"
    authors_gz = RAW / "ol_authors_latest.txt.gz"
    ratings_gz = RAW / "ol_ratings_latest.txt.gz"
    reading_gz = RAW / "ol_reading_log_latest.txt.gz"

    if not works_gz.exists():
        download_gz_stream(OL_WORKS_DUMP_URL, works_gz)
    else:
        print(f"  Using cached {works_gz.name}")

    if not authors_gz.exists():
        download_gz_stream(OL_AUTHORS_DUMP_URL, authors_gz)
    else:
        print(f"  Using cached {authors_gz.name}")

    if not ratings_gz.exists():
        download_gz_stream(OL_RATINGS_DUMP_URL, ratings_gz)
    else:
        print(f"  Using cached {ratings_gz.name}")

    if not reading_gz.exists():
        download_gz_stream(OL_READING_LOG_URL, reading_gz)
    else:
        print(f"  Using cached {reading_gz.name}")

    # Build aggregated signals
    author_names = build_author_names(authors_gz)
    ratings      = build_ratings(ratings_gz)
    read_counts  = build_reading_counts(reading_gz)

    # Stream works
    candidates = stream_works(works_gz, ratings, read_counts, existing_ids, author_names)

    # Write ndjson
    with open(CANDIDATE_PATH, "w") as f:
        for c in candidates:
            f.write(json.dumps(c) + "\n")

    print(f"  Wrote {len(candidates):,} candidates → {CANDIDATE_PATH}")

if __name__ == "__main__":
    main()
