// Contoh dari rekaman briefing pagi yang diuji (sudah dirapikan). Dipakai untuk mode demo.
export const SAMPLE_TITLE = 'Briefing Pagi Tim Lapangan';

export const SAMPLE_ROWS = [
  ['00:07', 'Pak Rustam', 'Baik, langsung saja untuk melaporkan kegiatan kemarin dan planning hari ini. Silakan Pak Parlin.'],
  ['00:24', 'Pak Parlin', 'Kemarin kami sosialisasi bersama Pak Ambo di Desa Lalonggatebe, Kecamatan Dangia, Kolaka Timur.', ['Nama desa belum pasti']],
  ['01:06', 'Pak Parlin', 'Pesertanya antusias sekali Pak, karena petani di sana mengeluh dolomit sulit didapat.'],
  ['02:14', 'Pak Parlin', 'Info dari Pak Desa ada 12 desa, dua saja yang tidak potensi sawit karena persawahan.'],
  ['03:06', 'Pak Parlin', 'Petani berharap ada agen atau R1 di sana. Kami diskusi, siapa tahu Pak Desa bersedia jadi agen.'],
  ['03:36', 'Pak Parlin', 'Pak Haji Arham mau order dolomit 60 sak, saya negosiasi antar 40 sak dulu.', ['Cek jumlah sak']],
  ['07:05', 'Pak Parlin', 'Saya mau kawal Pak Mansur yang beli NPK untuk dipakai di kebunnya sendiri, supaya jadi testimoni.'],
  ['07:48', 'Pak Rustam', 'Iya perlu itu Pak, kalau berhasil bisa jadi testimoni untuk kita.'],
  ['08:18', 'Pak Rustam', 'Oke, silakan Pak Juang.'],
  ['08:34', 'Pak Juang', 'Kemarin ke daerah Gumbasa, dapat tiga orang. Dua referensi, satu petani.', ['Audio bagian ini kurang jelas']],
  ['09:27', 'Pak Juang', 'Demplot bawang goreng sudah tanam, kita bisa lanjut ke fase vegetatif dan generatif.'],
  ['10:22', 'Pak Juang', 'Saya ukur pH di lahan Pak Kadri, kira-kira 4,5 sampai 5,5 di tiga titik.', ['Cek angka pH']],
  ['16:31', 'Pak Ilham', 'Kunjungan kedua di Pare-Pare. Petani mulai tanam akhir November atau awal Desember.'],
  ['19:31', 'Pak Ilham', 'Setelah saya sosialisasi produk lain, dia tertarik boosternya. Akhirnya beli booster satu.'],
  ['22:06', 'Pak Ilham', 'Per box itu 375 ribu. Petani lebih tertarik kalau jualnya per saset. Apakah bisa dibuka per saset?'],
  ['22:57', 'Pak Rustam', 'Bisa ji Pak. Yang penting terjual, tapi sampaikan ke petani satu saset tidak maksimal untuk lahan luas.'],
  ['25:27', 'Pak Ilham', 'Daftar harga calon supplier untuk Sulbar insya Allah rampung hari ini, saya teruskan ke grup WA.'],
  ['28:44', 'Pak Murad', 'Harga 11 ribu itu sudah clear Pak. Yang belum pasti, lokasi penangkar bibitnya valid atau tidak.', ['Cek harga']],
  ['31:14', 'Pak Rustam', 'Kita masukkan saja penawarannya dengan harga kita. Kalau sudah ada respons dari Tonasa, baru cek penangkarnya.'],
  ['33:09', 'Pak Murad', 'Memang butuh penambahan KBLI untuk ikut di proyek itu Pak.'],
  ['38:37', 'Pak Parlin', 'Order-nya 50 sak dan 70 sak, dua petani. Bisa antar 40 sak dulu.'],
  ['38:48', 'Pak Rustam', 'Verifikasinya diwakili saja sama Ibu Indah, karena Pak Adi ada tugas dari Pak Rus.'],
  ['40:05', 'Pak Rustam', 'Untuk briefing pagi hari ini kita cukupkan sampai di sini. Terima kasih.']
].map(([t, who, text, flags]) => {
  const [m, s] = t.split(':').map(Number);
  return { t: m * 60 + s, who, text, flags: flags || [], ok: !flags };
});

