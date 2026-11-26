import { useEffect, useMemo, useRef, useState } from 'react';
import { parseTranscript, cleanTranscript, extractHeuristic, dialectWords, DIALECT, fmtTime } from './lib/transcript.js';
import { SAMPLE_ROWS, SAMPLE_MINUTES, SAMPLE_TITLE, LIVE_EVENTS } from './lib/sample.js';
import { loadVocab, saveVocab, loadHistory, saveMeeting, deleteMeeting } from './lib/store.js';
import { getConfig, summarize, transcribe, MAX_UPLOAD_MB } from './lib/api.js';
import { minutesText, minutesDocx, fmtDate } from './lib/exportDoc.js';

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = o => JSON.parse(JSON.stringify(o));

export default function App() {
  const [view, setView] = useState('baru');
  const [cfg, setCfg] = useState(null);
  const [vocab, setVocab] = useState(loadVocab);
  const [history, setHistory] = useState(loadHistory);
  const [meeting, setMeeting] = useState(null);
  const [toast, setToast] = useState('');
  const tRef = useRef();

  useEffect(() => { getConfig().then(setCfg); }, []);
  const say = m => { setToast(m); clearTimeout(tRef.current); tRef.current = setTimeout(() => setToast(''), 3200); };

  const update = (fn) => setMeeting(m => {
    const next = fn(clone(m));
    setHistory(saveMeeting(next));
    return next;
  });
  const open = m => { setMeeting(m); if (!m.demo) setHistory(saveMeeting(m)); setView('baru'); };

  return (
    <>
      <header className="top">
        <div className="brand"><span className="dot" />Notulen Sejati</div>
        <nav className="nav" aria-label="Menu">
          {[['baru', 'Rapat baru'], ['riwayat', `Riwayat (${history.length})`], ['kamus', 'Kamus istilah']].map(([k, l]) =>
            <button key={k} aria-current={view === k ? 'page' : undefined} onClick={() => setView(k)}>{l}</button>)}
        </nav>
        <Status cfg={cfg} />
      </header>

      {view === 'baru' && <NewMeeting cfg={cfg} vocab={vocab} meeting={meeting} setMeeting={open} update={update} say={say} />}
      {view === 'riwayat' && <History items={history} onOpen={open} onDelete={id => { setHistory(deleteMeeting(id)); if (meeting?.id === id) setMeeting(null); }} />}
      {view === 'kamus' && <Vocab vocab={vocab} onSave={v => { setVocab(v); saveVocab(v); say('Kamus istilah disimpan.'); }} />}

      <div className={`toast ${toast ? 'on' : ''}`} role="status">{toast}</div>
    </>
  );
}

function Status({ cfg }) {
  if (!cfg) return <div className="status">Memeriksa server…</div>;
  if (cfg.offline) return <div className="status demo">Mode demo · server belum terhubung</div>;
  return <div className="status">
    <span className={cfg.transcribe ? 'on' : ''}>Transkripsi {cfg.transcribe ? 'aktif' : 'belum aktif'}</span>
    <span className={cfg.summarize ? 'on' : ''}>Ringkasan AI {cfg.summarize ? 'aktif' : 'belum aktif'}</span>
  </div>;
}

/* ---------------- Rapat baru ---------------- */

