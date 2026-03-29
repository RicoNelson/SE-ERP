import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const normalizeStorageBucket = (value: string | undefined): string => {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const bucketFromApiUrl = trimmed.match(/\/b\/([^/]+)\//i)?.[1];
  if (bucketFromApiUrl) return bucketFromApiUrl;
  return trimmed
    .replace(/^gs:\/\//i, '')
    .replace(/^https?:\/\/storage\.googleapis\.com\//i, '')
    .replace(/^https?:\/\/firebasestorage\.googleapis\.com\/v0\/b\//i, '')
    .replace(/\/o(?:\/.*)?$/i, '')
    .replace(/\/+$/g, '')
    .replace(/\/.*$/, '');
};

const normalizedStorageBucket = normalizeStorageBucket(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET);

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: normalizedStorageBucket || undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

if (recaptchaSiteKey && typeof window !== 'undefined') {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

// Set persistence to LOCAL (persists even when browser window is closed)
// By default, Firebase local persistence doesn't expire for a very long time,
// which easily covers the "stays for a month" requirement.
setPersistence(auth, browserLocalPersistence)
  .catch((error) => {
    console.error("Auth persistence error:", error);
  });

export const db = getFirestore(app);
export const storageBucket = normalizedStorageBucket;
export const storage = normalizedStorageBucket ? getStorage(app, `gs://${normalizedStorageBucket}`) : getStorage(app);
