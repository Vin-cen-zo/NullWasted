# NullWasted: Autonomous AI-Powered Surplus Food Marketplace

NullWasted is an autonomous, AI-driven surplus food marketplace platform connecting local F&B merchants with budget-conscious consumers through scheduled self-pickup windows at 50%–70% discounts.

The platform eliminates the operational friction of store closing hours using an **Agentic AI Store Assistant** that converts voice notes or colloquial text into validated product listings in seconds.

---

## Key Features

1. **Natural Language Listing (In-App Voice & Text):**  
   Store staff dictate surplus items via native browser Web Speech Recognition API (`id-ID`) or type free-form text. The AI extracts food names, portions, prices, cooking timestamps, and closing windows into structured catalog entities via Google Gemini 3.5 Flash Lite with instant local fallback parsing.
2. **Deterministic BPOM Food Safety Guardrail:**  
   Enforces Indonesian BPOM food safety regulations (PerBPOM No. 16/2019) using 3072-dimensional semantic vector similarity and lexical heuristics (e.g. coconut milk/dairy left at room temperature > 4 hours are strictly rejected with HTTP 400). Zero hallucination risk.
3. **Dual-Mode Merchant Surplus Input:**  
   - **Routine Catalog Mode (Primary):** Tap pre-registered dishes from the store master menu to open an instant batch modal with portion steppers (`- / +`), cooking batch times, real-time room-temperature BPOM evaluation ($\Delta t$), and 1-tap publishing.
   - **AI Ad-Hoc Mode:** Free-form voice dictation or text input processed by Gemini 3.5 Flash Lite for seasonal or uncataloged surplus items, with 1-click catalog enrollment (`+ Simpan ke Buku Menu`).
4. **Time-Decay Dynamic Pricing Engine:**  
   Calculates optimal discounts (50%–70% clamped) based on remaining closing time and stock volume. Once published, the price is locked to prevent strategic waiting and encourage immediate consumer purchase.
5. **Smart Mystery Bag Automatic Bundling:**  
   Clusters remaining low-stock surplus dishes ($1 \le \text{qty} \le 2$) into themed surprise bags (*"Mystery Bag"*) with aggressive 60%–70% discounts, enforcing the strictest microbiological shelf-life ceiling among constituent items and atomically deactivating individual units.
6. **Autonomous Multi-Tenant Authentication:**  
   Full self-service registration and login for both F&B merchants (auto-generated unique `Store ID` and SHA-256 salted PIN hash) and consumers (unique WhatsApp phone verification), issuing stateless HS256 JWT tokens with zero demo shortcuts.
7. **Transparent Bill Breakdown & Realistic QRIS Settlement Modal:**  
   Consumers view itemized pricing with clear discount savings, selecting between Cash on Pickup or Instant QRIS. QRIS orders render a national-standard QR matrix with a 15-minute countdown timer and payment confirmation handshake.
8. **ISO/IEC 18004 QR Digital Pass & Camera Scanner:**  
   Generates hardware-grade `#NW-xxxx` digital passes with QR matrix on the consumer device and provides optical camera scanning via `html5-qrcode` on the merchant cashier screen, backed by anti-double-redemption checks and cross-store fraud prevention (HTTP 403).
9. **Real-Time Consumer Ticket Auto-Sync (Live Polling):**  
   Silent background polling at 3.5-second intervals automatically updates active `RESERVED` tickets to `COMPLETED` the exact instant the cashier verifies the order.
10. **Cashier POS Daily Shift Summary:**  
    Real-time cashier header metrics displaying total rescued portions, cash-to-collect reconciliation (`CASH_ON_PICKUP`), and settled digital revenue (`QRIS`).
11. **Interactive Leaflet Geospatial Discovery:**  
    Native coordinate-based map using OpenStreetMap tiles with user-to-store Haversine distance calculations and walking/motorcycle radius filters (<500m, <1.5km, All).
12. **Atomic Order Cancellation & Stock Rollback:**  
    Consumers can cancel reserved orders before pickup, immediately returning reserved quantities to the active store catalog in SQLite.

---

## Technical Architecture & Stack

