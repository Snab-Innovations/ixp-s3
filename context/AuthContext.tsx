import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserProfile } from '../types';
import {
  clearCognitoSession,
  loadStoredCognitoSession,
  refreshCognitoSession,
  signOutAll,
} from '../services/authService';
import { ApiError, rds, poll } from '../services/rdsApi';

/** Lightweight user shape replacing Firebase Auth User for Cognito + RDS. */
export type AuthUser = {
  uid: string;
  email: string | null;
  displayName?: string | null;
  phoneNumber?: string | null;
};

interface AuthContextType {
  user: AuthUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setSessionUser: (user: AuthUser | null, profile?: UserProfile | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
  setSessionUser: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const setSessionUser = (nextUser: AuthUser | null, profile?: UserProfile | null) => {
    setUser(nextUser);
    if (profile !== undefined) setUserProfile(profile);
  };

  const clearLocalSession = () => {
    clearCognitoSession();
    setUser(null);
    setUserProfile(null);
  };

  const refreshProfile = async () => {
    try {
      const { user: profile } = await rds.me();
      setUserProfile(profile as UserProfile);
      setUser({
        uid: profile.uid || profile.id,
        email: profile.email || null,
        displayName: profile.name || profile.displayName || profile.fullname || null,
        phoneNumber: profile.phone || profile.phoneNumber || null,
      });
    } catch (err) {
      console.error('Error refreshing profile from RDS:', err);
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        clearLocalSession();
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    let stopPoll: (() => void) | null = null;
    let refreshTimer: number | undefined;

    const scheduleTokenRefresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      const stored = loadStoredCognitoSession();
      if (!stored?.refreshToken) return;
      const expiresAt = stored.expiresAt || Date.now() + 50 * 60 * 1000;
      const delay = Math.max(30_000, expiresAt - Date.now() - 60_000);
      refreshTimer = window.setTimeout(async () => {
        const ok = await refreshCognitoSession();
        if (!ok) {
          if (!cancelled) clearLocalSession();
          return;
        }
        if (!cancelled) scheduleTokenRefresh();
      }, delay);
    };

    const bootstrap = async () => {
      const stored = loadStoredCognitoSession();
      if (!stored?.idToken) {
        if (!cancelled) {
          setUser(null);
          setUserProfile(null);
          setLoading(false);
        }
        return;
      }

      if (stored.expiresAt && stored.expiresAt < Date.now() + 60_000) {
        const refreshed = await refreshCognitoSession();
        if (!refreshed) {
          if (!cancelled) {
            clearLocalSession();
            setLoading(false);
          }
          return;
        }
      }

      try {
        const { user: profile } = await rds.me();
        if (cancelled) return;
        setUser({
          uid: profile.uid || profile.id,
          email: profile.email || null,
          displayName: profile.name || profile.displayName || profile.fullname || null,
          phoneNumber: profile.phone || null,
        });
        setUserProfile(profile as UserProfile);
        scheduleTokenRefresh();

        stopPoll = poll(
          () => rds.me(),
          ({ user: next }) => {
            setUserProfile(next as UserProfile);
          },
          (err) => {
            if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
              if (stopPoll) {
                stopPoll();
                stopPoll = null;
              }
              if (!cancelled) clearLocalSession();
            }
          },
          15000
        );
      } catch (err) {
        console.warn('Session restore failed:', err);
        if (!cancelled) clearLocalSession();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
      if (stopPoll) stopPoll();
      if (refreshTimer) window.clearTimeout(refreshTimer);
    };
  }, []);

  const signOut = async () => {
    await signOutAll();
    clearCognitoSession();
    setUser(null);
    setUserProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, userProfile, loading, signOut, refreshProfile, setSessionUser }}
    >
      {children}
    </AuthContext.Provider>
  );
};
