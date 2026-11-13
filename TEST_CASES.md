# NullWasted: System Verification Specification & Master Test Cases

This document defines the formal manual and automated test specifications for the **NullWasted** surplus food platform. It validates all core functional modules, algorithmic rules, safety guardrails, and adversarial edge cases across the complete application lifecycle.

---

## 1. System Architecture & Test Environment

### 1.1 Prerequisites
- **Runtime Environment:** Python 3.11 or later (FastAPI backend), Node.js 18 or later (React Vite PWA).
- **Client Requirements:** Google Chrome or Chromium-based browser supporting the W3C Web Speech API and HTML5 camera capture (`MediaDevices.getUserMedia`).
- **Operating Systems:** Windows, macOS, or Linux.

### 1.2 Startup Sequence
Execute the standard runner from the `project/` root:
```powershell
.\run_app.bat
```
Or initiate backend and frontend services independently:
```powershell
# Terminal 1: Backend Service (FastAPI)
cd backend
py -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2: Frontend Service (Vite Development Server)
cd frontend
npm run dev
```

### 1.3 Service Endpoints
| Service | Endpoint | Description |
| :--- | :--- | :--- |
| **Frontend Web App** | `http://localhost:5173` | Progressive Web Application interface |
| **API Documentation** | `http://localhost:8000/docs` | OpenAPI 3.0 / Swagger schema |
| **Health Check** | `http://localhost:8000/health` | Fast in-memory process status |

### 1.4 Pre-Seeded Test Credentials
The local SQLite instance (`backend/nullwasted_local.db`) contains the following default test accounts:

| Role | Entity | Store ID / Identifier | Security Key / PIN | Coordinate Offset |
| :--- | :--- | :--- | :--- | :--- |
| **Merchant** | Dapur Barokah FTUI | `FTUI-001` | `1234` | ~110 m (Kantin FTUI) |
| **Merchant** | Warkop & Snack Kutek | `KUTEK-007` | `1234` | ~780 m (Kukusan Teknik) |
| **Merchant** | Roti Unyil & Pastry Margonda | `MARGONDA-042` | `1234` | ~1.8 km (Jl. Margonda Raya) |
| **Consumer** | Budi Santoso | `0812-8899-0011` | Direct Session Verification | User Reference Node |

---

## 2. Test Execution Matrix

| Suite | Category | Functional Scope | Case Count |
| :--- | :--- | :--- | :---: |
| **Suite 1** | Automated Suite | Full pytest suite (`42` unit & edge-case tests), Vite/TS build, & `/health` | 3 |
| **Suite 2** | Authentication | Merchant onboarding, session caching, and consumer verification | 4 |
| **Suite 3** | Merchant Operations | Speech recognition, AI entity extraction, and catalog batching | 6 |
| **Suite 4** | Safety Guardrail | PerBPOM No. 16/2019 semantic RAG, poison filtering, and time decay | 9 |
| **Suite 5** | Pricing & Bundling | Algorithmic time-decay discount and multi-item Mystery Bag bundling | 5 |
| **Suite 6** | Consumer Discovery | Geospatial Haversine radius, interactive maps, and feed filtering | 5 |
| **Suite 7** | Order Lifecycle | Atomic inventory transactions, QRIS single-modal, and QR pass generation | 5 |
| **Suite 8** | Cashier POS | Optical webcam decoding, POS shift summaries, and anti-fraud checks | 6 |
| **Suite 9** | Image System | Dual-mode upload, canvas compression, inheritance, and adaptive UI | 5 |
| **Suite 10** | Hardening & UX Polish | Live preview controls, GPS toggle, bookmarks, expiry guards, bilingual RAG, & JWT isolation | 10 |
| **Total** | | **Comprehensive System Scope** | **58 Cases** |

---

## 3. Detailed Test Suites

---

### SUITE 1: Automated Verification & Build Hygiene

- [x] **TC-AUTO-01: Backend Pytest Suite Execution**
  - **Command:**
    ```powershell
    cd backend
    py -m pytest tests/ -v
    ```
  - **Expected Result:**
    - All 42 test cases pass (`42 passed`: `33` in `tests/test_unit_core.py` + `9` in `tests/test_production_edge_cases.py`).
    - Exit code: `0`.
    - Verification includes Guardrail RAG (`100` bilingual BPOM dishes), Dynamic Pricing clamping, Mystery Bag clustering, atomic stock decrement (`409`), expiry guards, optional JWT cross-store isolation (`403`), PBKDF2 hashing, and image URL lifecycle inheritance.

- [x] **TC-AUTO-02: Frontend Production Build Compilation**
  - **Command:**
    ```powershell
    cd frontend
    npm run build
    ```
  - **Expected Result:**
    - TypeScript compiler (`tsc -b`) and Vite production bundler complete with exit code `0`.
    - Zero compile-time errors; output chunks written to `dist/`.