function NewMeeting({ cfg, vocab, meeting, setMeeting, update, say }) {
  const [mode, setMode] = useState('rekaman');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today());
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [live, setLive] = useState(null);

  const steps = ['Mengubah suara jadi teks', 'Membersihkan & mengoreksi istilah', 'Menyusun ringkasan & tugas'];

  async function buildMinutes(rows, label) {
    const { rows: clean, stats } = cleanTranscript(rows, vocab);
    if (!clean.length) throw new Error('Transkrip kosong setelah dibersihkan.');
    setBusy({ step: 2, label });
    let minutes;
    if (cfg?.summarize) {
      try { minutes = await summarize({ title, rows: clean, vocab }); }
      catch (e) { say(`Ringkasan AI gagal: ${e.message} Memakai ringkasan sederhana.`); }
    }
    if (!minutes) minutes = extractHeuristic(clean);
    for (const n of minutes.needs_check || []) {
      const r = clean.find(x => x.t === n.src);
      if (r) { r.flags = [...r.flags, `${n.text}: ${n.reason}`]; r.ok = false; }
    }
    return { rows: clean, stats, minutes };
  }

  async function start() {
    setError('');
    const t = title.trim() || (mode === 'live' ? SAMPLE_TITLE : 'Rapat');
    try {
      if (mode === 'live') { setLive({ startedAt: Date.now() }); return; }
      let result, demo = false;
      if (mode === 'transkrip') {
        if (!text.trim()) { setError('Tempel transkrip atau pilih file .vtt/.txt dulu.'); return; }
        setBusy({ step: 1 });
        result = await buildMinutes(parseTranscript(text));
      } else {
        if (file && cfg?.transcribe && file.size <= MAX_UPLOAD_MB * 1024 * 1024) {
          setBusy({ step: 0 });
          const prompt = vocab.map(v => v.to).join(', ');
          const { rows } = await transcribe(file, 'id', prompt);
          setBusy({ step: 1 });
          result = await buildMinutes(rows);
        } else {
          if (file && !cfg?.transcribe) setError(`Rekaman "${file.name}" belum bisa diproses karena transkripsi belum diaktifkan (API key transkripsi belum diisi di pengaturan Vercel). Yang tampil di kanan hanya contoh. Untuk sementara, pakai transkrip .vtt dari Zoom di tab "Teks", atau kirim rekamannya di chat untuk ditranskripsi.`);
          if (file && cfg?.transcribe) setError(`File ${(file.size / 1048576).toFixed(1)} MB terlalu besar untuk diunggah langsung (maksimal ${MAX_UPLOAD_MB} MB). Untuk sementara, unduh transkrip .vtt dari Zoom lalu pakai tab "Transkrip". Di bawah ini contoh hasilnya.`);
          demo = true;
          for (const s of [0, 1, 2]) { setBusy({ step: s }); await new Promise(r => setTimeout(r, 550)); }
          result = { rows: clone(SAMPLE_ROWS), stats: { removed: 3, collapsed: 8, corrected: 26, flagged: 4 }, minutes: clone(SAMPLE_MINUTES) };
        }
      }
      setMeeting({ id: uid(), title: demo && !title.trim() ? SAMPLE_TITLE : t, date, demo, ...result });
    } catch (e) {
      setError(e.message || 'Terjadi kesalahan.');
    } finally { setBusy(null); }
  }

  function finishLive(rows) {
    setLive(null);
    setMeeting({ id: uid(), title: title.trim() || SAMPLE_TITLE, date, demo: true, rows: clone(rows), stats: { removed: 3, collapsed: 8, corrected: 26, flagged: 4 }, minutes: clone(SAMPLE_MINUTES) });
    say('Notulen final dibuat ulang dari rekaman lengkap.');
  }

  const showSample = () => setMeeting({ id: 'contoh', title: SAMPLE_TITLE, date, demo: true, rows: clone(SAMPLE_ROWS), stats: { removed: 3, collapsed: 8, corrected: 26, flagged: 4 }, minutes: clone(SAMPLE_MINUTES) });
  useEffect(() => { if (location.hash === '#contoh' && !meeting) showSample(); }, []);

  const offlineNote = cfg?.offline || (mode === 'rekaman' && !cfg?.transcribe);

  return (
    <main className="grid">
      <section className="panel" aria-label="Masukan rapat">
        <h1>Rapat baru</h1>
        <p className="sub">Pilih sumber rapat, lalu buat notulen.</p>
        <div className="seg" role="tablist">
          {[['live', 'Live'], ['rekaman', 'Rekaman'], ['transkrip', 'Teks']].map(([k, l]) =>
            <button key={k} role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setError(''); }}>{l}</button>)}
        </div>

        {mode === 'live' && <div>
          <label className="f" htmlFor="zid">ID atau tautan rapat Zoom</label>
          <input id="zid" type="text" placeholder="https://zoom.us/j/…" defaultValue="" />
          <p className="note">Asisten notulen masuk ke rapat sebagai peserta "Notulen" dan semua peserta diberi tahu bahwa rapat ditranskripsi. <b>Saat ini masih demo</b>: koneksi Zoom sungguhan butuh aplikasi Zoom Marketplace.</p>
        </div>}

        {mode === 'rekaman' && <div>
          <FileDrop accept="audio/*,video/*,.m4a,.mp4,.mp3,.wav" file={file} onFile={setFile} label="Pilih atau seret rekaman" hint={`MP4, M4A, MP3 · langsung diproses sampai ${MAX_UPLOAD_MB} MB`} />
          {offlineNote && <p className="warnnote"><b>Transkripsi rekaman belum aktif.</b> Rekaman yang dipilih belum diproses, dan yang muncul hanya contoh hasil. Untuk mencoba rapat Anda sendiri, pakai tab <b>Teks</b> dengan file .vtt dari Zoom.</p>}
        </div>}

        {mode === 'transkrip' && <div>
          <FileDrop accept=".vtt,.txt,text/plain,text/vtt" file={null} onFile={async f => { if (f) setText(await f.text()); }} label="Pilih transkrip Zoom (.vtt) atau .txt" hint="Atau tempel teksnya di bawah" />
          <textarea aria-label="Transkrip" value={text} onChange={e => setText(e.target.value)} placeholder={'Format: Nama: isi pembicaraan\nContoh:\nPak Rustam: Kita sepakat penawaran masuk hari ini.'} />
          <button className="link" onClick={() => setText(SAMPLE_ROWS.map(r => `${fmtTime(r.t)} ${r.who}: ${r.text}`).join('\n'))}>Isi dengan transkrip contoh</button>
          {!cfg?.summarize && <p className="note">Ringkasan AI belum aktif, jadi keputusan dan tugas diambil dengan aturan sederhana.</p>}
        </div>}

        <label className="f" htmlFor="title">Judul rapat</label>
        <input id="title" type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={mode === 'live' ? SAMPLE_TITLE : 'Contoh: Briefing pagi tim lapangan'} />
        <label className="f" htmlFor="date">Tanggal</label>
        <input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} />

        <button className="btn pri full" disabled={!!busy || !!live} onClick={start}>
          {mode === 'live' ? 'Gabung rapat & mulai mencatat' : 'Buat notulen'}
        </button>
        {error && <p className="err" role="alert">{error}</p>}
        {busy && <ul className="steps">{steps.map((s, i) =>
          <li key={s} className={i < busy.step ? 'ok' : i === busy.step ? 'run' : ''}><i />{s}</li>)}</ul>}
      </section>

      <section className="sheet" aria-label="Hasil">
        {live ? <LiveView title={title.trim() || SAMPLE_TITLE} onFinish={finishLive} />
          : meeting ? <Result m={meeting} update={update} say={say} />
          : <div className="empty">
              <h2>Notulen akan muncul di sini</h2>
              <ol className="how">
                <li><b>Masukkan rapat.</b> Rekaman Zoom, transkrip .vtt, atau ikut rapat yang sedang berjalan.</li>
                <li><b>Mesin membersihkan.</b> Kalimat palsu dibuang, nama dan istilah dikoreksi dengan kamus, kata dialek diberi arti.</li>
                <li><b>Anda mengecek.</b> Bagian yang meragukan ditandai oranye, lalu notulen diekspor ke Google Docs.</li>
              </ol>
              <button className="btn" onClick={showSample}>Lihat contoh hasil</button></div>}
      </section>
    </main>
  );
}

