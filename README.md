# NullWasted: Autonomous AI-Powered Surplus Food Marketplace

NullWasted is an autonomous, AI-driven surplus food marketplace platform connecting local F&B merchants with budget-conscious consumers through scheduled self-pickup windows at 50%–70% discounts.

The platform eliminates the operational friction of store closing hours using an **Agentic AI Store Assistant** that converts voice notes or colloquial text into validated product listings in seconds.

---

## Key Features

1. **Natural Language Listing (In-App Voice & Chat):**  
   Store staff can record quick voice notes via browser Web Audio API or send casual messages. The AI agent parses product names, portions, prices, and timestamps into structured catalog entries.
2. **Smart Bundling (Mystery Bag / Surprise Bag):**  
   The AI automatically clusters miscellaneous small portions into appetizing, discounted themed packages.
3. **Dynamic Pricing Recommendations (Dynamic at Generation, Fixed at Publication):**  
   Calculates optimal discounts (50%–70%) during listing creation based on remaining closing time and stock volume. Once published, the price is locked to prevent strategic waiting and encourage immediate consumer purchase.
4. **Deterministic Food Safety Guardrails:**  
   Enforces BPOM safety standards, shelf-life limits, and perishable ingredient blacklists (e.g., coconut milk or dairy left at room temperature) via semantic similarity RAG in pgvector with zero hallucination risk.
5. **Human-in-the-Loop Verification:**  
   The assistant presents an interactive preview card in the web app requiring a single tap from store staff before any listing goes live.

---

## Overhauled Tech Stack

- **Client App:** Responsive Web App & PWA (React 18/19, Vite, TypeScript, Tailwind CSS) with native browser audio recording (`MediaRecorder`), Geolocation discovery, and QR code pickup validation. Deployable to Vercel / Cloudflare Pages.
- **Dedicated AI Gateway (9Router Standalone):** Dedicated container (`decolua/9router:latest` on port `20128`) exposing an OpenAI-compatible `/v1` endpoint. Handles smart 3-tier fallback, RTK token compression, and serves as a shared AI hub for NullWasted, coding agents (Cursor, Claude Code, Cline), and other projects.
- **Resilient Multi-Provider Free LLM Pool:**
  - **Tier 1 (Primary - High Context):** Google Gemini 1.5/2.0 Flash (Pool of team API keys with round-robin rotation).
  - **Tier 2 (Chinese Powerhouse - Permanently Free & Local Cuisine Master):** Zhipu AI GLM-4-Flash (100% free forever) & Alibaba Qwen 2.5 (72B/32B via OpenRouter `:free` / DashScope).
  - **Tier 3 (Ultra-Speed & Deep Reasoning):** Groq Cloud (Llama 3.3 70B Versatile ~500 tok/s) & DeepSeek-V3/R1.
- **Backend API & Orchestrator:** Python 3.11+ FastAPI (async REST & WebSockets) + LangGraph StateGraph agent communicating directly with 9Router.
- **Data & Caching (Self-Hosted 24/7 Docker):** 
  - **PostgreSQL 16 + pgvector** (`pgvector/pgvector:pg16`): ACID transactional data and vector embeddings for BPOM food safety RAG and semantic catalog search.
  - **Redis 7 (Alpine)** (`redis:7-alpine`): Message broker, audio background task queue (`arq`), rate-limiting token bucket (enforcing 15 RPM limits), and 1-tap confirmation draft cache.
- **ORM & Migrations:** SQLModel (SQLAlchemy 2.0 + Pydantic v2) + Alembic migrations.
- **Speech-to-Text (STT):** Groq Whisper Large V3 (free, <1s transcription) or Gemini Multimodal Audio.
- **Public Ingress:** Cloudflare Tunnel (`cloudflared`) for secure public HTTPS access without opening router ports or paying for static IPs.
- **Resource Footprint:** Entire 24/7 self-hosted container stack consumes only **~350 MB RAM** with idle CPU < 0.1% at **Rp0 / month**.

---

## Repository Structure

```
project/
├── frontend/                # React + Vite + TypeScript Web App (PWA)
│   ├── src/
│   │   ├── components/      # UI components (AudioRecorder, PreviewCard, QRScanner)
│   │   ├── hooks/           # Custom React hooks (useAudio, useGeolocation)
│   │   ├── pages/           # Store Portal & Consumer Marketplace pages
│   │   └── services/        # API client to FastAPI backend
│   ├── index.html
│   └── package.json
├── backend/                 # FastAPI REST & WebSocket server
│   ├── app/
│   │   ├── api/             # API routes (auth, listings, orders, store)
│   │   ├── core/            # Config, security, database sessions
│   │   ├── models/          # SQLModel database entities (Relational + Vector)
│   │   ├── schemas/         # Pydantic schemas for data validation
│   │   └── services/        # Business logic services & AI router client
│   ├── alembic/             # Database migrations
│   └── requirements.txt
├── agent/                   # LangGraph Agentic AI reasoning and tools
│   ├── agent_graph.py       # LangGraph state machine & orchestration
│   ├── prompts.py           # Structured system instructions & few-shot examples
│   ├── tools/               # Agent tool implementations
│   │   ├── inventory_tool.py  # Entity extraction from speech/text
│   │   ├── safety_tool.py     # Semantic BPOM food safety verification (pgvector)
│   │   ├── bundling_tool.py   # Mystery bag bundling algorithm
│   │   └── pricing_tool.py    # Time-decay dynamic pricing calculator
│   └── knowledge/           # BPOM food safety rules index & embeddings
├── docker-compose.yml       # 24/7 self-hosted multi-container setup (DB, Redis, 9Router, Backend, Tunnel)
├── tests/                   # Automated unit and integration tests
└── .env.example             # Template for required environment variables
```

---

## System Architecture Diagram

```
[ Frontend: React / Vite PWA ] (Vercel / Cloud CDN)
              │
              ▼ (HTTPS via Cloudflare Tunnel)
┌────────────────────────────────────────────────────────┐
│  24/7 Self-Hosted Machine (Total RAM: ~350 MB)         │
│                                                        │
│  FastAPI Backend ──► LangGraph Agent ──► 9Router       │
│        │                                   │ (Port 20128)
│        ├────────► Redis 7 (Queue & Cache)  │
│        │                                   ▼
│        └────────► PostgreSQL 16 + pgvector │
└────────────────────────────────────────────┼───────────┘
                                             │
               ┌─────────────────────────────┼─────────────────────────────┐
               ▼                             ▼                             ▼
       [ Google Gemini ]             [ Chinese LLMs ]               [ Groq Cloud ]
       Gemini 1.5/2.0 Flash          GLM-4-Flash & Qwen 2.5         Llama 3.3 70B & DeepSeek
```

---

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+ (for frontend web client)
- Docker & Docker Compose

### Local Development Setup
1. Clone the repository and navigate into the project directory:
   ```bash
   git clone <repo-url>
   cd project
   ```
2. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
3. Start the infrastructure services (PostgreSQL with pgvector, Redis, and 9Router):
   ```bash
   docker compose up -d
   ```
4. Access 9Router Web UI at `http://localhost:20128` to configure your free AI provider keys (Gemini, Zhipu GLM, Qwen, Groq).
5. Install backend dependencies and run migrations:
   ```bash
   cd backend
   pip install -r requirements.txt
   alembic upgrade head
   uvicorn app.main:app --reload --port 8000
   ```
6. Start the frontend development server:
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```

---

## License
MIT License.
