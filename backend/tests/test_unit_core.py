import asyncio
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.core.database import get_session
from app.core.seed import seed_initial_data
from app.main import app
from app.services.extractor import extract_listing_entities, local_rule_based_extract
from app.services.guardrail import evaluate_food_safety
from app.services.pricing import calculate_dynamic_pricing
from app.services.vector_store import CACHE_PATH, vector_store


# In-memory database fixture for zero-blocker clean isolation
@pytest.fixture(name="client")
def client_fixture():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        seed_initial_data(session)

    def get_test_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = get_test_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


# ============================================================================
# 1. PRICING ENGINE UNIT TESTS
# ============================================================================

def test_pricing_happy_path_pill_1():
    """Pill 1: Croissant Cokelat (Rp20.000, 2 jam / 120 menit menjelang tutup) -> 55% (Rp9.000)."""
    result = calculate_dynamic_pricing(original_price=20000, minutes_until_closing=120)
    assert result["discount_percent"] == 55
    assert result["discounted_price"] == 9000


def test_pricing_boundary_critical_pill_3():
    """Pill 3: Nasi Bento Ayam (Rp30.000, 15 menit menjelang tutup) -> 70% (Rp9.000)."""
    result = calculate_dynamic_pricing(original_price=30000, minutes_until_closing=15)
    assert result["discount_percent"] == 70
    assert result["discounted_price"] == 9000


def test_pricing_bounds_and_rounding():
    """Discount percent must strictly be clamped between 50% and 70%, rounded down to hundreds."""
    # Far from closing (> 160 mins) -> 50%
    res_far = calculate_dynamic_pricing(original_price=20000, minutes_until_closing=240)
    assert res_far["discount_percent"] == 50
    assert res_far["discounted_price"] == 10000

    # Custom discount clamped
    res_custom_high = calculate_dynamic_pricing(original_price=10000, minutes_until_closing=60, custom_discount_percent=85)
    assert res_custom_high["discount_percent"] == 70

    res_custom_low = calculate_dynamic_pricing(original_price=10000, minutes_until_closing=60, custom_discount_percent=30)
    assert res_custom_low["discount_percent"] == 50

    # Price rounding to nearest 100 rupiah (Rp8.125 with 0% clamped to 50% = 4062.5 -> 4000)
    res_odd = calculate_dynamic_pricing(original_price=16250, minutes_until_closing=160)
    assert res_odd["discount_percent"] == 50
    assert res_odd["discounted_price"] == 8100  # 16250 * 0.5 = 8125 -> 8100


# ============================================================================
# 2. FOOD SAFETY GUARDRAIL UNIT TESTS
# ============================================================================

def test_guardrail_reject_santan_basi_pill_2():
    """Pill 2: Gulai Ayam Padang santan kental, sudah 7 jam suhu ruang -> REJECTED (max 4.0 jam)."""
    safety = evaluate_food_safety(
        food_name="Gulai Ayam Padang",
        raw_text="Gulai Ayam Padang santan kental, sudah 7 jam suhu ruang",
        hours_since_cooked=7.0,
    )
    assert safety["safety_status"] == "REJECTED"
    assert safety["can_publish"] is False
    assert safety["bpom_max_hours"] == 4.0
    assert "Bacillus cereus" in safety["safety_reason"] or "Bacillus cereus" in safety["hazard_description"]


def test_guardrail_safe_croissant_and_bento():
    """Croissant (1 jam <= 24 jam) and Bento (2 jam <= 8 jam) -> SAFE."""
    croissant_safety = evaluate_food_safety(
        food_name="Croissant Cokelat",
        raw_text="Croissant Cokelat baru matang 1 jam lalu",
        hours_since_cooked=1.0,
    )
    assert croissant_safety["safety_status"] == "SAFE"
    assert croissant_safety["can_publish"] is True
    assert croissant_safety["bpom_max_hours"] == 24.0

    bento_safety = evaluate_food_safety(
        food_name="Nasi Bento Ayam",
        raw_text="Nasi Bento Ayam baru matang 2 jam lalu",
        hours_since_cooked=2.0,
    )
    assert bento_safety["safety_status"] == "SAFE"
    assert bento_safety["can_publish"] is True
    assert bento_safety["bpom_max_hours"] == 8.0


# ============================================================================
# 3. LOCAL FALLBACK EXTRACTOR UNIT TESTS
# ============================================================================

def test_local_extractor_all_three_preset_pills():
    """Verifies that all three preset pill sentences parse 100% deterministically."""
    # Pill 1
    pill1_text = "Sisa 4 porsi Croissant Cokelat, harga normal Rp20.000, baru matang 1 jam lalu, toko tutup 2 jam lagi."
    e1 = local_rule_based_extract(pill1_text)
    assert "Croissant" in e1["food_name"]
    assert e1["quantity"] == 4
    assert e1["original_price"] == 20000
    assert e1["hours_since_cooked"] == 1.0
    assert e1["minutes_until_closing"] == 120

    # Pill 2
    pill2_text = "Ada sisa 3 porsi Gulai Ayam Padang santan kental, harga Rp25.000, selesai masak jam 11 siang (sudah 7 jam suhu ruang)."
    e2 = local_rule_based_extract(pill2_text)
    assert "Gulai Ayam" in e2["food_name"]
    assert e2["quantity"] == 3
    assert e2["original_price"] == 25000
    assert e2["hours_since_cooked"] == 7.0
    assert e2["minutes_until_closing"] == 120

    # Pill 3
    pill3_text = "Ada 5 porsi Nasi Bento Ayam, harga Rp30.000, baru matang 2 jam lalu, toko tutup 15 menit lagi."
    e3 = local_rule_based_extract(pill3_text)
    assert "Nasi Bento" in e3["food_name"] or "Bento" in e3["food_name"]
    assert e3["quantity"] == 5
    assert e3["original_price"] == 30000
    assert e3["hours_since_cooked"] == 2.0
    assert e3["minutes_until_closing"] == 15


# ============================================================================
# 4. FULL API INTEGRATION TESTS (TestClient)
# ============================================================================