- [ ] **TC-AUTO-03: In-Memory Health Endpoint**
  - **Method / Path:** `GET http://localhost:8000/health`
  - **Expected Result:**
    - HTTP 200 OK.
    - Response payload: `{"status": "healthy", "service": "NullWasted Backend"}` with latency below 5 ms.

---

### SUITE 2: Multi-Tenant Authentication & Session Management

- [x] **TC-AUTH-01: Merchant Self-Service Registration with Custom Category**
  - **Procedure:**
    1. Open `http://localhost:5173`, click `"Ganti Akun"`, select `"Mitra Toko"`, and open sub-tab `"Daftarkan Gerai Baru"`.
    2. Under Category, select `"Lainnya (Tulis Sendiri)..."`.
    3. Input custom category: `Dimsum & Bento Specialist`.
    4. Input store name: `Kantin Dekanat Baru`.
    5. Input store address: `Gedung Dekanat FTUI Lantai 1` (must be >= 10 characters).
    6. Input 4-6 digit PIN: `9999`, then click `"Daftarkan Gerai & Dapatkan Store ID"`.
  - **Expected Result:**
    - Registration completes successfully; system allocates a unique Store ID (`STORE-xxxx`).
    - Session initiates automatically as the newly registered merchant.

- [x] **TC-AUTH-02: Merchant Credential Persistence & Quick Selector**
  - **Procedure:**
    1. On the Merchant Login tab, enable the checkbox `"Ingat Kredensial di Perangkat Ini"`.
    2. Input `Store ID: FTUI-001` and `PIN: 1234`, then click `"Masuk ke Dapur Mitra"`.
    3. Click `"Ganti Akun"` to log out, then return to the Merchant tab.
  - **Expected Result:**
    - Quick selection card displays stored account chip: `FTUI-001 · Dapur Barokah FTUI`.
    - Selecting the chip automatically populates Store ID and PIN inputs.

- [x] **TC-AUTH-03: Consumer Phone Authentication**
  - **Procedure:**
    1. In the account dialog, select the `"Konsumen"` tab.
    2. Input WhatsApp phone number: `0812-8899-0011`.
    3. Click `"Masuk & Jelajah Surplus"`.
  - **Expected Result:**
    - Consumer session initializes immediately without requiring external OTP mock gates; navigation directs to the discovery feed.

- [x] **TC-AUTH-04: Stateless Role Transition**
  - **Procedure:**
    1. From an active Consumer session, click `"Ganti Akun"`.
    2. Log in using Merchant credentials.
    3. Verify available tabs correspond strictly to Merchant kitchen operations (`"Input Suara / AI"`, `"Menu Rutin"`, `"Kelola Menu"`, `"Kasir QR"`).
  - **Expected Result:**
    - Session transitions without state pollution or lingering cross-role permissions.

---

### SUITE 3: Merchant Kitchen Operations & AI Store Assistant

- [x] **TC-MERCH-01: Native Web Speech Recognition (Indonesian Language)**
  - **Procedure:**
    1. On Merchant tab, select `"Input Suara / Menu Spesial AI"`.
    2. Click `"Dikte Suara"` (grant browser microphone access).
    3. Speak: *"Ada rendang sapi sisa lima porsi baru matang jam dua siang harga tiga puluh ribu"*.
    4. Click `"Stop Bicara (Sedang Mendengarkan...)"` (if auto-stop has not triggered), then click `"Analisis dengan AI & Guardrail BPOM"`.
  - **Expected Result:**
    - Transcribed text renders directly into the input area in real time via the native W3C Speech Recognition interface.

- [x] **TC-MERCH-02: Colloquial Natural Language Extraction (Gemini 3.5 Flash-Lite)**
  - **Procedure:**
    1. Input the following text into the prompt field:
       ```text
       Sisa 4 porsi gulai ayam santan pedas harga 22 ribu matang jam 12 siang tutup jam 9 malam
       ```
    2. Click `"Analisis dengan AI & Guardrail BPOM"`.
  - **Expected Result:**
    - Extracted entity name: `"Gulai Ayam Santan Pedas"`.
    - Extracted quantity: `4`.
    - Original base price: `Rp 22.000`.
    - Category classification: `"Makanan Berat (Lauk & Nasi)"`.
    - Dynamic discount calculated within range: `50% - 60%`.

- [x] **TC-MERCH-03: Offline Fallback Parser Resilience**
  - **Procedure:**
    1. Test irregular or abbreviated colloquial input:
       ```text
       Nasi goreng spesial sisa 3 porsi harga 15k baru matang
       ```
    2. Trigger analysis.
  - **Expected Result:**
    - Regex parser accurately extracts currency (`15k` -> `Rp 15.000`) and quantity (`3 porsi` -> `3`) even if external LLM latency triggers fallback.

- [x] **TC-MERCH-04: Master Catalog Enrollment ("Simpan ke Buku Menu")**
  - **Procedure:**
    1. Following a compliant AI extraction result, inspect the verification card.
    2. Click `"Simpan ke Buku Menu"`.
    3. Switch to the `"Kelola Menu Toko"` tab.
  - **Expected Result:**
    - Dish is persisted permanently into the store master menu SQLite table (`storemenuitem`).

