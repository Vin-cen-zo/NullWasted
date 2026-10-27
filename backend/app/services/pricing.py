from typing import Optional


def calculate_dynamic_pricing(
    original_price: int,
    minutes_until_closing: int,
    quantity: int = 1,
    custom_discount_percent: Optional[int] = None,
) -> dict:
    """Calculates time-decay dynamic pricing clamped strictly between 50% and 70%.
    
    Formula:
        D(t, v) = min(0.70, 0.50 + 0.20 * (1 - t_remaining / t_window))
        where t_window = 160.0 minutes
    """
    if custom_discount_percent is not None:
        discount_percent = max(50, min(70, int(custom_discount_percent)))
    else:
        if minutes_until_closing <= 30:
            discount_percent = 70
        elif minutes_until_closing >= 160:
            discount_percent = 50
        else:
            raw_discount = 0.50 + 0.20 * (1.0 - (minutes_until_closing / 160.0))
            discount_percent = int(round(raw_discount * 100))
            discount_percent = max(50, min(70, discount_percent))

    raw_discounted_price = original_price * (1.0 - discount_percent / 100.0)
    # Round down to nearest 100 rupiah
    discounted_price = int((raw_discounted_price // 100) * 100)
    if discounted_price < 100:
        discounted_price = 100

    return {
        "original_price": original_price,
        "discount_percent": discount_percent,
        "discounted_price": discounted_price,
        "minutes_until_closing": minutes_until_closing,
        "quantity": quantity,
    }