def test_api_full_lifecycle(client: TestClient):
    """Full lifecycle: Draft -> Guardrail Check -> Reject/Publish -> Active Catalog -> Order Reservation -> Deactivation."""
    # 1. Health check
    res_health = client.get("/health")
    assert res_health.status_code == 200
    assert res_health.json()["status"] == "ok"

    # 2. Draft Pill 1 (Croissant) -> SAFE
    p1_payload = {
        "text": "Sisa 4 porsi Croissant Cokelat, harga normal Rp20.000, baru matang 1 jam lalu, toko tutup 2 jam lagi."
    }
    draft1_res = client.post("/api/v1/listings/draft", json=p1_payload)
    assert draft1_res.status_code == 200
    draft1_data = draft1_res.json()
    assert draft1_data["safety_status"] == "SAFE"
    assert draft1_data["can_publish"] is True
    assert draft1_data["recommended_discount_percent"] == 55
    assert draft1_data["discounted_price"] == 9000

    # 3. Draft Pill 2 (Gulai Ayam) -> REJECTED (anchored to 18:00 WIB for 11:00 AM -> 7h elapsed)
    p2_payload = {
        "text": "Ada sisa 3 porsi Gulai Ayam Padang santan kental, harga Rp25.000, selesai masak jam 11 siang (sudah 7 jam suhu ruang)."
    }
    draft2_res = client.post(
        "/api/v1/listings/draft",
        json=p2_payload,
        headers={"X-Simulated-Time": "2026-11-12T18:00:00+07:00"},
    )
    assert draft2_res.status_code == 200
    draft2_data = draft2_res.json()
    assert draft2_data["safety_status"] == "REJECTED"
    assert draft2_data["can_publish"] is False
    assert "Bacillus cereus" in draft2_data["safety_reason"] or "Bacillus cereus" in draft2_data["hazard_description"]

    # 4. Publish Pill 2 -> Must be rejected with HTTP 400 Bad Request
    pub2_payload = {
        "food_name": draft2_data["food_name"],
        "matched_canonical_dish": draft2_data["matched_canonical_dish"],
        "category": draft2_data["category"],
        "quantity": draft2_data["quantity"],
        "original_price": draft2_data["original_price"],
        "discount_percent": 50,
        "hours_since_cooked": draft2_data["hours_since_cooked"],
        "bpom_max_hours": draft2_data["bpom_max_hours"],
        "minutes_until_closing": draft2_data["minutes_until_closing"],
        "safety_status": draft2_data["safety_status"],
        "safety_reason": draft2_data["safety_reason"],
        "hazard_description": draft2_data["hazard_description"],
    }
    pub2_res = client.post("/api/v1/listings/publish", json=pub2_payload)
    assert pub2_res.status_code == 400
    assert "Guardrail Keamanan Pangan BPOM" in pub2_res.json()["detail"]

    # 5. Publish Pill 1 -> Must succeed with HTTP 200 OK
    pub1_payload = {
        "food_name": draft1_data["food_name"],
        "matched_canonical_dish": draft1_data["matched_canonical_dish"],
        "category": draft1_data["category"],
        "quantity": draft1_data["quantity"],
        "original_price": draft1_data["original_price"],
        "discount_percent": draft1_data["recommended_discount_percent"],
        "hours_since_cooked": draft1_data["hours_since_cooked"],
        "bpom_max_hours": draft1_data["bpom_max_hours"],
        "minutes_until_closing": draft1_data["minutes_until_closing"],
        "safety_status": draft1_data["safety_status"],
        "safety_reason": draft1_data["safety_reason"],
        "hazard_description": draft1_data["hazard_description"],
    }
    pub1_res = client.post("/api/v1/listings/publish", json=pub1_payload)
    assert pub1_res.status_code == 200
    pub1_data = pub1_res.json()
    assert pub1_data["id"].startswith("lst-")
    assert pub1_data["discounted_price"] == 9000
    assert pub1_data["quantity"] == 4
    listing_id = pub1_data["id"]

    # 6. Retrieve active listings -> Pill 1 must be present
    active_res = client.get("/api/v1/listings/active")
    assert active_res.status_code == 200
    active_list = active_res.json()
    assert any(item["id"] == listing_id for item in active_list)

    # 7. Reserve 1 portion from Pill 1 -> Atomic decrement
    reserve_res = client.post(
        "/api/v1/orders/reserve",
        json={"listing_id": listing_id, "quantity": 1, "customer_name": "Budi Santoso"},
    )
    assert reserve_res.status_code == 200
    ticket_data = reserve_res.json()
    assert ticket_data["order_code"].startswith("#NW-")
    assert ticket_data["customer_name"] == "Budi Santoso"
    assert ticket_data["quantity"] == 1
    assert ticket_data["unit_price"] == 9000
    assert ticket_data["total_price"] == 9000
    assert ticket_data["status"] == "RESERVED"
    assert "NULLWASTED|ORDER:" in ticket_data["qr_payload"]
    assert "USER:Budi Santoso" in ticket_data["qr_payload"]

    # Verify listing stock decremented to 3
    active_res_after = client.get("/api/v1/listings/active")
    updated_item = next(item for item in active_res_after.json() if item["id"] == listing_id)
    assert updated_item["quantity"] == 3

    # 8. Check active orders list contains the reserved ticket
    orders_res = client.get("/api/v1/orders/active")
    assert orders_res.status_code == 200
    orders_list = orders_res.json()
    assert any(o["order_code"] == ticket_data["order_code"] for o in orders_list)

    # 9. Cashier validates and completes the order pickup
    complete_res = client.post(
        "/api/v1/orders/complete-pickup",
        json={"order_code": ticket_data["order_code"]},
    )
    assert complete_res.status_code == 200
    completed_ticket = complete_res.json()
    assert completed_ticket["status"] == "COMPLETED"
    assert completed_ticket["completed_at"] is not None

    # 10. Attempt duplicate completion -> Must be rejected with 400
    dup_res = client.post(
        "/api/v1/orders/complete-pickup",
        json={"order_code": ticket_data["order_code"]},
    )
    assert dup_res.status_code == 400
    assert "sudah pernah diverifikasi" in dup_res.json()["detail"]

    # 11. Deactivate listing
    del_res = client.delete(f"/api/v1/listings/{listing_id}")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"

    # Verify listing is no longer in active catalog
    active_res_final = client.get("/api/v1/listings/active")
    assert not any(item["id"] == listing_id for item in active_res_final.json())


# ============================================================================
# 5. REAL AI SEMANTIC VECTOR STORE & LLM EXTRACTOR TESTS
# ============================================================================

def test_semantic_vector_store_and_cache_integrity():
    """Verifies that vector_store loads the 70 comprehensive BPOM dishes and 3072-dim embeddings cache properly."""
    assert len(vector_store.items) >= 70
    assert CACHE_PATH.exists()
    assert len(vector_store.semantic_embeddings) == len(vector_store.items)

    for item_id, emb in vector_store.semantic_embeddings.items():
        assert emb.shape == (3072,)

    # Test semantic similarity matching on non-exact culinary queries
    santan_match, santan_score = vector_store.search_similar_dish("soto tangkar kuah santan kental")
    assert santan_match["category"] == "HIGH_PERISHABILITY"
    assert santan_match["bpom_max_hours"] == 4.0
    assert santan_score >= 0.80

    bakery_match, bakery_score = vector_store.search_similar_dish("roti sobek artisan keju panggang")
    assert bakery_match["category"] == "LOW_PERISHABILITY"
    assert bakery_match["bpom_max_hours"] == 24.0
    assert bakery_score >= 0.80

    # Test western & international dishes
    carbonara_match, carbonara_score = vector_store.search_similar_dish("creamy fettuccine carbonara")
    assert carbonara_match["category"] == "HIGH_PERISHABILITY"
    assert carbonara_match["bpom_max_hours"] == 4.0
    assert carbonara_score >= 0.80

    pizza_match, pizza_score = vector_store.search_similar_dish("pepperoni cheesy pizza slice")
    assert pizza_match["category"] == "MEDIUM_PERISHABILITY"
    assert pizza_match["bpom_max_hours"] == 8.0
    assert pizza_score >= 0.80