// Kejadian yang "terdeteksi" saat demo mode live, berdasarkan detik.
export const LIVE_EVENTS = {
  216: { action: ['Antar 40 sak dolomit ke Pak Haji Arham, koordinasi dengan Pak Adi', 'Pak Parlin'] },
  425: { action: ['Kawal penggunaan NPK Pak Mansur untuk testimoni', 'Pak Parlin'] },
  567: { action: ['Lanjutkan demplot bawang goreng dan siapkan testimoni', 'Pak Juang'] },
  1377: { decision: 'Produk boleh dijual per saset untuk uji coba, dengan penjelasan ke petani.' },
  1527: { action: ['Teruskan daftar harga supplier Sulbar ke grup WA', 'Pak Ilham'] },
  1874: { decision: 'Penawaran ke Tonasa dimasukkan dulu dengan harga Rp11 ribu; penangkar dicek setelah ada respons.', action: ['Masukkan penawaran ke Tonasa', 'Pak Murad'] },
  1989: { action: ['Siapkan tambahan KBLI untuk proyek Mamuju', 'Pak Murad'] },
  2328: { decision: 'Verifikasi order dolomit diwakili Ibu Indah.', action: ['Verifikasi order dolomit', 'Ibu Indah'] }
};

export const SAMPLE_MINUTES = {
  summary: 'Briefing pagi tim lapangan. Pak Parlin melaporkan sosialisasi di Kolaka Timur dan order dolomit, Pak Juang melaporkan demplot bawang goreng dan cabai, Pak Ilham melaporkan penjualan booster dan daftar harga supplier Sulbar, dan Pak Murad membahas penawaran ke Tonasa.',
  decisions: [
    { text: 'Produk boleh dijual per saset untuk uji coba, dengan penjelasan ke petani bahwa hasilnya tidak maksimal untuk lahan luas.', src: 1377 },
    { text: 'Penawaran ke Tonasa dimasukkan dulu dengan harga Rp11 ribu; penangkar bibit dicek setelah ada respons.', src: 1874 },
    { text: 'Pengantaran dolomit 40 sak dulu; verifikasi order diwakili Ibu Indah.', src: 2328 }
  ],
  points: [
    'Petani di Kecamatan Dangia mengeluhkan dolomit sulit didapat; ada peluang agen/R1 lewat Pak Desa.',
    '10 dari 12 desa di Kecamatan Dangia berpotensi sawit.',
    'Harga per box 375 ribu dianggap berat oleh petani; penjualan per saset jadi jalan masuk.',
    'Ada calon supplier lain di Makassar, tapi harganya sekitar 7 ribu lebih mahal.'
  ],
  actions: [
    { task: 'Antar 40 sak dolomit ke Pak Haji Arham, koordinasi dengan Pak Adi', owner: 'Pak Parlin', due: '', done: false, src: 216 },
    { task: 'Kawal penggunaan NPK Pak Mansur untuk testimoni', owner: 'Pak Parlin', due: '', done: false, src: 425 },
    { task: 'Lanjutkan demplot bawang goreng dan siapkan testimoni', owner: 'Pak Juang', due: '', done: false, src: 567 },
    { task: 'Teruskan daftar harga supplier Sulbar ke grup WA', owner: 'Pak Ilham', due: '', done: false, src: 1527 },
    { task: 'Masukkan penawaran ke Tonasa', owner: 'Pak Murad', due: '', done: false, src: 1874 },
    { task: 'Siapkan tambahan KBLI untuk proyek Mamuju', owner: 'Pak Murad', due: '', done: false, src: 1989 },
    { task: 'Verifikasi order dolomit', owner: 'Ibu Indah', due: '', done: false, src: 2328 }
  ],
  mode: 'contoh'
};