- **Client Layer (`frontend/`):**  
  Mobile-first Responsive Web App & PWA built with React 18/19, Vite, TypeScript, and Tailwind CSS in an Earth Tone palette (`#F8F6F0` Linen Oat, `#10B981` Emerald, `#1F1D1A` Charcoal). Integrates browser Web Speech Recognition API (`id-ID`), ISO/IEC 18004 QR Code generator (`qrcode.react`), live optical webcam scanner (`html5-qrcode`), and OpenStreetMap geospatial maps (`leaflet`).
- **Backend Core (`backend/`):**  
  Python 3.11+ FastAPI application featuring asynchronous REST endpoints, CORS middleware, and dependency-injected database sessions.
- **AI Gateway & LLM Orchestration (`backend/app/core/ai_gateway.py`):**  
  Direct client to Google AI Studio REST API with round-robin key rotation (`GEMINI_API_KEY_1..3`) and hardened 15-second network timeout. Uses **`gemini-3.5-flash-lite`** with auto-failover to `gemini-flash-lite-latest` and instant offline regex heuristic fallback (`local-fallback-parser`).
- **Semantic Vector Store & RAG (`backend/app/services/vector_store.py`):**  
  Hybrid semantic retrieval engine using 3072-dimensional embeddings via **`gemini-embedding-001`**, backed by a disk cache (`food_embeddings_cache.json`) covering 70 universal culinary archetypes and PerBPOM No. 16/2019 safety thresholds.
- **Database & Persistence (`backend/app/models/`):**  
  Local ACID relational database via SQLite (`nullwasted_local.db`) using SQLModel (SQLAlchemy 2.0 + Pydantic v2). Features atomic stock decrements, transactional cancellations, and automatic SQLite column migrations without Docker overhead.

---

## Repository Structure

```
nullwasted/
├── frontend/                # React 18/19 + Vite + TypeScript Web PWA
│   ├── src/
│   │   ├── components/      # Modular PWA screens
│   │   │   ├── AuthScreen.tsx               # Autonomous Store & Consumer Auth / Registration
│   │   │   ├── MerchantInputScreen.tsx      # Dual-Mode Surplus Input (Catalog vs AI Voice/Text)
│   │   │   ├── MerchantPreviewScreen.tsx    # 1-Tap Confirmation Card & BPOM Audit Preview
│   │   │   ├── MerchantCatalogModal.tsx     # Store Master Menu Catalog Management
│   │   │   ├── MerchantInventoryScreen.tsx  # Active Store Catalog & Smart Mystery Bag Bundling
│   │   │   ├── MerchantCashierScreen.tsx    # Camera QR Scanner, Anti-Fraud, & Cashier POS Summary
│   │   │   ├── ConsumerFeedScreen.tsx       # Discovery Feed with Haversine Radius Filters
│   │   │   ├── ConsumerMapModal.tsx         # Interactive Leaflet Map with OpenStreetMap Tiles
│   │   │   ├── ConsumerDetailModal.tsx      # Item Detail, Bill Breakdown, & Realistic QRIS Modal
│   │   │   ├── ConsumerOrdersScreen.tsx     # Digital Pass List, QR Matrix, & Live 3.5s Polling
│   │   │   └── ClosingCountdownBadge.tsx   # Live Store Closing Countdown Badge
│   │   ├── services/
│   │   │   ├── api.ts                       # Typed fetch client to FastAPI backend
│   │   │   └── speech.ts                    # Native browser Web Speech API wrapper
│   │   ├── types/
│   │   │   └── listing.ts                   # Pydantic-mirrored TypeScript interfaces
│   │   ├── App.tsx                          # Smartphone shell container & tab router
│   │   └── main.tsx                         # React root entry point
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── backend/                 # FastAPI REST API with SQLModel & Google Gemini AI
│   ├── app/
│   │   ├── api/v1/          # REST route handlers (auth, menu, listings, orders)
│   │   ├── core/            # Config, DB engine, seeder, security, and AI Gateway
│   │   ├── data/            # 70 BPOM food rules & 3072-dim embeddings cache
│   │   ├── models/          # SQLModel table schemas (Store, User, Menu, Listing, Ticket)
│   │   ├── schemas/         # Pydantic request/response validation schemas
│   │   ├── services/        # Extractor (LLM), Guardrail (BPOM RAG), Pricing Engine
│   │   └── main.py          # Application entry point with CORS and lifespan
│   ├── tests/
│   │   └── test_unit_core.py # Automated test suite (22 unit & integration tests)
│   ├── nullwasted_local.db  # Local SQLite database
│   ├── pytest.ini           # Pytest async configuration
│   ├── requirements.txt     # Python dependencies
│   ├── .env                 # Local environment secrets (API keys)
│   └── .env.example         # Template for environment variables
├── run_app.bat              # Standard 1-Click launcher for Backend (8000) & Frontend (5173)
├── run_demo.bat             # Alternative 1-Click launcher
├── README.md                # Project architecture & setup documentation
└── .gitignore               # Git ignore rules for node_modules, DB, and .env
```