def test_guardrail_carbonara_and_universal_perishables():
    """Verifies that Carbonara, cream sauces, raw fish, and salads are strictly bounded by 4-hour rule."""
    # 1. Carbonara 6 hours -> MUST BE REJECTED
    c6_eval = evaluate_food_safety("Spageti Carbonara", raw_text="5 porsi spageti carbonara dibuat 6 jam yang lalu", hours_since_cooked=6.0)
    assert c6_eval["safety_status"] == "REJECTED"
    assert c6_eval["can_publish"] is False
    assert c6_eval["bpom_max_hours"] == 4.0
    assert "Bacillus cereus" in c6_eval["safety_reason"] or "BAHAYA KRITIS" in c6_eval["safety_reason"]

    # 2. Carbonara 1 hour -> MUST BE SAFE
    c1_eval = evaluate_food_safety("Spageti Carbonara", raw_text="2 porsi spageti carbonara baru matang 1 jam lalu", hours_since_cooked=1.0)
    assert c1_eval["safety_status"] == "SAFE"
    assert c1_eval["can_publish"] is True
    assert c1_eval["bpom_max_hours"] == 4.0

    # 3. Caesar Salad with Mayonnaise 5 hours -> MUST BE REJECTED
    salad_eval = evaluate_food_safety("Caesar Salad", raw_text="salad sayur saus caesar mayo dibuat 5 jam lalu", hours_since_cooked=5.0)
    assert salad_eval["safety_status"] == "REJECTED"
    assert salad_eval["can_publish"] is False
    assert salad_eval["bpom_max_hours"] == 4.0

    # 4. Pizza 3 hours -> MUST BE SAFE (8-hour limit)
    pizza_eval = evaluate_food_safety("Pizza Meat Lovers", raw_text="3 loyang pizza matang 3 jam lalu", hours_since_cooked=3.0)
    assert pizza_eval["safety_status"] == "SAFE"
    assert pizza_eval["can_publish"] is True
    assert pizza_eval["bpom_max_hours"] == 8.0


def test_live_or_fallback_entity_extractor():
    """Verifies live Gemini 3.5 Flash extractor or fallback accurately parses Indonesian surplus food commands."""
    sentence = "Ada 4 porsi gulai tunjang santan padang, harga normal 28 ribu, masak 5 jam lalu, toko tutup 45 menit lagi"

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            result = pool.submit(asyncio.run, extract_listing_entities(sentence)).result()
    else:
        result = asyncio.run(extract_listing_entities(sentence))

    assert "Gulai Tunjang" in result["food_name"] or "Santan" in result["food_name"]
    assert result["quantity"] == 4
    assert result["original_price"] == 28000
    assert result["hours_since_cooked"] == 5.0
    assert result["minutes_until_closing"] == 45
    assert result["extraction_source"] in (
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
        "gemini-flash-lite-latest",
        "local-fallback-parser",
    )


# ============================================================================
# 6. SPRINT 2 SYSTEM INTEGRATION EXTENDED TESTS (10 NEW TESTS)
# ============================================================================

def test_seed_multi_store_and_menu_catalog(client: TestClient):
    """Verifies that seeder successfully populates 3 partner stores, catalog items, and active listings."""
    res_stores = client.get("/api/v1/auth/stores")
    assert res_stores.status_code == 200
    stores = res_stores.json()
    store_ids = [s["store_id"] for s in stores]
    assert "FTUI-001" in store_ids
    assert "MARGONDA-042" in store_ids
    assert "KUTEK-007" in store_ids

    res_menu = client.get("/api/v1/menu/FTUI-001")
    assert res_menu.status_code == 200
    menu = res_menu.json()
    assert len(menu) >= 4
    menu_names = [m["food_name"] for m in menu]
    assert "Rendang Daging Sapi" in menu_names

    res_listings = client.get("/api/v1/listings/active")
    assert res_listings.status_code == 200
    assert len(res_listings.json()) >= 4


def test_merchant_and_consumer_jwt_auth(client: TestClient):
    """Tests merchant Email+Password verification (success/fail) and consumer Email+Password login with JWT tokens."""
    # Merchant login success
    res_ok = client.post(
        "/api/v1/auth/merchant-login",
        json={"email": "dapurbarokah@nullwasted.id", "password": "nullwasted123"},
    )
    assert res_ok.status_code == 200
    data_ok = res_ok.json()
    assert data_ok["role"] == "merchant"
    assert "token" in data_ok
    assert data_ok["store_name"] == "Dapur Barokah FTUI"
    assert data_ok["email"] == "dapurbarokah@nullwasted.id"

    # Merchant login wrong password
    res_fail = client.post(
        "/api/v1/auth/merchant-login",
        json={"email": "dapurbarokah@nullwasted.id", "password": "wrongpassword"},
    )
    assert res_fail.status_code == 401

    # Merchant login unknown email
    res_unknown = client.post(
        "/api/v1/auth/merchant-login",
        json={"email": "unknownstore@nullwasted.id", "password": "nullwasted123"},
    )
    assert res_unknown.status_code == 401

    # Consumer login success (seeded demo account)
    res_consumer = client.post(
        "/api/v1/auth/consumer-login",
        json={"email": "budi@nullwasted.id", "password": "nullwasted123"},
    )
    assert res_consumer.status_code == 200
    c_data = res_consumer.json()
    assert "token" in c_data
    assert c_data["customer_name"] == "Budi Santoso"
    assert c_data["role"] == "consumer"
    assert c_data["email"] == "budi@nullwasted.id"

    # Consumer login wrong password
    res_c_fail = client.post(
        "/api/v1/auth/consumer-login",
        json={"email": "budi@nullwasted.id", "password": "wrongpassword"},
    )
    assert res_c_fail.status_code == 401

    # Consumer login unknown email
    res_c_unknown = client.post(
        "/api/v1/auth/consumer-login",
        json={"email": "nobody@nullwasted.id", "password": "nullwasted123"},
    )
    assert res_c_unknown.status_code == 401


