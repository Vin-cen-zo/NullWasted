import asyncio
import json
import logging
import re
from typing import Any, Optional
from app.core.ai_gateway import ai_gateway
from app.core.clock import get_effective_now_wib
from app.core.config import GEMINI_MODEL
from app.services.vector_store import vector_store

logger = logging.getLogger("extractor")


def _safe_int(value: Any, default: int) -> int:
    """Safely coerces LLM JSON values (including null/strings) to int without TypeError."""
    if value is None or isinstance(value, bool):
        return default
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _safe_float(value: Any, default: float) -> float:
    """Safely coerces LLM JSON values (including null/strings) to float without TypeError."""
    if value is None or isinstance(value, bool):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


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
            else:
                qty_lead_match = re.match(
                    r"^(\d+)\s+(?!jam\b|menit\b|ribu\b|rb\b|k\b|rupiah\b|idr\b)[a-z]{3,}",
                    raw_lower,
                )
                if qty_lead_match:
                    qty = max(1, int(qty_lead_match.group(1)))

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
    now_wib = get_effective_now_wib()
    now_minutes = now_wib.hour * 60 + now_wib.minute
    has_overnight = bool(re.search(r"\b(kemarin|semalam|tadi malam|kemarin malam)\b", raw_lower))
    future_cooking_time = bool(
        re.search(r"\b(besok|nanti malam|akan datang|belum dimasak|akan dimasak|masak besok)\b", raw_lower)
    )

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
                    # Strip explicit closing-time phrases first so "tutup jam ..." never collides with cooking-time regex
                    cooking_search_text = re.sub(
                        r"\b(?:toko\s+)?tutup\s*(?:pada\s+)?jam\s*\d{1,2}(?:[\.:]\d{2})?\s*(?:pagi|siang|sore|malam)?",
                        " ",
                        raw_lower,
                    )
                    spec_time = re.search(
                        r"(?:selesai\s+masak|masak|matang|dibuat|dibikin)?\s*jam\s*(\d{1,2})(?:[\.:](\d{2}))?\s*(pagi|siang|sore|malam)?",
                        cooking_search_text,
                    )
                    if spec_time:
                        h = int(spec_time.group(1))
                        m = int(spec_time.group(2)) if spec_time.group(2) else 0
                        period = spec_time.group(3)
                        if period in ("sore", "malam") and h < 12:
                            h += 12
                        elif period == "siang" and 1 <= h <= 5:
                            h += 12
                        elif period in ("pagi", "malam") and h == 12:
                            h = 0

                        if 0 <= h <= 23 and 0 <= m <= 59:
                            cook_minutes = h * 60 + m
                            if cook_minutes > now_minutes + 5 and not has_overnight:
                                future_cooking_time = True
                                hours_cooked = 0.0
                            else:
                                diff_hours = round((now_minutes - cook_minutes) / 60.0, 2)
                                hours_cooked = max(0.1, diff_hours) if not has_overnight else max(0.0, diff_hours)
                            cooking_time_mentioned = True

    # Overnight / yesterday cooked check (> 24 hours)
    if has_overnight:
        hours_cooked = max(hours_cooked + 24.0, 25.0)
        cooking_time_mentioned = True
        future_cooking_time = False

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
        else:
            close_at = re.search(
                r"tutup\s*(?:pada\s+)?jam\s*(\d{1,2})(?:[\.:](\d{2}))?\s*(pagi|siang|sore|malam)?",
                raw_lower,
            )
            if close_at:
                ch = int(close_at.group(1))
                cm = int(close_at.group(2)) if close_at.group(2) else 0
                c_period = close_at.group(3)
                if c_period in ("sore", "malam") and ch < 12:
                    ch += 12
                elif c_period == "siang" and 1 <= ch <= 5:
                    ch += 12
                elif c_period in ("pagi", "malam") and ch == 12:
                    ch = 0
                if 0 <= ch <= 23 and 0 <= cm <= 59:
                    close_total_mins = ch * 60 + cm
                    delta_mins = close_total_mins - now_minutes
                    if delta_mins < 0 and now_wib.hour >= 18 and ch < 6:
                        delta_mins += 24 * 60
                    closing_minutes = max(0, delta_mins)
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
        "future_cooking_time": future_cooking_time,
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
    now_wib = get_effective_now_wib()
    now_wib_str = now_wib.strftime("%Y-%m-%d %H:%M WIB")

    prompt = f"""Anda adalah sistem AI ekstraksi entitas katalog surplus food NullWasted di Indonesia.
Waktu saat ini: {now_wib_str}
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
- "quantity": Jumlah porsi/bungkus/kotak/cup/loyang/potong yang tersisa (integer >= 1, atau null jika tidak disebut).
- "original_price": Harga normal per porsi sebelum diskon dalam Rupiah utuh (integer, misal "25 ribu" / "25k" / "25rb" / "dua puluh lima ribu" -> 25000, atau null jika tidak disebut).
- "hours_since_cooked": Lama waktu (dalam jam desimal float) sejak makanan selesai dimasak/matang/dibuat hingga waktu saat ini ({now_wib_str}). Jika staf menyebut jam masak (misal "masak jam 7 pagi" dan sekarang 08:33 WIB -> 1.55), hitung selisihnya terhadap waktu saat ini. Jika "kemarin/semalam", pastikan >= 24.0. Kembalikan null jika waktu masak tidak disebut.
- "minutes_until_closing": Sisa waktu (dalam menit integer) hingga toko tutup relatif terhadap waktu saat ini ({now_wib_str}), misal "2 jam lagi" -> 120, atau "tutup jam 9 malam" pada pukul 08:33 -> 747. Kembalikan null jika waktu tutup tidak disebut.
- "price_mentioned": boolean (true jika harga disebut dengan angka maupun kata lisan, false jika tidak disebut).
- "cooking_time_mentioned": boolean (true jika jam masak/usia matang disebut, false jika tidak disebut).
- "closing_time_mentioned": boolean (true jika jam tutup/sisa waktu tutup disebut, false jika tidak disebut).
- "future_cooking_time": boolean (true HANYA jika jam masak yang disebut berada di masa depan terhadap waktu saat ini tanpa kata kemarin/semalam, atau menggunakan kata seperti "besok"/"akan dimasak").

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

            raw_price = _safe_int(data.get("original_price"), local_info["original_price"])
            if 0 < raw_price < 500:
                raw_price *= 1000

            # If local parser detected a specific decimal suffix (e.g. 17.5k), trust local_info to avoid LLM distortion
            if local_info["price_mentioned"] and re.search(r"\b\d+[\.,]\d{1,2}\s*(?:ribu|rb|k)\b", text.lower()):
                raw_price = local_info["original_price"]

            food_name = str(data.get("food_name") or "").strip()
            if not food_name or len(food_name) < 2:
                food_name = local_info["food_name"]

            hours_cooked = max(0.0, _safe_float(data.get("hours_since_cooked"), local_info["hours_since_cooked"]))
            has_overnight = bool(re.search(r"\b(kemarin|semalam|tadi malam|kemarin malam)\b", text.lower()))
            future_cooking_time = bool(local_info["future_cooking_time"] or data.get("future_cooking_time"))

            # Enforce overnight / yesterday rule (> 24 hours) deterministically on LLM output
            if has_overnight:
                hours_cooked = max(hours_cooked + 24.0, 25.0)
                future_cooking_time = False

            ft = str(data.get("food_type") or local_info["food_type"]).upper().strip()
            if ft not in ("MEAL", "BAKERY", "BEVERAGE"):
                ft = local_info["food_type"]

            inferred_risk = str(data.get("inferred_risk") or "").upper().strip()
            if inferred_risk not in ("HIGH_PERISHABILITY", "MEDIUM_PERISHABILITY", "LOW_PERISHABILITY"):
                inferred_risk = None

            is_edible_raw = data.get("is_edible_food")
            is_edible = is_edible_raw if isinstance(is_edible_raw, bool) else None

            price_mentioned = bool(local_info["price_mentioned"] or data.get("price_mentioned"))
            cooking_time_mentioned = bool(
                local_info["cooking_time_mentioned"] or data.get("cooking_time_mentioned")
            )
            explicit_closing_mentioned = bool(
                local_info["explicit_closing_mentioned"]
                or data.get("closing_time_mentioned")
                or data.get("explicit_closing_mentioned")
            )
            closing_minutes = max(
                0,
                _safe_int(data.get("minutes_until_closing"), local_info["minutes_until_closing"]),
            )

            return {
                "food_name": food_name.title(),
                "quantity": max(1, _safe_int(data.get("quantity"), local_info["quantity"])),
                "original_price": max(1000, raw_price),
                "hours_since_cooked": hours_cooked,
                "minutes_until_closing": closing_minutes,
                "food_type": ft,
                "inferred_risk": inferred_risk,
                "is_edible_food": is_edible,
                "extraction_source": GEMINI_MODEL,
                "price_mentioned": price_mentioned,
                "cooking_time_mentioned": cooking_time_mentioned,
                "explicit_closing_mentioned": explicit_closing_mentioned,
                "future_cooking_time": future_cooking_time,
                "has_negative_value": local_info["has_negative_value"],
            }
    except Exception as e:
        logger.warning(f"Gemini entity extraction failed: {e}. Utilizing deterministic fallback.")

    return local_info


def _split_multi_menu_clauses(text: str) -> list[str]:
    """Fallback splitter for offline/rate-limited mode when Gemini is unavailable.
    Splits a multi-dish Indonesian sentence into individual dish clauses while avoiding
    false splits on time/currency phrases (e.g., ', 2 jam lalu' or ', 20 ribu').
    """
    raw = text.strip()
    if not raw:
        return []

    # Split on ';', newlines, or ',', 'dan', 'sama', 'serta', 'juga', '&' when followed by a dish quantity
    # Explicitly exclude time/currency units after the number so ', 2 jam lalu' or ', 20 ribu' never split.
    parts = re.split(
        r"(?:\s*;\s*|\n+|\s*(?:,|\bdan\b|\bsama\b|\bserta\b|\bjuga\b|&)\s+(?=(?:ada\s+|sisa\s+)?\d+\s*(?!jam\b|menit\b|ribu\b|rb\b|k\b|rupiah\b|idr\b)(?:porsi|pcs|pack|packs|box|botol|gelas|slice|bungkus|kotak|buah|potong|cup|paket|loyang|piring|mangkok|[a-z]{3,})))",
        raw,
        flags=re.IGNORECASE,
    )
    cleaned = [p.strip(" ,;&") for p in parts if p and len(p.strip(" ,;&")) >= 3]
    return cleaned if len(cleaned) >= 2 else [raw]


def _normalize_llm_item(
    data: dict[str, Any],
    clause_text: str,
    local_info: dict[str, Any],
) -> dict[str, Any]:
    """Normalizes a single LLM-extracted item dict with deterministic guardrails."""
    raw_price = _safe_int(data.get("original_price"), local_info["original_price"])
    if 0 < raw_price < 500:
        raw_price *= 1000

    # If local parser detected a specific decimal suffix (e.g. 17.5k) on this clause, trust it
    if local_info["price_mentioned"] and re.search(r"\b\d+[\.,]\d{1,2}\s*(?:ribu|rb|k)\b", clause_text.lower()):
        raw_price = local_info["original_price"]

    food_name = str(data.get("food_name") or "").strip()
    if not food_name or len(food_name) < 2:
        food_name = local_info["food_name"]

    hours_cooked = max(0.0, _safe_float(data.get("hours_since_cooked"), local_info["hours_since_cooked"]))
    clause_lower = clause_text.lower()
    has_overnight = bool(re.search(r"\b(kemarin|semalam|tadi malam|kemarin malam)\b", clause_lower))
    has_explicit_future_kw = bool(
        re.search(r"\b(besok|nanti malam|akan datang|belum dimasak|akan dimasak|masak besok)\b", clause_lower)
    )
    llm_future = data.get("future_cooking_time")
    if isinstance(llm_future, bool):
        future_cooking_time = bool(has_explicit_future_kw or llm_future)
    else:
        future_cooking_time = bool(has_explicit_future_kw or local_info["future_cooking_time"])

    if has_overnight:
        hours_cooked = max(hours_cooked + 24.0, 25.0)
        future_cooking_time = False

    ft = str(data.get("food_type") or local_info["food_type"]).upper().strip()
    if ft not in ("MEAL", "BAKERY", "BEVERAGE"):
        ft = local_info["food_type"]

    inferred_risk = str(data.get("inferred_risk") or "").upper().strip()
    if inferred_risk not in ("HIGH_PERISHABILITY", "MEDIUM_PERISHABILITY", "LOW_PERISHABILITY"):
        inferred_risk = None

    is_edible_raw = data.get("is_edible_food")
    is_edible = is_edible_raw if isinstance(is_edible_raw, bool) else None

    price_mentioned = bool(data.get("price_mentioned") or local_info["price_mentioned"])
    cooking_time_mentioned = bool(
        data.get("cooking_time_mentioned") or local_info["cooking_time_mentioned"]
    )
    explicit_closing_mentioned = bool(
        data.get("closing_time_mentioned")
        or data.get("explicit_closing_mentioned")
        or local_info["explicit_closing_mentioned"]
    )
    closing_minutes = max(
        0,
        _safe_int(data.get("minutes_until_closing"), local_info["minutes_until_closing"]),
    )

    return {
        "food_name": food_name.title(),
        "quantity": max(1, _safe_int(data.get("quantity"), local_info["quantity"])),
        "original_price": max(1000, raw_price),
        "hours_since_cooked": hours_cooked,
        "minutes_until_closing": closing_minutes,
        "food_type": ft,
        "inferred_risk": inferred_risk,
        "is_edible_food": is_edible,
        "extraction_source": GEMINI_MODEL,
        "price_mentioned": price_mentioned,
        "cooking_time_mentioned": cooking_time_mentioned,
        "explicit_closing_mentioned": explicit_closing_mentioned,
        "future_cooking_time": future_cooking_time,
        "has_negative_value": local_info["has_negative_value"],
        "clause_text": clause_text,
    }


async def extract_multiple_listing_entities(
    text: str, audio_base64: Optional[str] = None
) -> list[dict[str, Any]]:
    """Extracts 1 or more dishes from a single merchant voice/text prompt using a single native
    Gemini JSON-array call, supporting natural & abbreviated Indonesian phrasing.
    Falls back to deterministic clause splitting + regex parser only if Gemini is unavailable.
    """
    now_wib = get_effective_now_wib()
    now_wib_str = now_wib.strftime("%Y-%m-%d %H:%M WIB")

    prompt = f"""Anda adalah sistem AI ekstraksi multi-menu katalog surplus food NullWasted di Indonesia.
