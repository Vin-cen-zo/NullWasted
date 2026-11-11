import base64
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timedelta
from typing import Any, Optional
from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer

from app.core.config import JWT_SECRET, PIN_SALT

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/merchant-login", auto_error=False)


def hash_pin(pin: str) -> str:
    """Legacy fixed-salt SHA-256 PIN hashing preserved for backward compatibility."""
    salted = f"{pin}:{PIN_SALT}".encode("utf-8")
    return hashlib.sha256(salted).hexdigest()


def hash_pin_pbkdf2(pin: str) -> str:
    """Hashes a plaintext PIN using salted PBKDF2-HMAC-SHA256 (100,000 iterations)."""
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, 100_000)
    return f"pbkdf2_sha256${salt.hex()}${dk.hex()}"


def verify_pin(plain_pin: str, pin_hash: str) -> bool:
    """Verifies a plaintext PIN against PBKDF2-HMAC-SHA256 first, with fallback to legacy SHA-256."""
    if pin_hash.startswith("pbkdf2_sha256$"):
        try:
            _, salt_hex, hash_hex = pin_hash.split("$", 2)
            salt = bytes.fromhex(salt_hex)
            expected = bytes.fromhex(hash_hex)
            computed = hashlib.pbkdf2_hmac("sha256", plain_pin.encode("utf-8"), salt, 100_000)
            return hmac.compare_digest(computed, expected)
        except Exception:
            return False

    computed = hash_pin(plain_pin)
    return hmac.compare_digest(computed, pin_hash)


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(data_str: str) -> bytes:
    padding = "=" * ((4 - len(data_str) % 4) % 4)
    return base64.urlsafe_b64decode(data_str + padding)


def create_access_token(payload: dict[str, Any], expires_in: int = 86400) -> str:
    """Creates a standard JWT HS256 access token using pure Python standard library."""
    now = int(time.time())
    full_payload = {
        **payload,
        "iat": now,
        "exp": now + expires_in,
    }

    header = {"alg": "HS256", "typ": "JWT"}
    header_bytes = json.dumps(header, separators=(",", ":")).encode("utf-8")
    payload_bytes = json.dumps(full_payload, separators=(",", ":")).encode("utf-8")

    header_b64 = _b64url_encode(header_bytes)
    payload_b64 = _b64url_encode(payload_bytes)

    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    signature = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
    sig_b64 = _b64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{sig_b64}"


def decode_access_token(token: str) -> Optional[dict[str, Any]]:
    """Decodes and verifies a JWT HS256 access token. Returns payload dict or None if invalid/expired."""
    parts = token.split(".")
    if len(parts) != 3:
        return None

    header_b64, payload_b64, sig_b64 = parts
    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    expected_sig = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()

    try:
        actual_sig = _b64url_decode(sig_b64)
    except Exception:
        return None

    if not hmac.compare_digest(expected_sig, actual_sig):
        return None

    try:
        payload_bytes = _b64url_decode(payload_b64)
        payload = json.loads(payload_bytes.decode("utf-8"))
    except Exception:
        return None

    now = int(time.time())
    if "exp" in payload and payload["exp"] < now:
        return None

    return payload


def get_optional_user(token: Optional[str] = Depends(oauth2_scheme)) -> Optional[dict[str, Any]]:
    """Parses optional Bearer JWT token claims without rejecting unauthenticated test clients."""
    if not token:
        return None
    return decode_access_token(token)


def compute_minutes_until_closing(
    closing_time_str: str,
    open_time_str: Optional[str] = None,
    fallback_minutes: int = 90,
) -> int:
    """Computes real minutes remaining until store closing time ('HH:MM').
    Accurately calculates true wall-clock delta without artificial simulation branches.
    Handles midnight-crossing rollover: if closing time is past midnight (e.g. close 01:00 vs open 17:00),
    advances closing date by 1 calendar day. If closing time has passed (delta <= 0), returns 0.
    """
    try:
        parts = closing_time_str.strip().split(":")
        close_h = int(parts[0])
        close_m = int(parts[1]) if len(parts) > 1 else 0

        now = datetime.now()
        closing_dt = now.replace(hour=close_h, minute=close_m, second=0, microsecond=0)

        if open_time_str:
            open_parts = open_time_str.strip().split(":")
            open_h = int(open_parts[0])
            if close_h < open_h and now.hour >= open_h:
                closing_dt += timedelta(days=1)
        elif closing_dt < now and now.hour >= 18 and close_h < 6:
            # Late-night crossing past midnight without explicit open_time
            closing_dt += timedelta(days=1)

        delta = (closing_dt - now).total_seconds() / 60.0
        if delta <= 0:
            return 0

        return int(delta)
    except Exception:
        return max(0, fallback_minutes)

