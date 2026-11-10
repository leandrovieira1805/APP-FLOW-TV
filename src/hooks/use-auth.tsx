import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { signIn, signUp, signOut, getCurrentUser, type User, loadTokensFromStorage } from "../lib/auth";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string, username?: string) => Promise<any>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      loadTokensFromStorage();
      const currentUser = getCurrentUser();
      setUser(currentUser);
      setLoading(false);
    };
    initialize();

    // Listen for auto-sync login events to reload user
    const onSync = () => {
      loadTokensFromStorage();
      setUser(getCurrentUser());
    };
    window.addEventListener('auth-sync', onSync);
    return () => window.removeEventListener('auth-sync', onSync);
  }, []);

  const handleSignIn = async (email: string, password: string) => {
    const data = await signIn(email, password);
    setUser(data.user);
    return data;
  };

  const handleSignUp = async (email: string, password: string, username?: string) => {
    const data = await signUp(email, password, username);
    setUser(data.user);
    return data;
  };

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
  };

  const value = {
    user,
    loading,
    signIn: handleSignIn,
    signUp: handleSignUp,
    signOut: handleSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
