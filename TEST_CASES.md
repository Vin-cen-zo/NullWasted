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
| **Merchant** | Dapur Barokah FTUI | `FTUI-001` | `1234` | ~110 m (FTUI Dekanat) |
| **Merchant** | Warkop Berkah Kutek | `KUTEK-007` | `1234` | ~780 m (Kutek) |
| **Merchant** | Roti Unyil Margonda | `MARGONDA-002` | `1234` | ~1.8 km (Margonda Raya) |
| **Consumer** | Primary Test User | `0812-8899-0011` | Direct Session Verification | User Reference Node |

---

## 2. Test Execution Matrix

| Suite | Category | Functional Scope | Case Count |
| :--- | :--- | :--- | :---: |
| **Suite 1** | Automated Suite | Pytest unit/integration tests and Vite TypeScript compilation | 3 |
| **Suite 2** | Authentication | Merchant onboarding, session caching, and consumer verification | 4 |
| **Suite 3** | Merchant Operations | Speech recognition, AI entity extraction, and catalog batching | 6 |
| **Suite 4** | Safety Guardrail | PerBPOM No. 16/2019 semantic RAG, poison filtering, and time decay | 9 |
| **Suite 5** | Pricing & Bundling | Algorithmic time-decay discount and multi-item Mystery Bag bundling | 5 |
| **Suite 6** | Consumer Discovery | Geospatial Haversine radius, interactive maps, and feed filtering | 5 |
| **Suite 7** | Order Lifecycle | Atomic inventory transactions, QRIS single-modal, and QR pass generation | 5 |
| **Suite 8** | Cashier POS | Optical webcam decoding, POS shift summaries, and anti-fraud checks | 6 |
| **Total** | | **Comprehensive System Scope** | **43 Cases** |

---

## 3. Detailed Test Suites

---

### SUITE 1: Automated Verification & Build Hygiene

- [ ] **TC-AUTO-01: Backend Pytest Suite Execution**
  - **Command:**
    ```powershell
    cd backend
    py -m pytest tests/test_unit_core.py -v
    ```
  - **Expected Result:**
    - All 30 test cases pass (`30 passed`).
    - Exit code: `0`.
    - Verification includes Guardrail RAG, Dynamic Pricing clamping, Mystery Bag clustering, and ticket status machines.

- [ ] **TC-AUTO-02: Frontend Production Build Compilation**
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

- [ ] **TC-AUTH-01: Merchant Self-Service Registration with Custom Category**
  - **Procedure:**
    1. Open `http://localhost:5173`, click `"Ganti Akun"`, select `"Mitra Toko"`, and open sub-tab `"Daftarkan Gerai Baru"`.
    2. Under Category, select `"Lainnya (Tulis Sendiri)..."`.
    3. Input custom category: `Dimsum & Bento Specialist`.
    4. Input store name: `Kantin Dekanat Baru`.
    5. Input store address: `Gedung Dekanat FTUI Lantai 1` (must be >= 10 characters).
    6. Input 4-digit PIN: `9999`, then click `"Daftarkan Gerai Saya"`.
  - **Expected Result:**
    - Registration completes successfully; system allocates a unique Store ID (`STORE-xxxx`).
    - Session initiates automatically as the newly registered merchant.

- [ ] **TC-AUTH-02: Merchant Credential Persistence & Quick Selector**
  - **Procedure:**
    1. On the Merchant Login tab, enable the checkbox `"Ingat Kredensial di Perangkat Ini"`.
    2. Input `Store ID: FTUI-001` and `PIN: 1234`, then click `"Masuk ke Dapur Mitra"`.
    3. Click `"Ganti Akun"` to log out, then return to the Merchant tab.
  - **Expected Result:**
    - Quick selection card displays stored account chip: `FTUI-001 · Dapur Barokah FTUI`.
    - Selecting the chip automatically populates Store ID and PIN inputs.

- [ ] **TC-AUTH-03: Consumer Phone Authentication**
  - **Procedure:**
    1. In the account dialog, select the `"Konsumen"` tab.
    2. Input WhatsApp phone number: `0812-8899-0011`.
    3. Click `"Lanjutkan ke Katalog"`.
  - **Expected Result:**
    - Consumer session initializes immediately without requiring external OTP mock gates; navigation directs to the discovery feed.

