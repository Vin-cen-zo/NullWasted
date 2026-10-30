import json
import logging
import re
from pathlib import Path
from typing import Any, Optional
import numpy as np

from app.core.ai_gateway import ai_gateway
from app.core.config import GEMINI_EMBEDDING_MODEL

logger = logging.getLogger("vector_store")

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "food_knowledge_base.json"
CACHE_PATH = Path(__file__).resolve().parent.parent / "data" / "food_embeddings_cache.json"
EMBEDDING_DIM = 3072


def _normalize_vector(vec: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vec))
    if norm > 1e-8:
        return (vec / norm).astype(np.float32)
    return vec.astype(np.float32)


def clean_culinary_query(text: str) -> str:
    """Removes non-culinary transactional boilerplate so semantic embedding focuses on food entities."""
    cleaned = text.lower().strip()
    cleaned = re.sub(
        r"\b(ada|sisa|tersisa|porsi|pcs|bungkus|kotak|buah|potong|cup|paket|loyang|"
        r"harga|normal|asli|rp|ribu|rb|k|baru|sudah|matang|masak|selesai|jam|menit|"
        r"lalu|suhu|ruang|siang|pagi|sore|malam|toko|tutup|lagi)\b",
        " ",
        cleaned,
    )
    cleaned = re.sub(r"[\d\.,\(\)\-]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned if len(cleaned) >= 3 else text.lower().strip()


def compute_deterministic_embedding(text: str, dim: int = 768) -> np.ndarray:
    """Computes a deterministic normalized 768-dim embedding using character/word n-gram hashing.
    Used as an instant (<1ms) offline fallback when Gemini Embedding API is unreachable.
    """
    cleaned = text.lower().strip()
    vec = np.zeros(dim, dtype=np.float32)

    words = cleaned.split()
    for word in words:
        h = 0
        for char in word:
            h = (h * 31 + ord(char)) & 0xFFFFFFFF
        idx = h % dim
        vec[idx] += 1.0

    for n in (3, 4):
        for i in range(len(cleaned) - n + 1):
            ngram = cleaned[i : i + n]
            h = 0
            for char in ngram:
                h = (h * 37 + ord(char)) & 0xFFFFFFFF
            idx = h % dim
            vec[idx] += 0.5

    return _normalize_vector(vec)


class LocalVectorStore:
    def __init__(
        self,
        data_file: Optional[Path] = None,
        cache_file: Optional[Path] = None,
    ) -> None:
        self.data_file = data_file or DATA_PATH
        self.cache_file = cache_file or CACHE_PATH
        self.items: list[dict[str, Any]] = []
        self.fallback_embeddings: list[np.ndarray] = []
        self.semantic_embeddings: dict[str, np.ndarray] = {}
        self._query_cache: dict[str, np.ndarray] = {}
        self._load_knowledge_base()

    def _build_item_corpus_text(self, item: dict[str, Any]) -> str:
        aliases_str = ", ".join(item.get("aliases", []))
        ingredients_str = ", ".join(item.get("ingredients", []))
        return (
            f"Hidangan: {item['canonical_name']}. "
            f"Nama lain: {aliases_str}. "
            f"Komposisi bahan: {ingredients_str}. "
            f"Kategori risiko BPOM: {item.get('category', '')}."
        )

    def _load_knowledge_base(self) -> None:
        if not self.data_file.exists():
            return
        with open(self.data_file, "r", encoding="utf-8") as f:
            self.items = json.load(f)

        for item in self.items:
            text_corpus = f"{item['canonical_name']} {' '.join(item.get('aliases', []))} {' '.join(item.get('ingredients', []))}"
            self.fallback_embeddings.append(compute_deterministic_embedding(text_corpus))

        self._load_or_generate_semantic_cache()

    def _load_or_generate_semantic_cache(self) -> None:
        """Loads 3072-dim embeddings from food_embeddings_cache.json or generates them once via gemini-embedding-001."""
        required_ids = {item["id"] for item in self.items}

        if self.cache_file.exists():
            try:
                with open(self.cache_file, "r", encoding="utf-8") as f:
                    cache_data = json.load(f)
                cached_vectors = cache_data.get("vectors", {})
                if (
                    cache_data.get("model") == GEMINI_EMBEDDING_MODEL
                    and cache_data.get("dimension") == EMBEDDING_DIM
                    and required_ids.issubset(set(cached_vectors.keys()))
                ):
                    for item_id, vec_list in cached_vectors.items():
                        arr = np.array(vec_list, dtype=np.float32)
                        if arr.shape == (EMBEDDING_DIM,):
                            self.semantic_embeddings[item_id] = _normalize_vector(arr)
                    if len(self.semantic_embeddings) >= len(required_ids):
                        logger.info(
                            f"Loaded {len(self.semantic_embeddings)} cached 3072-dim embeddings from {self.cache_file.name}."
                        )
                        return
            except Exception as e:
                logger.warning(f"Failed to read embeddings cache ({e}). Regenerating...")

        # Generate embeddings once via Gemini Embedding API (batch first, single fallback)
        corpus_texts = [self._build_item_corpus_text(item) for item in self.items]
        batch_vectors = ai_gateway.embed_texts_batch(corpus_texts, model=GEMINI_EMBEDDING_MODEL)

        if not batch_vectors:
            # Try individual embedding calls if batch endpoint was unavailable
            batch_vectors = []
            for text in corpus_texts:
                vec = ai_gateway.embed_text(text, model=GEMINI_EMBEDDING_MODEL)
                if not vec:
                    batch_vectors = None
                    break
                batch_vectors.append(vec)

        if batch_vectors and len(batch_vectors) == len(self.items):
            serializable_vectors: dict[str, list[float]] = {}
            for item, raw_vec in zip(self.items, batch_vectors):
                arr = _normalize_vector(np.array(raw_vec, dtype=np.float32))
                self.semantic_embeddings[item["id"]] = arr
                # Round floats to 6 decimal places to keep cache file compact (~1.5 MB)
                serializable_vectors[item["id"]] = [round(float(x), 6) for x in arr.tolist()]

            try:
                self.cache_file.parent.mkdir(parents=True, exist_ok=True)
                with open(self.cache_file, "w", encoding="utf-8") as f:
                    json.dump(
                        {
                            "model": GEMINI_EMBEDDING_MODEL,
                            "dimension": EMBEDDING_DIM,
                            "count": len(serializable_vectors),
                            "vectors": serializable_vectors,
                        },
                        f,
                    )
                logger.info(
                    f"Generated and cached {len(serializable_vectors)} real 3072-dim embeddings in {self.cache_file.name}."
                )
            except Exception as e:
                logger.warning(f"Could not write embeddings cache file: {e}")

    def _get_query_semantic_embedding(self, query_text: str) -> Optional[np.ndarray]:
        cleaned = clean_culinary_query(query_text)
        if cleaned in self._query_cache:
            return self._query_cache[cleaned]

        raw_vec = ai_gateway.embed_text(cleaned, model=GEMINI_EMBEDDING_MODEL)
        if raw_vec and len(raw_vec) == EMBEDDING_DIM:
            norm_vec = _normalize_vector(np.array(raw_vec, dtype=np.float32))
            self._query_cache[cleaned] = norm_vec
            return norm_vec
        return None

    def search_similar_dish(self, query_text: str) -> tuple[dict[str, Any], float]:
        """Finds closest canonical dish using Real Gemini 3072-dim Cosine Similarity + Lexical Anchor + N-Gram Fallback."""
        if not self.items:
            default_item = {
                "id": "bpom-default",
                "canonical_name": query_text.title(),
                "aliases": [query_text.lower()],
                "category": "MEDIUM_PERISHABILITY",
                "risk_level": "MEDIUM",
                "bpom_max_hours": 8.0,
                "regulation_ref": "PerBPOM No. 16/2019 Kategori Pangan Siap Saji",
                "hazard_description": "Pangan siap saji suhu ruang memiliki batas simpan aman 8 jam.",
            }
            return default_item, 0.90

        cleaned_query = query_text.lower().strip()
        culinary_focus = clean_culinary_query(query_text)

        # 1. Exact canonical or alias match check
        for item in self.items:
            canonical = item["canonical_name"].lower()
            aliases = [a.lower() for a in item.get("aliases", [])]
            if (
                cleaned_query == canonical
                or culinary_focus == canonical
                or any(cleaned_query == a or culinary_focus == a for a in aliases)
            ):
                return item, 0.98

        # 2. Identify longest matching lexical candidate substring (>= 4 chars)
        best_lexical_item: Optional[dict[str, Any]] = None
        best_match_len = 0
        for item in self.items:
            canonical = item["canonical_name"].lower()
            aliases = [a.lower() for a in item.get("aliases", [])]
            for cand in [canonical] + aliases:
                if len(cand) >= 4 and cand in cleaned_query:
                    if len(cand) > best_match_len:
                        best_match_len = len(cand)
                        best_lexical_item = item

        # 3. Real Semantic Vector Search (3072-dim Cosine Similarity dot product)
        if self.semantic_embeddings:
            q_sem = self._get_query_semantic_embedding(culinary_focus)
            if q_sem is not None:
                best_sem_item = self.items[0]
                best_sem_score = -1.0

                for item in self.items:
                    item_vec = self.semantic_embeddings.get(item["id"])
                    if item_vec is None:
                        continue
                    cosine_sim = float(np.dot(q_sem, item_vec))
                    # Apply small tie-breaker boost if this item also has the longest exact phrase match in query
                    if best_lexical_item is not None and item["id"] == best_lexical_item["id"] and best_match_len >= 5:
                        cosine_sim += 0.12
                    if cosine_sim > best_sem_score:
                        best_sem_score = cosine_sim
                        best_sem_item = item

                norm_score = max(0.80, min(0.99, round(float(best_sem_score), 2)))
                return best_sem_item, norm_score

        # 4. Graceful Fallback when API is offline: Lexical match + 768-dim deterministic n-gram hash
        if best_lexical_item and best_match_len >= 4:
            return best_lexical_item, 0.96

        q_fallback = compute_deterministic_embedding(culinary_focus)
        best_item = self.items[0]
        best_score = -1.0

        for item, emb in zip(self.items, self.fallback_embeddings):
            cosine_sim = float(np.dot(q_fallback, emb))
            if cosine_sim > best_score:
                best_score = cosine_sim
                best_item = item

        norm_score = max(0.80, min(0.98, round(float(best_score), 2)))
        return best_item, norm_score


vector_store = LocalVectorStore()
