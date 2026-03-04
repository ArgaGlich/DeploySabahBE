# SIPENA SABAH — Panduan Google Sheets & Dashboard

## 📋 Struktur Tab Google Sheets

Hanya **2 tab** yang digunakan:

| Tab | Fungsi |
|---|---|
| `Anak` | Semua data per anak (sumber utama seluruh sistem) |
| `Stats` | Data Pilar 5 Koordinasi Tata Kelola (manual) |

---

## 📄 Tab `Anak` — Penjelasan Kolom A hingga P

| Kolom | Label | Tipe | Penjelasan |
|---|---|---|---|
| **A** | `id` | Teks | Nomor Induk Anak — format: `child_001`, `child_002`, dst. Harus **unik** |
| **B** | `nama` | Teks | Nama lengkap anak. Akan disamarkan untuk pengguna Guest |
| **C** | `lat` | Angka | Koordinat GPS — **Latitude** (garis lintang). Contoh: `5.9788` |
| **D** | `lng` | Angka | Koordinat GPS — **Longitude** (garis bujur). Contoh: `116.0753` |
| **E** | `district` | Teks | Nama distrik tempat tinggal anak. Pilihan: `Kota Kinabalu`, `Sandakan`, `Tawau`, `Keningau`, `Semporna` |
| **F** | `skor_kesehatan` | Angka (0–100) | Skor indeks kesehatan anak. Makin tinggi = makin sehat |
| **G** | `skor_pendidikan` | Angka (0–100) | Skor indeks pendidikan anak. Makin tinggi = makin baik |
| **H** | `teregistrasi` | TRUE / FALSE | Apakah anak sudah memiliki akta kelahiran / terdaftar secara sipil? |
| **I** | `imunisasi` | TRUE / FALSE | Apakah anak sudah mendapat imunisasi dasar lengkap? |
| **J** | `gizi_baik` | TRUE / FALSE | Apakah status gizi anak dalam kondisi baik (tidak kekurangan gizi)? |
| **K** | `stunting` | TRUE / FALSE | Apakah anak terindikasi stunting (tinggi badan di bawah standar usia)? |
| **L** | `ikut_paud` | TRUE / FALSE | Apakah anak pernah/sedang mengikuti PAUD (usia 3–6 tahun)? |
| **M** | `transisi_sd` | TRUE / FALSE | Apakah anak berhasil masuk/lulus ke jenjang Sekolah Dasar? |
| **N** | `dropout` | TRUE / FALSE | Apakah anak pernah berhenti sekolah (putus sekolah)? |
| **O** | `pekerja_anak` | TRUE / FALSE | Apakah ada indikasi anak terlibat dalam pekerjaan berbahaya? |
| **P** | `eksploitasi` | TRUE / FALSE | Apakah ada indikasi anak mengalami eksploitasi? |

### Cara Mengisi Contoh

```
child_016 | Faisal Bin Rahman | 5.9800 | 116.0700 | Kota Kinabalu | 70 | 65 | TRUE | TRUE | TRUE | FALSE | TRUE | TRUE | FALSE | FALSE | FALSE
```

> ⚠️ **Penting:** Nilai kolom H–P **harus persis** `TRUE` atau `FALSE` (huruf kapital semua).

---

## 📄 Tab `Stats` — Data Pilar 5

Berisi 3 baris data organisasi yang diisi manual (bukan per-anak):

| A (pilar) | B (key) | **C (nilai)** ← **edit ini** | D (label) | E (satuan) | F (tipe) | G (bahaya) |
|---|---|---|---|---|---|---|
| 5 | kasus_monitor | **28** | Kasus dimonitor | kasus | angka | false |
| 5 | tindak_lanjut | **75** | Tindak lanjut selesai | % | bar | false |
| 5 | integrasi | **3** | Integrasi data bilateral | sistem | angka | false |

---

## 🧮 Cara Kerja Perhitungan Dashboard

### Rumus CVI (Child Vulnerability Index)

```
CVI Score = (skor_kesehatan × Bobot_Kes) + (skor_pendidikan × Bobot_Pend)
```

