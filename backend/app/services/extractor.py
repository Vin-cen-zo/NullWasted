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
    Acts as a resilient safety net if Gemini API is offline or rate-limited.
    """
    raw_lower = text.lower().strip()

    # 1. Quantity extraction
    qty = 1
    qty_match = re.search(
        r"(\d+)\s*(?:porsi|pcs|bungkus|kotak|buah|potong|cup|paket|loyang|piring|mangkok)",
        raw_lower,
    )
    if qty_match:
        qty = max(1, int(qty_match.group(1)))

    # 2. Original price extraction
    original_price = 20000
    price_match = re.search(
        r"harga\s*(?:normal|asli)?\s*(?:rp\.?\s*)?([\d\.,]+)\s*(ribu|rb|k)?",
        raw_lower,
    )
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
            price_fallback = re.search(r"(\d+)\s*(?:ribu|rb|k)\b", raw_lower)
            if price_fallback:
                try:
                    original_price = int(price_fallback.group(1)) * 1000
                except ValueError:
                    pass

    # 3. Hours since cooked extraction
    hours_cooked = 1.0
    ago_match = re.search(r"(\d+(?:[\.,]\d+)?)\s*jam\s*(?:yang\s+lalu|lalu|suhu\s+ruang)", raw_lower)
    if ago_match:
        hours_cooked = float(ago_match.group(1).replace(",", "."))
    else:
        sudah_match = re.search(r"(?:sudah|\(sudah)\s*(\d+(?:[\.,]\d+)?)\s*jam", raw_lower)
        if sudah_match:
            hours_cooked = float(sudah_match.group(1).replace(",", "."))
        else:
            cooked_match = re.search(
                r"(?:baru\s+matang|matang|masak|selesai\s+masak|dibuat|dibikin|olahan)\s*(\d+(?:[\.,]\d+)?)\s*jam",
                raw_lower,
            )
            if cooked_match:
                hours_cooked = float(cooked_match.group(1).replace(",", "."))
            else:
                minute_cooked = re.search(
                    r"(?:baru\s+matang|matang|masak|selesai\s+masak|dibuat|dibikin)\s*(\d+)\s*menit",
                    raw_lower,
                )
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
    name_match = re.search(
        r"(?:\d+\s*(?:porsi|pcs|kotak|bungkus|buah|potong|cup|paket|loyang|piring|mangkok)\s+)([a-zA-Z0-9\s\-]+?)(?:,|\.|\bharga\b|\bbaru\b|\bsudah\b|\bmatang\b|\bmasak\b|\bselesai\b|\bdibuat\b|\bdibikin\b|\btoko\b|\btutup\b|$)",
        text,
        re.IGNORECASE,
    )
    if name_match:
        food_name = name_match.group(1).strip()

    if not food_name:
        matched_item, score = vector_store.search_similar_dish(text)
        if score >= 0.85:
            c_name = matched_item["canonical_name"].lower()
            if c_name in raw_lower:
                food_name = matched_item["canonical_name"]
            else:
                for alias in matched_item.get("aliases", []):
                    if alias.lower() in raw_lower:
                        food_name = alias.title()
                        break
        if not food_name:
            food_name = matched_item.get("canonical_name", "Surplus Food Item")

    food_name = re.sub(r"\b(harga|normal|asli)\b.*", "", food_name, flags=re.IGNORECASE).strip()
    if not food_name or len(food_name) < 3:
        matched_item, _ = vector_store.search_similar_dish(text)
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
    """Extracts food listing entities using live Gemini API (gemini-3.5-flash) with automatic fallback."""
    prompt = f"""Anda adalah sistem AI ekstraksi entitas katalog surplus food NullWasted di Indonesia.
Tugas Anda adalah mengekstrak informasi dari kalimat staf toko kuliner berikut ke dalam objek JSON murni:
- "food_name": Nama lengkap hidangan makanan/minuman beserta ciri khasnya (string Title Case, misal "Spageti Carbonara", "Gulai Tunjang Santan Padang", "Roti Sobek Artisan Keju"). Jangan sertakan kata jumlah porsi, harga, atau keterangan waktu di dalam food_name.
- "quantity": Jumlah porsi/bungkus/kotak/cup/loyang/potong yang tersisa (integer >= 1, default 1).
- "original_price": Harga normal per porsi sebelum diskon dalam Rupiah utuh (integer, misal "25 ribu" / "25k" / "25rb" -> 25000, default 20000).
- "hours_since_cooked": Lama waktu (dalam jam desimal float) sejak makanan selesai dimasak/matang/dibuat hingga saat ini (misal "dibuat 6 jam yang lalu" -> 6.0, "5 jam lalu" -> 5.0, "30 menit lalu" -> 0.5, "sudah 7 jam suhu ruang" -> 7.0, default 1.0).
- "minutes_until_closing": Sisa waktu (dalam menit integer) hingga toko tutup (misal "2 jam lagi" -> 120, "30 menit lagi" -> 30, default 120).

Kalimat input penjual: "{text}"

Keluarkan HANYA JSON objek valid tanpa teks pengantar dan tanpa blok markdown."""

    try:
        gemini_response = await ai_gateway.generate_content(prompt=prompt, audio_base64=audio_base64)
        if gemini_response:
            cleaned = gemini_response.strip().replace("```json", "").replace("```", "").strip()
            json_match = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if json_match:
                cleaned = json_match.group(0)
            data = json.loads(cleaned)

            raw_price = int(float(data.get("original_price", 20000)))
            if 0 < raw_price < 500:
                raw_price *= 1000

            food_name = str(data.get("food_name", "")).strip()
            if not food_name or len(food_name) < 2:
                fallback_data = local_rule_based_extract(text)
                food_name = fallback_data["food_name"]

            return {
                "food_name": food_name.title(),
                "quantity": max(1, int(data.get("quantity", 1))),
                "original_price": max(1000, raw_price),
                "hours_since_cooked": max(0.0, float(data.get("hours_since_cooked", 1.0))),
                "minutes_until_closing": max(1, int(float(data.get("minutes_until_closing", 120)))),
                "extraction_source": GEMINI_MODEL,
            }
    except Exception as e:
        logger.warning(f"Gemini entity extraction failed: {e}. Utilizing deterministic fallback.")

    return local_rule_based_extract(text)
