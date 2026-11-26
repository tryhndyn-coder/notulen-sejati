// Panggilan ke fungsi server (/api). Bila server tidak ada (misalnya pratinjau), aplikasi memakai mode demo.
async function call(path, opts) {
  const res = await fetch(path, opts);
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('json') ? await res.json() : { error: await res.text() };
  if (!res.ok) throw new Error(body.error || `Gagal (${res.status})`);
  return body;
}

export async function getConfig() {
  try { return await call('./api/config'); }
  catch { return { summarize: false, transcribe: false, googleDocs: false, offline: true }; }
}

export const summarize = (payload) => call('./api/summarize', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
});

export const MAX_UPLOAD_MB = 4;
export async function transcribe(file, language = 'id', prompt = '') {
  const fd = new FormData();
  fd.append('file', file); fd.append('language', language); fd.append('prompt', prompt);
  return call('./api/transcribe', { method: 'POST', body: fd });
}

export const exportGoogleDoc = (payload) => call('./api/export-gdoc', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
});