- [x] **TC-MERCH-05: Routine Catalog Quick Batch Modal (Dual Dropdown 24h & Portion Variants)**
  - **Procedure:**
    1. Navigate to tab `"Pilih Menu Rutin Gerai"`.
    2. Select a pre-registered item (e.g., *Ayam Bakar Madu*).
    3. In the batch configuration modal:
       - Adjust portion stepper to `3`.
       - Select portion variant: `"Besar / Jumbo"`.
       - Click `"Waktu Sekarang"` to synchronize cooking timestamp with local clock.
    4. Click `"Terbitkan Listing Sekarang"`.
  - **Expected Result:**
    - Modal provides separate 24-hour dropdowns for hours (00-23) and minutes (00-55).
    - Room temperature duration evaluates as compliant (`[PASSED]`).
    - Listing appears immediately in the active inventory feed.

- [x] **TC-MERCH-06: Verification Card Text Input Preservation**
  - **Procedure:**
    1. Input text in the AI field and execute `"Analisis dengan AI & Guardrail BPOM"`.
    2. From the resulting confirmation card, click `"Ubah Input"`.
  - **Expected Result:**
    - Returns to input screen with the previously entered text completely preserved.

---

### SUITE 4: Deterministic BPOM Food Safety Guardrail (PerBPOM No. 16/2019)

- [x] **TC-BPOM-01: Toxic Chemical & Poison Rejection**
  - **Input Text:**
    ```text
    Ada sisa 2 bungkus racun tikus arsenik harga 10k baru matang
    ```
  - **Expected Result:**
    - Audit Status: `[REJECTED: BPOM COMPLIANCE VIOLATION]`.
    - Cause: Hazard detection flag triggered (`racun / arsenik`).
    - Publish action is locked: `[LOCKED: REJECTED BY BPOM GUARDRAIL]`.
    - `"Simpan ke Buku Menu"` button is suppressed.

- [x] **TC-BPOM-02: Non-Food Object / Battery Rejection**
  - **Input Text:**
    ```text
    Tersisa 3 pcs baterai panasonic bekas harga 15 ribu
    ```
  - **Expected Result:**
    - Audit Status: `[REJECTED: BPOM COMPLIANCE VIOLATION]`.
    - Cause: Non-food item detected (`baterai`).

- [x] **TC-BPOM-03: Prohibited Wildlife Meat Rejection**
  - **Input Text:**
    ```text
    Sate daging anjing bumbu kacang sisa 4 porsi baru matang 1 jam lalu
    ```
  - **Expected Result:**
    - Audit Status: `[REJECTED: BPOM COMPLIANCE VIOLATION]`.
    - Cause: Meat source violates public food consumption regulations.

- [x] **TC-BPOM-04: Substring False-Positive Prevention (Aglio Olio & Brokoli)**
  - **Input Text 1 (Aglio Olio):**
    ```text
    Ada 2 porsi Spaghetti Aglio Olio harga 25 ribu baru matang 1 jam lalu
    ```
  - **Input Text 2 (Tumis Brokoli):**
    ```text
    Ada tumis brokoli bawang putih sisa 3 porsi harga 15k baru masak 1 jam lalu
    ```
  - **Expected Result:**
    - Both evaluate to `[PASSED: COMPLIANT / SAFE]`.
    - Keyword boundary rules prevent false-positive matches on substrings `olio` or `brokoli`.

- [x] **TC-BPOM-05: Colloquial Slang & Decimal Currency Parsing**
  - **Input Text:**
    ```text
    Ada roasted chicken sisa 3 packs gila sih ini harga 17.5k baru masak 1 jam lalu
    ```
  - **Expected Result:**
    - Normalized dish name: `"Roasted Chicken"` (slang phrase *"packs gila sih ini"* stripped).
    - Portions: `3`.
    - Price: `Rp 17.500`.
    - Audit Status: `[PASSED: COMPLIANT / SAFE]`.

- [x] **TC-BPOM-06: High-Risk Dairy/Coconut Milk 4.0-Hour Room Temperature Threshold**
  - **Scenario A (Expired):**
    - Input: `Klappertaart fla susu sisa 3 porsi matang 5 jam lalu harga 20k`
    - Result: `[REJECTED: BPOM COMPLIANCE VIOLATION]` (Storage time 5.0 h > 4.0 h limit).
  - **Scenario B (Safe):**
    - Input: `Klappertaart fla susu sisa 2 porsi matang 2 jam lalu harga 20k`
    - Result: `[PASSED: COMPLIANT / SAFE]` (Storage time 2.0 h <= 4.0 h limit).

- [x] **TC-BPOM-07: Medium-Risk 8.0-Hour Ceiling & Overnight Cooking Rejection**
  - **Input Text:**
    ```text
    Ada ayam bakar bumbu madu sisa 3 porsi masak jam 10 malam kemarin harga 25k
    ```
  - **Expected Result:**
    - Storage duration calculates to >= 25.0 hours.
    - Audit Status: `[REJECTED: BPOM COMPLIANCE VIOLATION]` (Exceeds 8.0 h limit).

