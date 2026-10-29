# NullWasted: Autonomous AI-Powered Surplus Food Marketplace

NullWasted is an autonomous, AI-driven surplus food marketplace platform connecting local F&B merchants with budget-conscious consumers through scheduled self-pickup windows at 50%–70% discounts.

The platform eliminates the operational friction of store closing hours using an **Agentic AI Store Assistant** that converts voice notes or colloquial text into validated product listings in seconds.

---

## Key Features

1. **Natural Language Listing (In-App Voice & Text):**  
   Store staff dictate surplus items via native browser Web Speech Recognition API (`id-ID`) or type free-form text. The AI extracts food names, portions, prices, cooking timestamps, and closing windows into structured catalog entities.
2. **Deterministic BPOM Food Safety Guardrail:**  
   Enforces Indonesian BPOM food safety regulations (PerBPOM No. 16/2019) using 3072-dimensional semantic vector similarity and lexical heuristics (e.g. coconut milk/dairy left at room temperature > 4 hours are strictly rejected with HTTP 400). Zero hallucination risk.
3. **Time-Decay Dynamic Pricing Engine:**  
   Calculates optimal discounts (50%–70% clamped) based on remaining closing time and stock volume. Once published, the price is locked to prevent strategic waiting and encourage immediate consumer purchase.
4. **1-Tap Interactive Preview Card:**  
   Presents a structured confirmation card with BPOM audit status and dynamic pricing slider for merchant verification before catalog publication.
5. **Real-Time Consumer Discovery Feed & Atomic Reservation:**  
   Consumers browse surplus meals with live closing window countdowns, select portion quantities, and reserve stock with atomic database decrement.
6. **Digital Order Pickup Pass & Cashier Verification:**  
   Generates unique order codes (`#NW-xxxx`) and digital QR passes for self-pickup, with cashier validation preventing double redemption.

---

## Technical Architecture & Stack

- **Client Layer (`frontend/`):**  
  Mobile-first Responsive Web App & PWA built with React 18/19, Vite, TypeScript, and Tailwind CSS. Utilizes native Browser Web Speech Recognition API (`webkitSpeechRecognition` / `SpeechRecognition` configured for `id-ID`) for real-time dictation without external audio dependencies.
- **Backend Core (`backend/`):**  
  Python 3.11+ FastAPI application featuring asynchronous REST endpoints, CORS middleware, and dependency-injected database sessions.
- **AI Gateway & LLM Orchestration (`backend/app/core/ai_gateway.py`):**  
  Direct client to Google AI Studio REST API with round-robin key rotation (`GEMINI_API_KEY_1..3`). Uses **`gemini-3.5-flash-lite`** (ultra-fast ~3s latency, generous daily rate limits on Free Tier) with auto-failover to `gemini-flash-lite-latest` and instant offline regex heuristic fallback (`local-fallback-parser`).
- **Semantic Vector Store & RAG (`backend/app/services/vector_store.py`):**  
  Hybrid semantic retrieval engine using 3072-dimensional embeddings via **`gemini-embedding-001`**, backed by a pre-computed disk cache (`food_embeddings_cache.json`) covering 70 universal culinary archetypes (Indonesian, Western, Asian, Bakery, and Dairy/Desserts) and PerBPOM No. 16/2019 safety thresholds.
- **Database & Persistence (`backend/app/models/`):**  
  Local ACID relational database via SQLite (`nullwasted_local.db`) using SQLModel (SQLAlchemy 2.0 + Pydantic v2). Features atomic stock decrements and automatic SQLite column migrations without Docker overhead.

---

## Repository Structure

```
nullwasted/
├── frontend/                # React 18/19 + Vite + TypeScript Web PWA
│   ├── src/
│   │   ├── components/      # Modular PWA screens
│   │   │   ├── AuthScreen.tsx               # Dual-role switch (Merchant vs Consumer)
│   │   │   ├── MerchantInputScreen.tsx      # Voice & text input with Web Speech API
│   │   │   ├── MerchantPreviewScreen.tsx    # 1-tap confirmation & BPOM audit card
│   │   │   ├── MerchantInventoryScreen.tsx  # Active store catalog management
│   │   │   ├── MerchantCashierScreen.tsx    # Cashier pickup code validation
│   │   │   ├── ConsumerFeedScreen.tsx       # Discovery feed with closing countdown
│   │   │   ├── ConsumerDetailModal.tsx      # Dish detail sheet & portion stepper
│   │   │   └── ConsumerOrdersScreen.tsx     # Order pass list & QR display
│   │   ├── services/
│   │   │   ├── api.ts                       # Typed fetch client to FastAPI backend
│   │   │   └── speech.ts                    # Native browser Web Speech API wrapper
│   │   ├── types/
│   │   │   └── listing.ts                   # Pydantic-mirrored TypeScript interfaces
│   │   ├── App.tsx                          # Smartphone shell container & navigation
│   │   └── main.tsx                         # React root entry point
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── backend/                 # FastAPI REST API with SQLModel & Google Gemini AI
│   ├── app/
│   │   ├── api/v1/          # REST route handlers (listings, orders, pickup)
│   │   ├── core/            # Configuration (.env), DB engine, and AI Gateway
│   │   ├── data/            # 70 BPOM food rules & 3072-dim embeddings cache
│   │   ├── models/          # SQLModel table schemas (ItemListing, OrderTicket)
│   │   ├── schemas/         # Pydantic request/response validation schemas
│   │   ├── services/        # Extractor (LLM), Guardrail (BPOM RAG), Pricing Engine
│   │   └── main.py          # Application entry point with CORS and lifespan
│   ├── tests/
│   │   └── test_unit_core.py # Automated unit & integration test suite (9 tests)
│   ├── nullwasted_local.db  # Local SQLite database
│   ├── pytest.ini           # Pytest async configuration
│   ├── requirements.txt     # Python dependencies
│   ├── .env                 # Local environment secrets (API keys)
│   └── .env.example         # Template for environment variables
├── run_demo.bat             # 1-Click launcher for Backend (8000) & Frontend (5173)
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
Double-click `run_demo.bat` in the repository root. It will:
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

The test suite validates:
- Dynamic pricing boundaries and rounding (clamped 50%–70%).
- Deterministic BPOM food safety rejection of spoiled food (> 4 hours room temp santan/dairy).
- Semantic vector store integrity (3072-dimensional cosine similarity matching).
- Live Gemini 3.5 Flash Lite entity extractor with fallback parsing.
- Full order lifecycle: draft ➔ publish ➔ reserve ➔ pickup completion ➔ double-redemption rejection.

---

## License
MIT License.
