import { useEffect, useRef } from 'react';
import { collection, getDocs, limit, onSnapshot, orderBy, query, where, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { UserProfile } from '../types';
import { formatNumber } from '../utils/format';

const OWNER_NOTIFICATION_PERMISSION_KEY = 'owner-sale-notification-permission-requested';

const toMillis = (value: unknown) => {
  if (!value || typeof value !== 'object') return 0;
  const maybeTimestamp = value as { toMillis?: () => number };
  if (typeof maybeTimestamp.toMillis === 'function') {
    return maybeTimestamp.toMillis();
  }
  return 0;
};

interface SaleData {
  total?: number;
  paymentMethod?: string;
  soldBy?: string;
  soldAt?: unknown;
}

export function useOwnerSaleNotifications(currentUserUid?: string, userProfile?: UserProfile | null) {
  const staffNameCacheRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (userProfile?.role !== 'owner') return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    const alreadyRequested = localStorage.getItem(OWNER_NOTIFICATION_PERMISSION_KEY) === 'true';

    if (Notification.permission === 'default' && !alreadyRequested) {
      localStorage.setItem(OWNER_NOTIFICATION_PERMISSION_KEY, 'true');
      void Notification.requestPermission();
    }
  }, [userProfile?.role]);

  useEffect(() => {
    if (userProfile?.role !== 'owner' || !currentUserUid) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    let initialized = false;
    let newestKnownMillis = Date.now();

    const salesQuery = query(
      collection(db, 'sales'),
      orderBy('soldAt', 'desc'),
      limit(25)
    );

    const getStaffName = async (uid: string) => {
      if (staffNameCacheRef.current[uid]) {
        return staffNameCacheRef.current[uid];
      }

      const usersByUidQuery = query(
        collection(db, 'users'),
        where('uid', '==', uid),
        limit(1)
      );

      const snap = await getDocs(usersByUidQuery);
      if (snap.empty) return 'Staf';

      const profile = snap.docs[0].data() as UserProfile;
      const displayName = profile.name?.trim() || 'Staf';
      staffNameCacheRef.current[uid] = displayName;
      return displayName;
    };

    const showNotification = async (
      saleDoc: QueryDocumentSnapshot<DocumentData>,
      saleData: SaleData,
      staffName: string
    ) => {
      if (Notification.permission !== 'granted') return;

      const title = 'Penjualan Baru';
      const body = `${staffName} mencatat penjualan Rp ${formatNumber(saleData.total || 0)} (${saleData.paymentMethod || 'Metode tidak diketahui'})`;

      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration) {
        await registration.showNotification(title, {
          body,
          tag: `sale-${saleDoc.id}`,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
        });
        return;
      }

      const notification = new Notification(title, {
        body,
        tag: `sale-${saleDoc.id}`,
        icon: '/pwa-192x192.png',
      });

      notification.onclick = () => {
        window.focus();
      };
    };

    const unsubscribe = onSnapshot(salesQuery, async (snapshot) => {
      if (!initialized) {
        const latestSnapshotMillis = snapshot.docs.reduce((latest, docSnap) => {
          const data = docSnap.data() as SaleData;
          const soldAtMillis = toMillis(data.soldAt);
          return Math.max(latest, soldAtMillis);
        }, newestKnownMillis);

        newestKnownMillis = latestSnapshotMillis;
        initialized = true;
        return;
      }

      for (const change of snapshot.docChanges()) {
        if (change.type !== 'added') continue;

        const saleData = change.doc.data() as SaleData;
        if (!saleData.soldBy || saleData.soldBy === currentUserUid) continue;

        const soldAtMillis = toMillis(saleData.soldAt);
        if (soldAtMillis <= newestKnownMillis) continue;

        newestKnownMillis = Math.max(newestKnownMillis, soldAtMillis);

        try {
          const staffName = await getStaffName(saleData.soldBy);
          await showNotification(change.doc, saleData, staffName);
        } catch (error) {
          console.error('Failed to show owner sale notification:', error);
        }
      }
    });

    return () => unsubscribe();
  }, [currentUserUid, userProfile?.role]);
}
