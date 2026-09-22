import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  role: string;
  permissions: Record<string, string[]>;
  firmIds: string[];
  branchIds: string[];
  avatarUrl?: string | null;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  tenantName: string;
  setTokens: (access: string, refresh: string | null, user: AuthUser) => void;
  setTenantName: (n: string) => void;
  logout: () => void;
  can: (subModule: string, action?: 'read' | 'create' | 'update' | 'delete') => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      tenantName: '',
      setTokens: (accessToken, refreshToken, user) => set({ accessToken, refreshToken: refreshToken ?? get().refreshToken, user }),
      setTenantName: (tenantName) => set({ tenantName }),
      logout: () => set({ accessToken: null, refreshToken: null, user: null }),
      can: (sub, action = 'read') => {
        const u = get().user;
        if (!u) return false;
        if (u.role === 'super_admin') return true;
        return (u.permissions?.[sub] ?? []).includes(action);
      },
    }),
    { name: 'diamondbill-auth' },
  ),
);