function FileDrop({ accept, file, onFile, label, hint }) {
  const [over, setOver] = useState(false);
  return (
    <label className={`drop ${over ? 'over' : ''}`}
      onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}>
      <input type="file" accept={accept} onChange={e => onFile(e.target.files[0] || null)} />
      <b>{file ? file.name : label}</b>
      <span className="sub">{file ? `${(file.size / 1048576).toFixed(1)} MB` : hint}</span>
    </label>
  );
}

/* ---------------- Mode live (demo) ---------------- */

function LiveView({ title, onFinish }) {
  const [n, setN] = useState(0);
  const [speed, setSpeed] = useState(1500);
  const box = useRef();
  const rows = SAMPLE_ROWS.slice(0, n);
  useEffect(() => {
    if (n >= SAMPLE_ROWS.length) return;
    const id = setTimeout(() => setN(x => x + 1), n === 0 ? 300 : speed);
    return () => clearTimeout(id);
  }, [n, speed]);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [n]);
  const ev = rows.map(r => LIVE_EVENTS[r.t] && { ...LIVE_EVENTS[r.t], t: r.t }).filter(Boolean);
  const chk = rows.filter(r => r.flags.length);
  const clock = rows.length ? fmtTime(rows[rows.length - 1].t) : '00:00';
  return (
    <div>
      <div className="lhead">
        <div><h2>{title}</h2><div className="sub">Demo mode live · contoh dari rekaman briefing</div></div>
        <span className="rec"><i />{clock}</span>
      </div>
      <p className="consent">Pemberitahuan di chat Zoom: "Rapat ini ditranskripsi otomatis untuk notulen."</p>
      <div className="live">
        <div className="lstream" ref={box} aria-live="polite">
          {rows.map((r, i) => <Line key={i} r={r} />)}
          {n < SAMPLE_ROWS.length && <div className="typing">Mendengarkan…</div>}
        </div>
        <aside className="lside">
          <h3>Keputusan terdeteksi</h3>
          <ul>{ev.filter(e => e.decision).map(e => <li key={'d' + e.t}>{e.decision} <span className="ts">{fmtTime(e.t)}</span></li>)}
            {!ev.some(e => e.decision) && <li className="none">Belum ada.</li>}</ul>
          <h3>Tugas terdeteksi</h3>
          <ul>{ev.filter(e => e.action).map(e => <li key={'a' + e.t}>{e.action[0]} · <b>{e.action[1]}</b> <span className="ts">{fmtTime(e.t)}</span></li>)}
            {!ev.some(e => e.action) && <li className="none">Belum ada.</li>}</ul>
          <h3>Perlu dicek</h3>
          <ul>{chk.map(r => <li key={'c' + r.t}>{r.flags[0]} <span className="ts">{fmtTime(r.t)}</span></li>)}
            {!chk.length && <li className="none">Belum ada.</li>}</ul>
        </aside>
      </div>
      <div className="lfoot">
        <span className="sub grow">Teks live adalah draf cepat. Notulen final dibuat ulang dari rekaman lengkap.</span>
        <button className="btn" onClick={() => setSpeed(s => s === 1500 ? 250 : 1500)}>{speed === 1500 ? 'Percepat demo' : 'Kecepatan normal'}</button>
        <button className="btn pri" onClick={() => onFinish(SAMPLE_ROWS)}>Akhiri & buat notulen final</button>
      </div>
    </div>
  );
}