Bobot default: `50% : 50%`. Admin dapat mengubah bobot melalui panel Admin di aplikasi.

| CVI Score | Kategori | Keterangan |
|---|---|---|
| < 40 | 🔴 Risiko Tinggi | Anak sangat rentan |
| 40 – 75 | 🟡 Risiko Sedang | Anak perlu perhatian |
| > 75 | 🟢 Aman | Kondisi anak baik |

---

### Cara Kerja Tiap Pilar Dashboard

Semua indikator Pilar 1–4 **dihitung otomatis** dari data tab `Anak`:

#### Pilar 1 — Identitas & Status Sipil
| Indikator | Rumus |
|---|---|
| Teregistrasi (%) | `JUMLAH(H="TRUE") ÷ TOTAL × 100` |
| Status WNA/Stateless (%) | `JUMLAH(H="FALSE") ÷ TOTAL × 100` |
| Total terdata | Jumlah semua baris di tab Anak |

#### Pilar 2 — Akses PAUD & Pendidikan
| Indikator | Sumber Kolom | Rumus |
|---|---|---|
| Partisipasi PAUD (%) | L (`ikut_paud`) | `JUMLAH(L="TRUE") ÷ TOTAL × 100` |
| Transisi ke SD (%) | M (`transisi_sd`) | `JUMLAH(M="TRUE") ÷ TOTAL × 100` |
| Drop-out (%) | N (`dropout`) | `JUMLAH(N="TRUE") ÷ TOTAL × 100` |

#### Pilar 3 — Kesehatan & Nutrisi
| Indikator | Sumber Kolom | Rumus |
|---|---|---|
| Imunisasi lengkap (%) | I (`imunisasi`) | `JUMLAH(I="TRUE") ÷ TOTAL × 100` |
| Gizi baik (%) | J (`gizi_baik`) | `JUMLAH(J="TRUE") ÷ TOTAL × 100` |
| Stunting (%) | K (`stunting`) | `JUMLAH(K="TRUE") ÷ TOTAL × 100` |

#### Pilar 4 — Perlindungan & Risiko Sosial
| Indikator | Sumber Kolom | Rumus |
|---|---|---|
| Risiko Tinggi CVI | CVI Score | Dihitung dari kolom F + G |
| Indikasi Pekerja Anak (%) | O (`pekerja_anak`) | `JUMLAH(O="TRUE") ÷ TOTAL × 100` |
| Indikasi Eksploitasi (kasus) | P (`eksploitasi`) | `JUMLAH(P="TRUE")` — hitungan mutlak |

#### Pilar 5 — Koordinasi Tata Kelola
Data organisasi — isi manual di tab `Stats`, kolom C.

---

## 🔄 Alur Data Sistem

```
Google Sheets (tab Anak)
        ↓  setiap request API
 Backend Node.js (server.js)
        ↓  fetchChildren() → Anak!A2:P
   Bobot CVI (PostgreSQL)
        ↓  kalkulasi CVI + agregasi pilar
   Frontend (React + Leaflet)
        ↓
  Peta Zona + Dashboard 5 Pilar
```

---

## 🚀 Cara Menjalankan

```bash
# Terminal 1 — Backend
cd backend
node server.js         # → http://localhost:3000

# Terminal 2 — Frontend
cd frontend
npm run dev            # → http://localhost:5173
```

### Setup awal (jalankan 1 kali):
```bash
cd backend
node setup-sheets.js   # membuat tab Anak & Stats di Google Sheets
```

### Akun Login Demo
| Role | Username | Password |
|---|---|---|
| Admin | `admin` | *(kosong)* |
| Guest | *(apapun)* | *(kosong)* |

---

## 🔐 Hak Akses

| Fitur | Admin | Guest |
|---|---|---|
| Lihat peta & zona | ✅ | ✅ |
| Nama lengkap anak | ✅ | ❌ (disamarkan) |
| Nomor Induk Anak | ✅ | ❌ (NIA-*****) |
| Dashboard 5 Pilar | ✅ | ✅ |
| Ubah bobot CVI | ✅ | ❌ |
