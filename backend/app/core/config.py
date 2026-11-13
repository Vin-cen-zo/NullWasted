import os
from pathlib import Path
from dotenv import load_dotenv

# Resolve paths safely without hardcoded machine paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BASE_DIR / ".env"

if ENV_FILE.exists():
    load_dotenv(dotenv_path=ENV_FILE, override=True)
else:
    load_dotenv()

APP_NAME = os.getenv("APP_NAME", "NullWasted API")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").strip().lower()
_raw_time_simulation = os.getenv("ENABLE_TIME_SIMULATION", "").strip().lower()
if ENVIRONMENT == "production":
    ENABLE_TIME_SIMULATION = False
elif _raw_time_simulation in {"false", "0", "no", "off"}:
    ENABLE_TIME_SIMULATION = False
elif _raw_time_simulation in {"true", "1", "yes", "on"}:
    ENABLE_TIME_SIMULATION = True
else:
    ENABLE_TIME_SIMULATION = ENVIRONMENT != "production"

_DEFAULT_SQLITE_URL = f"sqlite:///{(BASE_DIR / 'nullwasted_local.db').as_posix()}"
_raw_db_url = os.getenv("DATABASE_URL", "").strip()
if not _raw_db_url or _raw_db_url in {"sqlite:///./nullwasted_local.db", "sqlite:///nullwasted_local.db"}:
    DATABASE_URL = _DEFAULT_SQLITE_URL
elif _raw_db_url.startswith("sqlite:///./"):
    _rel_sqlite_path = _raw_db_url[len("sqlite:///./"):]
    DATABASE_URL = f"sqlite:///{(BASE_DIR / _rel_sqlite_path).as_posix()}"
else:
    DATABASE_URL = _raw_db_url
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
GEMINI_EMBEDDING_MODEL = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
CORS_ORIGIN_REGEX = os.getenv(
    "CORS_ORIGIN_REGEX",
    r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|.*\.vercel\.app)(:\d+)?$",
)
PIN_SALT = os.getenv("PIN_SALT", "nullwasted-v1-salt")
JWT_SECRET = os.getenv("JWT_SECRET", "nullwasted-jwt-secret-key-2026")

STATIC_DIR = BASE_DIR / "static"
STATIC_UPLOADS_DIR = STATIC_DIR / "uploads"
STATIC_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def get_cloudinary_config() -> dict[str, str] | None:
    """Parses Cloudinary credentials from CLOUDINARY_URL or individual env vars. Returns None if unconfigured."""
    cloudinary_url = os.getenv("CLOUDINARY_URL", "").strip()
    if cloudinary_url and cloudinary_url.startswith("cloudinary://"):
        try:
            # Format: cloudinary://<api_key>:<api_secret>@<cloud_name>
            without_scheme = cloudinary_url[len("cloudinary://"):]
            creds, cloud_name = without_scheme.split("@", 1)
            api_key, api_secret = creds.split(":", 1)
            if cloud_name and api_key and api_secret:
                return {
                    "cloud_name": cloud_name.strip(),
                    "api_key": api_key.strip(),
                    "api_secret": api_secret.strip(),
                }
        except Exception:
            pass

    cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()
    api_key = os.getenv("CLOUDINARY_API_KEY", "").strip()
    api_secret = os.getenv("CLOUDINARY_API_SECRET", "").strip()
    if cloud_name and api_key and api_secret:
        return {
            "cloud_name": cloud_name,
            "api_key": api_key,
            "api_secret": api_secret,
        }
    return None

def get_active_api_keys() -> list[str]:
    """Retrieve non-empty, non-placeholder Gemini API keys (supports single GEMINI_API_KEY or dynamic pool GEMINI_API_KEY_1..N)."""
    keys: list[str] = []
    
    # 1. Base key check
    base_key = os.getenv("GEMINI_API_KEY", "").strip()
    if (
        base_key
        and not base_key.startswith("your_")
        and not base_key.startswith("placeholder")
        and len(base_key) > 10
    ):
        keys.append(base_key)

    # 2. Dynamic numbered pool keys (GEMINI_API_KEY_1, GEMINI_API_KEY_2, ..., GEMINI_API_KEY_N)
    numbered_vars = sorted([k for k in os.environ.keys() if k.startswith("GEMINI_API_KEY_")])
    for var_name in numbered_vars:
        key = os.getenv(var_name, "").strip()
        if (
            key
            and not key.startswith("your_")
            and not key.startswith("placeholder")
            and len(key) > 10
            and key not in keys
        ):
            keys.append(key)

    return keys
