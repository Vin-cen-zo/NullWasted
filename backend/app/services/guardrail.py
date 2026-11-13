import re
from typing import Any
from app.services.vector_store import vector_store

FORBIDDEN_NON_FOOD = [
    "racun", "tikus", "arsenik", "sianida", "pestisida", "baterai", "aki",
    "deterjen", "sabun", "oli", "obat nyamuk", "logam", "plastik", "kaca",
    "semen", "bensin", "solar", "formalin", "boraks", "tawas", "kaporit",
]

FORBIDDEN_WILDLIFE = [
    "anjing", "kucing", "kelelawar", "celeng", "biawak", "monyet", "kera", "ular", "buaya",
]

FUTURE_TIME_KEYWORDS = [
    "besok", "nanti malam", "akan datang", "belum dimasak", "akan dimasak", "masak besok",
]


def evaluate_food_safety(
    food_name: str,
    raw_text: str = "",
    hours_since_cooked: float = 1.0,
    ai_is_edible: bool | None = None,
    ai_food_type: str | None = None,
    ai_inferred_risk: str | None = None,
    future_cooking_time: bool = False,
) -> dict[str, Any]:
    """Deterministically evaluates food safety compliance against Indonesian BPOM standards.
    Uses semantic vector match + AI contextual classification for regional/novel dishes,
    while keeping PerBPOM safety thresholds 100% deterministic.
    """
    search_query = f"{food_name} {raw_text}".strip()
    query_lower = search_query.lower()

    # 1. Non-food / Poison / Chemical defense (Word boundary \b)
    for kw in FORBIDDEN_NON_FOOD:
        if re.search(rf"\b{re.escape(kw)}\b", query_lower):
            return {
                "matched_canonical_dish": "Bukan Bahan Pangan (Ditolak)",
                "category": "FORBIDDEN_NON_FOOD",
                "food_type": "MEAL",
                "bpom_max_hours": 0.0,
                "similarity_score": 0.0,
                "safety_status": "REJECTED",
                "can_publish": False,
                "safety_reason": (
                    f"BAHAYA FATAL (NON-PANGAN): Terdeteksi entitas berbahaya atau non-makanan ('{kw}'). "
                    f"Dilarang keras memperjualbelikan bahan kimia, racun, atau benda non-pangan."
                ),
                "hazard_description": "Substansi beracun atau benda non-pangan dapat menyebabkan intoksikasi mematikan dan dilarang mutlak oleh hukum pangan.",
                "regulation_ref": "UU No. 18/2012 tentang Pangan & Standar Keamanan Pangan BPOM",
            }

    # 2. Wildlife / Non-consumption meat defense (Word boundary \b)
    for kw in FORBIDDEN_WILDLIFE:
        if re.search(rf"\b{re.escape(kw)}\b", query_lower):
            return {
                "matched_canonical_dish": "Bahan Hewani Non-Pangan (Ditolak)",
                "category": "FORBIDDEN_WILDLIFE",
                "food_type": "MEAL",
                "bpom_max_hours": 0.0,
                "similarity_score": 0.0,
                "safety_status": "REJECTED",
                "can_publish": False,
                "safety_reason": (
                    f"DITOLAK (BAHAN HEWANI TERLARANG): Bahan hewani '{kw}' tidak terdaftar dalam "
                    f"standar pangan konsumsi retail yang diizinkan PerBPOM."
                ),
                "hazard_description": "Daging satwa liar atau hewan peliharaan rentan membawa zoonosis berbahaya dan dilarang dalam rantai pasok pangan ritel.",
                "regulation_ref": "PerBPOM No. 16/2019 & Standar Pangan Hewani Asuh",
            }

    # 3. Future cooking time defense
    if future_cooking_time or re.search(r"\b(besok|nanti malam|akan datang|belum dimasak|akan dimasak|masak besok)\b", query_lower):
        return {
            "matched_canonical_dish": "Waktu Masak Tidak Valid (Ditolak)",
            "category": "INVALID_COOKING_TIME",
            "food_type": "MEAL",
            "bpom_max_hours": 0.0,
            "similarity_score": 0.0,
            "safety_status": "REJECTED",
            "can_publish": False,
            "safety_reason": "DITOLAK (WAKTU MASA DEPAN): Waktu matang hidangan tidak boleh berada di masa depan. Makanan surplus harus merupakan hidangan yang sudah selesai dimasak.",
            "hazard_description": "Ketidakpastian waktu produksi aktual melanggar ketentuan ketertelusuran keamanan pangan BPOM.",
            "regulation_ref": "PerBPOM No. 16/2019 Standar Penanganan Pangan Siap Saji",
        }

    # 3b. AI Non-food rejection (e.g., sepatu, baju, elektronik, gibberish not in FORBIDDEN_NON_FOOD)
    if ai_is_edible is False:
        return {
            "matched_canonical_dish": "Bukan Hidangan Pangan (Ditolak)",
            "category": "REJECTED_UNKNOWN_FOOD",
            "food_type": "MEAL",
            "bpom_max_hours": 0.0,
            "similarity_score": 0.0,
            "safety_status": "REJECTED",
            "can_publish": False,
            "safety_reason": (
                f"DITOLAK (BUKAN PANGAN KONSUMSI): Entitas '{food_name}' teridentifikasi bukan makanan atau "
                f"minuman layak konsumsi manusia."
            ),
            "hazard_description": "Barang non-pangan tidak memenuhi ketentuan komoditas pangan PerBPOM.",
            "regulation_ref": "UU No. 18/2012 tentang Pangan & PerBPOM No. 16/2019",
        }

    matched_item, similarity_score = vector_store.search_similar_dish(search_query)

    bpom_max_hours = float(matched_item.get("bpom_max_hours", 8.0))
    canonical_dish = matched_item.get("canonical_name", food_name.title())
    category = matched_item.get("category", "MEDIUM_PERISHABILITY")
    regulation_ref = matched_item.get("regulation_ref", "PerBPOM No. 16/2019")
    hazard_description = matched_item.get(
        "hazard_description",
        "Risiko mikrobiologis meningkat seiring waktu simpan melebihi ambang batas aman suhu ruang."
    )

    # Resolve culinary food_type (MEAL | BAKERY | BEVERAGE): prefer AI classification, fallback to semantic vector match
    if ai_food_type in ("MEAL", "BAKERY", "BEVERAGE"):
        food_type = ai_food_type
    else:
        food_type = matched_item.get("food_type", "MEAL")
        if food_type not in ("MEAL", "BAKERY", "BEVERAGE"):
            food_type = "MEAL"

    # Lexical high-risk override for santan, dairy, cream sauces, raw meats, egg emulsions, and klappertaart
    high_risk_keywords = [
        # Santan & Indonesian High-Risk Wet Coconut Milk
        "santan", "gulai", "opor", "soto betawi", "kari", "lodeh", "cendol", "dawet", "nasi uduk", "nasi kuning gurih", "nasi lemak",
        # Dairy, Cream, Egg Emulsions, and Western High-Risk Sauces
        "carbonara", "karbonara", "alfredo", "cream", "krim", "creamy", "keju cair", "cheese sauce",
        "mayones", "mayo", "tartar", "caesar salad", "salad telur", "egg salad",
        "vla", "custard", "tiramisu", "choux", "kue sus", "eclair", "puding susu", "cheesecake basah",
        "klappertaart", "klapertart", "fla susu", "pie susu",
        "milk tea", "boba fresh milk", "susu segar", "fresh milk", "latte",
        # Raw / Semi-Raw Ingredients
        "sashimi", "raw salmon", "raw tuna", "raw fish", "ikan mentah", "daging mentah", "tartare",
        "telur setengah matang", "raw egg", "telur mentah"
    ]
    has_high_risk = any(k in query_lower for k in high_risk_keywords)
    if has_high_risk:
        category = "HIGH_PERISHABILITY"
        bpom_max_hours = min(bpom_max_hours, 4.0)
        regulation_ref = "PerBPOM No. 16/2019 Kategori Pangan Basah Mudah Rusak (Santan/Susu/Krim/Telur/Mentah)"
        hazard_description = "Olahan bersantan, saus emulsi krim/susu, telur setengah matang, dan bahan mentah sangat rentan terhadap proliferasi cepat Bacillus cereus, Salmonella, dan enterotoksin Staphylococcus aureus pada suhu kamar."
    elif similarity_score < 0.72 and ai_inferred_risk in ("HIGH_PERISHABILITY", "MEDIUM_PERISHABILITY", "LOW_PERISHABILITY"):
        # For culinary items outside the 100 static BPOM archetypes (e.g. Seblak, Cilok, Kombucha),
        # apply AI risk tier or conservative 8-hour MEDIUM_PERISHABILITY baseline
        risk_hours_map = {
            "HIGH_PERISHABILITY": 4.0,
            "MEDIUM_PERISHABILITY": 8.0,
            "LOW_PERISHABILITY": 24.0,
        }
        category = ai_inferred_risk
        bpom_max_hours = risk_hours_map[category]
        canonical_dish = food_name.strip().title() or canonical_dish
        regulation_ref = "PerBPOM No. 16/2019 Klasifikasi Adaptif AI"
        if category == "MEDIUM_PERISHABILITY":
            hazard_description = "Hidangan matang/siap saji dievaluasi dengan standar konservatif suhu ruang maksimal 8 jam."

    # 4. Unknown/non-edible entity check: allow any AI-verified edible dish, reject if explicitly non-edible or unverified + low score
    if ai_is_edible is False or (ai_is_edible is not True and similarity_score < 0.52 and not has_high_risk):
        safety_status = "REJECTED"
        can_publish = False
        category = "REJECTED_UNKNOWN_FOOD"
        safety_reason = (
            f"DITOLAK (ENTITAS TIDAK DIKENALI): Hidangan '{food_name}' tidak dikenali sebagai pangan "
            f"siap saji yang valid (skor kemiripan {similarity_score:.2f} < 0.52)."
        )
    # 5. Deterministic Time Limit Evaluation
    elif hours_since_cooked > bpom_max_hours:
        safety_status = "REJECTED"
        can_publish = False
        if category == "HIGH_PERISHABILITY":
            safety_reason = (
                f"BAHAYA KRITIS: Waktu simpan hidangan berisiko tinggi ({hours_since_cooked:.1f} jam) "
                f"melampaui batas maksimal BPOM ({bpom_max_hours:.1f} jam). Berisiko tinggi kontaminasi "
                f"racun bakteri Bacillus cereus, Salmonella, dan Staphylococcus aureus pada suhu ruang."
            )
        else:
            safety_reason = (
                f"DITOLAK: Waktu simpan ({hours_since_cooked:.1f} jam) melampaui batas aman suhu ruang BPOM "
                f"({bpom_max_hours:.1f} jam). Pangan tidak memenuhi syarat kelayakan konsumsi surplus."
            )
    else:
        safety_status = "SAFE"
        can_publish = True
        category_human_names = {
            "HIGH_PERISHABILITY": "Olahan Santan & Cepat Basi (Maks 4 Jam)",
            "MEDIUM_PERISHABILITY": "Makanan Matang Siap Saji (Maks 8 Jam)",
            "LOW_PERISHABILITY": "Roti & Kudapan Kering (Maks 24 Jam)",
        }
        human_cat = category_human_names.get(category, "Makanan Siap Santap")
        safety_reason = (
            f"AMAN: Waktu simpan ({hours_since_cooked:.1f} jam) berada di bawah ambang batas maksimal BPOM "
            f"({bpom_max_hours:.1f} jam) untuk kategori {human_cat}."
        )

    return {
        "matched_canonical_dish": canonical_dish,
        "category": category,
        "food_type": food_type,
        "bpom_max_hours": bpom_max_hours,
        "similarity_score": similarity_score,
        "safety_status": safety_status,
        "can_publish": can_publish,
        "safety_reason": safety_reason,
        "hazard_description": hazard_description,
        "regulation_ref": regulation_ref,
    }