def test_store_menu_crud_and_rag_mapping(client: TestClient):
    """Tests adding new item to store menu catalog with automatic BPOM RAG classification and CRUD lifecycle."""
    new_item = {
        "food_name": "Sop Iga Sapi Kuah Rempah",
        "original_price": 35000,
        "typical_cooking_time": "15:30",
        "default_hours_cooked": 2.0,
        "ingredients": "Iga sapi, wortel, kentang, cengkeh, kayu manis",
    }
    create_res = client.post("/api/v1/menu/FTUI-001", json=new_item)
    assert create_res.status_code == 200
    created = create_res.json()
    assert created["food_name"] == "Sop Iga Sapi Kuah Rempah"
    assert created["original_price"] == 35000
    assert created["category"] in ("MEDIUM_PERISHABILITY", "HIGH_PERISHABILITY")
    assert created["bpom_max_hours"] > 0
    item_id = created["id"]

    # Update item
    update_res = client.put(f"/api/v1/menu/FTUI-001/{item_id}", json={"original_price": 38000})
    assert update_res.status_code == 200
    assert update_res.json()["original_price"] == 38000

    # Delete (soft delete)
    del_res = client.delete(f"/api/v1/menu/FTUI-001/{item_id}")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deactivated"


def test_context_aware_slot_filling_case_a_and_b(client: TestClient):
    """Case A: Short input matches catalog menu ('Sisa 3 rendang' -> price Rp24.000). Case B: Explicit time override."""
    # Case A: Short registered menu input
    res_a = client.post("/api/v1/listings/draft", json={"text": "Sisa 3 rendang", "store_id": "FTUI-001"})
    assert res_a.status_code == 200
    data_a = res_a.json()
    assert "Rendang" in data_a["food_name"]
    assert data_a["quantity"] == 3
    assert data_a["original_price"] == 24000
    assert data_a["hours_since_cooked"] == 2.0
    assert data_a["bpom_max_hours"] == 4.0
    assert data_a["needs_manual_price"] is False

    # Case B: Time cooked override ('Sisa 3 rendang masak jam 10 -> 6 jam lalu' anchored to 16:00 WIB)
    res_b = client.post(
        "/api/v1/listings/draft",
        json={"text": "Sisa 3 rendang masak jam 10 (sudah 6 jam suhu ruang)", "store_id": "FTUI-001"},
        headers={"X-Simulated-Time": "2026-11-12T16:00:00+07:00"},
    )
    assert res_b.status_code == 200
    data_b = res_b.json()
    assert data_b["hours_since_cooked"] == 6.0
    assert data_b["original_price"] == 24000
    assert data_b["safety_status"] == "REJECTED"


def test_context_aware_slot_filling_case_c_and_d(client: TestClient):
    """Case C: Ad-hoc uncataloged menu with explicit price. Case D: Ad-hoc menu without price -> needs_manual_price."""
    # Case C: Ad-hoc with price
    res_c = client.post(
        "/api/v1/listings/draft",
        json={"text": "Ada Nasi Rawon sisa 2, harga 30 ribu, baru matang 1 jam lalu", "store_id": "FTUI-001"},
    )
    assert res_c.status_code == 200
    data_c = res_c.json()
    assert "Rawon" in data_c["food_name"]
    assert data_c["quantity"] == 2
    assert data_c["original_price"] == 30000
    assert data_c["needs_manual_price"] is False

    # Case D: Ad-hoc without price
    res_d = client.post(
        "/api/v1/listings/draft",
        json={"text": "Ada sisa 2 porsi Nasi Rawon Spesial baru matang 1 jam lalu", "store_id": "FTUI-001"},
    )
    assert res_d.status_code == 200
    data_d = res_d.json()
    assert "Rawon" in data_d["food_name"]
    assert data_d["quantity"] == 2
    assert data_d["needs_manual_price"] is True


def test_smart_mystery_bag_bundling_engine(client: TestClient):
    """Tests POST /api/v1/listings/smart-bundle clustering low-stock items into 60-70% discounted bundle."""
    # MARGONDA-042 has seeded Croissant (qty=2) and Donat (qty=1)
    bundle_res = client.post(
        "/api/v1/listings/smart-bundle",
        json={"store_id": "MARGONDA-042", "custom_bundle_name": "Mystery Bag Pastry Manis", "discount_percent": 65},
    )
    assert bundle_res.status_code == 200
    bundle = bundle_res.json()
    assert bundle["is_bundle"] is True
    assert bundle["discount_percent"] == 65
    assert bundle["original_price"] >= 36000
    assert bundle["store_id"] == "MARGONDA-042"
    assert bundle["bundled_items_json"] is not None
    assert bundle["quantity"] == 1
    assert bundle["is_active"] is True

    # Active listings for MARGONDA-042 should have bundle active
    active_res = client.get("/api/v1/listings/active?store_id=MARGONDA-042")
    assert active_res.status_code == 200
    active_items = active_res.json()
    bundle_found = any(item["is_bundle"] for item in active_items)
    assert bundle_found is True


def test_payment_methods_cash_vs_simulated_qris(client: TestClient):
    """Tests reservation with CASH_ON_PICKUP (UNPAID) vs SIMULATED_QRIS (PAID)."""
    listings = client.get("/api/v1/listings/active").json()
    listing = next(i for i in listings if i["quantity"] >= 2 and not i.get("is_bundle"))
    l_id = listing["id"]

    # 1. CASH_ON_PICKUP
    res_cash = client.post(
        "/api/v1/orders/reserve",
        json={
            "listing_id": l_id,
            "quantity": 1,
            "customer_name": "Ahmad Dani",
            "payment_method": "CASH_ON_PICKUP",
        },
    )
    assert res_cash.status_code == 200
    ticket_cash = res_cash.json()
    assert ticket_cash["payment_method"] == "CASH_ON_PICKUP"
    assert ticket_cash["payment_status"] == "UNPAID"

    # 2. SIMULATED_QRIS
    res_qris = client.post(
        "/api/v1/orders/reserve",
        json={
            "listing_id": l_id,
            "quantity": 1,
            "customer_name": "Rina Nose",
            "payment_method": "SIMULATED_QRIS",
        },
    )
    assert res_qris.status_code == 200
    ticket_qris = res_qris.json()
    assert ticket_qris["payment_method"] == "SIMULATED_QRIS"
    assert ticket_qris["payment_status"] == "PAID"


def test_order_cancellation_atomic_stock_rollback(client: TestClient):
    """Tests POST /api/v1/orders/{id}/cancel returning stock to ItemListing atomically."""
    active_listings = client.get("/api/v1/listings/active").json()
    item = next(i for i in active_listings if i["quantity"] >= 2 and not i["is_bundle"])
    initial_stock = item["quantity"]
    item_id = item["id"]

    # Reserve 1
    reserve_res = client.post(
        "/api/v1/orders/reserve",
        json={"listing_id": item_id, "quantity": 1, "customer_name": "Test User"},
    )
    assert reserve_res.status_code == 200
    ticket = reserve_res.json()
    order_id = ticket["id"]

    # Verify stock decremented
    item_after_reserve = next(i for i in client.get("/api/v1/listings/active").json() if i["id"] == item_id)
    assert item_after_reserve["quantity"] == initial_stock - 1

    # Cancel order
    cancel_res = client.post(f"/api/v1/orders/{order_id}/cancel")
    assert cancel_res.status_code == 200
    cancelled_ticket = cancel_res.json()
    assert cancelled_ticket["status"] == "CANCELLED"
    assert cancelled_ticket["cancelled_at"] is not None

    # Verify stock rolled back
    item_after_cancel = next(i for i in client.get("/api/v1/listings/active").json() if i["id"] == item_id)
    assert item_after_cancel["quantity"] == initial_stock

    # Cancelling again returns 400
    again_res = client.post(f"/api/v1/orders/{order_id}/cancel")
    assert again_res.status_code == 400


