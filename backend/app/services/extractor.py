import asyncio
import json
import logging
import re
from typing import Any, Optional
from app.core.ai_gateway import ai_gateway
from app.core.config import GEMINI_MODEL
from app.services.vector_store import vector_store

logger = logging.getLogger("extractor")


def _parse_idr_amount(digits_str: str, suffix: Optional[str] = None) -> int:
    """Parses IDR amount handling decimal notation (e.g. 17.5k -> 17500) and thousands separators."""
    s = digits_str.strip(".,")
    if re.match(r"^\d+[\.,]\d{1,2}$", s):
        return int(round(float(s.replace(",", ".")) * 1000))
    clean_str = s.replace(".", "").replace(",", "")
    if not clean_str:
        return 20000
    val = int(clean_str)
    if suffix in ("ribu", "rb", "k") and val < 1000:
        val *= 1000
    elif val < 500:
        val *= 1000
    return val


def _clean_extracted_food_name(raw_name: str) -> str:
    """Cleans transactional prefixes, quantity units, and Indonesian conversational slang."""
    cleaned = raw_name.strip()
    cleaned = re.sub(
        r"^(?:ada\s+|sisa\s+|menu\s+|hari\s+ini\s+)+",
        "",
        cleaned,
        flags=re.IGNORECASE,
    ).strip()
    cleaned = re.sub(
        r"^(?:\d+\s*(?:porsi|pcs|pack|packs|box|botol|gelas|slice|bungkus|kotak|buah|potong|cup|paket|loyang|piring|mangkok)\s+)",
        "",
        cleaned,
        flags=re.IGNORECASE,
    ).strip()
    cleaned = re.sub(
        r"(?:\s*(?:porsi|pcs|pack|packs|box|botol|gelas|slice|bungkus|kotak|buah|potong|cup|paket|loyang|piring|mangkok)\b.*)$",
        "",
        cleaned,
        flags=re.IGNORECASE,
    ).strip()
    cleaned = re.sub(
        r"\b(gila\s+sih\s+ini|gila\s+sih|parah\s+sih|gitu\s+loh|jujurly|literally|gitu|kayak|please|plis|tolong|diup|dong|nih|ya|deh|banget|bgt|cuy|guys|gaes|ini|itu)\b",
        " ",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"[\-\(\)]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def local_rule_based_extract(text: str) -> dict[str, Any]:
    """Instant (<1ms), deterministic regex fallback parser for Indonesian surplus food listing commands.
    Acts as a resilient safety net if Gemini API is offline or rate-limited.
    """
    raw_lower = text.lower().strip()

    # 0. Negative value validation
    has_negative = bool(
        re.search(
            r"(?:sisa|ada|harga|rp\.?)\s*-\s*\d+|-\s*\d+\s*(?:porsi|pcs|pack|packs|box|bungkus|kotak|ribu|rb|k)\b",
            raw_lower,
        )
    )

    # 1. Quantity extraction
    qty = 1
    qty_unit_match = re.search(
        r"(?:sisa\s*)?(\d+)\s*(?:porsi|pcs|pack|packs|box|botol|gelas|slice|bungkus|kotak|buah|potong|cup|paket|loyang|piring|mangkok)",
        raw_lower,
    )
    if qty_unit_match:
        qty = max(1, int(qty_unit_match.group(1)))
    else:
        qty_sisa_match = re.search(r"\bsisa\s*(\d+)\b", raw_lower)
        if qty_sisa_match:
            qty = max(1, int(qty_sisa_match.group(1)))
        else:
            qty_rev_match = re.search(r"(\d+)\s*sisa\b", raw_lower)
            if qty_rev_match:
                qty = max(1, int(qty_rev_match.group(1)))

    # 2. Original price extraction & detection
    original_price = 20000
    price_mentioned = False

    price_match = re.search(
        r"harga\s*(?:normal|asli)?\s*(?:rp\.?\s*)?([\d\.,]+)\s*(ribu|rb|k)?",
        raw_lower,
    )
    if price_match:
        try:
            val = _parse_idr_amount(price_match.group(1), price_match.group(2))
            if val > 0:
                original_price = val
                price_mentioned = True
        except ValueError:
            pass
    else:
        price_match_standard = re.search(r"(?:rp\.?\s*)([\d\.,]+)\s*(ribu|rb|k)?", raw_lower)
        if price_match_standard:
            try:
                val = _parse_idr_amount(price_match_standard.group(1), price_match_standard.group(2))
                if val > 0:
                    original_price = val
                    price_mentioned = True
            except ValueError:
                pass
        else:
            price_fallback = re.search(r"(?:harga\s*)?([\d\.,]+)\s*(ribu|rb|k)\b", raw_lower)
            if price_fallback:
                try:
                    val = _parse_idr_amount(price_fallback.group(1), price_fallback.group(2))
                    if val > 0:
                        original_price = val
                        price_mentioned = True
                except ValueError:
                    pass

    # 3. Hours since cooked extraction & detection
    hours_cooked = 1.0
    cooking_time_mentioned = False

    ago_match = re.search(r"(\d+(?:[\.,]\d+)?)\s*jam\s*(?:yang\s+lalu|lalu|suhu\s+ruang)", raw_lower)
    if ago_match:
        hours_cooked = float(ago_match.group(1).replace(",", "."))
        cooking_time_mentioned = True
    else:
        sudah_match = re.search(r"(?:sudah|\(sudah)\s*(\d+(?:[\.,]\d+)?)\s*jam", raw_lower)
        if sudah_match:
            hours_cooked = float(sudah_match.group(1).replace(",", "."))
            cooking_time_mentioned = True
        else:
            cooked_match = re.search(
                r"(?:baru\s+matang|matang|masak|selesai\s+masak|dibuat|dibikin|olahan)\s*(\d+(?:[\.,]\d+)?)\s*jam",
                raw_lower,
            )
            if cooked_match:
                hours_cooked = float(cooked_match.group(1).replace(",", "."))
                cooking_time_mentioned = True
            else:
                minute_cooked = re.search(
                    r"(?:baru\s+matang|matang|masak|selesai\s+masak|dibuat|dibikin)\s*(\d+)\s*menit",
                    raw_lower,
                )
                if minute_cooked:
                    hours_cooked = round(int(minute_cooked.group(1)) / 60.0, 2)
                    cooking_time_mentioned = True
                else:
                    spec_time = re.search(
                        r"(?:selesai\s+masak|masak|matang)?\s*jam\s*(\d{1,2})(?:[\.:](\d{2}))?\s*(pagi|siang|sore|malam)?",
                        raw_lower,
                    )
                    if spec_time and not re.search(r"tutup\s*jam", raw_lower):
                        h = int(spec_time.group(1))
                        m = int(spec_time.group(2)) if spec_time.group(2) else 0
                        period = spec_time.group(3)
                        if period in ("sore", "malam") and h < 12:
                            h += 12
                        elif period == "siang" and 1 <= h <= 5:
                            h += 12

                        ref_hour = 18.0
                        diff = max(0.5, round(ref_hour - (h + m / 60.0), 1))
                        hours_cooked = diff
                        cooking_time_mentioned = True

    # Overnight / yesterday cooked check (> 24 hours)
    if re.search(r"\b(kemarin|semalam|tadi malam|kemarin malam)\b", raw_lower):
        hours_cooked = max(hours_cooked + 24.0, 25.0)
        cooking_time_mentioned = True

    # 4. Minutes until store closing & explicit closing detection
    closing_minutes = 120
    explicit_closing_mentioned = False
    close_hours = re.search(r"tutup\s*(\d+(?:[\.,]\d+)?)\s*jam", raw_lower)
    if close_hours:
        closing_minutes = int(float(close_hours.group(1).replace(",", ".")) * 60)
        explicit_closing_mentioned = True
    else:
        close_mins = re.search(r"tutup\s*(\d+)\s*menit", raw_lower)
        if close_mins:
            closing_minutes = int(close_mins.group(1))
            explicit_closing_mentioned = True

    # 5. Food Name extraction with bidirectional phrase stripping
    food_name = ""
    stop_boundary = (
        r"(?:,|\.|\bharga\b|\brp\.?\s*\d|\b\d[\d\.,]*\s*(?:rb|ribu|k)\b|"
        r"\bbaru\b|\bsudah\b|\bmatang\b|\bmasak\b|\bselesai\b|\bdibuat\b|\bdibikin\b|"
        r"\btoko\b|\btutup\b|\bkemarin\b|\bsemalam\b|$)"
    )
    bad_tokens = {"gila", "sih", "ini", "itu", "lagi", "aja", "dong", "deh", "ya"}

    def _is_valid_dish_candidate(cand: str) -> bool:
        if not cand or len(cand) < 3 or cand.lower() in bad_tokens:
            return False
        if re.fullmatch(r"(?:rp\.?\s*)?[\d\.,]+\s*(?:rb|ribu|k|rupiah|idr|jam|menit)?", cand, re.IGNORECASE):
            return False
        return bool(re.search(r"[a-zA-Z]{3,}", cand))

    rev_name = re.search(r"([a-zA-Z0-9\s\-]+?)\s+(?:sisa|tinggal)\s+\d+", text, re.IGNORECASE)
    cand_rev = _clean_extracted_food_name(rev_name.group(1)) if rev_name else ""

    name_match = re.search(
        r"(?:\d+\s*(?:porsi|pcs|pack|packs|box|botol|gelas|slice|kotak|bungkus|buah|potong|cup|paket|loyang|piring|mangkok)\s+)([a-zA-Z0-9\s\-]+?)"
        + stop_boundary,
        text,
        re.IGNORECASE,
    )
    if name_match:
        cand_name = _clean_extracted_food_name(name_match.group(1))
        if _is_valid_dish_candidate(cand_name):
            food_name = cand_name
        elif _is_valid_dish_candidate(cand_rev):
            food_name = cand_rev
    else:
        sisa_name = re.search(
            r"(?:(?:sisa|ada|stok)\s+\d+\s+)([a-zA-Z0-9\s\-]+?)" + stop_boundary,
            text,
            re.IGNORECASE,
        )
        if sisa_name:
            cand_sisa = _clean_extracted_food_name(sisa_name.group(1))
            if _is_valid_dish_candidate(cand_sisa):
                food_name = cand_sisa
            elif _is_valid_dish_candidate(cand_rev):
                food_name = cand_rev
        elif _is_valid_dish_candidate(cand_rev):
            food_name = cand_rev

    # Bidirectional residual phrase stripping fallback when structured patterns miss
    if not food_name or len(food_name) < 3:
        residual = text
        residual = re.sub(
            r"\b(?:harga\s*(?:normal|asli|awal|jual|diskon)?\s*)?(?:rp\.?\s*[\d\.,]+\s*(?:ribu|rb|k)?|[\d\.,]+\s*(?:ribu|rb|k))\b",
            " ",
            residual,
            flags=re.IGNORECASE,
        )
        residual = re.sub(
            r"\b(?:toko\s+)?tutup\s*(?:jam\s*)?[\d\.,:\s]*(?:jam|menit|pagi|siang|sore|malam)?(?:\s+lagi)?\b",
            " ",
            residual,
            flags=re.IGNORECASE,
        )
        residual = re.sub(
            r"\b(?:baru\s+matang|selesai\s+masak|matang|masak|dibuat|dibikin|olahan|sudah)\s*(?:\d+(?:[\.,]\d+)?\s*(?:jam|menit)(?:\s*(?:yang\s+)?lalu|\s+suhu\s+ruang)?)?\b",
            " ",
            residual,
            flags=re.IGNORECASE,
        )
        residual = re.sub(
            r"\b\d+(?:[\.,]\d+)?\s*(?:jam|menit)\s*(?:yang\s+lalu|lalu|suhu\s+ruang|lagi)\b",
            " ",
            residual,
            flags=re.IGNORECASE,
        )
        residual = re.sub(
            r"\bjam\s*\d{1,2}(?:[\.:]\d{2})?\s*(?:pagi|siang|sore|malam)?\b",
            " ",
            residual,
            flags=re.IGNORECASE,
        )
        residual = re.sub(
            r"\b(?:ada|sisa|stok|tinggal|cuma|hanya)?\s*\d+\s*(?:porsi|pcs|pack|packs|box|botol|gelas|slice|kotak|bungkus|buah|potong|cup|paket|loyang|piring|mangkok|x)\b",
            " ",
            residual,
            flags=re.IGNORECASE,
        )
        residual = re.sub(
            r"\b(?:ada|sisa|stok|tinggal)\s+\d+\b",
            " ",
            residual,
            flags=re.IGNORECASE,
        )
        residual = re.sub(
            r"\b(?:eh|kak|min|admin|tolong|masukin|bantu|dong|deh|sih|nih|tuh|ya|yg|yang|mau|jual|cepat|harga|normal|asli|ada|sisa|stok|tinggal|suhu|ruang|kemarin|semalam|tadi|malam|lagi|rp|ini|itu)\b",
            " ",
            residual,
            flags=re.IGNORECASE,
        )
        cand_res = _clean_extracted_food_name(re.sub(r"[,\.\(\):;/]+", " ", residual))
        if cand_res and len(cand_res) >= 3 and not cand_res.isdigit():
            food_name = cand_res

    if not food_name or len(food_name) < 3:
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
                    food_name = matched_item.get("canonical_name", "")

    food_name = _clean_extracted_food_name(
        re.sub(r"\b(harga|normal|asli|sisa|ada)\b.*", "", food_name, flags=re.IGNORECASE).strip()
    )
    if not food_name or len(food_name) < 3 or food_name.lower() in bad_tokens:
        food_name = "Menu Surplus Harian"

    matched_item, _score = vector_store.search_similar_dish(food_name if food_name != "Menu Surplus Harian" else text)
    inferred_food_type = matched_item.get("food_type", "MEAL")
    if inferred_food_type not in ("MEAL", "BAKERY", "BEVERAGE"):
        inferred_food_type = "MEAL"

    return {
        "food_name": food_name.title(),
        "quantity": qty,
        "original_price": original_price,
        "hours_since_cooked": hours_cooked,
        "minutes_until_closing": closing_minutes,
        "food_type": inferred_food_type,
        "inferred_risk": None,
        "is_edible_food": None,
        "extraction_source": "local-fallback-parser",
        "price_mentioned": price_mentioned,
        "cooking_time_mentioned": cooking_time_mentioned,
        "explicit_closing_mentioned": explicit_closing_mentioned,
        "has_negative_value": has_negative,
    }


async def classify_dish_with_ai(food_name: str, ingredients: str = "") -> dict[str, Any]:
    """Classifies any dish dynamically (including regional/non-BPOM-listed dishes like Seblak or Kombucha)
    using Gemini LLM for food validity, culinary category (food_type), and PerBPOM perishability risk.
    """
    prompt = f"""Anda adalah sistem AI klasifikasi pangan & keamanan PerBPOM No. 16/2019 NullWasted di Indonesia.
Tugas Anda mengevaluasi hidangan berikut dan mengembalikan HANYA JSON objek murni:
- "is_edible_food": boolean (true jika benar makanan/minuman/kue/jajanan layak konsumsi manusia seperti Seblak, Cilok, Cendol, Kombucha, dll.; false jika benda non-pangan seperti sepatu, sabun, racun, elektronik, atau teks acak tidak bermakna).
- "food_type": salah satu dari "MEAL" | "BAKERY" | "BEVERAGE"
  * "MEAL": makanan berat, lauk pauk, nasi, mie, bakso, seblak, soto, sate, gorengan, camilan gurih, salad, pasta, burger, pizza, dll.
  * "BAKERY": roti, pastry, croissant, donat, kue basah/kering, brownies, pudding/cake, martabak manis, pie, dll.
  * "BEVERAGE": segala minuman termasuk es cendol/dawet, kopi, teh, susu, jus, boba, matcha, kombucha, smoothie, wedang, sirup, air/minuman botol, dll.
- "inferred_risk": salah satu dari "HIGH_PERISHABILITY" | "MEDIUM_PERISHABILITY" | "LOW_PERISHABILITY"
  * "HIGH_PERISHABILITY" (maks 4 jam suhu ruang): mengandung santan, susu segar/dairy, krim basah/mayones, telur mentah/setengah matang, daging/ikan mentah.
  * "MEDIUM_PERISHABILITY" (maks 8 jam suhu ruang): makanan matang siap saji, tumis, goreng, rebus, kuah kaldu non-santan (termasuk seblak/bakso/mie), atau minuman teh/kopi tanpa susu segar.
  * "LOW_PERISHABILITY" (maks 24 jam suhu ruang): roti panggang, pastry kering tanpa krim susu basah, kue kering, keripik.
- "canonical_match": nama standar hidangan yang rapi dalam Bahasa Indonesia (Title Case).

Nama Hidangan: "{food_name}"
Komposisi/Keterangan: "{ingredients}"

Keluarkan HANYA JSON objek valid tanpa blok markdown."""

    try:
        resp = await ai_gateway.generate_content(prompt=prompt)
        if resp:
            cleaned = resp.strip().replace("```json", "").replace("```", "").strip()
            json_match = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if json_match:
                cleaned = json_match.group(0)
            data = json.loads(cleaned)
            ft = str(data.get("food_type", "MEAL")).upper().strip()
            if ft not in ("MEAL", "BAKERY", "BEVERAGE"):
                ft = "MEAL"
            risk = str(data.get("inferred_risk", "MEDIUM_PERISHABILITY")).upper().strip()
            if risk not in ("HIGH_PERISHABILITY", "MEDIUM_PERISHABILITY", "LOW_PERISHABILITY"):
                risk = "MEDIUM_PERISHABILITY"
            is_edible = data.get("is_edible_food")
            if not isinstance(is_edible, bool):
                is_edible = None
            return {
                "is_edible_food": is_edible,
                "food_type": ft,
                "inferred_risk": risk,
                "canonical_match": str(data.get("canonical_match", "")).strip() or food_name.title(),
            }
    except Exception as e:
        logger.warning(f"Gemini dish classification failed for '{food_name}': {e}")

    matched_item, _ = vector_store.search_similar_dish(f"{food_name} {ingredients}".strip())
    return {
        "is_edible_food": None,
        "food_type": matched_item.get("food_type", "MEAL"),
        "inferred_risk": None,
        "canonical_match": food_name.title(),
    }


async def extract_listing_entities(text: str, audio_base64: Optional[str] = None) -> dict[str, Any]:
    """Extracts food listing entities using live Gemini API (gemini-3.5-flash-lite) with deterministic fallback."""
    local_info = await asyncio.to_thread(local_rule_based_extract, text)

    prompt = f"""Anda adalah sistem AI ekstraksi entitas katalog surplus food NullWasted di Indonesia.
Tugas Anda adalah mengekstrak informasi dari kalimat staf toko kuliner berikut ke dalam objek JSON murni:
- "food_name": Nama lengkap hidangan makanan/minuman beserta ciri khasnya (string Title Case, misal "Spageti Carbonara", "Gulai Tunjang Santan Padang", "Roti Sobek Artisan Keju", "Seblak Ceker Pedas", "Es Cendol Durian"). Jangan sertakan kata jumlah porsi, harga, atau keterangan waktu di dalam food_name.
- "is_edible_food": boolean (true jika merupakan makanan/minuman/kue manusia yang sah termasuk kuliner daerah seperti Seblak, Cilok, Cireng, Es Cendol, Kombucha; false jika bukan makanan/minuman seperti racun, kimia, baterai, sepatu, barang non-pangan, atau kata acak).
- "food_type": Klasifikasi jenis kuliner — WAJIB salah satu dari: "MEAL" | "BAKERY" | "BEVERAGE"
  * "MEAL": makanan berat, lauk pauk, nasi, mie, soto, seblak, bakso, sate, gorengan, pasta, burger, pizza, salad, bubur gurih.
  * "BAKERY": roti, pastry, croissant, donat, kue basah/kering, brownies, cake, tiramisu, cheesecake, martabak manis, pudding/pie.
  * "BEVERAGE": segala jenis minuman (es cendol, es teh, kopi, matcha latte, boba, jus, wedang, kombucha, smoothie, minuman botol).
- "inferred_risk": Klasifikasi risiko umur simpan suhu ruang PerBPOM No. 16/2019 — WAJIB salah satu dari: "HIGH_PERISHABILITY" | "MEDIUM_PERISHABILITY" | "LOW_PERISHABILITY"
  * "HIGH_PERISHABILITY" (maks 4 jam): santan, susu segar, krim/vla/mayones, telur setengah matang, makanan laut/daging mentah.
  * "MEDIUM_PERISHABILITY" (maks 8 jam): makanan matang siap saji, tumis, goreng, rebus, kuah non-santan (seperti seblak/bakso/soto bening), atau minuman kopi/teh tanpa susu.
  * "LOW_PERISHABILITY" (maks 24 jam): roti panggang, pastry kering tanpa krim susu basah, kue kering, keripik.
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

            # If local parser detected a specific decimal suffix (e.g. 17.5k), trust local_info to avoid LLM distortion
            if local_info["price_mentioned"] and re.search(r"\b\d+[\.,]\d{1,2}\s*(?:ribu|rb|k)\b", text.lower()):
                raw_price = local_info["original_price"]

            food_name = str(data.get("food_name", "")).strip()
            if not food_name or len(food_name) < 2:
                food_name = local_info["food_name"]

            hours_cooked = max(0.0, float(data.get("hours_since_cooked", 1.0)))
            # Enforce overnight / yesterday rule (> 24 hours) deterministically on LLM output
            if re.search(r"\b(kemarin|semalam|tadi malam|kemarin malam)\b", text.lower()):
                hours_cooked = max(hours_cooked + 24.0, 25.0)

            ft = str(data.get("food_type", local_info["food_type"])).upper().strip()
            if ft not in ("MEAL", "BAKERY", "BEVERAGE"):
                ft = local_info["food_type"]

            inferred_risk = str(data.get("inferred_risk", "")).upper().strip()
            if inferred_risk not in ("HIGH_PERISHABILITY", "MEDIUM_PERISHABILITY", "LOW_PERISHABILITY"):
                inferred_risk = None

            is_edible_raw = data.get("is_edible_food")
            is_edible = is_edible_raw if isinstance(is_edible_raw, bool) else None

            return {
                "food_name": food_name.title(),
                "quantity": max(1, int(data.get("quantity", 1))),
                "original_price": max(1000, raw_price),
                "hours_since_cooked": hours_cooked,
                "minutes_until_closing": max(1, int(float(data.get("minutes_until_closing", 120)))),
                "food_type": ft,
                "inferred_risk": inferred_risk,
                "is_edible_food": is_edible,
                "extraction_source": GEMINI_MODEL,
                "price_mentioned": local_info["price_mentioned"],
                "cooking_time_mentioned": local_info["cooking_time_mentioned"],
                "explicit_closing_mentioned": local_info["explicit_closing_mentioned"],
                "has_negative_value": local_info["has_negative_value"],
            }
    except Exception as e:
        logger.warning(f"Gemini entity extraction failed: {e}. Utilizing deterministic fallback.")

    return local_info
