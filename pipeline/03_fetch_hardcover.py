"""
Hardcover ratings — removed. OL works dump has no ISBNs so there is
nothing to query Hardcover with. Popularity ranking uses OL reading log
data instead.
"""
import json
from config import RAW

OUTPUT = RAW / "hardcover_ratings.json"

def main():
    print("=== 03_fetch_hardcover: skipped (no ISBNs available) ===")
    with open(OUTPUT, "w") as f:
        json.dump({}, f)

if __name__ == "__main__":
    main()