- [x] **TC-BPOM-08: Future Cooking Timestamp Rejection**
  - **Input Text:**
    ```text
    Ada 4 porsi rendang daging sapi masak besok pagi harga 30k
    ```
  - **Expected Result:**
    - Audit Status: `[REJECTED: BPOM COMPLIANCE VIOLATION]`.
    - Cause: Cooking timestamp cannot occur in the future.

- [x] **TC-BPOM-09: Direct API Guardrail Enforcement**
  - **Procedure:**
    1. Attempt to send an HTTP `POST /api/v1/listings` request with a rejected dish payload directly to the API endpoint.
  - **Expected Result:**
    - Backend returns HTTP `400 Bad Request` with rejection details; invalid listings cannot bypass client controls.

---

### SUITE 5: Dynamic Pricing & Smart Mystery Bag Bundling

- [x] **TC-PRICING-01: Time-Decay Dynamic Pricing Calculation (50% - 70% Clamped)**
  - **Procedure:**
    1. Generate an item listing scheduled to close in 1 hour.
    2. Generate an item listing scheduled to close in 4 hours.
  - **Expected Result:**
    - Discount values are clamped strictly between 50% and 70%.
    - Items closer to the closing threshold receive a proportionally higher discount.

- [x] **TC-PRICING-02: Price-Locked Invariance**
  - **Procedure:**
    1. Publish a listing with dynamic discount set to 60% (Discounted price: `Rp 12.000`).
    2. Re-examine the active listing in the consumer feed 15 minutes later.
  - **Expected Result:**
    - Price remains fixed at `Rp 12.000`; dynamic recalculation ceases upon formal publication.

- [x] **TC-BUNDLE-01: Smart Mystery Bag Automatic Clustering**
  - **Procedure:**
    1. Ensure at least two active standalone listings have low stock (quantity 1 or 2).
    2. In the Merchant view, select `"Kelola Menu Toko"` and click `"Buat Paket Mystery Bag Otomatis"`.
  - **Expected Result:**
    - Backend groups the low-stock items into a bundled surprise package.
    - Aggressive discount rate (60% - 70%) is applied.
    - Mystery Bag listing is created with constituent items documented.

- [x] **TC-BUNDLE-02: Strict Shelf-Life Ceiling & Constituent Deactivation**
  - **Procedure:**
    1. Inspect a Mystery Bag composed of Item A (2.0 hours shelf life remaining) and Item B (5.0 hours remaining).
  - **Expected Result:**
    - The composite bundle inherits the most restrictive shelf-life limit (2.0 hours).
    - Constituent items are deactivated from the standalone listing feed.

- [x] **TC-BUNDLE-03: Ingredient Transparency & Allergen Tagging**
  - **Procedure:**
    1. In Consumer view, select category filter `"Mystery Bag"` and open the bundle details.
  - **Expected Result:**
    - Itemized breakdown displays constituent ingredients and applicable allergen badges (*Santan/Kelapa*, *Dairy*, *Gluten*, *Telur*).

---

### SUITE 6: Consumer Discovery, Geospatial Navigation, & Catalog Feed

- [x] **TC-CONS-01: Haversine Radius Filters (<500m, <1.5km, All)**
  - **Procedure:**
    1. In the Consumer feed, evaluate the three distance filter buttons:
       - Select `"< 500m (Jalan Kaki)"`.
       - Select `"< 1.5km (Motor)"`.
       - Select `"Semua"`.
  - **Expected Result:**
    - `< 500m`: Displays only Kantin FTUI (~110 m).
    - `< 1.5km`: Displays Kantin FTUI and Warkop Kutek (~780 m).
    - `Semua`: Displays all available stores, including Roti Unyil Margonda (~1.8 km).

- [x] **TC-CONS-02: Tokenized Keyword Search**
  - **Procedure:**
    1. Input non-consecutive keywords into the search bar: `rendang sapi`.
  - **Expected Result:**
    - Feed resolves to `"Rendang Daging Sapi"` regardless of word order.

- [x] **TC-CONS-03: Leaflet Interactive Map & Google Maps External Navigation**
  - **Procedure:**
    1. Click `"Cek Merchant"` in the consumer header.
    2. Inspect user radius circle (500 m walking boundary).
    3. Click a store marker pin.
    4. In the resulting panel, click `"Buka Petunjuk Arah di Google Maps"`.
  - **Expected Result:**
    - OpenStreetMap tiles render correctly without external key failures.
    - External navigation link opens Google Maps routed to the store coordinates.

- [x] **TC-CONS-04: Closing Window Countdown Timer**
  - **Procedure:**
    1. Inspect any active listing card with an approaching closing window.
  - **Expected Result:**
    - Real-time countdown updates continuously (e.g., `Sisa 2j 15m`).

