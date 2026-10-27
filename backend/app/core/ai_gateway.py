import logging
from typing import Any, Optional
import httpx
from app.core.config import GEMINI_MODEL, get_active_api_keys

logger = logging.getLogger("ai_gateway")


class AIGateway:
    def __init__(self) -> None:
        self.api_keys = get_active_api_keys()
        self._key_index = 0

    def _get_next_key(self) -> Optional[str]:
        if not self.api_keys:
            return None
        key = self.api_keys[self._key_index % len(self.api_keys)]
        self._key_index = (self._key_index + 1) % len(self.api_keys)
        return key

    async def generate_content(
        self, prompt: str, audio_base64: Optional[str] = None, model: str = GEMINI_MODEL
    ) -> Optional[str]:
        """Calls Gemini API with round-robin key pool and silent auto-failover.
        Returns text response or None on failure to trigger local fallback.
        """
        active_keys = get_active_api_keys()
        if not active_keys:
            logger.info("No active Gemini API keys configured. Using deterministic local fallback.")
            return None

        attempts = min(3, len(active_keys))
        for _ in range(attempts):
            key = self._get_next_key()
            if not key:
                break

            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
            
            parts: list[dict[str, Any]] = [{"text": prompt}]
            if audio_base64:
                parts.append({
                    "inline_data": {
                        "mime_type": "audio/webm",
                        "data": audio_base64
                    }
                })

            payload = {
                "contents": [{"parts": parts}],
                "generationConfig": {
                    "temperature": 0.1,
                    "response_mime_type": "application/json",
                }
            }

            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        candidates = data.get("candidates", [])
                        if candidates:
                            content_parts = candidates[0].get("content", {}).get("parts", [])
                            if content_parts:
                                return content_parts[0].get("text", "")
                    elif resp.status_code in (429, 403, 503):
                        logger.warning(f"Gemini API key returned status {resp.status_code}. Rotating to next key.")
                        continue
            except Exception as e:
                logger.warning(f"Error calling Gemini API: {e}. Rotating to next key.")
                continue

        return None


ai_gateway = AIGateway()
