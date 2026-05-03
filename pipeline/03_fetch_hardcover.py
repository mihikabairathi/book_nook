"""
Fetch community ratings from Hardcover GraphQL API (no auth needed).
Outputs: raw/hardcover_ratings.json — {isbn: {avg_rating, ratings_count, reads_count}}
"""
import json
import time
import urllib.request
from config import RAW

OUTPUT = RAW / "hardcover_ratings.json"
CANDIDATES = RAW / "ol_candidates.ndjson"
ENDPOINT = "https://api.hardcover.app/v1/graphql"

QUERY = """
query BooksByISBN($isbns: [String!]!) {
    books(where: {editions: {isbn_13: {_in: $isbns}}}) {
        id
        slug
        ratings_count
        rating
        reads_count
        editions(where: {isbn_13: {_in: $isbns}}) {
            isbn_13
        }
    }
}
"""

def hardcover_query(isbns: list) -> list:
    payload = json.dumps({"query": QUERY, "variables": {"isbns": isbns}}).encode()
    req = urllib.request.Request(
        ENDPOINT,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "BookNook/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            return data.get("data", {}).get("books", [])
    except Exception as e:
        print(f"  Hardcover request failed: {e}")
        return []

def main():
    print("=== 03_fetch_hardcover: Hardcover ratings ===")

    # Load ISBNs from candidates
    isbns = []
    if CANDIDATES.exists():
        with open(CANDIDATES) as f:
            for line in f:
                b = json.loads(line)
                if b.get("isbn"):
                    isbns.append(b["isbn"])
    print(f"  {len(isbns):,} ISBNs to look up")

    if not isbns:
        print("  No ISBNs found — writing empty file")
        OUTPUT.write_text("{}")
        return

    results: dict = {}
    batch_size = 50
    for i in range(0, len(isbns), batch_size):
        batch = isbns[i : i + batch_size]
        books = hardcover_query(batch)
        for book in books:
            for edition in book.get("editions", []):
                isbn = edition.get("isbn_13")
                if isbn:
                    results[isbn] = {
                        "avg_rating":    book.get("rating"),
                        "ratings_count": book.get("ratings_count", 0),
                        "reads_count":   book.get("reads_count", 0),
                    }
        time.sleep(0.1)

    print(f"  {len(results):,} Hardcover ratings fetched")
    with open(OUTPUT, "w") as f:
        json.dump(results, f)
    print(f"  Wrote → {OUTPUT}")

if __name__ == "__main__":
    main()