- [ ] **TC-AUTH-04: Stateless Role Transition**
  - **Procedure:**
    1. From an active Consumer session, click `"Ganti Akun"`.
    2. Log in using Merchant credentials.
    3. Verify available tabs correspond strictly to Merchant kitchen operations (`"Input Suara / AI"`, `"Menu Rutin"`, `"Kelola Menu"`, `"Kasir QR"`).
  - **Expected Result:**
    - Session transitions without state pollution or lingering cross-role permissions.

---

### SUITE 3: Merchant Kitchen Operations & AI Store Assistant

- [ ] **TC-MERCH-01: Native Web Speech Recognition (Indonesian Language)**
  - **Procedure:**
    1. On Merchant tab, select `"Input Suara / Menu Spesial AI"`.
    2. Click `"Mulai Dikte Suara"` (grant browser microphone access).
    3. Speak: *"Ada rendang sapi sisa lima porsi baru matang jam dua siang harga tiga puluh ribu"*.
    4. Click `"Selesai & Kirim ke AI"`.
  - **Expected Result:**
    - Transcribed text renders directly into the input area in real time via the native W3C Speech Recognition interface.

- [ ] **TC-MERCH-02: Colloquial Natural Language Extraction (Gemini 3.5 Flash-Lite)**
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

- [ ] **TC-MERCH-03: Offline Fallback Parser Resilience**
  - **Procedure:**
    1. Test irregular or abbreviated colloquial input:
       ```text
       Nasi goreng spesial sisa 3 porsi harga 15k baru matang
       ```
    2. Trigger analysis.
  - **Expected Result:**
    - Regex parser accurately extracts currency (`15k` -> `Rp 15.000`) and quantity (`3 porsi` -> `3`) even if external LLM latency triggers fallback.

- [ ] **TC-MERCH-04: Master Catalog Enrollment ("Simpan ke Buku Menu")**
  - **Procedure:**
    1. Following a compliant AI extraction result, inspect the verification card.
    2. Click `"Simpan ke Buku Menu"`.
    3. Switch to the `"Kelola Menu Toko"` tab.
  - **Expected Result:**
    - Dish is persisted permanently into the store master menu SQLite table (`storemenuitem`).

- [ ] **TC-MERCH-05: Routine Catalog Quick Batch Modal (Dual Dropdown 24h & Portion Variants)**
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

- [ ] **TC-MERCH-06: Verification Card Text Input Preservation**
  - **Procedure:**
    1. Input text in the AI field and execute `"Analisis dengan AI & Guardrail BPOM"`.
    2. From the resulting confirmation card, click `"Ubah Input"`.
  - **Expected Result:**
    - Returns to input screen with the previously entered text completely preserved.

---

### SUITE 4: Deterministic BPOM Food Safety Guardrail (PerBPOM No. 16/2019)

- [ ] **TC-BPOM-01: Toxic Chemical & Poison Rejection**
  - **Input Text:**
    ```text
    Ada sisa 2 bungkus racun tikus arsenik harga 10k baru matang
    ```
  - **Expected Result:**
    - Audit Status: `[REJECTED: BPOM COMPLIANCE VIOLATION]`.
    - Cause: Hazard detection flag triggered (`racun / arsenik`).
    - Publish action is locked: `[LOCKED: REJECTED BY BPOM GUARDRAIL]`.
    - `"Simpan ke Buku Menu"` button is suppressed.

- [ ] **TC-BPOM-02: Non-Food Object / Battery Rejection**
  - **Input Text:**
    ```text
    Tersisa 3 pcs baterai panasonic bekas harga 15 ribu
    ```
  - **Expected Result:**
    - Audit Status: `[REJECTED: BPOM COMPLIANCE VIOLATION]`.
    - Cause: Non-food item detected (`baterai`).

- [ ] **TC-BPOM-03: Prohibited Wildlife Meat Rejection**
  - **Input Text:**
    ```text
    Sate daging anjing bumbu kacang sisa 4 porsi baru matang 1 jam lalu
    ```
  - **Expected Result:**
    - Audit Status: `[REJECTED: BPOM COMPLIANCE VIOLATION]`.
    - Cause: Meat source violates public food consumption regulations.

- [ ] **TC-BPOM-04: Substring False-Positive Prevention (Aglio Olio & Brokoli)**
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