Waktu saat ini: {now_wib_str}

Tugas Anda adalah membaca kalimat bebas / singkatan dari staf toko kuliner (bisa 1 menu atau BANYAK menu sekaligus dalam satu kalimat) dan mengekstrak SEMUA menu ke dalam objek JSON murni berbentuk:
{{"items": [ {{ ... }}, {{ ... }} ]}}

Aturan penting untuk bahasa santai & singkatan Indonesia:
- Pahami singkatan populer kuliner Indonesia dan rapikan ke nama standar Title Case (contoh: "nasgor" -> "Nasi Goreng", "aybak" -> "Ayam Bakar", "aygor" -> "Ayam Goreng", "migor" -> "Mie Goreng", "nasduk" -> "Nasi Uduk", "nasrames" -> "Nasi Rames", "esteh" -> "Es Teh").
- Pahami format singkat tanpa kata penghubung lengkap, baik nama di depan angka maupun angka di depan nama (contoh: "nasgor 5 20k, aybak 3 25k", "sisa 3 rendang 30rb sama 2 soto 20rb", "roti keju 4, donat 6, semua 10rb baru matang", "gulai 2 & ayam goreng 5 harga 25rb dan 18rb").
- Jika waktu masak, harga ("semua 15rb"), atau jam tutup disebut sekali untuk seluruh menu, terapkan ke semua menu yang tidak punya keterangan waktu/harga sendiri.
- "jam 12 malam" berarti pukul 00:00 (tengah malam). Jika sekarang 02:00 WIB dan makanan matang jam 12 malam, maka hours_since_cooked = 2.0 dan future_cooking_time = false.

