import json
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch

import pytest

from app.services.extractor import (
    _split_multi_menu_clauses,
    extract_multiple_listing_entities,
    local_rule_based_extract,
)

WIB = timezone(timedelta(hours=7))


def test_split_multi_menu_no_false_split_on_time_or_price():
    assert _split_multi_menu_clauses("5 porsi nasi goreng, 2 jam lalu") == [
        "5 porsi nasi goreng, 2 jam lalu"
    ]
    assert _split_multi_menu_clauses("5 porsi nasi goreng, 20 ribu") == [
        "5 porsi nasi goreng, 20 ribu"
    ]
    assert _split_multi_menu_clauses("5 porsi nasi goreng, 15k") == [
        "5 porsi nasi goreng, 15k"
    ]
    parts = _split_multi_menu_clauses("5 porsi nasi goreng harga 20rb dan 3 porsi ayam bakar harga 25rb")
    assert len(parts) == 2


def test_local_rule_based_midnight_cooking_time_not_future():
    fake_now = datetime(2026, 11, 25, 2, 4, 0, tzinfo=WIB)
    with patch("app.services.extractor.get_effective_now_wib", return_value=fake_now):
        res = local_rule_based_extract("4 porsi soto ayam harga 20000 matang jam 12 malam")
    assert res["future_cooking_time"] is False
    assert res["cooking_time_mentioned"] is True
    assert 1.9 <= res["hours_since_cooked"] <= 2.2


@pytest.mark.asyncio
async def test_extract_multiple_single_native_gemini_call():
    mock_payload = json.dumps(
        {
            "items": [
                {
                    "food_name": "Nasi Goreng",
                    "is_edible_food": True,
                    "food_type": "MEAL",
                    "inferred_risk": "MEDIUM_PERISHABILITY",
                    "quantity": 5,
                    "original_price": 20000,
                    "hours_since_cooked": 1.0,
                    "minutes_until_closing": None,
                    "price_mentioned": True,
                    "cooking_time_mentioned": True,
                    "closing_time_mentioned": False,
                    "future_cooking_time": False,
                    "clause_text": "nasgor 5 20k",
                },
                {
                    "food_name": "Ayam Bakar",
                    "is_edible_food": True,
                    "food_type": "MEAL",
                    "inferred_risk": "MEDIUM_PERISHABILITY",
                    "quantity": 3,
                    "original_price": 25000,
                    "hours_since_cooked": 1.0,
                    "minutes_until_closing": None,
                    "price_mentioned": True,
                    "cooking_time_mentioned": True,
                    "closing_time_mentioned": False,
                    "future_cooking_time": False,
                    "clause_text": "aybak 3 25k",
                },
            ]
        }
    )

    mock_gen = AsyncMock(return_value=mock_payload)
    with patch("app.services.extractor.ai_gateway.generate_content", mock_gen):
        items = await extract_multiple_listing_entities("nasgor 5 20k, aybak 3 25k, masak 1 jam lalu")

    assert mock_gen.await_count == 1
    assert len(items) == 2
    assert items[0]["food_name"] == "Nasi Goreng"
    assert items[0]["quantity"] == 5
    assert items[0]["original_price"] == 20000
    assert items[1]["food_name"] == "Ayam Bakar"
    assert items[1]["quantity"] == 3
    assert items[1]["original_price"] == 25000


@pytest.mark.asyncio
async def test_extract_multiple_offline_fallback():
    mock_gen = AsyncMock(return_value=None)
    with patch("app.services.extractor.ai_gateway.generate_content", mock_gen):
        items = await extract_multiple_listing_entities(
            "sisa 3 ayam bakar harga 25rb dan 4 donat harga 10rb dimasak 1 jam lalu"
        )

    assert len(items) == 2
    assert items[0]["extraction_source"] == "local-fallback-parser"
    assert items[0]["quantity"] == 3
    assert items[0]["original_price"] == 25000
    assert items[1]["quantity"] == 4
    assert items[1]["original_price"] == 10000
