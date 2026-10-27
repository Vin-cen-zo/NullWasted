# NullWasted — Technical Context & Repository State

> **Notice for Developers & AI Agents:** This file is the single source of truth for the **NullWasted software repository**. Read this file at the start of every session to restore full technical context, and update it upon completing milestones.

---

## 1. Project Metadata & Overview
- **Project Name:** NullWasted (Autonomous AI-Powered Surplus Food Marketplace)
- **Domain:** F&B Surplus Food Rescue & E-Commerce Platform
- **Architecture:** Hybrid Cloud (FastAPI + React PWA + 9Router AI Gateway + PostgreSQL pgvector + Redis)
- **Repository Nature:** 100% Standalone Web & AI Application.
- **Engineering Roles:**
  - AI & Agent Orchestration Lead
  - Backend API & Database Infrastructure Lead
  - Frontend Web & PWA Development Lead

---

## 2. System Architecture & Tech Stack

### Core Philosophy:
A zero-cost (Rp0), high-resilience hybrid architecture combining a local 24/7 self-hosted container stack with free cloud CDN and multi-provider LLM routing.

```
[ FRONTEND: React / Vite PWA ] (Vercel / Cloudflare CDN)
             │
             ▼ (HTTPS via Cloudflare Tunnel)
┌─────────────────────────────────────────────────────────────────┐
│  24/7 SELF-HOSTED DOCKER STACK (Total RAM: ~350 MB Only!)       │
│                                                                 │
│  FastAPI Backend ──► LangGraph Agent ──► 9Router Gateway        │
│        │                                   │ (Port 20128)       │
│        ├────────► Redis 7 (Queue)          │                    │
│        │                                   │                    │
│        └────────► PostgreSQL 16 (pgvector) │                    │
└────────────────────────────────────────────┼────────────────────┘
                                             │
             ┌───────────────────────────────┼───────────────────────────────┐
             ▼                               ▼                               ▼
    [ Tier 1: Gemini Pool ]      [ Tier 2: China Powerhouse ]        [ Tier 3: Ultra-Speed ]
    Gemini 1.5/2.0 Flash         GLM-4-Flash (Free Forever)          Groq Llama 3.3 (500 t/s)
    (Team Key Rotation)          Alibaba Qwen 2.5 (Local Menu Guru)  DeepSeek-V3 / R1
```

### Technology Breakdown:
- **Frontend Client:** React 18/19 + Vite + TypeScript + Tailwind CSS (PWA installable on mobile).
  - Audio Input: Native browser Web Audio API (`MediaRecorder`).
  - QR Code: `qrcode.react` (buyer pickup pass) & `html5-qrcode` (merchant camera scanner).
- **Dedicated AI Gateway (9Router):** Standalone container (`decolua/9router` on port 20128) exposing OpenAI-compatible `/v1` endpoint with 3-tier fallback and RTK token compression.
- **Backend API & Orchestration:** Python 3.11+ FastAPI (async REST & WebSockets) + LangGraph `StateGraph`.
- **Database & Vector RAG:** PostgreSQL 16 + `pgvector` (`pgvector/pgvector:pg16`) for relational ACID transactions and BPOM food safety embeddings.
- **ORM & Validation:** SQLModel (SQLAlchemy 2.0 + Pydantic v2) + Alembic migrations.
- **Message Broker & Cache:** Redis 7 Alpine + `arq` async queue worker (15 RPM rate limiting & audio job buffer).
- **Speech-to-Text (STT):** Groq Whisper Large V3 (free cloud, <1s transcription) / Gemini Multimodal Audio.
- **Public Ingress:** Cloudflare Tunnel (`cloudflared`) with automatic HTTPS and zero open ports.

---

## 3. The 10 Locked In-Scope Features (Scope Baseline Frozen)

| No | Feature Name | Actor | Description |
| :---: | :--- | :--- | :--- |
| **1** | **Natural Language Listing** | Merchant Staff | Speech/text ingestion via Web Audio API & 9Router entity extraction. |
| **2** | **Food Safety Guardrail** | AI & System | BPOM food safety compliance check via pgvector semantic search (auto-rejects spoiled foods). |
| **3** | **Smart Bundling (Mystery Bag)** | AI Agent | Clusters small residual portions (< 3) into themed discounted surprise packages. |
| **4** | **Dynamic Pricing** | AI Agent | Calculates 50%–70% discount at generation based on closing time & stock volume; **price is locked upon publication** (kills strategic waiting). |
| **5** | **1-Tap Confirmation Card** | Merchant Staff | Interactive preview card allowing store staff to publish with a single tap (Human-in-the-Loop). |
| **6** | **Store Listing CRUD** | Merchant Staff | Basic inventory management: view active listings and toggle/deactivate if physically sold out. |
| **7** | **Consumer Discovery Feed** | Consumer | Nearby surplus food listings feed with distance radius and closing window countdown timer. |
| **8** | **Order & Atomic Stock Reservation** | Consumer | Cart checkout, mock payment simulation, and atomic database stock locking. |
| **9** | **Digital Pickup Pass (QR Code)** | Consumer | Generated digital pass containing unique order ID and scannable QR code. |
| **10** | **Handover & QR Scanner Validation**| Merchant Cashier | Camera QR scanner to validate customer digital pass and transition order status to `COMPLETED`. |

