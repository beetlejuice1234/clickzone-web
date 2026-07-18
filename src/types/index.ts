export type ConditionGrade = 'sealed' | 'a-plus' | 'a' | 'b' | 'c' | 'open-box' | 'used-excellent' | 'used-good' | 'used-fair' | 'parts-only' | 'damaged';
export type UnitStatus = 'in-stock' | 'sold' | 'reserved' | 'damaged' | 'pending-refurb';
export type ItemSource = 'purchased' | 'trade-in' | 'returned';
export type DeviceType = 'phone' | 'tablet' | 'watch';

export interface PhoneUnit {
 id: string;
 imei: string;
 deviceType?: DeviceType;
 serialNumber?: string;
 model: string;
 storage: string;
 color: string;
 condition: ConditionGrade;
 batteryHealth: number;
 icloudStatus: 'clean' | 'locked';
 costPrice: number;
 targetSalePrice: number;
 status: UnitStatus;
 dateAdded: string;
 source?: ItemSource;
 notes?: string;             // internal note (staff/owner only — never on the invoice)
 exchangeId?: string;
 /**
 * Epoch ms timestamp of the last LOCAL write to this record.
 */
 localUpdatedAt?: string;
 syncedAt?: string;
 isDeleted?: number;
}

export interface Accessory {
 sku: string;
 name: string;
 quantity: number;
 costPrice: number;
 salePrice: number;
 serialNumber?: string;
 notes?: string;             // internal note (staff/owner only — never on the invoice)
 minStockLevel?: number;
 category?: string;
 brand?: string;
 variant?: string;
 localUpdatedAt?: string;
 syncedAt?: string;
 isDeleted?: number;
}

export interface SaleItem {
 type: 'phone' | 'accessory' | 'repair';
 name: string;
 identifier: string; // IMEI or SKU (empty for a repair/service line)
 costPrice: number;  // for a repair this is the entered parts cost
 finalPrice: number;
 discount: number;
 quantity?: number; // Added for bulk accessories
 condition?: ConditionGrade; // For phones only
}

export interface SaleRecord {
 id: string;
 billId: string;
 customerWhatsapp: string;
 items: SaleItem[];
 totalRevenue: number;
 totalDiscount: number;
 date: string;
 time: string;
 returnStatus?: 'none' | 'partial' | 'full';
 totalRefunded?: number;
 exchangeId?: string;
 tradeInValue?: number;
 netPayable?: number;
 paymentMethod?: string; // 'cash' | 'card'
 specialNotes?: string; // per-sale free-text note (sales.notes)
 customerId?: string;
 localUpdatedAt?: string;
 syncedAt?: string;
 isDeleted?: number;
}

export interface Customer {
 id: string;
 name?: string;
 nic?: string;
 whatsapp?: string;
 notes?: string;
 createdAt?: string;
}

export interface Quotation {
 id: string;
 quoteNo: string;
 items: SaleItem[];            // customer-facing; no cost stored
 customerName?: string;
 customerNic?: string;
 customerWhatsapp?: string;
 totalRevenue: number;
 totalDiscount: number;
 notes?: string;
 status: 'open' | 'converted' | 'expired';
 validUntil?: string;
 storeId?: string;
 createdAt?: string;
 isDeleted?: number;
}

export interface ReturnRecord {
 id: string;
 returnId: string;
 originalSaleId: string;
 originalBillId: string;
 itemType: 'phone' | 'accessory';
 imei?: string;
 sku?: string;
 quantity: number;
 refundAmount: number;
 reason: string;
 reasonNotes?: string;
 conditionOnReturn: string;
 refundMethod: string;
 customerWhatsapp?: string;
 processedBy?: string;
 returnDate: string;
 restocked: number; // 0 or 1
 notes?: string;
 localUpdatedAt: string;
 syncedAt?: string;
 isDeleted: number;
}

export interface ExchangeRecord {
 id: string;
 saleId: string;
 tradeInImei: string;
 tradeInModel: string;
 tradeInValuation: number;
 tradeInCondition: string;
 tradeInBatteryHealth?: number;
 tradeInNotes?: string;
 customerName: string;
 customerNic: string;
 customerWhatsapp?: string;
 ingestedPhoneId: string;
 localUpdatedAt: string;
 syncedAt?: string;
 isDeleted: number;
}
