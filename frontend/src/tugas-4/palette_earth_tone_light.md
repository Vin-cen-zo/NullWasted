# NullWasted Design Tokens — Earth Tone Light Mode Specification

> **Theme Philosophy:** Natural, Organic, Warm, and Sustainable  
> **Target:** Mobile PWA (iPhone 14/15/16 Baseline 390px × 844px)  
> **Contrast Standard:** WCAG AAA (Contrast ratio > 10:1 for primary copy)

---

## 1. Color Palette Mapping (Dark Mode → Earth Tone Light Mode)

Gunakan tabel pemetaan ini untuk mengganti warna secara massal di panel **Selection Colors** Figma:

| Elemen UI | Warna Lama (Dark Obsidian) | Warna Baru (Earth Tone Light) | Nama Token & Filosofi |
| :--- | :---: | :---: | :--- |
| **Canvas Background** | `#0F172A` / `#0B0F19` | **`#F8F6F0`** | **Warm Linen / Oat Milk**<br>Latar belakang hangat, organik, lembut di mata, khas produk pangan ramah lingkungan. |
| **Card / Surface Fill** | `#1E293B` | **`#FFFFFF`** | **Pure Natural White**<br>Permukaan kartu konten bersih dengan elevasi lembut agar makanan terlihat menggugah selera. |
| **Card Borders / Strokes** | `#334155` | **`#E7E1D7`** | **Muted Sand Border**<br>Garis tepi lembut warna pasir gurun, memisahkan modul tanpa kontras kaku. |
| **Primary Brand Accent (Hijau)** | `#10B981` | **`#2E5B3E`** | **Deep Forest Sage / Botanical Green**<br>Hijau bumi (*earthy botanical green*) yang matang, elegan, melambangkan keberlanjutan pertanian & kesegaran alami. |
| **Primary Button Hover / Active** | `#059669` | **`#234730`** | **Deep Pine**<br>State saat tombol ditekan. |
| **Soft Green Pill / Tint** | `rgba(16,185,129,0.15)` | **`#EBF2EB`** | **Gentle Sage Tint**<br>Latar belakang badge BPOM safe dan chip kategori aktif. |
| **Urgency / Closing Alert** | `#F59E0B` | **`#C86D44`** | **Warm Terracotta / Toasted Cinnamon**<br>Warna roti terpanggang dan tanah liat hangat untuk menandakan diskon & sisa jam tutup. |
| **Soft Alert Pill Tint** | `rgba(245,158,11,0.15)` | **`#FDF2EB`** | **Soft Clay Tint**<br>Latar badge sisa waktu / countdown. |
| **Primary Text (Headings/Price)** | `#F8FAFC` | **`#1F1D1A`** | **Roasted Espresso Charcoal**<br>Teks utama kontras tinggi, hitam kecokelatan hangat, ramah di mata. |
| **Secondary Text (Body/Meta)** | `#CBD5E1` | **`#5F5B54`** | **Warm Earth Umber**<br>Teks paragraf, jam operasional, dan keterangan toko. |
| **Muted Text / Helper** | `#94A3B8` | **`#8C857B`** | **Sandstone Muted**<br>Teks pembantu, placeholder, dan caption. |
| **Hazard / Error Accent** | `#EF4444` | **`#B93838`** | **Rustic Brick Red**<br>Merah bata tanah liat untuk peringatan makanan basi/kadaluarsa. |

---

## 2. Cara Mengganti Massal di Figma (Dalam 1 Menit)

1. Di Figma, pilih (**drag-select**) seluruh 8 frame sekaligus.
2. Lihat ke sisi kanan layar pada panel **Selection colors**.
3. Cari kotak warna lama dan klik:
   * Klik kotak `#0F172A` $\rightarrow$ ganti menjadi **`#F8F6F0`**
   * Klik kotak `#1E293B` $\rightarrow$ ganti menjadi **`#FFFFFF`**
   * Klik kotak `#334155` $\rightarrow$ ganti menjadi **`#E7E1D7`**
   * Klik kotak `#10B981` $\rightarrow$ ganti menjadi **`#2E5B3E`**
   * Klik kotak `#F8FAFC` $\rightarrow$ ganti menjadi **`#1F1D1A`**
   * Klik kotak `#CBD5E1` $\rightarrow$ ganti menjadi **`#5F5B54`**
   * Klik kotak `#F59E0B` $\rightarrow$ ganti menjadi **`#C86D44`**
4. Seluruh 8 layar akan langsung bertransformasi menjadi **Earth Tone Light Mode** secara instan!