/* ---------------- Hasil notulen ---------------- */

function Line({ r, onOk, onEdit, active }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(r.text);
  const dw = dialectWords(r.text).filter(k => !DIALECT[k].startsWith('('));
  const save = () => { onEdit(val); setEdit(false); };
  return (
    <div className={`ln ${r.flags.length && !r.ok ? 'chk' : ''} ${active ? 'hl' : ''}`} id={`ln-${r.t}`}>
      <time>{fmtTime(r.t)}</time><b>{r.who}</b>
      <span>
        {edit ? <span className="rv"><input value={val} aria-label="Perbaiki kalimat" onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} /><button onClick={save}>Simpan</button><button onClick={() => setEdit(false)}>Batal</button></span> : r.text}
        {dw.length > 0 && <span className="baku">{dw.map(k => `${k} = ${DIALECT[k]}`).join(' · ')}</span>}
        {onOk && !edit && r.flags.length > 0 && !r.ok && <span className="rv">{r.flags.join(' · ')}. <button onClick={onOk}>Sudah benar</button><button onClick={() => setEdit(true)}>Perbaiki</button></span>}
        {onOk && !edit && (r.ok || !r.flags.length) && <button className="mini" onClick={() => setEdit(true)} aria-label="Ubah kalimat">ubah</button>}
      </span>
    </div>
  );
}

