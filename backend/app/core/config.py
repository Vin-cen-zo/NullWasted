import os
from pathlib import Path
from dotenv import load_dotenv

# Resolve paths safely without hardcoded machine paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BASE_DIR / ".env"

if ENV_FILE.exists():
    load_dotenv(dotenv_path=ENV_FILE)
else:
    load_dotenv()

APP_NAME = os.getenv("APP_NAME", "NullWasted API")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./nullwasted_local.db")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
GEMINI_EMBEDDING_MODEL = os.getenv("GEMINI_EMBEDDING_MODEL", "text-embedding-004")

def get_active_api_keys() -> list[str]:
    """Retrieve non-empty, non-placeholder Gemini API keys (supports single GEMINI_API_KEY or pool)."""
    keys: list[str] = []
    for var_name in ["GEMINI_API_KEY", "GEMINI_API_KEY_1", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3"]:
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
