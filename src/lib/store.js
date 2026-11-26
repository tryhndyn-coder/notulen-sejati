// Penyimpanan di browser (riwayat notulen & kamus). Aman bila localStorage tidak tersedia.
import { DEFAULT_VOCAB } from './transcript.js';

const get = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export const loadVocab = () => get('notulen.vocab', DEFAULT_VOCAB);
export const saveVocab = v => set('notulen.vocab', v);
export const loadHistory = () => get('notulen.history', []);
export function saveMeeting(m) {
  const h = loadHistory().filter(x => x.id !== m.id);
  h.unshift({ ...m, savedAt: new Date().toISOString() });
  set('notulen.history', h.slice(0, 30));
  return h.slice(0, 30);
}
export function deleteMeeting(id) { const h = loadHistory().filter(x => x.id !== id); set('notulen.history', h); return h; }