- [ ] **TC-BPOM-05: Colloquial Slang & Decimal Currency Parsing**
  - **Input Text:**
    ```text
    Ada roasted chicken sisa 3 packs gila sih ini harga 17.5k baru masak 1 jam lalu
    ```
  - **Expected Result:**
    - Normalized dish name: `"Roasted Chicken"` (slang phrase *"packs gila sih ini"* stripped).
    - Portions: `3`.
    - Price: `Rp 17.500`.
    - Audit Status: `[PASSED: COMPLIANT / SAFE]`.

- [ ] **TC-BPOM-06: High-Risk Dairy/Coconut Milk 4.0-Hour Room Temperature Threshold**
  - **Scenario A (Expired):**
    - Input: `Klappertaart fla susu sisa 3 porsi matang 5 jam lalu harga 20k`
    - Result: `[REJECTED: BPOM COMPLIANCE VIOLATION]` (Storage time 5.0 h > 4.0 h limit).
  - **Scenario B (Safe):**
    - Input: `Klappertaart fla susu sisa 2 porsi matang 2 jam lalu harga 20k`
    - Result: `[PASSED: COMPLIANT / SAFE]` (Storage time 2.0 h <= 4.0 h limit).

- [ ] **TC-BPOM-07: Medium-Risk 8.0-Hour Ceiling & Overnight Cooking Rejection**
  - **Input Text:**
    ```text
    Ada ayam bakar bumbu madu sisa 3 porsi masak jam 10 malam kemarin harga 25k
    ```
  - **Expected Result:**
    - Storage duration calculates to >= 25.0 hours.
    - Audit Status: `[REJECTED: BPOM COMPLIANCE VIOLATION]` (Exceeds 8.0 h limit).

- [ ] **TC-BPOM-08: Future Cooking Timestamp Rejection**
  - **Input Text:**
    ```text
    Ada 4 porsi rendang daging sapi masak besok pagi harga 30k
    ```
  - **Expected Result:**
    - Audit Status: `[REJECTED: BPOM COMPLIANCE VIOLATION]`.
    - Cause: Cooking timestamp cannot occur in the future.

- [ ] **TC-BPOM-09: Direct API Guardrail Enforcement**
  - **Procedure:**
    1. Attempt to send an HTTP `POST /api/v1/listings` request with a rejected dish payload directly to the API endpoint.
  - **Expected Result:**
    - Backend returns HTTP `400 Bad Request` with rejection details; invalid listings cannot bypass client controls.

---

### SUITE 5: Dynamic Pricing & Smart Mystery Bag Bundling

- [ ] **TC-PRICING-01: Time-Decay Dynamic Pricing Calculation (50% - 70% Clamped)**
  - **Procedure:**
    1. Generate an item listing scheduled to close in 1 hour.
    2. Generate an item listing scheduled to close in 4 hours.
  - **Expected Result:**
    - Discount values are clamped strictly between 50% and 70%.
    - Items closer to the closing threshold receive a proportionally higher discount.

- [ ] **TC-PRICING-02: Price-Locked Invariance**
  - **Procedure:**
    1. Publish a listing with dynamic discount set to 60% (Discounted price: `Rp 12.000`).
    2. Re-examine the active listing in the consumer feed 15 minutes later.
  - **Expected Result:**
    - Price remains fixed at `Rp 12.000`; dynamic recalculation ceases upon formal publication.

- [ ] **TC-BUNDLE-01: Smart Mystery Bag Automatic Clustering**
  - **Procedure:**
    1. Ensure at least two active standalone listings have low stock (quantity 1 or 2).
    2. In the Merchant view, select `"Kelola Menu Toko"` and click `"Buat Paket Mystery Bag Otomatis"`.
  - **Expected Result:**
    - Backend groups the low-stock items into a bundled surprise package.
    - Aggressive discount rate (60% - 70%) is applied.
    - Mystery Bag listing is created with constituent items documented.

- [ ] **TC-BUNDLE-02: Strict Shelf-Life Ceiling & Constituent Deactivation**
  - **Procedure:**
    1. Inspect a Mystery Bag composed of Item A (2.0 hours shelf life remaining) and Item B (5.0 hours remaining).
  - **Expected Result:**
    - The composite bundle inherits the most restrictive shelf-life limit (2.0 hours).
    - Constituent items are deactivated from the standalone listing feed.

- [ ] **TC-BUNDLE-03: Ingredient Transparency & Allergen Tagging**
  - **Procedure:**
    1. In Consumer view, select category filter `"Mystery Bag"` and open the bundle details.
  - **Expected Result:**
    - Itemized breakdown displays constituent ingredients and applicable allergen badges (*Santan/Kelapa*, *Dairy*, *Gluten*, *Telur*).

