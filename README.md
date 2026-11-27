# NullWasted: Autonomous AI-Powered Surplus Food Marketplace

[![NullWasted CI](https://github.com/Vin-cen-zo/NullWasted/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Vin-cen-zo/NullWasted/actions/workflows/ci.yml)

**Live Production PWA:** https://nullwasted.digilabui.cloud  
**Backend API Health:** https://nullwasted-be.digilabui.cloud/health

NullWasted is an autonomous, AI-driven surplus food marketplace platform connecting local F&B merchants with budget-conscious consumers through scheduled self-pickup windows at **50%–70% discounts**.

The platform eliminates the administrative friction of closing shifts using a **bounded Agentic AI Store Assistant** that converts Indonesian voice dictation or concise text into safety-verified, price-locked surplus listings in under 30 seconds.

---

## Key Features

1. **Natural Language Listing (In-App Voice & Text):**  
   Store staff dictate surplus items via native browser Web Speech Recognition API (`id-ID`) or type free-form text. Google Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`) extracts food names, portions, prices, and cooking timestamps with instant `< 1 ms` local regex fallback.
2. **Deterministic PerBPOM Food Safety Guardrail:**  
   Enforces Indonesian BPOM food safety ceilings (PerBPOM No. 16/2019) via 3072-dimensional cached semantic vector similarity (`gemini-embedding-001`, 100 bilingual culinary archetypes) plus lexical overrides (e.g. coconut-milk/dairy dishes exceeding 4 hours at room temperature, toxic chemicals, wildlife meat, and future cooking times are strictly rejected with `HTTP 400`).
3. **Dual-Mode Merchant Input & Bulk AI Menu Import:**  
   - **Routine Catalog Mode:** Tap pre-registered master menu items for instant batch listing with portion steppers and real-time PerBPOM badges.
   - **Bulk AI Menu Import:** Upload a menu photo or paste text to extract multiple dishes into the store master catalog in one batch.
   - **AI Ad-Hoc Mode:** Free-form voice or text listing with 1-click catalog enrollment and a mandatory **1-Tap Interactive Preview Card** human-oversight gate.
4. **Time-Decay Dynamic Pricing Engine (Price-Locked at Publication):**  
   Calculates optimal discounts (`50%–70%` clamped, rounded down to Rp 100) from remaining closing time and stock volume, then locks the price immutably upon publication to prevent strategic waiting.
5. **1-Click Smart Mystery Bag Bundling:**  
   Clusters non-expired low-stock items (`1–2` portions) into discounted Mystery Bags with aggregated allergen transparency, earliest-expiry clamping, and atomic deactivation of single units.
6. **Multi-Tenant Authentication & RBAC:**  
   Self-service Email + Password registration and login (salted PBKDF2-HMAC-SHA256 at 100,000 iterations, stateless HS256 JWT) enforcing strict `HTTP 401` and cross-store `HTTP 403` isolation.
7. **Multi-Item Cart & Midtrans Core API QRIS Sandbox v2:**  
   Supports single-item and multi-item cart checkout with atomic SQL stock decrement (`HTTP 409` on exhaustion), offering **Cash on Pickup** or **Midtrans QRIS Sandbox v2** with live countdown and automatic `PAID` status reconciliation.
8. **ISO/IEC 18004 QR Digital Pass & Cashier Camera POS:**  
   Generates `#NW-XXXX` QR passes (`qrcode.react`) with 3.5-second live status sync and provides optical webcam scanning (`html5-qrcode`) plus 4-digit short-code fallback, blocking cross-store redemptions (`HTTP 403`) and duplicate redemptions (`HTTP 400`).
9. **Interactive Leaflet Geospatial Discovery & Dual-Mode Media Pipeline:**  
   OpenStreetMap + Leaflet discovery with GPS Haversine distance filtering (`<500m`, `<1.5km`, All), store bookmarks, and client-side Canvas WebP compression uploaded to **Cloudinary CDN** (with binary magic-byte validation and local static fallback).
10. **Expiry-Safe Order Cancellation & Stock Rollback:**  
    Consumers can cancel reserved orders before pickup, atomically restoring stock to active listings while preventing expired listings from being revived.

---

## Production Cloud Architecture & Stack

- **Frontend PWA (`frontend/`):** React 18, Vite 5, TypeScript 5.5, Tailwind CSS 3 (Earth Tone Light Mode), Leaflet, `qrcode.react`, `html5-qrcode`, Web Speech API (`id-ID`). Hosted on **Cloudflare Pages** with automatic deployment on push to `main`.
- **Backend API (`backend/`):** Python 3.12, FastAPI, SQLModel (SQLAlchemy 2.0 + Pydantic v2), Uvicorn — 38 async REST endpoints under `/api/v1` plus an in-memory `/health` probe. Runs inside an isolated non-root **Docker Compose** container (`uid=1000`, `512m` RAM, `0.50` CPU, `cap_drop: ALL`) exposed via **Cloudflare Zero-Trust Tunnel**.
- **AI Gateway & PerBPOM RAG (`backend/app/core/ai_gateway.py`, `backend/app/services/`):** Direct async `httpx` client to Google AI Studio (`gemini-3.5-flash-lite` + failover `gemini-flash-lite-latest` + `< 1 ms` `local-fallback-parser`) and pre-computed 3072-dim `gemini-embedding-001` JSON vector cache (`food_embeddings_cache.json`).
- **Database & Media Storage:** **Neon Serverless PostgreSQL 16** (production, pooled `psycopg3` ACID transactions across 6 tables) / **SQLite** (zero-config local development), plus **Cloudinary CDN** for WebP menu images.
- **CI/CD Automation (`.github/workflows/ci.yml`):** GitHub Actions runs parallel `backend-ci` (`79/79` offline `pytest`) and `frontend-ci` (`tsc -b && vite build`) on every push and pull request to `main`.

---

## Repository Structure

```text
NullWasted/
├── .github/workflows/
│   └── ci.yml                   # GitHub Actions CI (79/79 pytest + tsc/vite build)
├── backend/                     # FastAPI REST API, AI Gateway, PerBPOM Guardrail
│   ├── app/
│   │   ├── api/v1/              # auth.py, listings.py, payments.py, upload.py
│   │   ├── core/                # config.py, database.py, security.py, clock.py, ai_gateway.py, seed.py
│   │   ├── data/                # 100 bilingual PerBPOM dishes & 3072-dim embeddings cache
│   │   ├── models/              # 6 SQLModel tables (Store, User, Menu, Listing, Order, Favorite)
│   │   ├── schemas/             # Pydantic v2 request/response contracts
│   │   ├── services/            # extractor.py, guardrail.py, vector_store.py, pricing.py
│   │   └── main.py              # FastAPI entrypoint, CORS, & request-scoped WIB clock middleware
│   ├── tests/                   # 9 automated test modules (79/79 passing)
│   ├── Dockerfile               # Hardened non-root Python 3.12 container image
│   ├── docker-compose.yml       # Isolated container service with cgroup & capability limits
│   ├── pytest.ini               # Pytest async configuration
│   ├── requirements.txt         # Backend Python dependencies (SBOM)
│   └── .env.example             # Environment variable template (no committed secrets)
├── frontend/                    # React 18 + Vite + TypeScript Web PWA
│   ├── src/
│   │   ├── components/          # Auth, Merchant Input/Preview/Catalog/Inventory/Cashier, Consumer Feed/Map/Cart/Orders
│   │   ├── services/            # Typed API client & browser Web Speech wrapper
│   │   ├── types/               # TypeScript domain interfaces
│   │   └── App.tsx              # Dual-role PWA shell & Time Simulator banner
│   ├── package.json             # Frontend dependencies (0 production npm audit vulnerabilities)
│   └── vite.config.ts
├── run_app.bat                  # Windows 1-click local development launcher
├── TEST_CASES.md                # Master end-to-end verification specification
└── README.md
```

---

## Getting Started (Local Development)

### Prerequisites
- **Python 3.11+** (tested on 3.12 & 3.14)
- **Node.js 20+** & `npm`
- Optional: Google AI Studio API Key (if omitted, the backend automatically uses the deterministic `< 1 ms` local regex fallback)

### Quick Start (Windows)
Double-click `run_app.bat` to launch FastAPI (`http://localhost:8000`) and Vite (`http://localhost:5173`).

### Manual Setup
```bash
# 1. Backend
cd backend
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 2. Frontend (new terminal)
cd frontend
npm ci
npm run dev
```
- Swagger UI: `http://localhost:8000/docs`
- Health Check: `http://localhost:8000/health`

---

## Automated Testing & CI

Run the full **79-test** automated backend suite (works offline without live API keys):
```bash
cd backend
pytest -v
```

Build and type-check the frontend production bundle:
```bash
cd frontend
npm run build
```

For end-to-end manual verification procedures and adversarial safety checklists, see **[TEST_CASES.md](TEST_CASES.md)**.

---

## License
MIT License.