- [x] **TC-CONS-05: Viewport Adaptability (Desktop Grid vs Mobile PWA)**
  - **Procedure:**
    1. Inspect application layout at full desktop resolution (> 1024 px).
    2. Scale browser viewport down to mobile width (< 640 px).
  - **Expected Result:**
    - Desktop: Multi-column grid with persistent top navigation.
    - Mobile: Single-column ergonomic shell with fixed bottom navigation bar.

---

### SUITE 7: Order Lifecycle, Concurrency, & Atomic Transactions

- [x] **TC-ORD-01: Cash on Pickup Checkout & Atomic Stock Decrement**
  - **Procedure:**
    1. Select an item with stock = 5.
    2. Click `"Beli Porsi Ini"`.
    3. Select payment method: `"Bayar Tunai di Kasir"`.
    4. Click `"Konfirmasi Pemesanan"`.
  - **Expected Result:**
    - Order is confirmed; unique ticket `#NW-xxxx` is issued.
    - Stock quantity in SQLite table `itemlisting` decreases from 5 to 4.

- [x] **TC-ORD-02: Single-Modal QRIS Settlement**
  - **Procedure:**
    1. Select an item and proceed to checkout.
    2. Select `"QRIS Instan"`, then click `"Lanjut ke Pembayaran QRIS"`.
  - **Expected Result:**
    - Active modal transitions cleanly to display standard QR matrix and 15-minute countdown.
    - Backdrop remains single-layer without double-shadow rendering issues.
    - Clicking `"Saya Sudah Selesai Bayar via E-Wallet"` confirms ticket generation.

- [x] **TC-ORD-03: ISO/IEC 18004 Digital Pass `#NW-xxxx` & QR Matrix**
  - **Procedure:**
    1. Navigate to the `"Pesanan Saya"` tab and inspect the active ticket.
  - **Expected Result:**
    - High-contrast SVG QR Code matrix renders alongside ticket code `#NW-xxxx`.
    - Ticket state displays as `RESERVED`.

- [x] **TC-ORD-04: Atomic Order Cancellation & Inventory Restitution**
  - **Procedure:**
    1. On an active `RESERVED` ticket, click `"Batalkan Pesanan"`.
    2. Confirm the cancellation prompt.
    3. Check item inventory in the catalog feed.
  - **Expected Result:**
    - Ticket state transitions to `CANCELLED`.
    - Item inventory quantity increments by +1 immediately in SQLite.

- [x] **TC-ORD-05: Concurrency Control & Overselling Prevention**
  - **Procedure:**
    1. With 1 portion remaining for an item, execute concurrent checkout requests across two separate browser sessions.
  - **Expected Result:**
    - Initial transaction completes with HTTP 200.
    - Secondary transaction fails atomically with HTTP `409 Conflict` (`"Stok porsi tidak mencukupi atau sedang dipesan."`).
    - Inventory balance never falls below 0.

---

### SUITE 8: Cashier POS Operations & Anti-Fraud Security

- [x] **TC-POS-01: Cashier POS Daily Shift Summary Metrics**
  - **Procedure:**
    1. Under Merchant view, select tab `"Kasir QR"`.
    2. Review summary cards in the header.
  - **Expected Result:**
    - Displays three aggregated metrics:
      1. *Porsi Terselamatkan* (count of completed orders)
      2. *Wajib Setor Tunai* (reconciled cash receivable)
      3. *Lunas Digital (QRIS)* (settled electronic payments)

- [x] **TC-POS-02: Optical Webcam QR Scanner Verification (`html5-qrcode`)**
  - **Procedure:**
    1. Click `"Nyalakan Kamera Pemindai"` (grant browser webcam permissions).
    2. Present consumer ticket QR pass `#NW-xxxx` to the camera.
  - **Expected Result:**
    - Optical scanner decodes ticket payload `#NW-xxxx`.
    - Prompts verification dialog displaying order items and settlement method.
    - Confirming verification transitions order to `COMPLETED`.

- [x] **TC-POS-03: Manual Ticket Code Entry**
  - **Procedure:**
    1. In the manual verification field, input ticket code `#NW-xxxx`.
    2. Click `"Verifikasi & Serah Terima"`.
  - **Expected Result:**
    - System validates order identity and transitions status to `COMPLETED`.

- [x] **TC-POS-04: Anti Double-Redemption Protection**
  - **Procedure:**
    1. Attempt to scan or enter the same completed ticket code `#NW-xxxx` a second time.
  - **Expected Result:**
    - System rejects transaction with HTTP 400:
      `Tiket #NW-xxxx sudah selesai diserahkan sebelumnya (COMPLETED). Tidak dapat ditukarkan ulang.`
    - Metrics and inventory remain unaffected.

- [x] **TC-POS-05: Unauthorized Cross-Store Redemption Prevention**
  - **Procedure:**
    1. Generate an order for store `FTUI-001` (ticket `#NW-7788`).
    2. Switch merchant session to store `KUTEK-007`.
    3. Attempt to redeem ticket `#NW-7788` from the Kutek Cashier interface.
  - **Expected Result:**
    - System rejects transaction with HTTP 403 Forbidden:
      `[SECURITY ALERT: UNAUTHORIZED CROSS-STORE REDEMPTION] Tiket #NW-7788 adalah pesanan milik gerai Dapur Barokah FTUI, bukan gerai Anda.`

