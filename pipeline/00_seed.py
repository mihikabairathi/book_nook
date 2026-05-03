"""
Quick seed script: fetches ~500 popular books from the Open Library Search API
(no bulk dump needed) to bootstrap the dataset for local development.

Run this instead of the full 01_fetch_ol.py when:
- You just cloned the repo and want something to see immediately
- You don't want to download the 3GB OL dump yet

Usage: python 00_seed.py
Output: raw/ol_candidates.ndjson (500 books), then runs 04-11 automatically.
"""
import json
import time
import urllib.request
import urllib.parse
import subprocess
import sys
from pathlib import Path
from config import RAW, LABELED

SEARCH_URL = "https://openlibrary.org/search.json"
OUTPUT     = RAW / "ol_candidates.ndjson"

# Broad queries to get diverse popular books
QUERIES = [
    "bestseller fiction",
    "popular novel",
    "award winning fiction",
    "classic literature",
    "contemporary fiction",
    "popular nonfiction",
    "science fiction bestseller",
    "mystery thriller bestseller",
    "fantasy epic",
    "literary fiction",
    "romance bestseller",
    "young adult popular",
    "historical fiction",
    "biography memoir",
    "philosophy popular",
]

def search_ol(query: str, limit: int = 40) -> list:
    params = {
        "q": query,
        "limit": limit,
        "fields": "key,title,author_name,first_publish_year,subject,isbn,cover_i,"
                  "number_of_pages_median,ratings_average,ratings_count,readinglog_count,"
                  "first_sentence,subtitle",
    }
    url = SEARCH_URL + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "BookNook/1.0 (seed script)"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read()).get("docs", [])
    except Exception as e:
        print(f"  Search failed for '{query}': {e}")
        return []

def ol_doc_to_candidate(doc: dict) -> dict | None:
    title = doc.get("title", "").strip()
    if not title:
        return None

    # Build description: first_sentence → subtitle → subjects → placeholder
    desc = ""
    fs = doc.get("first_sentence")
    if isinstance(fs, dict):
        desc = fs.get("value", "")
    elif isinstance(fs, str):
        desc = fs

    if len(desc) < 30:
        sub = doc.get("subtitle", "")
        if isinstance(sub, str) and len(sub) >= 10:
            desc = sub

    if len(desc) < 30:
        subjects = doc.get("subject", [])
        if subjects:
            desc = f"A work covering: {', '.join(subjects[:6])}."

    if len(desc) < 30:
        authors = doc.get("author_name", [])
        desc = f"A book by {authors[0]}." if authors else f"A book titled {title}."

    authors = doc.get("author_name", [])
    author  = authors[0] if authors else ""
    isbn_list = doc.get("isbn", [])
    isbn = next((i for i in isbn_list if len(i) == 13), None) or (isbn_list[0] if isbn_list else None)
    cover_id = doc.get("cover_i")
    cover_url = f"https://covers.openlibrary.org/b/id/{cover_id}-M.jpg" if cover_id else None
    work_key = doc.get("key", "")
    work_id = work_key.split("/")[-1] if work_key else f"seed_{hash(title)}"
    subjects = doc.get("subject", [])[:15]
    year = doc.get("first_publish_year")

    import re
    author_id = re.sub(r"[^a-z0-9 ]", "", author.lower()).strip().replace(" ", "_")[:40]

    return {
        "id":               work_id,
        "ol_key":           work_key,
        "title":            title,
        "description":      desc[:1000],
        "subjects":         subjects if isinstance(subjects, list) else [],
        "year":             year,
        "author":           author,
        "author_id":        author_id,
        "author_keys":      [],
        "cover_url":        cover_url,
        "isbn":             isbn,
        "ol_ratings_count": doc.get("ratings_count", 0) or 0,
        "ol_avg_rating":    doc.get("ratings_average"),
        "ol_reads_count":   doc.get("readinglog_count", 0) or 0,
        "genres":           [],
        "tags":             [],
    }

def main():
    print("=== 00_seed: Quick seed from Open Library Search API ===")
    print("  (This collects ~500 popular books without downloading the 3GB bulk dump)")
    print()

    seen_ids: set = set()
    candidates = []

    for query in QUERIES:
        print(f"  Searching: '{query}'…")
        docs = search_ol(query, limit=40)
        for doc in docs:
            candidate = ol_doc_to_candidate(doc)
            if not candidate:
                continue
            if candidate["id"] in seen_ids:
                continue
            seen_ids.add(candidate["id"])
            candidates.append(candidate)
        time.sleep(0.3)  # be polite

    print(f"\n  Collected {len(candidates)} unique candidates")

    with open(OUTPUT, "w") as f:
        for c in candidates:
            f.write(json.dumps(c) + "\n")
    print(f"  Wrote → {OUTPUT}")

    print("\n  Running downstream pipeline (04_clean → 11_serialize)…")
    print("  (Skipping 01-03 since we already have candidates)\n")

    steps = ["04_clean.py", "05_enrich.py", "06_label.py", "07_embed.py",
             "08_umap.py", "09_author_graph.py", "10_timeline.py", "11_serialize.py"]

    import os
    os.chdir(Path(__file__).parent)
    for step in steps:
        print(f"  → {step}")
        result = subprocess.run([sys.executable, step], capture_output=False)
        if result.returncode != 0:
            print(f"  ERROR: {step} failed (exit {result.returncode})")
            print("  You can re-run it manually: python", step)
            sys.exit(1)

    print("\n✓ Seed complete. Open docs/index.html in a browser or run a local server:")
    print("  python -m http.server 8000 --directory docs/")

if __name__ == "__main__":
    main()
