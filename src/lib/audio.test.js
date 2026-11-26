import { describe, it, expect } from 'vitest';
import { splitPoints, encodeWav, chunks, transcribeLong } from './audio.js';

const tone = (sec, rate = 16000) => { const a = new Float32Array(sec * rate); for (let i = 0; i < a.length; i++) a[i] = 0.5 * Math.sin(i / 5); return a; };

describe('potong audio', () => {
  it('rekaman pendek tidak dipotong', () => { expect(splitPoints(tone(60))).toEqual([0, 960000]); });
  it('memotong di titik sunyi dekat batas', () => {
    const a = tone(250); a.fill(0, 108 * 16000, 108.5 * 16000);
    const p = splitPoints(a);
    expect(p.length).toBe(4);
    expect(p[1] / 16000).toBeGreaterThan(107.9); expect(p[1] / 16000).toBeLessThan(108.6);
  });
  it('setiap potongan WAV di bawah 4 MB', () => {
    for (const c of chunks(tone(600))) expect(c.blob.size).toBeLessThan(4 * 1024 * 1024);
  });
  it('header WAV benar', async () => {
    const b = encodeWav(new Float32Array(16000));
    expect(b.size).toBe(44 + 32000);
    const t = new TextDecoder().decode(new Uint8Array(await b.arrayBuffer()).slice(0, 4));
    expect(t).toBe('RIFF');
  });
});