Setiap objek di dalam array "items" WAJIB memiliki field berikut:
- "food_name": Nama lengkap hidangan dalam Title Case tanpa angka porsi, harga, atau waktu.
- "is_edible_food": boolean (true untuk makanan/minuman/kue layak konsumsi manusia; false untuk benda non-pangan atau teks acak).
- "food_type": WAJIB salah satu dari "MEAL" | "BAKERY" | "BEVERAGE".
- "inferred_risk": WAJIB salah satu dari "HIGH_PERISHABILITY" (santan/susu/krim/telur mentah, maks 4 jam) | "MEDIUM_PERISHABILITY" (makanan matang/goreng/tumis/kuah bening/kopi-teh non-susu, maks 8 jam) | "LOW_PERISHABILITY" (roti kering/pastry/kue kering, maks 24 jam).
- "quantity": integer >= 1 (jumlah porsi/pcs/bungkus/cup; null jika tidak disebut).
- "original_price": integer harga normal per porsi dalam Rupiah utuh (misal "20k"/"20rb"/"20" -> 20000; null jika tidak disebut).
- "hours_since_cooked": float lama waktu (jam) sejak selesai dimasak hingga {now_wib_str} (jika "kemarin/semalam" >= 24.0; null jika tidak disebut).
- "minutes_until_closing": integer sisa menit hingga toko tutup terhadap {now_wib_str} (null jika tidak disebut).
- "price_mentioned": boolean (true jika harga untuk item ini disebut langsung maupun bersama seperti "semua 10rb").
- "cooking_time_mentioned": boolean (true jika waktu masak disebut langsung maupun bersama).
- "closing_time_mentioned": boolean (true jika waktu tutup disebut).
- "future_cooking_time": boolean (true HANYA jika jam masak berada di masa depan terhadap {now_wib_str} tanpa kata kemarin/semalam, atau memakai kata "besok"/"akan dimasak").
- "clause_text": potongan teks asli yang merujuk ke item ini (string).

