// Pengolahan transkrip: baca format, bersihkan halusinasi, koreksi kamus, tandai dialek.

export const DIALECT = {
  kita: 'saya', ngana: 'kamu', torang: 'kita', dorang: 'mereka', nimbole: 'tidak bisa',
  so: 'sudah', kong: 'lalu', pe: 'punya', sto: 'mungkin', mo: 'mau', pigi: 'pergi',
  bekeng: 'bikin', tako: 'takut', ji: '(penegas: saja)', mi: '(penegas: sudah)',
  ki: '(sapaan sopan: Anda)', "iye'": 'iya (sopan)', "tabe'": 'permisi', kodong: 'kasihan',
  'baku dapa': 'bertemu', pale: '(penegas: kalau begitu)', tawwa: '(ungkapan kagum)'
};

// Kamus sementara hasil uji rekaman briefing. Bisa diubah pengguna di aplikasi.
export const DEFAULT_VOCAB = [
  { from: 'Kuala Katimur, Kola kat Timur, Polakat Timur, Kulaka Timur, Kolakatimur', to: 'Kolaka Timur' },
  { from: 'demprot, gemprot, lemprot, demprat, jamplot, jam plot, temprot, dem plot', to: 'demplot' },
  { from: 'Pak Lin, Pak Wawlin, Pak Berlin, Pak Barlin, bapak Lim', to: 'Pak Parlin' },
  { from: 'Pambo', to: 'Pak Ambo' },
  { from: 'Pak Irham', to: 'Pak Ilham' },
  { from: 'Pak Murat, Pak Mura', to: 'Pak Murad' },
  { from: 'Ruzdi', to: 'Rusdi' },
  { from: 'Tornasa', to: 'Tonasa' },
  { from: 'Pak Julang, Pak Juwan, Pajuan', to: 'Pak Juang' }
];

const HALLUCINATIONS = [
  /terima kasih (telah|sudah) menonton/i, /selamat menikmati/i, /jangan lupa (like|subscribe)/i,
  /\bsubscribe\b/i, /^i'?m living/i, /sampai jumpa di video/i
];

const pad = n => String(n).padStart(2, '0');
export const fmtTime = s => `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}`;
export const toSec = t => { const p = String(t).split(':').map(Number); return p.reduce((a, b) => a * 60 + b, 0) || 0; };

/** Format "Nama: teks" per baris. Baris tanpa nama ikut pembicara sebelumnya. */
export function parsePlain(text) {
  const rows = []; let last = 'Pembicara';
  text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach((line, i) => {
    const m = line.match(/^(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*)?([^:]{1,40}?):\s+(.+)$/);
    const tm = line.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+(.+)$/);
    if (m && !/^\d+$/.test(m[2])) { last = m[2].trim(); rows.push({ t: m[1] ? toSec(m[1]) : i * 20, who: last, text: m[3] }); }
    else if (tm) rows.push({ t: toSec(tm[1]), who: last, text: tm[2] });
    else rows.push({ t: i * 20, who: last, text: line });
  });
  return rows;
}

/** Transkrip Zoom (.vtt). Zoom menulis "Nama: teks" di dalam cue. */
export function parseVTT(text) {
  const rows = [];
  const blocks = text.replace(/\r/g, '').split(/\n\n+/);
  for (const b of blocks) {
    const lines = b.split('\n').filter(Boolean);
    const ti = lines.findIndex(l => l.includes('-->'));
    if (ti < 0) continue;
    const start = lines[ti].split('-->')[0].trim().replace(',', '.');
    const body = lines.slice(ti + 1).join(' ').trim();
    if (!body) continue;
    const m = body.match(/^([^:]{1,40}):\s+(.+)$/);
    rows.push({ t: Math.floor(toSec(start.split('.')[0])), who: m ? m[1].trim() : 'Pembicara', text: m ? m[2] : body });
  }
  return mergeConsecutive(rows);
}

export function parseTranscript(text) {
  return /^WEBVTT/.test(text.trim()) || /\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(text) ? parseVTT(text) : parsePlain(text);
}

function mergeConsecutive(rows) {
  const out = [];
  for (const r of rows) {
    const p = out[out.length - 1];
    if (p && p.who === r.who && r.t - p.t < 60 && p.text.length < 400) p.text += ' ' + r.text;
    else out.push({ ...r });
  }
  return out;
}

