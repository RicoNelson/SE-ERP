import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { UserProfile } from '../types';

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userProfile: null,
  loading: true,
});

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && user.phoneNumber) {
        // 1. We will use the phoneNumber as the document ID to make it easy for owners to pre-register staff
        const userRef = doc(db, 'users', user.phoneNumber);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          // User is registered! Update their UID just in case
          const data = userSnap.data() as UserProfile;
          const updatedProfile = { ...data, uid: user.uid };
          await setDoc(userRef, updatedProfile, { merge: true });
          setUserProfile(updatedProfile);
          setCurrentUser(user);
        } else {
          // 2. Unauthorized user trying to log in
          alert('Nomor telepon ini belum terdaftar. Silakan hubungi Owner.');
          await signOut(auth);
          setCurrentUser(null);
          setUserProfile(null);
        }
      } else {
        setCurrentUser(null);
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, userProfile, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