def test_cross_store_cashier_fraud_rejection(client: TestClient):
    """Cashier of MARGONDA-042 attempting to verify ticket of FTUI-001 must be rejected with HTTP 403."""
    active_listings = client.get("/api/v1/listings/active?store_id=FTUI-001").json()
    ftui_item = active_listings[0]

    reserve_res = client.post(
        "/api/v1/orders/reserve",
        json={"listing_id": ftui_item["id"], "quantity": 1, "customer_name": "Siswa FTUI"},
    )
    assert reserve_res.status_code == 200
    ticket = reserve_res.json()
    order_code = ticket["order_code"]

    # MARGONDA-042 cashier tries to complete pickup
    fraud_res = client.post(
        "/api/v1/orders/complete-pickup",
        json={"order_code": order_code, "store_id": "MARGONDA-042"},
    )
    assert fraud_res.status_code == 403
    assert "PENOLAKAN KEAMANAN LINTAS GERAI" in fraud_res.json()["detail"]

    # FTUI-001 cashier completes pickup successfully
    legit_res = client.post(
        "/api/v1/orders/complete-pickup",
        json={"order_code": order_code, "store_id": "FTUI-001"},
    )
    assert legit_res.status_code == 200
    assert legit_res.json()["status"] == "COMPLETED"


def test_multi_tenant_order_isolation(client: TestClient):
    """GET /api/v1/orders/active?store_id=FTUI-001 must only return tickets belonging to FTUI-001."""
    ftui_listings = client.get("/api/v1/listings/active?store_id=FTUI-001").json()
    kutek_listings = client.get("/api/v1/listings/active?store_id=KUTEK-007").json()

    if ftui_listings:
        client.post(
            "/api/v1/orders/reserve",
            json={"listing_id": ftui_listings[0]["id"], "quantity": 1, "customer_name": "FTUI Consumer"},
        )
    if kutek_listings:
        client.post(
            "/api/v1/orders/reserve",
            json={"listing_id": kutek_listings[0]["id"], "quantity": 1, "customer_name": "Kutek Consumer"},
        )

    # Filter by FTUI-001
    ftui_orders = client.get("/api/v1/orders/active?store_id=FTUI-001").json()
    assert all(o["store_id"] == "FTUI-001" for o in ftui_orders)

    # Filter by KUTEK-007
    kutek_orders = client.get("/api/v1/orders/active?store_id=KUTEK-007").json()
    assert all(o["store_id"] == "KUTEK-007" for o in kutek_orders)


def test_ai_gateway_timeout_hardening():
    """Verifies that DEFAULT_TIMEOUT in ai_gateway is properly hardened to at least 15s read and 5s connect."""
    from app.core.ai_gateway import DEFAULT_TIMEOUT
    assert DEFAULT_TIMEOUT.read is not None and DEFAULT_TIMEOUT.read >= 15.0
    assert DEFAULT_TIMEOUT.connect is not None and DEFAULT_TIMEOUT.connect >= 5.0


def test_autonomous_merchant_and_consumer_registration(client: TestClient):
    """Tests autonomous Email+Password registration of merchant store and consumer, duplicate rejection, and login."""
    # 1. Autonomous Merchant Registration
    reg_store_payload = {
        "name": "Kedai Kopi Senja Depok",
        "email": "senja@nullwasted.id",
        "password": "kopisenja123",
        "location_name": "ukm dekat Stasiun UI · 300m",
        "closing_time": "21:00",
    }
    res_reg_store = client.post("/api/v1/auth/merchant-register", json=reg_store_payload)
    assert res_reg_store.status_code == 200
    store_data = res_reg_store.json()
    assert store_data["role"] == "merchant"
    assert store_data["email"] == "senja@nullwasted.id"
    assert "store_id" in store_data and len(store_data["store_id"]) >= 5
    assert store_data["token"] is not None and len(store_data["token"]) > 20
    new_store_id = store_data["store_id"]

    # Duplicate merchant email rejected with HTTP 400
    res_dup_store = client.post("/api/v1/auth/merchant-register", json=reg_store_payload)
    assert res_dup_store.status_code == 400

    # 2. Login with newly registered merchant
    res_login_store = client.post(
        "/api/v1/auth/merchant-login",
        json={"email": "senja@nullwasted.id", "password": "kopisenja123"},
    )
    assert res_login_store.status_code == 200
    assert res_login_store.json()["store_id"] == new_store_id

    # 3. Autonomous Consumer Registration
    reg_consumer_payload = {
        "name": "Andi Pratama",
        "email": "andi@nullwasted.id",
        "password": "andi1234",
        "phone": "0813-9988-7766",
        "address": "Kukusan Teknik Depok",
    }
    res_reg_cons = client.post("/api/v1/auth/consumer-register", json=reg_consumer_payload)
    assert res_reg_cons.status_code == 200
    cons_data = res_reg_cons.json()
    assert cons_data["role"] == "consumer"
    assert cons_data["customer_name"] == "Andi Pratama"
    assert cons_data["email"] == "andi@nullwasted.id"
    assert cons_data["token"] is not None

    # 4. Duplicate email registration rejected with HTTP 400
    res_dup = client.post("/api/v1/auth/consumer-register", json=reg_consumer_payload)
    assert res_dup.status_code == 400
    assert "sudah terdaftar" in res_dup.json()["detail"]

    # 5. Consumer login with Email + Password (registered)
    res_login_cons = client.post(
        "/api/v1/auth/consumer-login",
        json={"email": "andi@nullwasted.id", "password": "andi1234"},
    )
    assert res_login_cons.status_code == 200
    assert res_login_cons.json()["customer_name"] == "Andi Pratama"

    # 6. Consumer login with wrong password returns HTTP 401
    res_wrong_pw = client.post(
        "/api/v1/auth/consumer-login",
        json={"email": "andi@nullwasted.id", "password": "salahpassword"},
    )
    assert res_wrong_pw.status_code == 401

    # 7. Consumer login with unregistered email returns HTTP 401
    res_unknown = client.post(
        "/api/v1/auth/consumer-login",
        json={"email": "belumdaftar@nullwasted.id", "password": "password123"},
    )
    assert res_unknown.status_code == 401


