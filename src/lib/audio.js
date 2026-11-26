// Memotong rekaman panjang di browser menjadi potongan WAV kecil (16 kHz mono)
// supaya tiap potongan muat dikirim ke server (batas Vercel ±4,5 MB).

export const SAMPLE_RATE = 16000;
export const CHUNK_SECONDS = 110; // ±3,5 MB per potongan
export const MAX_FILE_MB = 500;

/** Ubah file audio/video menjadi Float32Array mono 16 kHz. */
export async function decodeToMono(file) {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctx) throw new Error('Browser ini tidak bisa membaca audio. Gunakan Chrome atau Edge terbaru.');
  const buf = await file.arrayBuffer();
  const ctx = new Ctx(1, 1, SAMPLE_RATE);
  let audio;
  try { audio = await ctx.decodeAudioData(buf); }
  catch { throw new Error('Format rekaman tidak bisa dibaca browser. Coba file M4A atau MP3 (Zoom: "Audio only").'); }
  if (audio.sampleRate === SAMPLE_RATE && audio.numberOfChannels === 1) return audio.getChannelData(0);
  // Campur ke mono dan samakan laju sampel bila browser tidak melakukannya.
  const off = new Ctx(1, Math.ceil(audio.duration * SAMPLE_RATE), SAMPLE_RATE);
  const src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start();
  const out = await off.startRendering();
  return out.getChannelData(0);
}

/** Cari titik paling sunyi di sekitar batas potongan supaya kata tidak terpotong. */
export function splitPoints(samples, rate = SAMPLE_RATE, chunkSec = CHUNK_SECONDS, searchSec = 4) {
  const points = [0];
  const win = Math.floor(rate * 0.05);
  let pos = 0;
  while (samples.length - pos > chunkSec * rate) {
    const target = pos + chunkSec * rate;
    let best = target, bestE = Infinity;
    for (let s = target - searchSec * rate; s + win <= target; s += win) {
      let e = 0; for (let i = s; i < s + win; i++) e += samples[i] * samples[i];
      if (e < bestE) { bestE = e; best = s + Math.floor(win / 2); }
    }
    points.push(best); pos = best;
  }
  points.push(samples.length);
  return points;
}

/** Encode Float32Array menjadi WAV PCM 16-bit. */
export function encodeWav(samples, rate = SAMPLE_RATE) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** Hasilkan potongan {start, blob} dari rekaman. */
export function* chunks(samples, rate = SAMPLE_RATE) {
  const p = splitPoints(samples, rate);
  for (let i = 0; i < p.length - 1; i++) {
    yield { index: i, total: p.length - 1, start: p[i] / rate, blob: encodeWav(samples.subarray(p[i], p[i + 1]), rate) };
  }
}

/**
 * Transkripsi rekaman panjang potongan demi potongan.
 * transcribeOne(blob, name) -> { rows:[{t,d,text}] }; onProgress(done,total)
 */
export async function transcribeLong(file, transcribeOne, onProgress = () => {}) {
  if (file.size > MAX_FILE_MB * 1048576) throw new Error(`File terlalu besar (${Math.round(file.size / 1048576)} MB). Simpan rekaman Zoom sebagai "Audio only" (M4A).`);
  onProgress(0, 0, 'decode');
  const samples = await decodeToMono(file);
  const list = [...chunks(samples)];
  const rows = [];
  for (const c of list) {
    onProgress(c.index, c.total, 'chunk');
    let res, tries = 0;
    for (;;) {
      try { res = await transcribeOne(c.blob, `bagian-${c.index + 1}.wav`); break; }
      catch (e) {
        tries++;
        if (tries >= 4 || !/429|terlalu banyak|50\d|sibuk/i.test(e.message)) throw new Error(`Bagian ${c.index + 1} dari ${c.total} gagal: ${e.message}`);
        await new Promise(r => setTimeout(r, 5000 * tries));
      }
    }
    for (const r of res.rows) rows.push({ ...r, t: Math.floor(c.start + (r.t || 0)) });
  }
  onProgress(list.length, list.length, 'done');
  return rows;
}
