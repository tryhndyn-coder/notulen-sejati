// Memotong rekaman panjang di browser menjadi potongan WAV kecil (16 kHz mono)
// supaya tiap potongan muat dikirim ke server (batas Vercel ±4,5 MB).

export const SAMPLE_RATE = 16000;
export const CHUNK_SECONDS = 110; // ±3,5 MB per potongan
export const MAX_FILE_MB = 500;

import MP4Box from 'mp4box';

/** Penurun laju sampel bertahap: rata-rata kotak dari laju asal ke 16 kHz. */
function makeResampler(fromRate, capacity) {
  const ratio = fromRate / SAMPLE_RATE;
  let out = new Float32Array(Math.max(capacity, SAMPLE_RATE));
  let n = 0, sum = 0, cnt = 0, pos = 0, next = ratio;
  return {
    push(mono) {
      for (let i = 0; i < mono.length; i++) {
        sum += mono[i]; cnt++; pos++;
        if (pos >= next) {
          if (n >= out.length) { const g = new Float32Array(out.length * 2); g.set(out); out = g; }
          out[n++] = sum / cnt; sum = 0; cnt = 0; next += ratio;
        }
      }
    },
    result() { return out.subarray(0, n); }
  };
}

/** Jalur utama untuk M4A/MP4: dibaca bertahap dengan WebCodecs (hemat memori, andal di Windows). */
async function decodeMp4(file) {
  if (typeof AudioDecoder === 'undefined') throw new Error('WebCodecs tidak tersedia');
  const mp4 = MP4Box.createFile();
  let info = null, mp4err = null;
  mp4.onReady = i => { info = i; };
  mp4.onError = e => { mp4err = e; };
  const STEP = 8 * 1048576;
  for (let o = 0; o < file.size; o += STEP) {
    const buf = await file.slice(o, o + STEP).arrayBuffer();
    buf.fileStart = o;
    mp4.appendBuffer(buf);
  }
  mp4.flush();
  if (mp4err || !info) throw new Error('Struktur file MP4/M4A tidak terbaca');
  const track = info.audioTracks?.[0];
  if (!track) throw new Error('Tidak ada jalur audio di file ini');
  const trak = mp4.getTrackById(track.id);
  const entry = trak.mdia.minf.stbl.stsd.entries[0];
  let description;
  try { description = entry.esds.esd.descs[0].descs[0].data; } catch { /* bukan AAC */ }
  const config = { codec: track.codec.startsWith('mp4a') ? track.codec : 'mp4a.40.2', sampleRate: track.audio.sample_rate, numberOfChannels: track.audio.channel_count, ...(description ? { description } : {}) };
  const ok = await AudioDecoder.isConfigSupported(config).catch(() => ({ supported: false }));
  if (!ok.supported) throw new Error(`Codec ${config.codec} tidak didukung browser`);

  const duration = info.duration / info.timescale || track.duration / track.timescale || 0;
  const rs = makeResampler(track.audio.sample_rate, Math.ceil(duration * SAMPLE_RATE) + SAMPLE_RATE);
  let decErr = null;
  const dec = new AudioDecoder({
    output: data => {
      const ch = data.numberOfChannels, len = data.numberOfFrames;
      const mono = new Float32Array(len), tmp = new Float32Array(len);
      for (let c = 0; c < ch; c++) {
        data.copyTo(tmp, { planeIndex: c, format: 'f32-planar' });
        for (let i = 0; i < len; i++) mono[i] += tmp[i] / ch;
      }
      data.close();
      rs.push(mono);
    },
    error: e => { decErr = e; }
  });
  dec.configure(config);
  const done = new Promise(res => {
    mp4.onSamples = (id, user, samples) => {
      for (const s of samples) {
        dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: Math.round(s.cts * 1e6 / s.timescale), duration: Math.round(s.duration * 1e6 / s.timescale), data: s.data }));
      }
      if (samples.length && samples[samples.length - 1].number >= track.nb_samples - 1) res();
    };
  });
  mp4.setExtractionOptions(track.id, null, { nbSamples: 500 });
  mp4.start();
  await Promise.race([done, new Promise(r => setTimeout(r, 2000))]);
  await dec.flush();
  dec.close();
  if (decErr) throw new Error(`Gagal mendekode audio: ${decErr.message}`);
  const out = rs.result();
  if (out.length < SAMPLE_RATE) throw new Error('Audio hasil baca kosong');
  return out;
}

/** Jalur cadangan: decodeAudioData (untuk MP3, WAV, dan format lain). */
async function decodeWebAudio(file) {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctx) throw new Error('Browser ini tidak bisa membaca audio. Gunakan Chrome atau Edge terbaru.');
  const buf = await file.arrayBuffer();
  const ctx = new Ctx(1, 1, SAMPLE_RATE);
  const audio = await ctx.decodeAudioData(buf);
  if (audio.sampleRate === SAMPLE_RATE && audio.numberOfChannels === 1) return audio.getChannelData(0);
  const off = new Ctx(1, Math.ceil(audio.duration * SAMPLE_RATE), SAMPLE_RATE);
  const src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start();
  return (await off.startRendering()).getChannelData(0);
}

/** Ubah file audio/video menjadi Float32Array mono 16 kHz. */
export async function decodeToMono(file) {
  const isMp4 = /\.(m4a|mp4|mov|aac)$/i.test(file.name || '') || /mp4|m4a|quicktime/.test(file.type || '');
  const errors = [];
  if (isMp4) { try { return await decodeMp4(file); } catch (e) { errors.push(e.message); } }
  try { return await decodeWebAudio(file); } catch (e) { errors.push(e?.message || String(e)); }
  if (errors.some(m => /tidak bisa membaca audio/.test(m))) throw new Error(errors.find(m => /tidak bisa membaca audio/.test(m)));
  throw new Error(`Rekaman tidak bisa dibaca browser (${errors.join('; ')}). Coba Chrome atau Edge terbaru, atau simpan ulang sebagai MP3.`);
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
