import asyncio
import logging
from typing import Any, Optional
import httpx
from app.core.config import GEMINI_EMBEDDING_MODEL, GEMINI_MODEL, get_active_api_keys

logger = logging.getLogger("ai_gateway")

DEFAULT_TIMEOUT = httpx.Timeout(25.0, connect=10.0, read=25.0)
DEFAULT_LIMITS = httpx.Limits(max_keepalive_connections=20, max_connections=50, keepalive_expiry=30.0)


class AIGateway:
    def __init__(self) -> None:
        self.api_keys = get_active_api_keys()
        self._key_index = 0
        self._async_client: Optional[httpx.AsyncClient] = None
        self._client_loop: Optional[asyncio.AbstractEventLoop] = None

    def get_async_client(self) -> httpx.AsyncClient:
        try:
            running_loop: Optional[asyncio.AbstractEventLoop] = asyncio.get_running_loop()
        except RuntimeError:
            running_loop = None

        if (
            self._async_client is None
            or self._async_client.is_closed
            or self._client_loop is not running_loop
            or (self._client_loop is not None and self._client_loop.is_closed())
        ):
            self._async_client = httpx.AsyncClient(
                timeout=DEFAULT_TIMEOUT,
                limits=DEFAULT_LIMITS,
            )
            self._client_loop = running_loop
        return self._async_client

    async def close(self) -> None:
        if self._async_client is not None and not self._async_client.is_closed:
            try:
                running_loop: Optional[asyncio.AbstractEventLoop] = asyncio.get_running_loop()
            except RuntimeError:
                running_loop = None

            if self._client_loop is None or (
                not self._client_loop.is_closed() and self._client_loop is running_loop
            ):
                try:
                    await self._async_client.aclose()
                except RuntimeError:
                    pass
            self._async_client = None
            self._client_loop = None

    def _get_next_key(self) -> Optional[str]:
        self.api_keys = get_active_api_keys()
        if not self.api_keys:
            return None
        key = self.api_keys[self._key_index % len(self.api_keys)]
        self._key_index = (self._key_index + 1) % len(self.api_keys)
        return key

    async def generate_content(
        self, prompt: str, audio_base64: Optional[str] = None, model: str = GEMINI_MODEL
    ) -> Optional[str]:
        """Calls Gemini LLM API (gemini-3.5-flash-lite) with round-robin key pool and silent auto-failover."""
        active_keys = get_active_api_keys()
        if not active_keys:
            logger.info("No active Gemini API keys configured. Using deterministic local fallback.")
            return None

        candidate_models = [model]
        for alt in ["gemini-3.5-flash-lite", "gemini-flash-lite-latest"]:
            if alt not in candidate_models:
                candidate_models.append(alt)

        attempts = min(3, len(active_keys))
        for target_model in candidate_models:
            for _ in range(attempts):
                key = self._get_next_key()
                if not key:
                    break

                url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent?key={key}"
                parts: list[dict[str, Any]] = [{"text": prompt}]
                if audio_base64:
                    parts.append({
                        "inline_data": {
                            "mime_type": "audio/webm",
                            "data": audio_base64,
                        }
                    })

                payload = {
                    "contents": [{"parts": parts}],
                    "generationConfig": {
                        "temperature": 0.1,
                        "response_mime_type": "application/json",
                    },
                }

                try:
                    client = self.get_async_client()
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        candidates = data.get("candidates", [])
                        if candidates:
                            content_parts = candidates[0].get("content", {}).get("parts", [])
                            if content_parts:
                                return content_parts[0].get("text", "")
                    elif resp.status_code == 404:
                        logger.warning(
                            f"Gemini model {target_model} returned HTTP 404 (model not found). Skipping model."
                        )
                        break
                    elif resp.status_code in (429, 403, 503):
                        logger.warning(
                            f"Gemini model {target_model} returned HTTP {resp.status_code}. Rotating key/model."
                        )
                        continue
                except Exception as e:
                    logger.warning(f"Error calling Gemini ({target_model}): {repr(e)}. Rotating key.")
                    continue

        return None

    def embed_text(self, text: str, model: str = GEMINI_EMBEDDING_MODEL) -> Optional[list[float]]:
        """Computes a 3072-dimensional semantic embedding vector using gemini-embedding-001."""
        active_keys = get_active_api_keys()
        if not active_keys or not text.strip():
            return None

        model_path = model if model.startswith("models/") else f"models/{model}"
        model_id = model.replace("models/", "")

        attempts = min(3, len(active_keys))
        for _ in range(attempts):
            key = self._get_next_key()
            if not key:
                break

            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_id}:embedContent?key={key}"
            payload = {
                "model": model_path,
                "content": {"parts": [{"text": text.strip()}]},
            }

            try:
                with httpx.Client(timeout=DEFAULT_TIMEOUT) as client:
                    resp = client.post(url, json=payload)
                    if resp.status_code == 200:
                        values = resp.json().get("embedding", {}).get("values")
                        if isinstance(values, list) and len(values) > 0:
                            return [float(v) for v in values]
                    elif resp.status_code in (404, 429, 403, 503):
                        continue
            except Exception as e:
                logger.warning(f"Error calling Gemini embedContent: {repr(e)}")
                continue

        return None

    def embed_texts_batch(
        self, texts: list[str], model: str = GEMINI_EMBEDDING_MODEL
    ) -> Optional[list[list[float]]]:
        """Batch-embeds multiple texts in a single API call via batchEmbedContents (up to 100 items)."""
        active_keys = get_active_api_keys()
        if not active_keys or not texts:
            return None

        model_path = model if model.startswith("models/") else f"models/{model}"
        model_id = model.replace("models/", "")

        attempts = min(3, len(active_keys))
        for _ in range(attempts):
            key = self._get_next_key()
            if not key:
                break

            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_id}:batchEmbedContents?key={key}"
            requests_payload = [
                {
                    "model": model_path,
                    "content": {"parts": [{"text": t.strip()}]},
                }
                for t in texts
            ]

            try:
                with httpx.Client(timeout=DEFAULT_TIMEOUT) as client:
                    resp = client.post(url, json={"requests": requests_payload})
                    if resp.status_code == 200:
                        embeddings_raw = resp.json().get("embeddings", [])
                        if len(embeddings_raw) == len(texts):
                            return [[float(v) for v in emb.get("values", [])] for emb in embeddings_raw]
                    elif resp.status_code in (404, 429, 403, 503):
                        continue
            except Exception as e:
                logger.warning(f"Error calling Gemini batchEmbedContents: {repr(e)}")
                continue

        return None


ai_gateway = AIGateway()
