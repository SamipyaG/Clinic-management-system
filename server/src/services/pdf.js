import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { money } from './receipt.js';
import { encodeRef, qrPng } from './qr.js';

// pdfkit's built-in fonts cover Latin text only. For Devanagari or other scripts, point PDF_FONT
// (and optionally PDF_FONT_BOLD) at a TTF such as Noto Sans.
const customFont = process.env.PDF_FONT && fs.existsSync(process.env.PDF_FONT) ? process.env.PDF_FONT : null;
const customBold = process.env.PDF_FONT_BOLD && fs.existsSync(process.env.PDF_FONT_BOLD) ? process.env.PDF_FONT_BOLD : customFont;
const REGULAR = customFont ?? 'Helvetica';
const BOLD = customBold ?? 'Helvetica-Bold';

const render = (build) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    Promise.resolve(build(doc)).then(() => doc.end(), reject);
  });

const header = (doc, clinic, title) => {
  doc.font(BOLD).fontSize(18).text(clinic.name);
  doc.font(REGULAR).fontSize(9).fillColor('#555').text([clinic.address, clinic.phone, clinic.email].filter(Boolean).join('  ·  ') || ' ');
  doc.fillColor('#000').moveDown(0.8).font(BOLD).fontSize(14).text(title);
  doc.moveTo(48, doc.y + 4).lineTo(547, doc.y + 4).strokeColor('#bbb').stroke();
  doc.moveDown(0.8).font(REGULAR).fontSize(10);
};

const row = (doc, cells, widths, { bold = false } = {}) => {
  const y = doc.y;
  let x = 48;
  doc.font(bold ? BOLD : REGULAR);
  cells.forEach((text, i) => {
    doc.text(String(text ?? ''), x, y, { width: widths[i], align: i === 0 ? 'left' : 'right' });
    x += widths[i];
  });
  doc.y = Math.max(...cells.map((c, i) => y + doc.heightOfString(String(c ?? ''), { width: widths[i] })), y + 12) + 4;
  doc.x = 48;
};

const linesTable = (doc, lines, currency) => {
  const w = [270, 50, 85, 94];
  row(doc, ['Item', 'Qty', 'Price', 'Total'], w, { bold: true });
  lines.forEach((l) => row(doc, [l.description, l.qty, money(l.unit, currency), money(l.total, currency)], w));
};

const totals = (doc, invoice, currency) => {
  doc.moveDown(0.5);
  const w = [405, 94];
  row(doc, ['Subtotal', money(invoice.subtotal, currency)], w);
  row(doc, ['Discount', `-${money(invoice.discount, currency)}`], w);
  row(doc, [`Tax (${invoice.taxPercent}%)`, money(invoice.tax, currency)], w);
  row(doc, ['Total', money(invoice.total, currency)], w, { bold: true });
  row(doc, ['Paid', money(invoice.paid, currency)], w);
  row(doc, ['Balance due', money(invoice.balance, currency)], w, { bold: true });
};

export const invoicePdf = ({ clinic, invoice, payments }) =>
  render((doc) => {
    header(doc, clinic, `Invoice ${invoice.number}`);
    doc.text(`Patient: ${invoice.patient?.name ?? ''} (${invoice.patient?.patientId ?? ''})`);
    doc.text(`Date: ${invoice.createdAt.toISOString().slice(0, 10)}   Status: ${invoice.status}`).moveDown();
    linesTable(doc, invoice.lines, clinic.currency);
    totals(doc, invoice, clinic.currency);
    if (payments?.length) {
      doc.moveDown().font(BOLD).text('Payments').font(REGULAR);
      payments.forEach((p) =>
        doc.text(`${p.createdAt.toISOString().slice(0, 10)}  ${p.receiptNo}  ${p.method.replace('_', ' ')}  ${p.kind === 'refund' ? '-' : ''}${money(p.amount, clinic.currency)}`),
      );
    }
  });

export const receiptPdf = ({ clinic, invoice, payment }) =>
  render((doc) => {
    header(doc, clinic, `${payment.kind === 'refund' ? 'Refund' : 'Payment'} receipt ${payment.receiptNo}`);
    doc.text(`Date: ${payment.createdAt.toISOString().slice(0, 10)}`);
    doc.text(`Invoice: ${invoice.number}`);
    doc.text(`Patient: ${invoice.patient?.name ?? ''} (${invoice.patient?.patientId ?? ''})`).moveDown();
    doc.font(BOLD).fontSize(12).text(`${payment.kind === 'refund' ? 'Refunded' : 'Received'}: ${money(payment.amount, clinic.currency)} by ${payment.method.replace('_', ' ')}`);
    doc.font(REGULAR).fontSize(10).moveDown();
    totals(doc, invoice, clinic.currency);
  });

export const prescriptionPdf = ({ clinic, prescription }) =>
  render(async (doc) => {
    header(doc, clinic, 'Prescription');
    const p = prescription.patient;
    doc.text(`Patient: ${p?.name ?? ''} (${p?.patientId ?? ''})`);
    doc.text(`Date: ${prescription.createdAt.toISOString().slice(0, 10)}`);
    doc.text(`Doctor: ${prescription.doctor?.user?.name ?? ''}`);
    if (p?.allergies?.length) doc.fillColor('#b91c1c').text(`Allergies: ${p.allergies.join(', ')}`).fillColor('#000');
    doc.moveDown();
    prescription.items.forEach((i, n) => {
      doc.font(BOLD).text(`${n + 1}. ${i.medicine}  ${i.dosage}`);
      doc.font(REGULAR).text(`   ${i.frequency} · ${i.duration} · ${i.route}${i.instructions ? ` · ${i.instructions}` : ''}`).moveDown(0.4);
    });
    if (prescription.notes) doc.moveDown().text(`Notes: ${prescription.notes}`);
    const qr = await qrPng(encodeRef('RX', prescription._id), 120);
    doc.image(qr, 427, 48, { width: 120 });
  });