---

## System Architecture Diagram

```
[ Merchant Web / Voice ]        [ Consumer Web / Mobile ]
 (Web Speech API id-ID)           (Discovery Feed & Pass)
          │                                  │
          └─────────────────┬────────────────┘
                            │
                            ▼
              [ React 18/19 Vite PWA Shell ]
                  (Port 5173 / Earth Tone)
                            │
                            ▼ (REST API via HTTP)
              [ FastAPI Backend Engine ]
                  (Port 8000 / Python 3.11+)
                  │            │           │
       ┌──────────┘            │           └──────────┐
       ▼                       ▼                      ▼
[ AI Gateway ]       [ Guardrail & RAG ]      [ SQLModel ORM ]
- gemini-3.5-flash-lite - gemini-embedding-001  - SQLite Local DB
- Failover Pool         - 3072-dim Cosine Sim   - Atomic Decrement
- Local Regex Fallback  - 70 BPOM Dishes Cache  - Order Lifecycle
```

---

## Getting Started

### Prerequisites
- **Python 3.11+**
- **Node.js 18+** & `npm`
- Google AI Studio API Key (for live Gemini LLM & embedding calls)

### Quick Start (Windows 1-Click Launcher)
Double-click `run_app.bat` (or `run_demo.bat`) in the repository root. It will:
1. Start the FastAPI backend on `http://localhost:8000`.
2. Start the React Vite PWA on `http://localhost:5173`.
3. Open `http://localhost:5173` automatically in your default browser.

### Manual Setup

#### 1. Backend Setup
```bash
cd backend

# Create and activate virtual environment (optional)
python -m venv venv
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env and supply your GEMINI_API_KEY_1

# Start the backend server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Interactive API documentation will be available at:
- Swagger UI: `http://localhost:8000/docs`
- Health Check: `http://localhost:8000/health`

#### 2. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Start the Vite development server
npm run dev
```
Open `http://localhost:5173` in Google Chrome or Microsoft Edge to enable native Web Speech Recognition.

---

## Automated Testing

Run the comprehensive unit and integration test suite:

```bash
cd backend
py -m pytest tests/ -v
```

The 22 automated test cases validate:
- Time-decay dynamic pricing calculations, boundary clamping (50%–70%), and rounding.
- Deterministic BPOM food safety rejection of spoiled food (> 4 hours room temperature santan/dairy).
- Semantic vector store integrity (3072-dimensional cosine similarity matching against 70 dishes).
- Live Gemini 3.5 Flash Lite entity extractor with fallback regex parsing.
- Multi-store seeder, catalog master menu CRUD, and automated BPOM tagging.
- Context-Aware Slot Filling (Cases A, B, C, D).
- Smart Mystery Bag bundling engine and individual item deactivation.
- Payment method tracking (`CASH_ON_PICKUP` vs `SIMULATED_QRIS`).
- Atomic order cancellation and inventory stock rollback.
- Cross-store cashier fraud rejection (HTTP 403).
- Multi-tenant order isolation across distinct stores.
- AI Gateway HTTP client timeout hardening ($\ge 15.0\text{s}$).
- Autonomous merchant and consumer registration, duplicate rejection, and PIN hashing.

---

## License
MIT License.
