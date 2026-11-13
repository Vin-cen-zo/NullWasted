from contextvars import ContextVar, Token
from datetime import datetime, timedelta, timezone
import re
from typing import Optional
from zoneinfo import ZoneInfo

try:
    WIB_TZ = ZoneInfo("Asia/Jakarta")
except Exception:
    WIB_TZ = timezone(timedelta(hours=7))

_simulated_now_wib: ContextVar[Optional[datetime]] = ContextVar("simulated_now_wib", default=None)

_HHMM_PATTERN = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$")


def parse_simulated_time_header(raw_header: str) -> Optional[datetime]:
    """Parses X-Simulated-Time header (ISO-8601 or HH:MM[:SS]) into an aware WIB datetime."""
    value = (raw_header or "").strip()
    if not value:
        return None

    hhmm_match = _HHMM_PATTERN.match(value)
    if hhmm_match:
        hour = int(hhmm_match.group(1))
        minute = int(hhmm_match.group(2))
        second = int(hhmm_match.group(3) or 0)
        return datetime.now(WIB_TZ).replace(hour=hour, minute=minute, second=second, microsecond=0)

    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=WIB_TZ)
    return parsed.astimezone(WIB_TZ)


def set_simulated_now_wib(simulated_dt: Optional[datetime]) -> Token[Optional[datetime]]:
    """Sets the request-scoped simulated WIB clock and returns the ContextVar reset token."""
    return _simulated_now_wib.set(simulated_dt)


def reset_simulated_now_wib(token: Token[Optional[datetime]]) -> None:
    """Restores the simulated WIB clock ContextVar after request completion."""
    _simulated_now_wib.reset(token)


def get_effective_now_wib() -> datetime:
    """Returns request-scoped simulated WIB time when active, otherwise real Asia/Jakarta time."""
    simulated = _simulated_now_wib.get()
    if simulated is not None:
        return simulated
    return datetime.now(WIB_TZ)


def get_effective_now_utc() -> datetime:
    """Returns the effective current time converted to aware UTC."""
    return get_effective_now_wib().astimezone(timezone.utc)
