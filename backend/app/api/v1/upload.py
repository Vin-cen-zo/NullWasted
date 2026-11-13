import hashlib
import logging
import time
from uuid import uuid4
from fastapi import APIRouter, File, HTTPException, UploadFile
import httpx
from app.core.config import STATIC_UPLOADS_DIR, get_cloudinary_config

logger = logging.getLogger("upload")
router = APIRouter(tags=["Upload"])

ALLOWED_MIME_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


def verify_magic_bytes(content: bytes, mime_type: str) -> bool:
    """Deterministic check of binary headers to prevent spoofed file extensions."""
    if len(content) < 12:
        return False
    if mime_type == "image/jpeg":
        return content[:3] == b"\xff\xd8\xff"
    if mime_type == "image/png":
        return content[:8] == b"\x89PNG\r\n\x1a\n"
    if mime_type == "image/webp":
        return content[:4] == b"RIFF" and content[8:12] == b"WEBP"
    return False


@router.post("/upload-image")
async def upload_image(file: UploadFile = File(...)):
    """Dual-mode image upload endpoint (Cloudinary with graceful local static fallback)."""
    # 1. MIME type validation
    content_type = (file.content_type or "").lower().strip()
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Tipe file '{content_type}' tidak didukung. Format yang diizinkan: JPEG, PNG, dan WebP.",
        )

    ext = ALLOWED_MIME_TYPES[content_type]

    # 2. Read and validate file content
    content = await file.read()
    size = len(content)
    if size == 0:
        raise HTTPException(status_code=400, detail="File gambar tidak boleh kosong.")
    if size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Ukuran file ({size / (1024 * 1024):.2f} MB) melampaui batas maksimal 5 MB.",
        )

    # 3. Magic bytes verification
    if not verify_magic_bytes(content, content_type):
        raise HTTPException(
            status_code=400,
            detail="Header biner file tidak cocok dengan format gambar yang dideklarasikan.",
        )

    # 4. Mode 1: Cloudinary (If configured)
    c_config = get_cloudinary_config()
    if c_config:
        try:
            timestamp = str(int(time.time()))
            to_sign = f"timestamp={timestamp}{c_config['api_secret']}"
            signature = hashlib.sha1(to_sign.encode("utf-8")).hexdigest()

            upload_url = f"https://api.cloudinary.com/v1_1/{c_config['cloud_name']}/image/upload"
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    upload_url,
                    data={
                        "timestamp": timestamp,
                        "api_key": c_config["api_key"],
                        "signature": signature,
                    },
                    files={"file": (f"{uuid4().hex}{ext}", content, content_type)},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    secure_url = data.get("secure_url") or data.get("url")
                    if secure_url:
                        logger.info("Successfully uploaded image to Cloudinary: %s", secure_url)
                        return {
                            "image_url": secure_url,
                            "storage_mode": "cloudinary",
                            "size_bytes": size,
                        }
                logger.warning(
                    "Cloudinary upload failed with status %d: %s. Falling back to local static storage.",
                    resp.status_code,
                    resp.text,
                )
        except Exception as e:
            logger.warning("Cloudinary request error (%s). Falling back to local static storage.", e)

    # 5. Mode 2: Local Static Storage Fallback
    STATIC_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}{ext}"
    dest_path = STATIC_UPLOADS_DIR / filename
    with open(dest_path, "wb") as f:
        f.write(content)

    logger.info("Saved image to local static storage: %s", filename)
    return {
        "image_url": f"/static/uploads/{filename}",
        "storage_mode": "local",
        "size_bytes": size,
    }