function Result({ m, update, say }) {
  const [tab, setTab] = useState('ring');
  const [hl, setHl] = useState(null);
  const [exp, setExp] = useState(false);
  const n = m.minutes;
  const pending = m.rows.filter(r => r.flags.length && !r.ok).length;
  const pct = Math.round(100 * (m.rows.length - pending) / m.rows.length);
  const people = useMemo(() => [...new Set(m.rows.map(r => r.who))], [m.rows]);
  const jump = t => { setTab('trans'); setHl(t); setTimeout(() => document.getElementById(`ln-${t}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60); setTimeout(() => setHl(null), 1800); };
  const Src = ({ t }) => Number.isFinite(t) ? <button className="src" onClick={() => jump(t)}>sumber {fmtTime(t)}</button> : null;

  return (
    <div>
      <div className="shead">
        <div className="grow">
          <input className="titlein" value={m.title} aria-label="Judul rapat" onChange={e => update(x => { x.title = e.target.value; return x; })} />
          <div className="meta"><span>{fmtDate(m.date)}</span><span>{people.length} pembicara: {people.join(', ')}</span><span>±{fmtTime(m.rows[m.rows.length - 1]?.t || 0)}</span>{m.demo && <span className="tag">Contoh</span>}{n.mode === 'ai' && <span className="tag">Ringkasan AI</span>}</div>
        </div>
        <button className="btn blk" onClick={() => setExp(true)}>Ekspor ke Google Docs</button>
      </div>

      <div className="acc">
        <span><b>{pct}%</b> baris sudah yakin</span>
        <span className="bar"><i style={{ width: pct + '%' }} /></span>
        {pending ? <button className="link" onClick={() => { const f = m.rows.find(r => r.flags.length && !r.ok); if (f) jump(f.t); }}>{pending} bagian perlu dicek</button> : <span className="okc">Semua bagian sudah dicek</span>}
        {m.stats && <span className="sub w100">Dibersihkan otomatis: {m.stats.removed} kalimat palsu dibuang, {m.stats.collapsed} pengulangan dipotong, {m.stats.corrected} istilah dikoreksi.</span>}
      </div>

      <div className="tabs" role="tablist">
        {[['ring', 'Ringkasan'], ['tugas', `Tugas (${n.actions.filter(a => !a.done).length})`], ['trans', 'Transkrip']].map(([k, l]) =>
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'ring' && <div className="tab">
        <textarea className="sumin" aria-label="Ringkasan" value={n.summary} onChange={e => update(x => { x.minutes.summary = e.target.value; return x; })} />
        <h3>Keputusan</h3>
        <ol className="dec">{n.decisions.map((d, i) => <li key={i}>
          <span className="grow"><textarea rows={1} className="auto" value={d.text} aria-label={`Keputusan ${i + 1}`} onChange={e => update(x => { x.minutes.decisions[i].text = e.target.value; return x; })} /><Src t={d.src} /></span>
          <button className="x" aria-label="Hapus keputusan" onClick={() => update(x => { x.minutes.decisions.splice(i, 1); return x; })}>×</button></li>)}</ol>
        <button className="link" onClick={() => update(x => { x.minutes.decisions.push({ text: '', src: null }); return x; })}>+ Tambah keputusan</button>
        <h3>Poin penting</h3>
        <ul className="pts">{n.points.map((p, i) => <li key={i}>{p}</li>)}{!n.points.length && <li className="sub">Tidak ada poin tambahan.</li>}</ul>
      </div>}

      {tab === 'tugas' && <div className="tab">
        <table className="stack"><thead><tr><th>Selesai</th><th>Tugas</th><th>Penanggung jawab</th><th>Tenggat</th><th></th></tr></thead>
          <tbody>{n.actions.map((a, i) => <tr key={i} className={a.done ? 'done' : ''}>
            <td data-l="Selesai"><input type="checkbox" checked={a.done} aria-label="Tandai selesai" onChange={e => update(x => { x.minutes.actions[i].done = e.target.checked; return x; })} /></td>
            <td data-l="Tugas"><textarea rows={1} className="auto" value={a.task} aria-label="Tugas" onChange={e => update(x => { x.minutes.actions[i].task = e.target.value; return x; })} /><Src t={a.src} /></td>
            <td data-l="Penanggung jawab"><input list="people" value={a.owner} aria-label="Penanggung jawab" onChange={e => update(x => { x.minutes.actions[i].owner = e.target.value; return x; })} /></td>
            <td data-l="Tenggat"><input type="date" value={a.due} aria-label="Tenggat" onChange={e => update(x => { x.minutes.actions[i].due = e.target.value; return x; })} /></td>
            <td><button className="x" aria-label="Hapus tugas" onClick={() => update(x => { x.minutes.actions.splice(i, 1); return x; })}>×</button></td>
          </tr>)}</tbody></table>
        <datalist id="people">{people.map(p => <option key={p} value={p} />)}</datalist>
        <button className="link" onClick={() => update(x => { x.minutes.actions.push({ task: '', owner: '', due: '', done: false, src: null }); return x; })}>+ Tambah tugas</button>
      </div>}

      {tab === 'trans' && <div className="tab">
        <p className="sub nm">Baris oranye perlu didengar ulang. Arti kata dialek ditampilkan di bawah kalimat.</p>
        <div className="tx">{m.rows.map((r, i) => <Line key={r.t + '-' + i} r={r} active={hl === r.t}
          onOk={() => update(x => { x.rows[i].ok = true; return x; })}
          onEdit={v => { update(x => { x.rows[i].text = v; x.rows[i].ok = true; return x; }); say('Koreksi disimpan.'); }} />)}</div>
      </div>}

      {exp && <ExportDialog m={m} pending={pending} onClose={() => setExp(false)} say={say} />}
    </div>
  );
}

function ExportDialog({ m, pending, onClose, say }) {
  const ref = useRef();
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  useEffect(() => { ref.current?.showModal?.(); }, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const fname = `Notulen ${m.title} ${m.date || ''}`.trim().replace(/[\\/:*?"<>|]+/g, '-') + '.docx';
  async function docx() {
    setBusy(true);
    try {
      const blob = await minutesDocx(m);
      const u = URL.createObjectURL(blob); setUrl(u);
      const a = document.createElement('a'); a.href = u; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
      say('File .docx dibuat. Unggah ke Google Drive, lalu buka dengan Google Docs.');
    } catch { say('Gagal membuat file .docx.'); } finally { setBusy(false); }
  }
  async function copy() {
    const t = minutesText(m);
    try { await navigator.clipboard.writeText(t); say('Teks notulen disalin. Tempel di Google Docs.'); }
    catch { setTxt(t); say('Browser menolak menyalin otomatis. Teks sudah dipilih, tekan Ctrl+C.'); }
  }
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} className="dlg">
      <div className="dh"><h2>Ekspor ke Google Docs</h2><button className="btn" onClick={() => ref.current?.close?.() ?? onClose()}>Tutup</button></div>
      <div className="db">
        {pending > 0 && <div className="warn">Masih ada {pending} bagian transkrip yang belum dicek. Sebaiknya dicek dulu supaya notulen akurat.</div>}
        <ol className="howto">
          <li><b>Unduh .docx</b> lalu unggah ke Google Drive. Google Docs membukanya langsung, lengkap dengan judul, tabel tugas, dan transkrip.</li>
          <li>Atau <b>salin teks</b> lalu tempel ke dokumen Google Docs yang sudah ada.</li>
        </ol>
        {url && <p className="sub">Unduhan tidak mulai? <a href={url} download={fname}>Klik di sini</a>.</p>}
        {txt && <textarea className="cp" readOnly value={txt} ref={el => el && (el.focus(), el.select())} aria-label="Teks notulen" />}
        <p className="note">Kirim langsung ke folder Google Drive (tanpa unduh) butuh login Google kantor. Fitur ini disiapkan di tahap berikutnya.</p>
      </div>
      <div className="df">
        <button className="btn" onClick={copy}>Salin teks</button>
        <button className="btn pri" disabled={busy} onClick={docx}>{busy ? 'Membuat…' : 'Unduh .docx'}</button>
      </div>
    </dialog>
  );
}

/* ---------------- Riwayat & Kamus ---------------- */

function History({ items, onOpen, onDelete }) {
  const [q, setQ] = useState('');
  const list = items.filter(m => (m.title + ' ' + m.minutes.summary).toLowerCase().includes(q.toLowerCase()));
  return (
    <main className="single">
      <h1>Riwayat notulen</h1>
      <p className="sub">Tersimpan di browser ini saja. Ekspor ke Google Docs untuk dibagikan.</p>
      <input type="text" placeholder="Cari judul atau isi…" value={q} onChange={e => setQ(e.target.value)} aria-label="Cari riwayat" />
      <ul className="hist">
        {list.map(m => <li key={m.id}>
          <button className="hbtn" onClick={() => onOpen(m)}><b>{m.title}</b><span className="sub">{fmtDate(m.date)} · {m.minutes.decisions.length} keputusan · {m.minutes.actions.filter(a => !a.done).length} tugas terbuka{m.demo ? ' · contoh' : ''}</span></button>
          <button className="x" aria-label={`Hapus ${m.title}`} onClick={() => onDelete(m.id)}>×</button>
        </li>)}
        {!list.length && <li className="empty">{items.length ? 'Tidak ada yang cocok.' : 'Belum ada notulen. Buat dari menu Rapat baru.'}</li>}
      </ul>
    </main>
  );
}

function Vocab({ vocab, onSave }) {
  const [rows, setRows] = useState(vocab);
  const set = (i, k, v) => setRows(r => r.map((x, j) => j === i ? { ...x, [k]: v } : x));
  return (
    <main className="single">
      <h1>Kamus istilah</h1>
      <p className="sub">Nama orang, tempat, dan produk yang sering salah dengar. Kolom kiri berisi salah dengar yang sering muncul (pisahkan dengan koma), kolom kanan ejaan yang benar. Kamus ini dipakai untuk mengoreksi transkrip dan membantu mesin transkripsi.</p>
      <table className="stack vt"><thead><tr><th>Sering terdengar sebagai</th><th>Ejaan benar</th><th></th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>
          <td data-l="Terdengar"><input value={r.from} aria-label="Salah dengar" onChange={e => set(i, 'from', e.target.value)} /></td>
          <td data-l="Benar"><input value={r.to} aria-label="Ejaan benar" onChange={e => set(i, 'to', e.target.value)} /></td>
          <td><button className="x" aria-label="Hapus baris" onClick={() => setRows(r => r.filter((_, j) => j !== i))}>×</button></td>
        </tr>)}</tbody></table>
      <div className="row">
        <button className="btn" onClick={() => setRows(r => [...r, { from: '', to: '' }])}>+ Tambah istilah</button>
        <button className="btn pri" onClick={() => onSave(rows.filter(r => r.to.trim()))}>Simpan kamus</button>
      </div>
    </main>
  );
}
