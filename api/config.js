// Memberi tahu aplikasi fitur server mana yang sudah aktif (tanpa membuka isi kunci).
export function GET() {
  return Response.json({
    summarize: Boolean(process.env.ANTHROPIC_API_KEY),
    transcribe: Boolean(process.env.TRANSCRIBE_API_KEY),
    googleDocs: false,
    maxUploadMb: 4
  });
}
