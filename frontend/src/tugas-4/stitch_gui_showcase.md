# NullWasted Mobile PWA — Google Stitch GUI Showcase & Interactive HTML Preview

> **Project Name:** NullWasted (Surplus Food Marketplace Platform)  
> **Target Audience:** Consumer Savers (Depok area) & Local Food Merchants (Bakeries, Cafes, Bento)  
> **Design Theme:** **Earth Tone Light Mode** (Linen Oat Milk `#F8F6F0`, Natural White `#FFFFFF`, Botanical Emerald `#10B981` / `#059669`, Roasted Charcoal `#1F1D1A`)  
> **Template Reference:** Sesuai persis dengan template & color palette **Frame 1 Figma**  
> **Interactive Preview Hub:** [`preview_all_screens.html`](preview_all_screens.html)  
> **Folder Berkas HTML:** [`stitch_screens_html/`](stitch_screens_html/)

---

## 1. Interactive HTML Preview Hub (Solusi Kuota Figma)

Karena kuota impor plugin Figma (`html.to.design`) telah habis/terbatas, kami telah menyediakan **Interactive HTML Preview Hub** mandiri:
👉 **[Buka Hub Preview 8 Frame](preview_all_screens.html)**

### Fitur Preview Hub:
- **Tampilan Mobile Simulator (390px × 844px):** Menguji interaktivitas, scroll, dan layout mobile secara realistis di browser apa pun.
- **Tampilan Grid Galeri (All 8 Frames Side-by-Side):** Menjejerkan ke-8 frame secara simultan untuk memvalidasi keselarasan warna, tipografi, dan hierarki visual secara menyeluruh.
- **Navigasi Tab 1-Klik:** Berpindah antar frame dengan mulus tanpa memuat ulang browser.
- **Tombol Buka Tab Layar Penuh:** Membuka masing-masing frame di tab peramban baru.

---

## 2. Katalog Lengkap 8 Layar PWA (Earth Tone Light Mode)

Semua berkas di bawah ini telah diselaraskan dengan palet dan template Frame 1:

| No | Frame / Layar | Tautan Berkas HTML Lokal (Klik untuk Buka) | Deskripsi & Komponen Kunci |
| :---: | :--- | :--- | :--- |
| **1** | **Screen 1: Welcome & Mission Onboarding** | [`screen_1_welcome_onboarding.html`](stitch_screens_html/screen_1_welcome_onboarding.html) | Hero headline diskon 50%-70%, 3 pill kategori makanan, edukasi 3 pilar sistem, dan counter dampak komunitas (1.420+ kg & Rp 48.5M). |
| **2** | **Screen 2: Dual-Role Authentication** | [`screen_2_dual_role_auth.html`](stitch_screens_html/screen_2_dual_role_auth.html) | Segmented control peran ganda (Merchant vs Consumer Saver), formulir login/registrasi satu akun, dan badge transparansi data. |
| **3** | **Screen 3: Merchant Home & Voice Listing** | [`screen_3_merchant_home_voice.html`](stitch_screens_html/screen_3_merchant_home_voice.html) | Tombol rekam suara kilat 15 detik (Whisper AI), visualisator waveform audio dinamis, ringkasan stok aktif, dan quick action scanner. |
| **4** | **Screen 4: 1-Tap AI Listing Confirmation** | [`screen_4_1tap_listing_preview.html`](stitch_screens_html/screen_4_1tap_listing_preview.html) | Kartu verifikasi AI parsing teks/suara, slider diskon surplus (60%), verifikasi kepatuhan BPOM, dan tombol terbit 1-ketukan. |
| **5** | **Screen 5: Merchant Cashier QR Scanner** | [`screen_5_merchant_cashier_scanner.html`](stitch_screens_html/screen_5_merchant_cashier_scanner.html) | Viewfinder pemindai barcode kamera kasir, animasi laser scanbeam, input fallback manual NW-code, dan konfirmasi instan. |
| **6** | **Screen 6: Consumer Discovery Feed** | [`screen_6_consumer_discovery_feed.html`](stitch_screens_html/screen_6_consumer_discovery_feed.html) | Peta/katalog surplus sekitar geolokasi (radius 1 km), filter kategori, badge diskon 50%-70%, countdown jendela jemput, dan status BPOM. |
| **7** | **Screen 7: Item Detail & Reservation Modal** | [`screen_7_item_detail_reservation.html`](stitch_screens_html/screen_7_item_detail_reservation.html) | Galeri foto kuliner, informasi toko & jam jemput, rincian nutrisi/suhu simpan BPOM, selector kuantitas, dan sheet reservasi 15 menit. |
| **8** | **Screen 8: Consumer Digital Pickup Pass QR** | [`screen_8_consumer_pickup_pass_qr.html`](stitch_screens_html/screen_8_consumer_pickup_pass_qr.html) | Tiket digital berkode QR optik dengan notch tepi tiket, timer countdown kadaluarsa klaim 15 menit, rincian pembayaran di kasir, dan tombol arah Google Maps. |

---

## 3. Spesifikasi Desain & Design Tokens (Earth Tone Light Palette)

| Elemen UI | Nilai Token CSS / Hex | Peruntukan |
| :--- | :--- | :--- |
| **Canvas Background** | `#F8F6F0` (Linen Oat Milk) | Latar belakang seluruh halaman aplikasi mobile PWA |
| **Card / Surface** | `#FFFFFF` (Pure White) | Kontainer kartu bento, formulir, tiket, dan modal sheet |
| **Borders & Dividers** | `#E7E1D7` / `border-stone-200` | Garis tepi halus pemisah kartu dan section |
| **Primary Accent** | `#10B981` / `#059669` (Botanical Emerald) | Tombol CTA utama, status aktif, persentase diskon, dan ikon brand |
| **Headline Typography** | `#1F1D1A` (Roasted Charcoal) | Judul utama, nama toko, nama produk (`font-headline`) |
| **Body Typography** | `#5F5B54` / `text-stone-600` | Deskripsi, teks pendukung, alamat, dan label navigasi |
| **Warning / Urgency** | `#D97706` / `bg-amber-50 text-amber-800` | Banner jendela penjemputan urgent dan peringatan kasir |

---

## 4. Cara Mengecek di Browser Lokal

1. Buka berkas [preview_all_screens.html](preview_all_screens.html) di peramban favorit Anda (Google Chrome / Microsoft Edge).
2. Anda dapat melihat simulasi layar ponsel secara langsung (berganti antar frame menggunakan tombol tab atau tanda panah).
3. Jika ingin membandingkan semuanya sekaligus, klik tombol **"All 8 Grid"** di pojok kanan atas.