- [x] **TC-POS-06: Real-Time Consumer Ticket Live Polling (3.5s Interval)**
  - **Procedure:**
    1. Open consumer device to `"Pesanan Saya"` displaying an active `RESERVED` ticket.
    2. Complete cashier verification on merchant device.
    3. Observe consumer screen without manual page refresh.
  - **Expected Result:**
    - Within 3.5 seconds, consumer ticket badge updates automatically to `COMPLETED`.

---

### SUITE 9: Dynamic Menu Image System & Adaptive Presentation

- [x] **TC-IMG-01: Merchant Catalog Photo Upload & Client-Side Canvas Compression**
  - **Procedure:**
    1. In Merchant view, click `"Kelola Buku Menu"`.
    2. In the "Tambah Hidangan Rutin ke Katalog" form, enter dish name, normal price, and raw food photo (>2 MB).
    3. Observe client-side compression indicator and photo preview thumbnail ($64 \times 64\text{ px}$).
    4. Click `"Simpan ke Buku Menu"`.
  - **Expected Result:**
    - HTML5 Canvas automatically resizes image to maximum $800 \times 800\text{ px}$ in WebP format ($0.8$ quality) with file size reduced to $\approx 50\text{--}150\text{ KB}$.
    - `POST /api/v1/upload-image` responds with HTTP 200 and image URL.
    - Dish is registered with `image_url` and appears in the menu catalog list displaying a $48 \times 48\text{ px}$ thumbnail.

- [x] **TC-IMG-02: Dual-Mode Upload Engine & Graceful Local Static Fallback**
  - **Procedure:**
    1. Send a `POST /api/v1/upload-image` request without active Cloudinary credentials (or simulate network timeout).
    2. Inspect response payload and storage location.
    3. Send a request with an invalid file format (e.g. `.txt` disguised as `.png` with invalid magic bytes).
  - **Expected Result:**
    - Valid image is stored in `backend/static/uploads/<uuid>.<ext>` and served via FastAPI StaticFiles with response `{"storage_mode": "local", "image_url": "/static/uploads/..."}`.
    - Invalid file or corrupted magic bytes is rejected with HTTP 400 Bad Request (`Header biner file tidak cocok`).

- [x] **TC-IMG-03: Listing Publication Image Inheritance vs. Ad-Hoc Null Fallback**
  - **Procedure:**
    1. Publish a surplus listing from a catalog menu item that has an official `image_url` (via batch modal or voice AI matching catalog).
    2. Publish an ad-hoc uncataloged dish via voice/text AI (`ADHOC_COMPLETE`).
    3. Inspect both items in `GET /api/v1/listings/active`.
  - **Expected Result:**
    - Catalog listing inherits `image_url` from `StoreMenuItem` without merchant manual re-entry.
    - Ad-hoc listing has `image_url: null` without synthetic/generic stock photo guessing.
    - Mystery Bag bundle retains `/assets/foods/mystery_bag.jpg`.

- [x] **TC-IMG-04: Consumer Discovery Feed Adaptive Card Presentation**
  - **Procedure:**
    1. Open consumer feed (`ConsumerFeedScreen.tsx`) containing both catalog items with images and ad-hoc items without images.
    2. Inspect visual rendering of each card layout.
  - **Expected Result:**
    - Items with valid `image_url`: Render full photo banner (`h-44`) with stock pill and discount badge overlay.
    - Items with `image_url: null` (or broken image triggering `onError`): Render sleek compact card layout without image banner; stock pill and discount badge adapt seamlessly under store header without broken layout or empty gap.

- [x] **TC-IMG-05: Order Ticket Snapshot & Cashier POS Thumbnail Verification**
  - **Procedure:**
    1. Reserve an item that has an `image_url`.
    2. Open `"Pesanan Saya"` tab on consumer view.
    3. Open `"Kasir QR"` on merchant view and complete cashier verification for the ticket.
  - **Expected Result:**
    - `OrderTicket` snapshots `image_url` at reservation time and preserves it even if catalog photo changes later.
    - Consumer order ticket renders a clean $64 \times 64\text{ px}$ rounded thumbnail beside the dish name.
    - Cashier success verification dialog and cashier queue render the image thumbnail beside item details.

---

### SUITE 10: System Hardening, Security & Production UX Polish