def test_time_awareness_simulated_clock_and_local_extractor():
    """Verifies dynamic WIB simulated clock parsing for cooking/closing times, future cook rejection, and overnight check."""
    from app.core.clock import parse_simulated_time_header, reset_simulated_now_wib, set_simulated_now_wib

    sim_dt = parse_simulated_time_header("2026-11-12T08:33:00+07:00")
    assert sim_dt is not None
    tok = set_simulated_now_wib(sim_dt)
    try:
        # 1. Explicit cooking & closing time at 08:33 WIB
        res1 = local_rule_based_extract("ada kroisan 5 pcs harga 15rb masak jam 7 pagi tutup jam 9 malam")
        assert res1["hours_since_cooked"] == pytest.approx(1.55, abs=0.1)
        assert res1["explicit_closing_mentioned"] is True
        assert 745 <= res1["minutes_until_closing"] <= 748
        assert res1["future_cooking_time"] is False

        # 2. Future cooking time at 08:33 WIB -> flagged and rejected by guardrail
        res2 = local_rule_based_extract("ayam goreng 4 porsi masak jam 14:00 harga 20rb")
        assert res2["future_cooking_time"] is True
        safety2 = evaluate_food_safety(
            food_name="Ayam Goreng",
            raw_text="ayam goreng 4 porsi masak jam 14:00 harga 20rb",
            hours_since_cooked=res2["hours_since_cooked"],
            future_cooking_time=res2["future_cooking_time"],
        )
        assert safety2["safety_status"] == "REJECTED"
        assert safety2["can_publish"] is False

        # 3. Yesterday night cooking remains >= 24h
        res3 = local_rule_based_extract("nasi uduk 3 porsi masak jam 10 malam kemarin harga 15rb")
        assert res3["hours_since_cooked"] >= 24.0
        assert res3["future_cooking_time"] is False
    finally:
        reset_simulated_now_wib(tok)


def test_extractor_null_gemini_payload_and_simulation_toggle(client: TestClient, monkeypatch):
    """Verifies safe null coercion on Gemini JSON response and ENABLE_TIME_SIMULATION toggle enforcement."""
    import json
    from app.core import config as app_config
    from app.services import extractor as extractor_mod

    async def fake_generate_content(*args, **kwargs):
        return json.dumps(
            {
                "food_name": "Kroisan Mentega",
                "is_edible_food": True,
                "food_type": "BAKERY",
                "inferred_risk": "LOW_PERISHABILITY",
                "quantity": None,
                "original_price": None,
                "hours_since_cooked": None,
                "minutes_until_closing": None,
            }
        )

    monkeypatch.setattr(extractor_mod.ai_gateway, "generate_content", fake_generate_content)

    # 1. With ENABLE_TIME_SIMULATION=True, draft endpoint obeys X-Simulated-Time (08:33 -> tutup 21:00 = 747m)
    res_draft = client.post(
        "/api/v1/listings/draft",
        json={"text": "ada kroisan 5 pcs harga 15rb masak jam 7 pagi tutup jam 9 malam", "store_id": "FTUI-001"},
        headers={"X-Simulated-Time": "2026-11-12T08:33:00+07:00"},
    )
    assert res_draft.status_code == 200
    d1 = res_draft.json()
    assert d1["quantity"] == 5
    assert d1["original_price"] == 15000
    assert 745 <= d1["minutes_until_closing"] <= 748

    # 2. Publish with historical simulated year (2020) when enabled vs disabled proves toggle ignores header
    login_res = client.post(
        "/api/v1/auth/merchant-login",
        json={"email": "rotiunyil@nullwasted.id", "password": "nullwasted123"},
    )
    token = login_res.json()["token"]
    pub_payload = {
        "store_id": "MARGONDA-042",
        "food_name": "Croissant Mentega",
        "matched_canonical_dish": "Croissant Mentega",
        "original_price": 24000,
        "discounted_price": 12000,
        "discount_percent": 50,
        "hours_since_cooked": 1.0,
        "category": "LOW_PERISHABILITY",
        "food_type": "BAKERY",
        "bpom_max_hours": 24.0,
        "minutes_until_closing": 120,
        "safety_status": "SAFE",
        "safety_reason": "Roti layak konsumsi.",
        "hazard_description": "Sesuai batas suhu ruang PerBPOM.",
        "regulation_ref": "PerBPOM No. 16 Tahun 2019",
        "quantity": 2,
        "closing_time": "20:30",
    }

    r_sim_on = client.post(
        "/api/v1/listings/publish",
        json=pub_payload,
        headers={
            "Authorization": f"Bearer {token}",
            "X-Simulated-Time": "2020-05-01T12:00:00+07:00",
        },
    )
    assert r_sim_on.status_code == 200
    assert r_sim_on.json()["expires_at"].startswith("2020-05-01")

    monkeypatch.setattr(app_config, "ENABLE_TIME_SIMULATION", False)
    r_sim_off = client.post(
        "/api/v1/listings/publish",
        json=pub_payload,
        headers={
            "Authorization": f"Bearer {token}",
            "X-Simulated-Time": "2020-05-01T12:00:00+07:00",
        },
    )
    assert r_sim_off.status_code == 200
    assert not r_sim_off.json()["expires_at"].startswith("2020-")


# ============================================================================
# 8. SPRINT 3 SYSTEM HARDENING & ADVERSARIAL TEST SUITE
# ============================================================================

def test_sprint3_non_food_poison_and_battery_rejection(client: TestClient):
    """Verifies that non-food poison and battery queries are strictly rejected,
    while valid dishes containing 'oli' (e.g. Aglio Olio, Tumis Brokoli) remain SAFE."""
    # 1. Poison item rejected
    eval_poison = evaluate_food_safety("Racun tikus arsenik", hours_since_cooked=1.0)
    assert eval_poison["safety_status"] == "REJECTED"
    assert eval_poison["can_publish"] is False
    assert "racun" in eval_poison["safety_reason"].lower() or "bahaya" in eval_poison["safety_reason"].lower()

    # 2. Battery item rejected
    eval_battery = evaluate_food_safety("Baterai Panasonic bekas", hours_since_cooked=1.0)
    assert eval_battery["safety_status"] == "REJECTED"
    assert eval_battery["can_publish"] is False

    # 3. Direct publish rejected with HTTP 400
    res_pub = client.post(
        "/api/v1/listings/publish",
        json={
            "store_id": "FTUI-001",
            "food_name": "Racun tikus arsenik",
            "matched_canonical_dish": "Racun tikus arsenik",
            "quantity": 2,
            "original_price": 20000,
            "discount_percent": 50,
            "discounted_price": 10000,
            "hours_since_cooked": 1.0,
            "bpom_max_hours": 4.0,
            "minutes_until_closing": 60,
            "safety_status": "SAFE",
            "safety_reason": "Bahan aman",
            "hazard_description": "Tidak ada bahaya",
            "category": "HIGH_PERISHABILITY",
        },
    )
    assert res_pub.status_code == 400
    assert "bahaya" in res_pub.json()["detail"].lower() or "ditolak" in res_pub.json()["detail"].lower() or "racun" in res_pub.json()["detail"].lower()

    # 4. Legitimate dishes with substring 'oli' are NOT rejected by oil/oli keyword
    eval_olio = evaluate_food_safety("Spaghetti Aglio Olio", hours_since_cooked=1.5)
    assert eval_olio["safety_status"] == "SAFE"
    assert eval_olio["can_publish"] is True

    eval_brokoli = evaluate_food_safety("Tumis Brokoli Bawang Putih", hours_since_cooked=2.0)
    assert eval_brokoli["safety_status"] == "SAFE"
    assert eval_brokoli["can_publish"] is True


