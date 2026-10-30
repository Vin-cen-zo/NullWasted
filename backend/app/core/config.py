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
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./nullwasted_local.db")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
GEMINI_EMBEDDING_MODEL = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")

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
