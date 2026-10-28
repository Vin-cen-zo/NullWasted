import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.core.database import get_session
from app.main import app
from app.services.extractor import local_rule_based_extract
from app.services.guardrail import evaluate_food_safety
from app.services.pricing import calculate_dynamic_pricing


# In-memory database fixture for zero-blocker clean isolation
@pytest.fixture(name="client")
def client_fixture():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

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

    # 3. Draft Pill 2 (Gulai Ayam) -> REJECTED
    p2_payload = {
        "text": "Ada sisa 3 porsi Gulai Ayam Padang santan kental, harga Rp25.000, selesai masak jam 11 siang (sudah 7 jam suhu ruang)."
    }
    draft2_res = client.post("/api/v1/listings/draft", json=p2_payload)
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
