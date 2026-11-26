# Notulen Sejati

Aplikasi web untuk membuat notulen rapat Zoom berbahasa Indonesia dengan dialek Sulawesi, lalu mengekspornya ke Google Docs.

## Fitur

- **Tiga sumber rapat:** rekaman (MP4/M4A/MP3), transkrip Zoom (.vtt) atau teks yang ditempel, dan mode rapat live (masih demo).
- **Pembersihan otomatis:** membuang kalimat palsu dari mesin ("Terima kasih telah menonton"), memotong kata yang berulang, dan mengoreksi nama atau istilah memakai kamus.
- **Kamus istilah yang bisa diedit:** nama orang, tempat, dan produk. Kamus juga dikirim ke mesin transkripsi sebagai petunjuk ejaan.
- **Notulen:** ringkasan, keputusan, poin penting, dan tugas (penanggung jawab, tenggat, centang selesai). Semuanya bisa diedit, dan setiap keputusan atau tugas punya tautan ke kalimat sumbernya.
- **Cek manusia:** baris yang meragukan ditandai, lengkap dengan tombol "Sudah benar" dan "Perbaiki". Ada juga indikator persentase baris yang sudah dicek.
- **Arti kata dialek** (torang, ngana, nimbole, ji, mi, dan lainnya) ditampilkan di bawah kalimat.
- **Ekspor:** unduh .docx (bisa langsung dibuka di Google Docs) atau salin teks.
- **Riwayat notulen** tersimpan di browser.

## Menjalankan

```bash
npm install
npm run dev      # tampilan saja (fungsi /api tidak jalan)
npx vercel dev   # tampilan + fungsi /api
npm test
```

## Pengaturan di Vercel (Environment Variables)

| Nama | Untuk | Tanpa nilai |
|---|---|---|
| `ANTHROPIC_API_KEY` | Ringkasan AI dengan Claude | Memakai ringkasan sederhana berbasis aturan |
| `TRANSCRIBE_API_KEY` | Transkripsi rekaman (Whisper) | Rekaman menampilkan contoh hasil |
| `TRANSCRIBE_API_URL`, `TRANSCRIBE_MODEL` | Ganti penyedia, misalnya Groq | Memakai OpenAI `whisper-1` |

## Batasan saat ini

- Unggahan rekaman langsung dibatasi **4 MB** (batas Vercel). Untuk rapat panjang, pakai transkrip .vtt dari Zoom. Tahap berikutnya: unggah ke penyimpanan (Vercel Blob) lalu diproses di server.
- **Mode live masih demo.** Masuk ke rapat Zoom sungguhan butuh aplikasi di Zoom Marketplace atau layanan bot rapat.
- **Kirim langsung ke folder Google Drive** butuh login Google (OAuth). Sementara, pakai unduhan .docx.
- Riwayat dan kamus tersimpan di browser masing-masing pengguna, belum di server.
