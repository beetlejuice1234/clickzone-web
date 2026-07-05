import { jsPDF } from 'jspdf';
import type { SaleItem } from '@/types';

// Totals are PERSISTED sale values, printed verbatim — never recomputed here, so the bill always
// matches the saved sale (Sales Log). Contract (see checkout RPC):
//   subtotal   = total_revenue + total_discount   (gross goods, before discount)
//   discount   = total_discount
//   tradeIn    = trade_in_value                   (0 → row omitted)
//   grandTotal = net_payable                      (= total_revenue − trade_in_value) = TOTAL DUE
export interface BillTotals {
  subtotal: number;
  discount: number;
  tradeIn: number;
  grandTotal: number;
}

export interface BillData {
  billId: string;
  date: string;
  time: string;
  customerWhatsapp: string;
  saleItems: SaleItem[];
  totals: BillTotals;
  paymentMethod?: string;   // 'cash' | 'card' | 'transfer'
  specialNotes?: string;    // per-sale free-text note (sales.notes)
  kind?: 'bill' | 'quotation';  // quotation → no PAID badge, "TOTAL" not "TOTAL DUE", valid-until
  validUntil?: string;          // quotations only (YYYY-MM-DD)
}

const COLORS = {
  INK: [10, 10, 10] as [number, number, number],
  MUTED: [107, 107, 107] as [number, number, number],
  LINE: [230, 230, 230] as [number, number, number],
  PAPER: [255, 255, 255] as [number, number, number],
};

// A5 geometry (mm)
const PW = 148;
const PH = 210;
const SW = 26;              // sidebar width
const CONTENT_X = SW + 10;  // 36
const META_X = PW - 10;     // 138 (right edge of content)
const CONTENT_W = META_X - CONTENT_X;
const TOP_Y = 18;
const FLOW_LIMIT = PH - 18; // content must stay above the footer strip (drawn at PH-10)

