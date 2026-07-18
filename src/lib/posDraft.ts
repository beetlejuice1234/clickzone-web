import { create } from 'zustand';
import type { PhoneUnit, Accessory } from '@/types';
import type { ExchangePayload } from '@/components/ExchangeModal';

export interface CartItem {
  cartId: string;
  type: 'phone' | 'accessory';
  itemRef: PhoneUnit | Accessory;
  finalPrice: string;
  discount: string;
  quantity: number; // for bulk accessories
}

export type PaymentMethod = 'cash' | 'card' | 'transfer';

// React-setState-style updater: a value, or (prev) => next. Lets POS keep its setX(prev => …) calls.
type SetArg<T> = T | ((prev: T) => T);
const apply = <T>(prev: T, arg: SetArg<T>): T =>
  typeof arg === 'function' ? (arg as (p: T) => T)(prev) : arg;

interface PosDraft {
  cartItems: CartItem[];
  customerWhatsapp: string;
  customerName: string;
  customerNic: string;
  paymentMethod: PaymentMethod;
  specialNotes: string;
  pendingExchanges: ExchangePayload[];
  setCartItems: (u: SetArg<CartItem[]>) => void;
  setCustomerWhatsapp: (u: SetArg<string>) => void;
  setCustomerName: (u: SetArg<string>) => void;
  setCustomerNic: (u: SetArg<string>) => void;
  setPaymentMethod: (u: SetArg<PaymentMethod>) => void;
  setSpecialNotes: (u: SetArg<string>) => void;
  setPendingExchanges: (u: SetArg<ExchangePayload[]>) => void;
  resetDraft: () => void;
}

/**
 * In-progress POS "draft sale" — held in a module-level zustand store (NOT inside the POS component)
 * so it SURVIVES tab navigation (POS unmounts on route change). In-memory only, so it clears on a
 * full page refresh; also cleared on sale completion + the manual "Clear cart" button (resetDraft),
 * and on auth change (AuthContext) so a draft can't leak across a logout→login.
 */
export const usePosDraft = create<PosDraft>((set) => ({
  cartItems: [],
  customerWhatsapp: '',
  customerName: '',
  customerNic: '',
  paymentMethod: 'cash',
  specialNotes: '',
  pendingExchanges: [],
  setCartItems: (u) => set((s) => ({ cartItems: apply(s.cartItems, u) })),
  setCustomerWhatsapp: (u) => set((s) => ({ customerWhatsapp: apply(s.customerWhatsapp, u) })),
  setCustomerName: (u) => set((s) => ({ customerName: apply(s.customerName, u) })),
  setCustomerNic: (u) => set((s) => ({ customerNic: apply(s.customerNic, u) })),
  setPaymentMethod: (u) => set((s) => ({ paymentMethod: apply(s.paymentMethod, u) })),
  setSpecialNotes: (u) => set((s) => ({ specialNotes: apply(s.specialNotes, u) })),
  setPendingExchanges: (u) => set((s) => ({ pendingExchanges: apply(s.pendingExchanges, u) })),
  resetDraft: () => set({
    cartItems: [], customerWhatsapp: '', customerName: '', customerNic: '',
    paymentMethod: 'cash', specialNotes: '', pendingExchanges: [],
  }),
}));
