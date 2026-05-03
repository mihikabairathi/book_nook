"""
Fetch NYT Books API bestseller lists for popularity signal.
Outputs: raw/nyt_bestsellers.json — {isbn: {weeks_on_list, highest_rank, list_name}}
"""
import json
import time
import urllib.request
import urllib.parse
from config import RAW, NYT_BOOKS_API_KEY

OUTPUT = RAW / "nyt_bestsellers.json"

NYT_LISTS_ENDPOINT   = "https://api.nytimes.com/svc/books/v3/lists/names.json"
NYT_HISTORY_ENDPOINT = "https://api.nytimes.com/svc/books/v3/lists/best-sellers/history.json"
NYT_LIST_ENDPOINT    = "https://api.nytimes.com/svc/books/v3/lists/{date}/{list}.json"

def nyt_get(url: str, params: dict = None) -> dict:
    if not NYT_BOOKS_API_KEY:
        print("  WARN: NYT_BOOKS_API_KEY not set — skipping NYT fetch")
        return {}
    p = {"api-key": NYT_BOOKS_API_KEY}
    if params:
        p.update(params)
    full_url = url + "?" + urllib.parse.urlencode(p)
    req = urllib.request.Request(full_url, headers={"User-Agent": "BookNook/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  NYT request failed: {e}")
        return {}

def main():
    print("=== 02_fetch_nyt: NYT Books API ===")

    if not NYT_BOOKS_API_KEY:
        print("  NYT_BOOKS_API_KEY not set — writing empty file")
        OUTPUT.write_text("{}")
        return

    results: dict = {}  # isbn → {weeks_on_list, highest_rank, list_name}

    # Get all list names
    data = nyt_get(NYT_LISTS_ENDPOINT)
    lists = data.get("results", [])
    print(f"  Found {len(lists)} NYT lists")

    # Fetch current + recent entries for major lists
    major_lists = [l["list_name_encoded"] for l in lists
                if any(kw in l.get("display_name", "").lower()
                for kw in ["fiction", "nonfiction", "young adult", "advice"])]

    for list_name in major_lists[:15]:  # stay well within 500 req/day limit
        # Current list
        data = nyt_get(f"https://api.nytimes.com/svc/books/v3/lists/current/{list_name}.json")
        for book in data.get("results", {}).get("books", []):
            isbns = [book.get("primary_isbn13"), book.get("primary_isbn10")]
            weeks = book.get("weeks_on_list", 1)
            rank  = book.get("rank", 99)
            for isbn in isbns:
                if isbn and len(isbn) > 5:
                    if isbn not in results or results[isbn]["weeks_on_list"] < weeks:
                        results[isbn] = {
                            "weeks_on_list": weeks,
                            "highest_rank":  rank,
                            "list_name":     list_name,
                            "title":         book.get("title", ""),
                            "author":        book.get("author", ""),
                        }
        time.sleep(0.12)  # ~8 req/s, well under 5 req/min

    print(f"  Found {len(results):,} ISBN → NYT bestseller entries")
    with open(OUTPUT, "w") as f:
        json.dump(results, f)
    print(f"  Wrote → {OUTPUT}")

if __name__ == "__main__":
    main()
