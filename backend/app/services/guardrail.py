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
) -> dict[str, Any]:
    """Deterministically evaluates food safety compliance against Indonesian BPOM standards.
    0% LLM hallucination - 100% rule-based threshold comparison.
    """
    search_query = f"{food_name} {raw_text}".strip()
    query_lower = search_query.lower()

    # 1. Non-food / Poison / Chemical defense (Word boundary \b)
    for kw in FORBIDDEN_NON_FOOD:
        if re.search(rf"\b{re.escape(kw)}\b", query_lower):
            return {
                "matched_canonical_dish": "Bukan Bahan Pangan (Ditolak)",
                "category": "FORBIDDEN_NON_FOOD",
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
    if re.search(r"\b(besok|nanti malam|akan datang|belum dimasak|akan dimasak|masak besok)\b", query_lower):
        return {
            "matched_canonical_dish": "Waktu Masak Tidak Valid (Ditolak)",
            "category": "INVALID_COOKING_TIME",
            "bpom_max_hours": 0.0,
            "similarity_score": 0.0,
            "safety_status": "REJECTED",
            "can_publish": False,
            "safety_reason": "DITOLAK (WAKTU MASA DEPAN): Waktu matang hidangan tidak boleh berada di masa depan. Makanan surplus harus merupakan hidangan yang sudah selesai dimasak.",
            "hazard_description": "Ketidakpastian waktu produksi aktual melanggar ketentuan ketertelusuran keamanan pangan BPOM.",
            "regulation_ref": "PerBPOM No. 16/2019 Standar Penanganan Pangan Siap Saji",
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

    # 4. Unknown entity threshold check (< 0.65 similarity)
    if similarity_score < 0.65 and not has_high_risk:
        safety_status = "REJECTED"
        can_publish = False
        category = "REJECTED_UNKNOWN_FOOD"
        safety_reason = (
            f"DITOLAK (ENTITAS TIDAK DIKENALI): Hidangan '{food_name}' tidak dikenali sebagai pangan "
            f"siap saji yang valid (skor kemiripan {similarity_score:.2f} < 0.65)."
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
        safety_reason = (
            f"AMAN: Waktu simpan ({hours_since_cooked:.1f} jam) berada di bawah ambang batas maksimal BPOM "
            f"({bpom_max_hours:.1f} jam) untuk kategori {category}."
        )

    return {
        "matched_canonical_dish": canonical_dish,
        "category": category,
        "bpom_max_hours": bpom_max_hours,
        "similarity_score": similarity_score,
        "safety_status": safety_status,
        "can_publish": can_publish,
        "safety_reason": safety_reason,
        "hazard_description": hazard_description,
        "regulation_ref": regulation_ref,
    }