def test_sprint3_wildlife_meat_rejection(client: TestClient):
    """Verifies that protected wildlife and non-food meat listings are rejected."""
    eval_dog = evaluate_food_safety("Sate daging anjing bumbu kacang", hours_since_cooked=1.0)
    assert eval_dog["safety_status"] == "REJECTED"
    assert eval_dog["can_publish"] is False
    assert "satwa" in eval_dog["safety_reason"].lower() or "terlarang" in eval_dog["safety_reason"].lower() or "hewani" in eval_dog["safety_reason"].lower()

    eval_bat = evaluate_food_safety("Rica-rica kelelawar pedas", hours_since_cooked=1.0)
    assert eval_bat["safety_status"] == "REJECTED"
    assert eval_bat["can_publish"] is False


def test_sprint3_menu_catalog_bypass_blocked(client: TestClient):
    """Verifies that spoiled or hazardous dishes cannot bypass safety checks when saving to menu catalog."""
    # 1. High perishability dish exceeding BPOM limit (7h > 4h) rejected from store menu
    res_spoiled = client.post(
        "/api/v1/menu/FTUI-001",
        json={
            "food_name": "Gulai Ayam Santan",
            "category": "HIGH_PERISHABILITY",
            "default_hours_cooked": 7.0,
            "typical_cooking_time": "08:00",
            "original_price": 25000,
        },
    )
    assert res_spoiled.status_code == 400
    assert "ditolak bpom" in res_spoiled.json()["detail"].lower()

    # 2. Poisonous non-food item rejected from store menu
    res_poison = client.post(
        "/api/v1/menu/FTUI-001",
        json={
            "food_name": "Racun Tikus",
            "category": "HIGH_PERISHABILITY",
            "default_hours_cooked": 1.0,
            "typical_cooking_time": "08:00",
            "original_price": 25000,
        },
    )
    assert res_poison.status_code == 400

    # 3. Draft endpoint sets can_save_to_catalog to False for rejected items
    res_draft = client.post(
        "/api/v1/listings/draft",
        json={
            "store_id": "FTUI-001",
            "text": "Ada racun tikus sisa 2 bungkus harga 10000",
        },
    )
    assert res_draft.status_code == 200
    draft_data = res_draft.json()
    assert draft_data["can_save_to_catalog"] is False
    assert draft_data["safety_status"] == "REJECTED"


def test_sprint3_overnight_and_future_time_rejection(client: TestClient):
    """Verifies that overnight ('kemarin') dishes receive >=24h cooked time and are rejected,
    and future cooking times ('besok') are rejected immediately."""
    # 1. Overnight cooked time parsed to >= 24h
    extracted_overnight = local_rule_based_extract("Sisa 3 porsi Ayam Bakar masak jam 10 malam kemarin")
    assert extracted_overnight["hours_since_cooked"] >= 24.0
    eval_overnight = evaluate_food_safety(
        extracted_overnight["food_name"],
        hours_since_cooked=extracted_overnight["hours_since_cooked"],
    )
    assert eval_overnight["safety_status"] == "REJECTED"

    # 2. Future cooking time rejected
    eval_future = evaluate_food_safety(
        "Rendang",
        hours_since_cooked=1.0,
        raw_text="Ada 4 porsi Rendang masak besok pagi",
    )
    assert eval_future["safety_status"] == "REJECTED"
    assert "masa depan" in eval_future["safety_reason"].lower()


def test_sprint3_decimal_currency_and_jaksel_slang_extraction():
    """Verifies that decimal IDR like '17.5k' is accurately parsed to 17500 and slang is cleaned."""
    extracted = local_rule_based_extract("Ada roasted chicken sisa 3 packs gila sih ini harga 17.5k")
    assert extracted["food_name"].lower() == "roasted chicken"
    assert extracted["quantity"] == 3
    assert extracted["original_price"] == 17500


def test_sprint3_klappertaart_high_perishability_4h_limit():
    """Verifies that canonical Klappertaart matches HIGH_PERISHABILITY with a 4.0h BPOM limit."""
    # 1. Cooked 5.0h (> 4.0h) -> REJECTED
    eval_late = evaluate_food_safety("Klappertaart Panggang Fla Susu", hours_since_cooked=5.0)
    assert eval_late["category"] == "HIGH_PERISHABILITY"
    assert eval_late["bpom_max_hours"] == 4.0
    assert eval_late["safety_status"] == "REJECTED"

    # 2. Cooked 2.0h (<= 4.0h) -> SAFE
    eval_fresh = evaluate_food_safety("Klappertaart Panggang Fla Susu", hours_since_cooked=2.0)
    assert eval_fresh["safety_status"] == "SAFE"
    assert eval_fresh["can_publish"] is True


def test_sprint3_pydantic_upper_bounds_and_time_validator(client: TestClient):
    """Verifies that Pydantic bounds reject absurd quantities, prices, or invalid 24h cooking times."""
    # 1. Absurd quantity rejected (HTTP 422)
    res_qty = client.post(
        "/api/v1/listings/publish",
        json={
            "store_id": "FTUI-001",
            "food_name": "Nasi Goreng",
            "quantity": 50000,
            "original_price": 20000,
            "discounted_price": 10000,
            "hours_since_cooked": 1.0,
            "category": "MEDIUM_PERISHABILITY",
            "pickup_closing_time": "21:00",
        },
    )
    assert res_qty.status_code == 422

    # 2. Absurd price rejected (HTTP 422)
    res_price = client.post(
        "/api/v1/listings/publish",
        json={
            "store_id": "FTUI-001",
            "food_name": "Nasi Goreng",
            "quantity": 5,
            "original_price": 1000000000,
            "discounted_price": 10000,
            "hours_since_cooked": 1.0,
            "category": "MEDIUM_PERISHABILITY",
            "pickup_closing_time": "21:00",
        },
    )
    assert res_price.status_code == 422

    # 3. Invalid cooking time format rejected (HTTP 422)
    res_time = client.post(
        "/api/v1/menu/FTUI-001",
        json={
            "food_name": "Nasi Uduk Gurih",
            "category": "HIGH_PERISHABILITY",
            "default_hours_cooked": 2.0,
            "typical_cooking_time": "gibberish",
            "original_price": 15000,
        },
    )
    assert res_time.status_code == 422