const money2 = (n: number): string =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function toDisplayDate(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[parseInt(m) - 1]} ${y}`;
}

async function fetchLogo(): Promise<string | null> {
  const paths = ['/logo.jpeg', '/click/assets/clickzone-logo.png', '/assets/clickzone-logo.png'];
  for (const path of paths) {
    try {
      const res = await fetch(path);
      if (res.ok) {
        const blob = await res.blob();
        return await new Promise(resolve => {
          const r = new FileReader();
          r.onloadend = () => resolve(r.result as string);
          r.onerror = () => resolve(null);
          r.readAsDataURL(blob);
        });
      }
    } catch { continue; }
  }
  return null;
}

// The black left rail — drawn on every page so page 2+ keeps the same identity.
function drawSidebar(doc: jsPDF, logo: string | null, railLabel: string = 'INVOICE'): void {
  doc.setFillColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
  doc.rect(0, 0, SW, PH, 'F');

  if (logo) {
    try { doc.addImage(logo, 'PNG', SW / 2 - 9, 12, 18, 18); } catch { /* ignore */ }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('times', 'normal');
  doc.setFontSize(7);
  doc.text('EST · MMXXIV', SW / 2, 35, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(48);
  doc.text(railLabel, 18, PH / 2 + 40, { angle: 90 });

  // (No crown glyph — the built-in PDF fonts don't have ♛, it renders as garbage. A thin rule reads clean.)
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.3);
  doc.line(SW / 2 - 4, PH - 18, SW / 2 + 4, PH - 18);
  doc.setFont('courier', 'normal');
  doc.setFontSize(7);
  doc.text('CLICK\nZONE', SW / 2, PH - 12, { align: 'center' });
}

async function generateBill(data: BillData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const logo = await fetchLogo();
  const isQuote = data.kind === 'quotation';
  const rail = isQuote ? 'QUOTE' : 'INVOICE';

  drawSidebar(doc, logo, rail);

  let y = TOP_Y;

  // Break to a fresh page (re-drawing the sidebar) when `needed` mm won't fit above the footer.
  const ensureSpace = (needed: number) => {
    if (y + needed > FLOW_LIMIT) {
      doc.addPage();
      drawSidebar(doc, logo, rail);
      y = TOP_Y;
    }
  };

  // --- Brand header (page 1) ---
  doc.setTextColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.text('ClickZone', CONTENT_X, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(COLORS.MUTED[0], COLORS.MUTED[1], COLORS.MUTED[2]);
  doc.text('MOBILES · ACCESSORIES · REPAIRS', CONTENT_X, y);
  y += 10;
  doc.setFontSize(8);
  doc.setTextColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
  doc.text('28 Raja Veediya, Kandy 20000\n076 704 1770\nclickzonemobile@gmail.com', CONTENT_X, y);

  // --- Meta (right aligned) ---
  let metaY = TOP_Y;
  doc.setFontSize(7);
  doc.setTextColor(COLORS.MUTED[0], COLORS.MUTED[1], COLORS.MUTED[2]);
  doc.text(isQuote ? 'Quote No.' : 'Invoice No.', META_X - 42, metaY, { align: 'left' });
  doc.text('Date', META_X - 42, metaY + 5, { align: 'left' });
  doc.text(isQuote ? 'Valid' : 'Due', META_X - 42, metaY + 10, { align: 'left' });

  doc.setTextColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
  doc.setFont('courier', 'bold');
  doc.setFontSize(8);
  doc.text(data.billId, META_X, metaY, { align: 'right' });
  doc.text(toDisplayDate(data.date), META_X, metaY + 5, { align: 'right' });
  doc.text(isQuote ? (data.validUntil ? toDisplayDate(data.validUntil) : '—') : 'On receipt', META_X, metaY + 10, { align: 'right' });

  // Payment badge — reflects the persisted method; quotations show a QUOTATION marker instead.
  metaY += 18;
  const payLabel = isQuote ? 'QUOTATION' : `PAID · ${(data.paymentMethod || 'cash').toUpperCase()}`;
  doc.setDrawColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
  doc.setLineWidth(0.3);
  doc.rect(META_X - 30, metaY - 5, 30, 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(payLabel, META_X - 15, metaY - 0.5, { align: 'center' });

  // Continue main flow below whichever column is taller.
  y = Math.max(y + 12, metaY + 10);

  // --- Billed to ---
  doc.setDrawColor(COLORS.LINE[0], COLORS.LINE[1], COLORS.LINE[2]);
  doc.setLineWidth(0.1);
  doc.line(CONTENT_X, y, META_X, y);
  y += 6;
  doc.setTextColor(COLORS.MUTED[0], COLORS.MUTED[1], COLORS.MUTED[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('BILLED TO', CONTENT_X, y);
  y += 5;
  doc.setTextColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
  doc.setFontSize(9);
  doc.text(data.customerWhatsapp || 'Walk-in Customer', CONTENT_X, y);
  y += 10;

  // --- Items table header ---
  doc.setDrawColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
  doc.setLineWidth(0.4);
  doc.line(CONTENT_X, y, META_X, y);
  y += 4;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('ITEM / DESCRIPTION', CONTENT_X, y);
  doc.text('QTY', META_X - 45, y, { align: 'right' });
  doc.text('PRICE', META_X - 28, y, { align: 'right' });
  doc.text('DISC', META_X - 16, y, { align: 'right' });
  doc.text('TOTAL', META_X, y, { align: 'right' });
  y += 3;
  doc.setLineWidth(0.2);
  doc.line(CONTENT_X, y, META_X, y);
  y += 6;

  // --- Item rows (display only; totals come from data.totals) ---
  doc.setFont('helvetica', 'normal');
  for (const item of data.saleItems) {
    ensureSpace(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
    doc.text(item.name, CONTENT_X, y);
    y += 4;
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(COLORS.MUTED[0], COLORS.MUTED[1], COLORS.MUTED[2]);
    const idText = item.type === 'phone' ? `IMEI ${item.identifier}` : `SKU ${item.identifier}`;
    doc.text(idText, CONTENT_X, y);

    doc.setTextColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
    doc.setFontSize(8);
    const qty = item.quantity || 1;
    const lineTotal = item.finalPrice;
    const lineDisc = item.discount || 0;
    const unitPrice = (lineTotal + lineDisc) / qty;

    doc.text(String(qty), META_X - 45, y - 2, { align: 'right' });
    doc.text(unitPrice.toLocaleString(), META_X - 28, y - 2, { align: 'right' });
    doc.text(lineDisc.toLocaleString(), META_X - 16, y - 2, { align: 'right' });
    doc.text(lineTotal.toLocaleString(), META_X, y - 2, { align: 'right' });

    y += 4;
    doc.setDrawColor(COLORS.LINE[0], COLORS.LINE[1], COLORS.LINE[2]);
    doc.line(CONTENT_X, y, META_X, y);
    y += 4;
  }

  // --- Totals (persisted values, verbatim) ---
  ensureSpace(28);
  y += 4;
  const totalsX = META_X - 40;
  doc.setFontSize(7);
  doc.setTextColor(COLORS.MUTED[0], COLORS.MUTED[1], COLORS.MUTED[2]);
  doc.text('SUBTOTAL', totalsX, y);
  doc.setTextColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
  doc.setFont('courier', 'normal');
  doc.text(money2(data.totals.subtotal), META_X, y, { align: 'right' });
  y += 5;

  doc.setTextColor(COLORS.MUTED[0], COLORS.MUTED[1], COLORS.MUTED[2]);
  doc.text('DISCOUNT', totalsX, y);
  doc.setTextColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
  doc.setFont('courier', 'normal');
  doc.text(`-${money2(data.totals.discount)}`, META_X, y, { align: 'right' });
  y += 5;

  if (data.totals.tradeIn > 0) {
    doc.setTextColor(COLORS.MUTED[0], COLORS.MUTED[1], COLORS.MUTED[2]);
    doc.text('TRADE-IN', totalsX, y);
    doc.setTextColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
    doc.setFont('courier', 'normal');
    doc.text(`-${money2(data.totals.tradeIn)}`, META_X, y, { align: 'right' });
    y += 5;
  }

  y += 4;
  doc.setDrawColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
  doc.setLineWidth(0.4);
  doc.line(totalsX, y, META_X, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  // Label on the far left so the large right-aligned amount never collides with it (any amount size).
  doc.text(isQuote ? 'TOTAL' : 'TOTAL DUE', CONTENT_X, y);
  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.text(`LKR ${money2(data.totals.grandTotal)}`, META_X, y, { align: 'right' });

  // --- Thank you ---
  ensureSpace(20);
  y += 15;
  doc.setFont('times', 'italic');
  doc.setFontSize(11);
  doc.setTextColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
  doc.text('Thank you for choosing ClickZone.', PW / 2 + SW / 2, y, { align: 'center' });
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(COLORS.MUTED[0], COLORS.MUTED[1], COLORS.MUTED[2]);
  doc.text('ROYALTY IN EVERY CONNECTION', PW / 2 + SW / 2, y, { align: 'center' });
  y += 10;

  // --- Special Notes (per-sale; only when present) ---
  const note = (data.specialNotes || '').trim();
  if (note) {
    doc.setFontSize(6);
    const noteLines = doc.splitTextToSize(note, CONTENT_W);
    ensureSpace(6 + noteLines.length * 3);
    doc.setDrawColor(COLORS.LINE[0], COLORS.LINE[1], COLORS.LINE[2]);
    doc.setLineWidth(0.1);
    doc.line(CONTENT_X, y, META_X, y);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
    doc.text('SPECIAL NOTES', CONTENT_X, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(COLORS.MUTED[0], COLORS.MUTED[1], COLORS.MUTED[2]);
    for (const line of noteLines) {
      ensureSpace(3);
      doc.text(line, CONTENT_X, y);
      y += 3;
    }
    y += 3;
  }

  // --- Terms & Conditions (always render) ---
  const terms = [
    '1. Warranty cannot be claimed for water & physical damages.',
    '2. Checking warranty doesn\'t include a warranty for the display.',
    '3. Warranty cannot be claimed if the warranty sticker is damaged or removed.',
    '4. Cash will not be refunded under any circumstances.',
  ];
  ensureSpace(8 + terms.length * 3);
  doc.setDrawColor(COLORS.LINE[0], COLORS.LINE[1], COLORS.LINE[2]);
  doc.setLineWidth(0.1);
  doc.line(CONTENT_X, y, META_X, y);
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
  doc.text('TERMS & CONDITIONS', CONTENT_X, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(COLORS.MUTED[0], COLORS.MUTED[1], COLORS.MUTED[2]);
  for (const term of terms) {
    ensureSpace(3);
    doc.text(term, CONTENT_X, y);
    y += 3;
  }

  // --- Footer strip (bottom of the final page) ---
  const fy = PH - 10;
  doc.setDrawColor(COLORS.LINE[0], COLORS.LINE[1], COLORS.LINE[2]);
  doc.setLineWidth(0.1);
  doc.line(CONTENT_X, fy, META_X, fy);
  doc.setFont('courier', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(COLORS.MUTED[0], COLORS.MUTED[1], COLORS.MUTED[2]);
  doc.text('CLICKZONE · KANDY', CONTENT_X, fy + 4);
  doc.text(`REF · ${data.billId}`, PW / 2 + SW / 2, fy + 4, { align: 'center' });
  doc.text('POWERED BY POS', META_X, fy + 4, { align: 'right' });

  // Hidden easter egg — invisible to the eye (PDF text rendering mode 3 = not drawn), but it's
  // embedded in every bill. Select-all or search the PDF to find it. ♛ SevIT was here.
  doc.setFont('courier', 'normal');
  doc.setFontSize(4);
  doc.text('crafted in the shadows by SevIT - royalty in every connection - you found the hidden mark',
    CONTENT_X, PH - 1.5, { renderingMode: 'invisible' });

  return doc;
}

export async function shareBillPDF(data: BillData): Promise<boolean> {
  if (!navigator.share) return false;
  const doc = await generateBill(data);
  const pdfBlob = doc.output('blob');
  const file = new File([pdfBlob], `ClickZone-Invoice-${data.billId}.pdf`, { type: 'application/pdf' });
  // Only attempt Web Share when this device can actually share the file, so we degrade cleanly
  // (e.g. desktop) instead of popping an empty OS share sheet.
  if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title: 'ClickZone Invoice' });
    return true;
  } catch {
    return false;
  }
}

// Open the bill in a browser tab (desktop: view + Ctrl+P to print). Because the caller runs after an
// await (checkout / logo fetch), the tab must be PRE-OPENED in the click gesture and passed in as `win`,
// otherwise the popup blocker kills it. Returns false if no tab could be shown (caller should download).
export async function openBillPDF(data: BillData, win?: Window | null): Promise<boolean> {
  const doc = await generateBill(data);
  const url = doc.output('bloburl') as unknown as string;
  if (win && !win.closed) { win.location.href = url; return true; }
  const opened = window.open(url, '_blank');
  return !!opened;
}

export async function downloadBillPDF(data: BillData): Promise<void> {
  const doc = await generateBill(data);
  doc.save(`ClickZone-Invoice-${data.billId}.pdf`);
}
