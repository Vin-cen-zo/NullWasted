from typing import Optional


def calculate_dynamic_pricing(
    original_price: int,
    minutes_until_closing: int,
    quantity: int = 1,
    custom_discount_percent: Optional[int] = None,
) -> dict:
    """Calculates time-decay + stock-volume dynamic pricing clamped strictly between 50% and 70%.

    Formula:
        - Base time decay: 50% (>= 160 mins) up to 65% (<= 30 mins), linear in between.
        - Stock volume bonus: +0% (1-4 portions), +3% (5-9 portions), +5% (>= 10 portions).
        - Clamped strictly within [50%, 70%].
    """
    qty = max(1, int(quantity))
    if qty >= 10:
        volume_bonus = 5
    elif qty >= 5:
        volume_bonus = 3
    else:
        volume_bonus = 0

    if custom_discount_percent is not None:
        discount_percent = max(50, min(70, int(custom_discount_percent)))
        base_time_discount = discount_percent
        pricing_reason = f"Diskon kustom gerai ({discount_percent}%)"
    else:
        if minutes_until_closing <= 30:
            base_time_discount = 65
        elif minutes_until_closing >= 160:
            base_time_discount = 50
        else:
            raw_base = 50.0 + 15.0 * (1.0 - ((minutes_until_closing - 30.0) / 130.0))
            base_time_discount = int(round(raw_base))

        discount_percent = max(50, min(70, base_time_discount + volume_bonus))
        if volume_bonus > 0:
            pricing_reason = (
                f"Base waktu tutup {base_time_discount}% + bonus volume {qty} porsi (+{volume_bonus}%)"
            )
        else:
            pricing_reason = f"Base waktu tutup {base_time_discount}% (volume {qty} porsi)"

    raw_discounted_price = original_price * (1.0 - discount_percent / 100.0)
    # Round down to nearest 100 rupiah
    discounted_price = int((raw_discounted_price // 100) * 100)
    if discounted_price < 100:
        discounted_price = 100

    return {
        "original_price": original_price,
        "discount_percent": discount_percent,
        "base_time_discount_percent": base_time_discount,
        "volume_bonus_percent": volume_bonus,
        "pricing_reason": pricing_reason,
        "discounted_price": discounted_price,
        "minutes_until_closing": minutes_until_closing,
        "quantity": qty,
    }
