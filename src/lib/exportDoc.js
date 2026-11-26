import { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType } from 'docx';
import { fmtTime } from './transcript.js';

const people = m => [...new Set(m.rows.map(r => r.who))];
export const fmtDate = s => { if (!s) return ''; const d = new Date(s + 'T00:00'); return isNaN(d) ? s : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); };

export function minutesText(m) {
  const n = m.minutes;
  return [
    `NOTULEN RAPAT: ${m.title}`, `Tanggal: ${fmtDate(m.date)}`, `Peserta: ${people(m).join(', ')}`, '',
    'RINGKASAN', n.summary, '',
    'KEPUTUSAN', ...n.decisions.map((d, i) => `${i + 1}. ${d.text}`), '',
    'POIN PENTING', ...n.points.map(p => `- ${p}`), '',
    'TUGAS', ...n.actions.map(a => `- ${a.task} | ${a.owner || '-'} | ${a.due ? fmtDate(a.due) : '-'}${a.done ? ' (selesai)' : ''}`)
  ].join('\n');
}

const cell = (t, bold) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t || '-', bold })] })] });

export async function minutesDocx(m, withTranscript = true) {
  const n = m.minutes;
  const children = [
    new Paragraph({ text: `Notulen: ${m.title}`, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `${fmtDate(m.date)} · Peserta: ${people(m).join(', ')}` }),
    new Paragraph({ text: 'Ringkasan', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: n.summary }),
    new Paragraph({ text: 'Keputusan', heading: HeadingLevel.HEADING_1 }),
    ...n.decisions.map(d => new Paragraph({ text: d.text, numbering: undefined, bullet: { level: 0 } })),
    new Paragraph({ text: 'Poin penting', heading: HeadingLevel.HEADING_1 }),
    ...n.points.map(p => new Paragraph({ text: p, bullet: { level: 0 } })),
    new Paragraph({ text: 'Tugas', heading: HeadingLevel.HEADING_1 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ children: ['Tugas', 'Penanggung jawab', 'Tenggat', 'Status'].map(h => cell(h, true)) }),
        ...n.actions.map(a => new TableRow({ children: [cell(a.task), cell(a.owner), cell(a.due ? fmtDate(a.due) : ''), cell(a.done ? 'Selesai' : 'Terbuka')] }))]
    })
  ];
  if (withTranscript) {
    children.push(new Paragraph({ text: 'Transkrip', heading: HeadingLevel.HEADING_1 }));
    for (const r of m.rows) children.push(new Paragraph({ children: [new TextRun({ text: `[${fmtTime(r.t)}] ${r.who}: `, bold: true }), new TextRun(r.text)] }));
  }
  return Packer.toBlob(new Document({ sections: [{ children }] }));
}
