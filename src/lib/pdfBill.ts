import jsPDF from 'jspdf';
import { formatLKR } from './utils';
import type { SaleItem } from '@/types';

interface BillData {
  billId: string;
  date: string;
  time: string;
  customerWhatsapp: string;
  item?: {
    model: string;
    imei: string;
    condition: string;
    costPrice: number;
    finalPrice: number;
    discount: number;
    tradeIn?: { model: string; value: number };
  };
  saleItems?: SaleItem[];
}

const COLORS = {
  INK: [10, 10, 10] as [number, number, number],
  MUTED: [107, 107, 107] as [number, number, number],
  LINE: [230, 230, 230] as [number, number, number],
  PAPER: [255, 255, 255] as [number, number, number],
};

function conditionLabel(c: string): string {
  const m: Record<string, string> = {
    'sealed':        'Sealed / Brand New',
    'a-plus':        'Used (Grade A+)',
    'a':             'Used (Grade A)',
    'b':             'Used (Grade B)',
    'c':             'Used (Grade C)',
    'open-box':      'Open Box',
    'used-excellent':'Used — Excellent',
    'used-good':     'Used — Good',
    'used-fair':     'Used — Fair',
    'parts-only':    'Parts Only',
    'damaged':       'Damaged',
  };
  return m[c] || c;
}

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
          r.onerror   = () => resolve(null);
          r.readAsDataURL(blob);
        });
      }
    } catch { continue; }
  }
  return null;
}