*(Out-of-Scope / V2 Backlog: Post-pickup consumer reviews/ratings, Automated emergency refund workflows, Separate no-show cron engines, Audio bell chimes, Carbon/CO2 impact trackers).*

---

## 4. Repository Structure & Module Layout

```
nullwasted/
├── frontend/                # React + Vite + TypeScript Web App (PWA)
│   ├── src/
│   │   ├── components/      # AudioRecorder, PreviewCard, QRScanner, ProductCard
│   │   ├── hooks/           # useAudio, useGeolocation, useOrders
│   │   ├── pages/           # Merchant Portal & Consumer Marketplace
│   │   └── services/        # API client targeting FastAPI
│   ├── index.html
│   └── package.json
├── backend/                 # FastAPI REST & WebSocket server
│   ├── app/
│   │   ├── api/             # API routes (auth, stores, listings, orders)
│   │   ├── core/            # Config, database session, 9Router client
│   │   ├── models/          # SQLModel entities (User, Store, Listing, Order)
│   │   ├── schemas/         # Pydantic schemas (contracts)
│   │   └── services/        # Business logic services
│   ├── alembic/             # Database migrations
│   └── requirements.txt
├── agent/                   # LangGraph Agentic AI reasoning and tools
│   ├── state.py             # AgentState TypedDict
│   ├── agent_graph.py       # LangGraph StateGraph workflow
│   ├── prompts.py           # Indonesian colloquial few-shot prompts
│   ├── tools/               # inventory_tool, safety_tool, bundling_tool, pricing_tool
│   └── knowledge/           # BPOM rules seed scripts & embeddings
├── docs/                    # Technical & engineering process documentation
│   ├── adr/                 # Architectural Decision Records (ADR-001, etc.)
│   └── ai_use_log.md        # AI coding agent utilization & human oversight log
├── docker-compose.yml       # Infrastructure orchestration (DB, Redis, 9Router, Tunnel)
├── tests/                   # Automated unit and integration tests
├── AGENTS.md                # AI coding agent directives & standards
├── CONTEXT.md               # Single source of truth for technical memory
├── README.md                # Public repository overview & setup instructions
└── .env.example             # Template for required environment variables
```

---

## 5. Sprint Progress & Task Tracker

### Team Collaboration & Execution Protocol:
- **Parallel Workstreams:** The 3 functional leads work concurrently across separated directories (`backend/`, `agent/`, `frontend/`) on dedicated Git feature branches (`feature/backend-api`, `feature/agent-core`, `feature/frontend-ui`).
- **Contract-First Agreement:** When ready to start Sprint 1, the team will briefly align on shared data contracts (Pydantic schemas and endpoint payload shapes in `backend/app/schemas/`) so that frontend, backend, and agent can build in parallel without blocking each other.

| Task / Deliverable | Assignee | Status | Notes / Location |
| :--- | :--- :---: | :--- |
| **Architecture & Scope Frozen** | All | **DONE** | Documented in `README.md` & `CONTEXT.md` |
| **Data Contract & Schema Alignment**| All | **IN PROGRESS** | Drafted in `backend/app/schemas/listing.py` & `frontend/src/types/listing.ts` |
| **FastAPI Core & DB Engine** | Backend Lead | **IN PROGRESS** | Implemented in `backend/app/main.py` & `backend/app/core/database.py` |
| **Food Safety BPOM Guardrail Engine** | AI Lead | **IN PROGRESS** | `backend/app/services/guardrail.py` & 30+ dish dataset in `food_knowledge_base.json` |
| **Time-Decay Dynamic Pricing Engine** | Backend Lead | **IN PROGRESS** | `backend/app/services/pricing.py` (50%–70% clamped time decay) |
| **Automated Unit & API Test Suite** | All | **IN PROGRESS** | `backend/tests/test_unit_core.py` (100% pass, 7 tests in 1.3s) |
| **React Vite PWA & Earth Tone UI Shell**| Frontend Lead | **IN PROGRESS** | `frontend/` shell, Tailwind Earth Tone palette, Lucide icons |
| **Merchant Audio & 1-Tap Preview Card** | Frontend Lead | **IN PROGRESS** | `frontend/src/components/InputPanel.tsx` & `PreviewCard.tsx` (3 preset pills) |
| **Consumer Discovery Feed & QR Pass** | Frontend Lead | **IN PROGRESS** | `frontend/src/components/ConsumerFeed.tsx` & `OrderModal.tsx` |
| **1-Click Windows Demo Launcher** | All | **IN PROGRESS** | `run_demo.bat` |

---
*Last Updated: 2026-10-27 (Sprint 1 MVP implementation completed on feature branch; ready for user review and validation)*