---

### SUITE 6: Consumer Discovery, Geospatial Navigation, & Catalog Feed

- [ ] **TC-CONS-01: Haversine Radius Filters (<500m, <1.5km, All)**
  - **Procedure:**
    1. In the Consumer feed, evaluate the three distance filter buttons:
       - Select `"< 500m (Jalan Kaki)"`.
       - Select `"< 1.5km (Motor)"`.
       - Select `"Semua"`.
  - **Expected Result:**
    - `< 500m`: Displays only Kantin FTUI (~110 m).
    - `< 1.5km`: Displays Kantin FTUI and Warkop Kutek (~780 m).
    - `Semua`: Displays all available stores, including Roti Unyil Margonda (~1.8 km).

- [ ] **TC-CONS-02: Tokenized Keyword Search**
  - **Procedure:**
    1. Input non-consecutive keywords into the search bar: `rendang sapi`.
  - **Expected Result:**
    - Feed resolves to `"Rendang Daging Sapi"` regardless of word order.

- [ ] **TC-CONS-03: Leaflet Interactive Map & Google Maps External Navigation**
  - **Procedure:**
    1. Click `"Peta Gerai"` in the consumer header.
    2. Inspect user radius circle (500 m walking boundary).
    3. Click a store marker pin.
    4. In the resulting panel, click `"Buka Petunjuk Arah di Google Maps"`.
  - **Expected Result:**
    - OpenStreetMap tiles render correctly without external key failures.
    - External navigation link opens Google Maps routed to the store coordinates.

- [ ] **TC-CONS-04: Closing Window Countdown Timer**
  - **Procedure:**
    1. Inspect any active listing card with an approaching closing window.
  - **Expected Result:**
    - Real-time countdown updates continuously (e.g., `Sisa 2j 15m`).

- [ ] **TC-CONS-05: Viewport Adaptability (Desktop Grid vs Mobile PWA)**
  - **Procedure:**
    1. Inspect application layout at full desktop resolution (> 1024 px).
    2. Scale browser viewport down to mobile width (< 640 px).
  - **Expected Result:**
    - Desktop: Multi-column grid with persistent top navigation.
    - Mobile: Single-column ergonomic shell with fixed bottom navigation bar.

---

### SUITE 7: Order Lifecycle, Concurrency, & Atomic Transactions

- [ ] **TC-ORD-01: Cash on Pickup Checkout & Atomic Stock Decrement**
  - **Procedure:**
    1. Select an item with stock = 5.
    2. Click `"Beli Porsi Ini"`.
    3. Select payment method: `"Bayar Tunai di Kasir"`.
    4. Click `"Konfirmasi Pemesanan"`.
  - **Expected Result:**
    - Order is confirmed; unique ticket `#NW-xxxx` is issued.
    - Stock quantity in SQLite table `itemlisting` decreases from 5 to 4.

- [ ] **TC-ORD-02: Single-Modal QRIS Settlement**
  - **Procedure:**
    1. Select an item and proceed to checkout.
    2. Select `"QRIS Instan"`, then click `"Lanjut ke Pembayaran QRIS"`.
  - **Expected Result:**
    - Active modal transitions cleanly to display standard QR matrix and 15-minute countdown.
    - Backdrop remains single-layer without double-shadow rendering issues.
    - Clicking `"Saya Sudah Selesai Bayar via E-Wallet"` confirms ticket generation.

- [ ] **TC-ORD-03: ISO/IEC 18004 Digital Pass `#NW-xxxx` & QR Matrix**
  - **Procedure:**
    1. Navigate to the `"Pesanan Saya"` tab and inspect the active ticket.
  - **Expected Result:**
    - High-contrast SVG QR Code matrix renders alongside ticket code `#NW-xxxx`.
    - Ticket state displays as `RESERVED`.

- [ ] **TC-ORD-04: Atomic Order Cancellation & Inventory Restitution**
  - **Procedure:**
    1. On an active `RESERVED` ticket, click `"Batalkan Pesanan"`.
    2. Confirm the cancellation prompt.
    3. Check item inventory in the catalog feed.
  - **Expected Result:**
    - Ticket state transitions to `CANCELLED`.
    - Item inventory quantity increments by +1 immediately in SQLite.