- [x] **TC-HARD-01: Merchant Preview Live Countdown & Photo Replace/Remove Controls**
  - **Procedure:**
    1. Log in as `FTUI-001` (`PIN: 1234`), open `"Input Suara / Menu Spesial AI"`, analyze a compliant dish (`e.g., "Sisa 3 porsi Ayam Bakar Madu harga 25k baru matang"`).
    2. On the preview card (`MerchantPreviewScreen`), observe `"Sisa waktu tutup toko:"` for 5 seconds without clicking anything.
    3. Click `"Ganti Foto"`, upload a valid `.jpg`/`.png`/`.webp` image, and observe the preview thumbnail.
    4. Click `"Hapus Foto"`, then publish via `"1-Tap Terbitkan Listing Resmi"`.
  - **Expected Result:**
    - `"Sisa waktu tutup toko:"` decrements live every second (`X menit YY detik` or `CLOSED (Toko Tutup)`).
    - `"Ganti Foto"` compresses and uploads the image immediately, showing `"Foto baru berhasil diunggah"`.
    - `"Hapus Foto"` clears the thumbnail back to `"Tanpa Foto Khusus"` and publishes cleanly with `image_url: null`.

- [x] **TC-HARD-02: Merchant Registration Dynamic Coordinates & Validation (`422`)**
  - **Procedure:**
    1. Open `"Ganti Akun"` -> `"Mitra Toko"` -> `"Daftarkan Gerai Baru"`.
    2. Inspect closing time format validation: via UI or `POST /api/v1/auth/merchant-register`, test invalid `closing_time` (`25:99`) and invalid non-numeric or short PIN (`abc` / `12`).
    3. Complete a valid store registration with a real physical address (`>= 10` chars) and PIN `1234`, then publish a dish from that new store.
  - **Expected Result:**
    - Invalid `closing_time` or malformed PIN is rejected cleanly (`HTTP 422 Unprocessable Entity` from API validation).
    - Published listing binds the newly registered store's `location_name`, `latitude`, and `longitude` dynamically instead of defaulting to `FTUI-001`.

- [x] **TC-HARD-03: Consumer Account Persistence & 1-Tap Quick Selector**
  - **Procedure:**
    1. Open `"Konsumen"` -> `"Masuk Akun"`.
    2. Confirm `"Ingat Nomor di Perangkat Ini"` is checked, enter `0812-8899-0011`, and click `"Masuk & Jelajah Surplus"`.
    3. Test invalid phone format validation via `POST /api/v1/auth/consumer-login` or UI (`12345`).
    4. Click `"Ganti Akun"`, switch back to `"Konsumen"` -> `"Masuk Akun"`.
  - **Expected Result:**
    - Malformed phone numbers fail validation (`HTTP 422`).
    - Returning to consumer login displays `"Pilih Cepat Akun Anda"` with chip `Budi Santoso · 0812-8899-0011` persisted in `localStorage` (`nullwasted_saved_consumer`), and clicking it populates the phone field immediately.

- [x] **TC-HARD-04: Persistent Consumer Bookmarks & Priority Top-Sorting**
  - **Procedure:**
    1. On the Consumer discovery feed (`ConsumerFeedScreen`), click the heart bookmark button (`aria-label="Bookmark store"`) on a card lower in the list (e.g., an item from `MARGONDA-042`).
    2. Reload the browser (`F5` / hard refresh) and return to the Consumer feed.
  - **Expected Result:**
    - Heart icon turns solid rose (`aria-pressed="true"`).
    - Bookmark list persists in `localStorage` under `nullwasted_favorite_listings`.
    - Favorited listings automatically sort to the top of the discovery grid ahead of non-favorited closer stores.

- [x] **TC-HARD-05: Beverage Keyword Filter, Bundle Isolation & Live Browser GPS Toggle**
  - **Procedure:**
    1. In Consumer feed, click `"Beverages"` filter pill, then `"Meals"`, `"Bakery"`, and `"Mystery Bag"`.
    2. Inspect header location toggle pills: switch from `"Mode Demo FTUI"` to `"Gunakan Lokasi Saya"`, then switch back to `"Mode Demo FTUI"`.
  - **Expected Result:**
    - `"Beverages"` surfaces drinks matching `BEVERAGES` category or beverage keywords (`kopi`, `susu`, `teh`, `jus`, `matcha`, `latte`, `boba`, etc.) while hiding `Mystery Bag` bundles.
    - `"Meals"` and `"Bakery"` exclude `is_bundle` listings (`!item.is_bundle`), while `"Mystery Bag"` displays bundles only.
    - `"Gunakan Lokasi Saya"` invokes `navigator.geolocation.getCurrentPosition`, updates Haversine distances (showing fallback notice if GPS permission is denied or `> 3km` from campus UI), and `"Mode Demo FTUI"` restores the default anchor (`-6.3626, 106.8240`).

- [x] **TC-HARD-06: Bilingual Fusion RAG Matching (`100` Dishes) & Bidirectional Slang Stripping**
  - **Procedure:**
    1. On Merchant `"Input Suara / Menu Spesial AI"`, test English/fusion dishes such as:
       - `Ada 3 porsi Chicken Katsu Curry harga 28k baru masak 1 jam lalu`
       - `Ada 2 porsi Spaghetti Carbonara Cream Sauce baru matang 1 jam lalu harga 35k`
    2. Test bidirectional colloquial filler text + decimal time:
       - `Eh ini enak banget roasted chicken sisa 3 packs gila sih harga 17.5k baru masak jam 14.30 sore`
  - **Expected Result:**
    - `100`-dish semantic knowledge base + bilingual token mapper resolves fusion dishes cleanly (`HIGH_PERISHABILITY` `4.0` jam for cream-based `Carbonara` vs appropriate BPOM category for `Chicken Katsu`).
    - Filler slang phrases at both prefix and suffix are stripped, leaving a clean dish title, `quantity: 3`, and `original_price: 17500`.

