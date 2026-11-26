// Ringkasan notulen dengan Claude. Aktif bila ANTHROPIC_API_KEY diisi di Vercel.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const Minutes = z.object({
  summary: z.string(),
  decisions: z.array(z.object({ text: z.string(), src: z.number() })),
  points: z.array(z.string()),
  actions: z.array(z.object({ task: z.string(), owner: z.string(), due: z.string(), src: z.number() })),
  needs_check: z.array(z.object({ text: z.string(), src: z.number(), reason: z.string() }))
});

const SYSTEM = `Anda notulis rapat perusahaan di Sulawesi. Transkrip berasal dari mesin pengubah suara ke teks, berbahasa Indonesia dengan dialek Sulawesi (Manado, Makassar, Bugis), dan bisa berisi salah dengar.
Tugas Anda menyusun notulen dalam bahasa Indonesia baku yang rapi:
- summary: 2-4 kalimat inti rapat.
- decisions: hanya hal yang benar-benar disepakati atau diputuskan. src = detik baris sumbernya.
- points: informasi penting (angka, kendala, peluang) yang bukan keputusan.
- actions: tugas konkret dengan penanggung jawab (owner) sesuai nama di transkrip; due berformat YYYY-MM-DD bila tanggal disebut, atau string kosong.
- needs_check: nama, angka, atau istilah yang kemungkinan salah dengar dan perlu dicek manusia, dengan alasan singkat.
Jangan mengarang isi yang tidak ada di transkrip. Bila ragu, masukkan ke needs_check. Gunakan kamus istilah yang diberikan sebagai ejaan yang benar.`;

export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'Ringkasan AI belum diaktifkan (ANTHROPIC_API_KEY belum diisi).' }, { status: 501 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Data tidak valid.' }, { status: 400 }); }
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 3000) : [];
  if (!rows.length) return Response.json({ error: 'Transkrip kosong.' }, { status: 400 });
  const transcript = rows.map(r => `[${Number(r.t) || 0}] ${String(r.who).slice(0, 60)}: ${String(r.text).slice(0, 2000)}`).join('\n');
  const vocab = (body.vocab || []).map(v => `${v.to}`).filter(Boolean).join(', ');

  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'medium', format: zodOutputFormat(Minutes) },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Judul rapat: ${String(body.title || '').slice(0, 200)}\nKamus istilah: ${vocab || '-'}\n\nTranskrip (angka di awal = detik):\n${transcript}` }]
    });
    if (response.stop_reason === 'refusal') return Response.json({ error: 'Model menolak memproses transkrip ini.' }, { status: 422 });
    if (!response.parsed_output) return Response.json({ error: 'Hasil ringkasan tidak lengkap, coba lagi.' }, { status: 502 });
    const out = response.parsed_output;
    return Response.json({ ...out, actions: out.actions.map(a => ({ ...a, done: false })), mode: 'ai' });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return Response.json({ error: 'Kunci API Anthropic tidak valid.' }, { status: 500 });
    if (error instanceof Anthropic.RateLimitError) return Response.json({ error: 'Terlalu banyak permintaan, coba sebentar lagi.' }, { status: 429 });
    if (error instanceof Anthropic.APIError) return Response.json({ error: `Layanan AI error (${error.status}).` }, { status: 502 });
    return Response.json({ error: 'Gagal menghubungi layanan AI.' }, { status: 502 });
  }
}
