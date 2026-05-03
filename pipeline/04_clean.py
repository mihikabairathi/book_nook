"""
Merge Open Library candidates with NYT + Hardcover signals.
Dedup, normalize genres, compute unified popularity score, rank, select top N.
Outputs: raw/books_clean.json
"""
import json
import math
import re
from pathlib import Path
from tqdm import tqdm

from config import RAW, TARGET_BOOKS, MIN_RATINGS, SUBJECT_MAP

CANDIDATES = RAW / "ol_candidates.ndjson"
NYT_DATA   = RAW / "nyt_bestsellers.json"
HC_DATA    = RAW / "hardcover_ratings.json"
OUTPUT     = RAW / "books_clean.json"

def normalize_str(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()

def extract_genres(subjects: list) -> tuple[list, list]:
    genres = []
    tags = []
    for s in subjects:
        if not isinstance(s, str):
            continue
        sl = s.lower()
        for kw, genre in SUBJECT_MAP.items():
            if kw in sl:
                if genre and genre not in genres:
                    genres.append(genre)
                break
        else:
            # Keep as a tag if short enough
            if len(s) < 40:
                tags.append(s)
    return genres[:5], tags[:10]

def unified_popularity(book: dict, nyt_map: dict, hc_map: dict) -> float:
    isbn = book.get("isbn") or ""
    nyt = nyt_map.get(isbn, {})
    hc  = hc_map.get(isbn, {})

    ol_reads    = book.get("ol_reads_count", 0) or 0
    nyt_weeks   = nyt.get("weeks_on_list", 0) or 0
    hc_reads    = hc.get("reads_count", 0) or 0

    score = (
        0.4 * math.log10(ol_reads + 1)
        + 0.3 * math.log10(nyt_weeks * 100 + 1)   # scale up NYT (small numbers)
        + 0.3 * math.log10(hc_reads + 1)
    )
    return round(score, 4)

def main():
    print("=== 04_clean: Merge + dedup + rank ===")

    # Load signals
    nyt_map = json.loads(NYT_DATA.read_text()) if NYT_DATA.exists() else {}
    hc_map  = json.loads(HC_DATA.read_text()) if HC_DATA.exists() else {}
    print(f"  NYT entries: {len(nyt_map):,}  Hardcover entries: {len(hc_map):,}")

    # Stream candidates
    candidates = []
    if not CANDIDATES.exists():
        print("  ERROR: ol_candidates.ndjson not found — run 01_fetch_ol.py first")
        raise SystemExit(1)

    with open(CANDIDATES) as f:
        for line in tqdm(f, desc="loading candidates"):
            candidates.append(json.loads(line))
    print(f"  {len(candidates):,} raw candidates")

    # Dedup by normalized title
    seen: dict = {}
    for c in candidates:
        key = normalize_str(c.get("title", ""))
        if key not in seen or (c.get("ol_reads_count") or 0) > (seen[key].get("ol_reads_count") or 0):
            seen[key] = c
    candidates = list(seen.values())
    print(f"  {len(candidates):,} after title dedup")

    # Filter: must have description + not too short a description
    candidates = [c for c in candidates if len(c.get("description", "")) >= 50]
    print(f"  {len(candidates):,} with descriptions")

    # Enrich genres from subjects
    for c in candidates:
        genres, tags = extract_genres(c.get("subjects", []))
        c["genres"] = genres
        c["tags"]   = tags
        c["unified_popularity"] = unified_popularity(c, nyt_map, hc_map)

        # Merge NYT data
        isbn = c.get("isbn") or ""
        nyt = nyt_map.get(isbn, {})
        c["nyt_weeks_on_list"] = nyt.get("weeks_on_list", 0)

        # Merge Hardcover data
        hc = hc_map.get(isbn, {})
        c["hardcover_avg_rating"]    = hc.get("avg_rating")
        c["hardcover_ratings_count"] = hc.get("ratings_count", 0)

        # author_id from author_keys or normalized author name
        if c.get("author"):
            c["author_id"] = normalize_str(c["author"]).replace(" ", "_")[:40]

    # Sort by unified popularity and take top N
    candidates.sort(key=lambda c: c["unified_popularity"], reverse=True)
    top = candidates[:TARGET_BOOKS]
    print(f"  Keeping top {len(top):,} books")

    with open(OUTPUT, "w") as f:
        json.dump(top, f)
    print(f"  Wrote → {OUTPUT}")

if __name__ == "__main__":
    main()