Kalimat input penjual: "{text}"

Keluarkan HANYA JSON objek valid berbentuk {{"items": [...]}} tanpa teks pengantar dan tanpa blok markdown."""

    try:
        gemini_response = await ai_gateway.generate_content(prompt=prompt, audio_base64=audio_base64)
        if gemini_response:
            cleaned = gemini_response.strip().replace("```json", "").replace("```", "").strip()
            json_match = re.search(r"(\{.*\}|\[.*\])", cleaned, re.DOTALL)
            if json_match:
                cleaned = json_match.group(0)
            parsed = json.loads(cleaned)
            raw_items = parsed.get("items") if isinstance(parsed, dict) else parsed
            if isinstance(raw_items, list) and len(raw_items) > 0:
                results: list[dict[str, Any]] = []
                for raw_item in raw_items:
                    if not isinstance(raw_item, dict):
                        continue
                    clause = str(raw_item.get("clause_text") or "").strip() or text
                    local_info = await asyncio.to_thread(local_rule_based_extract, clause)
                    results.append(_normalize_llm_item(raw_item, clause, local_info))
                if results:
                    return results
    except Exception as e:
        logger.warning(f"Gemini multi-menu extraction failed: {e}. Utilizing deterministic fallback.")

    # Deterministic offline fallback
    clauses = _split_multi_menu_clauses(text)
    if len(clauses) <= 1:
        single = await asyncio.to_thread(local_rule_based_extract, text)
        single["clause_text"] = text
        return [single]

    global_ctx = await asyncio.to_thread(local_rule_based_extract, text)
    fallback_results: list[dict[str, Any]] = []
    for clause in clauses:
        item = await asyncio.to_thread(local_rule_based_extract, clause)
        if not item.get("cooking_time_mentioned") and global_ctx.get("cooking_time_mentioned"):
            item["hours_since_cooked"] = global_ctx["hours_since_cooked"]
            item["cooking_time_mentioned"] = True
            item["future_cooking_time"] = global_ctx.get("future_cooking_time", False)
        if not item.get("explicit_closing_mentioned") and global_ctx.get("explicit_closing_mentioned"):
            item["minutes_until_closing"] = global_ctx["minutes_until_closing"]
            item["explicit_closing_mentioned"] = True
        item["clause_text"] = clause
        fallback_results.append(item)

    return fallback_results


async def extract_menu_catalog_items(
    raw_text: str = "",
    image_base64: Optional[str] = None,
    image_mime_type: str = "image/jpeg",
) -> tuple[list[dict[str, Any]], str]:
    """Extracts a complete restaurant menu catalog (name, price, auto-inferred ingredients)
    from pasted text and/or a menu photo using Gemini multimodal JSON output.
    Returns (items, extraction_source).
    """
    cleaned_text = (raw_text or "").strip()
    source_desc = []
    if cleaned_text:
        source_desc.append(f'Teks daftar menu dari mitra:\n"""\n{cleaned_text}\n"""')
    if image_base64:
        source_desc.append("Foto buku menu / daftar harga terlampir pada gambar.")
    source_block = "\n\n".join(source_desc)

    prompt = f"""Anda adalah sistem AI ekstraksi Buku Menu Gerai (Store Master Catalog) untuk platform penyelamatan makanan NullWasted di Indonesia.
