"""
LLM labeling with Claude Haiku via Message Batches API.
Labels each book with mood, pacing, tone, depth, themes, setting, etc.
Cost: ~$8.40 one-time for 10k books; ~$0.17/month incremental.
Outputs: labeled/books_labeled.json
"""
import json
import time
from tqdm import tqdm

import anthropic

from config import LABELED, ANTHROPIC_API_KEY, LABEL_MODEL, LABEL_FALLBACK

INPUT  = LABELED / "books_enriched.json"
OUTPUT = LABELED / "books_labeled.json"

BATCH_SIZE = 500  # fewer API round-trips; Batches API supports up to 10k

SYSTEM_PROMPT = """You are a literary analyst. Given a book's title, author, genre tags, and description, return ONLY a JSON object with these fields (all required):
- mood_dark: 0-10 (0=cozy/light, 10=dark/heavy)
- mood_emotional: 0-10 (0=flat, 10=deeply emotional)
- pacing: 0-10 (0=slow-burn, 10=fast-paced)
- tone_humor: 0-10 (0=serious, 10=comic/humorous)
- tone_dark: 0-10 (0=uplifting, 10=bleak/nihilistic)
- tone_literary: 0-10 (0=genre/commercial, 10=literary/experimental)
- character_focus: 0-10 (0=plot-driven, 10=character-driven)
- plot_focus: 0-10 (0=character-driven, 10=plot-driven)
- world_building: 0-10 (0=minimal, 10=rich/immersive)
- prose_style: "sparse" | "ornate" | "conversational"
- primary_theme: short string (e.g. "identity", "war", "love")
- themes: array of 3-6 theme strings
- setting_era: short string (e.g. "contemporary", "Victorian", "secondary world")
- setting_location: short string (e.g. "rural England", "New York", "unnamed kingdom")
- emotional_intensity: 0-10
- depth: 0-10 (0=light entertainment, 10=philosophically dense)
- hidden_gem_score: 0-10 (0=very popular/well-known, 10=deserves more readers)

Return ONLY valid JSON. No explanation."""

def build_user_prompt(book: dict) -> str:
    return f"""Title: {book.get('title', '')}
Author: {book.get('author', 'Unknown')}
Genres: {', '.join(book.get('genres', [])[:5])}
Description: {(book.get('description', ''))[:500]}"""

def label_batch(client: anthropic.Anthropic, books_to_label: list) -> dict:
    """Submit a message batch and poll until complete. Returns {custom_id: labels}."""

    requests = [
        {
            "custom_id": book["id"],
            "params": {
                "model":      LABEL_MODEL,
                "max_tokens": 512,
                "system":     SYSTEM_PROMPT,
                "messages":   [{"role": "user", "content": build_user_prompt(book)}],
            },
        }
        for book in books_to_label
    ]

    print(f"  Submitting batch of {len(requests)} requests…")
    batch = client.messages.batches.create(requests=requests)
    batch_id = batch.id
    print(f"  Batch ID: {batch_id}")

    while True:
        batch = client.messages.batches.retrieve(batch_id)
        counts = batch.request_counts
        print(f"  Status: {batch.processing_status}  "
              f"(processing={counts.processing} succeeded={counts.succeeded} errored={counts.errored})")
        if batch.processing_status == "ended":
            break
        time.sleep(30)

    results = {}
    for result in client.messages.batches.results(batch_id):
        cid = result.custom_id
        if result.result.type == "succeeded":
            content = result.result.message.content[0].text.strip()
            try:
                results[cid] = json.loads(content)
            except json.JSONDecodeError:
                print(f"  WARN: JSON parse failed for {cid}")
        else:
            print(f"  WARN: Request {cid} failed: {result.result.type}")

    return results

def label_single_fallback(client: anthropic.Anthropic, book: dict) -> dict | None:
    """Fallback: label one book with Sonnet when Haiku batch failed."""
    try:
        resp = client.messages.create(
            model=LABEL_FALLBACK,
            max_tokens=512,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": build_user_prompt(book)}],
        )
        return json.loads(resp.content[0].text.strip())
    except Exception as e:
        print(f"  Fallback failed for {book['id']}: {e}")
        return None

DEFAULT_LABELS = {
    "mood_dark": 5, "mood_emotional": 5, "pacing": 5,
    "tone_humor": 3, "tone_dark": 4, "tone_literary": 5,
    "character_focus": 6, "plot_focus": 5, "world_building": 5,
    "prose_style": "conversational", "primary_theme": "life",
    "themes": ["life", "relationships"], "setting_era": "unknown",
    "setting_location": "unknown", "emotional_intensity": 5,
    "depth": 5, "hidden_gem_score": 3,
}

def main():
    print("=== 06_label: Claude Haiku LLM labeling ===")

    with open(INPUT) as f:
        books = json.load(f)

    if not ANTHROPIC_API_KEY:
        print("  ANTHROPIC_API_KEY not set — applying default labels")
        for book in books:
            if book.get("mood_dark") is None:
                book.update(DEFAULT_LABELS)
        with open(OUTPUT, "w") as f:
            json.dump(books, f)
        return

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    # Load existing labeled books for delta detection.
    # This is populated from cache on CI, enabling incremental labeling across runs.
    existing_labels: dict = {}
    if OUTPUT.exists():
        with open(OUTPUT) as f:
            for b in json.load(f):
                if b.get("mood_dark") is not None:
                    existing_labels[b["id"]] = b

    needs_label    = [b for b in books if b["id"] not in existing_labels]
    already_labeled = [existing_labels[b["id"]] for b in books if b["id"] in existing_labels]
    print(f"  Books needing labels: {len(needs_label):,}  (already labeled: {len(already_labeled):,})")

    labeled_books = list(already_labeled)
    failed_ids: set = set()

    for i in tqdm(range(0, len(needs_label), BATCH_SIZE), desc="batches"):
        chunk = needs_label[i : i + BATCH_SIZE]
        results = label_batch(client, chunk)

        for book in chunk:
            labels = results.get(book["id"])
            if labels:
                book.update(labels)
            else:
                failed_ids.add(book["id"])
            labeled_books.append(book)

        # Write after every batch so a cancelled run saves partial progress
        with open(OUTPUT, "w") as f:
            json.dump(labeled_books, f)

    # Fallback for failures
    if failed_ids:
        print(f"  Retrying {len(failed_ids)} failures with Sonnet…")
        for book in needs_label:
            if book["id"] in failed_ids:
                labels = label_single_fallback(client, book)
                book.update(labels if labels else DEFAULT_LABELS)
                time.sleep(0.5)

    # Ensure every book has labels
    for book in labeled_books:
        if book.get("mood_dark") is None:
            book.update(DEFAULT_LABELS)

    with open(OUTPUT, "w") as f:
        json.dump(labeled_books, f)
    print(f"  Wrote {len(labeled_books):,} labeled books → {OUTPUT}")

if __name__ == "__main__":
    main()
