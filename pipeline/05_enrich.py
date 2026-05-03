"""
Gap-fill missing descriptions + metadata using Google Books API.
Respects 90 req/day limit via checkpoint file.
Outputs: labeled/books_enriched.json (updates raw/books_clean.json in-place)
"""
import datetime
import json
import re
import time
import urllib.request
import urllib.parse
from tqdm import tqdm

from config import RAW, LABELED, GOOGLE_BOOKS_API_KEY, SUBJECT_MAP

INPUT      = RAW    / "books_clean.json"
OUTPUT     = LABELED / "books_enriched.json"
CHECKPOINT = RAW / "enrichment_checkpoint.json"

LABELED.mkdir(parents=True, exist_ok=True)

GOOGLE_BOOKS_URL = "https://www.googleapis.com/books/v1/volumes"
DAILY_LIMIT = 90  # stay under 100 free req/day

def google_books_fetch(query: str) -> dict | None:
    if not GOOGLE_BOOKS_API_KEY:
        return None
    params = {"q": query, "maxResults": 1, "key": GOOGLE_BOOKS_API_KEY}
    url = GOOGLE_BOOKS_URL + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "BookNook/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            items = data.get("items", [])
            if not items:
                return None
            return items[0].get("volumeInfo", {})
    except Exception:
        return None

def main():
    print("=== 05_enrich: Google Books gap-fill ===")

    with open(INPUT) as f:
        books = json.load(f)

    checkpoint = json.loads(CHECKPOINT.read_text()) if CHECKPOINT.exists() else {"count": 0, "date": ""}
    today = datetime.date.today().isoformat()
    if checkpoint.get("date") != today:
        checkpoint = {"count": 0, "date": today}

    needs_enrich = [b for b in books if len(b.get("description", "")) < 80 or not b.get("page_count")]
    print(f"  {len(needs_enrich):,} books need enrichment")

    if not GOOGLE_BOOKS_API_KEY:
        print("  GOOGLE_BOOKS_API_KEY not set — skipping enrichment")
        with open(OUTPUT, "w") as f:
            json.dump(books, f)
        return

    enriched = 0
    for book in tqdm(needs_enrich, desc="enriching"):
        if checkpoint["count"] >= DAILY_LIMIT:
            print(f"  Daily limit reached ({DAILY_LIMIT} req). Resume tomorrow.")
            break

        isbn = book.get("isbn")
        query = f"isbn:{isbn}" if isbn else f"intitle:{book['title']} inauthor:{book.get('author','')}"
        info = google_books_fetch(query)
        checkpoint["count"] += 1
        time.sleep(0.5)

        if not info:
            continue

        desc = info.get("description", "")
        if desc and len(desc) > len(book.get("description", "")):
            book["description"] = desc[:1000]
            enriched += 1

        if not book.get("page_count") and info.get("pageCount"):
            book["page_count"] = info["pageCount"]

        if not book.get("cover_url") and info.get("imageLinks", {}).get("thumbnail"):
            book["cover_url"] = info["imageLinks"]["thumbnail"].replace("http://", "https://")

        if not book.get("genres") and info.get("categories"):
            for cat in info["categories"]:
                cl = cat.lower()
                for kw, genre in SUBJECT_MAP.items():
                    if kw in cl and genre and genre not in book["genres"]:
                        book["genres"].append(genre)

    CHECKPOINT.write_text(json.dumps(checkpoint))
    print(f"  Enriched {enriched} books this run ({checkpoint['count']} API calls today)")

    with open(OUTPUT, "w") as f:
        json.dump(books, f)
    print(f"  Wrote {len(books):,} books → {OUTPUT}")

if __name__ == "__main__":
    main()