/** Potong kata/frasa yang diulang lebih dari 3 kali berturut-turut. */
export function collapseRepeats(text) {
  let tok = text.split(/\s+/).filter(Boolean);
  const norm = w => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  for (let k = 1; k <= 4; k++) {
    const out = [];
    let i = 0;
    while (i < tok.length) {
      let reps = 1;
      const same = j => { for (let x = 0; x < k; x++) if (j + x >= tok.length || norm(tok[j + x]) !== norm(tok[i + x])) return false; return true; };
      while (same(i + reps * k)) reps++;
      if (reps >= 4) { out.push(...tok.slice(i + (reps - 1) * k, i + reps * k)); i += reps * k; }
      else { out.push(tok[i]); i++; }
    }
    tok = out;
  }
  return tok.join(' ');
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function applyVocab(text, vocab) {
  let out = text; let n = 0;
  for (const v of vocab || []) {
    const froms = String(v.from || '').split(',').map(s => s.trim()).filter(Boolean);
    for (const f of froms) {
      const re = new RegExp(`(^|[^\\p{L}])${esc(f)}(?=$|[^\\p{L}])`, 'giu');
      out = out.replace(re, (m, pre) => { n++; return pre + v.to; });
    }
  }
  return { text: out, count: n };
}

export function dialectWords(text) {
  const low = ' ' + text.toLowerCase().replace(/[.,?!]/g, ' ') + ' ';
  return Object.keys(DIALECT).filter(k => low.includes(' ' + k + ' '));
}

/**
 * Bersihkan transkrip: buang halusinasi, potong pengulangan, koreksi kamus,
 * dan tandai baris yang perlu dicek manusia.
 */
export function cleanTranscript(rows, vocab) {
  const stats = { removed: 0, collapsed: 0, corrected: 0, flagged: 0 };
  const out = [];
  for (const r of rows) {
    let text = String(r.text || '').trim();
    if (!text) continue;
    if (HALLUCINATIONS.some(re => re.test(text))) { stats.removed++; continue; }
    const flags = [...(r.flags || [])];
    const stretched = text.replace(/(\p{L})\1{4,}/gu, '$1$1');
    if (stretched !== text) { flags.push('Ada bunyi panjang yang tidak jelas'); text = stretched; }
    const c = collapseRepeats(text);
    if (c !== text) { stats.collapsed++; flags.push('Ada kata berulang yang dipotong'); text = c; }
    const v = applyVocab(text, vocab); text = v.text; stats.corrected += v.count;
    const words = text.split(/\s+/).length;
    if (/^terima kasih\.?$/i.test(text) && (r.d ?? 2) < 1.6) flags.push('Mungkin bukan ucapan asli');
    else if (words <= 2 && !/^(ya|iya|oke|ok|baik|siap|halo)[\s,.!?a-z]*$/i.test(text)) flags.push('Kalimat sangat pendek, mungkin terpotong');
    if (flags.length) stats.flagged++;
    out.push({ ...r, text, flags, ok: !flags.length });
  }
  return { rows: out, stats };
}

/** Ekstraksi sederhana tanpa AI: kalimat kesepakatan dan permintaan tugas. */
export function extractHeuristic(rows) {
  const decisions = [], actions = [], points = [];
  for (const r of rows) {
    const lo = r.text.toLowerCase();
    if (/(sepakat|putuskan|diputuskan|setuju|kita masukkan saja|bisa ji)/.test(lo)) decisions.push({ text: r.text, src: r.t });
    const who = (r.text.match(/\b((?:Pak|Bu|Ibu|Bapak)\s+[A-Z][a-z]+)\b[, ]+(?:tolong|yang pegang|nanti)/) || [])[1];
    if (/(tolong|yang pegang|saya akan|nanti saya|rencana(nya)? hari ini|paling lambat)/.test(lo)) actions.push({ task: r.text, owner: who || r.who, due: '', done: false, src: r.t });
    else if (r.text.length > 90 && points.length < 8) points.push(r.text);
  }
  const people = [...new Set(rows.map(r => r.who))];
  return {
    summary: `Rapat dengan ${people.length} pembicara (${people.join(', ')}). Ringkasan ini dibuat tanpa AI: kalimat yang berisi kesepakatan dan permintaan tugas diambil langsung dari transkrip. Aktifkan ringkasan AI untuk hasil yang lebih rapi.`,
    decisions, actions, points, mode: 'sederhana'
  };
}
