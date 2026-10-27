# NullWasted Repository — AI Coding Directives & Memory Protocol

> **CRITICAL DIRECTIVE FOR ALL AGENTS & DEVELOPERS:**  
> This file defines the operational rules, coding standards, and memory persistence protocol for the **NullWasted** standalone software repository.

---

## 1. Session Initialization (MANDATORY FIRST ACTION)
At the start of **ANY** conversation session or task in this repository:
1. **Immediately view `CONTEXT.md`** at the repository root (`CONTEXT.md`).
2. Read the following core sections:
   - **Section 1: Project Metadata & Overview**
   - **Section 2: System Architecture & Tech Stack**
   - **Section 3: 10 Fixed In-Scope Features (Frozen Scope Baseline)**
   - **Section 4: Sprint Progress & Task Tracker**
3. Seamlessly resume from the latest status documented in `CONTEXT.md` without asking the user to re-explain the project architecture.

---

## 2. Session Finalization & Milestone Updates (MANDATORY UPDATE ACTION)
Before completing any turn that produces code, modifies schemas, or finishes a milestone:
1. **CRITICAL RULE: User Confirmation Required for 'DONE' Status:**
   - **STRICT PROHIBITION:** Never mark any task or deliverable as `DONE` unless the user has explicitly verified and approved its completion.
   - Keep tasks as `IN PROGRESS` or `DRAFT` while under review or until all parts have been checked and approved by the user.
2. **Always update `CONTEXT.md`**:
   - Update the **Sprint Progress & Task Tracker** table (keep in-review tasks as `IN PROGRESS`; only mark `DONE` upon explicit user sign-off).
   - Record any new technical decisions, database migrations, or endpoint contracts.
   - Update the timestamp (`Last Updated`).
3. Keep `CONTEXT.md` accurate, concise, and structured so any team developer or AI agent picks up with zero friction.

---

## 3. Repository Independence & Security Directives
- **100% Self-Contained Repository:** This codebase is fully standalone. All modules, imports, scripts, and documentation must resolve internally with zero external relative path dependencies (`../`).
- **Privacy & Clean Contribution Hygiene:** Never commit personal contact details, private credentials, or internal organizational notes. All team references and commit attributions use professional engineering roles (*AI & Agent Orchestration Lead*, *Backend API & Database Lead*, *Frontend UX & PWA Lead*) or GitHub handles.
- **Zero Committed Secrets:** All API keys, database credentials, and runtime secrets must be loaded via environment variables using `pydantic-settings` or `.env`. The `.env` file is strictly ignored by `.gitignore`. Only commit `.env.example` containing dummy placeholder values.
- **Strict English-Only Policy:** All code (identifiers, variables, functions, types, schemas), inline comments, docstrings, documentation files (`docs/`, `README.md`, `CONTEXT.md`), commit messages, and API contracts must be written 100% in standard professional English.

---

## 4. Code Standards & Architecture Guidelines

### A. Frontend Layer (`frontend/`)
- **Stack:** React 18/19, Vite, TypeScript, Tailwind CSS, Lucide Icons, and PWA Plugin.
- **Audio Capture:** Use native browser Web Audio API (`MediaRecorder`) exporting `.webm` / `.wav`.
- **State & Data Fetching:** Use TanStack Query (React Query) for API caching and automated refetching.
- **Components:** Keep components modular, responsive (mobile & desktop), and clean. Follow modern styling with rich aesthetics.

### B. Backend Layer (`backend/`)
- **Stack:** Python 3.11+, FastAPI (asyncio native), SQLModel (SQLAlchemy 2.0 + Pydantic v2), and Alembic migrations.
- **AI Gateway Integration:** All LLM requests MUST route through the standalone **9Router** instance at `http://9router:20128/v1` (or `http://localhost:20128/v1` during local development) using `AsyncOpenAI`.
- **Task Queue & Caching:** Use Redis 7 Alpine with `arq` for asynchronous audio listing jobs and token-bucket rate limiting.
- **Database:** PostgreSQL 16 with `pgvector` for transactional data (ACID) and semantic search embeddings.

### C. AI Agent Layer (`agent/`)
- **Framework:** LangGraph `StateGraph`.
- **Tools:** 4 deterministic tools:
  1. `inventory_tool.py`: Structured JSON entity extraction from raw text/audio transcripts.
  2. `safety_tool.py`: Deterministic BPOM food safety verification via pgvector cosine similarity.
  3. `bundling_tool.py`: Mystery bag clustering algorithm for small residual portions (< 3).
  4. `pricing_tool.py`: Time-decay dynamic pricing algorithm (50%–70%) with rupiah psychological rounding.
- **Human-in-the-Loop:** Always pause/interrupt before publishing to display the interactive 1-tap confirmation card to store staff.

---

## 5. Team Division & Git Collaboration Protocol
- **Functional Roles:**
  - **AI & Agent Orchestration Lead** (`agent/`, `9router` configuration)
  - **Backend API & Database Lead** (`backend/`, `docker-compose.yml`, migrations)
  - **Frontend Web & PWA Lead** (`frontend/`, UI components, PWA)
- **Branching Strategy:**
  - `main`: Production-ready, fully working code.
  - `feature/agent-core`: AI orchestration and tools.
  - `feature/backend-api`: FastAPI endpoints and database models.
  - `feature/frontend-ui`: React Vite Web App and PWA components.
- **Commit Message Convention:**  
  Use Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.
