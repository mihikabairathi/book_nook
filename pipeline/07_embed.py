"""
Generate sentence-transformers embeddings for all books.
Uses all-MiniLM-L6-v2 (384 dims, L2-normalized).
Outputs:
  embeddings/embeddings_float32.npy
  embeddings/embeddings_int8.bin  (raw bytes, no header)
  embeddings/book_id_index.json   (ordered list of book IDs)
"""
import json
import numpy as np
from pathlib import Path
from tqdm import tqdm

from sentence_transformers import SentenceTransformer

from config import LABELED, EMBED, EMBED_MODEL, EMBED_DIMS

INPUT = LABELED / "books_labeled.json"
F32   = EMBED   / "embeddings_float32.npy"
INT8  = EMBED   / "embeddings_int8.bin"
INDEX = EMBED   / "book_id_index.json"

def build_text(book: dict) -> str:
    title  = book.get("title", "")
    author = book.get("author", "")
    desc   = (book.get("description", ""))[:400]
    themes = ", ".join(book.get("themes", [])[:5])
    mood   = f"mood {'dark' if (book.get('mood_dark') or 5) > 6 else 'cozy' if (book.get('mood_dark') or 5) < 4 else 'balanced'}"
    era    = book.get("setting_era", "")
    loc    = book.get("setting_location", "")
    genres = ", ".join(book.get("genres", [])[:3])
    return f"{title} by {author}. {desc} Genres: {genres}. Themes: {themes}. {mood}. Setting: {era} {loc}.".strip()

def main():
    print("=== 07_embed: Generating embeddings ===")

    with open(INPUT) as f:
        books = json.load(f)
    print(f"  {len(books):,} books to embed")

    if not books:
        print("  No books to embed — writing empty outputs")
        np.save(str(F32), np.zeros((0, EMBED_DIMS), dtype=np.float32))
        INT8.write_bytes(b"")
        with open(INDEX, "w") as f:
            json.dump([], f)
        return

    model = SentenceTransformer(EMBED_MODEL)
    print(f"  Model: {EMBED_MODEL} ({EMBED_DIMS} dims)")

    texts = [build_text(b) for b in books]
    embeddings = model.encode(
        texts,
        batch_size=64,
        show_progress_bar=True,
        normalize_embeddings=True,  # L2 normalize → cosine = dot product
        convert_to_numpy=True,
    )

    assert embeddings.shape == (len(books), EMBED_DIMS), f"Unexpected shape: {embeddings.shape}"
    print(f"  Shape: {embeddings.shape}")

    # Save float32
    np.save(str(F32), embeddings.astype(np.float32))
    print(f"  Saved float32 → {F32} ({F32.stat().st_size / 1e6:.1f} MB)")

    # Save int8 (quantize: multiply by 127, clip to [-127, 127])
    int8 = np.clip(np.round(embeddings * 127), -127, 127).astype(np.int8)
    int8.tofile(str(INT8))
    print(f"  Saved int8 → {INT8} ({INT8.stat().st_size / 1e6:.1f} MB)")

    # Add embed_idx to each book and save index
    book_ids = []
    for i, book in enumerate(books):
        book["embed_idx"] = i
        book_ids.append(book["id"])

    with open(INDEX, "w") as f:
        json.dump(book_ids, f)

    # Write back books with embed_idx
    with open(INPUT, "w") as f:
        json.dump(books, f)

    print(f"  Wrote book_id_index.json ({len(book_ids)} entries)")

if __name__ == "__main__":
    main()
