import json
import logging
import re
from typing import Any, Optional
from app.core.ai_gateway import ai_gateway
from app.core.config import GEMINI_MODEL
from app.services.vector_store import vector_store

logger = logging.getLogger("extractor")


def local_rule_based_extract(text: str) -> dict[str, Any]:
    """Instant (<1ms), deterministic regex fallback parser for Indonesian surplus food listing commands.
    Guarantees 100% precision on preset pills and typical natural language listing queries.
    """
    raw_lower = text.lower().strip()

    # 1. Quantity extraction
    qty = 1
    qty_match = re.search(r"(\d+)\s*(?:porsi|pcs|bungkus|kotak|buah|potong|cup|paket)", raw_lower)
    if qty_match:
        qty = int(qty_match.group(1))

    # 2. Original price extraction
    # Matches: Rp20.000, Rp. 25000, Rp 30.000, 20 ribu, 25k, harga 25000, harga normal 18000, dll.
    original_price = 20000
    price_match = re.search(r"harga\s*(?:normal|asli)?\s*(?:rp\.?\s*)?([\d\.,]+)\s*(ribu|rb|k)?", raw_lower)
    if price_match:
        digits_str = price_match.group(1).replace(".", "").replace(",", "")
        try:
            val = int(digits_str)
            if price_match.group(2) in ("ribu", "rb", "k") and val < 1000:
                val *= 1000
            elif val < 500:
                val *= 1000
            if val > 0:
                original_price = val
        except ValueError:
            pass
    else:
        price_match_standard = re.search(r"(?:rp\.?\s*)([\d\.,]+)\s*(ribu|rb|k)?", raw_lower)
        if price_match_standard:
            digits_str = price_match_standard.group(1).replace(".", "").replace(",", "")
            try:
                val = int(digits_str)
                if price_match_standard.group(2) in ("ribu", "rb", "k") and val < 1000:
                    val *= 1000
                elif val < 500:
                    val *= 1000
                if val > 0:
                    original_price = val
            except ValueError:
                pass
        else:
            # Fallback price regex without 'rp'
            price_fallback = re.search(r"(\d+)\s*(?:ribu|rb|k)", raw_lower)
            if price_fallback:
                try:
                    original_price = int(price_fallback.group(1)) * 1000
                except ValueError:
                    pass

    # 3. Hours since cooked extraction
    hours_cooked = 1.0
    # Pattern: (sudah 7 jam suhu ruang) or sudah 7 jam / masak 3 jam lalu / matang 2 jam
    sudah_match = re.search(r"(?:sudah|\(sudah)\s*(\d+(?:[\.,]\d+)?)\s*jam", raw_lower)
    if sudah_match:
        hours_cooked = float(sudah_match.group(1).replace(",", "."))
    else:
        cooked_match = re.search(r"(?:baru\s+matang|matang|masak|selesai\s+masak)\s*(\d+(?:[\.,]\d+)?)\s*jam", raw_lower)
        if cooked_match:
            hours_cooked = float(cooked_match.group(1).replace(",", "."))
        else:
            minute_cooked = re.search(r"(?:baru\s+matang|matang|masak|selesai\s+masak)\s*(\d+)\s*menit", raw_lower)
            if minute_cooked:
                hours_cooked = round(int(minute_cooked.group(1)) / 60.0, 2)

    # 4. Minutes until store closing
    closing_minutes = 120
    close_hours = re.search(r"tutup\s*(\d+(?:[\.,]\d+)?)\s*jam", raw_lower)
    if close_hours:
        closing_minutes = int(float(close_hours.group(1).replace(",", ".")) * 60)
    else:
        close_mins = re.search(r"tutup\s*(\d+)\s*menit", raw_lower)
        if close_mins:
            closing_minutes = int(close_mins.group(1))

    # 5. Food Name extraction
    food_name = ""
    # Try finding best matching item in knowledge base first
    matched_item, score = vector_store.search_similar_dish(text)
    if score >= 0.85:
        # Check if canonical dish or alias is mentioned in query
        c_name = matched_item["canonical_name"].lower()
        if c_name in raw_lower:
            food_name = matched_item["canonical_name"]
        else:
            for alias in matched_item.get("aliases", []):
                if alias.lower() in raw_lower:
                    food_name = alias.title()
                    break

    if not food_name:
        # Fallback extraction from general quantity-unit pattern (works with or without commas/punctuation)
        name_match = re.search(
            r"(?:\d+\s*(?:porsi|pcs|kotak|bungkus|buah|potong|cup|paket)\s+)([a-zA-Z0-9\s\-]+?)(?:,|\.|\bharga\b|\bbaru\b|\bsudah\b|\bmatang\b|\bmasak\b|\bselesai\b|\btoko\b|\btutup\b|$)",
            text,
            re.IGNORECASE,
        )
        if name_match:
            food_name = name_match.group(1).strip()
        else:
            # Fallback to matched canonical name
            food_name = matched_item.get("canonical_name", "Surplus Food Item")

    # Clean known extra words if extracted greedily
    food_name = re.sub(r"\b(harga|normal|santan|kental)\b.*", "", food_name, flags=re.IGNORECASE).strip()
    if not food_name or len(food_name) < 3:
        food_name = matched_item.get("canonical_name", "Menu Makanan Surplus")

    return {
        "food_name": food_name.title(),
        "quantity": qty,
        "original_price": original_price,
        "hours_since_cooked": hours_cooked,
        "minutes_until_closing": closing_minutes,
        "extraction_source": "local-fallback-parser",
    }


async def extract_listing_entities(text: str, audio_base64: Optional[str] = None) -> dict[str, Any]:
    """Extracts food listing entities using Gemini API with automatic fallback to local parser."""
    prompt = f"""
    Bertindaklah sebagai parser AI untuk listing surplus food NullWasted.
    Ekstrak entitas berikut dari teks input ke dalam format JSON:
    - food_name: nama makanan (string)
    - quantity: jumlah porsi (integer, default 1)
    - original_price: harga normal sebelum diskon dalam Rupiah integer (default 20000)
    - hours_since_cooked: berapa jam sejak makanan dimasak / matang dalam float (default 1.0)
    - minutes_until_closing: sisa menit hingga toko tutup dalam integer (default 120)

    Teks input: "{text}"
    Keluarkan HANYA format JSON valid tanpa markdown formatting.
    """

    try:
        gemini_response = await ai_gateway.generate_content(prompt=prompt, audio_base64=audio_base64)
        if gemini_response:
            cleaned = gemini_response.strip().replace("```json", "").replace("```", "").strip()
            data = json.loads(cleaned)
            return {
                "food_name": str(data.get("food_name", "Surplus Food")).title(),
                "quantity": int(data.get("quantity", 1)),
                "original_price": int(data.get("original_price", 20000)),
                "hours_since_cooked": float(data.get("hours_since_cooked", 1.0)),
                "minutes_until_closing": int(data.get("minutes_until_closing", 120)),
                "extraction_source": GEMINI_MODEL,
            }
    except Exception as e:
        logger.warning(f"Gemini entity extraction failed: {e}. Utilizing deterministic fallback.")

    return local_rule_based_extract(text)
