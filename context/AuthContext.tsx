import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

const CACHED_PROFILE_KEY = 'ixp_user_profile';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => auth.currentUser);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    try {
      const cached = localStorage.getItem(CACHED_PROFILE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (e) {
      console.warn("Failed to parse cached profile", e);
    }
    return null;
  });
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (uid: string) => {
    try {
      const [profileSnap, userSnap] = await Promise.all([
        getDoc(doc(db, 'profiles', uid)).catch(() => null),
        getDoc(doc(db, 'users', uid)).catch(() => null),
      ]);

      let merged: any = {};
      if (userSnap && userSnap.exists()) {
        merged = { ...userSnap.data() };
      }
      if (profileSnap && profileSnap.exists()) {
        merged = { ...merged, ...profileSnap.data() };
      }

      const currentUser = auth.currentUser;
      const resolvedRole = merged.role || (currentUser?.email === 'admin@dsauce.io' || currentUser?.email?.includes('admin') ? 'admin' : 'recruiter');
      const resolvedName = merged.name || merged.displayName || currentUser?.displayName || 'Recruiter';
      const resolvedPhone = merged.phoneNumber || merged.phone || merged.contactNumber || currentUser?.phoneNumber || '';

      const updatedProfile: UserProfile = {
        ...merged,
        uid,
        email: currentUser?.email || merged.email || '',
        name: resolvedName,
        phone: resolvedPhone,
        phoneNumber: resolvedPhone,
        role: resolvedRole,
      } as UserProfile;

      setUserProfile(updatedProfile);
      try {
        localStorage.setItem(CACHED_PROFILE_KEY, JSON.stringify(updatedProfile));
      } catch (e) {}
    } catch (err) {
      console.error("Error fetching profile:", err);
    }
  };

  useEffect(() => {
    let unSubProfile: (() => void) | null = null;
    let unSubUser: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (unSubProfile) { unSubProfile(); unSubProfile = null; }
      if (unSubUser) { unSubUser(); unSubUser = null; }

      setUser(currentUser);
      if (currentUser) {
        let profileData: any = {};
        let userData: any = {};

        const updateCombined = () => {
          const combined = { ...userData, ...profileData };
          let cachedRole: string | undefined;
          try {
            const cached = localStorage.getItem(CACHED_PROFILE_KEY);
            if (cached) cachedRole = JSON.parse(cached)?.role;
          } catch (e) {}

          const resolvedRole = combined.role || cachedRole || (currentUser.email === 'admin@dsauce.io' || currentUser.email?.includes('admin') ? 'admin' : 'recruiter');
          const resolvedName = combined.name || combined.displayName || currentUser.displayName || 'Recruiter';
          const resolvedPhone = combined.phoneNumber || combined.phone || combined.contactNumber || currentUser.phoneNumber || '';

          const updated: UserProfile = {
            ...combined,
            uid: currentUser.uid,
            email: currentUser.email || combined.email || '',
            name: resolvedName,
            phone: resolvedPhone,
            phoneNumber: resolvedPhone,
            role: resolvedRole,
          } as UserProfile;

          setUserProfile(updated);
          try {
            localStorage.setItem(CACHED_PROFILE_KEY, JSON.stringify(updated));
          } catch (e) {}
        };

        // Immediately populate fallback userProfile from user object so routes don't block
        updateCombined();

        unSubProfile = onSnapshot(
          doc(db, 'profiles', currentUser.uid),
          (docSnap) => {
            if (docSnap.exists()) profileData = docSnap.data();
            updateCombined();
            setLoading(false);
          },
          async () => {
            await fetchProfile(currentUser.uid);
            setLoading(false);
          }
        );

        unSubUser = onSnapshot(
          doc(db, 'users', currentUser.uid),
          (docSnap) => {
            if (docSnap.exists()) userData = docSnap.data();
            updateCombined();
            setLoading(false);
          },
          () => {
            setLoading(false);
          }
        );
      } else {
        setUserProfile(null);
        try {
          localStorage.removeItem(CACHED_PROFILE_KEY);
        } catch (e) {}
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (unSubProfile) unSubProfile();
      if (unSubUser) unSubUser();
    };
  }, []);

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (e) {
      console.error("Firebase sign out failed:", e);
    } finally {
      setUser(null);
      setUserProfile(null);
      try {
        localStorage.removeItem(CACHED_PROFILE_KEY);
      } catch (e) {}
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.uid);
  };

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};