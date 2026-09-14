import { createContext } from 'react';
type AccountSyncState = 'idle' | 'syncing' | 'synced' | 'unavailable';

type AccountSyncContextValue = {
  state: AccountSyncState;
  message: string;
  lastSyncedAt: number | null;
  syncNow: () => Promise<void>;
};


export const AccountSyncContext = createContext<AccountSyncContextValue | null>(null);
