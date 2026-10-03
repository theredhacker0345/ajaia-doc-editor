import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "./api";
import type { User, ProfileFields } from "./types";

interface AuthValue {
  user: User | null;
  ready: boolean;
  /** Sign in with an email; requires a solved ALTCHA proof-of-work payload. */
  login: (email: string, altcha: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Patch the signed-in user's name / profile fields server-side. */
  updateProfile: (fields: Partial<ProfileFields> & { name?: string }) => Promise<void>;
}

const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api<{ user: User }>("/api/me")
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email: string, altcha: string, name?: string) => {
    const d = await api<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, name, altcha }),
    });
    setUser(d.user);
  }, []);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (fields: Partial<ProfileFields> & { name?: string }) => {
    const d = await api<{ user: User }>("/api/me/profile", {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
    setUser(d.user);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, ready, login, logout, updateProfile }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
