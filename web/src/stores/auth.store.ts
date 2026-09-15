import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api-client';
import type { AuthTokens, LoginResponse, SessionUser } from '@/types/api';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: SessionUser | null;
  /** True until the persisted session has been rehydrated and revalidated. */
  isBootstrapping: boolean;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setTokens: (tokens: AuthTokens) => void;
  refreshUser: () => Promise<void>;
  bootstrap: () => Promise<void>;
  can: (...permissions: string[]) => boolean;
  canAny: (...permissions: string[]) => boolean;
}

/**
 * Session state only.
 *
 * Everything that comes from the server lives in TanStack Query; this store
 * holds just the credentials and the identity they belong to. Keeping the two
 * separate is what stops "is this stale?" questions from spreading through the
 * whole app.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isBootstrapping: true,

      async login(email, password) {
        const result = await api.post<LoginResponse>(
          '/auth/login',
          { email, password, platform: 'web', deviceName: navigator.userAgent.slice(0, 80) },
          { anonymous: true },
        );
        set({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: result.user,
          isBootstrapping: false,
        });
      },

      async logout() {
        const refreshToken = get().refreshToken;
        try {
          if (refreshToken) await api.post('/auth/logout', { refreshToken });
        } catch {
          // Signing out locally must succeed even if the server is unreachable.
        }
        set({ accessToken: null, refreshToken: null, user: null, isBootstrapping: false });
      },

      setTokens(tokens) {
        set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
      },

      async refreshUser() {
        const user = await api.get<SessionUser>('/auth/me');
        set({ user });
      },

      /**
       * Revalidates a persisted session on load: a token in localStorage proves
       * nothing, so we ask the server who we are before rendering the console.
       */
      async bootstrap() {
        if (!get().accessToken) {
          set({ isBootstrapping: false });
          return;
        }
        try {
          await get().refreshUser();
        } catch {
          set({ accessToken: null, refreshToken: null, user: null });
        } finally {
          set({ isBootstrapping: false });
        }
      },

      can(...permissions) {
        const held = get().user?.permissions ?? [];
        return permissions.every((p) => held.includes(p));
      },

      canAny(...permissions) {
        const held = get().user?.permissions ?? [];
        return permissions.some((p) => held.includes(p));
      },
    }),
    {
      name: 'cwork.session',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    },
  ),
);

// Wire the HTTP client to the store once, at module load.
api.configure({
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  onTokensRefreshed: (tokens) => useAuthStore.getState().setTokens(tokens),
  onSessionExpired: () => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  },
});