def test_sprint3_smart_bundle_includes_ingredients_and_allergens(client: TestClient):
    """Verifies that generated smart bundle items include ingredients and allergen tags."""
    import json

    res_bundle = client.post(
        "/api/v1/listings/smart-bundle",
        json={
            "store_id": "FTUI-001",
            "bundle_type": "MYSTERY_BAG_HEAVY",
        },
    )
    assert res_bundle.status_code == 200
    bundle_data = res_bundle.json()
    assert "bundled_items_json" in bundle_data

    items = json.loads(bundle_data["bundled_items_json"])
    assert len(items) > 0
    for item in items:
        assert "ingredients" in item
        assert "allergen_tags" in item
        assert isinstance(item["ingredients"], list)
        assert isinstance(item["allergen_tags"], list)


# ============================================================================
# 8. DYNAMIC MENU IMAGE UPLOAD & INHERITANCE TESTS
# ============================================================================

def test_image_upload_success_and_static_serving(client: TestClient):
    """Verifies that valid WebP/PNG images can be uploaded and retrieved via the mounted /static endpoint."""
    from pathlib import Path
    from app.core.config import STATIC_UPLOADS_DIR

    # Valid 1x1 WebP binary payload
    valid_webp = (
        b"RIFF\x1a\x00\x00\x00WEBPVP8 "
        b"\x0e\x00\x00\x00\x01\x00\x01\x00\x00\x00\x00\x00\x00\x00"
    )

    res = client.post(
        "/api/v1/upload-image",
        files={"file": ("test_sample.webp", valid_webp, "image/webp")},
    )
    assert res.status_code == 200
    data = res.json()
    assert "image_url" in data
    assert data["storage_mode"] in ("local", "cloudinary")

    # If saved to local static storage, verify it's fetchable via GET /static/uploads/...
    if data["storage_mode"] == "local":
        assert data["image_url"].startswith("/static/uploads/")
        file_res = client.get(data["image_url"])
        assert file_res.status_code == 200
        assert len(file_res.content) == len(valid_webp)

        # Clean up test file to keep workspace pristine
        filename = data["image_url"].replace("/static/uploads/", "")
        created_file = STATIC_UPLOADS_DIR / filename
        if created_file.exists():
            created_file.unlink()


def test_image_upload_invalid_mime_and_magic_bytes_rejection(client: TestClient):
    """Verifies HTTP 400 rejection for unsupported MIME types, fake magic bytes, and empty files."""
    # 1. Non-image mime type
    res_txt = client.post(
        "/api/v1/upload-image",
        files={"file": ("danger.txt", b"hello world malicious script", "text/plain")},
    )
    assert res_txt.status_code == 400
    assert "tidak didukung" in res_txt.json()["detail"].lower()

    # 2. Fake magic bytes (Declared as image/png but content is plain text)
    res_fake = client.post(
        "/api/v1/upload-image",
        files={"file": ("fake.png", b"fake binary data disguised as png", "image/png")},
    )
    assert res_fake.status_code == 400
    assert "tidak cocok" in res_fake.json()["detail"].lower()

    # 3. Empty file
    res_empty = client.post(
        "/api/v1/upload-image",
        files={"file": ("empty.jpg", b"", "image/jpeg")},
    )
    assert res_empty.status_code == 400
    assert "tidak boleh kosong" in res_empty.json()["detail"].lower()


def test_image_url_lifecycle_inheritance_and_adhoc_none(client: TestClient):
    """Verifies end-to-end image_url lifecycle:
    StoreMenuItem -> DraftResponse match -> ItemListing publish -> OrderTicket snapshot.
    Also verifies that purely ad-hoc items have image_url = None without fake image guessing.
    """
    # 1. Create a routine catalog item with an official image_url
    create_cat_res = client.post(
        "/api/v1/menu/FTUI-001",
        json={
            "food_name": "Sate Ayam Bumbu Madura",
            "original_price": 25000,
            "typical_cooking_time": "16:00",
            "default_hours_cooked": 1.5,
            "ingredients": "Daging ayam, kecap manis, bumbu kacang gurih",
            "portion_size": "10 Tusuk",
            "image_url": "/assets/foods/ayam_bakar.jpg",
        },
    )
    assert create_cat_res.status_code == 200
    cat_item = create_cat_res.json()
    assert cat_item["image_url"] == "/assets/foods/ayam_bakar.jpg"

    # 2. Merchant speaks/types matching prompt -> Draft inherits catalog image_url
    draft_res = client.post(
        "/api/v1/listings/draft",
        json={
            "text": "Ada sate ayam bumbu madura sisa 3 porsi harga 25000",
            "store_id": "FTUI-001",
        },
    )
    assert draft_res.status_code == 200
    draft_data = draft_res.json()
    assert draft_data["image_url"] == "/assets/foods/ayam_bakar.jpg"

    # 3. Publish listing passing the inherited image_url
    pub_res = client.post(
        "/api/v1/listings/publish",
        json={
            "store_id": "FTUI-001",
            "food_name": draft_data["food_name"],
            "matched_canonical_dish": draft_data["matched_canonical_dish"],
            "category": draft_data["category"],
            "quantity": draft_data["quantity"],
            "original_price": draft_data["original_price"],
            "discount_percent": 55,
            "hours_since_cooked": draft_data["hours_since_cooked"],
            "bpom_max_hours": draft_data["bpom_max_hours"],
            "minutes_until_closing": 90,
            "safety_status": "SAFE",
            "safety_reason": "Waktu simpan aman",
            "hazard_description": "Aman",
            "image_url": draft_data["image_url"],
        },
    )
    assert pub_res.status_code == 200
    pub_item = pub_res.json()
    assert pub_item["image_url"] == "/assets/foods/ayam_bakar.jpg"

    # 4. Reserve order -> OrderTicket snapshots listing image_url
    res_order = client.post(
        "/api/v1/orders/reserve",
        json={
            "listing_id": pub_item["id"],
            "quantity": 1,
            "customer_name": "Tester Image Snapshot",
        },
    )
    assert res_order.status_code == 200
    ticket = res_order.json()
    assert ticket["image_url"] == "/assets/foods/ayam_bakar.jpg"

    # 5. Ad-hoc menu draft without catalog match MUST result in image_url = None
    adhoc_res = client.post(
        "/api/v1/listings/draft",
        json={
            "text": "Ada Nasi Rawon sisa 2, harga 30 ribu, baru matang 1 jam lalu",
            "store_id": "FTUI-001",
        },
    )
    assert adhoc_res.status_code == 200
    adhoc_data = adhoc_res.json()
    assert adhoc_data["catalog_match_status"] == "ADHOC_COMPLETE"
    assert adhoc_data["image_url"] is None



