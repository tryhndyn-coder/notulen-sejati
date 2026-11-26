// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within, cleanup } from '@testing-library/react';
import App from '../App.jsx';

const json = (b, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } }));

beforeEach(() => {
  cleanup(); localStorage.clear(); vi.useRealTimers();
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
  Element.prototype.scrollIntoView = () => {};
  URL.createObjectURL = () => 'blob:x'; URL.revokeObjectURL = () => {};
});

describe('Notulen Sejati', () => {
  it('mode demo saat server tidak ada: contoh hasil, tab, centang tugas, cek transkrip', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('offline')));
    render(<App />);
    expect(screen.getByText('Notulen Sejati')).toBeTruthy();
    await screen.findByText(/Mode demo/);
    fireEvent.click(screen.getByText('Lihat contoh hasil'));
    expect(screen.getAllByText(/sumber/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('tab', { name: /Tugas/ }));
    const boxes = screen.getAllByLabelText('Tandai selesai');
    fireEvent.click(boxes[0]);
    expect(screen.getByRole('tab', { name: 'Tugas (6)' })).toBeTruthy();
    fireEvent.click(screen.getByText('+ Tambah tugas'));
    expect(screen.getAllByLabelText('Tugas')).toHaveLength(8);
    fireEvent.click(screen.getByRole('tab', { name: 'Transkrip' }));
    const before = screen.getByText(/bagian perlu dicek/).textContent;
    fireEvent.click(screen.getAllByText('Sudah benar')[0]);
    expect(screen.getByText(/bagian perlu dicek/).textContent).not.toBe(before);
    // perbaiki kalimat
    fireEvent.click(screen.getAllByText('Perbaiki')[0]);
    const inp = screen.getByLabelText('Perbaiki kalimat');
    fireEvent.change(inp, { target: { value: 'Kalimat <b>baru</b>' } });
    fireEvent.click(screen.getByText('Simpan'));
    expect(screen.getByText('Kalimat <b>baru</b>')).toBeTruthy();
    // klik sumber pindah ke transkrip
    fireEvent.click(screen.getByRole('tab', { name: 'Ringkasan' }));
    fireEvent.click(screen.getAllByText(/^sumber/)[0]);
    expect(screen.getByRole('tab', { name: 'Transkrip' }).getAttribute('aria-selected')).toBe('true');
    // riwayat tersimpan
    fireEvent.click(screen.getByText(/Riwayat \(1\)/));
    expect(screen.getByText('Briefing Pagi Tim Lapangan')).toBeTruthy();
  });

  it('ekspor: peringatan bila belum dicek, salin teks fallback, unduh docx', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('offline')));
    render(<App />);
    fireEvent.click(screen.getByText('Lihat contoh hasil'));
    fireEvent.click(screen.getByText('Ekspor ke Google Docs'));
    expect(screen.getByText(/belum dicek/)).toBeTruthy();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('no')) }, configurable: true });
    await act(async () => { fireEvent.click(screen.getByText('Salin teks')); });
    expect(screen.getByLabelText('Teks notulen').value).toContain('NOTULEN RAPAT');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Unduh .docx' })); });
    await waitFor(() => expect(click).toHaveBeenCalled());
    fireEvent.click(screen.getByText('Tutup'));
    expect(screen.queryByRole('button', { name: 'Unduh .docx' })).toBeNull();
  });

  it('transkrip tempel tanpa AI memakai ekstraksi sederhana dan membersihkan halusinasi', async () => {
    global.fetch = vi.fn(u => String(u).includes('config') ? json({ summarize: false, transcribe: false }) : json({}, 500));
    render(<App />);
    await screen.findByText(/Ringkasan AI belum aktif/, {}, { timeout: 2000 }).catch(() => {});
    fireEvent.click(screen.getByRole('tab', { name: 'Teks' }));
    fireEvent.change(screen.getByLabelText('Transkrip'), { target: { value: 'Pak Rustam: Kita sepakat penawaran ke Tornasa masuk hari ini.\nPak Rustam: Pak Murat, tolong kirim harga ke grup.\nAndi: Terima kasih telah menonton\nAndi: baik baik baik baik baik baik' } });
    fireEvent.change(screen.getByLabelText('Judul rapat'), { target: { value: 'Rapat uji' } });
    fireEvent.click(screen.getByText('Buat notulen'));
    await screen.findByDisplayValue('Rapat uji');
    expect(screen.getByDisplayValue(/penawaran ke Tonasa/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Tugas/ }));
    expect(screen.getByDisplayValue('Pak Murad')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Transkrip' }));
    expect(document.querySelector('.tx').textContent).not.toMatch(/menonton/);
    expect(screen.getByText(/1 kalimat palsu dibuang, 1 pengulangan dipotong/)).toBeTruthy();
  });

  it('ringkasan AI dipakai bila server aktif', async () => {
    global.fetch = vi.fn((u) => String(u).includes('config') ? json({ summarize: true, transcribe: false })
      : json({ summary: 'Ringkasan dari AI.', decisions: [{ text: 'Keputusan AI', src: 0 }], points: [], actions: [{ task: 'Tugas AI', owner: 'Budi', due: '2026-12-01', src: 0, done: false }], needs_check: [{ text: 'Tonasa', src: 0, reason: 'nama perusahaan' }], mode: 'ai' }));
    render(<App />);
    await screen.findByText(/Ringkasan AI aktif/);
    fireEvent.click(screen.getByRole('tab', { name: 'Teks' }));
    fireEvent.change(screen.getByLabelText('Transkrip'), { target: { value: 'Budi: Kita sepakat ke Tonasa.' } });
    fireEvent.click(screen.getByText('Buat notulen'));
    await screen.findByDisplayValue('Ringkasan dari AI.');
    expect(screen.getByText('Ringkasan AI', { selector: '.tag' })).toBeTruthy();
    expect(screen.getByText(/1 bagian perlu dicek/)).toBeTruthy();
  });

  it('rekaman besar dipotong di browser; browser tanpa dukungan audio memberi pesan jelas', async () => {
    global.fetch = vi.fn(u => json({ summarize: false, transcribe: true }));
    render(<App />);
    await screen.findByText(/Transkripsi aktif/);
    const big = new File([new Uint8Array(5 * 1024 * 1024)], 'rapat.m4a', { type: 'audio/mp4' });
    fireEvent.change(document.querySelector('input[type=file]'), { target: { files: [big] } });
    fireEvent.click(screen.getByText('Buat notulen'));
    await screen.findByText(/tidak bisa membaca audio/);
  });

  it('mode live: transkrip berjalan lalu notulen final', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('offline')));
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Live' }));
    fireEvent.click(screen.getByText('Gabung rapat & mulai mencatat'));
    await screen.findByText(/sosialisasi bersama Pak Ambo/, {}, { timeout: 3000 });
    fireEvent.click(screen.getByText('Percepat demo'));
    fireEvent.click(screen.getByText('Akhiri & buat notulen final'));
    expect(screen.getByText('Ekspor ke Google Docs')).toBeTruthy();
  });

  it('kamus istilah bisa ditambah dan disimpan', () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('offline')));
    render(<App />);
    fireEvent.click(screen.getByText('Kamus istilah', { selector: 'button' }));
    fireEvent.click(screen.getByText('+ Tambah istilah'));
    const outs = screen.getAllByLabelText('Ejaan benar');
    fireEvent.change(outs[outs.length - 1], { target: { value: 'Sejati' } });
    fireEvent.click(screen.getByText('Simpan kamus'));
    expect(JSON.parse(localStorage.getItem('notulen.vocab')).some(v => v.to === 'Sejati')).toBe(true);
  });
});
