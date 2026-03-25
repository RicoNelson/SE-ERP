# Screen Specifications & Wireframes: StockMate PWA

This document outlines the layout, components, and interactions for the core screens of the StockMate Progressive Web App (PWA), designed specifically for a mobile-first, high-usability experience.

---

## Global Elements

### Bottom Navigation Bar (Sticky)
Visible on all main screens to allow quick switching.
*   **[ 🛒 Jual ]** (Icon: Shopping Cart) - Default active tab for Staff.
*   **[ 📦 Stok ]** (Icon: Box)
*   **[ 📊 Laporan ]** (Icon: Chart) - Only visible to Owner.
*   **[ 👤 Profil ]** (Icon: User) - For settings/logout.

### Top App Bar
*   **Left:** Brand Logo / App Name (StockMate).
*   **Right:** Notification Bell (if low stock alerts exist).

---

## 1. Login Screen

**Purpose:** Secure entry point via Phone Number and OTP (Firebase Phone Auth).

**Layout (Step 1: Enter Phone):**
```text
+----------------------------------+
|           [Logo]                 |
|          StockMate               |
|                                  |
|   Masukkan Nomor HP Anda         |
|                                  |
|   [ +62 | 812 3456 7890      ]   |
|                                  |
|   [      KIRIM KODE OTP      ]   |
|                                  |
+----------------------------------+
```

**Layout (Step 2: Enter OTP):**
```text
+----------------------------------+
|           [Logo]                 |
|          StockMate               |
|                                  |
|   Masukkan Kode OTP              |
|   dikirim ke +62 812...          |
|                                  |
|   [ * ] [ * ] [ * ] [ * ] [ * ] [ * ] |
|                                  |
|   Belum menerima kode?           |
|   [ Kirim Ulang ]                |
+----------------------------------+
```

**Interactions:**
*   User enters phone number and taps "Kirim Kode OTP".
*   System transitions to Step 2 to enter the 6-digit SMS code.
*   Auto-submits on the 6th digit.
*   Shows "Kode Salah" in red text below the dots if incorrect.

---

## 2. Sell Screen (Home for Staff)

**Purpose:** Fast entry of customer purchases to deduct stock immediately.

**Layout:**
```text
+----------------------------------+
|  StockMate                 [🔔] |
+----------------------------------+
| [🔍 Cari nama produk atau SKU  ] |
| [📷 Scan Barcode] (Phase 2)      |
+----------------------------------+
| Penjualan Saat Ini               |
|                                  |
| Samsung Charger 25W              |
| Rp 150.000                       |
| Berapa produk terjual?  [  1  ]  |
| -------------------------------- |
| iPhone Screen Protector          |
| Rp 50.000                        |
| Berapa produk terjual?  [  2  ]  |
|                                  |
|                                  |
+----------------------------------+
| Total: Rp 250.000                |
| [     KONFIRMASI PENJUALAN   ]   |
+----------------------------------+
| [🛒 Jual] [📦 Stok] [📊 Laporan] |
+----------------------------------+
```

**Interactions:**
*   **Search:** Tapping search opens a full-screen modal with a list of products. Tapping a product adds it to the list below.
*   **Quantity:** User inputs the exact number sold next to "Berapa produk terjual?".
*   **Confirm Sale:** Massive, high-contrast button (e.g., bright green or blue).
    *   *Action:* Tapping shows a quick "Penjualan Berhasil!" toast/snackbar, clears the list, and deducts stock in the DB.

---

## 3. Product Search Modal (Triggered from Sell)

**Purpose:** Find items to add to the cart.

**Layout:**
```text
+----------------------------------+
| [< Kembali]  Cari Produk         |
+----------------------------------+
| [🔍 Ketik untuk mencari...     ] |
+----------------------------------+
| Samsung Charger 25W              |
| Stok: 14 | Rp 150.000   [Tambah] |
| -------------------------------- |
| Samsung Cable USB-C              |
| Stok: 2  | Rp 80.000 (Habis!) [Tambah] |
| -------------------------------- |
| iPhone Screen Protector          |
| Stok: 45 | Rp 50.000    [Tambah] |
+----------------------------------+
```

**Interactions:**
*   Typing filters the list instantly.
*   Tapping `[Tambah]` adds 1 unit to the Sell screen cart and returns the user to the Sell screen (or shows a quick checkmark and lets them keep adding).
*   Low stock items have red text for the stock count.

---

## 4. Stock List Screen

**Purpose:** View current inventory levels and identify low stock.