async function generateBill(data: BillData): Promise<jsPDF> {
  // A5: 148mm x 210mm
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const pw = 148;
  const ph = 210;
  const sw = 26; // Sidebar width
  const contentX = sw + 10;
  const contentW = pw - contentX - 10;

  // 1. Sidebar
  doc.setFillColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
  doc.rect(0, 0, sw, ph, 'F');

  // Sidebar Logo
  const logo = await fetchLogo();
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', sw / 2 - 9, 12, 18, 18);
    } catch {}
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('times', 'normal');
  doc.setFontSize(7);
  doc.text('EST · MMXXIV', sw / 2, 35, { align: 'center' });

  // Sidebar Vertical Text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(48);
  doc.text('INVOICE', 18, ph / 2 + 40, { angle: 90 });

  // Sidebar Footer
  doc.setFontSize(10);
  doc.text('♛', sw / 2, ph - 18, { align: 'center' });
  doc.setFont('courier', 'normal');
  doc.setFontSize(7);
  doc.text('CLICK\nZONE', sw / 2, ph - 12, { align: 'center' });

  // 2. Main Content
  let y = 18;
  doc.setTextColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);

  // Brand Header
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.text('ClickZone', contentX, y);
  y += 5;
  doc.setFont('helvetica', 'medium');
  doc.setFontSize(7.5);
  doc.setTextColor(COLORS.MUTED[0], COLORS.MUTED[1], COLORS.MUTED[2]);
  doc.text('MOBILES · ACCESSORIES · REPAIRS', contentX, y);
  y += 10;
  doc.setFontSize(8);
  doc.setTextColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
  doc.text('28 Raja Veediya, Kandy 20000\n076 704 1770\nclickzonemobile@gmail.com', contentX, y);

  // Meta info (Right Aligned)
  const metaX = pw - 10;
  y = 18;
  doc.setFontSize(7);
  doc.setTextColor(COLORS.MUTED[0], COLORS.MUTED[1], COLORS.MUTED[2]);
  doc.text('Invoice №', metaX - 35, y, { align: 'left' });
  doc.text('Date', metaX - 35, y + 5, { align: 'left' });
  doc.text('Due', metaX - 35, y + 10, { align: 'left' });

  doc.setTextColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
  doc.setFont('courier', 'bold');
  doc.setFontSize(8);
  doc.text(data.billId, metaX, y, { align: 'right' });
  doc.text(toDisplayDate(data.date), metaX, y + 5, { align: 'right' });
  doc.text('On receipt', metaX, y + 10, { align: 'right' });

  y += 18;
  doc.setDrawColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
  doc.setLineWidth(0.3);
  doc.rect(metaX - 25, y - 5, 25, 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('PAID · CASH', metaX - 12.5, y - 0.5, { align: 'center' });

  y += 10;
  // Billed to
  doc.setDrawColor(COLORS.LINE[0], COLORS.LINE[1], COLORS.LINE[2]);
  doc.setLineWidth(0.1);
  doc.line(contentX, y, metaX, y);
  y += 6;
  doc.setTextColor(COLORS.MUTED[0], COLORS.MUTED[1], COLORS.MUTED[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('BILLED TO', contentX, y);
  y += 5;
  doc.setTextColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
  doc.setFontSize(9);
  doc.text(data.customerWhatsapp || 'Walk-in Customer', contentX, y);
  y += 10;

  // 3. Items Table
  doc.setDrawColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
  doc.setLineWidth(0.4);
  doc.line(contentX, y, metaX, y);
  y += 4;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('ITEM / DESCRIPTION', contentX, y);
  doc.text('QTY', metaX - 45, y, { align: 'right' });
  doc.text('PRICE', metaX - 28, y, { align: 'right' });
  doc.text('DISC', metaX - 16, y, { align: 'right' });
  doc.text('TOTAL', metaX, y, { align: 'right' });
  y += 3;
  doc.setLineWidth(0.2);
  doc.line(contentX, y, metaX, y);
  y += 6;

  const items = data.saleItems || (data.item ? [
    {
      type: 'phone' as any,
      name: data.item.model,
      identifier: data.item.imei,
      finalPrice: data.item.finalPrice,
      quantity: 1,
      discount: data.item.discount,
      condition: data.item.condition as any
    }
  ] : []);

  doc.setFont('helvetica', 'normal');
  let subtotal = 0;
  let totalDiscount = 0;

  items.forEach(item => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(item.name, contentX, y);
    y += 4;
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(COLORS.MUTED[0], COLORS.MUTED[1], COLORS.MUTED[2]);
    const idText = item.type === 'phone' ? `IMEI ${item.identifier}` : `SKU ${item.identifier}`;
    doc.text(idText, contentX, y);
    
    doc.setTextColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
    doc.setFontSize(8);
    const qty = item.quantity || 1;
    const itemTotal = item.finalPrice;
    const itemDisc = item.discount || 0;
    const unitPrice = (itemTotal + itemDisc) / qty;

    doc.text(String(qty), metaX - 45, y - 2, { align: 'right' });
    doc.text(unitPrice.toLocaleString(), metaX - 28, y - 2, { align: 'right' });
    doc.text(itemDisc.toLocaleString(), metaX - 16, y - 2, { align: 'right' });
    doc.text(itemTotal.toLocaleString(), metaX, y - 2, { align: 'right' });

    subtotal += (itemTotal + itemDisc);
    totalDiscount += itemDisc;
    y += 8;

    // Divider
    doc.setDrawColor(COLORS.LINE[0], COLORS.LINE[1], COLORS.LINE[2]);
    doc.line(contentX, y - 4, metaX, y - 4);
  });

  // 4. Totals
  y += 4;
  const totalsX = metaX - 40;
  doc.setFontSize(7);
  doc.setTextColor(COLORS.MUTED[0], COLORS.MUTED[1], COLORS.MUTED[2]);
  doc.text('SUBTOTAL', totalsX, y);
  doc.text('DISCOUNT', totalsX, y + 5);
  doc.text('TRADE-IN', totalsX, y + 10);

  doc.setTextColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
  doc.setFont('courier', 'normal');
  doc.text(subtotal.toLocaleString(undefined, {minimumFractionDigits: 2}), metaX, y, { align: 'right' });
  doc.text(`-${totalDiscount.toLocaleString(undefined, {minimumFractionDigits: 2})}`, metaX, y + 5, { align: 'right' });
  
  const tradeInVal = data.item?.tradeIn?.value || 0;
  doc.text(`-${tradeInVal.toLocaleString(undefined, {minimumFractionDigits: 2})}`, metaX, y + 10, { align: 'right' });

  y += 14;
  doc.setLineWidth(0.4);
  doc.line(totalsX, y, metaX, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('TOTAL DUE', totalsX, y);
  
  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  const finalTotal = subtotal - totalDiscount - tradeInVal;
  doc.text(`LKR ${finalTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`, metaX, y, { align: 'right' });

  // 5. Footer
  y += 15;
  doc.setFont('times', 'italic');
  doc.setFontSize(11);
  doc.text('Thank you for choosing ClickZone.', pw / 2 + sw / 2, y, { align: 'center' });
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(COLORS.MUTED[0], COLORS.MUTED[1], COLORS.MUTED[2]);
  doc.text('ROYALTY IN EVERY CONNECTION', pw / 2 + sw / 2, y, { align: 'center' });

  y += 10;
  doc.setLineWidth(0.1);
  doc.line(contentX, y, metaX, y);
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(COLORS.INK[0], COLORS.INK[1], COLORS.INK[2]);
  doc.text('TERMS & CONDITIONS', contentX, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(COLORS.MUTED[0], COLORS.MUTED[1], COLORS.MUTED[2]);
  const terms = [
    '1. Warranty cannot be claimed for water & physical damages.',
    '2. Checking warranty doesn\'t include a warranty for the display.',
    '3. Warranty cannot be claimed if the warranty sticker is damaged or removed.',
    '4. Cash will not be refunded under any circumstances.'
  ];
  terms.forEach(term => {
    doc.text(term, contentX, y);
    y += 3;
  });

  // Footer Strip
  y = ph - 10;
  doc.setLineWidth(0.1);
  doc.line(contentX, y, metaX, y);
  y += 4;
  doc.setFont('courier', 'normal');
  doc.setFontSize(6.5);
  doc.text('CLICKZONE · KANDY', contentX, y);
  doc.text(`REF · ${data.billId}`, pw / 2 + sw / 2, y, { align: 'center' });
  doc.text('POWERED BY POS', metaX, y, { align: 'right' });

  return doc;
}

export async function shareBillPDF(data: BillData): Promise<boolean> {
  if (!navigator.share) return false;
  const doc = await generateBill(data);
  const pdfBlob = doc.output('blob');
  const file = new File([pdfBlob], `ClickZone-Invoice-${data.billId}.pdf`, { type: 'application/pdf' });
  try {
    await navigator.share({ files: [file], title: 'ClickZone Invoice' });
    return true;
  } catch {
    return false;
  }
}

export async function downloadBillPDF(data: BillData): Promise<void> {
  const doc = await generateBill(data);
  doc.save(`ClickZone-Invoice-${data.billId}.pdf`);
}
