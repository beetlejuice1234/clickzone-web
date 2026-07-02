import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Owner store-switcher scope. `activeStoreId === null` = "All Stores".
 * Persisted so the owner's choice survives reloads. Staff never set this (no switcher);
 * AuthContext clears it on a non-owner session so a stale owner choice can't leak.
 */
interface StoreScope {
  activeStoreId: string | null;
  setActiveStore: (id: string | null) => void;
}

export const useStoreScope = create<StoreScope>()(
  persist(
    (set) => ({
      activeStoreId: null,
      setActiveStore: (id) => set({ activeStoreId: id }),
    }),
    { name: 'cz-store-scope' },
  ),
);
