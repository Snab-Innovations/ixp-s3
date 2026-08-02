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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (uid: string) => {
    try {
      const profileSnap = await getDoc(doc(db, 'profiles', uid));
      const userSnap = await getDoc(doc(db, 'users', uid));

      let merged: any = {};
      if (userSnap.exists()) {
        merged = { ...userSnap.data() };
      }
      if (profileSnap.exists()) {
        merged = { ...merged, ...profileSnap.data() };
      }

      if (merged.email || merged.name || merged.displayName || merged.phoneNumber) {
        setUserProfile({
          ...merged,
          name: merged.name || merged.displayName || 'Recruiter',
          phone: merged.phoneNumber || merged.phone || merged.contactNumber || '',
        } as UserProfile);
      }
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
          const resolvedName = combined.name || combined.displayName || currentUser.displayName || 'Recruiter';
          const resolvedPhone = combined.phoneNumber || combined.phone || combined.contactNumber || currentUser.phoneNumber || '';

          setUserProfile({
            ...combined,
            uid: currentUser.uid,
            email: currentUser.email || combined.email || '',
            name: resolvedName,
            phone: resolvedPhone,
            phoneNumber: resolvedPhone,
          } as UserProfile);
        };

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
          () => {}
        );
      } else {
        setUserProfile(null);
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
    await firebaseSignOut(auth);
    setUser(null);
    setUserProfile(null);
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