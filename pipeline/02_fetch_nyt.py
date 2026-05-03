"""
Fetch NYT Books API bestseller lists for popularity signal.
Outputs: raw/nyt_bestsellers.json — {isbn: {weeks_on_list, highest_rank, list_name}}

Requires NYT_BOOKS_API_KEY from developer.nytimes.com.
IMPORTANT: after creating a key, go to your App settings on the portal
and make sure "Books API" is checked under enabled APIs.
"""
import json
import time
import urllib.request
import urllib.parse
from config import RAW, NYT_BOOKS_API_KEY

OUTPUT = RAW / "nyt_bestsellers.json"

NYT_LISTS_ENDPOINT = "https://api.nytimes.com/svc/books/v3/lists/names.json"

def nyt_get(url: str, params: dict = None) -> dict:
    p = {"api-key": NYT_BOOKS_API_KEY}
    if params:
        p.update(params)
    full_url = url + "?" + urllib.parse.urlencode(p)
    req = urllib.request.Request(full_url, headers={"User-Agent": "BookNook/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 401:
            print(f"  NYT 401 Unauthorized — API key is wrong or inactive")
        elif e.code == 403:
            print(f"  NYT 403 Forbidden — Books API not enabled for this key")
        elif e.code == 404:
            print(f"  NYT 404 — Books API likely not enabled; go to developer.nytimes.com → your App → enable 'Books API'")
        elif e.code == 429:
            print(f"  NYT 429 — rate limited, skipping")
        else:
            print(f"  NYT request failed: {e}")
        return {}
    except Exception as e:
        print(f"  NYT request failed: {e}")
        return {}

def main():
    print("=== 02_fetch_nyt: NYT Books API ===")

    if not NYT_BOOKS_API_KEY:
        print("  NYT_BOOKS_API_KEY not set — writing empty file")
        with open(OUTPUT, "w") as f:
            json.dump({}, f)
        return

    results: dict = {}

    data = nyt_get(NYT_LISTS_ENDPOINT)
    lists = data.get("results", [])
    print(f"  Found {len(lists)} NYT lists")

    if not lists:
        print("  No lists returned — writing empty file")
        with open(OUTPUT, "w") as f:
            json.dump({}, f)
        return

    major_lists = [l["list_name_encoded"] for l in lists
                   if any(kw in l.get("display_name", "").lower()
                          for kw in ["fiction", "nonfiction", "young adult", "advice"])]

    for list_name in major_lists[:15]:
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
        time.sleep(0.12)

    print(f"  Found {len(results):,} ISBN → NYT bestseller entries")
    with open(OUTPUT, "w") as f:
        json.dump(results, f)
    print(f"  Wrote → {OUTPUT}")

if __name__ == "__main__":
    main()
