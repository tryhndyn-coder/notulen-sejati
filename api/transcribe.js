// Transkripsi rekaman lewat layanan Whisper (OpenAI atau yang kompatibel, misalnya Groq).
// Aktif bila TRANSCRIBE_API_KEY diisi. Batas unggahan Vercel sekitar 4,5 MB per permintaan.
export async function POST(request) {
  const key = process.env.TRANSCRIBE_API_KEY;
  if (!key) return Response.json({ error: 'Transkripsi belum diaktifkan (TRANSCRIBE_API_KEY belum diisi).' }, { status: 501 });
  const url = process.env.TRANSCRIBE_API_URL || 'https://api.openai.com/v1/audio/transcriptions';
  const model = process.env.TRANSCRIBE_MODEL || 'whisper-1';
  let form;
  try { form = await request.formData(); } catch { return Response.json({ error: 'File tidak terbaca. Ukuran maksimal sekitar 4 MB.' }, { status: 413 }); }
  const file = form.get('file');
  if (!file || typeof file === 'string') return Response.json({ error: 'File rekaman tidak ada.' }, { status: 400 });
  const out = new FormData();
  out.append('file', file, file.name || 'rekaman.m4a');
  out.append('model', model);
  out.append('language', String(form.get('language') || 'id'));
  out.append('response_format', 'verbose_json');
  const prompt = String(form.get('prompt') || '').slice(0, 800);
  if (prompt) out.append('prompt', prompt); // kamus istilah membantu ejaan nama dan tempat
  const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: out });
  if (!res.ok) return Response.json({ error: `Layanan transkripsi error (${res.status}).` }, { status: 502 });
  const data = await res.json();
  const segs = Array.isArray(data.segments) ? data.segments : [{ start: 0, end: 0, text: data.text || '' }];
  return Response.json({ rows: segs.map(s => ({ t: Math.floor(s.start || 0), d: (s.end || 0) - (s.start || 0), who: 'Pembicara', text: String(s.text || '').trim() })) });
}
