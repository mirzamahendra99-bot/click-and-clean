# Click & Clean — Website Pesanan Laundry

Website 2 tampilan untuk usaha laundry:
- **`index.html`** — untuk **konsumen** (lacak pesanan, ajukan antar-jemput, cek poin). Ini yang jadi halaman utama / yang dibagikan ke pelanggan.
- **`admin.html`** — untuk **pengusaha/kasir** (input pesanan, konfirmasi pembayaran, riwayat transaksi, rekap penjualan, stok). Dikunci PIN, jangan dibagikan ke pelanggan.

Tidak perlu install apa pun — murni HTML/CSS/JS. Logo & palet warna mengikuti identitas **Click & Clean** (navy `#0A005D`, biru `#3A90D3`, cyan `#4FD0F0`, lime `#E5F88A`). Supaya data pesanan **tersimpan permanen** dan **tersambung real-time** antara admin dan konsumen (di perangkat berbeda), website ini memakai **Firebase Firestore** (database gratis dari Google) sebagai backend.

---

## 1. Coba dulu tanpa setup (Mode Demo)

Buka `index.html` atau `admin.html` langsung di browser (PIN default: `2024`). Semua fitur bisa dicoba, tapi data **tidak permanen** dan **tidak dibagikan** antar perangkat/tab selama Firebase belum di-setup. Lanjut ke langkah 2 untuk pemakaian sungguhan.

## 2. Setup Firebase (gratis, ~10 menit)

1. Buka [console.firebase.google.com](https://console.firebase.google.com) → **Add project** → beri nama (mis. `click-and-clean`) → lanjutkan sampai selesai.
2. Di sidebar kiri: **Build → Firestore Database → Create database**. Pilih lokasi server (mis. `asia-southeast2 (Jakarta)`), lalu **Start in test mode** (bisa diperketat nanti, lihat bagian Keamanan di bawah).
3. Di sidebar kiri: klik ⚙️ **Project settings** → scroll ke **Your apps** → klik ikon web `</>` → beri nickname → **Register app**. Firebase akan menampilkan objek `firebaseConfig`.
4. Buka file **`firebase-config.js`** di proyek ini, ganti isinya dengan config yang baru saja didapat (copy-paste semua nilai `apiKey`, `authDomain`, dst).
5. Simpan, refresh `index.html` / `admin.html` — banner "Mode demo" akan hilang, artinya sudah tersambung ke database asli.

### Keamanan Firestore (disarankan sebelum go-live)
Test mode Firestore terbuka untuk siapa saja. Untuk usaha nyata, di Firebase Console → Firestore → **Rules**, ganti dengan aturan minimal berikut agar data tetap bisa dibaca semua orang (perlu untuk pelacakan pelanggan) tapi lebih terbatas untuk ditulis:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /orders/{orderId} {
      allow read: if true;
      allow create: if true;
      allow update: if true; // hanya panel admin yang punya UI untuk update status/pembayaran
    }
    match /meta/{docId} {
      allow read: if true;
      allow write: if true;
    }
    match /redemptions/{docId} {
      allow read, write: if true;
    }
  }
}
```
> Catatan: karena panel admin di sini hanya dikunci PIN sisi-klien (bukan login sungguhan), siapa pun yang tahu URL Firestore API secara teknis bisa menulis data langsung. Untuk keamanan tingkat produksi yang lebih tinggi, tambahkan **Firebase Authentication** (email/password) khusus untuk admin — di luar cakupan versi ini, tapi Firestore Rules bisa disesuaikan mengikuti `request.auth != null`.

## 3. Ganti PIN Admin

Buka `common.js`, baris paling atas:
```js
const ADMIN_PIN = "2024"; // GANTI sebelum deploy ke publik
```
Ganti ke PIN rahasia milikmu sendiri sebelum di-deploy.

## 4. Deploy ke GitHub Pages (gratis, jadi bisa diakses via link publik)

1. Buat repository baru di GitHub (mis. `click-and-clean`).
2. Upload semua file di folder ini (`index.html`, `admin.html`, `common.js`, `style.css`, `firebase-config.js`, `README.md`) **beserta folder `assets/`** (berisi logo & favicon) ke repo tersebut — lewat web GitHub (**Add file → Upload files**) atau lewat `git push` kalau familiar dengan Git.
3. Di repo → **Settings → Pages** → bagian **Build and deployment** → Source: **Deploy from a branch** → Branch: `main` / folder `/ (root)` → **Save**.
4. Tunggu 1–2 menit, GitHub akan memberi URL seperti:
   `https://namamu.github.io/click-and-clean/`
5. Itulah link **konsumen** (halaman `index.html` otomatis jadi halaman utama). Link **admin** ada di:
   `https://namamu.github.io/click-and-clean/admin.html`

Bagikan link konsumen ke pelanggan, simpan link admin hanya untuk kasir/pemilik.

## 5. Kirim status pesanan lewat WhatsApp

Di panel admin (tab **Input Pesanan** setelah nota dibuat, atau tab **Daftar Pesanan**), setiap pesanan punya tombol **"Kirim Nota via WhatsApp"** / **"Update via WA"**. Tombol ini membuka WhatsApp (app/web) dengan pesan yang sudah otomatis terisi, berisi status terbaru dan link pelacakan pribadi pelanggan, contoh:

```
Halo Budi, status pesanan laundry Anda di *Click & Clean* (CC-AB12CD): Diproses.
Lacak status real-time di: https://namamu.github.io/click-and-clean/?code=CC-AB12CD
```

Admin tinggal menekan tombol **Send** di WhatsApp. Pelanggan yang membuka link tersebut akan **langsung diarahkan ke hasil lacak pesanannya** (bukan halaman kosong).

> Catatan jujur: ini memakai tautan `wa.me` biasa (klik → buka WhatsApp → kirim manual). Untuk **auto-kirim tanpa sentuh** sepenuhnya (tanpa admin menekan Send), dibutuhkan **WhatsApp Business API** resmi dari Meta/penyedia pihak ketiga (berbayar & perlu proses verifikasi bisnis) — di luar cakupan website statis gratis ini.

## 6. Struktur fitur

**Panel Konsumen (`index.html`)**
- Lacak Pesanan (manual atau otomatis lewat link `?code=...`)
- Ajukan Antar-Jemput
- Cek Poin & Tukar Paket Hemat

**Panel Admin (`admin.html`, dikunci PIN)**
- Input Pesanan (harga & poin otomatis, nota digital, kirim via WA)
- Daftar Pesanan aktif (ubah status, terkunci sistem sebelum lunas)
- Konfirmasi Pembayaran (QRIS / Transfer Bank / Cash)
- Riwayat Transaksi (cari & filter berdasarkan metode bayar)
- Rekap Penjualan (omzet, jumlah transaksi, breakdown per layanan & metode bayar, per periode)
- Stok Otomatis (deterjen, pewangi, plastik berkurang otomatis per kg, bisa diisi ulang)

## 7. Batasan yang perlu diketahui

- PIN admin adalah proteksi sederhana sisi-klien, bukan sistem login penuh — cukup untuk penggunaan skala kecil/tugas, tapi pertimbangkan Firebase Authentication untuk keamanan lebih serius.
- Pengecekan stok sebelum menyimpan pesanan tidak memakai transaksi atomik Firestore — pada skala sangat ramai (banyak kasir input bersamaan) berpotensi race condition kecil. Cukup aman untuk 1 kasir aktif per waktu.
- Kirim WhatsApp masih perlu 1 klik "Send" manual oleh admin (lihat bagian 5).
