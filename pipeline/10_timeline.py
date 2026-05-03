"""
Build publication timeline buckets for the timeline visualization.
Groups books by decade/year, selects top books per bucket.
Outputs: umap/timeline.json — [{bucket_label, year_start, year_end, books: [...]}]
"""
import json
from collections import defaultdict
from config import LABELED, UMAP_DIR

BOOKS_PATH = LABELED / "books_labeled.json"
OUTPUT     = UMAP_DIR / "timeline.json"

TOP_PER_BUCKET = 100  # max books per time bucket

def get_bucket(year: int) -> tuple:
    """Returns (bucket_label, year_start, year_end)."""
    if year < 1900:
        century = (year // 100) * 100
        return (f"{century}s", century, century + 99)
    decade = (year // 10) * 10
    return (f"{decade}s", decade, decade + 9)

def main():
    print("=== 10_timeline: Building publication timeline ===")

    with open(BOOKS_PATH) as f:
        books = json.load(f)

    books_with_year = [b for b in books if b.get("year") and 1500 <= b["year"] <= 2030]
    print(f"  {len(books_with_year):,} books with valid year")

    buckets: dict = defaultdict(list)
    for b in books_with_year:
        label, y_start, y_end = get_bucket(b["year"])
        buckets[(label, y_start, y_end)].append(b)

    result = []
    for (label, y_start, y_end), bks in sorted(buckets.items(), key=lambda x: x[0][1]):
        # Sort by unified_popularity descending, take top N
        top = sorted(bks, key=lambda b: b.get("unified_popularity") or 0, reverse=True)[:TOP_PER_BUCKET]
        # Only store fields needed by timeline viz (keep small)
        slim = [{
            "id":                b["id"],
            "title":             b["title"],
            "author":            b.get("author", ""),
            "year":              b["year"],
            "genres":            b.get("genres", [])[:3],
            "cover_url":         b.get("cover_url", ""),
            "mood_dark":         b.get("mood_dark", 5),
            "pacing":            b.get("pacing", 5),
            "unified_popularity": b.get("unified_popularity", 0),
        } for b in top]
        result.append({
            "bucket_label": label,
            "year_start":   y_start,
            "year_end":     y_end,
            "book_count":   len(bks),
            "books":        slim,
        })

    with open(OUTPUT, "w") as f:
        json.dump(result, f)
    print(f"  Wrote {len(result)} buckets → {OUTPUT}")

if __name__ == "__main__":
    main()