**Layout:**
```text
+----------------------------------+
|  StockMate                 [🔔] |
+----------------------------------+
| [🔍 Cari inventaris...         ] |
| Filter: [Semua] [Stok Menipis]   |
+----------------------------------+
| Samsung Charger 25W              |
| SKU: SAM-CHG-25 | Stok: 14       |
| -------------------------------- |
| Samsung Cable USB-C              |
| SKU: SAM-CBL-C  | Stok: 2 🔴     |
| -------------------------------- |
| iPhone Screen Protector          |
| SKU: IPH-SCR-01 | Stok: 45       |
+----------------------------------+
|        (+) Tambah Produk Baru    | <- Owner Only
|        (↑) Stok Masuk (Terima)   | <- Owner Only
+----------------------------------+
| [🛒 Jual] [📦 Stok] [📊 Laporan] |
+----------------------------------+
```

**Interactions:**
*   **Filter:** Tapping `[Stok Menipis]` filters the list to only show items below their defined threshold.
*   **Row Tap:** Tapping a product row opens the Product Detail/Edit screen.
*   **Floating Action Buttons (FABs) / Bottom Buttons:** Only visible to the Owner role for adding new items or receiving stock from suppliers.

---

## 5. Stock In Screen (Receive from Supplier)

**Purpose:** Owner adds new stock to the system based on physical delivery/invoices.

**Layout:**
```text
+----------------------------------+
| [< Batal]   Terima Stok          |
+----------------------------------+
| Supplier (Opsional)              |
| [ Pilih Supplier ▼ ]             |
|                                  |
| [🔍 Cari produk u/ ditambah... ] |
+----------------------------------+
| Menerima:                        |
|                                  |
| Samsung Cable USB-C              |
| Saat ini: 2       [-] 10 [+]     |
| Total Baru: 12                   |
| -------------------------------- |
| iPhone Screen Protector          |
| Saat ini: 45      [-] 50 [+]     |
| Total Baru: 95                   |
+----------------------------------+
| [     KONFIRMASI STOK DITERIMA ] |
+----------------------------------+
```

**Interactions:**
*   Functions similarly to the Sell screen, but mathematically *adds* to the stock instead of deducting.
*   "Konfirmasi Stok Diterima" updates the database and logs a `purchase` transaction.

---

## 6. Reports Dashboard (Owner Only)

**Purpose:** High-level overview of business performance and recent activity.

**Layout:**
```text
+----------------------------------+
|  StockMate                 [🔔] |
+----------------------------------+
| Ringkasan Hari Ini               |
|                                  |
|  Total Penjualan  Item Terjual   |
|  Rp 145.000       12             |
+----------------------------------+
| Peringatan                       |
| 🔴 4 Item Stok Menipis           |
|    [ Lihat Daftar ]              |
+----------------------------------+
| Aktivitas Terkini                |
| 10:45 - Terjual (3 item)  [Batal]|
| 09:30 - Stok Masuk (SAM)         |
| 09:15 - Terjual (1 item)  [Batal]|
+----------------------------------+
| [🛒 Jual] [📦 Stok] [📊 Laporan] |
+----------------------------------+
```

**Interactions:**
*   **Undo:** Tapping `[Batal]` next to a recent sale prompts a confirmation dialog ("Apakah Anda yakin ingin membatalkan penjualan ini dan mengembalikan item ke stok?").
*   **View List:** Navigates to the Stock screen with the "Stok Menipis" filter pre-applied.

---

## Design System Notes (for Developers)

**Style Directive:** Modern Minimalist CMS (Clean, flat, high-contrast, ample whitespace, similar to modern SaaS dashboards like Shopify Admin or Stripe, but optimized for mobile).

*   **Color Palette:**
    *   Background: Very Light Gray / Off-White (`#fcfcfc` or `#f3f4f6`)
    *   Surface/Cards: Pure White (`#ffffff`) with very subtle, soft shadows (e.g., `box-shadow: 0 1px 3px rgba(0,0,0,0.05)`).
    *   Primary Text: Dark Slate (`#111827`)
    *   Secondary Text: Cool Gray (`#6b7280`)
    *   Primary Brand/Action: Deep Indigo or Slate (`#4f46e5` or `#0f172a`) - Avoid loud "app" colors; keep it professional.
    *   Success: Soft Green (`#10b981`)
    *   Warning/Alert: Muted Red (`#ef4444`)
*   **Typography:** Modern Sans-Serif (e.g., Inter, Roboto, or system UI fonts).
    *   Base size `16px` for readability.
    *   Headers should be bold but not oversized (`20px` to `24px`), using a slightly tighter letter-spacing.
*   **Components & Spacing:**
    *   **Cards,:** Use flat cards with a 1px border (`#e5e7eb`) instead of heavy drop shadows to maintain the minimalist CMS feel.
    *   **Inputs/Buttons:** Slightly rounded corners (e.g., `border-radius: 6px` or `8px`), not fully pill-shaped. Minimum height `48px` for tap targets.
    *   **Spacing:** Generous padding inside cards (e.g., `16px` or `24px`). Let elements breathe. No cramped tables.
*   **Icons:** Use simple, line-based icon sets (like Feather Icons or Lucide). Avoid filled or multi-color icons.
