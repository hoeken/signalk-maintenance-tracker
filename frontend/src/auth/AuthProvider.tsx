import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { notifications } from '@mantine/notifications';
import { setUnauthorizedHandler } from '../api/client';
import { LoginModal } from './LoginModal';

/**
 * Authentication against the SignalK server's own endpoints (§7.7). The
 * webapp is same-origin with the server, so the session cookie SignalK sets
 * at login rides along with every request automatically.
 */

const AUTH_BASE = '/signalk/v1/auth';
const LOGIN_STATUS_URL = '/skServer/loginStatus';
const USERNAME_KEY = 'maintenance-tracker.username';
const DEFAULT_REVALIDATE_MS = 10 * 60 * 1000;

export interface AuthContextValue {
  isLoggedIn: boolean;
  username: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  openLoginModal: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const revalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRevalidate = useCallback((timeToLiveSec?: number) => {
    if (revalidateTimer.current) clearTimeout(revalidateTimer.current);
    // re-validate before the token's timeToLive elapses (§7.7)
    const delay =
      timeToLiveSec && timeToLiveSec > 0
        ? Math.max(30_000, timeToLiveSec * 1000 * 0.8)
        : DEFAULT_REVALIDATE_MS;
    revalidateTimer.current = setTimeout(() => void validate(), delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markLoggedOut = useCallback(() => {
    setLoggedIn(false);
    setUsername(null);
    if (revalidateTimer.current) clearTimeout(revalidateTimer.current);
  }, []);

  const validate = useCallback(async () => {
    try {
      const res = await fetch(LOGIN_STATUS_URL, {
        method: 'GET',
        credentials: 'same-origin',
      });
      if (!res.ok) {
        markLoggedOut();
        return;
      }
      // loginStatus returns e.g. { status: "loggedIn", username, userLevel, ... }
      // or { status: "notLoggedIn", ... } (§7.7)
      const body = await res.json();
      if (body?.status === 'loggedIn') {
        setLoggedIn(true);
        setUsername(body.username ?? localStorage.getItem(USERNAME_KEY));
        scheduleRevalidate();
      } else {
        markLoggedOut();
      }
    } catch {
      markLoggedOut();
    }
  }, [markLoggedOut, scheduleRevalidate]);

  // initial state (§7.7)
  useEffect(() => {
    void validate();
    return () => {
      if (revalidateTimer.current) clearTimeout(revalidateTimer.current);
    };
  }, [validate]);

  // any API 401/403 → mark logged out + prompt re-login (§7.6)
  useEffect(() => {
    setUnauthorizedHandler(() => {
      markLoggedOut();
      notifications.show({
        color: 'yellow',
        title: 'Login required',
        message: 'Your session has expired or you lack permission. Please log in.',
      });
      setModalOpen(true);
    });
    return () => setUnauthorizedHandler(null);
  }, [markLoggedOut]);

  const login = useCallback(
    async (user: string, password: string) => {
      const res = await fetch(`${AUTH_BASE}/login`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password }),
      });
      if (!res.ok) throw new Error('Invalid username or password');
      let ttl: number | undefined;
      try {
        const body = await res.json();
        if (typeof body?.timeToLive === 'number') ttl = body.timeToLive;
      } catch {
        // no body — fine
      }
      localStorage.setItem(USERNAME_KEY, user);
      setUsername(user);
      setLoggedIn(true);
      scheduleRevalidate(ttl);
    },
    [scheduleRevalidate]
  );

  const logout = useCallback(async () => {
    try {
      await fetch(`${AUTH_BASE}/logout`, { method: 'PUT', credentials: 'same-origin' });
    } catch {
      // clear local state regardless of outcome (§7.7)
    }
    localStorage.removeItem(USERNAME_KEY);
    markLoggedOut();
  }, [markLoggedOut]);

  const openLoginModal = useCallback(() => setModalOpen(true), []);

  return (
    <AuthContext.Provider value={{ isLoggedIn, username, login, logout, openLoginModal }}>
      {children}
      <LoginModal opened={modalOpen} onClose={() => setModalOpen(false)} onLogin={login} />
    </AuthContext.Provider>
  );
}