- [x] **TC-HARD-07: Direct Publish Spoilage Guardrail & Catalog Name Preservation**
  - **Procedure:**
    1. Ensure store `FTUI-001` has catalog menu items (e.g., `Rendang Daging Sapi`). Analyze a specific ad-hoc variant like `Rendang Paru Balado sisa 2 porsi harga 28k baru masak 1 jam lalu`.
    2. Attempt via Swagger (`/docs` -> `POST /api/v1/listings`) or API client to publish a stale item where `hours_since_cooked` exceeds `bpom_max_hours` (e.g., `5.0 > 4.0` for `HIGH_PERISHABILITY`).
  - **Expected Result:**
    - Specific dish names (`Rendang Paru Balado`) are preserved without blind generic catalog overwrite unless primary noun + tokens genuinely match.
    - Backend publish guardrail rejects spoiled listings with `HTTP 400 Bad Request` (`evaluate_food_safety` enforced server-side).

- [x] **TC-HARD-08: Dual-Condition `expires_at` Feed Hiding & Cancelled-Order Expiry Guard**
  - **Procedure:**
    1. Publish a fresh listing and inspect `expires_at` returned by `POST /api/v1/listings` (computed from `min(food_expiry_dt, closing_dt)` with midnight-crossing rollover support).
    2. Simulate an expired listing (`expires_at <= now` in SQLite or via test scenario) after a consumer has placed an order, then call `GET /api/v1/listings/active` and cancel that order.
  - **Expected Result:**
    - Expired listings (`expires_at <= now`) are excluded from `GET /api/v1/listings/active`.
    - Cancelling an order (`POST /api/v1/orders/{id}/cancel`) restores `quantity` on the row but **never** sets `is_active = True` once `now >= expires_at`.

- [x] **TC-HARD-09: Cashier Short-Code Normalization & Optional JWT Role/Store Isolation**
  - **Procedure:**
    1. Reserve an order (`#NW-XXXX`) for `FTUI-001`.
    2. In `"Kasir QR"`, enter only the 4 digits (e.g. `4821` or `#4821` without `#NW-`) and click `"Verifikasi & Serah Terima"`.
    3. Attempt via API (`POST /api/v1/orders/complete-pickup` or `POST /api/v1/listings`) using a Consumer Bearer JWT or another store's (`KUTEK-007`) Bearer JWT.
  - **Expected Result:**
    - Cashier normalizes bare `4821`, `#4821`, `NW-4821`, and `#NW-4821` uniformly and transitions the ticket to `COMPLETED`.
    - Authenticated requests with mismatched `role` or `store_id` in the JWT fail with `HTTP 403 Forbidden`.

- [x] **TC-HARD-10: Cross-Origin CORS Credentials Compliance (`localhost` / LAN)**
  - **Procedure:**
    1. Interact across Merchant login, AI draft analysis, image upload, and Consumer checkout from `http://localhost:5173` against `http://127.0.0.1:8000` with Chrome DevTools Network & Console open.
  - **Expected Result:**
    - All API preflight (`OPTIONS`) and credentialed `POST`/`GET` requests return valid `Access-Control-Allow-Origin` headers matching `allow_origin_regex` (`^https?://.*`) without W3C wildcard-with-credentials console errors.

---

## 4. Acceptance Sign-Off Matrix

| Suite | Functional Domain | Tester | Date | Verdict |
| :--- | :--- | :--- | :---: | :---: |
| **Suite 1** | Automated Suite & Build (`42` pytest + `vite build`) | | | [ ] PASS / [ ] FAIL |
| **Suite 2** | Multi-Tenant Authentication | | | [ ] PASS / [ ] FAIL |
| **Suite 3** | Merchant Operations & AI Assistant | | | [ ] PASS / [ ] FAIL |
| **Suite 4** | BPOM Food Safety Guardrail | | | [ ] PASS / [ ] FAIL |
| **Suite 5** | Pricing & Bundling Engine | | | [ ] PASS / [ ] FAIL |
| **Suite 6** | Consumer Discovery & Maps | | | [ ] PASS / [ ] FAIL |
| **Suite 7** | Order Lifecycle & Transactions | | | [ ] PASS / [ ] FAIL |
| **Suite 8** | Cashier POS & Anti-Fraud Security | | | [ ] PASS / [ ] FAIL |
| **Suite 9** | Dynamic Menu Image & Adaptive UI | | | [ ] PASS / [ ] FAIL |
| **Suite 10** | System Hardening, Security & UX Polish | | | [ ] PASS / [ ] FAIL |

---

*NullWasted Engineering Specification — Standard Verification Protocol.*