Tugas Anda: baca seluruh daftar menu makanan/minuman dari teks dan/atau foto buku menu berikut, lalu kembalikan objek JSON dengan key "items" berisi array seluruh menu yang ditemukan (maksimal 40 item).

Untuk SETIAP item menu, kembalikan field berikut:
- "food_name": Nama hidangan makanan/minuman yang rapi dalam Title Case (misal "Nasi Goreng Spesial", "Gulai Kambing", "Es Teh Manis", "Roti Keju"). Jangan sertakan harga atau nomor urut di food_name.
- "original_price": Harga normal per porsi dalam Rupiah utuh (integer >= 1000, misal "25k" / "25rb" / "25.000" -> 25000). Jika harga tidak terbaca/tidak disebut, isi 15000.
- "ingredients": Estimasi komposisi/bahan utama hidangan dalam bahasa Indonesia (string dipisahkan koma, minimal 3 kata). WAJIB diisi otomatis berdasarkan pengetahuan kuliner standar Indonesia jika tidak tertulis eksplisit (misal "Gulai Kambing" -> "daging kambing, santan kelapa, bumbu rempah"; "Ayam Bakar" -> "daging ayam, kecap manis, bumbu rempah"; "Roti Keju" -> "tepung terigu, keju, mentega, ragi").
- "is_edible_food": boolean (true untuk makanan/minuman manusia yang sah; false jika bukan makanan/minuman).
- "food_type": WAJIB salah satu dari "MEAL" | "BAKERY" | "BEVERAGE".
- "inferred_risk": Klasifikasi risiko umur simpan suhu ruang PerBPOM No. 16/2019 — WAJIB salah satu dari:
  * "HIGH_PERISHABILITY" (maks 4 jam): mengandung santan, susu segar, krim/vla/mayones, telur setengah matang, daging/seafood mentah.
  * "MEDIUM_PERISHABILITY" (maks 8 jam): makanan matang siap saji, tumis, goreng, bakar, kuah non-santan, minuman teh/kopi tanpa susu.
  * "LOW_PERISHABILITY" (maks 24 jam): roti panggang, pastry kering tanpa krim basah, kue kering, keripik.

