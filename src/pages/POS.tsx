import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ShoppingCart, Smartphone, X, FileDown, Package, Scan, CheckCircle2 } from 'lucide-react';
import { usePhones, useAccessories, reloadData, checkout, createQuotation } from '@/lib/api';
import { formatLKR, cn, todayColombo } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { shareBillPDF, downloadBillPDF, openBillPDF, type BillData } from '@/lib/pdfBill';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { useMobile } from '@/hooks/useMobile';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import type { PhoneUnit, Accessory, SaleItem, SaleRecord } from '@/types';
import ExchangeModal, { type ExchangePayload } from '@/components/ExchangeModal';
import { useAuth } from '@/contexts/AuthContext';

interface CartItem {
 cartId: string;
 type: 'phone' | 'accessory';
 itemRef: PhoneUnit | Accessory;
 finalPrice: string;
 discount: string;
 quantity: number; // Added for bulk accessories
}

export default function POS() {
 const isMobile = useMobile();
 const { requireAdmin } = useAuth();
 const { phones } = usePhones();
 const { accessories } = useAccessories();
 const inStockCount = useMemo(() => phones.filter(p => p.status === 'in-stock').length, [phones]);
 
 const [imeiQuery, setImeiQuery] = useState('');
 const [cartItems, setCartItems] = useState<CartItem[]>([]);
 const [customerWhatsapp, setCustomerWhatsapp] = useState('');
 const [customerName, setCustomerName] = useState('');
 const [customerNic, setCustomerNic] = useState('');
 const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
 const [specialNotes, setSpecialNotes] = useState('');
 const [billGenerated, setBillGenerated] = useState(false);
 const [lastBillId, setLastBillId] = useState('');
 const [notFound, setNotFound] = useState(false);
 const [lastSale, setLastSale] = useState<SaleRecord | null>(null);
 const [lastBillData, setLastBillData] = useState<BillData | null>(null);
 const [exchangeModalOpen, setExchangeModalOpen] = useState(false);
 const [pendingExchange, setPendingExchange] = useState<ExchangePayload | null>(null);

 // B1 FIX: Use ref to avoid stale closure in barcode scanner callback
 const cartItemsRef = useRef(cartItems);
 cartItemsRef.current = cartItems;
 const phonesRef = useRef(phones);
 phonesRef.current = phones;
 const accRef = useRef(accessories);
 accRef.current = accessories;

 const handleLookup = useCallback((value: string) => {
 const query = value.trim();
 if (!query) return;

 // Check phones by IMEI or Serial Number (watches/tablets have no IMEI)
 const phone = phonesRef.current.find(p => (!!p.imei && p.imei === query) || (!!p.serialNumber && p.serialNumber === query));
 if (phone && phone.status === 'in-stock') {
 if (!cartItemsRef.current.some(c => c.type === 'phone' && (c.itemRef as PhoneUnit).id === phone.id)) {
 setCartItems(prev => [...prev, {
 cartId: `c${Date.now()}`,
 type: 'phone',
 itemRef: phone,
 finalPrice: phone.targetSalePrice ? String(phone.targetSalePrice) : '',
 discount: '0',
 quantity: 1
 }]);
 toast.success(`Added ${phone.model} to cart`);
 } else {
 toast.info('This phone is already in the cart');
 }
 setNotFound(false);
 setImeiQuery('');
 return;
 }

 // Check accessories by SKU
 const accessory = accRef.current.find(a => a.sku === query);
 if (accessory && accessory.quantity > 0) {
  const existingIndex = cartItemsRef.current.findIndex(c => c.type === 'accessory' && (c.itemRef as Accessory).sku === query);
  
  if (existingIndex > -1) {
    const existing = cartItemsRef.current[existingIndex];
    if (existing.quantity + 1 > accessory.quantity) {
      toast.error(`Only ${accessory.quantity} available in stock`);
      return;
    }
    setCartItems(prev => prev.map((item, idx) => 
      idx === existingIndex ? { ...item, quantity: item.quantity + 1 } : item
    ));
    toast.success(`Incremented ${accessory.name} quantity`);
  } else {
    setCartItems(prev => [...prev, {
      cartId: `c${Date.now()}`,
      type: 'accessory',
      itemRef: accessory,
      finalPrice: String(accessory.salePrice),
      discount: '0',
      quantity: 1
    }]);
    toast.success(`Added ${accessory.name} to cart`);
  }
 setNotFound(false);
 setImeiQuery('');
 return;
 }

 setNotFound(true);
 toast.error('No matching in-stock item found');
 }, []);

 // Hardware Scanner Integration — stable callback via ref
 useBarcodeScanner(useCallback((scannedString: string) => {
 setImeiQuery(scannedString);
 handleLookup(scannedString);
 }, [handleLookup]));

 useEffect(() => {
 const handleKeyDown = (e: KeyboardEvent) => {
 // F2 to focus scanner
 if (e.key === 'F2') {
 e.preventDefault();
 document.getElementById('pos-search-input')?.focus();
 }
 // F4 to complete sale
 if (e.key === 'F4') {
 e.preventDefault();
 const finishBtn = document.getElementById('pos-complete-sale-btn');
 if (finishBtn && !finishBtn.hasAttribute('disabled')) {
 finishBtn.click();
 }
 }
 };
 window.addEventListener('keydown', handleKeyDown);
 return () => window.removeEventListener('keydown', handleKeyDown);
 }, []);

 const handleRemoveCartItem = (cartId: string) => {
 setCartItems(prev => prev.filter(c => c.cartId !== cartId));
 };

 const handleExchangeConfirm = useCallback((exchange: ExchangePayload) => {
   setPendingExchange(exchange);
   setExchangeModalOpen(false);
 }, []);

 const updateCartItem = (cartId: string, field: 'finalPrice' | 'discount' | 'quantity', value: string | number) => {
 setCartItems(prev => prev.map(c => {
   if (c.cartId === cartId) {
     if (field === 'quantity') {
       const qty = Math.max(1, typeof value === 'string' ? parseInt(value) || 1 : value);
       const stock = (c.itemRef as Accessory).quantity;
       return { ...c, quantity: Math.min(qty, stock) };
     }
     return { ...c, [field]: value };
   }
   return c;
 }));
 };

 const netAmount = useMemo(() => {
 return cartItems.reduce((sum, item) => {
 const p = parseInt(item.finalPrice) || 0;
 const d = parseInt(item.discount) || 0;
 return sum + (Math.max(0, p - d) * item.quantity);
 }, 0);
 }, [cartItems]);

 const totalDiscount = useMemo(() => {
 return cartItems.reduce((sum, item) => sum + ((parseInt(item.discount) || 0) * item.quantity), 0);
 }, [cartItems]);

 const handleGenerateBill = useCallback(async () => {
 if (cartItems.length === 0) return;

 // WhatsApp: pre-open a tab NOW (inside the click gesture) so the popup blocker doesn't kill it after
 // the checkout await — navigating an already-open tab (below) is never popup-blocked. Only when the
 // customer gave a usable number. Desktop delivers the PDF as a download; mobile uses the share sheet.
 const waDigits = customerWhatsapp.replace(/\D/g, '').replace(/^0+/, '');
 const hasWhatsapp = waDigits.length >= 9;
 const waNormalized = waDigits.startsWith('94') ? waDigits : `94${waDigits}`;
 const waWin = (!isMobile && hasWhatsapp) ? window.open('', '_blank') : null;

 const now = new Date();
 const dateStr = todayColombo(); // Asia/Colombo, matches what the checkout RPC persists
 const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Colombo' });
 
 // B2 FIX: Timestamp-based bill ID — no collision risk
 const ts = Date.now().toString(36).toUpperCase();
 let billId = `CZ-${dateStr.replace(/-/g, '').slice(2)}-${ts.slice(-4)}`;

 const saleItems: SaleItem[] = cartItems.map(c => {
 const p = parseInt(c.finalPrice) || 0;
 const d = parseInt(c.discount) || 0;
 if (c.type === 'phone') {
 const phone = c.itemRef as PhoneUnit;
 return {
 type: 'phone',
 name: `${phone.model} ${phone.storage}`,
 identifier: phone.imei,
 costPrice: phone.costPrice,
 finalPrice: Math.max(0, p - d),
 discount: d,
 quantity: 1,
 condition: phone.condition
 };
 } else {
 const acc = c.itemRef as Accessory;
 return {
 type: 'accessory',
 name: acc.name,
 identifier: acc.sku,
 costPrice: acc.costPrice * c.quantity,
 finalPrice: Math.max(0, p - d) * c.quantity,
 discount: d * c.quantity,
 quantity: c.quantity
 };
 }
 });

 const sale = {
 id: `s${Date.now()}`,
 billId,
 customerWhatsapp: customerWhatsapp || '',
 items: saleItems,
 totalRevenue: Math.max(0, netAmount - (pendingExchange?.tradeInValuation ?? 0)),
 totalDiscount,
 date: dateStr,
 time: timeStr
 };

 // Checkout contract: total_revenue is the GROSS goods revenue; the RPC computes
 // net_payable = total_revenue - trade_in_value. (Do NOT pre-deduct the trade-in here.)
 const checkoutPayload = {
 items: saleItems,
 total_revenue: netAmount,
 total_discount: totalDiscount,
 payment_method: paymentMethod,
 notes: specialNotes || null,
 customer_whatsapp: customerWhatsapp || null,
 // Optional customer record — created/linked inside the checkout RPC (owner-only table,
 // written via SECURITY DEFINER so staff can attach without gaining read access).
 customer: (customerName || customerNic || customerWhatsapp) ? {
 name: customerName || null,
 nic: customerNic || null,
 whatsapp: customerWhatsapp || null,
 } : null,
 trade_in: pendingExchange ? {
 imei: pendingExchange.tradeInImei,
 model: pendingExchange.tradeInModel,
 valuation: pendingExchange.tradeInValuation,
 condition: pendingExchange.tradeInCondition,
 battery_health: pendingExchange.tradeInBatteryHealth,
 resale_price: pendingExchange.tradeInTargetSalePrice,
 notes: pendingExchange.tradeInNotes,
 customer_name: pendingExchange.customerName,
 customer_nic: pendingExchange.customerNic,
 customer_whatsapp: pendingExchange.customerWhatsapp,
 } : null,
 };

 try {
 const res = await checkout(checkoutPayload);
 billId = res.bill_id;      // authoritative bill id from the RPC
 sale.billId = billId;
 reloadData();
 } catch (e) {
 waWin?.close(); // checkout failed — don't leave a blank tab open
 toast.error(e instanceof Error ? e.message : 'Checkout failed. Please try again.');
 return;
 }

 const completedExchange = pendingExchange; // capture before clearing

 setLastBillId(billId);
 setBillGenerated(true);
 setLastSale(sale);
 toast.success(`Sale ${billId} completed!`);

    setCartItems([]);
    setImeiQuery('');
    setCustomerWhatsapp('');
    setCustomerName('');
    setCustomerNic('');
    setPaymentMethod('cash');
    setSpecialNotes('');
    setPendingExchange(null);

    try {
      // PDF — totals mirror what the checkout RPC persisted, so the bill == the sale record.
      // total_revenue = netAmount (gross goods); net_payable = netAmount - trade_in.
      const tradeIn = completedExchange?.tradeInValuation ?? 0;
      const finalNetAmount = Math.max(0, netAmount - tradeIn); // = net payable, for the WhatsApp receipt
      const pdfData: BillData = {
        billId: sale.billId,
        date: sale.date,
        time: sale.time,
        customerWhatsapp: customerWhatsapp || '',
        saleItems: saleItems,
        totals: {
          subtotal: netAmount + totalDiscount,
          discount: totalDiscount,
          tradeIn,
          grandTotal: finalNetAmount,
        },
        paymentMethod,
        specialNotes: specialNotes || undefined,
      };
      setLastBillData(pdfData);

      // WhatsApp: send the prefilled receipt to the customer's chat.
      if (hasWhatsapp) {
        const itemLines = saleItems.map(i =>
          ` • ${i.name}\n ↳ ${i.type === 'phone' ? 'IMEI' : 'SKU'}: ${i.identifier}${i.condition ? ` · Grade: ${i.condition.toUpperCase()}` : ''}`
        ).join('\n');

        const discountLine = totalDiscount > 0
          ? `\n💰 *Discount Applied:* ${formatLKR(totalDiscount)}`
          : '';

        const tradeInLine = completedExchange
          ? `\n🔄 *Trade-In:* ${completedExchange.tradeInModel} → -${formatLKR(completedExchange.tradeInValuation)}`
          : '';

        const message =
`🔵 *ClickZone Mobile* — Official Receipt
━━━━━━━━━━━━━━━━━━━━

📄 *Bill ID:* \`${sale.billId}\`
📅 *Date:* ${sale.date} 🕙 ${sale.time}

━━━━━━━━━━━━━━━━━━━━
🛒 *Items Purchased:*
${itemLines}
━━━━━━━━━━━━━━━━━━━━
${discountLine}${tradeInLine}
✅ *Total Paid:* *${formatLKR(finalNetAmount)}*

━━━━━━━━━━━━━━━━━━━━
🙏 *Thank you for choosing ClickZone Mobile!*
We appreciate your trust and support. Your purchase comes with manufacturer warranty — reach out to us anytime if you need assistance.

🌐 www.clickzonemobiles.com
📍 Kandy, Sri Lanka

_Please keep this message as your digital receipt._`;

        const waUrl = `https://wa.me/${waNormalized}?text=${encodeURIComponent(message)}`;
        if (waWin) waWin.location.href = waUrl;   // desktop: navigate the pre-opened tab (not popup-blocked)
        else window.open(waUrl, '_blank');        // mobile: open directly
      } else {
        waWin?.close(); // pre-opened but no usable number after all
      }

      // Bill PDF: desktop downloads it; mobile uses the native share sheet (falls back to a download).
      if (isMobile) {
        const shared = await shareBillPDF(pdfData);
        if (!shared) await downloadBillPDF(pdfData);
      } else {
        await downloadBillPDF(pdfData);
      }
    } catch (err) {
      waWin?.close(); // receipt build failed before we could show it — clean up the blank tab
      console.error("Receipt generation failed:", err);
      toast.error("Receipt generation failed, but the sale was saved successfully.");
    }
  }, [cartItems, customerWhatsapp, customerName, customerNic, paymentMethod, specialNotes, netAmount, totalDiscount, pendingExchange, isMobile]);

 // Save a quotation from the current cart (no sale, no stock change) + share via WhatsApp/PDF.
 const handleGenerateQuotation = useCallback(async () => {
 if (cartItems.length === 0) return;

 const waDigits = customerWhatsapp.replace(/\D/g, '').replace(/^0+/, '');
 const hasWhatsapp = waDigits.length >= 9;
 const waNormalized = waDigits.startsWith('94') ? waDigits : `94${waDigits}`;
 const waWin = (!isMobile && hasWhatsapp) ? window.open('', '_blank') : null;

 const dateStr = todayColombo();
 const validUntil = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

 const quoteItems: SaleItem[] = cartItems.map(c => {
 const p = parseInt(c.finalPrice) || 0;
 const d = parseInt(c.discount) || 0;
 if (c.type === 'phone') {
 const phone = c.itemRef as PhoneUnit;
 return { type: 'phone', name: `${phone.model} ${phone.storage}`, identifier: phone.imei, costPrice: 0, finalPrice: Math.max(0, p - d), discount: d, quantity: 1, condition: phone.condition };
 }
 const acc = c.itemRef as Accessory;
 return { type: 'accessory', name: acc.name, identifier: acc.sku, costPrice: 0, finalPrice: Math.max(0, p - d) * c.quantity, discount: d * c.quantity, quantity: c.quantity };
 });

 let quoteNo = '';
 try {
 const res = await createQuotation({
 items: quoteItems,
 total_revenue: netAmount,
 total_discount: totalDiscount,
 notes: specialNotes || null,
 customer_name: customerName || null,
 customer_nic: customerNic || null,
 customer_whatsapp: customerWhatsapp || null,
 valid_until: validUntil,
 });
 quoteNo = res.quote_no;
 reloadData();
 } catch (e) {
 waWin?.close();
 toast.error(e instanceof Error ? e.message : 'Failed to save quotation');
 return;
 }

 toast.success(`Quotation ${quoteNo} saved`);

 try {
 const pdfData: BillData = {
 billId: quoteNo,
 date: dateStr,
 time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Colombo' }),
 customerWhatsapp: customerWhatsapp || '',
 saleItems: quoteItems,
 totals: { subtotal: netAmount + totalDiscount, discount: totalDiscount, tradeIn: 0, grandTotal: netAmount },
 specialNotes: specialNotes || undefined,
 kind: 'quotation',
 validUntil,
 };

 if (hasWhatsapp) {
 const itemLines = quoteItems.map(i => ` • ${i.name}${i.quantity && i.quantity > 1 ? ` ×${i.quantity}` : ''} — ${formatLKR(i.finalPrice)}`).join('\n');
 const message =
`🔵 *ClickZone Mobile* — Quotation
━━━━━━━━━━━━━━━━━━━━

📄 *Quote:* \`${quoteNo}\`
📅 *Date:* ${dateStr}  ·  *Valid until:* ${validUntil}

━━━━━━━━━━━━━━━━━━━━
🛒 *Items:*
${itemLines}
━━━━━━━━━━━━━━━━━━━━
💰 *Total:* *${formatLKR(netAmount)}*

_This is a quotation, not a receipt. Prices valid until ${validUntil}._

🌐 www.clickzonemobiles.com · 📍 Kandy`;
 const waUrl = `https://wa.me/${waNormalized}?text=${encodeURIComponent(message)}`;
 if (waWin) waWin.location.href = waUrl; else window.open(waUrl, '_blank');
 } else {
 waWin?.close();
 }

 if (isMobile) { const shared = await shareBillPDF(pdfData); if (!shared) await downloadBillPDF(pdfData); }
 else { await downloadBillPDF(pdfData); }
 } catch (err) {
 waWin?.close();
 console.error('Quotation receipt failed:', err);
 }
 }, [cartItems, customerWhatsapp, customerName, customerNic, specialNotes, netAmount, totalDiscount, isMobile]);

 useEffect(() => {
 if (!billGenerated) return;
 const timer = setTimeout(() => setBillGenerated(false), 5000);
 return () => clearTimeout(timer);
 }, [billGenerated]);

 const handleReprint = useCallback(async () => {
 if (!lastBillData) return;
 const win = isMobile ? null : window.open('', '_blank'); // pre-open in the click gesture (desktop)
 if (isMobile) {
 const shared = await shareBillPDF(lastBillData);
 if (!shared) await downloadBillPDF(lastBillData);
 } else {
 const opened = await openBillPDF(lastBillData, win);
 if (!opened) await downloadBillPDF(lastBillData);
 }
 }, [lastBillData, isMobile]);

 if (isMobile) {
 return (
 <div className="flex flex-col h-[calc(100vh-7.5rem)] px-4 py-4 gap-4 bg-[var(--bg-app)]">
 {/* Scanner Input */}
 <div className="bg-[var(--paper)] rounded-xl p-4 shadow-xl border border-[var(--line)] shrink-0">
 <div className="relative">
 <Scan size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand)]" />
 <input
 type="text"
 value={imeiQuery}
 onChange={(e) => setImeiQuery(e.target.value)}
 onKeyDown={(e) => e.key === 'Enter' && handleLookup(e.currentTarget.value)}
 placeholder="IMEI or SKU..."
 className="w-full h-10 pl-9 pr-4 bg-[var(--bg-app)] border border-[var(--line)] rounded-xl text-[10px] font-medium text-[var(--ink)] placeholder:text-[var(--subtle)]/50 focus:outline-none focus:border-[var(--brand)] transition-all"
 autoComplete="off"
 />
 </div>
 {notFound && (
 <p className="text-[9px] text-[var(--danger)] font-bold mt-2 pl-1 ">Item not found</p>
 )}
 <div className="flex items-center justify-between mt-3">
 <span className="text-[9px] text-[var(--subtle)] ">{inStockCount} Units Available</span>
 <button
 onClick={() => handleLookup(imeiQuery)}
 className="h-8 px-4 bg-[var(--brand)] text-[var(--bg-app)] text-[9px] font-medium rounded-xl active:scale-95 transition-transform"
 >
 Find
 </button>
 </div>
 </div>

 {/* Cart Items — scrollable middle */}
 <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
 {cartItems.length === 0 ? (
 <div className="flex flex-col items-center justify-center h-full text-center opacity-30">
 <div className="w-14 h-14 bg-[var(--paper)] border border-[var(--line)] rounded-xl flex items-center justify-center mb-3">
 <ShoppingCart size={24} className="text-[var(--subtle)]" />
 </div>
 <p className="text-[10px] font-bold text-[var(--subtle)] font-medium">Cart is empty</p>
 </div>
 ) : (
 <AnimatePresence>
 {cartItems.map((item) => {
 const ref = item.itemRef as (PhoneUnit & Accessory);
 const name = item.type === 'phone' ? `${ref.model} ${ref.storage}` : ref.name;
 const sub = item.type === 'phone' ? ref.imei : ref.sku;
 return (
 <motion.div
 key={item.cartId}
 initial={{ opacity: 0, scale: 0.98 }}
 animate={{ opacity: 1, scale: 1 }}
 exit={{ opacity: 0, x: -20 }}
 className="bg-[var(--paper)] rounded-xl p-4 border border-[var(--line)] relative overflow-hidden"
 >
 <div className="absolute top-0 left-0 w-[2px] h-full bg-[var(--brand)]" />
 <div className="flex items-start justify-between gap-2 mb-3 pl-1">
 <div className="flex items-center gap-3 flex-1 min-w-0">
 <div className="min-w-0">
 <p className="text-xs font-bold text-[var(--ink)] truncate ">{name}</p>
 <p className="text-[9px] text-[var(--subtle)] ">{sub}</p>
 </div>
 </div>
 <button onClick={() => handleRemoveCartItem(item.cartId)} className="w-6 h-6 flex items-center justify-center rounded-xl bg-[var(--bg-app)] text-[var(--danger)] active:scale-90 transition-transform shrink-0">
 <X size={12} />
 </button>
 </div>
 <div className="grid grid-cols-2 gap-3 pl-1">
 {item.type === 'accessory' && (
   <div className="col-span-2 flex items-center justify-between bg-[var(--bg-app)] border border-[var(--line)] p-2 rounded-xl">
     <span className="text-[8px] font-bold text-[var(--subtle)] ">QUANTITY</span>
     <div className="flex items-center gap-3">
       <button 
         onClick={() => updateCartItem(item.cartId, 'quantity', item.quantity - 1)}
         className="w-6 h-6 flex items-center justify-center border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] active:bg-[var(--line)]"
       >
         -
       </button>
       <span className="text-[10px] font-bold w-4 text-center">{item.quantity}</span>
       <button 
         onClick={() => updateCartItem(item.cartId, 'quantity', item.quantity + 1)}
         className="w-6 h-6 flex items-center justify-center border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] active:bg-[var(--line)]"
       >
         +
       </button>
     </div>
   </div>
 )}
 <div>
 <p className="text-[8px] text-[var(--subtle)] mb-1 font-medium ">Price</p>
 <input
 type="number"
 value={item.finalPrice}
 onChange={(e) => updateCartItem(item.cartId, 'finalPrice', e.target.value)}
 className="w-full h-8 px-2 bg-[var(--bg-app)] border border-[var(--line)] rounded-xl text-[10px] font-bold text-[var(--ink)] focus:outline-none focus:border-[var(--brand)]"
 />
 </div>
 <div>
 <p className="text-[8px] text-[var(--subtle)] mb-1 font-medium ">Discount</p>
 <input
 type="number"
 value={item.discount}
 onChange={(e) => updateCartItem(item.cartId, 'discount', e.target.value)}
 className="w-full h-8 px-2 bg-[var(--bg-app)] border border-[var(--line)] rounded-xl text-[10px] font-bold text-[var(--danger)] focus:outline-none focus:border-[var(--brand)]"
 />
 </div>
 </div>
 </motion.div>
 );
 })}
 </AnimatePresence>
 )}
 </div>

 {/* Footer — Customer + Checkout */}
 <div className="bg-[var(--paper)] border-t border-[var(--line)] p-5 shadow-2xl shrink-0 space-y-4">
   {!pendingExchange ? (
     <Button
       onClick={() => requireAdmin(() => setExchangeModalOpen(true))}
       disabled={cartItems.length === 0}
       className="w-full h-10 bg-[var(--bg-app)] border border-[var(--line)] text-[var(--ink)] text-[10px] font-bold rounded-xl hover:bg-[var(--line)] transition-all"
     >
       ＋ TRADE-IN
     </Button>
   ) : (
     <div className="w-full bg-[var(--brand)]/10 border border-[var(--brand)]/30 p-3 flex items-center justify-between rounded-xl">
       <div>
         <p className="text-[10px] font-bold text-[var(--brand)] uppercase">Trade-In Active</p>
         <p className="text-[11px] font-bold text-[var(--ink)] mt-0.5">{pendingExchange.tradeInModel} · LKR {pendingExchange.tradeInValuation.toLocaleString()}</p>
       </div>
       <button onClick={() => setPendingExchange(null)} className="text-[var(--subtle)] hover:text-[var(--danger)]">
         <X size={16} />
       </button>
     </div>
   )}
 <div className="relative">
 <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[var(--subtle)] ">WhatsApp:</span>
 <input
 type="text"
 value={customerWhatsapp}
 onChange={(e) => setCustomerWhatsapp(e.target.value)}
 placeholder="94..."
 className="w-full h-10 pl-20 px-4 bg-[var(--bg-app)] border border-[var(--line)] rounded-xl text-[10px] font-bold text-[var(--ink)] placeholder:text-[var(--subtle)]/30 focus:outline-none focus:border-[var(--brand)] transition-all"
 />
 </div>
 <div className="grid grid-cols-2 gap-2">
 <input
 type="text"
 value={customerName}
 onChange={(e) => setCustomerName(e.target.value)}
 placeholder="Name (optional)"
 className="h-10 px-3 bg-[var(--bg-app)] border border-[var(--line)] rounded-xl text-[10px] font-bold text-[var(--ink)] placeholder:text-[var(--subtle)]/30 focus:outline-none focus:border-[var(--brand)]"
 />
 <input
 type="text"
 value={customerNic}
 onChange={(e) => setCustomerNic(e.target.value)}
 placeholder="NIC (optional)"
 className="h-10 px-3 bg-[var(--bg-app)] border border-[var(--line)] rounded-xl text-[10px] font-bold text-[var(--ink)] placeholder:text-[var(--subtle)]/30 focus:outline-none focus:border-[var(--brand)]"
 />
 </div>
 <div className="grid grid-cols-3 gap-2">
 {(['cash', 'card', 'transfer'] as const).map(m => (
 <button
 key={m}
 type="button"
 onClick={() => setPaymentMethod(m)}
 className={cn(
 "h-10 text-[10px] font-bold uppercase rounded-xl border-2 transition-all",
 paymentMethod === m
 ? "bg-[var(--terracotta)] text-white border-[var(--terracotta)]"
 : "bg-[var(--paper)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--ink)]"
 )}
 >
 {m}
 </button>
 ))}
 </div>
 <textarea
 value={specialNotes}
 onChange={(e) => setSpecialNotes(e.target.value)}
 placeholder="Special notes (optional) — printed on the bill"
 rows={2}
 className="w-full px-3 py-2 bg-[var(--bg-app)] border border-[var(--line)] rounded-xl text-[10px] font-bold text-[var(--ink)] placeholder:text-[var(--subtle)]/30 focus:outline-none focus:border-[var(--brand)] transition-all resize-none"
 />
 <button
 onClick={handleGenerateQuotation}
 disabled={cartItems.length === 0}
 className="w-full h-10 bg-[var(--paper)] border border-[var(--line)] text-[var(--ink)] text-[10px] font-bold rounded-xl disabled:opacity-40"
 >
 Save Quotation
 </button>
 <div className="flex items-center justify-between">
 <div>
 <p className="text-[13px] font-medium text-[var(--ink)] mb-2 block">{cartItems.length} Identified Units</p>
 <p className="text-2xl font-bold text-[var(--brand)]">{formatLKR(netAmount - (pendingExchange?.tradeInValuation ?? 0))}</p>
 </div>
 <button
 id="pos-complete-sale-btn"
 onClick={handleGenerateBill}
 disabled={cartItems.length === 0}
 className={cn(
 "h-12 px-6 rounded-xl text-[10px] font-bold font-medium flex items-center gap-2 transition-all active:scale-95 shadow-lg",
 cartItems.length > 0
 ? "bg-[var(--terracotta)] text-white shadow-lg shadow-[var(--terracotta)]/25"
 : "bg-[var(--bg-app)] text-[var(--subtle)] cursor-not-allowed opacity-50"
 )}
 >
 <CheckCircle2 size={16} />
 Submit Sale
 </button>
 </div>
 {billGenerated && lastBillId && (
 <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
 className="bg-[var(--success)]/10 border border-[var(--success)]/30 rounded-xl p-3 flex items-center justify-between">
 <div className="flex items-center gap-2">
 <CheckCircle2 size={14} className="text-[var(--success)]" />
 <div>
 <p className="text-[10px] font-bold text-[var(--success)] ">Sale Completed</p>
 <p className="text-[9px] text-[var(--ink)]/60 ">{lastBillId}</p>
 </div>
 </div>
 <button onClick={handleReprint} className="h-7 px-3 text-[9px] font-bold bg-[var(--success)]/20 text-[var(--success)] border border-[var(--success)]/30 rounded-xl active:scale-90 transition-transform ">
 Print PDF
 </button>
 </motion.div>
 )}
 </div>
 </div>
 );
 }

 return (
 <div className="p-8 h-[calc(100vh-4rem)] bg-[var(--bg-app)]">
 <div className="grid grid-cols-2 gap-8 h-full">
 {/* LEFT: Lookup + Cart Items */}
 <div className="bg-[var(--paper)] border border-[var(--line)] p-8 flex flex-col overflow-y-auto relative">
 <div className="absolute top-0 left-0 w-full h-[1px] bg-[var(--line)]" />
 <div className="flex items-start justify-between mb-8 shrink-0 relative z-10">
 <div>
 <p className=" text-[9px] font-bold text-[var(--brand)] mb-1 ">Sales Management</p>
 <h2 className="text-2xl font-bold text-[var(--ink)] ">Point Of Sale</h2>
 </div>
 <div className="text-right">
 <span className="inline-flex items-center gap-2 px-3 py-1 bg-[var(--bg-app)] border border-[var(--line)] rounded-xl">
 <div className="w-1.5 h-1.5 bg-[var(--success)] rounded-xl animate-pulse shadow-[0_0_8px_var(--success)]" />
 <p className="text-[9px] font-bold text-[var(--ink)] ">System Ready</p>
 </span>
 <p className="text-[9px] text-[var(--subtle)] mt-2 ">{inStockCount} Units in Stock</p>
 </div>
 </div>

 <div className="space-y-6 shrink-0 relative z-10">
 <div className="relative group">
 <div className="absolute -top-2 left-4 bg-[var(--paper)] px-2 z-10">
 <span className="text-[8px] font-bold text-[var(--subtle)] ">Item Search</span>
 </div>
 <Scan size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--brand)]" />
 <Input
 id="pos-search-input"
 value={imeiQuery}
 onChange={(e) => setImeiQuery(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === 'Enter') handleLookup(e.currentTarget.value);
 }}
 placeholder="IMEI / SKU..."
 className="h-12 pl-12 pr-12 text-[11px] font-bold bg-[var(--bg-app)] border border-[var(--line)] text-[var(--ink)] placeholder:text-[var(--subtle)]/30 focus-visible:border-[var(--brand)] focus-visible:ring-0 transition-none"
 />
 {imeiQuery && (
 <button
 onClick={() => { setImeiQuery(''); setNotFound(false); }}
 className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtle)] hover:text-[var(--danger)] transition-colors"
 >
 <X size={16} />
 </button>
 )}
 </div>

 {notFound && (
 <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
 className="bg-[var(--danger)]/5 border border-[var(--danger)]/20 p-3 flex items-center gap-3 rounded-xl">
 <div className="w-1.5 h-1.5 bg-[var(--danger)] rounded-xl animate-pulse" />
 <p className="text-[9px] font-bold text-[var(--danger)] font-medium ">No item found matching this ID</p>
 </motion.div>
 )}
 </div>

 {/* Cart Items on Left Panel */}
 <div className="mt-8 flex-1 space-y-3 relative z-10">
 <AnimatePresence>
 {cartItems.length === 0 && !billGenerated && (
 <div className="flex flex-col items-center justify-center h-full text-center py-12 opacity-20 filter grayscale">
 <ShoppingCart size={32} className="mb-4 text-[var(--ink)]" strokeWidth={1.5} />
 <p className="text-[9px] font-bold text-[var(--ink)] ">Cart is empty</p>
 </div>
 )}
 {cartItems.map(item => (
 <motion.div 
 key={item.cartId}
 initial={{ opacity: 0, y: 5 }}
 animate={{ opacity: 1, y: 0 }}
 className="group relative bg-[var(--bg-app)] border border-[var(--line)] p-5 hover:border-[var(--ink)] flex items-center justify-between"
 >
 <div className="flex items-center gap-5 min-w-0">
 <div className={cn("w-12 h-12 border flex items-center justify-center shrink-0", 
 item.type === 'phone' ? 'border-[var(--brand)] bg-[var(--brand)]/5 text-[var(--brand)]' : 'border-[var(--subtle)] bg-[var(--paper)] text-[var(--subtle)]')}>
 {item.type === 'phone' ? <Smartphone size={20} /> : <Package size={20} />}
 </div>
 <div className="flex-1 min-w-0">
 {item.type === 'phone' ? (
 <>
 <h3 className="text-xs font-bold text-[var(--ink)] ">{(item.itemRef as PhoneUnit).model}</h3>
 <p className="text-[9px] text-[var(--subtle)] mt-1 mr-2 truncate">
 {(item.itemRef as PhoneUnit).storage} · {(item.itemRef as PhoneUnit).color} · {(item.itemRef as PhoneUnit).condition.toUpperCase()}
 </p>
 <p className="text-[9px] font-bold text-[var(--success)] mt-1.5 ">REF: #{(item.itemRef as PhoneUnit).imei}</p>
 </>
 ) : (
 <>
 <h3 className="text-xs font-bold text-[var(--ink)] ">{(item.itemRef as Accessory).name}</h3>
 <p className="text-[9px] font-bold text-[var(--subtle)] mt-1.5 ">SKU-ID: #{(item.itemRef as Accessory).sku}</p>
 </>
 )}
 </div>
 </div>
 <button
 onClick={() => handleRemoveCartItem(item.cartId)}
 className="flex items-center gap-1 text-[9px] font-bold text-[var(--danger)] hover:opacity-70 transition-all px-2 py-1 border border-[var(--danger)]/30 hover:border-[var(--danger)]"
 >
 <X size={12} />
 Remove
 </button>
 </motion.div>
 ))}
 </AnimatePresence>
 </div>

 {billGenerated && lastSale && (
 <div className="mt-8 pt-8 border-t border-[var(--line)] space-y-4 shrink-0 relative z-10">
 <div className="bg-[var(--brand)]/10 border border-[var(--brand)]/30 p-5 rounded-xl flex items-center justify-between">
 <div>
 <p className="text-[9px] font-bold text-[var(--brand)] font-medium mb-1 ">Sequence Committed</p>
 <p className="text-lg font-bold text-[var(--ink)]">{lastBillId}</p>
 </div>
 <div className="w-10 h-10 bg-[var(--bg-app)] border border-[var(--line)] rounded-xl flex items-center justify-center">
 <CheckCircle2 size={24} className="text-[var(--success)]" />
 </div>
 </div>
 <button
 onClick={handleReprint}
 className="w-full h-11 flex items-center justify-center gap-3 bg-[var(--line)] border border-[var(--line)] text-[var(--brand)] text-[10px] font-bold font-medium hover:bg-[var(--brand)] hover:text-[var(--bg-app)] transition-all rounded-xl shadow-xl"
 >
 <FileDown size={14} />
 Generate Ledger Archive PDF
 </button>
 </div>
 )}
 </div>

 {/* RIGHT: Checkout Terminal */}
 <div className="bg-[var(--bg-app)] border border-[var(--line)] p-10 flex flex-col overflow-y-auto relative">
 
 <div className="flex items-start justify-between mb-10 shrink-0 relative z-10">
 <div>
 <p className=" text-[9px] font-bold text-[var(--subtle)] mb-1 ">Sales Module</p>
 <h2 className="text-3xl font-bold text-[var(--ink)] ">Checkout</h2>
 </div>
 <div className="text-right">
 <p className="text-[10px] font-bold text-[var(--brand)] ">{cartItems.length} Items in Cart</p>
 </div>
 </div>

 <div className="space-y-6 flex-1 relative z-10 ">
 {cartItems.map((item, idx) => (
 <div key={item.cartId} className="bg-[var(--paper)] border border-[var(--line)] p-5 relative group overflow-hidden">
 <div className="flex items-center justify-between mb-4 border-b border-[var(--line)] pb-3">
 <div className="flex items-center gap-2">
 <span className="text-[9px] font-bold text-[var(--brand)] bg-[var(--bg-app)] px-2 py-0.5 border border-[var(--brand)]">Entry {String(idx + 1).padStart(2, '0')}</span>
 <p className="text-[11px] font-bold text-[var(--ink)] truncate max-w-[180px]">
 {item.type === 'phone' ? (item.itemRef as PhoneUnit).model : (item.itemRef as Accessory).name}
 </p>
 </div>
 <button
   onClick={() => handleRemoveCartItem(item.cartId)}
   className="flex items-center gap-1 text-[9px] font-bold text-[var(--danger)] hover:opacity-70 transition-all"
 >
   <X size={12} />
   Remove
 </button>
 </div>
 <div className="grid grid-cols-2 gap-4">
 {item.type === 'accessory' && (
   <div className="col-span-2 flex items-center justify-between bg-[var(--bg-app)] border border-[var(--line)] p-2 rounded-xl mb-1">
     <span className="text-[8px] font-bold text-[var(--subtle)] ">QUANTITY</span>
     <div className="flex items-center gap-3">
       <button 
         onClick={() => updateCartItem(item.cartId, 'quantity', item.quantity - 1)}
         className="w-6 h-6 flex items-center justify-center border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] active:bg-[var(--line)]"
       >
         -
       </button>
       <span className="text-[10px] font-bold w-4 text-center">{item.quantity}</span>
       <button 
         onClick={() => updateCartItem(item.cartId, 'quantity', item.quantity + 1)}
         className="w-6 h-6 flex items-center justify-center border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] active:bg-[var(--line)]"
       >
         +
       </button>
       <span className="text-[7px] font-bold text-[var(--subtle)] ml-2 uppercase">Stock: {(item.itemRef as Accessory).quantity}</span>
     </div>
   </div>
 )}
 <div className="space-y-2">
 <Label className="text-[8px] font-bold text-[var(--subtle)] font-medium ">Sale Price</Label>
 <div className="relative">
 <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[8px] font-bold text-[var(--subtle)]">LKR</span>
 <Input
 type="number"
 value={item.finalPrice}
 onChange={(e) => updateCartItem(item.cartId, 'finalPrice', e.target.value)}
 className="h-9 pl-10 bg-[var(--bg-app)] border-[var(--line)] focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[11px] font-bold text-[var(--ink)] transition-none"
 />
 </div>
 </div>
 <div className="space-y-2">
 <Label className="text-[8px] font-bold text-[var(--subtle)] font-medium ">Discount</Label>
 <div className="relative">
 <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[8px] font-bold text-[var(--danger)]">-</span>
 <Input
 type="number"
 value={item.discount}
 onChange={(e) => updateCartItem(item.cartId, 'discount', e.target.value)}
 className="h-9 pl-6 bg-[var(--bg-app)] border-[var(--line)] focus-visible:border-[var(--danger)] focus-visible:ring-0 text-[11px] font-bold text-[var(--danger)] transition-none"
 />
 </div>
 </div>
 </div>
 </div>
 ))}

 <div className="bg-[var(--paper)] border border-[var(--line)] p-5 rounded-xl space-y-4">
 <Label className="text-[9px] font-bold text-[var(--subtle)] ">Customer Details (optional)</Label>
 <div className="relative group">
 <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtle)] text-[10px] font-bold">WhatsApp Number:</span>
 <Input
 type="text"
 value={customerWhatsapp}
 onChange={(e) => setCustomerWhatsapp(e.target.value)}
 placeholder="94..."
 disabled={cartItems.length === 0}
 className="h-11 pl-32 bg-[var(--bg-app)] border-[var(--line)] focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[11px] font-bold text-[var(--ink)] disabled:opacity-30 transition-none"
 />
 </div>
 <div className="grid grid-cols-2 gap-3">
 <Input
 type="text"
 value={customerName}
 onChange={(e) => setCustomerName(e.target.value)}
 placeholder="Customer name"
 disabled={cartItems.length === 0}
 className="h-11 bg-[var(--bg-app)] border-[var(--line)] focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[11px] font-bold text-[var(--ink)] disabled:opacity-30 transition-none"
 />
 <Input
 type="text"
 value={customerNic}
 onChange={(e) => setCustomerNic(e.target.value)}
 placeholder="NIC"
 disabled={cartItems.length === 0}
 className="h-11 bg-[var(--bg-app)] border-[var(--line)] focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[11px] font-bold text-[var(--ink)] disabled:opacity-30 transition-none"
 />
 </div>
 <div className="space-y-2">
 <Label className="text-[9px] font-bold text-[var(--subtle)] ">Payment Method</Label>
 <div className="grid grid-cols-3 gap-2">
 {(['cash', 'card', 'transfer'] as const).map(m => (
 <button
 key={m}
 type="button"
 onClick={() => setPaymentMethod(m)}
 disabled={cartItems.length === 0}
 className={cn(
 "h-10 text-[10px] font-bold uppercase rounded-xl border-2 transition-all disabled:opacity-30",
 paymentMethod === m
 ? "bg-[var(--terracotta)] text-white border-[var(--terracotta)]"
 : "bg-[var(--paper)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--ink)]"
 )}
 >
 {m}
 </button>
 ))}
 </div>
 </div>
 <div className="space-y-2">
 <Label className="text-[9px] font-bold text-[var(--subtle)] ">Special Notes (optional)</Label>
 <textarea
 value={specialNotes}
 onChange={(e) => setSpecialNotes(e.target.value)}
 placeholder="Printed on the bill…"
 rows={2}
 disabled={cartItems.length === 0}
 className="w-full px-3 py-2 bg-[var(--bg-app)] border-[var(--line)] border rounded-xl text-[11px] font-bold text-[var(--ink)] placeholder:text-[var(--subtle)]/30 focus:outline-none focus:border-[var(--brand)] disabled:opacity-30 transition-none resize-none"
 />
 </div>
 </div>

 {cartItems.length > 0 && (
 <div className="pt-4 space-y-4">
   <div className="px-2">
     {!pendingExchange ? (
       <Button
         onClick={() => setExchangeModalOpen(true)}
         disabled={cartItems.length === 0}
         className="w-full h-10 bg-[var(--bg-app)] border border-[var(--line)] text-[var(--ink)] text-[10px] font-bold rounded-xl hover:bg-[var(--line)] transition-all"
       >
         ＋ TRADE-IN
       </Button>
     ) : (
       <div className="w-full bg-[var(--brand)]/10 border border-[var(--brand)]/30 p-3 flex items-center justify-between rounded-xl">
         <div>
           <p className="text-[10px] font-bold text-[var(--brand)] uppercase">Trade-In Active</p>
           <p className="text-[11px] font-bold text-[var(--ink)] mt-0.5">{pendingExchange.tradeInModel} · LKR {pendingExchange.tradeInValuation.toLocaleString()}</p>
         </div>
         <button onClick={() => setPendingExchange(null)} className="text-[var(--subtle)] hover:text-[var(--danger)]">
           <X size={16} />
         </button>
       </div>
     )}
   </div>
 <div className="flex items-center justify-between opacity-30 px-2 ">
 <span className="text-[9px] font-medium text-[var(--subtle)]">Subtotal</span>
 <span className="text-xs font-bold text-[var(--ink)]">{formatLKR(netAmount + totalDiscount)}</span>
 </div>
 {totalDiscount > 0 && (
 <div className="flex items-center justify-between text-[var(--danger)] px-2 ">
 <span className="text-[9px] font-medium ">Discount</span>
 <span className="text-xs font-bold">-{formatLKR(totalDiscount)}</span>
 </div>
 )}
 {pendingExchange && (
   <div className="flex items-center justify-between text-[var(--danger)] px-2 ">
     <span className="text-[9px] font-medium ">Trade-in ({pendingExchange.tradeInModel})</span>
     <span className="text-xs font-bold">-{formatLKR(pendingExchange.tradeInValuation)}</span>
   </div>
 )}
 <div className="flex items-end justify-between pt-4 border-t border-[var(--line)] px-2">
 <div>
 <p className="text-[9px] font-bold text-[var(--brand)] mb-1 ">{pendingExchange ? 'NET PAYABLE' : 'TOTAL PAYABLE'}</p>
 <p className="text-5xl font-bold text-[var(--ink)] ">{formatLKR(Math.max(0, netAmount - (pendingExchange?.tradeInValuation ?? 0))).split(' ')[1]}</p>
 </div>
 <span className="text-xl font-bold text-[var(--brand)] pb-1 ">{formatLKR(Math.max(0, netAmount - (pendingExchange?.tradeInValuation ?? 0))).split(' ')[0]}</span>
 </div>
 </div>
 )}
 </div>

 <div className="mt-auto pt-10 shrink-0 relative z-10">
 <Button
 onClick={handleGenerateQuotation}
 disabled={cartItems.length === 0}
 className="w-full h-11 mb-3 bg-[var(--paper)] border border-[var(--line)] text-[var(--ink)] text-[10px] font-bold rounded-xl hover:border-[var(--ink)] transition-all disabled:opacity-40"
 >
 Save Quotation
 </Button>
 <Button
 id="pos-complete-sale-btn"
 onClick={handleGenerateBill}
 disabled={cartItems.length === 0 || cartItems.some(i => !i.finalPrice)}
 className={cn(
 'w-full h-14 text-[11px] font-bold rounded-xl',
 cartItems.length > 0 && cartItems.every(i => i.finalPrice)
 ? 'bg-[var(--terracotta)] text-white hover:bg-[var(--terracotta-hover)]'
 : 'bg-[var(--paper)] text-[var(--subtle)] border border-[var(--line)] cursor-not-allowed opacity-50'
 )}
 >
 Complete Sale [F4]
 </Button>
 <p className="text-[8px] text-center text-[var(--subtle)] mt-4 font-medium ">
 ClickZone Mobile POS
 </p>
 </div>
 </div>
 </div>
 <ExchangeModal
   open={exchangeModalOpen}
   onClose={() => setExchangeModalOpen(false)}
   cartSubtotal={cartItems.reduce((sum, item) => sum + (parseFloat(item.finalPrice) || 0) * item.quantity, 0)}
   onConfirm={handleExchangeConfirm}
 />
 </div>
 );
}
