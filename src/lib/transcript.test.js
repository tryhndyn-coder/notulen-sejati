import { describe, it, expect } from 'vitest';
import { parsePlain, parseVTT, parseTranscript, collapseRepeats, applyVocab, cleanTranscript, extractHeuristic, DEFAULT_VOCAB, dialectWords } from './transcript.js';

describe('parse', () => {
  it('baca format Nama: teks dan baris tanpa nama', () => {
    const r = parsePlain('Pak Hendra: Selamat pagi\nlanjutan kalimat\n05:10 Ibu Rahma: Iye Pak');
    expect(r.map(x => x.who)).toEqual(['Pak Hendra', 'Pak Hendra', 'Ibu Rahma']);
    expect(r[2].t).toBe(310);
  });
  it('baca VTT dari Zoom dan gabungkan baris berurutan', () => {
    const v = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nAndi: Halo semua\n\n2\n00:00:05.000 --> 00:00:07.000\nAndi: lanjut ya\n\n3\n00:01:10.500 --> 00:01:12.000\nBudi: Siap';
    const r = parseVTT(v);
    expect(r).toHaveLength(2);
    expect(r[0].text).toBe('Halo semua lanjut ya');
    expect(r[1]).toMatchObject({ t: 70, who: 'Budi' });
    expect(parseTranscript(v)).toHaveLength(2);
  });
});

describe('pembersihan', () => {
  it('potong pengulangan dari mesin', () => {
    expect(collapseRepeats('baik baik baik baik baik baik baik')).toBe('baik');
    expect(collapseRepeats('Iya, siap. Iya, siap. Iya, siap. Iya, siap. Iya, siap.')).toBe('Iya, siap.');
    expect(collapseRepeats('ini kalimat biasa')).toBe('ini kalimat biasa');
  });
  it('koreksi kamus tanpa merusak kata lain', () => {
    expect(applyVocab('Kemarin di Kuala Katimur ada demprot', DEFAULT_VOCAB).text).toBe('Kemarin di Kolaka Timur ada demplot');
    expect(applyVocab('Pak Lin hadir, Linda juga', DEFAULT_VOCAB).text).toBe('Pak Parlin hadir, Linda juga');
  });
  it('buang halusinasi dan tandai baris meragukan', () => {
    const { rows, stats } = cleanTranscript([
      { t: 0, who: 'A', text: 'Terima kasih telah menonton' },
      { t: 5, who: 'A', text: 'Terima kasih.', d: 0.9 },
      { t: 9, who: 'B', text: 'Order 60 sak dolomit ke Kola kat Timur' }
    ], DEFAULT_VOCAB);
    expect(stats.removed).toBe(1);
    expect(rows[0].flags.length).toBe(1);
    expect(rows[1].text).toContain('Kolaka Timur');
    expect(rows[1].ok).toBe(true);
  });
  it('kenali kata dialek', () => {
    expect(dialectWords('Torang so sepakat, bisa ji Pak')).toEqual(expect.arrayContaining(['torang', 'so', 'ji']));
  });
});

describe('ekstraksi sederhana', () => {
  it('ambil keputusan dan tugas', () => {
    const r = extractHeuristic([
      { t: 0, who: 'Pak Rustam', text: 'Kita sepakat penawaran masuk minggu ini.' },
      { t: 20, who: 'Pak Rustam', text: 'Pak Murad, tolong kirim harga ke grup.' }
    ]);
    expect(r.decisions).toHaveLength(1);
    expect(r.actions[0].owner).toBe('Pak Murad');
  });
});