ATURAN PENTING:
1. Abaikan judul kategori (seperti "MAKANAN BERAT", "MINUMAN", "PAKET HEMAT") kecuali itu adalah nama menu beserta harga.
2. Pahami singkatan umum menu Indonesia (nasgor -> Nasi Goreng, aybak -> Ayam Bakar, esteh -> Es Teh, mie -> Mie Goreng/Rebus).
3. Jangan menggandakan item yang identik.

{source_block}

Keluarkan HANYA objek JSON valid dengan format {{"items": [...]}} tanpa teks pengantar dan tanpa blok markdown."""

    try:
        gemini_response = await ai_gateway.generate_content(
            prompt=prompt,
            image_base64=image_base64,
            image_mime_type=image_mime_type,
        )
        if gemini_response:
            cleaned = gemini_response.strip().replace("```json", "").replace("```", "").strip()
            json_match = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if json_match:
                cleaned = json_match.group(0)
            parsed = json.loads(cleaned)
            raw_items = parsed.get("items") if isinstance(parsed, dict) else parsed
            if isinstance(raw_items, list) and len(raw_items) > 0:
                results: list[dict[str, Any]] = []
                for entry in raw_items[:40]:
                    if not isinstance(entry, dict):
                        continue
                    fname = str(entry.get("food_name") or "").strip()
                    if len(fname) < 2:
                        continue
                    price_val = _safe_int(entry.get("original_price"), 15000)
                    if 0 < price_val < 500:
                        price_val *= 1000
                    price_val = max(1000, min(2000000, price_val))
                    ing = str(entry.get("ingredients") or "").strip()
                    if len(ing) < 3:
                        ing = f"Bahan olahan standar {fname.lower()}"
                    ft = str(entry.get("food_type") or "MEAL").strip().upper()
                    if ft not in ("MEAL", "BAKERY", "BEVERAGE"):
                        ft = "MEAL"
                    risk = str(entry.get("inferred_risk") or "MEDIUM_PERISHABILITY").strip().upper()
                    if risk not in ("HIGH_PERISHABILITY", "MEDIUM_PERISHABILITY", "LOW_PERISHABILITY"):
                        risk = None
                    is_edible = entry.get("is_edible_food")
                    if not isinstance(is_edible, bool):
                        is_edible = True
                    results.append({
                        "food_name": fname,
                        "original_price": price_val,
                        "ingredients": ing,
                        "is_edible_food": is_edible,
                        "food_type": ft,
                        "inferred_risk": risk,
                    })
                if results:
                    return results, "gemini-3.5-flash-lite"
    except Exception as e:
        logger.warning(f"Gemini bulk menu catalog extraction failed: {e}. Falling back to local text parser.")

    # Offline deterministic fallback for text input
    if not cleaned_text:
        return [], "local-fallback-parser"

    lines = [
        ln.strip(" -\t•*")
        for ln in re.split(r"[\n,;]+", cleaned_text)
        if ln.strip(" -\t•*")
    ]
    fallback_items: list[dict[str, Any]] = []
    for ln in lines[:40]:
        local = await asyncio.to_thread(local_rule_based_extract, ln)
        fname = local.get("food_name") or ln[:60]
        if len(fname.strip()) < 2:
            continue
        price_val = max(1000, min(2000000, int(local.get("original_price") or 15000)))
        matched_item, _ = vector_store.search_similar_dish(fname)
        ing_raw = matched_item.get("ingredients", [])
        ing_str = ", ".join(ing_raw) if isinstance(ing_raw, list) and ing_raw else f"Bahan olahan standar {fname.lower()}"
        fallback_items.append({
            "food_name": fname.strip(),
            "original_price": price_val,
            "ingredients": ing_str,
            "is_edible_food": True,
            "food_type": matched_item.get("food_type", "MEAL"),
            "inferred_risk": None,
        })
    return fallback_items, "local-fallback-parser"
