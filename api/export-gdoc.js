// Ekspor langsung ke Google Docs butuh login Google (OAuth) yang belum disiapkan.
// Sementara, aplikasi menyediakan unduhan .docx yang bisa dibuka langsung di Google Docs.
export function POST() {
  return Response.json({ error: 'Koneksi langsung ke Google Docs belum diaktifkan. Gunakan "Unduh .docx", lalu buka di Google Drive.' }, { status: 501 });
}