- [ ] **TC-ORD-05: Concurrency Control & Overselling Prevention**
  - **Procedure:**
    1. With 1 portion remaining for an item, execute concurrent checkout requests across two separate browser sessions.
  - **Expected Result:**
    - Initial transaction completes with HTTP 200.
    - Secondary transaction fails with HTTP 400 or 409 (`"Stok porsi telah habis"`).
    - Inventory balance never falls below 0.

---

### SUITE 8: Cashier POS Operations & Anti-Fraud Security

- [ ] **TC-POS-01: Cashier POS Daily Shift Summary Metrics**
  - **Procedure:**
    1. Under Merchant view, select tab `"Kasir QR"`.
    2. Review summary cards in the header.
  - **Expected Result:**
    - Displays three aggregated metrics:
      1. *Porsi Terselamatkan* (count of completed orders)
      2. *Wajib Setor Tunai* (reconciled cash receivable)
      3. *Lunas Digital (QRIS)* (settled electronic payments)

- [ ] **TC-POS-02: Optical Webcam QR Scanner Verification (`html5-qrcode`)**
  - **Procedure:**
    1. Click `"Buka Scanner Kamera"` (grant browser webcam permissions).
    2. Present consumer ticket QR pass `#NW-xxxx` to the camera.
  - **Expected Result:**
    - Optical scanner decodes ticket payload `#NW-xxxx`.
    - Prompts verification dialog displaying order items and settlement method.
    - Confirming verification transitions order to `COMPLETED`.

- [ ] **TC-POS-03: Manual Ticket Code Entry**
  - **Procedure:**
    1. In the manual verification field, input ticket code `#NW-xxxx`.
    2. Click `"Verifikasi & Selesaikan"`.
  - **Expected Result:**
    - System validates order identity and transitions status to `COMPLETED`.

- [ ] **TC-POS-04: Anti Double-Redemption Protection**
  - **Procedure:**
    1. Attempt to scan or enter the same completed ticket code `#NW-xxxx` a second time.
  - **Expected Result:**
    - System rejects transaction with HTTP 400:
      `Tiket #NW-xxxx sudah selesai diserahkan sebelumnya (COMPLETED). Tidak dapat ditukarkan ulang.`
    - Metrics and inventory remain unaffected.

- [ ] **TC-POS-05: Unauthorized Cross-Store Redemption Prevention**
  - **Procedure:**
    1. Generate an order for store `FTUI-001` (ticket `#NW-7788`).
    2. Switch merchant session to store `KUTEK-007`.
    3. Attempt to redeem ticket `#NW-7788` from the Kutek Cashier interface.
  - **Expected Result:**
    - System rejects transaction with HTTP 403 Forbidden:
      `[SECURITY ALERT: UNAUTHORIZED CROSS-STORE REDEMPTION] Tiket #NW-7788 adalah pesanan milik gerai Dapur Barokah FTUI, bukan gerai Anda.`

- [ ] **TC-POS-06: Real-Time Consumer Ticket Live Polling (3.5s Interval)**
  - **Procedure:**
    1. Open consumer device to `"Pesanan Saya"` displaying an active `RESERVED` ticket.
    2. Complete cashier verification on merchant device.
    3. Observe consumer screen without manual page refresh.
  - **Expected Result:**
    - Within 3.5 seconds, consumer ticket badge updates automatically to `COMPLETED`.

---

## 4. Acceptance Sign-Off Matrix

| Suite | Functional Domain | Tester | Date | Verdict |
| :--- | :--- | :--- | :---: | :---: |
| **Suite 1** | Automated Suite & Build | | | [ ] PASS / [ ] FAIL |
| **Suite 2** | Multi-Tenant Authentication | | | [ ] PASS / [ ] FAIL |
| **Suite 3** | Merchant Operations & AI Assistant | | | [ ] PASS / [ ] FAIL |
| **Suite 4** | BPOM Food Safety Guardrail | | | [ ] PASS / [ ] FAIL |
| **Suite 5** | Pricing & Bundling Engine | | | [ ] PASS / [ ] FAIL |
| **Suite 6** | Consumer Discovery & Maps | | | [ ] PASS / [ ] FAIL |
| **Suite 7** | Order Lifecycle & Transactions | | | [ ] PASS / [ ] FAIL |
| **Suite 8** | Cashier POS & Anti-Fraud Security | | | [ ] PASS / [ ] FAIL |

---

*NullWasted Engineering Specification — Standard Verification Protocol.*
