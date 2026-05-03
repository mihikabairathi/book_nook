"""
Fetch NYT Books API bestseller data.
Uses /lists/overview.json — single call returning all current lists + books.
Outputs: raw/nyt_bestsellers.json — {isbn: {weeks_on_list, highest_rank, list_name}}

Requires NYT_BOOKS_API_KEY from developer.nytimes.com.
Make sure "Books API" is enabled under your App on the NYT portal.
"""
import json
import urllib.request
import urllib.error
from config import RAW, NYT_BOOKS_API_KEY

OUTPUT = RAW / "nyt_bestsellers.json"
OVERVIEW_URL = "https://api.nytimes.com/svc/books/v3/lists/overview.json"

def main():
    print("=== 02_fetch_nyt: NYT Books API ===")

    if not NYT_BOOKS_API_KEY:
        print("  NYT_BOOKS_API_KEY not set — writing empty file")
        OUTPUT.write_text("{}")
        return

    key = NYT_BOOKS_API_KEY.strip()
    print(f"  Using key: {key[:6]}… (len={len(key)})")

    url = f"{OVERVIEW_URL}?api-key={key}"
    req = urllib.request.Request(url, headers={"User-Agent": "BookNook/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:200]
        print(f"  NYT {e.code} error: {body}")
        print("  Writing empty file and continuing")
        OUTPUT.write_text("{}")
        return
    except Exception as e:
        print(f"  NYT request failed: {e}")
        OUTPUT.write_text("{}")
        return

    lists = data.get("results", {}).get("lists", [])
    print(f"  {len(lists)} lists in overview")

    results: dict = {}
    for lst in lists:
        list_name = lst.get("list_name_encoded", "")
        for book in lst.get("books", []):
            weeks = book.get("weeks_on_list", 1) or 1
            rank  = book.get("rank", 99)
            meta  = {
                "weeks_on_list": weeks,
                "highest_rank":  rank,
                "list_name":     list_name,
                "title":         book.get("title", ""),
                "author":        book.get("author", ""),
            }
            # Collect all ISBNs for this book (primary + extras)
            isbns = {book.get("primary_isbn13"), book.get("primary_isbn10")}
            for extra in book.get("isbns", []):
                isbns.add(extra.get("isbn13"))
                isbns.add(extra.get("isbn10"))
            for isbn in isbns:
                if isbn and len(isbn) >= 10:
                    if isbn not in results or results[isbn]["weeks_on_list"] < weeks:
                        results[isbn] = meta

    print(f"  {len(results):,} ISBN → NYT bestseller entries across {len(lists)} lists")
    with open(OUTPUT, "w") as f:
        json.dump(results, f)
    print(f"  Wrote → {OUTPUT}")

if __name__ == "__main__":
    main()
